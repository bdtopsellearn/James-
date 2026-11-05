#!/usr/bin/env python3
"""Patch api-server.cjs so the Adsterra publisher summary is PER-USER.

Root cause: GET /api/adsterra/summary always used process.env.ADSTERRA_API_TOKEN
(the platform owner's key) for every user, so each user saw the owner's Adsterra
account and their own saved key was ignored on the dashboard.

This patch:
  1. lets fetchAdsterraNetworkSummary() accept an explicit token
  2. adds getAdsterraUserSummary(uid, ...) that uses the user's own saved key
  3. points GET /api/adsterra/summary at the per-user summary
"""
import io, sys, os

PATH = os.path.join(os.path.dirname(__file__), '..', 'api-server.cjs')
PATH = os.path.abspath(PATH)

with io.open(PATH, 'r', encoding='utf-8', newline='') as f:
    raw = f.read()

# Work on LF-normalised text, restore CRLF at the end.
crlf = '\r\n' in raw
text = raw.replace('\r\n', '\n')

def replace_once(haystack, old, new, label):
    global text
    n = haystack.count(old)
    if n != 1:
        print(f'ERROR [{label}]: expected exactly 1 match, found {n}')
        sys.exit(1)
    text = haystack.replace(old, new, 1)
    print(f'OK [{label}]')

# ── 1. fetchAdsterraNetworkSummary accepts an explicit token ────────────────
old1 = """async function fetchAdsterraNetworkSummary(days = 7) {
  const token = process.env.ADSTERRA_API_TOKEN;
  if (!token) return { ok: false, error: 'ADSTERRA_API_TOKEN not configured.', days: [] };"""
new1 = """async function fetchAdsterraNetworkSummary(days = 7, tokenOverride = null) {
  // \u2b50 FIX: accept an explicit token so each user can pull THEIR OWN publisher
  // account. When no token is passed we fall back to the platform token
  // (ADSTERRA_API_TOKEN), which stays the source for the admin/leaderboard view.
  const token = String(tokenOverride || process.env.ADSTERRA_API_TOKEN || '').trim();
  if (!token) return { ok: false, error: 'ADSTERRA_API_TOKEN not configured.', days: [] };"""
replace_once(text, old1, new1, 'fetchAdsterraNetworkSummary signature')

# ── 2. add getAdsterraUserSummary() right after getAdsterraNetworkSummary() ──
old2 = """  _adsterraCache.inflight = p;
  return p;
}
"""
new2 = """  _adsterraCache.inflight = p;
  return p;
}

// \u2b50 FIX: PER-USER Adsterra publisher summary.
// Each user's dashboard + SmartLinks panels now reflect THEIR OWN Adsterra
// account (using the API key they saved in SmartLinks) instead of the platform
// owner's. The platform token (ADSTERRA_API_TOKEN) is only a fallback and stays
// the single source for the admin/leaderboard "network" view.
const _adsterraUserCache = new Map(); // key: `${uid}::${scope}` -> { at, value }
async function getAdsterraUserSummary(uid, days = 7, force = false) {
  const uidKey = String(uid);
  let userToken = '';
  try {
    const entry = ((await readRoot('user_smartlinks')) || {})[uidKey] || {};
    userToken = entry.api_key ? String(entry.api_key).trim() : '';
  } catch (e) { userToken = ''; }
  const platformToken = String(process.env.ADSTERRA_API_TOKEN || '').trim();
  const token = userToken || platformToken;
  const scope = userToken ? 'own' : 'platform';
  if (!token) {
    return { ok: false, error: 'Adsterra API key not set. Open SmartLinks and save your Adsterra publisher API key to see your own impressions.', days: [] };
  }
  const cacheKey = uidKey + '::' + scope;
  const now = Date.now();
  const cached = _adsterraUserCache.get(cacheKey);
  if (!force && cached && now - cached.at < ADSTERRA_CACHE_MS && cached.value.windowDays === days) {
    return cached.value;
  }
  const val = await fetchAdsterraNetworkSummary(days, token);
  if (val.ok) {
    _adsterraUserCache.set(cacheKey, { at: now, value: val });
    // Keep the adaptive-CPM signal fed from the PLATFORM account only.
    if (scope === 'platform') {
      try {
        writeRoot('adsterra_live', {
          cpm: val.cpm, revenue: val.revenue, impressions: val.impressions,
          clicks: val.clicks, windowDays: days,
          cpmToday: (val.today && val.today.cpm) || 0,
          updated_at: Date.now(),
        }).catch(() => {});
      } catch (e) {}
    }
  }
  return val;
}
"""
replace_once(text, old2, new2, 'add getAdsterraUserSummary')

# ── 3. point GET /api/adsterra/summary at the per-user summary ──────────────
old3 = """app.get('/api/adsterra/summary', requireAuth, wrap(async (req, res) => {
  const days = Math.max(1, Math.min(31, Number(req.query.days) || 7));
  const force = String(req.query.force || '') === '1';
  const summary = await getAdsterraNetworkSummary(days, force);
  res.json(summary);
}));"""
new3 = """app.get('/api/adsterra/summary', requireAuth, requireFirebase, wrap(async (req, res) => {
  const days = Math.max(1, Math.min(31, Number(req.query.days) || 7));
  const force = String(req.query.force || '') === '1';
  // \u2b50 FIX: every user sees THEIR OWN Adsterra publisher account (key saved in
  // SmartLinks). Admins can still request the platform-wide view with ?scope=platform.
  const scope = String(req.query.scope || '').toLowerCase();
  const summary = (scope === 'platform' && req.auth.role === 'admin')
    ? await getAdsterraNetworkSummary(days, force)
    : await getAdsterraUserSummary(req.auth.uid, days, force);
  res.json(summary);
}));"""
replace_once(text, old3, new3, 'per-user summary endpoint')

if crlf:
    text = text.replace('\n', '\r\n')

with io.open(PATH, 'w', encoding='utf-8', newline='') as f:
    f.write(text)

print('PATCHED:', PATH)
