/**
 * ══════════════════════════════════════════════════════════════════════════════
 *   ⚡ PN AD NETWORK ⚡  |  ALIF_H4CK ⚡  |  BOT EMBEDDED DATABASE
 * ══════════════════════════════════════════════════════════════════════════════
 *   services/botDatabase.cjs
 *
 *   A dependency-free, embedded, atomic, journaled key/value store used by the
 *   traffic bot to keep HIGH-FREQUENCY / LOW-IMPORTANCE telemetry OFF Firebase
 *   (saving Firestore quota + cost) while CRITICAL data stays in Firestore.
 *
 *   Design goals
 *   ------------
 *   • Zero external dependencies (no sqlite / lowdb / nedb).
 *   • Crash-safe: every write is atomic (temp file → fsync → rename).
 *   • Journaled: an append-only write-ahead log lets us recover the last few
 *     writes after a hard crash and compact itself automatically.
 *   • Fast: all reads are served from memory; writes are debounced + batched.
 *   • Observable: exposes rich `stats()` for the admin panel.
 *
 *   Storage layout (default ./data/bot-db)
 *   --------------------------------------
 *     meta.json              store metadata (version, created_at, …)
 *     journal.log            append-only write-ahead log
 *     collections/<name>.json atomic snapshot per collection
 *
 *   Public API
 *   ----------
 *     new BotDatabase(opts)
 *     .get(name, fallback)          → value
 *     .has(name)                    → boolean
 *     .set(name, value)             → value
 *     .merge(name, patch)           → value   (shallow object merge)
 *     .incr(name, key, delta=1)     → number  (object counter)
 *     .push(name, item, {max})      → array   (bounded append)
 *     .delete(name)                 → boolean
 *     .keys()                       → string[]
 *     .stats()                      → { …store stats… }
 *     .flush()                      → Promise
 *     .flushSync()                  → void    (for exit handlers)
 *     .compact()                    → Promise
 *     .close()                      → Promise
 * ══════════════════════════════════════════════════════════════════════════════
 */

'use strict';

const fs = require('fs');
const path = require('path');

const STORE_VERSION = 1;
const DEFAULT_DEBOUNCE_MS = 350;
const DEFAULT_JOURNAL_MAX_BYTES = 4 * 1024 * 1024; // 4 MB → triggers compaction
const JOURNAL_VALUE_CAP_BYTES = 512 * 1024; // don't journal huge values (snapshot covers them)

function safeName(name) {
  return String(name).replace(/[^a-zA-Z0-9_.-]/g, '_') || 'unnamed';
}

function nowMs() {
  return Date.now();
}

function estimateBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
  } catch (_) {
    return 0;
  }
}

class BotDatabase {
  constructor(opts = {}) {
    this.dir = opts.dir || process.env.BOT_DB_DIR || path.join(process.cwd(), 'data', 'bot-db');
    this.collectionsDir = path.join(this.dir, 'collections');
    this.journalPath = path.join(this.dir, 'journal.log');
    this.metaPath = path.join(this.dir, 'meta.json');
    this.debounceMs = Number(opts.debounceMs || process.env.BOT_DB_DEBOUNCE_MS || DEFAULT_DEBOUNCE_MS);
    this.journalMaxBytes = Number(opts.journalMaxBytes || DEFAULT_JOURNAL_MAX_BYTES);

    this.memory = new Map();
    this.dirty = new Set();
    this._flushTimer = null;
    this._flushPromise = null;
    this._closed = false;

    this._startedAt = nowMs();
    this._writes = 0;         // logical writes (set/merge/incr/push)
    this._flushes = 0;        // physical snapshot flushes
    this._journalBytes = 0;
    this._compactions = 0;
    this._recovered = 0;

    this._ensureDirs();
    this._recover();
    this._writeMeta();
    this._registerExitHooks();
  }

  // ── setup ────────────────────────────────────────────────────────────────
  _ensureDirs() {
    try { fs.mkdirSync(this.dir, { recursive: true }); } catch (_) {}
    try { fs.mkdirSync(this.collectionsDir, { recursive: true }); } catch (_) {}
  }

  _collectionPath(name) {
    return path.join(this.collectionsDir, `${safeName(name)}.json`);
  }

  _writeMeta() {
    const meta = {
      version: STORE_VERSION,
      engine: 'PN-AD-NETWORK-BOT-DB',
      created_at: this._metaCreatedAt || nowMs(),
      updated_at: nowMs(),
      dir: this.dir,
    };
    this._metaCreatedAt = meta.created_at;
    this._atomicWrite(this.metaPath, JSON.stringify(meta, null, 2));
  }

  // ── atomic file write (temp → fsync → rename) ─────────────────────────────
  _atomicWrite(filePath, data) {
    const tmp = `${filePath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    let fd = null;
    try {
      fd = fs.openSync(tmp, 'w');
      fs.writeSync(fd, data);
      try { fs.fsyncSync(fd); } catch (_) {}
      fs.closeSync(fd);
      fd = null;
      fs.renameSync(tmp, filePath);
      return true;
    } catch (e) {
      try { if (fd !== null) fs.closeSync(fd); } catch (_) {}
      try { fs.unlinkSync(tmp); } catch (_) {}
      console.warn(`[BotDB] ⚠️  atomic write failed for ${path.basename(filePath)}: ${e.message}`);
      return false;
    }
  }

  // ── recovery: load snapshots then replay journal ──────────────────────────
  _recover() {
    // 1) Load snapshots
    let files = [];
    try { files = fs.readdirSync(this.collectionsDir); } catch (_) { files = []; }
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const name = f.slice(0, -5);
      try {
        const raw = fs.readFileSync(path.join(this.collectionsDir, f), 'utf8');
        this.memory.set(name, JSON.parse(raw));
      } catch (e) {
        console.warn(`[BotDB] ⚠️  could not load collection "${name}": ${e.message}`);
      }
    }

    // 2) Read meta
    try {
      const meta = JSON.parse(fs.readFileSync(this.metaPath, 'utf8'));
      this._metaCreatedAt = meta.created_at || nowMs();
    } catch (_) { this._metaCreatedAt = nowMs(); }

    // 3) Replay journal (metadata only) to rebuild the dirty set so the last
    //    writes are flushed again on the first cycle. We also count entries.
    try {
      const stat = fs.statSync(this.journalPath);
      this._journalBytes = stat.size;
      const raw = fs.readFileSync(this.journalPath, 'utf8');
      const lines = raw.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const op = JSON.parse(line);
          if (op && op.c) {
            this.dirty.add(op.c);
            this._recovered++;
          }
        } catch (_) {}
      }
      if (this.dirty.size) this._scheduleFlush();
    } catch (_) {
      this._journalBytes = 0;
    }

    if (this.memory.size || this._recovered) {
      console.log(`[BotDB] 💾 Embedded store ready · ${this.memory.size} collections · ${this._recovered} journal entries replayed`);
    } else {
      console.log('[BotDB] 💾 Embedded store initialised (empty)');
    }
  }

  _registerExitHooks() {
    if (this._exitHooked) return;
    this._exitHooked = true;
    process.on('exit', () => { try { this.flushSync(); } catch (_) {} });
  }

  // ── journal ───────────────────────────────────────────────────────────────
  _appendJournal(op, value) {
    const entry = { t: nowMs(), op, c: op.c || '' };
    if (op.op && op.c) {
      entry.op = op.op;
      entry.c = op.c;
    }
    // Optionally embed the value for small collections (durability across crash)
    if (value !== undefined) {
      const bytes = estimateBytes(value);
      if (bytes <= JOURNAL_VALUE_CAP_BYTES) {
        try { entry.v = value; } catch (_) {}
      }
    }
    const line = JSON.stringify(entry) + '\n';
    try {
      fs.appendFileSync(this.journalPath, line);
      this._journalBytes += Buffer.byteLength(line, 'utf8');
    } catch (_) {}
    if (this._journalBytes > this.journalMaxBytes) {
      // Compact asynchronously to keep the journal bounded.
      this.compact().catch(() => {});
    }
  }

  // ── core mutators ─────────────────────────────────────────────────────────
  get(name, fallback = null) {
    if (this.memory.has(name)) return this.memory.get(name);
    return fallback;
  }

  has(name) {
    return this.memory.has(name);
  }

  keys() {
    return [...this.memory.keys()];
  }

  set(name, value) {
    this.memory.set(name, value);
    this.dirty.add(name);
    this._writes++;
    this._appendJournal({ op: 'set', c: name }, value);
    this._scheduleFlush();
    return value;
  }

  merge(name, patch) {
    const base = (this.memory.get(name) && typeof this.memory.get(name) === 'object' && !Array.isArray(this.memory.get(name)))
      ? this.memory.get(name)
      : {};
    const next = { ...base, ...(patch || {}) };
    return this.set(name, next);
  }

  incr(name, key, delta = 1) {
    const base = (this.memory.get(name) && typeof this.memory.get(name) === 'object' && !Array.isArray(this.memory.get(name)))
      ? { ...this.memory.get(name) }
      : {};
    base[key] = Number(base[key] || 0) + Number(delta || 0);
    return this.set(name, base)[key];
  }

  push(name, item, opts = {}) {
    const max = Number(opts.max || 0);
    const arr = Array.isArray(this.memory.get(name)) ? this.memory.get(name).slice() : [];
    arr.push(item);
    const trimmed = max > 0 && arr.length > max ? arr.slice(-max) : arr;
    return this.set(name, trimmed);
  }

  delete(name) {
    const existed = this.memory.delete(name);
    this.dirty.add(name);
    this._writes++;
    this._appendJournal({ op: 'del', c: name });
    this._scheduleFlush();
    return existed;
  }

  // ── flushing ──────────────────────────────────────────────────────────────
  _scheduleFlush() {
    if (this._closed) return;
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this.flush().catch(() => {});
    }, this.debounceMs);
    if (this._flushTimer.unref) this._flushTimer.unref();
  }

  async flush() {
    if (this._flushPromise) return this._flushPromise;
    this._flushPromise = (async () => {
      const cols = [...this.dirty];
      this.dirty.clear();
      if (!cols.length) return;
      for (const name of cols) {
        const value = this.memory.has(name) ? this.memory.get(name) : null;
        const filePath = this._collectionPath(name);
        if (value === null && !this.memory.has(name)) {
          // deleted collection → remove snapshot
          try { fs.unlinkSync(filePath); } catch (_) {}
          continue;
        }
        const payload = JSON.stringify(value, null, 0);
        this._atomicWrite(filePath, payload);
      }
      this._flushes++;
    })().finally(() => { this._flushPromise = null; });
    return this._flushPromise;
  }

  flushSync() {
    const cols = [...this.dirty];
    this.dirty.clear();
    for (const name of cols) {
      const value = this.memory.has(name) ? this.memory.get(name) : null;
      if (value === null && !this.memory.has(name)) {
        try { fs.unlinkSync(this._collectionPath(name)); } catch (_) {}
        continue;
      }
      this._atomicWrite(this._collectionPath(name), JSON.stringify(value));
    }
    if (cols.length) this._flushes++;
  }

  async compact() {
    try {
      const lines = [];
      for (const name of this.memory.keys()) {
        lines.push(JSON.stringify({ t: nowMs(), op: 'set', c: name }));
      }
      this._atomicWrite(this.journalPath, lines.join('\n') + (lines.length ? '\n' : ''));
      this._journalBytes = Buffer.byteLength(lines.join('\n'), 'utf8');
      this._compactions++;
    } catch (_) {}
  }

  async close() {
    this._closed = true;
    if (this._flushTimer) { clearTimeout(this._flushTimer); this._flushTimer = null; }
    await this.flush();
    this.flushSync();
  }

  // ── observability ─────────────────────────────────────────────────────────
  stats() {
    const collections = [];
    let totalEntries = 0;
    let totalBytes = 0;
    let totalFileBytes = 0;

    for (const [name, value] of this.memory.entries()) {
      let entries = 0;
      let type = typeof value;
      if (Array.isArray(value)) { entries = value.length; type = 'array'; }
      else if (value && typeof value === 'object') { entries = Object.keys(value).length; type = 'object'; }
      else { entries = value === null || value === undefined ? 0 : 1; }

      const bytes = estimateBytes(value);
      let fileBytes = 0;
      try { fileBytes = fs.statSync(this._collectionPath(name)).size; } catch (_) {}

      totalEntries += entries;
      totalBytes += bytes;
      totalFileBytes += fileBytes;

      collections.push({
        name,
        type,
        entries,
        bytes,
        file_bytes: fileBytes,
        dirty: this.dirty.has(name),
      });
    }

    collections.sort((a, b) => b.bytes - a.bytes);

    let journalBytes = this._journalBytes;
    try { journalBytes = fs.statSync(this.journalPath).size; } catch (_) {}

    return {
      engine: 'PN-AD-NETWORK-BOT-DB',
      version: STORE_VERSION,
      dir: this.dir,
      collections_count: this.memory.size,
      total_entries: totalEntries,
      total_bytes: totalBytes,
      total_file_bytes: totalFileBytes,
      journal_bytes: journalBytes,
      journal_max_bytes: this.journalMaxBytes,
      writes: this._writes,
      flushes: this._flushes,
      compactions: this._compactions,
      recovered_entries: this._recovered,
      dirty_count: this.dirty.size,
      uptime_ms: nowMs() - this._startedAt,
      started_at: this._startedAt,
      collections,
    };
  }
}

module.exports = { BotDatabase, STORE_VERSION };

// Allow a quick standalone smoke-test: `node services/botDatabase.cjs`
if (require.main === module) {
  const db = new BotDatabase({ dir: path.join(process.cwd(), 'data', 'bot-db-selftest') });
  db.set('demo', { a: 1 });
  db.push('log', { t: nowMs() }, { max: 3 });
  db.incr('counters', 'hits', 5);
  db.flushSync();
  console.log(JSON.stringify(db.stats(), null, 2));
}
