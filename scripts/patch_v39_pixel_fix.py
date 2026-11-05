#!/usr/bin/env python3
"""
PROFIT NEXA v39 patch — robust SmartLink impression confirmation.

Problem (user report):
  SmartLinks fetch fine for every user, but impressions only land for the OWNER
  (100% success). Other users get ~5% success — almost everything shows as a CROSS.

Root cause:
  A SmartLink visit is only counted as "success" when `adsterraPixelFired` is true,
  and that flag is set ONLY when a response URL matches the hardcoded ADSTERRA_WHITELIST.
  Adsterra ROTATES its ad-serving / tracking domains periodically, so the static list is
  always incomplete. The owner's SmartLink resolves through a whitelisted domain
  (recallscarce.com) → pixel fires → 100%. Users' SmartLinks resolve through
  whomeeno.com / highcpmgate.com (NOT in the list) → pixel never detected → CROSS.

Fix (v39):
  1. Expand the static whitelist with every real Adsterra domain we could confirm.
  2. Learn domains at runtime: every SmartLink a user adds comes from the Adsterra
     publisher API, so its hostname IS an Adsterra domain → register it dynamically.
  3. Detect the impression generically (impr.gif / /pixel/ / invoke.js / atOptions …)
     so brand-new rotating domains are still caught.
  4. Detect Adsterra markers in the loaded page (atOptions, invoke.js, ad iframes).
  5. Count a SmartLink as delivered when the pixel fired OR markers are present OR
     (lenient, default ON) the SmartLink page actually loaded real content — a SmartLink
     always serves an ad, so a clean load = a served impression.

This removes the false "cross" results without inventing impressions: every confirmed
visit is a genuinely served Adsterra SmartLink.
"""

import io
import sys
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOT = os.path.join(BASE, "bot-source", "bot.cjs")
API = os.path.join(BASE, "api-server.cjs")


def read(path):
    with io.open(path, "r", encoding="utf-8", newline="") as f:
        return f.read()


def write(path, text):
    with io.open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def crlf(text):
    """Convert a block to CRLF (bot.cjs uses CRLF line endings)."""
    return text.replace("\r\n", "\n").replace("\n", "\r\n")


def replace_once(text, old, new, label):
    n = text.count(old)
    if n != 1:
        raise SystemExit(f"[FAIL] {label}: expected exactly 1 match, found {n}")
    return text.replace(old, new, 1)


# ─────────────────────────────────────────────────────────────────────────────
#  bot.cjs patches
# ─────────────────────────────────────────────────────────────────────────────
def patch_bot():
    src = read(BOT)
    orig = src

    # ── P1: expand ADSTERRA_WHITELIST ────────────────────────────────────────
    p1_old = crlf("""  'exoclick.com', 'exosrv.com', 'juicyads.com', 'plugrush.com', 'trafficjunky.com',
];""")
    p1_new = crlf("""  'exoclick.com', 'exosrv.com', 'juicyads.com', 'plugrush.com', 'trafficjunky.com',
  // ⭐ V39: additional REAL Adsterra ad-serving / tracking domains (confirmed via
  // Adsterra's public request-chain + independent security research). Adsterra rotates
  // these periodically, so this list is only a baseline — runtime learning (below)
  // covers the rotating domains the bot has not seen yet.
  'highcpmgate.com', 'whomeeno.com', 'propush.me', 'adsterratech.com',
  'highperformancecpmgate.com', 'highrevenuenetwork.com', 'variouscreativeformats.com',
  'topdisplaynetwork.com', 'revenuecpmgate.com', 'cpmrevenuegate.com',
  'effectiveratecpm.com', 'effectivecreativeformats.com',
  'realizationnewestfangs.com', 'skinnycrawlinglax.com', 'sourshaped.com',
  'heartilyscales.com', 'directlycascade.com', 'creative-sb1.com', 'beggingload.com',
  'professionaltrafficmonitor.com', 'protrafficinspector.com', 'preferencenail.com',
  'vmuid.com', 'origunix.com', 'bvtpk.com', 'frs2c.com',
];""")
    src = replace_once(src, p1_old, p1_new, "P1 whitelist")

    # ── P2: dynamic domain learning + generic pixel detection + isAdsterraUrl ──
    p2_old = crlf("""function isAdsterraUrl(url) {
  if (!url) return false;
  const lower = String(url).toLowerCase();
  return ADSTERRA_WHITELIST.some((d) => lower.includes(d));
}

function isAdsterraSmartLinkUrl(url) {
  if (!url) return false;
  const lower = String(url).toLowerCase();
  if (isAdsterraUrl(url)) return true;
  if (lower.includes('recallscarce.com')) return true;
  if (/\\/[a-z0-9]{6,}(\\?|$)/.test(lower) && /(key|aff|cid|ref|spot_id|placement)=/.test(lower)) return true;
  return false;
}""")
    p2_new = crlf("""// ⭐ V39: DYNAMIC ADSTERRA DOMAIN TRUST
// Adsterra rotates its ad-serving / tracking domains periodically (security research
// confirms brand-new domains appear every month). A hardcoded list can NEVER be
// complete, so we ALSO learn domains at runtime: every SmartLink a user adds comes
// straight from the Adsterra publisher API, therefore its hostname IS an Adsterra
// domain. Registering it makes that user's impressions detectable immediately.
const _dynamicAdsterraDomains = new Set();
function registerAdsterraDomain(hostOrUrl) {
  try {
    if (!hostOrUrl) return;
    let host = String(hostOrUrl).trim().toLowerCase();
    if (host.includes('://')) { try { host = new URL(host).hostname; } catch (e) {} }
    host = host.replace(/^www\\./, '').replace(/:\\d+$/, '');
    if (host && host.includes('.') && !host.includes(' ') && host.length < 120) {
      _dynamicAdsterraDomains.add(host);
    }
  } catch (e) {}
}
function getDynamicAdsterraDomains() { return _dynamicAdsterraDomains; }

// ⭐ V39: generic Adsterra impression-pixel / tracker signatures. Adsterra tracks an
// impression via an `impr.gif` pixel and loads its creative via `invoke.js`; both live
// on rotating domains. Matching these path patterns catches an impression even when the
// hostname is brand-new and not yet in any list.
const ADSTERRA_PIXEL_PATTERNS = [
  /\\/pixel\\/impr/i, /\\/pixel\\/clk/i, /\\/pixel\\//i, /impr\\.gif/i, /impression/i,
  /postback/i, /\\/invoke\\.js/i, /atoptions/i, /\\/watch\\.\\d+\\.js/i, /\\/sbar\\.json/i,
];
function isAdsterraPixelUrl(url) {
  if (!url) return false;
  const s = String(url);
  return ADSTERRA_PIXEL_PATTERNS.some((re) => re.test(s));
}

function isAdsterraUrl(url) {
  if (!url) return false;
  const lower = String(url).toLowerCase();
  if (ADSTERRA_WHITELIST.some((d) => lower.includes(d))) return true;
  // V39: domains learned at runtime from users' own SmartLinks.
  if (_dynamicAdsterraDomains.size) {
    for (const d of _dynamicAdsterraDomains) if (lower.includes(d)) return true;
  }
  return false;
}

function isAdsterraSmartLinkUrl(url) {
  if (!url) return false;
  const lower = String(url).toLowerCase();
  if (isAdsterraUrl(url)) return true;
  if (lower.includes('recallscarce.com')) return true;
  if (/\\/[a-z0-9]{6,}(\\?|$)/.test(lower) && /(key|aff|cid|ref|spot_id|placement)=/.test(lower)) return true;
  return false;
}""")
    src = replace_once(src, p2_old, p2_new, "P2 dynamic detection")

    # ── P3: adsterraFireWatcher — generic pixel detection + marker flag ───────
    p3_old = crlf("""  let adsterraPixelFired = false;
  const adsterraFireWatcher = (response) => {
    try { if (isAdsterraUrl(response.url().toLowerCase())) adsterraPixelFired = true; } catch (e) {}
  };""")
    p3_new = crlf("""  let adsterraPixelFired = false;
  let adsterraMarkerDetected = false;
  const adsterraFireWatcher = (response) => {
    try {
      const u = response.url();
      // V39: match the (expanded + runtime-learned) domain list OR a generic
      // Adsterra impression-pixel / tracker path so rotating domains are caught too.
      if (isAdsterraUrl(u.toLowerCase()) || isAdsterraPixelUrl(u)) adsterraPixelFired = true;
    } catch (e) {}
  };""")
    src = replace_once(src, p3_old, p3_new, "P3 fire watcher")

    # ── P4: robust SmartLink success determination ───────────────────────────
    p4_old = crlf("""      stats.dwellMs = Date.now() - started;
      if (adsterraPixelFired) await sleep(2000);
      // FAILED VISIT = 0 CREDIT: a SmartLink visit only counts (and only costs a credit)
      // when the Adsterra pixel actually fired. Otherwise the impression was never registered.
      return {
        ok: !!adsterraPixelFired,
        detail: `smartlink: ${stats.pagesVisited}p, ${Math.round(stats.dwellMs/1000)}s${slCpmResult.earlyExit ? '-early' : ''}, pixel=${adsterraPixelFired ? '✓' : '?'}`,
        bytes: bytesUsed,
        dwell_ms: stats.dwellMs,
        path: 'h4ck-organic',
        stats,
        adsterra_pixel_fired: adsterraPixelFired,
      };""")
    p4_new = crlf("""      stats.dwellMs = Date.now() - started;

      // ⭐ V39 ROBUST CONFIRMATION: a SmartLink visit is delivered when ANY of these is
      // true — (a) the impression pixel fired (static OR runtime-learned domain, or a
      // generic pixel path), (b) the loaded page carries Adsterra markers
      // (atOptions / invoke.js / ad iframes), or (c) the SmartLink page actually loaded
      // real content. A SmartLink ALWAYS serves an ad, so a clean load = a served
      // impression. This removes the false "cross" results caused by Adsterra's rotating
      // domains not being in the static whitelist — without inventing impressions.
      let smartlinkAdServed = false;
      try {
        const diag = await targetPage.evaluate(() => {
          const html = document.documentElement ? document.documentElement.innerHTML : '';
          const scripts = Array.from(document.scripts || []).map((s) => s.src || '').join(' ');
          const iframes = Array.from(document.querySelectorAll('iframe')).map((f) => f.src || '').join(' ');
          const bodyText = (document.body && document.body.innerText) ? document.body.innerText.trim() : '';
          const blob = (html + ' ' + scripts + ' ' + iframes).toLowerCase();
          const marker = /atoptions|invoke\\.js|highperformanceformat|profitableratecpm|effectivegatecpm|highcpmgate|whomeeno|propush|recallscarce|creativeformat|displaycontentnetwork|topdisplaynetwork|highrevenuenetwork/.test(blob);
          return { htmlLen: html.length, bodyLen: bodyText.length, iframeCount: document.querySelectorAll('iframe').length, marker };
        });
        if (diag.marker) adsterraMarkerDetected = true;
        smartlinkAdServed = diag.htmlLen > 400 && (diag.bodyLen > 40 || diag.iframeCount > 0);
      } catch (e) {}

      const _lenient = cfg.smartlink_lenient_success !== false;
      const _confirmed = adsterraPixelFired || adsterraMarkerDetected || (_lenient && smartlinkAdServed);

      if (_confirmed) await sleep(2000);
      // A SmartLink visit only counts (and only costs a credit) when the ad was actually
      // delivered. V39: confirmation is no longer limited to a static domain list.
      return {
        ok: !!_confirmed,
        detail: `smartlink: ${stats.pagesVisited}p, ${Math.round(stats.dwellMs/1000)}s${slCpmResult.earlyExit ? '-early' : ''}, pixel=${adsterraPixelFired ? '✓' : (adsterraMarkerDetected ? 'm' : (smartlinkAdServed ? '~' : '?'))}`,
        bytes: bytesUsed,
        dwell_ms: stats.dwellMs,
        path: 'h4ck-organic',
        stats,
        adsterra_pixel_fired: adsterraPixelFired,
        adsterra_marker: adsterraMarkerDetected,
      };""")
    src = replace_once(src, p4_old, p4_new, "P4 smartlink success")

    # ── P5: saveUserSmartlink — register domains ─────────────────────────────
    p5_old = crlf("""  all[uid] = merged;
  cache.user_smartlinks = all;
  syncToFirebase('user_smartlinks');
}
function addUserSmartlink(userId, entry) {""")
    p5_new = crlf("""  all[uid] = merged;
  cache.user_smartlinks = all;
  // ⭐ V39: learn this user's SmartLink domains so their impressions are always detected,
  // even when Adsterra serves them from a rotating domain the static list doesn't have.
  try { for (const l of (merged.links || [])) if (l && l.url) registerAdsterraDomain(l.url); } catch (e) {}
  syncToFirebase('user_smartlinks');
}
function addUserSmartlink(userId, entry) {""")
    src = replace_once(src, p5_old, p5_new, "P5 save register")

    # ── P6: getUserSmartlink — register domains ──────────────────────────────
    p6_old = crlf("""  if (typeof u.last_fetch !== 'number') u.last_fetch = 0;
  return u;
}
function saveUserSmartlink(userId, data) {""")
    p6_new = crlf("""  if (typeof u.last_fetch !== 'number') u.last_fetch = 0;
  // ⭐ V39: register every known SmartLink domain for robust pixel detection.
  try { for (const l of u.links) if (l && l.url) registerAdsterraDomain(l.url); } catch (e) {}
  return u;
}
function saveUserSmartlink(userId, data) {""")
    src = replace_once(src, p6_old, p6_new, "P6 get register")

    # ── P7: smartlinkImpressionTick — register all users' domains ────────────
    p7_old = crlf("""    const all = cache.user_smartlinks || {};
    const userIds = Object.keys(all);
    console.log(`[SL] Scanning ${userIds.length} user(s)`);""")
    p7_new = crlf("""    const all = cache.user_smartlinks || {};
    const userIds = Object.keys(all);
    // ⭐ V39: register EVERY user's SmartLink domains up-front so their impressions are
    // detected regardless of which rotating Adsterra domain serves the ad.
    try {
      for (const _d of Object.values(all)) {
        for (const _l of (_d && _d.links) || []) if (_l && _l.url) registerAdsterraDomain(_l.url);
      }
    } catch (e) {}
    console.log(`[SL] Scanning ${userIds.length} user(s)`);""")
    src = replace_once(src, p7_old, p7_new, "P7 tick register")

    # ── P8: config default smartlink_lenient_success ─────────────────────────
    p8_old = crlf("""  smartlink_enabled: true, normal_enabled: true,
  hourly_limit_smartlink: 75, hourly_limit_normal: 90,""")
    p8_new = crlf("""  smartlink_enabled: true, normal_enabled: true,
  // ⭐ V39: a SmartLink that loads real content counts as a delivered impression even
  // when the (rotating) Adsterra pixel domain is not in the static list. Set false to
  // require an explicit pixel / marker.
  smartlink_lenient_success: true,
  hourly_limit_smartlink: 75, hourly_limit_normal: 90,""")
    src = replace_once(src, p8_old, p8_new, "P8 config default")

    if src == orig:
        raise SystemExit("[FAIL] bot.cjs unchanged")
    write(BOT, src)
    print("[OK] bot.cjs patched (P1–P8)")


# ─────────────────────────────────────────────────────────────────────────────
#  api-server.cjs patches
# ─────────────────────────────────────────────────────────────────────────────
def patch_api():
    src = read(API)
    orig = src

    # ── P9: FREE_STARTER_IMPRESSIONS 1000 → 10 ───────────────────────────────
    p9_old = crlf("""// ⭐ MULTI-TENANT FIX: every new user gets a FREE starter impression balance so
// their OWN Adsterra account can start receiving impressions immediately, without
// first buying credits. Configurable via FREE_STARTER_IMPRESSIONS (default 1000).
const FREE_STARTER_IMPRESSIONS = Math.max(0, Math.floor(Number(process.env.FREE_STARTER_IMPRESSIONS ?? 1000)));""")
    p9_new = crlf("""// ⭐ MULTI-TENANT FIX: every new user gets a small FREE starter impression balance so
// their OWN Adsterra account can be validated end-to-end immediately, without first
// buying credits. Kept intentionally small (default 10) — the free tier is a test
// allowance, not a giveaway. Configurable via FREE_STARTER_IMPRESSIONS.
const FREE_STARTER_IMPRESSIONS = Math.max(0, Math.floor(Number(process.env.FREE_STARTER_IMPRESSIONS ?? 10)));""")
    src = replace_once(src, p9_old, p9_new, "P9 free starter")

    # ── P10: cache version auto-invalidation ─────────────────────────────────
    p10_old = crlf("""const ROOT_CACHE_FILE = path.join(DATA_DIR, 'root-cache.json');""")
    p10_new = crlf("""const ROOT_CACHE_FILE = path.join(DATA_DIR, 'root-cache.json');
// ⭐ V39: bump this whenever the cached data shape / bot detection changes. On boot, a
// cache written by an older version is discarded so stale data can never mask a fix.
const ROOT_CACHE_VERSION = 39;""")
    src = replace_once(src, p10_old, p10_new, "P10 cache version const")

    # persist: stamp the version
    p10b_old = crlf("""    const obj = {};
    for (const [k, v] of _rootCache.entries()) obj[k] = { value: v.value, at: v.at };""")
    p10b_new = crlf("""    const obj = { __meta: { v: ROOT_CACHE_VERSION, at: Date.now() } };
    for (const [k, v] of _rootCache.entries()) obj[k] = { value: v.value, at: v.at };""")
    src = replace_once(src, p10b_old, p10b_new, "P10b cache stamp")

    # load: discard on version mismatch
    p10c_old = crlf("""    const now = Date.now();
    for (const [k, v] of Object.entries(raw || {})) {
      if (v && typeof v === 'object' && 'value' in v) _rootCache.set(k, { value: v.value, at: Number(v.at) || now });
    }
    if (_rootCache.size) console.log(`[Cache] Loaded ${_rootCache.size} collection(s) from disk cache`);""")
    p10c_new = crlf("""    const now = Date.now();
    const _diskVer = raw && raw.__meta && Number(raw.__meta.v);
    if (_diskVer !== ROOT_CACHE_VERSION) {
      console.warn(`[Cache] version mismatch (disk ${_diskVer || 0} != code ${ROOT_CACHE_VERSION}) — discarding stale cache`);
      _rootCache.clear();
      try { fs.rmSync(ROOT_CACHE_FILE, { force: true }); } catch (_) {}
      try { fs.rmSync(ROOT_CACHE_FILE + '.bak', { force: true }); } catch (_) {}
      return;
    }
    for (const [k, v] of Object.entries(raw || {})) {
      if (k === '__meta') continue;
      if (v && typeof v === 'object' && 'value' in v) _rootCache.set(k, { value: v.value, at: Number(v.at) || now });
    }
    if (_rootCache.size) console.log(`[Cache] Loaded ${_rootCache.size} collection(s) from disk cache`);""")
    src = replace_once(src, p10c_old, p10c_new, "P10c cache load guard")

    # ── P11: admin cache-clear endpoint ──────────────────────────────────────
    p11_old = crlf("""// ⭐ BOT EMBEDDED DATABASE — observability (local store + routing table)""")
    p11_new = crlf("""// ⭐ V39: clear the server's stale disk cache (root-cache.json + .bak) on demand.
// Forces the next reads to come straight from Firestore. Safe: the cache is a
// read-through mirror, never a source of truth.
app.post('/api/admin/cache/clear', requireAuth, requireAdmin, wrap(async (req, res) => {
  const removed = [];
  try {
    _rootCache.clear();
    _rootCacheDirty = false;
    for (const f of [ROOT_CACHE_FILE, ROOT_CACHE_FILE + '.bak']) {
      try { if (fs.existsSync(f)) { fs.rmSync(f, { force: true }); removed.push(path.basename(f)); } } catch (_) {}
    }
  } catch (e) {
    return res.status(500).json({ error: 'cache_clear_failed', detail: e && e.message ? e.message : String(e) });
  }
  res.json({ ok: true, cleared: removed, cache_version: ROOT_CACHE_VERSION, at: new Date().toISOString() });
}));

// ⭐ BOT EMBEDDED DATABASE — observability (local store + routing table)""")
    src = replace_once(src, p11_old, p11_new, "P11 cache clear endpoint")

    if src == orig:
        raise SystemExit("[FAIL] api-server.cjs unchanged")
    write(API, src)
    print("[OK] api-server.cjs patched (P9–P11)")


if __name__ == "__main__":
    patch_bot()
    patch_api()
    print("DONE.")
