#!/usr/bin/env python3
"""MULTI-TENANT FIX — make EVERY user's OWN Adsterra API key deliver impressions.

Reported bug: only the owner's Adsterra key produced impressions; other users'
keys did nothing and those users "couldn't even use" the site.

Root causes found in the audit:
  * New users were provisioned impression_balance = 0, so canRunImpression()
    returned NO_CREDITS and POST /api/traffic/start always 400'd for them.
  * Starting traffic required the user to have ALREADY synced SmartLinks; if a
    user had saved their key but not pressed Sync, Start failed with a generic
    "No SmartLinks configured yet." (looked like the site was broken for them).
  * The bot's saveUserSmartlink() could clobber a saved api_key with null when a
    partial update (e.g. a visit counter) was written back.
  * There was no per-user way to see WHY their own account was / wasn't ready.

This patch (CRLF-safe) applies:
  B1  bot-source/bot.cjs  : saveUserSmartlink() preserves a saved api_key.
  B2  api-server.cjs      : provision FREE_STARTER_IMPRESSIONS (default 1000).
  B3  api-server.cjs      : /api/traffic/start auto-pulls the user's own links.
  B4  api-server.cjs      : GET /api/traffic/status per-user diagnostic.
"""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
API = os.path.abspath(os.path.join(HERE, '..', 'api-server.cjs'))
BOT = os.path.abspath(os.path.join(HERE, '..', 'bot-source', 'bot.cjs'))


def load(path):
    with io.open(path, 'r', encoding='utf-8', newline='') as f:
        raw = f.read()
    crlf = '\r\n' in raw
    return raw.replace('\r\n', '\n'), crlf


def save(path, text, crlf):
    out = text.replace('\n', '\r\n') if crlf else text
    with io.open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(out)


def replace_once(text, old, new, label):
    n = text.count(old)
    if n != 1:
        print(f'ERROR [{label}]: expected exactly 1 match, found {n}')
        sys.exit(1)
    return text.replace(old, new, 1)


# ════════════════════════════════════════════════════════════════════════════
# B1 — bot-source/bot.cjs : never clobber a saved api_key
# ════════════════════════════════════════════════════════════════════════════
bot_text, bot_crlf = load(BOT)

old_b1 = """function saveUserSmartlink(userId, data) {
  const all = cache.user_smartlinks || {};
  all[String(userId)] = data;
  cache.user_smartlinks = all;
  syncToFirebase('user_smartlinks');
}"""
new_b1 = """function saveUserSmartlink(userId, data) {
  const all = cache.user_smartlinks || {};
  const uid = String(userId);
  const prev = all[uid] || {};
  // \u2b50 MULTI-TENANT SAFETY: never lose a user's saved Adsterra api_key when a
  // partial update (e.g. a visit counter) is written back. Each user's OWN key is
  // what makes THEIR Adsterra account receive impressions \u2014 clobbering it with
  // null would silently break delivery for that user only.
  const merged = { ...prev, ...(data || {}) };
  if ((merged.api_key == null || merged.api_key === '') && prev.api_key) merged.api_key = prev.api_key;
  all[uid] = merged;
  cache.user_smartlinks = all;
  syncToFirebase('user_smartlinks');
}"""
bot_text = replace_once(bot_text, old_b1, new_b1, 'B1 saveUserSmartlink')
save(BOT, bot_text, bot_crlf)
print('OK [B1] bot-source/bot.cjs saveUserSmartlink preserves api_key')

# ════════════════════════════════════════════════════════════════════════════
# B2 — api-server.cjs : FREE starter impression balance
# ════════════════════════════════════════════════════════════════════════════
api_text, api_crlf = load(API)

old_b2a = """function makeFreshMembership(uid) {"""
new_b2a = """// \u2b50 MULTI-TENANT FIX: every new user gets a FREE starter impression balance so
// their OWN Adsterra account can start receiving impressions immediately, without
// first buying credits. Configurable via FREE_STARTER_IMPRESSIONS (default 1000).
const FREE_STARTER_IMPRESSIONS = Math.max(0, Math.floor(Number(process.env.FREE_STARTER_IMPRESSIONS ?? 1000)));

function makeFreshMembership(uid) {"""
api_text = replace_once(api_text, old_b2a, new_b2a, 'B2 constant')

old_b2b = """  await updateRoot('impression_balance',     (cur) => ({ ...(cur || {}), [uid]: 0 }));"""
new_b2b = """  await updateRoot('impression_balance',     (cur) => ({ ...(cur || {}), [uid]: FREE_STARTER_IMPRESSIONS }));"""
api_text = replace_once(api_text, old_b2b, new_b2b, 'B2 provision')
print('OK [B2] api-server.cjs provisions FREE_STARTER_IMPRESSIONS for new users')

# ════════════════════════════════════════════════════════════════════════════
# B3 — api-server.cjs : /api/traffic/start auto-pulls the user's own links
# ════════════════════════════════════════════════════════════════════════════
old_b3 = """  // Ensure the user actually has content to run
  if (type === 'smartlink') {
    const entry = ((userSmartlinks || {})[uid]) || { links: [] };
    if (!Array.isArray(entry.links) || entry.links.length === 0) {
      return res.status(400).json({ error: 'No SmartLinks configured yet.' });
    }
  } else {"""
new_b3 = """  // Ensure the user actually has content to run
  if (type === 'smartlink') {
    let entry = ensureUserSmartlinkShape((userSmartlinks || {})[uid]);
    if ((!Array.isArray(entry.links) || entry.links.length === 0) && entry.api_key) {
      // \u2b50 MULTI-TENANT FIX: the user saved their OWN Adsterra API key but hasn't
      // synced yet. Auto-pull THEIR SmartLinks so "Start" just works for every
      // user (previously this 400'd and looked like the whole site was broken).
      try {
        const fetched = await L.fetchAdsterraSmartlinks(entry.api_key);
        if (fetched && fetched.ok && Array.isArray(fetched.links) && fetched.links.length) {
          await updateRoot('user_smartlinks', (cur) => {
            const next = { ...(cur || {}) };
            const e = ensureUserSmartlinkShape(next[uid]);
            for (const link of fetched.links) {
              if (e.links.some((l) => l.url === link.url)) continue;
              e.links.push({
                url: link.url, name: link.name || '', id: link.id || null,
                status: link.status || 'Active',
                added_at: Date.now(), last_visit_at: 0, bot_visits: 0, ok: 0, failed: 0,
              });
            }
            e.last_fetch = Date.now();
            next[uid] = e;
            return next;
          });
          entry = ensureUserSmartlinkShape((await readRoot('user_smartlinks') || {})[uid]);
        }
      } catch (_) { /* fall through to the friendly error below */ }
    }
    if (!Array.isArray(entry.links) || entry.links.length === 0) {
      return res.status(400).json({
        error: entry.api_key
          ? 'No SmartLinks found on your Adsterra account yet. Create a SmartLink in Adsterra, then press Sync.'
          : 'Save your own Adsterra API key in SmartLinks first.',
        code: entry.api_key ? 'NO_LINKS' : 'NO_API_KEY',
      });
    }
  } else {"""
api_text = replace_once(api_text, old_b3, new_b3, 'B3 traffic/start autofetch')
print('OK [B3] api-server.cjs /api/traffic/start auto-fetches the user\'s own links')

# ════════════════════════════════════════════════════════════════════════════
# B4 — api-server.cjs : GET /api/traffic/status per-user diagnostic
# ════════════════════════════════════════════════════════════════════════════
old_b4 = """app.post('/api/traffic/mode', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const current = ((await readRoot('impression_target_modes')) || {})[uid] || 'h4ck_organic';
  res.json({ ok: true, mode: current, managed: true });
}));"""
new_b4 = old_b4 + """

// \u2500\u2500 Per-user delivery diagnostic \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Tells each user exactly what is (or isn't) ready for THEIR OWN Adsterra account
// to receive impressions: API key saved? SmartLinks present? credits? booster/
// proxy ready? engine running? Plus ONE human-readable reason. Read-only.
app.get('/api/traffic/status', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const type = req.query?.type === 'normal' ? 'normal' : 'smartlink';
  const [aiSettings, proxySettings, proxies, proxyStats, impBalance, membership,
    hourlyLog, dailyLog, autoImpRunning, userSmartlinks, userLinks] = await Promise.all([
    getAutoImpressionSettings(),
    getProxySettings(),
    getProxyList(),
    getProxyStats(),
    readRoot('impression_balance'),
    readRoot('membership'),
    readRoot('hourly_impression_log'),
    readRoot('smartlink_daily_visits'),
    readRoot('auto_impression_running'),
    readRoot('user_smartlinks'),
    readRoot('user_links'),
  ]);

  const entry = ensureUserSmartlinkShape((userSmartlinks || {})[uid]);
  const links = type === 'smartlink' ? entry.links : (((userLinks || {})[uid]) || []);
  const hasKey = !!entry.api_key;
  const linkCount = Array.isArray(links) ? links.length : 0;
  const bal = Math.floor(Number((impBalance || {})[uid] || 0));
  const mem = (membership || {})[uid] || makeFreshMembership(uid);
  const remainingBursts = Math.max(0, (mem.daily_burst_limit || 0) - (mem.daily_burst_used || 0));
  const proxyReady = L.proxyReadyForTraffic({ aiSettings, proxySettings, proxies, proxyStats });
  const hourlyKey = `${uid}::${type}::${L.getHourKey()}`;
  const dailyKey = `${uid}::${type}::${L.todayStr()}`;
  const hourlyCount = Number((hourlyLog || {})[hourlyKey] || 0);
  const dailyCount = Number((dailyLog || {})[dailyKey] || 0);
  const running = !!((autoImpRunning || {})[uid] || {})[type];

  const check = L.canRunImpression({
    uid, type, impressionBalance: bal, aiSettings,
    hourlyCount, dailyCount, remainingBursts, proxyReady,
  });

  // Compose a single human reason, most-blocking first.
  let ready = true;
  let reason = 'Ready \u2014 your Adsterra account will receive impressions.';
  let blockCode = null;
  if (type === 'smartlink' && !hasKey) {
    ready = false; reason = 'Save your OWN Adsterra API key in SmartLinks.'; blockCode = 'NO_API_KEY';
  } else if (linkCount === 0) {
    ready = false;
    reason = type === 'smartlink'
      ? 'No SmartLinks yet \u2014 press Sync in SmartLinks (or Start will auto-sync).'
      : 'No normal links added yet.';
    blockCode = 'NO_LINKS';
  } else if (!check.ok) {
    ready = false; reason = check.reason; blockCode = check.code;
  }

  res.json({
    ok: true, type, ready, reason, blockCode,
    hasApiKey: hasKey,
    apiKeyMasked: hasKey ? `${String(entry.api_key).slice(0, 6)}\u2026${String(entry.api_key).slice(-4)}` : null,
    linkCount,
    impressionBalance: bal,
    running,
    proxyReady: !!(proxyReady && proxyReady.ready),
    proxyReason: (proxyReady && proxyReady.reason) || null,
    hourlyCount, dailyCount, remainingBursts,
  });
}));"""
api_text = replace_once(api_text, old_b4, new_b4, 'B4 traffic/status')
print('OK [B4] api-server.cjs GET /api/traffic/status diagnostic added')

save(API, api_text, api_crlf)
print('\nAll api-server.cjs patches written.')
print('DONE.')
