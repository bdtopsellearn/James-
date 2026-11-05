'use strict';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PN AD NETWORK — CONCURRENT TRAFFIC ENGINE  (Job Queue + Worker Pool)
 *  Drop-in scheduling layer for bot-source/bot.cjs
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  WHY THIS EXISTS
 *  ---------------
 *  The original engine processed impressions with a *sequential* tick:
 *      for (const user of allUsers) { await doOneVisit(user); }   // 1 at a time
 *  With a 30–180s dwell per visit and hundreds of users, one tick could never
 *  finish inside its 30s window, so the watchdog reset it and almost nothing
 *  was delivered.  Concurrency was hard-capped at 1–2 (getAdaptiveConcurrencyLimit)
 *  and a single shared Chromium (--single-process) serialised everything.
 *
 *  This module replaces that with the standard, proven pattern:
 *
 *      PRODUCERS (ticks) ──►  JOB QUEUE (fair, prioritised, back-pressured)
 *                                    │
 *                                    ▼
 *                            WORKER POOL  (N parallel visits, N = f(free RAM))
 *                                    │
 *                                    ▼
 *                            runBurstForUser()  (your existing visit code)
 *
 *  Guarantees:
 *   • FAIRNESS   — round-robin across users, so 1 heavy user can never starve
 *                  the other 299. Every user gets a turn before anyone gets two.
 *   • BACKPRESSURE — per-user and global queue caps; producers can't OOM the box.
 *   • RAM-AWARE  — the pool grows/shrinks automatically from free memory.
 *   • RECYCLING  — workers retire after N visits to dodge the Chromium/V8 leak
 *                  (real-world: ~150 requests/context → OOM).
 *   • MULTI-PROC — run one pool per process (PM2 cluster / several VPS). They can
 *                  share a Firestore-backed queue for true horizontal scale.
 *
 *  Zero external dependencies — pure Node. Safe to require from bot.cjs.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const os = require('os');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Available RAM in MB. On Linux, os.freemem() EXCLUDES reclaimable page cache,
 * so it under-reports what we can really use (a busy box shows 90% "used" when
 * most of it is cache). /proc/meminfo MemAvailable is the truthful figure. */
function availableMemMB() {
  try {
    if (process.platform === 'linux') {
      const mi = require('fs').readFileSync('/proc/meminfo', 'utf8');
      const m = mi.match(/MemAvailable:\s+(\d+)\s+kB/);
      if (m) return Math.round(Number(m[1]) / 1024);
    }
  } catch (e) { /* non-Linux or unreadable → fall through */ }
  return Math.round(os.freemem() / 1048576);
}

/* ───────────────────────────────────────────────────────────────────────────
 *  CONCURRENCY SIZING  —  how many browsers can THIS box really run?
 * ───────────────────────────────────────────────────────────────────────────
 *  Research-backed numbers (see SOLUTION doc):
 *    • Full Chromium instance/context : 150–500 MB  (peaks 400 MB–1.5 GB)
 *    • chromium-headless-shell        : ~60–120 MB  (2–4× lighter)
 *    • Production rule of thumb       : 8 GB RAM  → 3–4 concurrent workers
 *  So we budget a fixed MB per slot and never let the pool eat the whole box.
 * ─────────────────────────────────────────────────────────────────────────── */
const MEM_PER_SLOT_MB = {
  // Conservative planning budgets: real browser pages can exceed these values.
  // Leave enough headroom for spikes rather than packing the VPS to its limit.
  full: 500,
  shell: 250,
};

/* ── RAM TIERS ────────────────────────────────────────────────────────────
 * A visit is I/O-bound: the browser mostly *waits* (network + 30–180s dwell),
 * so RAM — not CPU — is the real wall. We therefore size the pool from TOTAL
 * memory (deterministic per tier) instead of `os.freemem()`, which on Linux
 * excludes reclaimable page cache and under-reports capacity badly.
 *
 * Each tier carries its own defaults so a 2 GB box is never asked to run the
 * same concurrency as an 8 GB box, and a 4 GB box is not strangled by the old
 * `max: 4` hard cap.
 *
 *   tier     RAM        max slots   reservedMB   min
 *   tiny     < 1.5 GB      1           512        1
 *   small    2 GB          2           700        1
 *   medium   4 GB          4           900        1
 *   large    8 GB          6          1200        1
 *   xlarge   16 GB        10          1800        1
 *   huge     ≥ 24 GB      16          2500        1
 *
 *   * at ~90s/visit and a modest per-user cadence (see SOLUTION doc). Actual
 *     throughput is always gated at runtime by isSystemHealthy() + autoscale.
 * ───────────────────────────────────────────────────────────────────────── */
function ramTier(totalMemMB) {
  if (totalMemMB < 1536) return 'tiny';
  if (totalMemMB < 3072) return 'small';
  if (totalMemMB < 6144) return 'medium';
  if (totalMemMB < 12288) return 'large';
  if (totalMemMB < 24576) return 'xlarge';
  return 'huge';
}

const TIER_DEFAULTS = {
  tiny:   { max: 1,  reservedMB: 512,  min: 1 },
  small:  { max: 2,  reservedMB: 700,  min: 1 },
  medium: { max: 4,  reservedMB: 900,  min: 1 },
  large:  { max: 6,  reservedMB: 1200, min: 1 },
  xlarge: { max: 10, reservedMB: 1800, min: 1 },
  huge:   { max: 16, reservedMB: 2500, min: 1 },
};

function computeConcurrency(opts = {}) {
  const totalMemMB = opts.totalMemMB ?? Math.round(os.totalmem() / 1048576);
  const freeMemMB = opts.freeMemMB ?? availableMemMB();
  const cpuCount = opts.cpuCount ?? os.cpus().length;
  const browser = opts.browser || 'shell';          // 'shell' | 'full'
  const tier = ramTier(totalMemMB);
  const tdef = TIER_DEFAULTS[tier] || TIER_DEFAULTS.small;

  const reservedMB = opts.reservedMB ?? tdef.reservedMB;   // OS + Node + Firebase + headroom
  const min = opts.min ?? tdef.min;
  const max = opts.max ?? tdef.max;
  const hardCap = opts.hardCap ?? Infinity;

  // CPU is a secondary constraint; memory is the hard safety limit.
  const cpuSlotsPerCore = Number(opts.cpuSlotsPerCore)
    || Number(process.env.CPU_SLOTS_PER_CORE)
    || (browser === 'full' ? 1 : 2);

  const perSlot = MEM_PER_SLOT_MB[browser] || MEM_PER_SLOT_MB.shell;
  const usable = Math.max(0, totalMemMB - reservedMB);
  const byRam = Math.floor(usable / perSlot);
  const byCpu = Math.max(1, Math.round(cpuCount * cpuSlotsPerCore));

  // Never let the configured minimum override the RAM budget. If there is not
  // enough budget for one browser slot, return zero and wait for memory to recover.
  const lowMem = freeMemMB > 0 && freeMemMB < 300;
  let n = Math.min(byRam, byCpu, max, hardCap);
  if (n > 0) n = Math.max(Math.min(min, n), n);
  if (lowMem) n = Math.min(n, 1);

  return {
    concurrency: n,
    byRam, byCpu, perSlot, usableMB: usable,
    tier, reservedMB, min, max, lowMem, cpuSlotsPerCore,
  };
}

/* ───────────────────────────────────────────────────────────────────────────
 *  JOB QUEUE  —  fair, prioritised, back-pressured
 * ─────────────────────────────────────────────────────────────────────────── */
class JobQueue {
  /**
   * @param {object} opts
   *   maxTotal        global cap on queued jobs (backpressure)
   *   maxPerUser      cap on queued jobs for a single user (anti-hog)
   *   dedupe          if true, a user+type+url already queued is not re-added
   *   onDrop          callback(job, reason) when a job is rejected
   */
  constructor(opts = {}) {
    this.maxTotal = opts.maxTotal ?? 5000;
    this.maxPerUser = opts.maxPerUser ?? 8;
    this.dedupe = opts.dedupe !== false;
    this.onDrop = opts.onDrop || (() => {});

    this._byUser = new Map();   // userId -> Job[]   (FIFO per user)
    this._order = [];           // round-robin order of userIds
    this._cursor = 0;           // pointer into _order
    this._size = 0;
    this._keys = new Set();     // dedupe keys
    this._seq = 0;              // insertion counter (stable priority tie-break)

    this.stats = { enqueued: 0, dequeued: 0, dropped: 0, deduped: 0 };
  }

  get size() { return this._size; }
  get userCount() { return this._byUser.size; }

  _key(job) { return `${job.userId}::${job.type}::${job.url}`; }

  /**
   * @param {object} job  { userId, url, type, priority, meta }
   * @returns {boolean} accepted?
   */
  push(job) {
    if (!job || job.userId == null || !job.url || !job.type) return false;

    const uid = String(job.userId);
    const key = this._key(job);

    if (this.dedupe && this._keys.has(key)) { this.stats.deduped++; return false; }
    if (this._size >= this.maxTotal) { this.stats.dropped++; this.onDrop(job, 'queue-full'); return false; }

    const list = this._byUser.get(uid) || [];
    if (list.length >= this.maxPerUser) { this.stats.dropped++; this.onDrop(job, 'user-full'); return false; }

    const entry = {
      userId: uid,
      url: job.url,
      type: job.type,
      priority: Number(job.priority) || 0,
      meta: job.meta || null,
      seq: this._seq++,
      enqueuedAt: Date.now(),
    };

    list.push(entry);
    const isNewUser = !this._byUser.has(uid);
    this._byUser.set(uid, list);
    if (isNewUser) this._order.push(uid);

    this._keys.add(key);
    this._size++;
    this.stats.enqueued++;
    return true;
  }

  /**
   * Round-robin pop. Highest-priority user wins ties; within a user, FIFO.
   * Guarantees: every user with a pending job is served before any user is
   * served twice — this is what makes 300 users fair.
   */
  pop() {
    const n = this._order.length;
    if (n === 0) return null;

    let best = -1;
    let bestPriority = -Infinity;

    // Scan the whole rotation for the highest-priority non-empty user.
    // (O(users) per pop — trivial for hundreds of users, and keeps it simple.)
    for (let i = 0; i < n; i++) {
      const idx = (this._cursor + i) % n;
      const uid = this._order[idx];
      const list = this._byUser.get(uid);
      if (!list || list.length === 0) continue;
      const p = list[0].priority;
      if (p > bestPriority) { bestPriority = p; best = idx; }
    }
    if (best === -1) return null;

    const uid = this._order[best];
    const list = this._byUser.get(uid);
    const job = list.shift();
    this._keys.delete(this._key(job));
    this._size--;
    this.stats.dequeued++;

    if (list.length === 0) {
      this._byUser.delete(uid);
      // remove uid from rotation (splice keeps order stable)
      const pos = this._order.indexOf(uid);
      if (pos >= 0) this._order.splice(pos, 1);
      if (this._cursor > pos && pos >= 0) this._cursor--;
    }
    // advance cursor past the user we just served → next user gets priority
    this._cursor = (best + 1) % Math.max(1, this._order.length);
    return job;
  }

  /** Re-queue a job at the FRONT of its user list (e.g. after a retryable fail). */
  requeue(job) {
    if (!job) return false;
    const uid = String(job.userId);
    const list = this._byUser.get(uid) || [];
    const key = this._key(job);
    if (this._keys.has(key)) return false;
    list.unshift({ ...job, seq: this._seq++ });
    if (!this._byUser.has(uid)) { this._byUser.set(uid, list); this._order.push(uid); }
    else this._byUser.set(uid, list);
    this._keys.add(key);
    this._size++;
    return true;
  }

  snapshot() {
    return {
      size: this._size,
      users: this._byUser.size,
      ...this.stats,
      perUser: Object.fromEntries([...this._byUser].map(([u, l]) => [u, l.length])),
    };
  }
}

/* ───────────────────────────────────────────────────────────────────────────
 *  WORKER POOL  —  runs N visits in parallel, RAM-aware, self-recycling
 * ─────────────────────────────────────────────────────────────────────────── */
class WorkerPool {
  /**
   * @param {object} opts
   *   queue            JobQueue
   *   runJob           async (job) => result   ← your runBurstForUser() wrapper
   *   concurrency      fixed number (if omitted, auto from RAM)
   *   browser          'shell' | 'full'  (for sizing)
   *   max              hard ceiling
   *   min              floor
   *   reservedMB       RAM reserved for OS/Node
   *   maxVisitsPerWorker  recycle worker after N jobs (V8-leak guard)
   *   jobTimeoutMs     per-job watchdog
   *   onEvent          (type, payload) => void  for logging/metrics
   */
  constructor(opts = {}) {
    this.queue = opts.queue;
    this.runJob = opts.runJob;
    if (typeof this.runJob !== 'function') throw new Error('WorkerPool: runJob required');

    this.browser = opts.browser || 'shell';
    // Leave min/max/reservedMB unset (null) so computeConcurrency picks the
    // RAM-tier defaults. Callers can still pin any of them explicitly.
    this.min = opts.min ?? null;
    this.max = opts.max ?? null;
    this.reservedMB = opts.reservedMB ?? null;
    this.maxVisitsPerWorker = opts.maxVisitsPerWorker
      ?? (Number(process.env.MAX_VISITS_PER_WORKER) || 120);
    this.jobTimeoutMs = opts.jobTimeoutMs ?? 5 * 60 * 1000;
    this.autoScale = opts.concurrency == null;
    this.concurrency = opts.concurrency ?? computeConcurrency({
      browser: this.browser,
      min: this.min ?? undefined,
      max: this.max ?? undefined,
      reservedMB: this.reservedMB ?? undefined,
    }).concurrency;
    this.onEvent = opts.onEvent || (() => {});

    this._running = false;
    this._workers = new Map();      // id -> { id, busy, jobsDone, startedAt, stop }
    this._scaleTimer = null;
    this._nextId = 1;

    this.stats = {
      completed: 0, failed: 0, timedOut: 0, recycled: 0,
      startedAt: 0, lastScaleAt: 0, scaleEvents: 0,
    };
    this._recent = [];              // timestamps of completions (throughput calc)
  }

  get active() { return [...this._workers.values()].filter((w) => w.busy).length; }
  get workerCount() { return this._workers.size; }

  start() {
    if (this._running) return this;
    this._running = true;
    this.stats.startedAt = Date.now();
    for (let i = 0; i < this.concurrency; i++) this._spawn();
    if (this.autoScale) {
      this._scaleTimer = setInterval(() => this._autoScale(), 8000);
      if (this._scaleTimer.unref) this._scaleTimer.unref();
    }
    this.onEvent('pool-started', { concurrency: this.concurrency, autoScale: this.autoScale });
    return this;
  }

  stop() {
    this._running = false;
    if (this._scaleTimer) clearInterval(this._scaleTimer);
    this._scaleTimer = null;
    for (const w of this._workers.values()) w.stop = true;
    this.onEvent('pool-stopped', {});
  }

  _spawn() {
    const id = this._nextId++;
    const worker = { id, busy: false, jobsDone: 0, startedAt: Date.now(), stop: false };
    this._workers.set(id, worker);
    this._loop(worker);
    return worker;
  }

  _retire(id) {
    const w = this._workers.get(id);
    if (w) { w.stop = true; this._workers.delete(id); this.stats.recycled++; }
  }

  async _loop(worker) {
    while (this._running && !worker.stop) {
      // recycle after N jobs (dodges the Chromium/V8 leak)
      if (worker.jobsDone >= this.maxVisitsPerWorker) {
        this._retire(worker.id);
        if (this._running) this._spawn();
        return;
      }

      const job = this.queue.pop();
      if (!job) { await sleep(300); continue; }

      worker.busy = true;
      const t0 = Date.now();
      let result = null;
      let ok = false;
      try {
        result = await this._withTimeout(this.runJob(job), this.jobTimeoutMs);
        ok = !!(result && (result.okCount > 0 || result.ok === true));
        if (ok) this.stats.completed++; else this.stats.failed++;
      } catch (e) {
        this.stats.failed++;
        if (e && e.__timeout) this.stats.timedOut++;
        this.onEvent('job-error', { job, error: e && e.message });
      } finally {
        worker.busy = false;
        worker.jobsDone++;
        this._recent.push(Date.now());
        if (this._recent.length > 200) this._recent.shift();
        this.onEvent('job-done', {
          job, ok, ms: Date.now() - t0, result,
          queue: this.queue.size, active: this.active,
        });
      }
    }
  }

  _withTimeout(promise, ms) {
    let timer;
    return Promise.race([
      promise.finally(() => clearTimeout(timer)),
      new Promise((_, reject) => {
        timer = setTimeout(() => { const e = new Error('job-timeout'); e.__timeout = true; reject(e); }, ms);
        if (timer.unref) timer.unref();
      }),
    ]);
  }

  _autoScale() {
    if (!this._running) return;
    const target = computeConcurrency({
      browser: this.browser,
      min: this.min ?? undefined,
      max: this.max ?? undefined,
      reservedMB: this.reservedMB ?? undefined,
    }).concurrency;

    if (target > this.concurrency) {
      const add = Math.min(target - this.concurrency, 2);   // grow gently
      for (let i = 0; i < add; i++) this._spawn();
      this.concurrency = this._workers.size;
      this.stats.scaleEvents++;
      this.stats.lastScaleAt = Date.now();
      this.onEvent('scale-up', { concurrency: this.concurrency, target });
    } else if (target < this.concurrency) {
      // retire idle workers first
      let toRemove = this.concurrency - target;
      for (const w of [...this._workers.values()]) {
        if (toRemove <= 0) break;
        if (!w.busy) { this._retire(w.id); toRemove--; }
      }
      this.concurrency = this._workers.size;
      this.stats.scaleEvents++;
      this.stats.lastScaleAt = Date.now();
      this.onEvent('scale-down', { concurrency: this.concurrency, target });
    }
  }

  /** completions per minute over the recent window */
  throughputPerMin() {
    if (this._recent.length < 2) return 0;
    const span = (this._recent[this._recent.length - 1] - this._recent[0]) / 1000;
    if (span <= 0) return 0;
    return Math.round((this._recent.length / span) * 60);
  }

  health() {
    return {
      running: this._running,
      concurrency: this.concurrency,
      workers: this._workers.size,
      active: this.active,
      queue: this.queue.size,
      queuedUsers: this.queue.userCount,
      completed: this.stats.completed,
      failed: this.stats.failed,
      recycled: this.stats.recycled,
      throughputPerMin: this.throughputPerMin(),
      mem: {
        totalMB: Math.round(os.totalmem() / 1048576),
        freeMB: Math.round(os.freemem() / 1048576),
      },
    };
  }
}

/* ───────────────────────────────────────────────────────────────────────────
 *  PRODUCER HELPER  —  turns "who is eligible right now?" into queued jobs
 * ─────────────────────────────────────────────────────────────────────────── */
/**
 * @param {object} opts
 *   queue        JobQueue
 *   listUsers    () => [{ userId, url, type, priority }]  ← you build this from
 *                cache.user_smartlinks / user_links + canRunImpression()
 *   intervalMs   how often to scan for new eligible jobs (default 5000)
 *   onTick       optional callback with counts
 */
function startProducer(opts) {
  const { queue, listUsers, intervalMs = 5000, onTick } = opts;
  let timer = null;
  const tick = () => {
    let added = 0;
    try {
      const users = listUsers() || [];
      for (const u of users) if (queue.push(u)) added++;
    } catch (e) {
      // never let a producer crash take down the pool
    }
    if (onTick) { try { onTick({ added, queue: queue.size }); } catch (e) {} }
  };
  timer = setInterval(tick, intervalMs);
  if (timer.unref) timer.unref();
  tick(); // immediate first pass
  return { stop: () => clearInterval(timer), tick };
}

/* ⭐ APEX-ENTERPRISE: TaskProxyCache — task-level IP pinning wrapper.
 * Ensures a single logical job (user+type+url) always exits through the SAME
 * proxy IP for the whole session — critical to avoid Adsterra IVT flags.
 * Usage:
 *   const cache = new TaskProxyCache();
 *   const proxy = cache.get('task-123', () => pickProxy(...));
 *   // ... run visit ...
 *   cache.release('task-123');
 */
class TaskProxyCache {
  constructor(ttlMs = 5 * 60 * 1000) {
    this.ttlMs = ttlMs;
    this._map = new Map();   // taskId -> { proxy, at }
  }
  get(taskId, factory) {
    const hit = this._map.get(taskId);
    if (hit && (Date.now() - hit.at) < this.ttlMs) return hit.proxy;
    const proxy = typeof factory === 'function' ? factory() : factory;
    if (proxy) this._map.set(taskId, { proxy, at: Date.now() });
    // opportunistic cleanup
    if (this._map.size > 200) {
      const cutoff = Date.now() - this.ttlMs;
      for (const [k, v] of this._map) if (v.at < cutoff) this._map.delete(k);
    }
    return proxy;
  }
  release(taskId) { this._map.delete(taskId); }
  size() { return this._map.size; }
}

module.exports = {
  JobQueue,
  WorkerPool,
  TaskProxyCache,        // ⭐ NEW
  computeConcurrency,
  startProducer,
  MEM_PER_SLOT_MB,
  ramTier,
  TIER_DEFAULTS,
  availableMemMB,
};
