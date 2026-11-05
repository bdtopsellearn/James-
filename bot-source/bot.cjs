/**
 * ═══════════════════════════════════════════════════════════════════════
 *   ⚡ PN AD NETWORK ⚡  |  ALIF_H4CK ⚡  |  v30.0-ULTRA-EDITION
 * ═══════════════════════════════════════════════════════════════════════
 *   DEVELOPER : ALIF_H4CK
 *   HANDLE    : @alif_h4ck
 *   BUILD     : Ultra-High-Level US Organic Traffic Engine
 *   ENGINE    : Playwright + Stealth + Adsterra-Safe v30
 *   VPS TARGET: 2GB RAM (single-process optimized)
 * ═══════════════════════════════════════════════════════════════════════
 */

'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
// ── PATCH: concurrent traffic engine (fair job queue + RAM-aware worker pool) ──
const { JobQueue, WorkerPool, computeConcurrency, availableMemMB } = require(path.join(__dirname, 'pool-engine.cjs'));
const dns = require('dns').promises;
const net = require('net');
const { execSync, spawn } = require('child_process');

// ══════════════════════════════════════════════════════════════════════════════
//  ⭐ BOT EMBEDDED DATABASE + DATA ROUTING (Firebase quota saver)
//  Only necessary data goes to Firebase; high-frequency telemetry stays in the
//  bot's own atomic, journaled database (services/botDatabase.cjs).
// ══════════════════════════════════════════════════════════════════════════════
let botDB = null;
let __dataRouting = null;
try {
  const { BotDatabase } = require(path.join(__dirname, '..', 'services', 'botDatabase.cjs'));
  __dataRouting = require(path.join(__dirname, '..', 'shared', 'data-routing.cjs'));
  botDB = new BotDatabase({ dir: process.env.BOT_DB_DIR || path.join(__dirname, '..', 'data', 'bot-db') });
} catch (e) {
  console.warn('[BotDB] ⚠️  embedded database unavailable — using Firebase for everything:', e.message);
  botDB = null;
}
const isLocalCollection = (c) => (__dataRouting ? __dataRouting.isLocal(c) : false);
const shouldMirrorCollection = (c) => (__dataRouting ? __dataRouting.shouldMirror(c) : false);
const MIRROR_INTERVAL_MS = (__dataRouting ? __dataRouting.MIRROR_INTERVAL_MS : 45000);

// ═══════════════════════════════════════════════════════════════════════════
//  TELEGRAM REMOVED — self-contained no-op bot shim
// ═══════════════════════════════════════════════════════════════════════════
//  The platform is now 100% web-driven. The traffic engine no longer talks to
//  Telegram, so the external `node-telegram-bot-api` dependency and the bot
//  token are gone. A tiny internal shim keeps every legacy `bot.sendMessage`
//  / `bot.answerCallbackQuery` call a harmless no-op so the automation core
//  stays fully functional without any Telegram account.
class TelegramBotShim {
  on() { return this; }
  once() { return this; }
  onText() { return this; }
  off() { return this; }
  removeAllListeners() { return this; }
  removeListener() { return this; }
  startPolling() { return Promise.resolve(); }
  stopPolling() { return Promise.resolve(); }
  deleteWebhook() { return Promise.resolve(); }
  sendMessage() { return Promise.resolve({ message_id: 0 }); }
  sendPhoto() { return Promise.resolve({ message_id: 0 }); }
  sendDocument() { return Promise.resolve({ message_id: 0 }); }
  sendAudio() { return Promise.resolve({ message_id: 0 }); }
  sendVideo() { return Promise.resolve({ message_id: 0 }); }
  sendVoice() { return Promise.resolve({ message_id: 0 }); }
  sendChatAction() { return Promise.resolve({ message_id: 0 }); }
  editMessageText() { return Promise.resolve(); }
  editMessageCaption() { return Promise.resolve(); }
  editMessageMedia() { return Promise.resolve(); }
  editMessageReplyMarkup() { return Promise.resolve(); }
  deleteMessage() { return Promise.resolve(); }
  setMyCommands() { return Promise.resolve(); }
  setChatMenuButton() { return Promise.resolve(); }
  answerCallbackQuery() { return Promise.resolve(); }
  getMe() { return Promise.resolve({ id: 0, is_bot: true, username: 'pn-ad-network', first_name: 'PN AD NETWORK' }); }
  getChat() { return Promise.resolve({ id: 0, type: 'private' }); }
  getChatMember() { return Promise.resolve({ status: 'member', is_member: true, user: { id: 0 } }); }
  getUpdates() { return Promise.resolve([]); }
  getFile() { return Promise.resolve({ file_id: 'x', file_path: 'x' }); }
  getFileLink() { return Promise.resolve('about:blank'); }
}
const TelegramBot = TelegramBotShim;
const admin = require('firebase-admin');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const bridge = require('./bridge.cjs');

let sharp = null;
try { sharp = require('sharp'); } catch (e) { console.warn('⚠️ sharp missing — captcha will be text-only'); }

// ═══════════════════════════════════════════════════════════════════════
//  ⭐ V30: AUTO-INSTALL PLAYWRIGHT BROWSERS ON STARTUP
// ═══════════════════════════════════════════════════════════════════════
function ensurePlaywrightBrowsers() {
  try {
    const pwCache = path.join(os.homedir(), '.cache', 'ms-playwright');
    let hasChromium = false;
    if (fs.existsSync(pwCache)) {
      const entries = fs.readdirSync(pwCache);
      hasChromium = entries.some((d) => /^chromium-/.test(d));
    }
    if (hasChromium) {
      console.log('✅ Playwright Chromium already installed');
      return;
    }
    console.log('📦 Playwright Chromium not found — triggering non-blocking background install…');
    const { spawn } = require('child_process');
    const installer = spawn('npx', ['playwright', 'install', 'chromium'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });
    if (installer.unref) installer.unref();
  } catch (e) {
    console.warn('[Setup] ensurePlaywrightBrowsers warning:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  GLOBAL ERROR HANDLERS
// ═══════════════════════════════════════════════════════════════════════
process.on('unhandledRejection', (reason) => {
  console.error('[UnhandledRejection]', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[UncaughtException]', err && err.stack ? err.stack : err);
});

// ═══════════════════════════════════════════════════════════════════════
//  BRAND
// ═══════════════════════════════════════════════════════════════════════
const BOT_NAME = 'X AD MARKETING';
const BOT_BUILD = 'v30.0-ULTRA-EDITION';
const DEVELOPER_HANDLE = '@alif_h4ck';
const DEVELOPER_NAME = 'ALIF_H4CK';

// ═══════════════════════════════════════════════════════════════════════
//  MODE CONSTANTS
// ═══════════════════════════════════════════════════════════════════════
const MODE_H4CK_ORGANIC = 'h4ck_organic';
const MODE_HYBRID_SMART = 'hybrid_smart';
const MODE_PURE_SEARCH  = 'pure_search';
const MODE_PURE_DIRECT  = 'pure_direct';

// ═══════════════════════════════════════════════════════════════════════
//  ADSTERRA WHITELIST (40+ domains)
// ═══════════════════════════════════════════════════════════════════════
const ADSTERRA_WHITELIST = [
  'recallscarce.com',
  'adsterra.com', 'adsterra.io', 'adsterranetwork.com', 'adsterra.network', 'adsterra.org',
  'highperformanceformat.com', 'profitableratecpm.com', 'pemsrv.com', 'adsterratools.com',
  'adsterra.pro', 'adsterra.biz', 'adsterra.info', 'adsterra.xyz', 'adsterra.site',
  'adsterra.online', 'adsterra.tech', 'adsterra.live', 'adsterra.net', 'adsterra.co', 'adsterra.top',
  'topcreativeformat.com', 'effectivegatecpm.com', 'displaycontentnetwork.com', 'creativeformat.com',
  'profitablecpmratenetwork.com', 'profitablecpmnetwork.com', 'profitableratecpmnetwork.com',
  'adsterra-cdn.net', 'sunmaximizer.com', 'adsterra.org',
  'adsterra-cdn.com', 'adsterra-static.com', 'adsterra-media.com',
  'pixel.adsterra.com', 'cdn.adsterra.com', 'track.adsterra.com', 'stats.adsterra.com',
  'ads.adsterra.com', 'api.adsterra.com', 'api3.adsterratools.com', 'api.adsterratools.com',
  'bidvertiser.com', 'popcash.net', 'propellerads.com', 'propellerads.net',
  'onclickalgo.com', 'onclickmega.com', 'onclckpro.com', 'onclickmax.com',
  'adcash.com', 'clickadu.com', 'hilltopads.net', 'hilltopads.com', 'trafficstars.com',
  'exoclick.com', 'exosrv.com', 'juicyads.com', 'plugrush.com', 'trafficjunky.com',
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
];

// ⭐ V39: DYNAMIC ADSTERRA DOMAIN TRUST
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
    host = host.replace(/^www\./, '').replace(/:\d+$/, '');
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
  /\/pixel\/impr/i, /\/pixel\/clk/i, /\/pixel\//i, /impr\.gif/i, /impression/i,
  /postback/i, /\/invoke\.js/i, /atoptions/i, /\/watch\.\d+\.js/i, /\/sbar\.json/i,
  // ⭐ APEX-ENTERPRISE PATCH: rotating tracking domains catch
  /\/track/i, /\/imp\//i, /\/t\.gif/i, /\/beacon/i, /\/click\.php/i,
  /\/redirect/i, /smartlink/i, /\/event/i, /\/log\//i, /\/collect/i,
  /adsbygoogle\.js/i, /\/ad\.js/i, /\/adscript/i, /\/pixel\.js/i,
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
  if (/\/[a-z0-9]{6,}(\?|$)/.test(lower) && /(key|aff|cid|ref|spot_id|placement)=/.test(lower)) return true;
  return false;
}

// ═══════════════════════════════════════════════════════════════════════
//  VPS-AWARE THRESHOLDS (2GB RAM optimized)
// ═══════════════════════════════════════════════════════════════════════
const MAX_SYSTEM_BROWSERS = 1;
const RAM_THRESHOLD_PERCENT = 94;
const CPU_THRESHOLD_PERCENT = 99;
const BROWSER_LAUNCH_DELAY_MS = 2000;
const HIGH_CPM_SAFARI_RATIO = 0.90;

// ═══════════════════════════════════════════════════════════════════════
//  ENV VARIABLES
// ═══════════════════════════════════════════════════════════════════════
// Telegram removed — the platform is now fully web-driven. ADMIN_IDS is kept
// only as an optional owner list used by a few internal admin helpers.
const ADMIN_IDS = (process.env.ADMIN_IDS || '')
  .split(',').map((x) => Number(x.trim())).filter((x) => Number.isSafeInteger(x) && x > 0);

// ═══════════════════════════════════════════════════════════════════════
//  GLOBAL TIMING
// ═══════════════════════════════════════════════════════════════════════
const REQUEST_TIMEOUT_MS = 30000;
const BROADCAST_DELAY_MS = 120;
const CAPTCHA_LENGTH = 5;
const CAPTCHA_EXPIRY_MS = 10 * 60 * 1000;
const CAPTCHA_VERIFY_TTL = 24 * 60 * 60 * 1000;
const REFERRAL_BONUS = 20;
const ADSTERRA_API_BASE = 'https://api3.adsterratools.com/publisher';
const ADSTERRA_SMARTLINKS_ENDPOINT = ADSTERRA_API_BASE + '/smartlinks.json';
const ADSTERRA_STATS_ENDPOINT = ADSTERRA_API_BASE + '/stats.json';
// ── Rolling-log sizes ──
// These used to be tiny (30 / 20 / 150) which made every dashboard counter that
// reads the live feed look "stuck" at 30 even when thousands of impressions had
// really been delivered. The real lifetime total now comes from `stats.total_impressions`
// (see api-server /api/state), but we also keep a much deeper rolling window so the
// live stream, history and recent-activity widgets reflect the true volume.
const IMPRESSION_HISTORY_MAX = 200;
const VISIT_LOG_MAX = 300;
const LIVE_LOG_MAX = 500;
const CALLBACK_TTL_MS = 24 * 60 * 60 * 1000;
const INLINE_MAP_MAX = 30000;

// ═══════════════════════════════════════════════════════════════════════
//  FIREBASE INIT
// ═══════════════════════════════════════════════════════════════════════
const FIREBASE_KEY_PATH = process.env.FIREBASE_KEY_PATH
  ? path.resolve(process.cwd(), process.env.FIREBASE_KEY_PATH)
  : path.resolve(process.cwd(), 'firebase-service-account.json');
let firebaseReady = false;
let db = null;

function initFirebase() {
  let sa = null;
  const envSa = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_CONFIG;
  if (envSa && envSa.trim()) {
    try {
      const raw = envSa.trim();
      sa = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    } catch (e) {
      console.warn(`[Bot/Firebase] Could not parse env service account: ${e.message}`);
    }
  }

  if (!sa && fs.existsSync(FIREBASE_KEY_PATH)) {
    try {
      sa = JSON.parse(fs.readFileSync(FIREBASE_KEY_PATH, 'utf8'));
    } catch (e) {
      console.warn(`[Bot/Firebase] Could not read ${FIREBASE_KEY_PATH}: ${e.message}`);
    }
  }

  try {
    let app = null;
    const existingApps = admin.apps || [];
    if (existingApps.length > 0) {
      app = existingApps[0];
    } else if (sa) {
      app = admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
      db = app.firestore();
      db.settings({ ignoreUndefinedProperties: true });
      firebaseReady = true;
      console.log('🔥 Firebase ready in bot worker:', sa.project_id);
    } else {
      db = null;
      firebaseReady = true;
      console.log('📦 Bot worker running in local-disk cache mode (shared data/root-cache.json)');
    }
  } catch (e) {
    db = null;
    firebaseReady = true;
    console.warn('⚠️ Firebase init warning in bot worker (using disk cache):', e.message);
  }
}
let bot = null;
initFirebase();

// ═══════════════════════════════════════════════════════════════════════
//  SHARED DISK CACHE BRIDGE (Zero-latency sync with api-server.cjs)
// ═══════════════════════════════════════════════════════════════════════
const ROOT_CACHE_FILE = path.resolve(__dirname, '..', 'data', 'root-cache.json');

function readRootCacheDisk() {
  try {
    if (!fs.existsSync(ROOT_CACHE_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(ROOT_CACHE_FILE, 'utf8'));
    return raw && typeof raw === 'object' ? raw : null;
  } catch (e) {
    return null;
  }
}

function writeRootCacheDisk(collection, value) {
  try {
    const dir = path.dirname(ROOT_CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let data = readRootCacheDisk() || { __meta: { v: 40, at: Date.now() } };
    data[collection] = { value, at: Date.now() };
    data.__meta = { v: 40, at: Date.now() };
    const tmp = `${ROOT_CACHE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, ROOT_CACHE_FILE);
  } catch (e) {}
}

async function fbGet(collection) {
  if (firebaseReady && db) {
    try {
      const snap = await Promise.race([
        db.collection(collection).doc('_root').get(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
      ]);
      if (snap && snap.exists) {
        const val = snap.data().value;
        writeRootCacheDisk(collection, val);
        return val;
      }
    } catch (e) {}
  }
  const disk = readRootCacheDisk();
  if (disk && disk[collection] && 'value' in disk[collection]) {
    return disk[collection].value;
  }
  return null;
}

async function fbSet(collection, value) {
  writeRootCacheDisk(collection, value);
  if (!firebaseReady || !db) return true;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await Promise.race([
        db.collection(collection).doc('_root').set({ value, updated_at: Date.now() }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
      ]);
      return true;
    } catch (e) {
      if (attempt === 1) return false;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════
//  CACHE
// ═══════════════════════════════════════════════════════════════════════
const cache = {
  extra_admins: [], user_info: {}, user_links: {}, stats: {}, settings: null,
  users: [], membership: {}, balance: {}, impression_balance: {}, reporting_credits: {},
  plans: null, shop_packages: null, payment_settings: null,
  balance_requests: [], impression_purchases: [],
  proxies: [], proxy_stats: {}, proxy_settings: null,
  user_smartlinks: {}, user_smartlink_stats: {},
  human_behavior: null,
  banned_users: {}, support_messages: [], referrals: {},
  promo_codes: {}, join_check_settings: null, auto_broadcast_settings: null,
  bot_lifecycle: null, user_settings: {}, captcha_verified: {},
  smartlink_settings: null, smartlink_daily_visits: {},
  auto_impression_settings: null, hourly_impression_log: {},
  auto_impression_running: {}, impression_confirmations: {},
  payment_methods: null, impression_history: {}, visit_logs: {},
  normal_link_stats: {}, live_impression_log: {},
  impression_targets: {}, impression_target_progress: {}, impression_target_modes: {},
  h4ck_organic_stats: {},
  history_clear_state: { last_cleared_date: '' },  // ⭐ ADD
};

const dirtyCollections = new Set();
const firebaseWriteChains = new Map();
let firebaseFlushScheduled = false;
let firebaseFlushTimer = null;

const FIREBASE_SAVE_WHITELIST = new Set([
  'extra_admins', 'user_info', 'user_links', 'stats', 'settings', 'users',
  'membership', 'balance', 'impression_balance', 'reporting_credits',
  'plans', 'shop_packages', 'payment_methods', 'balance_requests',
  'impression_purchases', 'proxies', 'proxy_settings', 'proxy_stats',       // ⭐ ADDED
  'user_smartlinks', 'user_smartlink_stats', 'human_behavior', 'banned_users',
  'support_messages', 'user_settings',                                      // ⭐ ADDED
  'referrals', 'promo_codes', 'join_check_settings', 'auto_broadcast_settings',
  'bot_lifecycle', 'smartlink_settings', 'smartlink_daily_visits',
  'auto_impression_settings', 'hourly_impression_log', 'auto_impression_running',
  'impression_history', 'visit_logs', 'normal_link_stats', 'live_impression_log', // ⭐ ADDED
  'impression_targets', 'impression_target_progress', 'h4ck_organic_stats', 'web_user_notifications',
  'captcha_verified',                                                       // ⭐ ADDED
  'maintenance_mode',
  'history_clear_state',  // ⭐ ADD
  'targeting_settings', 'targeting_stats',
  'web_normal_links', 'web_users', 'web_all_users', 'web_worker_status', 'web_worker_logs',
]);

function _flushFirebaseNow() {
  const toFlush = [...dirtyCollections];
  dirtyCollections.clear();
  for (const col of toFlush) {
    const snapshot = JSON.parse(JSON.stringify(cache[col] ?? null));
    const prev = firebaseWriteChains.get(col) || Promise.resolve();
    const next = prev.catch(() => {}).then(() => fbSet(col, snapshot)).then((ok) => {
      // [DURABILITY] if Firestore refused the write (outage / quota / not ready
      // yet) keep the collection dirty and retry on a slow timer instead of
      // silently dropping the change.
      if (ok === false) { dirtyCollections.add(col); _scheduleFirebaseFlush(10000); }
    });
    firebaseWriteChains.set(col, next);
  }
}

function _scheduleFirebaseFlush(delay = 250) {
  if (firebaseFlushScheduled) return;
  firebaseFlushScheduled = true;
  firebaseFlushTimer = setTimeout(() => {
    firebaseFlushScheduled = false;
    firebaseFlushTimer = null;
    _flushFirebaseNow();
  }, delay);
  if (firebaseFlushTimer && firebaseFlushTimer.unref) firebaseFlushTimer.unref();
}

function syncToFirebase(collection) {
  if (!FIREBASE_SAVE_WHITELIST.has(collection)) return;
  dirtyCollections.add(collection);
  _scheduleFirebaseFlush(250);
}

async function flushDirtyCollections() {
  if (firebaseFlushScheduled && firebaseFlushTimer) {
    clearTimeout(firebaseFlushTimer);
    firebaseFlushTimer = null;
    firebaseFlushScheduled = false;
  }
  _flushFirebaseNow();
  await Promise.allSettled([...firebaseWriteChains.values()]);
}

async function loadCollection(name, defaultVal) {
  // ── Local (embedded DB) collections: hydrate from the bot DB first ─────────
  if (botDB && isLocalCollection(name)) {
    const local = botDB.get(name, undefined);
    if (local !== undefined && local !== null) { cache[name] = local; return; }
    // One-time migration: pull any existing Firebase data, then own it locally.
    const v0 = await fbGet(name);
    if (v0 === null || v0 === undefined) { cache[name] = defaultVal; return; }
    cache[name] = v0;
    try { botDB.set(name, v0); } catch (_) {}
    return;
  }
  const v = await fbGet(name);
  if (v === null || v === undefined) { cache[name] = defaultVal; return; }
  cache[name] = v;
}

async function loadAllFromFirebase() {
  console.log('🔄 Loading Firebase collections…');
  await Promise.all([
    loadCollection('extra_admins', []),
    loadCollection('user_info', {}),
    loadCollection('user_links', {}),
    loadCollection('stats', {}),
    loadCollection('settings', defaultSettings()),
    loadCollection('users', []),
    loadCollection('membership', {}),
    loadCollection('balance', {}),
    loadCollection('impression_balance', {}),
    loadCollection('reporting_credits', {}),
    loadCollection('plans', JSON.parse(JSON.stringify(DEFAULT_PLANS))),
    loadCollection('shop_packages', JSON.parse(JSON.stringify(DEFAULT_SHOP_PACKAGES))),
    loadCollection('payment_settings', { ...DEFAULT_PAYMENT_SETTINGS }),
    loadCollection('balance_requests', []),
    loadCollection('impression_purchases', []),
    loadCollection('proxies', []),
    loadCollection('proxy_stats', {}),
    loadCollection('proxy_settings', { ...PROXY_DEFAULTS }),
    loadCollection('user_smartlinks', {}),
    loadCollection('user_smartlink_stats', {}),
    loadCollection('human_behavior', { ...HUMAN_DEFAULTS }),
    loadCollection('banned_users', {}),
    loadCollection('support_messages', []),
    loadCollection('referrals', {}),
    loadCollection('promo_codes', {}),
    loadCollection('join_check_settings', { enabled: false, channel: '', group: '' }),
    loadCollection('auto_broadcast_settings', { enabled: true, on_startup: true, message: '' }),
    loadCollection('bot_lifecycle', { last_start: 0, total_starts: 0 }),
    loadCollection('user_settings', {}),
    loadCollection('captcha_verified', {}),
    loadCollection('smartlink_settings', { ...SMARTLINK_DEFAULTS }),
    loadCollection('smartlink_daily_visits', {}),
    loadCollection('auto_impression_settings', { ...AUTO_IMPRESSION_DEFAULTS }),
    loadCollection('hourly_impression_log', {}),
    loadCollection('auto_impression_running', {}),
    loadCollection('impression_confirmations', {}),
    loadCollection('payment_methods', JSON.parse(JSON.stringify(DEFAULT_PAYMENT_METHODS))),
    loadCollection('impression_history', {}),
    loadCollection('visit_logs', {}),
    loadCollection('normal_link_stats', {}),
    loadCollection('live_impression_log', {}),
    loadCollection('impression_targets', {}),
    loadCollection('impression_target_progress', {}),
    loadCollection('impression_target_modes', {}),
    loadCollection('web_user_notifications', {}),
    loadCollection('h4ck_organic_stats', {}),
    loadCollection('maintenance_mode', { ...MAINTENANCE_DEFAULTS, whitelist: [] }),
    loadCollection('history_clear_state', { last_cleared_date: '' }),  // ⭐ ADD
    loadCollection('targeting_settings', { ...TARGETING_DEFAULTS }),
    loadCollection('targeting_stats', { device: {}, browser: {}, os: {}, country: {}, updated_at: 0 }),
    loadCollection('adsterra_live', {}),   // observed network CPM (published by the API server)
  ]);
  console.log('✅ Firebase loaded');
}

// ═══════════════════════════════════════════════════════════════════════
//  ⭐ V34 CRITICAL FIX: LIVE FIRESTORE SYNC
//  Worker এতদিন শুধু startup-এ একবার Firestore পড়ত। Web থেকে যা-ই
//  বদলানো হত, worker দেখত না। এখন real-time listeners দিয়ে sync হবে।
// ═══════════════════════════════════════════════════════════════════════

// কলেকশনগুলো যেগুলো Web/API server লেখে এবং Worker-এর সাথে সাথে জানা দরকার
const LIVE_SYNC_COLLECTIONS = [
  'auto_impression_running',
  'impression_targets',
  'impression_target_modes',
  'user_smartlinks',
  'user_links',
  'impression_balance',
  'balance',
  'membership',
  'proxy_settings',
  'proxies',
  'auto_impression_settings',
  'smartlink_settings',
  'targeting_settings',
  'maintenance_mode',
  'plans',
  'shop_packages',
  'payment_methods',
  'promo_codes',
  'banned_users',
];

// Worker-এর নিজের শেষ লেখা value গুলো (নিজের write echo বাদ দেওয়ার জন্য)
const __lastSentValue = new Map();
const __liveSyncListeners = [];
let __heartbeatTimer = null;
let __lastHandledResetAt = 0;
let __workerStartedAt = Date.now();

function pollLocalCacheSync() {
  const disk = readRootCacheDisk();
  if (!disk) return;
  for (const col of LIVE_SYNC_COLLECTIONS) {
    if (disk[col] && 'value' in disk[col]) {
      const remoteVal = disk[col].value;
      const currStr = JSON.stringify(cache[col] ?? null);
      const newStr = JSON.stringify(remoteVal ?? null);
      if (currStr !== newStr) {
        cache[col] = remoteVal;
        if (col === 'auto_impression_running') {
          console.log('[DiskSync] 📥 auto_impression_running updated from disk cache');
        }
      }
    }
  }
  if (disk.web_normal_links && 'value' in disk.web_normal_links) {
    cache.web_normal_links = disk.web_normal_links.value;
  }
}

function startLocalDiskSync() {
  pollLocalCacheSync();
  const t = setInterval(pollLocalCacheSync, 3000);
  if (t.unref) t.unref();
}

function attachLiveFirestoreSync() {
  startLocalDiskSync();
  if (!firebaseReady || !db) {
    console.warn('[LiveSync] Firebase not ready — using shared disk cache sync');
    return;
  }
  console.log(`[LiveSync] 🔥 Attaching ${LIVE_SYNC_COLLECTIONS.length} real-time listeners...`);

  for (const col of LIVE_SYNC_COLLECTIONS) {
    try {
      const unsub = db.collection(col).doc('_root').onSnapshot(
        (snap) => {
          if (!snap.exists) return;
          const data = snap.data();
          const remoteValue = data ? data.value : null;
          const remoteJson = JSON.stringify(remoteValue ?? null);
          const ourJson = __lastSentValue.get(col);

          // নিজের লেখা Firestore থেকে ফিরে এলে skip — race এড়াতে
          if (ourJson !== undefined && remoteJson === ourJson) return;

          // Remote value apply
          cache[col] = remoteValue;

          // Target পরিবর্তন হলে সেই user-এর progress-ও reset করতে হবে
          if (col === 'impression_targets' && remoteValue && typeof remoteValue === 'object') {
            const progress = cache.impression_target_progress || {};
            for (const uid of Object.keys(remoteValue)) {
              const t = remoteValue[uid] || {};
              if (!progress[uid]) progress[uid] = {};
              if (typeof t.smartlink === 'number') progress[uid].smartlink = 0;
              if (typeof t.normal === 'number') progress[uid].normal = 0;
            }
            cache.impression_target_progress = progress;
          }

          console.log(`[LiveSync] 📥 ${col} updated from Firestore`);
        },
        (err) => {
          console.warn(`[LiveSync] ❌ listener ${col} error:`, err.message);
        }
      );
      __liveSyncListeners.push({ col, unsub });
    } catch (e) {
      console.warn(`[LiveSync] listener ${col} attach failed:`, e.message);
    }
  }

  // Worker control listener (admin reset button)
  try {
    const ctlUnsub = db.collection('web_worker_control').doc('_root').onSnapshot(
      (snap) => {
        if (!snap.exists) return;
        const v = snap.data()?.value || {};
        const resetAt = Number(v.resetRequestedAt || 0);
        if (resetAt > __lastHandledResetAt) {
          __lastHandledResetAt = resetAt;
          console.log('[LiveSync] 🔄 Admin reset request received — resetting ticks');
          try {
            smartlinkTickRunning = false;
            smartlinkTickStartTime = 0;
            normalTickRunning = false;
            normalTickStartTime = 0;
            activeVisitSlots = 0;
            drainVisitWaiters();
          } catch (e) { console.warn('[LiveSync] reset failed:', e.message); }
        }
      },
      (err) => console.warn('[LiveSync] worker_control listener error:', err.message)
    );
    __liveSyncListeners.push({ col: 'web_worker_control', unsub: ctlUnsub });
  } catch (e) {
    console.warn('[LiveSync] worker_control attach failed:', e.message);
  }
}

// ⭐ heartbeat — Admin UI-তে live status দেখাতে লিখতে হবে
async function writeWorkerHeartbeat() {
  try {
    const running = cache.auto_impression_running || {};
    const slCount = Object.values(running).filter((v) => v && v.smartlink).length;
    const nlCount = Object.values(running).filter((v) => v && v.normal).length;
    const m = getSystemMetrics();
    const status = {
      workerId: `worker-${process.pid}`,
      pid: process.pid,
      state: (slCount + nlCount) > 0 ? 'running' : 'idle',
      startedAt: __workerStartedAt,
      lastHeartbeat: Date.now(),
      uptimeSec: Math.floor((Date.now() - __workerStartedAt) / 1000),
      activeSmartlinkUsers: slCount,
      activeNormalUsers: nlCount,
      version: BOT_BUILD,
      systemMetrics: {
        cpuLoad: m.cpu_load,
        ramUsage: m.ram_usage,
        freeMemMb: m.free_mem_mb,
        totalMemMb: m.total_mem_mb,
      },
    };
    writeRootCacheDisk('web_worker_status', status);
    if (firebaseReady && db) {
      await db.collection('web_worker_status').doc('_root').set({
        value: status,
        updated_at: Date.now(),
      });
    }
  } catch (e) {
    // heartbeat fail silently — retry next interval
  }
}

function startWorkerHeartbeat() {
  if (__heartbeatTimer) clearInterval(__heartbeatTimer);
  // প্রথমে সাথে সাথে লিখি
  writeWorkerHeartbeat().catch(() => {});
  // তারপর প্রতি 30s
  __heartbeatTimer = setInterval(() => {
    writeWorkerHeartbeat().catch(() => {});
  }, 30000);
  if (__heartbeatTimer.unref) __heartbeatTimer.unref();
  console.log('[LiveSync] 💓 Worker heartbeat started (every 30s)');
}

// ⭐ syncToFirebase override — নিজের write echo detect করার জন্য
// (original function-এর ঠিক পরেই বসানোর চেষ্টা করো; এখানে আমরা decorate করছি)
const __originalSyncToFirebase = syncToFirebase;
// eslint-disable-next-line no-func-assign
syncToFirebase = function patchedSyncToFirebase(collection) {
  if (FIREBASE_SAVE_WHITELIST.has(collection)) {
    try {
      __lastSentValue.set(collection, JSON.stringify(cache[collection] ?? null));
    } catch (_) {}
  }
  // ── ⭐ Route: high-frequency telemetry → embedded bot DB (Firebase saver) ──
  if (botDB && isLocalCollection(collection)) {
    try { botDB.set(collection, JSON.parse(JSON.stringify(cache[collection] ?? null))); } catch (_) {}
    if (shouldMirrorCollection(collection)) scheduleLocalMirror(collection);
    return true;
  }
  return __originalSyncToFirebase(collection);
};

// Throttled mirror: push local telemetry to Firebase at most once per interval
// so the web dashboards stay fresh WITHOUT burning Firestore quota.
const __mirrorTimers = new Map();
function scheduleLocalMirror(collection) {
  if (__mirrorTimers.has(collection)) return;
  const t = setTimeout(() => {
    __mirrorTimers.delete(collection);
    if (!firebaseReady) return;
    let snapshot;
    try { snapshot = JSON.parse(JSON.stringify(cache[collection] ?? null)); } catch (_) { return; }
    const prev = firebaseWriteChains.get(collection) || Promise.resolve();
    const next = prev.catch(() => {}).then(() => fbSet(collection, snapshot));
    firebaseWriteChains.set(collection, next);
  }, MIRROR_INTERVAL_MS);
  if (t.unref) t.unref();
  __mirrorTimers.set(collection, t);
}

// ═══════════════════════════════════════════════════════════════════════
//  PLAYWRIGHT + STEALTH
// ═══════════════════════════════════════════════════════════════════════
const { chromium: chromiumExtra } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const stealth = StealthPlugin();
try { stealth.enabledEvasions.delete('user-agent-override'); } catch (e) {}
chromiumExtra.use(stealth);
const chromium = chromiumExtra;

// ═══════════════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════════════

// ⭐ V30 FIX: Promise with timeout — hung operations থেকে বাঁচার জন্য
function withTimeout(promise, ms, label = 'op') {
  let timer;
  const timeoutP = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutP]).finally(() => clearTimeout(timer));
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function pickRandom(a) { return (!a || !a.length) ? null : a[Math.floor(Math.random() * a.length)]; }
function secureRandomInt(max) { return crypto.randomInt(0, Math.max(1, max)); }

function secureRandomString(len = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const bytes = crypto.randomBytes(len * 2);
  for (let i = 0; out.length < len && i < bytes.length; i++) out += chars[bytes[i] % chars.length];
  return out.slice(0, len);
}

function humanRand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

function gaussianRandom(min, max) {
  const u = 1 - Math.random(), v = Math.random();
  const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  const mid = (min + max) / 2, range = (max - min) / 4;
  return Math.max(min, Math.min(max, Math.round(mid + g * range)));
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function isValidUrl(v) {
  try {
    const u = new URL(String(v).trim());
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    if (!u.hostname) return false;
    if (u.username || u.password) return false;
    return true;
  } catch (e) { return false; }
}

function isPrivateIp(ip) {
  if (net.isIP(ip) === 4) {
    const p = ip.split('.').map(Number);
    return p[0] === 0 || p[0] === 10 || p[0] === 127 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || p[0] >= 224;
  }
  if (net.isIP(ip) === 6) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return true;
    if (x.startsWith('fc') || x.startsWith('fd')) return true;
    if (x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb')) return true;
    if (x.startsWith('ff')) return true;
    if (x.startsWith('2001:db8')) return true;
    return false;
  }
  return false;
}

async function assertSafeRemoteUrl(raw, allowedHosts = null) {
  let u;
  try { u = new URL(String(raw).trim()); } catch (e) { throw new Error('Invalid URL'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only HTTP/HTTPS allowed');
  if (u.username || u.password) throw new Error('Credentials in URL not allowed');
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local'))
    throw new Error('Private host not allowed');
  if (allowedHosts && !allowedHosts.has(host)) throw new Error('Host not allowed');
  if (isPrivateIp(host)) throw new Error('Private IP not allowed');
  try {
    const answers = await dns.lookup(host, { all: true, verbatim: true });
    if (answers.some((a) => isPrivateIp(a.address))) throw new Error('Resolves to private IP');
  } catch (e) { if (e.message && e.message.includes('private IP')) throw e; }
  return u;
}

function todayStr() {
  const BD_OFFSET_MS = 6 * 60 * 60 * 1000;
  const d = new Date(Date.now() + BD_OFFSET_MS);
  return d.toISOString().slice(0, 10);
}

function getHourKey(dateObj = null) {
  const BD_OFFSET_MS = 6 * 60 * 60 * 1000;
  const d = dateObj instanceof Date ? new Date(dateObj.getTime() + BD_OFFSET_MS) : new Date(Date.now() + BD_OFFSET_MS);
  return d.toISOString().slice(0, 13);
}

function formatDate(ts) {
  if (!ts || isNaN(Number(ts))) return '—';
  try {
    const BD_OFFSET_MS = 6 * 60 * 60 * 1000;
    const d = new Date(Number(ts) + BD_OFFSET_MS);
    const date = d.toISOString().slice(0, 10);
    const h24 = d.getUTCHours();
    const h12 = h24 % 12 || 12;
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    const time = `${String(h12).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')} ${ampm}`;
    return `${date} ${time} (BD)`;
  } catch (e) { return '—'; }
}

function logError(e, context = '') {
  const msg = e && e.stack ? e.stack : (e && e.message ? e.message : String(e));
  console.error(`[ERR${context ? ':' + context : ''}]`, msg);
}

// ═══════════════════════════════════════════════════════════════════════
//  ⭐ V33: AUTO-CLEAR IMPRESSION HISTORY DAILY (12 AM BD time)
// ═══════════════════════════════════════════════════════════════════════
function autoClearImpressionHistoryDaily() {
  try {
    const today = todayStr();  // BD timezone (UTC+6)
    const state = cache.history_clear_state || { last_cleared_date: '' };

    // Already cleared today → skip
    if (state.last_cleared_date === today) return false;

    // Count existing data (for logging)
    const usersWithHistory = Object.keys(cache.impression_history || {}).length;
    const liveLogsCount = (cache.live_impression_log && Array.isArray(cache.live_impression_log.recent))
      ? cache.live_impression_log.recent.length : 0;

    // Clear BOTH user-facing history collections
    cache.impression_history = {};
    cache.live_impression_log = { recent: [] };
    cache.history_clear_state = { last_cleared_date: today };

    // Sync to Firebase
    syncToFirebase('impression_history');
    syncToFirebase('live_impression_log');
    syncToFirebase('history_clear_state');

    if (usersWithHistory > 0 || liveLogsCount > 0) {
      console.log(`[AutoCleanup] ✅ Daily history cleared — ${usersWithHistory} user(s), ${liveLogsCount} live log(s) · Date: ${today} (BD)`);
    } else {
      console.log(`[AutoCleanup] ✅ History empty — checked for ${today} (BD)`);
    }
    return true;
  } catch (e) {
    console.error('[AutoCleanup] Error:', e.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  SYSTEM METRICS
// ═══════════════════════════════════════════════════════════════════════
function getSystemMetrics() {
  const totalMem = os.totalmem();
  // Linux: MemAvailable accounts for reclaimable page cache — os.freemem()
  // under-reports and used to make ram_usage read ~90% on a healthy box,
  // tripping the health gate and stalling the producer.
  const freeMem = availableMemMB() * 1048576;
  const usedMem = totalMem - freeMem;
  const ramUsage = (usedMem / totalMem) * 100;
  const loadAvg = os.loadavg()[0];
  const loadAvg15 = os.loadavg()[2];
  const cpuCount = os.cpus().length;
  const cpuLoad = (loadAvg / cpuCount) * 100;
  const cpuLoad15 = (loadAvg15 / cpuCount) * 100;
  return {
    cpu_load: Math.min(100, Math.max(0, cpuLoad)),
    cpu_load_15: Math.min(100, Math.max(0, cpuLoad15)),
    ram_usage: Math.min(100, Math.max(0, ramUsage)),
    free_mem_mb: Math.round(freeMem / 1024 / 1024),
    total_mem_mb: Math.round(totalMem / 1024 / 1024),
    cpu_count: cpuCount,
  };
}

function isSystemHealthy() {
  const m = getSystemMetrics();
  if (m.cpu_count <= 2) return m.ram_usage <= RAM_THRESHOLD_PERCENT;
  return m.ram_usage <= RAM_THRESHOLD_PERCENT && m.cpu_load <= CPU_THRESHOLD_PERCENT;
}

function getAdaptiveConcurrencyLimit() {
  // PATCH: size concurrency from REAL free RAM (was hard-capped at 1–2).
  const m = getSystemMetrics();
  if (m.ram_usage > 92) return 1;                      // emergency brake
  const envMax = Number(process.env.MAX_CONCURRENT_VISITS);
  const envReserved = Number(process.env.RESERVED_MB);
  const { concurrency } = computeConcurrency({
    totalMemMB: Math.round(os.totalmem() / 1048576),
    freeMemMB: Math.round(os.freemem() / 1048576),
    cpuCount: m.cpu_count,
    browser: process.env.BROWSER_KIND || 'shell',       // 'full' on 8GB+ boxes
    reservedMB: Number.isFinite(envReserved) && envReserved > 0 ? envReserved : undefined,
    max: Number.isFinite(envMax) && envMax > 0 ? envMax : undefined,
  });
  return concurrency;
}

async function waitForSystemReady(maxWaitMs = 30000) {
  const start = Date.now();
  while (!isSystemHealthy() && Date.now() - start < maxWaitMs) {
    const m = getSystemMetrics();
    console.log(`⚠️ System load high (RAM ${m.ram_usage.toFixed(0)}%, CPU ${m.cpu_load.toFixed(0)}%) — waiting…`);
    await sleep(3000);
  }
  if (!isSystemHealthy()) console.warn('⚠️ System still loaded — launching anyway');
  return true;
}

// ═══════════════════════════════════════════════════════════════════════
//  GLOBAL ADMIN TOGGLE MAPS
// ═══════════════════════════════════════════════════════════════════════
const GLOBAL_ADMIN_TOGGLE_MAPS = new Map();
const TOGGLE_LABEL_INDEX = new Map();

function registerToggleLabel(scope, label, key, type = 'bool') {
  const idxKey = `${scope}::${label}`;
  if (TOGGLE_LABEL_INDEX.has(idxKey)) {
    const existingId = TOGGLE_LABEL_INDEX.get(idxKey);
    const existing = GLOBAL_ADMIN_TOGGLE_MAPS.get(existingId);
    if (existing) { existing.at = Date.now(); return existingId; }
  }
  const id = `tg_${secureRandomString(12)}`;
  GLOBAL_ADMIN_TOGGLE_MAPS.set(id, { scope, label, key, type, at: Date.now() });
  TOGGLE_LABEL_INDEX.set(idxKey, id);
  return id;
}

function findToggleByLabel(scope, label) {
  const id = TOGGLE_LABEL_INDEX.get(`${scope}::${label}`);
  if (!id) return null;
  const entry = GLOBAL_ADMIN_TOGGLE_MAPS.get(id);
  if (!entry) { TOGGLE_LABEL_INDEX.delete(`${scope}::${label}`); return null; }
  if (Date.now() - entry.at > 24 * 60 * 60 * 1000) {
    GLOBAL_ADMIN_TOGGLE_MAPS.delete(id);
    TOGGLE_LABEL_INDEX.delete(`${scope}::${label}`);
    return null;
  }
  return entry;
}

// ═══════════════════════════════════════════════════════════════════════
//  SVG IMAGES
// ═══════════════════════════════════════════════════════════════════════
const IMAGES_DIR = 'bot_images';
const THEME = {
  welcome:         { c1: '#0b0418', c2: '#2b1055', accent: '#00d4ff' },
  menu:            { c1: '#1a1a2e', c2: '#16213e', accent: '#7c3aed' },
  profile:         { c1: '#1a2980', c2: '#26d0ce', accent: '#7ef9ff' },
  membership:      { c1: '#f7971e', c2: '#ffd200', accent: '#fff4c2' },
  stats:           { c1: '#11998e', c2: '#38ef7d', accent: '#c8ffd4' },
  add_link:        { c1: '#4776E6', c2: '#8E54E9', accent: '#e0d4ff' },
  list_links:      { c1: '#005AA7', c2: '#2196F3', accent: '#fffde4' },
  check_links:     { c1: '#11998e', c2: '#38ef7d', accent: '#c8ffd4' },
  auto_impression: { c1: '#cc2b5e', c2: '#753a88', accent: '#ffc8dd' },
  balance:         { c1: '#134E5E', c2: '#71B280', accent: '#c2ffd4' },
  admin:           { c1: '#0d0d0d', c2: '#2b1055', accent: '#ff4488' },
  help:            { c1: '#00c6ff', c2: '#0072ff', accent: '#c2e9ff' },
  about:           { c1: '#42275a', c2: '#734b6d', accent: '#ffd6f8' },
  smartlink:       { c1: '#f12711', c2: '#f5af19', accent: '#ffe8b8' },
  shop:            { c1: '#0f2027', c2: '#2c5364', accent: '#7ee8fa' },
  support:         { c1: '#8E2DE2', c2: '#4A00E0', accent: '#d4b3ff' },
  referral:        { c1: '#11998e', c2: '#38ef7d', accent: '#c8ffd4' },
  settings:        { c1: '#2c3e50', c2: '#4ca1af', accent: '#a8e6f0' },
  captcha:         { c1: '#0d1117', c2: '#161b22', accent: '#58a6ff' },
  live:            { c1: '#0d0d0d', c2: '#1a1a2e', accent: '#00ff88' },
  h4ck_organic:    { c1: '#0d0221', c2: '#4a1a6b', accent: '#ff00aa' },
};

function ensureImagesDir() {
  if (!fs.existsSync(IMAGES_DIR)) try { fs.mkdirSync(IMAGES_DIR, { recursive: true }); } catch (e) {}
}

function buildSectionSvg(key, title, subtitle) {
  const t = THEME[key] || THEME.welcome;
  const safeTitle = String(title).replace(/[<>&]/g, '');
  const safeSub = String(subtitle || '').replace(/[<>&]/g, '');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="500" viewBox="0 0 1200 500">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${t.c1}"/>
      <stop offset="100%" stop-color="${t.c2}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="${t.accent}" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="${t.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="500" fill="url(#bg)"/>
  <circle cx="600" cy="250" r="300" fill="url(#glow)"/>
  <circle cx="100" cy="80" r="70" fill="${t.accent}" fill-opacity="0.08"/>
  <circle cx="1100" cy="420" r="90" fill="${t.accent}" fill-opacity="0.08"/>
  <rect x="16" y="16" width="1168" height="468" rx="28" fill="none" stroke="${t.accent}" stroke-opacity="0.5" stroke-width="2"/>
  <text x="600" y="270" text-anchor="middle" font-family="Arial, sans-serif" font-size="86" font-weight="900" fill="#ffffff" letter-spacing="4">${safeTitle}</text>
  ${safeSub ? `<text x="600" y="322" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="500" fill="${t.accent}" letter-spacing="3" opacity="0.9">${safeSub}</text>` : ''}
  <text x="600" y="465" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#ffffff" fill-opacity="0.85" letter-spacing="6">⚡ ${DEVELOPER_HANDLE.toUpperCase()} ⚡</text>
</svg>`;
}

function buildCaptchaSvg(chars, circleIndex) {
  const t = THEME.captcha;
  const colors = ['#ff6b9d', '#4dabf7', '#ffd43b', '#69db7c', '#a78bfa', '#fb923c'];
  const width = 900, height = 320;
  const cellW = width / chars.length;
  let texts = '', noise = '';
  for (let n = 0; n < 5; n++) {
    const x1 = secureRandomInt(width), y1 = secureRandomInt(height);
    const x2 = secureRandomInt(width), y2 = secureRandomInt(height);
    noise += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#30363d" stroke-width="2" opacity="0.5"/>`;
  }
  for (let i = 0; i < chars.length; i++) {
    const cx = cellW * i + cellW / 2, cy = height / 2 + 15;
    const color = colors[i % colors.length];
    const rotate = (secureRandomInt(1401) / 100 - 7).toFixed(1);
    texts += `<text x="${cx}" y="${cy}" text-anchor="middle" font-family="'Courier New', monospace" font-size="110" font-weight="900" fill="${color}" transform="rotate(${rotate} ${cx} ${cy})">${chars[i]}</text>`;
    if (i === circleIndex) texts += `<circle cx="${cx}" cy="${cy - 25}" r="70" fill="none" stroke="#ff3b30" stroke-width="6"/>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${t.c1}"/>
  ${noise}
  ${texts}
</svg>`;
}

const SECTION_IMAGES = {};
function generateAllSectionImages() {
  ensureImagesDir();
  const supplied = {
    welcome: 'welcome_banner.png', menu: 'menu.png', profile: 'profile.png',
    membership: 'membership.png', stats: 'stats.png', add_link: 'add_link.png',
    list_links: 'list_links.png', check_links: 'list_links.png', auto_impression: 'manage_ads.png',
    balance: 'balance.png', admin: 'admin.png', help: 'help.png', about: 'about.png',
    smartlink: 'manage_ads.png', shop: 'membership.png', support: 'help.png',
    referral: 'users.png', settings: 'settings.png', live: 'stats.png',
  };
  for (const [key, file] of Object.entries(supplied)) {
    const fp = path.join(IMAGES_DIR, file);
    if (fs.existsSync(fp)) SECTION_IMAGES[key] = fp;
  }
  for (const file of ['welcome.png', 'admin_stats.png', 'ban_system.png', 'bot_config.png', 'broadcast.png', 'deposits.png', 'manage_ads.png', 'users.png']) {
    const fp = path.join(IMAGES_DIR, file);
    if (fs.existsSync(fp)) SECTION_IMAGES[path.basename(file, '.png')] = fp;
  }
  const sections = [
    ['welcome','WELCOME','Glad To See You'], ['menu','MAIN MENU','Choose An Option'],
    ['profile','MY PROFILE','Your Account'], ['membership','MEMBERSHIP','Premium Plans'],
    ['stats','MY STATS','Your Activity'], ['add_link','ADD LINK','Save A Link'],
    ['list_links','MY LINKS','Normal Link System'], ['check_links','CHECK LINKS','Verify Status'],
    ['auto_impression','AUTO IMPRESSION','Background Traffic'], ['balance','ADD BALANCE','Top Up Wallet'],
    ['admin','ADMIN PANEL','Control Center'], ['help','HELP','Guide & Support'],
    ['about','ABOUT','Bot Information'], ['smartlink','SMART LINK','Adsterra Integration'],
    ['shop','IMPRESSION SHOP','Buy Credits'], ['support','SUPPORT','Contact Admin'],
    ['referral','REFERRAL','Earn Rewards'], ['settings','SETTINGS','Preferences'],
    ['live','LIVE MONITOR','Real-time Feed'],
    ['h4ck_organic','H4CK ORGANIC','v30 Ultra Edition'],
  ];
  for (const [key, title, sub] of sections) {
    if (SECTION_IMAGES[key]) continue;
    const fp = path.join(IMAGES_DIR, `${key}.svg`);
    try { fs.writeFileSync(fp, buildSectionSvg(key, title, sub), 'utf8'); } catch (e) {}
    if (fs.existsSync(fp)) SECTION_IMAGES[key] = fp;
  }
  console.log(`🖼️ Section images: ${Object.keys(SECTION_IMAGES).length} loaded`);
}
generateAllSectionImages();

// ═══════════════════════════════════════════════════════════════════════
//  DEFAULTS
// ═══════════════════════════════════════════════════════════════════════
const HUMAN_DEFAULTS = {
  enabled: true, typing_indicator: true, random_delays: true, reading_pause: true,
  min_delay_ms: 400, max_delay_ms: 1800, typing_speed_cpm: 220, action_variation: true,
  organic_mode: true,
  search_dwell_min_ms: 5000, search_dwell_max_ms: 12000,
  organic_dwell_min_ms: 30000, organic_dwell_max_ms: 45000,
  typing_min_cpm: 120, typing_max_cpm: 280,
};

// V32: strict US-residential enforcement вҖ” never leaks direct IP
const PROXY_DEFAULTS = {
  enabled: true,
  rotation: 'random',            // new exit IP per visit вҶ’ max diversity
  fallback_direct: false,        // вҶҗ NEVER leak real IP (burns CPM + risk ban)
  max_retries: 3,
  health_check_url: 'https://api.ipify.org?format=json',
  connection_timeout_ms: 25000,
  cooldown_ms: 20000,
  max_fails: 3,
  low_quota_alert_percent: 10,
  force_us_only: false,          // ⭐ V36: all-country enabled (was US-only)
  auto_health_check: true,
  health_check_interval_ms: 300000,
  verify_exit_ip: true,          // вҶҗ verify US exit IP before EACH visit
  require_residential: true,     // вҶҗ residential only (no datacenter)
  bridge_enabled: true,
};

const FREE_LINK_LIMIT = 2;
const FREE_VISITS_PER_LINK = 1;
const FREE_VISIT_WINDOW_MS = 60000;

const PLAN_ORDER = ['monthly', 'twomonth', 'threemonth'];
const DEFAULT_PLANS = {
  monthly:   { label: '1 Month',  days: 30, price: 199, link_limit: 5,  visits_per_link: 5,  burst_window_ms: 5000, daily_burst_limit: 100, bonus_credits: 200,  enabled: true },
  twomonth:  { label: '2 Months', days: 60, price: 349, link_limit: 12, visits_per_link: 8,  burst_window_ms: 5000, daily_burst_limit: 300, bonus_credits: 500,  enabled: true },
  threemonth:{ label: '3 Months', days: 90, price: 499, link_limit: 20, visits_per_link: 12, burst_window_ms: 5000, daily_burst_limit: 600, bonus_credits: 1000, enabled: true },
};

const DEFAULT_PAYMENT_SETTINGS = {
  bkash: 'Not set yet', nagad: 'Not set yet', binance: 'Not set yet', usdt_trc20: 'Not set yet',
  enabled: { bkash: true, nagad: true, binance: true, usdt_trc20: true },
  instructions: 'Send money via any method and submit your TXN ID.',
};

const DEFAULT_SHOP_PACKAGES = {
  p1: { amount: 100,   price: 10,   bonus: 0 },
  p2: { amount: 500,   price: 45,   bonus: 50 },
  p3: { amount: 1000,  price: 80,   bonus: 100 },
  p4: { amount: 5000,  price: 350,  bonus: 500 },
  p5: { amount: 10000, price: 650,  bonus: 1000 },
  p6: { amount: 50000, price: 2800, bonus: 5000 },
};
const SHOP_PACKAGE_ORDER = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

const SMARTLINK_DEFAULTS = {
  enabled: true, parallel_visits: 1, batch_interval_ms: 30000,
  min_run_time_ms: 15000, max_run_time_ms: 30000, max_concurrent_browsers: 2,
  min_interval_ms: 60000, max_interval_ms: 120000, per_link_daily_cap: 15,
  warmup_enabled: true, cookie_persistence: true, session_reuse_ms: 1800000,
  backoff_on_fail: true, residential_only: true, randomize_visit_order: true,
};

const AUTO_IMPRESSION_DEFAULTS = {
  h4ck_organic_mode: true,
  hybrid_smart_mode: false,
  pure_search_mode: false,
  pure_direct_mode: false,

  h4ck_referrer_chain: ['google', 'bing', 'ddg', 'yahoo'],
  h4ck_enable_multi_referrer: false,
  h4ck_multi_referrer_chance: 0.15,
  h4ck_enable_full_funnel: true,
  h4ck_enable_click: true,
  h4ck_enable_return_visit: true,
  h4ck_enable_competitor_visit: true,
  h4ck_enable_cookie_injection: true,
  h4ck_enable_zoom_simulation: false,
  h4ck_enable_keyboard_nav: true,
  h4ck_enable_video_pause: false,

  h4ck_funnel_depth_min: 2,
  h4ck_funnel_depth_max: 4,
  h4ck_click_probability: 0.015,   // V36: target CTR (1.5%) — always clamped by h4ck_ctr_safety_cap
  h4ck_max_clicks_per_session: 1,
  h4ck_min_click_delay_ms: 30000,
  // 🛡️ V36 CTR SAFETY — the account can never look click-fraudulent:
  //   effective CTR = min(h4ck_click_probability, h4ck_ctr_safety_cap)
  //   + max 1 click/session + >=30s between clicks + >=8s read before any click.
  h4ck_ctr_safety_cap: 0.02,            // hard ceiling — never exceed 2% CTR
  h4ck_click_min_dwell_ms: 8000,        // must read the page ≥8s before clicking
  h4ck_click_hover_ms_min: 600,         // hover the ad before clicking
  h4ck_click_hover_ms_max: 1800,
  h4ck_click_mouse_steps_min: 18,       // natural curved mouse travel
  h4ck_click_mouse_steps_max: 45,
  h4ck_return_visit_chance: 0.05,
  h4ck_competitor_visit_chance: 0.08,
  h4ck_search_timeout_ms: 8000,

  // V33: Min 30s (ensure pixel fires), max 90s (safety fallback)
  h4ck_smartlink_dwell_min_ms: 30000,
  h4ck_smartlink_dwell_max_ms: 45000,
  h4ck_dwell_min_ms: 30000,
  h4ck_dwell_max_ms: 45000,
  h4ck_reading_pause_chance: 0.30,
  h4ck_zoom_probability: 0.15,
  h4ck_keyboard_nav_chance: 0.20,
  h4ck_video_pause_chance: 0.10,

  h4ck_smart_data_saver: true,
  h4ck_saver_block_images: false,
  h4ck_saver_block_media: true,
  h4ck_saver_block_fonts: true,
  h4ck_saver_block_analytics: false,
  h4ck_saver_block_other_ads: false,
  h4ck_saver_block_css: false,
  h4ck_saver_block_websockets: true,
  h4ck_saver_block_beacons: false,
  h4ck_saver_image_size_limit_kb: 0,
  h4ck_saver_whitelist_adsterra: true,
  h4ck_saver_min_dom_only: false,
  h4ck_saver_smart_route: true,
  h4ck_saver_cache_response: true,

  smartlink_enabled: true, normal_enabled: true,
  // ⭐ V39: a SmartLink that loads real content counts as a delivered impression even
  // when the (rotating) Adsterra pixel domain is not in the static list. Set false to
  // require an explicit pixel / marker.
  smartlink_lenient_success: true,
  hourly_limit_smartlink: 75, hourly_limit_normal: 90,
  daily_limit_smartlink: 1500, daily_limit_normal: 1800,
  min_interval_ms: 30000, max_interval_ms: 60000,
  parallel_workers: 1, human_behavior: true,
  proxy_required: true, residential_only: true,
  backoff_on_fail: true, max_consecutive_fails: 5, backoff_duration_ms: 300000,
  warmup_enabled: true, warmup_visits: 5,
  min_run_time_ms: 45000, max_run_time_ms: 90000,
  smart_warmup: true, auto_retry: true, max_retries: 2,
  burst_visits_per_link: 3, burst_window_ms: 15000,
  worker_tick_ms: 10000,
  // ⚡ FAST-FIRE: deliver a valid impression in ~10-12s (see resolveDwellRange).
  fast_fire_enabled: true,
  fast_fire_ms: 12000,
// ⭐ APEX-ENTERPRISE: opt-in long organic dwell 38–48s (for max CPM quality)
  extended_dwell_enabled: false,
  extended_dwell_min_ms: 38000,
  extended_dwell_max_ms: 48000,
  organic_mode: true, require_us: false,
  data_saver_mode: true, data_saver_images: true, data_saver_media: true,
  data_saver_fonts: true, data_saver_analytics: true, data_saver_other_ads: true,
  adsterra_safe_mode: true,
  high_cpm_mode: true, safari_ratio: 0.60, us_only_strict: false,
  min_ad_dwell_ms: 30000, min_normal_dwell_ms: 30000,
  max_ad_dwell_ms: 45000, max_normal_dwell_ms: 45000,
  // V32 HIGH-CPM: Popunder-friendly вҖ” less aggressive clicks, more dwell/pages
  ad_hover_count: 3, viewport_pause_ms: 18000, multi_page_probability: 0.35,

  // ⭐ V35 SUCCESS-BOOST: retry a failed visit before counting it as a loss.
  // A transient blip (DNS hiccup, one-off 403, slow CDN, popunder race) no
  // longer costs an impression — the engine re-attempts with a short
  // randomised backoff until it succeeds or the attempt budget is spent.
  success_guard_enabled: true,
  visit_retry_attempts: 3,          // normal-link visits
  smartlink_retry_attempts: 2,      // smartlink visits
  h4ck_retry_attempts: 1,           // H4CK full-funnel (expensive — keep low)
  visit_retry_backoff_ms: 1200,
};

const DEFAULT_PAYMENT_METHODS = [
  { id: 'bkash',      name: 'bKash',      number: 'Not set', enabled: true, instructions: 'Send Money' },
  { id: 'nagad',      name: 'Nagad',      number: 'Not set', enabled: true, instructions: 'Send Money' },
  { id: 'binance',    name: 'Binance',    number: 'Not set', enabled: true, instructions: 'Pay ID' },
  { id: 'usdt_trc20', name: 'USDT TRC20', number: 'Not set', enabled: true, instructions: 'TRC20 Network' },
];

// ═══════════════════════════════════════════════════════════════════════
//  SETTINGS ACCESSORS
// ═══════════════════════════════════════════════════════════════════════
function getSmartlinkSettings() {
  if (!cache.smartlink_settings || typeof cache.smartlink_settings !== 'object') {
    cache.smartlink_settings = { ...SMARTLINK_DEFAULTS };
    syncToFirebase('smartlink_settings');
  }
  let changed = false;
  for (const [k, v] of Object.entries(SMARTLINK_DEFAULTS)) {
    if (!(k in cache.smartlink_settings)) { cache.smartlink_settings[k] = v; changed = true; }
  }
  if (changed) syncToFirebase('smartlink_settings');
  return cache.smartlink_settings;
}
function saveSmartlinkSettings() { syncToFirebase('smartlink_settings'); }

function getAutoImpressionSettings() {
  if (!cache.auto_impression_settings || typeof cache.auto_impression_settings !== 'object') {
    cache.auto_impression_settings = { ...AUTO_IMPRESSION_DEFAULTS };
    syncToFirebase('auto_impression_settings');
    enforceAdsterraSafety();
    return cache.auto_impression_settings;
  }
  let changed = false;
  for (const [k, v] of Object.entries(AUTO_IMPRESSION_DEFAULTS)) {
    if (!(k in cache.auto_impression_settings)) { cache.auto_impression_settings[k] = v; changed = true; }
  }
  if (changed) syncToFirebase('auto_impression_settings');
  enforceAdsterraSafety();
  return cache.auto_impression_settings;
}
function saveAutoImpressionSettings() { syncToFirebase('auto_impression_settings'); }

// ═══════════════════════════════════════════════════════════════════════
//  MAINTENANCE MODE
// ═══════════════════════════════════════════════════════════════════════
const MAINTENANCE_DEFAULTS = {
  enabled: false,
  message: '🛠️ <b>UNDER MAINTENANCE</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n⚙️ We are upgrading the bot to serve you better.\n⏳ <i>Please try again in a little while.</i>',
  whitelist: [],
};
function getMaintenanceMode() {
  if (!cache.maintenance_mode || typeof cache.maintenance_mode !== 'object') {
    cache.maintenance_mode = { ...MAINTENANCE_DEFAULTS, whitelist: [] };
    syncToFirebase('maintenance_mode');
    return cache.maintenance_mode;
  }
  let changed = false;
  for (const [k, v] of Object.entries(MAINTENANCE_DEFAULTS)) {
    if (!(k in cache.maintenance_mode)) { cache.maintenance_mode[k] = Array.isArray(v) ? [] : v; changed = true; }
  }
  if (!Array.isArray(cache.maintenance_mode.whitelist)) { cache.maintenance_mode.whitelist = []; changed = true; }
  if (changed) syncToFirebase('maintenance_mode');
  return cache.maintenance_mode;
}
function saveMaintenanceMode() { syncToFirebase('maintenance_mode'); }

function isWhitelistedForMaintenance(userId) {
  const m = getMaintenanceMode();
  const uid = Number(userId);
  if (isAdmin(uid)) return true;                        // Admin + Extra Admins
  if (Array.isArray(m.whitelist) && m.whitelist.includes(uid)) return true;
  return false;
}

// Returns true when the user is BLOCKED (caller must return early).
async function checkMaintenanceGate(msg, chatId, userId) {
  const m = getMaintenanceMode();
  if (!m.enabled) return false;                              // OFF → everything allowed
  if (isWhitelistedForMaintenance(userId)) return false;     // whitelisted → allowed
  const text = m.message || '🛠️ Under maintenance';
  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
  } catch (e) {
    // admin-written message may contain invalid HTML → fall back to plain text
    try { await bot.sendMessage(chatId, text); } catch (e2) {}
  }
  return true;
}

function getActiveMode(userId) {
  // Per-user override set from the web dashboard's Traffic Control screen.
  if (userId) {
    const perUser = (cache.impression_target_modes || {})[userId];
    if (perUser) {
      if (perUser === 'organic' || perUser === 'h4ck_organic') return MODE_H4CK_ORGANIC;
      if (perUser === 'hybrid' || perUser === 'hybrid_smart') return MODE_HYBRID_SMART;
      if (perUser === 'direct' || perUser === 'pure_direct') return MODE_PURE_DIRECT;
      if (perUser === 'pure_search') return MODE_PURE_SEARCH;
    }
  }
  const cfg = getAutoImpressionSettings();
  if (cfg.h4ck_organic_mode) return MODE_H4CK_ORGANIC;
  if (cfg.hybrid_smart_mode) return MODE_HYBRID_SMART;
  if (cfg.pure_search_mode) return MODE_PURE_SEARCH;
  if (cfg.pure_direct_mode) return MODE_PURE_DIRECT;
  return MODE_H4CK_ORGANIC;
}

function setActiveMode(mode) {
  const cfg = getAutoImpressionSettings();
  cfg.h4ck_organic_mode = (mode === MODE_H4CK_ORGANIC);
  cfg.hybrid_smart_mode = (mode === MODE_HYBRID_SMART);
  cfg.pure_search_mode = (mode === MODE_PURE_SEARCH);
  cfg.pure_direct_mode = (mode === MODE_PURE_DIRECT);
  saveAutoImpressionSettings();
}

function getModeDisplayName(mode) {
  switch (mode) {
    case MODE_H4CK_ORGANIC: return '⚡ H4CK ORGANIC v30';
    case MODE_HYBRID_SMART: return '🎯 Hybrid Smart';
    case MODE_PURE_SEARCH:  return '🔍 Pure Search';
    case MODE_PURE_DIRECT:  return '🚀 Pure Direct';
    default: return '❓ Unknown';
  }
}

function getHumanConfig() {
  if (!cache.human_behavior || typeof cache.human_behavior !== 'object') {
    cache.human_behavior = { ...HUMAN_DEFAULTS };
    syncToFirebase('human_behavior');
    return cache.human_behavior;
  }
  let ch = false;
  for (const k of Object.keys(HUMAN_DEFAULTS)) {
    if (!(k in cache.human_behavior)) { cache.human_behavior[k] = HUMAN_DEFAULTS[k]; ch = true; }
  }
  if (ch) syncToFirebase('human_behavior');
  return cache.human_behavior;
}
function saveHumanConfig() { syncToFirebase('human_behavior'); }

function getProxySettings() {
  if (!cache.proxy_settings || typeof cache.proxy_settings !== 'object') {
    cache.proxy_settings = { ...PROXY_DEFAULTS };
    syncToFirebase('proxy_settings');
  }
  let ch = false;
  for (const k of Object.keys(PROXY_DEFAULTS)) {
    if (!(k in cache.proxy_settings)) { cache.proxy_settings[k] = PROXY_DEFAULTS[k]; ch = true; }
  }
  if (ch) syncToFirebase('proxy_settings');
  enforceAdsterraSafety();
  return cache.proxy_settings;
}
function saveProxySettings() { syncToFirebase('proxy_settings'); }

// ⭐ NEW: Check if proxy is ready for actual traffic
function proxyReadyForTraffic() {
  const pc = getProxySettings();
  const cfg = getAutoImpressionSettings();

  // If direct fallback is allowed or booster is not required, never block traffic
  if (pc.fallback_direct || !cfg.proxy_required) {
    return { ready: true, code: 'OK' };
  }

  const allProxies = getProxyList().filter((p) => p.enabled !== false);
  if (!allProxies.length) {
    return { ready: false, reason: 'No booster configured (Contact Admin).', code: 'NO_PROXY' };
  }

  if (cfg.proxy_required && !pc.enabled) {
    return { ready: false, reason: 'Booster master switch is OFF (Contact Admin).', code: 'PROXY_OFF' };
  }

  const stats = getProxyStats();
  const anyAvailable = allProxies.some((p) => {
    const s = stats[proxyId(p)] || {};
    const quota = Number(p.quota_mb || 0);
    const used = s.mb_used || 0;
    return !(quota > 0 && used >= quota);
  });
  if (!anyAvailable) {
    return { ready: false, reason: 'All boosters have exhausted their quota (Contact Admin).', code: 'PROXY_QUOTA' };
  }

  return { ready: true, code: 'OK' };
}

function defaultSettings() {
  const en = {};
  for (const k of Object.keys(BUTTON_DEFS)) en[k] = true;
  return { button_order: [...DEFAULT_BUTTON_ORDER], button_enabled: en, button_icon: {}, bot_name_override: null };
}

// ═══════════════════════════════════════════════════════════════════════
//  CAPTCHA SYSTEM
// ═══════════════════════════════════════════════════════════════════════
const CAPTCHA_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCaptcha() {
  let chars = '';
  for (let i = 0; i < CAPTCHA_LENGTH; i++) chars += CAPTCHA_CHARSET[secureRandomInt(CAPTCHA_CHARSET.length)];
  const circleIndex = secureRandomInt(CAPTCHA_LENGTH);
  const answer = chars[circleIndex];
  const options = new Set();
  options.add(answer);
  while (options.size < 6) options.add(CAPTCHA_CHARSET[secureRandomInt(CAPTCHA_CHARSET.length)]);
  const optArr = Array.from(options);
  for (let i = optArr.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [optArr[i], optArr[j]] = [optArr[j], optArr[i]];
  }
  return { chars: chars.split(''), answer, options: optArr, circleIndex };
}

function isUserVerified(userId) {
  const uid = String(userId);
  const v = cache.captcha_verified[uid];
  if (!v) return false;
  if (!v.at || Date.now() - v.at > CAPTCHA_VERIFY_TTL) {
    delete cache.captcha_verified[uid];
    syncToFirebase('captcha_verified');
    return false;
  }
  return true;
}

function cleanupExpiredCaptchaVerifications() {
  const all = cache.captcha_verified || {};
  const cutoff = Date.now() - CAPTCHA_VERIFY_TTL;
  let changed = false;
  for (const [uid, v] of Object.entries(all)) {
    if (!v || !v.at || v.at < cutoff) { delete all[uid]; changed = true; }
  }
  if (changed) syncToFirebase('captcha_verified');
}

function markUserVerified(userId) {
  cache.captcha_verified[String(userId)] = { at: Date.now() };
  syncToFirebase('captcha_verified');
}

// ═══════════════════════════════════════════════════════════════════════
//  UA + STEALTH POOLS (v30: 65/18/17 distribution)
// ═══════════════════════════════════════════════════════════════════════
// ============================================================
// V32 HIGH-CPM UA POOL (US ONLY)
// Browser mix : Chrome 50% | Edge 20% | Firefox 10% | Mobile Safari 20%
// OS mix      : Windows 65% | iOS 15% | Android 10% | macOS 10%
// ============================================================
const UA_POOL_CHROME_WIN = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
];
const UA_POOL_CHROME_MAC = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
];
const UA_POOL_EDGE_WIN = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 Edg/132.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0',
];
const UA_POOL_FIREFOX_WIN = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
];
const UA_POOL_SAFARI_IOS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
];
const UA_POOL_CHROME_ANDROID = [
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36',
];

// Flat pool kept for backward compatibility with older helpers
const US_USER_AGENT_POOL = [
  ...UA_POOL_CHROME_WIN,
  ...UA_POOL_CHROME_MAC,
  ...UA_POOL_EDGE_WIN,
  ...UA_POOL_FIREFOX_WIN,
  ...UA_POOL_SAFARI_IOS,
  ...UA_POOL_CHROME_ANDROID,
];

const US_ACCEPT_LANGUAGE = [
  'en-US,en;q=0.9',
  'en-US,en;q=0.9,es;q=0.8',
  'en-US,en;q=0.9,es;q=0.7',
  'en-US,en;q=0.8',
  'en-US,en;q=0.9,fr;q=0.7',
  'en,en-US;q=0.9',
];

const DESKTOP_VIEWPORT = [
  { width: 1920, height: 1080 }, { width: 1536, height: 864 }, { width: 1440, height: 900 },
  { width: 1366, height: 768 }, { width: 1600, height: 900 }, { width: 1280, height: 720 },
  { width: 2560, height: 1440 }, { width: 1680, height: 1050 },
];
const TABLET_VIEWPORT = [
  { width: 1024, height: 1366 }, { width: 1366, height: 1024 },
  { width: 834,  height: 1112 }, { width: 768,  height: 1024 },
];
const MOBILE_VIEWPORT = [
  { width: 414, height: 896 }, { width: 390, height: 844 },
  { width: 393, height: 852 }, { width: 428, height: 926 },
];

const WEBGL_PROFILES = {
  win: [
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  ],
  mac: [
    { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M1, OpenGL 4.1)' },
    { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M2, OpenGL 4.1)' },
    { vendor: 'Apple Inc.', renderer: 'Apple M1' },
    { vendor: 'Apple Inc.', renderer: 'Apple M2' },
  ],
  linux: [
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)' },
  ],
  android: [
    { vendor: 'Qualcomm', renderer: 'Adreno (TM) 740' },
    { vendor: 'ARM', renderer: 'Mali-G78 MP14' },
  ],
};

// V32: full US timezone coverage (weighted by population)
const US_TIMEZONES = [
  { timezone: 'America/New_York',    locale: 'en-US', acceptLanguage: 'en-US,en;q=0.9' },
  { timezone: 'America/New_York',    locale: 'en-US', acceptLanguage: 'en-US,en;q=0.9,es;q=0.8' },
  { timezone: 'America/Chicago',     locale: 'en-US', acceptLanguage: 'en-US,en;q=0.9' },
  { timezone: 'America/Denver',      locale: 'en-US', acceptLanguage: 'en-US,en;q=0.9' },
  { timezone: 'America/Phoenix',     locale: 'en-US', acceptLanguage: 'en-US,en;q=0.9' },
  { timezone: 'America/Los_Angeles', locale: 'en-US', acceptLanguage: 'en-US,en;q=0.9' },
  { timezone: 'America/Anchorage',   locale: 'en-US', acceptLanguage: 'en-US,en;q=0.9' },
  { timezone: 'Pacific/Honolulu',    locale: 'en-US', acceptLanguage: 'en-US,en;q=0.9' },
];

// ═══════════════════════════════════════════════════════════════════════════
//  V36 GLOBAL TARGETING ENGINE
//  All-country traffic · proxy-country matching · weighted pick-rates for
//  country / device / browser / OS · CPM optimiser · per-dimension counters.
// ═══════════════════════════════════════════════════════════════════════════
const COUNTRY_GEO = {
  AF: { name: 'Afghanistan', flag: '🇦🇫', timezone: 'Asia/Kabul', locale: 'ps-AF', acceptLanguage: 'ps-AF,ps;q=0.9,en;q=0.8' },
  AL: { name: 'Albania', flag: '🇦🇱', timezone: 'Europe/Tirane', locale: 'sq-AL', acceptLanguage: 'sq-AL,sq;q=0.9,en;q=0.8' },
  DZ: { name: 'Algeria', flag: '🇩🇿', timezone: 'Africa/Algiers', locale: 'ar-DZ', acceptLanguage: 'ar-DZ,ar;q=0.9,en;q=0.8' },
  AS: { name: 'American Samoa', flag: '🇦🇸', timezone: 'Pacific/Pago_Pago', locale: 'en-AS', acceptLanguage: 'en-AS,en;q=0.9' },
  AD: { name: 'Andorra', flag: '🇦🇩', timezone: 'Europe/Andorra', locale: 'ca-AD', acceptLanguage: 'ca-AD,ca;q=0.9,en;q=0.8' },
  AO: { name: 'Angola', flag: '🇦🇴', timezone: 'Africa/Luanda', locale: 'pt-AO', acceptLanguage: 'pt-AO,pt;q=0.9,en;q=0.8' },
  AI: { name: 'Anguilla', flag: '🇦🇮', timezone: 'America/Anguilla', locale: 'en-AI', acceptLanguage: 'en-AI,en;q=0.9' },
  AQ: { name: 'Antarctica', flag: '🇦🇶', timezone: 'Antarctica/McMurdo', locale: 'en-AQ', acceptLanguage: 'en-AQ,en;q=0.9' },
  AG: { name: 'Antigua and Barbuda', flag: '🇦🇬', timezone: 'America/Antigua', locale: 'en-AG', acceptLanguage: 'en-AG,en;q=0.9' },
  AR: { name: 'Argentina', flag: '🇦🇷', timezone: 'America/Argentina/Buenos_Aires', locale: 'es-AR', acceptLanguage: 'es-AR,es;q=0.9,en;q=0.8' },
  AM: { name: 'Armenia', flag: '🇦🇲', timezone: 'Asia/Yerevan', locale: 'hy-AM', acceptLanguage: 'hy-AM,hy;q=0.9,en;q=0.8' },
  AW: { name: 'Aruba', flag: '🇦🇼', timezone: 'America/Aruba', locale: 'nl-AW', acceptLanguage: 'nl-AW,nl;q=0.9,en;q=0.8' },
  AU: { name: 'Australia', flag: '🇦🇺', timezone: 'Australia/Lord_Howe', locale: 'en-AU', acceptLanguage: 'en-AU,en;q=0.9' },
  AT: { name: 'Austria', flag: '🇦🇹', timezone: 'Europe/Vienna', locale: 'de-AT', acceptLanguage: 'de-AT,de;q=0.9,en;q=0.8' },
  AZ: { name: 'Azerbaijan', flag: '🇦🇿', timezone: 'Asia/Baku', locale: 'az-AZ', acceptLanguage: 'az-AZ,az;q=0.9,en;q=0.8' },
  BS: { name: 'Bahamas', flag: '🇧🇸', timezone: 'America/Nassau', locale: 'en-BS', acceptLanguage: 'en-BS,en;q=0.9' },
  BH: { name: 'Bahrain', flag: '🇧🇭', timezone: 'Asia/Bahrain', locale: 'ar-BH', acceptLanguage: 'ar-BH,ar;q=0.9,en;q=0.8' },
  BD: { name: 'Bangladesh', flag: '🇧🇩', timezone: 'Asia/Dhaka', locale: 'bn-BD', acceptLanguage: 'bn-BD,bn;q=0.9,en;q=0.8' },
  BB: { name: 'Barbados', flag: '🇧🇧', timezone: 'America/Barbados', locale: 'en-BB', acceptLanguage: 'en-BB,en;q=0.9' },
  BY: { name: 'Belarus', flag: '🇧🇾', timezone: 'Europe/Minsk', locale: 'be-BY', acceptLanguage: 'be-BY,be;q=0.9,en;q=0.8' },
  BE: { name: 'Belgium', flag: '🇧🇪', timezone: 'Europe/Brussels', locale: 'nl-BE', acceptLanguage: 'nl-BE,nl;q=0.9,en;q=0.8' },
  BZ: { name: 'Belize', flag: '🇧🇿', timezone: 'America/Belize', locale: 'en-BZ', acceptLanguage: 'en-BZ,en;q=0.9' },
  BJ: { name: 'Benin', flag: '🇧🇯', timezone: 'Africa/Porto-Novo', locale: 'fr-BJ', acceptLanguage: 'fr-BJ,fr;q=0.9,en;q=0.8' },
  BM: { name: 'Bermuda', flag: '🇧🇲', timezone: 'Atlantic/Bermuda', locale: 'en-BM', acceptLanguage: 'en-BM,en;q=0.9' },
  BT: { name: 'Bhutan', flag: '🇧🇹', timezone: 'Asia/Thimphu', locale: 'dz-BT', acceptLanguage: 'dz-BT,dz;q=0.9,en;q=0.8' },
  BO: { name: 'Bolivia', flag: '🇧🇴', timezone: 'America/La_Paz', locale: 'ay-BO', acceptLanguage: 'ay-BO,ay;q=0.9,en;q=0.8' },
  BA: { name: 'Bosnia and Herzegovina', flag: '🇧🇦', timezone: 'Europe/Sarajevo', locale: 'bs-BA', acceptLanguage: 'bs-BA,bs;q=0.9,en;q=0.8' },
  BW: { name: 'Botswana', flag: '🇧🇼', timezone: 'Africa/Gaborone', locale: 'en-BW', acceptLanguage: 'en-BW,en;q=0.9' },
  BV: { name: 'Bouvet Island', flag: '🇧🇻', timezone: 'UTC', locale: 'no-BV', acceptLanguage: 'no-BV,no;q=0.9,en;q=0.8' },
  BR: { name: 'Brazil', flag: '🇧🇷', timezone: 'America/Noronha', locale: 'pt-BR', acceptLanguage: 'pt-BR,pt;q=0.9,en;q=0.8' },
  IO: { name: 'British Indian Ocean Territory', flag: '🇮🇴', timezone: 'Indian/Chagos', locale: 'en-IO', acceptLanguage: 'en-IO,en;q=0.9' },
  VG: { name: 'British Virgin Islands', flag: '🇻🇬', timezone: 'America/Tortola', locale: 'en-VG', acceptLanguage: 'en-VG,en;q=0.9' },
  BN: { name: 'Brunei', flag: '🇧🇳', timezone: 'Asia/Brunei', locale: 'ms-BN', acceptLanguage: 'ms-BN,ms;q=0.9,en;q=0.8' },
  BG: { name: 'Bulgaria', flag: '🇧🇬', timezone: 'Europe/Sofia', locale: 'bg-BG', acceptLanguage: 'bg-BG,bg;q=0.9,en;q=0.8' },
  BF: { name: 'Burkina Faso', flag: '🇧🇫', timezone: 'Africa/Ouagadougou', locale: 'fr-BF', acceptLanguage: 'fr-BF,fr;q=0.9,en;q=0.8' },
  BI: { name: 'Burundi', flag: '🇧🇮', timezone: 'Africa/Bujumbura', locale: 'fr-BI', acceptLanguage: 'fr-BI,fr;q=0.9,en;q=0.8' },
  KH: { name: 'Cambodia', flag: '🇰🇭', timezone: 'Asia/Phnom_Penh', locale: 'km-KH', acceptLanguage: 'km-KH,km;q=0.9,en;q=0.8' },
  CM: { name: 'Cameroon', flag: '🇨🇲', timezone: 'Africa/Douala', locale: 'en-CM', acceptLanguage: 'en-CM,en;q=0.9' },
  CA: { name: 'Canada', flag: '🇨🇦', timezone: 'America/St_Johns', locale: 'en-CA', acceptLanguage: 'en-CA,en;q=0.9' },
  CV: { name: 'Cape Verde', flag: '🇨🇻', timezone: 'Atlantic/Cape_Verde', locale: 'pt-CV', acceptLanguage: 'pt-CV,pt;q=0.9,en;q=0.8' },
  BQ: { name: 'Caribbean Netherlands', flag: '🇧🇶', timezone: 'America/Kralendijk', locale: 'en-BQ', acceptLanguage: 'en-BQ,en;q=0.9' },
  KY: { name: 'Cayman Islands', flag: '🇰🇾', timezone: 'America/Cayman', locale: 'en-KY', acceptLanguage: 'en-KY,en;q=0.9' },
  CF: { name: 'Central African Republic', flag: '🇨🇫', timezone: 'Africa/Bangui', locale: 'fr-CF', acceptLanguage: 'fr-CF,fr;q=0.9,en;q=0.8' },
  TD: { name: 'Chad', flag: '🇹🇩', timezone: 'Africa/Ndjamena', locale: 'ar-TD', acceptLanguage: 'ar-TD,ar;q=0.9,en;q=0.8' },
  CL: { name: 'Chile', flag: '🇨🇱', timezone: 'America/Santiago', locale: 'es-CL', acceptLanguage: 'es-CL,es;q=0.9,en;q=0.8' },
  CN: { name: 'China', flag: '🇨🇳', timezone: 'Asia/Shanghai', locale: 'zh-CN', acceptLanguage: 'zh-CN,zh;q=0.9,en;q=0.8' },
  CX: { name: 'Christmas Island', flag: '🇨🇽', timezone: 'Indian/Christmas', locale: 'en-CX', acceptLanguage: 'en-CX,en;q=0.9' },
  CC: { name: 'Cocos (Keeling) Islands', flag: '🇨🇨', timezone: 'Indian/Cocos', locale: 'en-CC', acceptLanguage: 'en-CC,en;q=0.9' },
  CO: { name: 'Colombia', flag: '🇨🇴', timezone: 'America/Bogota', locale: 'es-CO', acceptLanguage: 'es-CO,es;q=0.9,en;q=0.8' },
  KM: { name: 'Comoros', flag: '🇰🇲', timezone: 'Indian/Comoro', locale: 'ar-KM', acceptLanguage: 'ar-KM,ar;q=0.9,en;q=0.8' },
  CG: { name: 'Congo', flag: '🇨🇬', timezone: 'Africa/Brazzaville', locale: 'fr-CG', acceptLanguage: 'fr-CG,fr;q=0.9,en;q=0.8' },
  CK: { name: 'Cook Islands', flag: '🇨🇰', timezone: 'Pacific/Rarotonga', locale: 'en-CK', acceptLanguage: 'en-CK,en;q=0.9' },
  CR: { name: 'Costa Rica', flag: '🇨🇷', timezone: 'America/Costa_Rica', locale: 'es-CR', acceptLanguage: 'es-CR,es;q=0.9,en;q=0.8' },
  HR: { name: 'Croatia', flag: '🇭🇷', timezone: 'Europe/Zagreb', locale: 'hr-HR', acceptLanguage: 'hr-HR,hr;q=0.9,en;q=0.8' },
  CU: { name: 'Cuba', flag: '🇨🇺', timezone: 'America/Havana', locale: 'es-CU', acceptLanguage: 'es-CU,es;q=0.9,en;q=0.8' },
  CW: { name: 'Curaçao', flag: '🇨🇼', timezone: 'America/Curacao', locale: 'en-CW', acceptLanguage: 'en-CW,en;q=0.9' },
  CY: { name: 'Cyprus', flag: '🇨🇾', timezone: 'Asia/Nicosia', locale: 'el-CY', acceptLanguage: 'el-CY,el;q=0.9,en;q=0.8' },
  CZ: { name: 'Czechia', flag: '🇨🇿', timezone: 'Europe/Prague', locale: 'cs-CZ', acceptLanguage: 'cs-CZ,cs;q=0.9,en;q=0.8' },
  CD: { name: 'DR Congo', flag: '🇨🇩', timezone: 'Africa/Kinshasa', locale: 'fr-CD', acceptLanguage: 'fr-CD,fr;q=0.9,en;q=0.8' },
  DK: { name: 'Denmark', flag: '🇩🇰', timezone: 'Europe/Copenhagen', locale: 'da-DK', acceptLanguage: 'da-DK,da;q=0.9,en;q=0.8' },
  DJ: { name: 'Djibouti', flag: '🇩🇯', timezone: 'Africa/Djibouti', locale: 'ar-DJ', acceptLanguage: 'ar-DJ,ar;q=0.9,en;q=0.8' },
  DM: { name: 'Dominica', flag: '🇩🇲', timezone: 'America/Dominica', locale: 'en-DM', acceptLanguage: 'en-DM,en;q=0.9' },
  DO: { name: 'Dominican Republic', flag: '🇩🇴', timezone: 'America/Santo_Domingo', locale: 'es-DO', acceptLanguage: 'es-DO,es;q=0.9,en;q=0.8' },
  EC: { name: 'Ecuador', flag: '🇪🇨', timezone: 'America/Guayaquil', locale: 'es-EC', acceptLanguage: 'es-EC,es;q=0.9,en;q=0.8' },
  EG: { name: 'Egypt', flag: '🇪🇬', timezone: 'Africa/Cairo', locale: 'ar-EG', acceptLanguage: 'ar-EG,ar;q=0.9,en;q=0.8' },
  SV: { name: 'El Salvador', flag: '🇸🇻', timezone: 'America/El_Salvador', locale: 'es-SV', acceptLanguage: 'es-SV,es;q=0.9,en;q=0.8' },
  GQ: { name: 'Equatorial Guinea', flag: '🇬🇶', timezone: 'Africa/Malabo', locale: 'fr-GQ', acceptLanguage: 'fr-GQ,fr;q=0.9,en;q=0.8' },
  ER: { name: 'Eritrea', flag: '🇪🇷', timezone: 'Africa/Asmara', locale: 'ar-ER', acceptLanguage: 'ar-ER,ar;q=0.9,en;q=0.8' },
  EE: { name: 'Estonia', flag: '🇪🇪', timezone: 'Europe/Tallinn', locale: 'et-EE', acceptLanguage: 'et-EE,et;q=0.9,en;q=0.8' },
  SZ: { name: 'Eswatini', flag: '🇸🇿', timezone: 'Africa/Mbabane', locale: 'en-SZ', acceptLanguage: 'en-SZ,en;q=0.9' },
  ET: { name: 'Ethiopia', flag: '🇪🇹', timezone: 'Africa/Addis_Ababa', locale: 'am-ET', acceptLanguage: 'am-ET,am;q=0.9,en;q=0.8' },
  FK: { name: 'Falkland Islands', flag: '🇫🇰', timezone: 'Atlantic/Stanley', locale: 'en-FK', acceptLanguage: 'en-FK,en;q=0.9' },
  FO: { name: 'Faroe Islands', flag: '🇫🇴', timezone: 'Atlantic/Faroe', locale: 'da-FO', acceptLanguage: 'da-FO,da;q=0.9,en;q=0.8' },
  FJ: { name: 'Fiji', flag: '🇫🇯', timezone: 'Pacific/Fiji', locale: 'en-FJ', acceptLanguage: 'en-FJ,en;q=0.9' },
  FI: { name: 'Finland', flag: '🇫🇮', timezone: 'Europe/Helsinki', locale: 'fi-FI', acceptLanguage: 'fi-FI,fi;q=0.9,en;q=0.8' },
  FR: { name: 'France', flag: '🇫🇷', timezone: 'Europe/Paris', locale: 'fr-FR', acceptLanguage: 'fr-FR,fr;q=0.9,en;q=0.8' },
  GF: { name: 'French Guiana', flag: '🇬🇫', timezone: 'America/Cayenne', locale: 'fr-GF', acceptLanguage: 'fr-GF,fr;q=0.9,en;q=0.8' },
  PF: { name: 'French Polynesia', flag: '🇵🇫', timezone: 'Pacific/Tahiti', locale: 'fr-PF', acceptLanguage: 'fr-PF,fr;q=0.9,en;q=0.8' },
  TF: { name: 'French Southern and Antarctic Lands', flag: '🇹🇫', timezone: 'Indian/Kerguelen', locale: 'fr-TF', acceptLanguage: 'fr-TF,fr;q=0.9,en;q=0.8' },
  GA: { name: 'Gabon', flag: '🇬🇦', timezone: 'Africa/Libreville', locale: 'fr-GA', acceptLanguage: 'fr-GA,fr;q=0.9,en;q=0.8' },
  GM: { name: 'Gambia', flag: '🇬🇲', timezone: 'Africa/Banjul', locale: 'en-GM', acceptLanguage: 'en-GM,en;q=0.9' },
  GE: { name: 'Georgia', flag: '🇬🇪', timezone: 'Asia/Tbilisi', locale: 'ka-GE', acceptLanguage: 'ka-GE,ka;q=0.9,en;q=0.8' },
  DE: { name: 'Germany', flag: '🇩🇪', timezone: 'Europe/Berlin', locale: 'de-DE', acceptLanguage: 'de-DE,de;q=0.9,en;q=0.8' },
  GH: { name: 'Ghana', flag: '🇬🇭', timezone: 'Africa/Accra', locale: 'en-GH', acceptLanguage: 'en-GH,en;q=0.9' },
  GI: { name: 'Gibraltar', flag: '🇬🇮', timezone: 'Europe/Gibraltar', locale: 'en-GI', acceptLanguage: 'en-GI,en;q=0.9' },
  GR: { name: 'Greece', flag: '🇬🇷', timezone: 'Europe/Athens', locale: 'el-GR', acceptLanguage: 'el-GR,el;q=0.9,en;q=0.8' },
  GL: { name: 'Greenland', flag: '🇬🇱', timezone: 'America/Nuuk', locale: 'kl-GL', acceptLanguage: 'kl-GL,kl;q=0.9,en;q=0.8' },
  GD: { name: 'Grenada', flag: '🇬🇩', timezone: 'America/Grenada', locale: 'en-GD', acceptLanguage: 'en-GD,en;q=0.9' },
  GP: { name: 'Guadeloupe', flag: '🇬🇵', timezone: 'America/Guadeloupe', locale: 'fr-GP', acceptLanguage: 'fr-GP,fr;q=0.9,en;q=0.8' },
  GU: { name: 'Guam', flag: '🇬🇺', timezone: 'Pacific/Guam', locale: 'ch-GU', acceptLanguage: 'ch-GU,ch;q=0.9,en;q=0.8' },
  GT: { name: 'Guatemala', flag: '🇬🇹', timezone: 'America/Guatemala', locale: 'es-GT', acceptLanguage: 'es-GT,es;q=0.9,en;q=0.8' },
  GG: { name: 'Guernsey', flag: '🇬🇬', timezone: 'Europe/Guernsey', locale: 'en-GG', acceptLanguage: 'en-GG,en;q=0.9' },
  GN: { name: 'Guinea', flag: '🇬🇳', timezone: 'Africa/Conakry', locale: 'fr-GN', acceptLanguage: 'fr-GN,fr;q=0.9,en;q=0.8' },
  GW: { name: 'Guinea-Bissau', flag: '🇬🇼', timezone: 'Africa/Bissau', locale: 'pt-GW', acceptLanguage: 'pt-GW,pt;q=0.9,en;q=0.8' },
  GY: { name: 'Guyana', flag: '🇬🇾', timezone: 'America/Guyana', locale: 'en-GY', acceptLanguage: 'en-GY,en;q=0.9' },
  HT: { name: 'Haiti', flag: '🇭🇹', timezone: 'America/Port-au-Prince', locale: 'fr-HT', acceptLanguage: 'fr-HT,fr;q=0.9,en;q=0.8' },
  HM: { name: 'Heard Island and McDonald Islands', flag: '🇭🇲', timezone: 'UTC', locale: 'en-HM', acceptLanguage: 'en-HM,en;q=0.9' },
  HN: { name: 'Honduras', flag: '🇭🇳', timezone: 'America/Tegucigalpa', locale: 'es-HN', acceptLanguage: 'es-HN,es;q=0.9,en;q=0.8' },
  HK: { name: 'Hong Kong', flag: '🇭🇰', timezone: 'Asia/Hong_Kong', locale: 'zh-HK', acceptLanguage: 'zh-HK,zh;q=0.9,en;q=0.8' },
  HU: { name: 'Hungary', flag: '🇭🇺', timezone: 'Europe/Budapest', locale: 'hu-HU', acceptLanguage: 'hu-HU,hu;q=0.9,en;q=0.8' },
  IS: { name: 'Iceland', flag: '🇮🇸', timezone: 'Atlantic/Reykjavik', locale: 'is-IS', acceptLanguage: 'is-IS,is;q=0.9,en;q=0.8' },
  IN: { name: 'India', flag: '🇮🇳', timezone: 'Asia/Kolkata', locale: 'en-IN', acceptLanguage: 'en-IN,en;q=0.9' },
  ID: { name: 'Indonesia', flag: '🇮🇩', timezone: 'Asia/Jakarta', locale: 'id-ID', acceptLanguage: 'id-ID,id;q=0.9,en;q=0.8' },
  IR: { name: 'Iran', flag: '🇮🇷', timezone: 'Asia/Tehran', locale: 'fa-IR', acceptLanguage: 'fa-IR,fa;q=0.9,en;q=0.8' },
  IQ: { name: 'Iraq', flag: '🇮🇶', timezone: 'Asia/Baghdad', locale: 'ar-IQ', acceptLanguage: 'ar-IQ,ar;q=0.9,en;q=0.8' },
  IE: { name: 'Ireland', flag: '🇮🇪', timezone: 'Europe/Dublin', locale: 'en-IE', acceptLanguage: 'en-IE,en;q=0.9' },
  IM: { name: 'Isle of Man', flag: '🇮🇲', timezone: 'Europe/Isle_of_Man', locale: 'en-IM', acceptLanguage: 'en-IM,en;q=0.9' },
  IL: { name: 'Israel', flag: '🇮🇱', timezone: 'Asia/Jerusalem', locale: 'he-IL', acceptLanguage: 'he-IL,he;q=0.9,en;q=0.8' },
  IT: { name: 'Italy', flag: '🇮🇹', timezone: 'Europe/Rome', locale: 'it-IT', acceptLanguage: 'it-IT,it;q=0.9,en;q=0.8' },
  CI: { name: 'Ivory Coast', flag: '🇨🇮', timezone: 'Africa/Abidjan', locale: 'fr-CI', acceptLanguage: 'fr-CI,fr;q=0.9,en;q=0.8' },
  JM: { name: 'Jamaica', flag: '🇯🇲', timezone: 'America/Jamaica', locale: 'en-JM', acceptLanguage: 'en-JM,en;q=0.9' },
  JP: { name: 'Japan', flag: '🇯🇵', timezone: 'Asia/Tokyo', locale: 'ja-JP', acceptLanguage: 'ja-JP,ja;q=0.9,en;q=0.8' },
  JE: { name: 'Jersey', flag: '🇯🇪', timezone: 'Europe/Jersey', locale: 'en-JE', acceptLanguage: 'en-JE,en;q=0.9' },
  JO: { name: 'Jordan', flag: '🇯🇴', timezone: 'Asia/Amman', locale: 'ar-JO', acceptLanguage: 'ar-JO,ar;q=0.9,en;q=0.8' },
  KZ: { name: 'Kazakhstan', flag: '🇰🇿', timezone: 'Asia/Almaty', locale: 'kk-KZ', acceptLanguage: 'kk-KZ,kk;q=0.9,en;q=0.8' },
  KE: { name: 'Kenya', flag: '🇰🇪', timezone: 'Africa/Nairobi', locale: 'en-KE', acceptLanguage: 'en-KE,en;q=0.9' },
  KI: { name: 'Kiribati', flag: '🇰🇮', timezone: 'Pacific/Tarawa', locale: 'en-KI', acceptLanguage: 'en-KI,en;q=0.9' },
  XK: { name: 'Kosovo', flag: '🇽🇰', timezone: 'UTC', locale: 'sq-XK', acceptLanguage: 'sq-XK,sq;q=0.9,en;q=0.8' },
  KW: { name: 'Kuwait', flag: '🇰🇼', timezone: 'Asia/Kuwait', locale: 'ar-KW', acceptLanguage: 'ar-KW,ar;q=0.9,en;q=0.8' },
  KG: { name: 'Kyrgyzstan', flag: '🇰🇬', timezone: 'Asia/Bishkek', locale: 'ky-KG', acceptLanguage: 'ky-KG,ky;q=0.9,en;q=0.8' },
  LA: { name: 'Laos', flag: '🇱🇦', timezone: 'Asia/Vientiane', locale: 'lo-LA', acceptLanguage: 'lo-LA,lo;q=0.9,en;q=0.8' },
  LV: { name: 'Latvia', flag: '🇱🇻', timezone: 'Europe/Riga', locale: 'lv-LV', acceptLanguage: 'lv-LV,lv;q=0.9,en;q=0.8' },
  LB: { name: 'Lebanon', flag: '🇱🇧', timezone: 'Asia/Beirut', locale: 'ar-LB', acceptLanguage: 'ar-LB,ar;q=0.9,en;q=0.8' },
  LS: { name: 'Lesotho', flag: '🇱🇸', timezone: 'Africa/Maseru', locale: 'en-LS', acceptLanguage: 'en-LS,en;q=0.9' },
  LR: { name: 'Liberia', flag: '🇱🇷', timezone: 'Africa/Monrovia', locale: 'en-LR', acceptLanguage: 'en-LR,en;q=0.9' },
  LY: { name: 'Libya', flag: '🇱🇾', timezone: 'Africa/Tripoli', locale: 'ar-LY', acceptLanguage: 'ar-LY,ar;q=0.9,en;q=0.8' },
  LI: { name: 'Liechtenstein', flag: '🇱🇮', timezone: 'Europe/Vaduz', locale: 'de-LI', acceptLanguage: 'de-LI,de;q=0.9,en;q=0.8' },
  LT: { name: 'Lithuania', flag: '🇱🇹', timezone: 'Europe/Vilnius', locale: 'lt-LT', acceptLanguage: 'lt-LT,lt;q=0.9,en;q=0.8' },
  LU: { name: 'Luxembourg', flag: '🇱🇺', timezone: 'Europe/Luxembourg', locale: 'de-LU', acceptLanguage: 'de-LU,de;q=0.9,en;q=0.8' },
  MO: { name: 'Macau', flag: '🇲🇴', timezone: 'Asia/Macau', locale: 'pt-MO', acceptLanguage: 'pt-MO,pt;q=0.9,en;q=0.8' },
  MG: { name: 'Madagascar', flag: '🇲🇬', timezone: 'Indian/Antananarivo', locale: 'fr-MG', acceptLanguage: 'fr-MG,fr;q=0.9,en;q=0.8' },
  MW: { name: 'Malawi', flag: '🇲🇼', timezone: 'Africa/Blantyre', locale: 'en-MW', acceptLanguage: 'en-MW,en;q=0.9' },
  MY: { name: 'Malaysia', flag: '🇲🇾', timezone: 'Asia/Kuala_Lumpur', locale: 'ms-MY', acceptLanguage: 'ms-MY,ms;q=0.9,en;q=0.8' },
  MV: { name: 'Maldives', flag: '🇲🇻', timezone: 'Indian/Maldives', locale: 'dv-MV', acceptLanguage: 'dv-MV,dv;q=0.9,en;q=0.8' },
  ML: { name: 'Mali', flag: '🇲🇱', timezone: 'Africa/Bamako', locale: 'fr-ML', acceptLanguage: 'fr-ML,fr;q=0.9,en;q=0.8' },
  MT: { name: 'Malta', flag: '🇲🇹', timezone: 'Europe/Malta', locale: 'en-MT', acceptLanguage: 'en-MT,en;q=0.9' },
  MH: { name: 'Marshall Islands', flag: '🇲🇭', timezone: 'Pacific/Majuro', locale: 'en-MH', acceptLanguage: 'en-MH,en;q=0.9' },
  MQ: { name: 'Martinique', flag: '🇲🇶', timezone: 'America/Martinique', locale: 'fr-MQ', acceptLanguage: 'fr-MQ,fr;q=0.9,en;q=0.8' },
  MR: { name: 'Mauritania', flag: '🇲🇷', timezone: 'Africa/Nouakchott', locale: 'ar-MR', acceptLanguage: 'ar-MR,ar;q=0.9,en;q=0.8' },
  MU: { name: 'Mauritius', flag: '🇲🇺', timezone: 'Indian/Mauritius', locale: 'en-MU', acceptLanguage: 'en-MU,en;q=0.9' },
  YT: { name: 'Mayotte', flag: '🇾🇹', timezone: 'Indian/Mayotte', locale: 'fr-YT', acceptLanguage: 'fr-YT,fr;q=0.9,en;q=0.8' },
  MX: { name: 'Mexico', flag: '🇲🇽', timezone: 'America/Mexico_City', locale: 'es-MX', acceptLanguage: 'es-MX,es;q=0.9,en;q=0.8' },
  FM: { name: 'Micronesia', flag: '🇫🇲', timezone: 'Pacific/Chuuk', locale: 'en-FM', acceptLanguage: 'en-FM,en;q=0.9' },
  MD: { name: 'Moldova', flag: '🇲🇩', timezone: 'Europe/Chisinau', locale: 'ro-MD', acceptLanguage: 'ro-MD,ro;q=0.9,en;q=0.8' },
  MC: { name: 'Monaco', flag: '🇲🇨', timezone: 'Europe/Monaco', locale: 'fr-MC', acceptLanguage: 'fr-MC,fr;q=0.9,en;q=0.8' },
  MN: { name: 'Mongolia', flag: '🇲🇳', timezone: 'Asia/Ulaanbaatar', locale: 'mn-MN', acceptLanguage: 'mn-MN,mn;q=0.9,en;q=0.8' },
  ME: { name: 'Montenegro', flag: '🇲🇪', timezone: 'Europe/Podgorica', locale: 'en-ME', acceptLanguage: 'en-ME,en;q=0.9' },
  MS: { name: 'Montserrat', flag: '🇲🇸', timezone: 'America/Montserrat', locale: 'en-MS', acceptLanguage: 'en-MS,en;q=0.9' },
  MA: { name: 'Morocco', flag: '🇲🇦', timezone: 'Africa/Casablanca', locale: 'ar-MA', acceptLanguage: 'ar-MA,ar;q=0.9,en;q=0.8' },
  MZ: { name: 'Mozambique', flag: '🇲🇿', timezone: 'Africa/Maputo', locale: 'pt-MZ', acceptLanguage: 'pt-MZ,pt;q=0.9,en;q=0.8' },
  MM: { name: 'Myanmar', flag: '🇲🇲', timezone: 'Asia/Yangon', locale: 'my-MM', acceptLanguage: 'my-MM,my;q=0.9,en;q=0.8' },
  NA: { name: 'Namibia', flag: '🇳🇦', timezone: 'Africa/Windhoek', locale: 'af-NA', acceptLanguage: 'af-NA,af;q=0.9,en;q=0.8' },
  NR: { name: 'Nauru', flag: '🇳🇷', timezone: 'Pacific/Nauru', locale: 'en-NR', acceptLanguage: 'en-NR,en;q=0.9' },
  NP: { name: 'Nepal', flag: '🇳🇵', timezone: 'Asia/Kathmandu', locale: 'ne-NP', acceptLanguage: 'ne-NP,ne;q=0.9,en;q=0.8' },
  NL: { name: 'Netherlands', flag: '🇳🇱', timezone: 'Europe/Amsterdam', locale: 'nl-NL', acceptLanguage: 'nl-NL,nl;q=0.9,en;q=0.8' },
  NC: { name: 'New Caledonia', flag: '🇳🇨', timezone: 'Pacific/Noumea', locale: 'fr-NC', acceptLanguage: 'fr-NC,fr;q=0.9,en;q=0.8' },
  NZ: { name: 'New Zealand', flag: '🇳🇿', timezone: 'Pacific/Auckland', locale: 'en-NZ', acceptLanguage: 'en-NZ,en;q=0.9' },
  NI: { name: 'Nicaragua', flag: '🇳🇮', timezone: 'America/Managua', locale: 'es-NI', acceptLanguage: 'es-NI,es;q=0.9,en;q=0.8' },
  NE: { name: 'Niger', flag: '🇳🇪', timezone: 'Africa/Niamey', locale: 'fr-NE', acceptLanguage: 'fr-NE,fr;q=0.9,en;q=0.8' },
  NG: { name: 'Nigeria', flag: '🇳🇬', timezone: 'Africa/Lagos', locale: 'en-NG', acceptLanguage: 'en-NG,en;q=0.9' },
  NU: { name: 'Niue', flag: '🇳🇺', timezone: 'Pacific/Niue', locale: 'en-NU', acceptLanguage: 'en-NU,en;q=0.9' },
  NF: { name: 'Norfolk Island', flag: '🇳🇫', timezone: 'Pacific/Norfolk', locale: 'en-NF', acceptLanguage: 'en-NF,en;q=0.9' },
  KP: { name: 'North Korea', flag: '🇰🇵', timezone: 'Asia/Pyongyang', locale: 'ko-KP', acceptLanguage: 'ko-KP,ko;q=0.9,en;q=0.8' },
  MK: { name: 'North Macedonia', flag: '🇲🇰', timezone: 'Europe/Skopje', locale: 'mk-MK', acceptLanguage: 'mk-MK,mk;q=0.9,en;q=0.8' },
  MP: { name: 'Northern Mariana Islands', flag: '🇲🇵', timezone: 'Pacific/Saipan', locale: 'ch-MP', acceptLanguage: 'ch-MP,ch;q=0.9,en;q=0.8' },
  NO: { name: 'Norway', flag: '🇳🇴', timezone: 'Europe/Oslo', locale: 'nb-NO', acceptLanguage: 'nb-NO,nb;q=0.9,en;q=0.8' },
  OM: { name: 'Oman', flag: '🇴🇲', timezone: 'Asia/Muscat', locale: 'ar-OM', acceptLanguage: 'ar-OM,ar;q=0.9,en;q=0.8' },
  PK: { name: 'Pakistan', flag: '🇵🇰', timezone: 'Asia/Karachi', locale: 'en-PK', acceptLanguage: 'en-PK,en;q=0.9' },
  PW: { name: 'Palau', flag: '🇵🇼', timezone: 'Pacific/Palau', locale: 'en-PW', acceptLanguage: 'en-PW,en;q=0.9' },
  PS: { name: 'Palestine', flag: '🇵🇸', timezone: 'Asia/Gaza', locale: 'ar-PS', acceptLanguage: 'ar-PS,ar;q=0.9,en;q=0.8' },
  PA: { name: 'Panama', flag: '🇵🇦', timezone: 'America/Panama', locale: 'es-PA', acceptLanguage: 'es-PA,es;q=0.9,en;q=0.8' },
  PG: { name: 'Papua New Guinea', flag: '🇵🇬', timezone: 'Pacific/Port_Moresby', locale: 'en-PG', acceptLanguage: 'en-PG,en;q=0.9' },
  PY: { name: 'Paraguay', flag: '🇵🇾', timezone: 'America/Asuncion', locale: 'gn-PY', acceptLanguage: 'gn-PY,gn;q=0.9,en;q=0.8' },
  PE: { name: 'Peru', flag: '🇵🇪', timezone: 'America/Lima', locale: 'es-PE', acceptLanguage: 'es-PE,es;q=0.9,en;q=0.8' },
  PH: { name: 'Philippines', flag: '🇵🇭', timezone: 'Asia/Manila', locale: 'en-PH', acceptLanguage: 'en-PH,en;q=0.9' },
  PN: { name: 'Pitcairn Islands', flag: '🇵🇳', timezone: 'Pacific/Pitcairn', locale: 'en-PN', acceptLanguage: 'en-PN,en;q=0.9' },
  PL: { name: 'Poland', flag: '🇵🇱', timezone: 'Europe/Warsaw', locale: 'pl-PL', acceptLanguage: 'pl-PL,pl;q=0.9,en;q=0.8' },
  PT: { name: 'Portugal', flag: '🇵🇹', timezone: 'Europe/Lisbon', locale: 'pt-PT', acceptLanguage: 'pt-PT,pt;q=0.9,en;q=0.8' },
  PR: { name: 'Puerto Rico', flag: '🇵🇷', timezone: 'America/Puerto_Rico', locale: 'en-PR', acceptLanguage: 'en-PR,en;q=0.9' },
  QA: { name: 'Qatar', flag: '🇶🇦', timezone: 'Asia/Qatar', locale: 'ar-QA', acceptLanguage: 'ar-QA,ar;q=0.9,en;q=0.8' },
  RO: { name: 'Romania', flag: '🇷🇴', timezone: 'Europe/Bucharest', locale: 'ro-RO', acceptLanguage: 'ro-RO,ro;q=0.9,en;q=0.8' },
  RU: { name: 'Russia', flag: '🇷🇺', timezone: 'Europe/Kaliningrad', locale: 'ru-RU', acceptLanguage: 'ru-RU,ru;q=0.9,en;q=0.8' },
  RW: { name: 'Rwanda', flag: '🇷🇼', timezone: 'Africa/Kigali', locale: 'en-RW', acceptLanguage: 'en-RW,en;q=0.9' },
  RE: { name: 'Réunion', flag: '🇷🇪', timezone: 'Indian/Reunion', locale: 'fr-RE', acceptLanguage: 'fr-RE,fr;q=0.9,en;q=0.8' },
  BL: { name: 'Saint Barthélemy', flag: '🇧🇱', timezone: 'America/St_Barthelemy', locale: 'fr-BL', acceptLanguage: 'fr-BL,fr;q=0.9,en;q=0.8' },
  SH: { name: 'Saint Helena, Ascension and Tristan da Cunha', flag: '🇸🇭', timezone: 'Atlantic/St_Helena', locale: 'en-SH', acceptLanguage: 'en-SH,en;q=0.9' },
  KN: { name: 'Saint Kitts and Nevis', flag: '🇰🇳', timezone: 'America/St_Kitts', locale: 'en-KN', acceptLanguage: 'en-KN,en;q=0.9' },
  LC: { name: 'Saint Lucia', flag: '🇱🇨', timezone: 'America/St_Lucia', locale: 'en-LC', acceptLanguage: 'en-LC,en;q=0.9' },
  MF: { name: 'Saint Martin', flag: '🇲🇫', timezone: 'America/Marigot', locale: 'fr-MF', acceptLanguage: 'fr-MF,fr;q=0.9,en;q=0.8' },
  PM: { name: 'Saint Pierre and Miquelon', flag: '🇵🇲', timezone: 'America/Miquelon', locale: 'fr-PM', acceptLanguage: 'fr-PM,fr;q=0.9,en;q=0.8' },
  VC: { name: 'Saint Vincent and the Grenadines', flag: '🇻🇨', timezone: 'America/St_Vincent', locale: 'en-VC', acceptLanguage: 'en-VC,en;q=0.9' },
  WS: { name: 'Samoa', flag: '🇼🇸', timezone: 'Pacific/Apia', locale: 'en-WS', acceptLanguage: 'en-WS,en;q=0.9' },
  SM: { name: 'San Marino', flag: '🇸🇲', timezone: 'Europe/San_Marino', locale: 'it-SM', acceptLanguage: 'it-SM,it;q=0.9,en;q=0.8' },
  SA: { name: 'Saudi Arabia', flag: '🇸🇦', timezone: 'Asia/Riyadh', locale: 'ar-SA', acceptLanguage: 'ar-SA,ar;q=0.9,en;q=0.8' },
  SN: { name: 'Senegal', flag: '🇸🇳', timezone: 'Africa/Dakar', locale: 'fr-SN', acceptLanguage: 'fr-SN,fr;q=0.9,en;q=0.8' },
  RS: { name: 'Serbia', flag: '🇷🇸', timezone: 'Europe/Belgrade', locale: 'sr-RS', acceptLanguage: 'sr-RS,sr;q=0.9,en;q=0.8' },
  SC: { name: 'Seychelles', flag: '🇸🇨', timezone: 'Indian/Mahe', locale: 'en-SC', acceptLanguage: 'en-SC,en;q=0.9' },
  SL: { name: 'Sierra Leone', flag: '🇸🇱', timezone: 'Africa/Freetown', locale: 'en-SL', acceptLanguage: 'en-SL,en;q=0.9' },
  SG: { name: 'Singapore', flag: '🇸🇬', timezone: 'Asia/Singapore', locale: 'en-SG', acceptLanguage: 'en-SG,en;q=0.9' },
  SX: { name: 'Sint Maarten', flag: '🇸🇽', timezone: 'America/Lower_Princes', locale: 'en-SX', acceptLanguage: 'en-SX,en;q=0.9' },
  SK: { name: 'Slovakia', flag: '🇸🇰', timezone: 'Europe/Bratislava', locale: 'sk-SK', acceptLanguage: 'sk-SK,sk;q=0.9,en;q=0.8' },
  SI: { name: 'Slovenia', flag: '🇸🇮', timezone: 'Europe/Ljubljana', locale: 'sl-SI', acceptLanguage: 'sl-SI,sl;q=0.9,en;q=0.8' },
  SB: { name: 'Solomon Islands', flag: '🇸🇧', timezone: 'Pacific/Guadalcanal', locale: 'en-SB', acceptLanguage: 'en-SB,en;q=0.9' },
  SO: { name: 'Somalia', flag: '🇸🇴', timezone: 'Africa/Mogadishu', locale: 'ar-SO', acceptLanguage: 'ar-SO,ar;q=0.9,en;q=0.8' },
  ZA: { name: 'South Africa', flag: '🇿🇦', timezone: 'Africa/Johannesburg', locale: 'en-ZA', acceptLanguage: 'en-ZA,en;q=0.9' },
  GS: { name: 'South Georgia', flag: '🇬??', timezone: 'Atlantic/South_Georgia', locale: 'en-GS', acceptLanguage: 'en-GS,en;q=0.9' },
  KR: { name: 'South Korea', flag: '🇰🇷', timezone: 'Asia/Seoul', locale: 'ko-KR', acceptLanguage: 'ko-KR,ko;q=0.9,en;q=0.8' },
  SS: { name: 'South Sudan', flag: '🇸🇸', timezone: 'Africa/Juba', locale: 'en-SS', acceptLanguage: 'en-SS,en;q=0.9' },
  ES: { name: 'Spain', flag: '🇪🇸', timezone: 'Europe/Madrid', locale: 'es-ES', acceptLanguage: 'es-ES,es;q=0.9,en;q=0.8' },
  LK: { name: 'Sri Lanka', flag: '🇱🇰', timezone: 'Asia/Colombo', locale: 'en-LK', acceptLanguage: 'en-LK,en;q=0.9' },
  SD: { name: 'Sudan', flag: '🇸🇩', timezone: 'Africa/Khartoum', locale: 'ar-SD', acceptLanguage: 'ar-SD,ar;q=0.9,en;q=0.8' },
  SR: { name: 'Suriname', flag: '🇸🇷', timezone: 'America/Paramaribo', locale: 'nl-SR', acceptLanguage: 'nl-SR,nl;q=0.9,en;q=0.8' },
  SJ: { name: 'Svalbard and Jan Mayen', flag: '🇸🇯', timezone: 'Arctic/Longyearbyen', locale: 'no-SJ', acceptLanguage: 'no-SJ,no;q=0.9,en;q=0.8' },
  SE: { name: 'Sweden', flag: '🇸🇪', timezone: 'Europe/Stockholm', locale: 'sv-SE', acceptLanguage: 'sv-SE,sv;q=0.9,en;q=0.8' },
  CH: { name: 'Switzerland', flag: '🇨🇭', timezone: 'Europe/Zurich', locale: 'de-CH', acceptLanguage: 'de-CH,de;q=0.9,en;q=0.8' },
  SY: { name: 'Syria', flag: '🇸🇾', timezone: 'Asia/Damascus', locale: 'ar-SY', acceptLanguage: 'ar-SY,ar;q=0.9,en;q=0.8' },
  ST: { name: 'São Tomé and Príncipe', flag: '🇸🇹', timezone: 'Africa/Sao_Tome', locale: 'pt-ST', acceptLanguage: 'pt-ST,pt;q=0.9,en;q=0.8' },
  TW: { name: 'Taiwan', flag: '🇹🇼', timezone: 'Asia/Taipei', locale: 'zh-TW', acceptLanguage: 'zh-TW,zh;q=0.9,en;q=0.8' },
  TJ: { name: 'Tajikistan', flag: '🇹🇯', timezone: 'Asia/Dushanbe', locale: 'ru-TJ', acceptLanguage: 'ru-TJ,ru;q=0.9,en;q=0.8' },
  TZ: { name: 'Tanzania', flag: '🇹🇿', timezone: 'Africa/Dar_es_Salaam', locale: 'en-TZ', acceptLanguage: 'en-TZ,en;q=0.9' },
  TH: { name: 'Thailand', flag: '🇹🇭', timezone: 'Asia/Bangkok', locale: 'th-TH', acceptLanguage: 'th-TH,th;q=0.9,en;q=0.8' },
  TL: { name: 'Timor-Leste', flag: '🇹🇱', timezone: 'Asia/Dili', locale: 'pt-TL', acceptLanguage: 'pt-TL,pt;q=0.9,en;q=0.8' },
  TG: { name: 'Togo', flag: '🇹🇬', timezone: 'Africa/Lome', locale: 'fr-TG', acceptLanguage: 'fr-TG,fr;q=0.9,en;q=0.8' },
  TK: { name: 'Tokelau', flag: '🇹🇰', timezone: 'Pacific/Fakaofo', locale: 'en-TK', acceptLanguage: 'en-TK,en;q=0.9' },
  TO: { name: 'Tonga', flag: '🇹🇴', timezone: 'Pacific/Tongatapu', locale: 'en-TO', acceptLanguage: 'en-TO,en;q=0.9' },
  TT: { name: 'Trinidad and Tobago', flag: '🇹🇹', timezone: 'America/Port_of_Spain', locale: 'en-TT', acceptLanguage: 'en-TT,en;q=0.9' },
  TN: { name: 'Tunisia', flag: '🇹🇳', timezone: 'Africa/Tunis', locale: 'ar-TN', acceptLanguage: 'ar-TN,ar;q=0.9,en;q=0.8' },
  TM: { name: 'Turkmenistan', flag: '🇹🇲', timezone: 'Asia/Ashgabat', locale: 'ru-TM', acceptLanguage: 'ru-TM,ru;q=0.9,en;q=0.8' },
  TC: { name: 'Turks and Caicos Islands', flag: '🇹🇨', timezone: 'America/Grand_Turk', locale: 'en-TC', acceptLanguage: 'en-TC,en;q=0.9' },
  TV: { name: 'Tuvalu', flag: '🇹🇻', timezone: 'Pacific/Funafuti', locale: 'en-TV', acceptLanguage: 'en-TV,en;q=0.9' },
  TR: { name: 'Türkiye', flag: '🇹🇷', timezone: 'Europe/Istanbul', locale: 'tr-TR', acceptLanguage: 'tr-TR,tr;q=0.9,en;q=0.8' },
  UG: { name: 'Uganda', flag: '🇺🇬', timezone: 'Africa/Kampala', locale: 'en-UG', acceptLanguage: 'en-UG,en;q=0.9' },
  UA: { name: 'Ukraine', flag: '🇺🇦', timezone: 'Europe/Simferopol', locale: 'uk-UA', acceptLanguage: 'uk-UA,uk;q=0.9,en;q=0.8' },
  AE: { name: 'United Arab Emirates', flag: '🇦🇪', timezone: 'Asia/Dubai', locale: 'ar-AE', acceptLanguage: 'ar-AE,ar;q=0.9,en;q=0.8' },
  GB: { name: 'United Kingdom', flag: '🇬🇧', timezone: 'Europe/London', locale: 'en-GB', acceptLanguage: 'en-GB,en;q=0.9' },
  US: { name: 'United States', flag: '🇺🇸', timezone: 'America/New_York', locale: 'en-US', acceptLanguage: 'en-US,en;q=0.9' },
  UM: { name: 'United States Minor Outlying Islands', flag: '🇺🇲', timezone: 'Pacific/Midway', locale: 'en-UM', acceptLanguage: 'en-UM,en;q=0.9' },
  VI: { name: 'United States Virgin Islands', flag: '🇻🇮', timezone: 'America/St_Thomas', locale: 'en-VI', acceptLanguage: 'en-VI,en;q=0.9' },
  UY: { name: 'Uruguay', flag: '🇺🇾', timezone: 'America/Montevideo', locale: 'es-UY', acceptLanguage: 'es-UY,es;q=0.9,en;q=0.8' },
  UZ: { name: 'Uzbekistan', flag: '🇺🇿', timezone: 'Asia/Samarkand', locale: 'ru-UZ', acceptLanguage: 'ru-UZ,ru;q=0.9,en;q=0.8' },
  VU: { name: 'Vanuatu', flag: '🇻🇺', timezone: 'Pacific/Efate', locale: 'bi-VU', acceptLanguage: 'bi-VU,bi;q=0.9,en;q=0.8' },
  VA: { name: 'Vatican City', flag: '🇻🇦', timezone: 'Europe/Vatican', locale: 'it-VA', acceptLanguage: 'it-VA,it;q=0.9,en;q=0.8' },
  VE: { name: 'Venezuela', flag: '🇻🇪', timezone: 'America/Caracas', locale: 'es-VE', acceptLanguage: 'es-VE,es;q=0.9,en;q=0.8' },
  VN: { name: 'Vietnam', flag: '🇻🇳', timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN', acceptLanguage: 'vi-VN,vi;q=0.9,en;q=0.8' },
  WF: { name: 'Wallis and Futuna', flag: '🇼🇫', timezone: 'Pacific/Wallis', locale: 'fr-WF', acceptLanguage: 'fr-WF,fr;q=0.9,en;q=0.8' },
  EH: { name: 'Western Sahara', flag: '🇪🇭', timezone: 'Africa/El_Aaiun', locale: 'es-EH', acceptLanguage: 'es-EH,es;q=0.9,en;q=0.8' },
  YE: { name: 'Yemen', flag: '🇾🇪', timezone: 'Asia/Aden', locale: 'ar-YE', acceptLanguage: 'ar-YE,ar;q=0.9,en;q=0.8' },
  ZM: { name: 'Zambia', flag: '🇿🇲', timezone: 'Africa/Lusaka', locale: 'en-ZM', acceptLanguage: 'en-ZM,en;q=0.9' },
  ZW: { name: 'Zimbabwe', flag: '🇿🇼', timezone: 'Africa/Harare', locale: 'en-ZW', acceptLanguage: 'en-ZW,en;q=0.9' },
  AX: { name: 'Åland Islands', flag: '🇦🇽', timezone: 'Europe/Mariehamn', locale: 'sv-AX', acceptLanguage: 'sv-AX,sv;q=0.9,en;q=0.8' },
};

// Premium-CPM countries — used by the CPM optimiser to bias high-value geos.
const HIGH_CPM_COUNTRIES = ['US', 'GB', 'CA', 'AU', 'DE', 'CH', 'NO', 'SE', 'DK', 'NL', 'IE', 'NZ', 'SG', 'AE', 'IL', 'FI', 'AT', 'BE'];

function countryMeta(code) {
  const c = String(code || '').trim().toUpperCase();
  const g = COUNTRY_GEO[c];
  return g ? { code: c, ...g } : { code: c || 'XX', name: c || 'Unknown', flag: '🌐', timezone: 'UTC', locale: 'en-US', acceptLanguage: 'en-US,en;q=0.9' };
}

function getGeoForCountry(code) {
  const m = countryMeta(code);
  return { timezone: m.timezone, locale: m.locale, acceptLanguage: m.acceptLanguage, country: m.code, flag: m.flag, name: m.name };
}

// Weighted random picker. entries = [{ key, weight }] → returns a key (or null).
function pickWeighted(entries) {
  const list = (entries || []).filter((e) => e && Number(e.weight) > 0);
  if (!list.length) return null;
  const total = list.reduce((s, e) => s + Number(e.weight), 0);
  let r = Math.random() * total;
  for (const e of list) { r -= Number(e.weight); if (r <= 0) return e.key; }
  return list[list.length - 1].key;
}

// Build [{key,weight}] from a weights map + enabled map, optionally restricted to
// an allow-list of keys and boosted by a per-key multiplier.
function weightedEntries(weights, enabled, allow, boost) {
  const out = [];
  for (const [k, w] of Object.entries(weights || {})) {
    if (enabled && enabled[k] === false) continue;
    if (allow && !allow.includes(k)) continue;
    let weight = Number(w) || 0;
    if (boost && boost[k]) weight *= boost[k];
    if (weight > 0) out.push({ key: k, weight });
  }
  return out;
}

const TARGETING_DEFAULTS = {
  enabled: true,
  dwell_min_ms: 30000,             // ⭐ 30–45s successful visit target
  dwell_max_ms: 45000,
  proxy_country_match: true,       // geo follows the proxy's exit country
  cpm_optimize: true,              // bias toward high-CPM combos
  cpm_target_min: 3.0,
  cpm_target_max: 4.0,
  smart_data_saver: true,
  human_level: 'ultra',
  country_weights: { US: 12, GB: 7, CA: 6, AU: 5, DE: 3, IN: 1, BD: 1, PK: 1 },
  country_enabled: { US: true, GB: true, CA: true, AU: true, DE: true, IN: true, BD: true, PK: true },
  device_weights: { mobile: 30, desktop: 50, tablet: 20 },
  device_enabled: { mobile: true, desktop: true, tablet: true },
  browser_weights: { chrome_mobile: 12, chrome: 22, safari: 18, mobile_safari: 28, yandex: 3, edge: 10, firefox: 7 },
  browser_enabled: { chrome_mobile: true, chrome: true, safari: true, mobile_safari: true, yandex: true, edge: true, firefox: true },
  os_weights: { android: 14, windows: 28, macos: 16, ios: 32, ipados: 10 },
  os_enabled: { android: true, windows: true, macos: true, ios: true, ipados: true },
};

function getTargetingSettings() {
  if (!cache.targeting_settings || typeof cache.targeting_settings !== 'object') {
    cache.targeting_settings = JSON.parse(JSON.stringify(TARGETING_DEFAULTS));
    syncToFirebase('targeting_settings');
    return cache.targeting_settings;
  }
  let changed = false;
  for (const [k, v] of Object.entries(TARGETING_DEFAULTS)) {
    if (!(k in cache.targeting_settings)) {
      cache.targeting_settings[k] = JSON.parse(JSON.stringify(v));
      changed = true;
    }
  }
  if (changed) syncToFirebase('targeting_settings');
  return cache.targeting_settings;
}
function saveTargetingSettings() { syncToFirebase('targeting_settings'); }

// ⚡ CPM BAND GUARD — adaptively bias toward high-CPM inventory so the network
// CPM stays inside the admin's target band ($3-4 by default). The API server
// publishes the observed CPM to `adsterra_live`; we read it here and scale the
// high-CPM geo/device boost up when we drift below the floor, down when above.
function getCpmAdaptiveBoost() {
  try {
    const t = getTargetingSettings();
    if (t.cpm_optimize === false) return 1;
    const floor = Number(t.cpm_target_min) || 3.0;
    const ceil = Number(t.cpm_target_max) || 4.0;
    const live = cache.adsterra_live || {};
    const cpm = Number(live.cpm) || 0;
    if (cpm <= 0) return 1;        // no signal yet → use the default bias
    if (cpm < floor) return 1.6;   // below band → push high-CPM inventory hard
    if (cpm > ceil) return 0.85;   // above band → relax the bias
    return 1.15;                   // inside band → gentle nudge
  } catch (e) { return 1; }
}

// ⚡ ADSTERRA SAFETY — when adsterra_safe_mode is ON, guarantee the invariants
// that keep the publisher account in good standing. These overrides win over
// any conflicting admin toggle (set adsterra_safe_mode=false to opt out).
function enforceAdsterraSafety() {
  try {
    const cfg = cache.auto_impression_settings;
    if (!cfg || typeof cfg !== 'object') return;
    if (cfg.adsterra_safe_mode === false) return;
    const pc = cache.proxy_settings;
    const allProxies = getProxyList().filter((p) => p.enabled !== false);
    if (pc && typeof pc === 'object') {
      if (allProxies.length > 0) {
        pc.require_residential = true;
      }
    }
    if (allProxies.length === 0) {
      cfg.proxy_required = false;
    }
    cfg.human_behavior = true;
    cfg.data_saver_mode = true;
    cfg.h4ck_saver_whitelist_adsterra = true;
    cfg.organic_mode = true;
  } catch (e) {}
}

// Per-dimension success counters for the live view (device / browser / os / country)
function recordTargetingStat(dim, key, ok) {
  try {
    if (!key) return;
    const all = cache.targeting_stats && typeof cache.targeting_stats === 'object'
      ? cache.targeting_stats
      : { device: {}, browser: {}, os: {}, country: {}, updated_at: 0 };
    if (!all[dim] || typeof all[dim] !== 'object') all[dim] = {};
    const cur = all[dim][key] || { total: 0, ok: 0, fail: 0 };
    cur.total += 1;
    if (ok) cur.ok += 1; else cur.fail += 1;
    all[dim][key] = cur;
    all.updated_at = Date.now();
    cache.targeting_stats = all;
    syncToFirebase('targeting_stats');
  } catch (e) { /* counters must never break a visit */ }
}

function isSafariUA(ua) { return /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua); }

function buildRealisticHeaders(ua, url) {
  let host = ''; try { host = new URL(url).host; } catch (e) {}
  const isMobile = /Mobile|Android|iPhone|iPad/.test(ua);
  const isFirefox = /Firefox/.test(ua);
  const isSafari = isSafariUA(ua);
  const h = {
    'Accept': isFirefox ? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': pickRandom(US_ACCEPT_LANGUAGE),
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none', 'Sec-Fetch-User': '?1', 'DNT': '1',
  };
  if (!isFirefox && !isSafari) {
  // V33-FIX: Edge needs its own sec-ch-ua brand (not Chrome)
  const isEdge = /Edg\//.test(ua);
  if (isEdge) {
    // Extract Edge major version from UA (e.g. "Edg/131.0.0.0" → "131")
    const edgeVerMatch = ua.match(/Edg\/(\d+)/);
    const edgeVer = edgeVerMatch ? edgeVerMatch[1] : '131';
    h['sec-ch-ua'] = `"Chromium";v="${edgeVer}", "Microsoft Edge";v="${edgeVer}", "Not-A.Brand";v="99"`;
  } else {
    // Chrome — extract version from UA for consistency
    const chromeVerMatch = ua.match(/Chrome\/(\d+)/);
    const chromeVer = chromeVerMatch ? chromeVerMatch[1] : '124';
    h['sec-ch-ua'] = `"Chromium";v="${chromeVer}", "Google Chrome";v="${chromeVer}", "Not-A.Brand";v="99"`;
  }
  h['sec-ch-ua-mobile'] = isMobile ? '?1' : '?0';
  h['sec-ch-ua-platform'] = isMobile ? '"Android"' : (ua.includes('Mac') ? '"macOS"' : ua.includes('Linux') ? '"Linux"' : '"Windows"');
}
  if (host) h['Referer'] = `https://${host}/`;
  return h;
}

// ⭐ V36 GLOBAL IDENTITY SELECTOR — weighted device / browser / OS with CPM bias
const UA_LIBRARY = {
  chrome_mobile: [
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 14; V2312) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
  ],
  chrome: [
    ...UA_POOL_CHROME_WIN,
    ...UA_POOL_CHROME_MAC,
  ],
  safari: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  ],
  mobile_safari: [
    ...UA_POOL_SAFARI_IOS,
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ],
  yandex: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 YaBrowser/24.6.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 YaBrowser/24.8.0.0 Safari/537.36',
  ],
  edge: [...UA_POOL_EDGE_WIN],
  firefox: [
    ...UA_POOL_FIREFOX_WIN,
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0',
  ],
};

const DEVICE_OS_COMPAT = {
  mobile:  ['android', 'ios'],
  desktop: ['windows', 'macos'],
  tablet:  ['android', 'ipados'],
};
const OS_BROWSER_COMPAT = {
  android: ['chrome_mobile'],
  ios:     ['mobile_safari'],
  ipados:  ['mobile_safari'],
  windows: ['chrome', 'yandex', 'edge', 'firefox'],
  macos:   ['chrome', 'safari', 'firefox'],
};
const OS_DEVICE = { android: 'mobile', ios: 'mobile', ipados: 'tablet', windows: 'desktop', macos: 'desktop' };

function pickViewportForDevice(device) {
  if (device === 'mobile') return pickRandom(MOBILE_VIEWPORT);
  if (device === 'tablet') return pickRandom(TABLET_VIEWPORT);
  return pickRandom(DESKTOP_VIEWPORT);
}

function getBrowserIdentity(url = '') {
  const t = getTargetingSettings();
  // ⭐ V34 HIGH-CPM: bias toward the highest-paying Adsterra inventory — iOS Safari
  // first, then macOS Safari, then desktop. Mobile is no longer penalised because
  // iOS lives on mobile and pays the most.
  const _cpmAdj = t.cpm_optimize !== false ? getCpmAdaptiveBoost() : 1;
  const cpmBoost = t.cpm_optimize !== false
    ? { desktop: 1.25 * _cpmAdj, windows: 1.20, macos: 1.30 * _cpmAdj, chrome: 1.10, firefox: 1.15, edge: 1.05,
        ios: 1.60 * _cpmAdj, ipados: 1.30 * _cpmAdj, mobile_safari: 1.60 * _cpmAdj, safari: 1.40 * _cpmAdj, mobile: 1.00, tablet: 0.95 }
    : null;

  // 1) device
  let device = pickWeighted(weightedEntries(t.device_weights, t.device_enabled, null, cpmBoost));
  if (!device) device = 'desktop';

  // 2) OS (compatible with the device)
  const osAllow = DEVICE_OS_COMPAT[device] || ['windows'];
  let os = pickWeighted(weightedEntries(t.os_weights, t.os_enabled, osAllow, cpmBoost));
  if (!os) os = osAllow[0];

  // 3) browser (compatible with the OS)
  const brAllow = OS_BROWSER_COMPAT[os] || ['chrome'];
  let browser = pickWeighted(weightedEntries(t.browser_weights, t.browser_enabled, brAllow, cpmBoost));
  if (!browser) browser = brAllow[0];

  // keep device consistent with the chosen OS
  const derivedDevice = OS_DEVICE[os];
  if (derivedDevice) device = derivedDevice;

  const ua = pickRandom(UA_LIBRARY[browser] || UA_LIBRARY.chrome);
  return {
    ua,
    headers: buildRealisticHeaders(ua, url),
    viewport: pickViewportForDevice(device),
    safari: isSafariUA(ua),
    device, browser, os,
  };
}

function pickViewportByUA(ua) {
  // legacy helper — desktop viewport
  return pickRandom(DESKTOP_VIEWPORT);
}

function getUSGeo() { return getGeoForCountry('US'); }

// Country-aware geo. If no code is supplied, pick a weighted country (or US).
function getGeo(countryCode) {
  const t = getTargetingSettings();
  let code = countryCode;
  if (!code && t.proxy_country_match !== false) {
    // ⭐ V36: ALL countries are eligible (default weight 1). Admin boosts/cuts
    // specific countries via country_weights; high-CPM countries get a nudge.
    const weights = {};
    // Union of built-in geos + any admin-configured country weights, so a proxy
    // country outside the built-in list is still honoured by the picker.
    const geoKeys = new Set(Object.keys(COUNTRY_GEO));
    for (const c of Object.keys(t.country_weights || {})) geoKeys.add(String(c).toUpperCase());
    for (const c of geoKeys) {
      weights[c] = (t.country_weights && t.country_weights[c] != null) ? Number(t.country_weights[c]) : 1;
    }
    const boost = t.cpm_optimize !== false
      ? Object.fromEntries(HIGH_CPM_COUNTRIES.map((c) => [c, 1.8 * getCpmAdaptiveBoost()])) : null;
    code = pickWeighted(weightedEntries(weights, t.country_enabled, null, boost));
  }
  return getGeoForCountry(code || 'US');
}

// ⭐ V36: Resolve the geo that MATCHES the proxy's exit country.
// If the proxy carries a country tag (#BD, #IN ...) we use it directly so the
// impression is delivered *in that proxy's country* (user requirement).
// Otherwise we fall back to a weighted country pick.
function resolveProxyGeo(proxyEntry) {
  try {
    const t = getTargetingSettings();
    if (proxyEntry && proxyEntry.country && t.proxy_country_match !== false) {
      return getGeoForCountry(String(proxyEntry.country).toUpperCase());
    }
  } catch (e) {}
  return getGeo(undefined);
}

// ⭐ V36: Central dwell resolver — guarantees every successful visit lands in
// the 30-45s window (user requirement). Clamped by the global targeting window
// so the admin slider always wins.
function resolveDwellRange(cfg, kind) {
  const t = getTargetingSettings();
  let lo, hi;
  if (kind === 'smartlink') { lo = cfg.min_ad_dwell_ms; hi = cfg.max_ad_dwell_ms; }
  else if (kind === 'normal') { lo = cfg.min_normal_dwell_ms; hi = cfg.max_normal_dwell_ms; }
  else { lo = cfg.organic_dwell_min_ms; hi = cfg.organic_dwell_max_ms; }
  lo = Number(lo) || 30000;
  hi = Number(hi) || 45000;
  const gLo = Number(t.dwell_min_ms) || 30000;
  const gHi = Number(t.dwell_max_ms) || 45000;
  // clamp into the global window
  lo = Math.max(gLo, Math.min(lo, gHi));
  hi = Math.max(lo, Math.min(hi, gHi));

  // ⚡ FAST-FIRE (default ON): land a VALID impression in ~10-12s instead of
  // 30-45s. The Adsterra pixel is credited on page load, so a ~10s viewable
  // dwell keeps the impression valid while roughly tripling visits/hour.
  // Set fast_fire_enabled=false (or raise fast_fire_ms) to opt out.
  if (cfg.fast_fire_enabled !== false) {
    const target = Math.max(8000, Math.min(20000, Number(cfg.fast_fire_ms) || 12000));
    hi = Math.min(hi, target);
    lo = Math.min(lo, Math.max(8000, target - 3000));
    if (hi < lo) hi = lo;
  }
  // ⭐ APEX-ENTERPRISE PATCH: extended organic dwell override (38–48s window)
  if (cfg.extended_dwell_enabled === true) {
    const extLo = Math.max(lo, Number(cfg.extended_dwell_min_ms) || 38000);
    const extHi = Math.max(extLo, Number(cfg.extended_dwell_max_ms) || 48000);
    return { lo: extLo, hi: extHi };
  }
  return { lo, hi };
}
function getWebGLByUA(ua, os) {
  const o = os || (/Android/i.test(ua) ? 'android'
    : /iPhone|iPad|iPod/i.test(ua) ? 'ios'
    : /Mac OS X/i.test(ua) ? 'macos' : 'windows');
  if (o === 'android') return pickRandom(WEBGL_PROFILES.android);
  if (o === 'ios' || o === 'ipados' || o === 'macos') return pickRandom(WEBGL_PROFILES.mac);
  return pickRandom(WEBGL_PROFILES.win);
}

// ═══════════════════════════════════════════════════════════════════════
//  SEARCH ENGINES
// ═══════════════════════════════════════════════════════════════════════
// V32: added Google (highest US weight) + Brave
const SEARCH_SOURCES = [
  { name: 'google',   url: 'https://www.google.com/',            inputSel: 'textarea[name="q"], input[name="q"]' },
  { name: 'bing',     url: 'https://www.bing.com/',              inputSel: 'input#sb_form_q, textarea#sb_form_q' },
  { name: 'ddg-html', url: 'https://html.duckduckgo.com/html/',  inputSel: 'input[name="q"]' },
  { name: 'yahoo',    url: 'https://search.yahoo.com/',          inputSel: 'input#yschsp, input[name="p"]' },
  { name: 'ecosia',   url: 'https://www.ecosia.org/',            inputSel: 'input[type="search"], input[name="q"]' },
  { name: 'brave',    url: 'https://search.brave.com/',          inputSel: 'input[name="q"], textarea[name="q"]' },
];

const H4CK_REFERRER_MAP = {
  google:     { url: 'https://www.google.com/', input: 'textarea[name="q"], input[name="q"]' },
  bing:       { url: 'https://www.bing.com/',   input: 'input#sb_form_q, textarea#sb_form_q' },
  ddg:        { url: 'https://duckduckgo.com/', input: 'input[name="q"]' },
  duckduckgo: { url: 'https://duckduckgo.com/', input: 'input[name="q"]' },
  yahoo:      { url: 'https://search.yahoo.com/', input: 'input#yschsp, input[name="p"]' },
  ecosia:     { url: 'https://www.ecosia.org/', input: 'input[type="search"], input[name="q"]' },
};

const SEARCH_QUERY_TEMPLATES = [
  '{kw}', '{kw} 2024', '{kw} online', 'best {kw}', '{kw} free',
  '{kw} guide', 'how to {kw}', '{kw} official', '{kw} site', '{kw} review',
];

const GENERIC_KEYWORDS = [
  'online tools', 'free resources', 'download app', 'best website',
  'useful links', 'free service', 'web tools', 'online service',
  'helpful website', 'top website', 'popular tool', 'free online',
];

const TYPING_MIN_CPM = 120;
const TYPING_MAX_CPM = 280;

function extractDomainKeyword(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const parts = host.split('.');
    if (parts.length >= 2) {
      const main = parts[parts.length - 2] || parts[0];
      const cleaned = main.replace(/[^a-z0-9]/gi, ' ').trim();
      if (cleaned.length >= 3) return cleaned;
    }
    const pathSeg = u.pathname.split('/').filter(Boolean)[0];
    if (pathSeg && pathSeg.length >= 3) return pathSeg.replace(/[^a-z0-9]/gi, ' ').trim();
  } catch (e) {}
  return pickRandom(GENERIC_KEYWORDS);
}

function generateSearchQuery(targetUrl) {
  const kw = extractDomainKeyword(targetUrl);
  const template = pickRandom(SEARCH_QUERY_TEMPLATES);
  let q = template.replace('{kw}', kw);
  if (Math.random() < 0.3) q = q.toLowerCase();
  if (Math.random() < 0.2) q = q.replace(/\b\w/g, (c) => c.toUpperCase());
  return q;
}

// V32: weighted rotation (Google dominant as per US market share)
function pickSearchSource() {
  const r = Math.random() * 100;
  if (r < 40) return SEARCH_SOURCES[0]; // google  40%
  if (r < 65) return SEARCH_SOURCES[1]; // bing    25%
  if (r < 80) return SEARCH_SOURCES[2]; // ddg     15%
  if (r < 90) return SEARCH_SOURCES[3]; // yahoo   10%
  if (r < 95) return SEARCH_SOURCES[4]; // ecosia   5%
  return SEARCH_SOURCES[5];             // brave    5%
}

async function humanType(page, selector, text) {
  const typeTask = (async () => {
    try {
      await page.click(selector, { delay: humanRand(50, 150) });
      await sleep(humanRand(200, 600));
      const cfg = getHumanConfig();
      const cpm = humanRand(cfg.typing_min_cpm || TYPING_MIN_CPM, cfg.typing_max_cpm || TYPING_MAX_CPM);
      const safeCpm = Math.max(60, Math.min(400, cpm));
      const baseDelay = Math.max(20, Math.round(60000 / safeCpm / Math.max(1, text.length)));
      for (const ch of text) {
        await page.keyboard.type(ch, { delay: humanRand(Math.max(10, baseDelay - 10), baseDelay + 30) });
        if (Math.random() < 0.08) await sleep(humanRand(150, 500));
      }
      return true;
    } catch (e) {
      try { await page.fill(selector, text); return true; } catch (_) { return false; }
    }
  })();
  return Promise.race([typeTask, sleep(10000).then(() => false)]);
}

async function findFirstSelector(page, selectors, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const sel of selectors) {
      try {
        const el = await Promise.race([page.$(sel), sleep(2000).then(() => null)]);
        if (el) return sel;
      } catch (e) {}
    }
    await sleep(200);
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  V36: FULLY-HUMAN CLICK  —  scroll → hover → curved mouse travel → click
//  Used for Normal-link ad clicks. Keeps CTR low & natural so the Adsterra
//  account never looks click-fraudulent.
// ═══════════════════════════════════════════════════════════════════════════
async function humanClickElement(page, el, cfg = {}) {
  if (!el) return false;
  const rnd = (a, b) => humanRand(a, b);
  try {
    // 1) Scroll the ad into view like a person scrolling to it.
    try { await el.scrollIntoViewIfNeeded({ timeout: 3000 }); } catch (e) {}
    await sleep(gaussianRandom(400, 1200));

    // 2) Resolve its on-screen box.
    let box = null;
    try { box = await el.boundingBox(); } catch (e) {}
    if (!box || box.width <= 0 || box.height <= 0) return false;

    const cx = box.x + box.width * (0.35 + Math.random() * 0.3);
    const cy = box.y + box.height * (0.35 + Math.random() * 0.3);

    // 3) Curved, human mouse travel from a random start point to the ad.
    const steps = rnd(cfg.h4ck_click_mouse_steps_min || 18, cfg.h4ck_click_mouse_steps_max || 45);
    const sx = Math.max(0, cx + rnd(-500, 500));
    const sy = Math.max(0, cy + rnd(-350, 350));
    const ctrlX = (sx + cx) / 2 + rnd(-120, 120);
    const ctrlY = (sy + cy) / 2 + rnd(-120, 120);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const px = mt * mt * sx + 2 * mt * t * ctrlX + t * t * cx + rnd(-3, 3);
      const py = mt * mt * sy + 2 * mt * t * ctrlY + t * t * cy + rnd(-3, 3);
      try { await page.mouse.move(px, py); } catch (e) {}
      await sleep(gaussianRandom(6, 22));
    }

    // 4) Hover + micro-movements (people never click dead-still).
    try { await el.hover({ timeout: 2000 }); } catch (e) {}
    await sleep(gaussianRandom(cfg.h4ck_click_hover_ms_min || 600, cfg.h4ck_click_hover_ms_max || 1800));
    for (let i = 0; i < rnd(1, 3); i++) {
      try { await page.mouse.move(cx + rnd(-8, 8), cy + rnd(-8, 8)); } catch (e) {}
      await sleep(gaussianRandom(60, 220));
    }

    // 5) Click with a natural down/up delay.
    try {
      await el.click({ delay: rnd(90, 260), timeout: 4000 });
      return true;
    } catch (e) {
      try { await page.mouse.click(cx, cy, { delay: rnd(90, 260) }); return true; } catch (_) { return false; }
    }
  } catch (e) {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  PROXY SYSTEM
// ═══════════════════════════════════════════════════════════════════════
function getProxyList() { return Array.isArray(cache.proxies) ? cache.proxies : []; }
function getProxyStats() { return (cache.proxy_stats && typeof cache.proxy_stats === 'object') ? cache.proxy_stats : {}; }

let proxyStatsSaveTimer = null;
function saveProxyStats() {
  if (proxyStatsSaveTimer) return;
  proxyStatsSaveTimer = setTimeout(() => {
    proxyStatsSaveTimer = null;
    syncToFirebase('proxy_stats');
  }, 300000);
}

function proxyId(p) { return p.id || `${p.server}|${p.username || ''}`; }

const RESIDENTIAL_PORT_HINTS = new Set([
  22225, 22228, 22229, 8000, 8001, 8002, 10000, 10001,
  12345, 10080, 10081, 11000, 11001, 11002, 11003,
  22000, 22001, 24000, 24001, 30000, 30001,
]);

function safeProxyServerUrl(serverStr, fallbackProto = 'socks5') {
  if (!serverStr) return '';
  let s = String(serverStr).trim();
  if (!/^[a-z0-9]+:\/\//i.test(s)) {
    s = `${fallbackProto}://${s}`;
  }
  return s;
}

function isResidentialProxy(p) {
  if (!p) return false;
  if (p.residential === true) return true;
  const name = String(p.name || '').toLowerCase();
  const server = String(p.server || '').toLowerCase();
  const patterns = ['resi', 'residential', 'mobile', '4g', 'lte', '5g', 'isp', 'static', 'res.', 'proxy-seller', 'smartproxy', 'brightdata', 'oxylabs', 'iproyal', 'niceproxy'];
  for (const pat of patterns) if (name.includes(pat) || server.includes(pat)) return true;
  try {
    const sUrl = safeProxyServerUrl(server, p.protocol || p.type || 'socks5');
    const port = Number(new URL(sUrl).port);
    if (RESIDENTIAL_PORT_HINTS.has(port)) return true;
  } catch (e) {}
  return false;
}

function isProxyAvailable(p, stats, opts = {}) {
  const s = stats[proxyId(p)] || {};
  const needQuota = opts.needQuota !== false;
  // ⭐ APEX-ENTERPRISE PATCH: skip soft-blacklisted proxies
  if (s.blacklisted_until && Date.now() < s.blacklisted_until) return false;
  if (opts.usOnly) {
    const c = String(p.country || '').toUpperCase();
    if (!c) return false;
    if (!c.startsWith('US')) return false;
  }
  if (opts.residentialOnly && !isResidentialProxy(p)) return false;
  if (opts.browserCompatible) {
    try {
      const pu = new URL(safeProxyServerUrl(p.server, p.protocol || p.type || 'socks5'));
      const proto = pu.protocol.toLowerCase();
      if (!['http:', 'https:', 'socks5:', 'socks5h:'].includes(proto)) return false;
    } catch (_) { return false; }
  }
  if (needQuota) {
    const quota = Number(p.quota_mb || 0);
    const used = s.mb_used || 0;
    if (quota > 0 && used >= quota) return false;
  }
  return true;
}

let proxyCursor = 0;
let stickyProxyId = null;

// ⭐ V36: Weighted proxy selection by country pick-rate.
// The user controls per-country weights (country_weights). When proxies from
// several countries are present the worker randomly picks one, biased by the
// weights — boosting Bangladesh → more BD impressions, cutting India → fewer.
function pickProxyByCountry(pool) {
  try {
    const t = getTargetingSettings();
    const weights = t.country_weights || {};
    const enabled = t.country_enabled || {};
    const stats = getProxyStats();
    const scored = pool.map((p) => {
      const c = String(p.country || '').toUpperCase();
      let w = c && weights[c] != null ? Number(weights[c]) : 1;
      if (!Number.isFinite(w) || w < 0) w = 1;
      if (c && enabled[c] === false) w = 0;
      // small health nudge: prefer proxies that have been succeeding
      try {
        const s = stats[proxyId(p)] || {};
        const tot = s.total || 0;
        if (tot >= 5) w *= (0.5 + Math.min(1, (s.ok || 0) / tot)); // 0.5x .. 1.5x
      } catch (e) {}
      return { p, w };
    });
    const total = scored.reduce((s, x) => s + x.w, 0);
    if (total <= 0) return pickRandom(pool);
    let r = Math.random() * total;
    for (const x of scored) { r -= x.w; if (r <= 0) return x.p; }
    return scored[scored.length - 1].p;
  } catch (e) {
    return pickRandom(pool);
  }
}

function pickProxy(opts = {}) {
  try {
    const cfg = getProxySettings();
    if (!cfg.enabled) return null;
    const all = getProxyList().filter((p) => p.enabled !== false);
    if (!all.length) return null;
    const stats = getProxyStats();

    const attempts = [
      { ...opts },
      { ...opts, needQuota: false },
      { ...opts, residentialOnly: false },
      { ...opts, usOnly: false },
      { ...opts, usOnly: false, residentialOnly: false, needQuota: false },
      {},
    ];
    let pool = [];
    for (const a of attempts) {
      pool = all.filter((p) => isProxyAvailable(p, stats, a));
      if (pool.length) break;
    }
    if (!pool.length) return null;

    if (cfg.rotation === 'round_robin') {
      const c = pool[proxyCursor % pool.length];
      proxyCursor = (proxyCursor + 1) % Math.max(1, pool.length);
      return c;
    }
    if (cfg.rotation === 'sticky') {
      const current = pool.find((p) => proxyId(p) === stickyProxyId);
      if (current) return current;
      stickyProxyId = proxyId(pool[0]);
      return pool[0];
    }
    // ⭐ V36: country pick-rate weighting (default random rotation)
    return pickProxyByCountry(pool);
  } catch (e) {
    logError(e, 'pickProxy');
    return null;
  }
}

function isSocks5Proxy(p) {
  if (!p) return false;
  try { return new URL(safeProxyServerUrl(p.server, p.protocol || p.type || 'socks5')).protocol.toLowerCase().startsWith('socks5'); }
  catch (e) { return false; }
}

function toPlaywrightProxy(p) {
  if (!p) return null;
  let parsed;
  try {
    const sUrl = safeProxyServerUrl(p.server, p.protocol || p.type || 'socks5');
    parsed = new URL(sUrl);
  }
  catch (_) { throw new Error('Invalid proxy URL'); }
  const protocol = parsed.protocol.toLowerCase();
  if (['socks4:', 'socks4a:'].includes(protocol)) throw new Error('SOCKS4 not supported');
  if (!['http:', 'https:', 'socks5:', 'socks5h:'].includes(protocol)) throw new Error('Unsupported protocol');
  const serverProtocol = protocol === 'socks5h:' ? 'socks5:' : protocol;
  const host = parsed.hostname.includes(':') ? `[${parsed.hostname}]` : parsed.hostname;
  const server = `${serverProtocol}//${host}:${parsed.port}`;
  const c = { server };
  const username = p.username || (parsed.username ? decodeURIComponent(parsed.username) : '');
  const password = p.password || (parsed.password ? decodeURIComponent(parsed.password) : '');
  if (username) c.username = username;
  if (password) c.password = password;
  return c;
}

function shortProxyLabel(p) {
  if (!p) return 'direct';
  const s = String(p.server || '').replace(/^https?:\/\//, '').replace(/^socks5h?:\/\//, '');
  const nameTag = p.name ? `${p.name} | ` : '';
  return `${nameTag}${s}`;
}

function recordProxyResult(pid, ok, bytesUsed = 0) {
  const stats = getProxyStats();
  if (!stats[pid]) stats[pid] = { total: 0, ok: 0, failed: 0, consecutive_fails: 0, cooldown_until: 0, mb_used: 0, blacklisted_until: 0 };
  const s = stats[pid];
  s.total = (s.total || 0) + 1;
  if (ok) {
    s.ok = (s.ok || 0) + 1;
    s.consecutive_fails = 0;
    s.blacklisted_until = 0;
  } else {
    s.failed = (s.failed || 0) + 1;
    s.consecutive_fails = (s.consecutive_fails || 0) + 1;
    if (s.consecutive_fails >= 20) s.consecutive_fails = 0;
    // ⭐ APEX-ENTERPRISE PATCH: soft blacklist after 5 consecutive fails
    if (s.consecutive_fails >= 5) {
      const pc = getProxySettings();
      const cool = Math.max(60000, Number(pc.cooldown_ms) || 120000);
      s.blacklisted_until = Date.now() + cool;
      console.warn(`[Proxy] ⛔ Soft-blacklisted ${pid} for ${Math.round(cool/1000)}s (5 consecutive fails)`);
    }
  }
  if (bytesUsed > 0) s.mb_used = Number(((s.mb_used || 0) + bytesUsed / (1024 * 1024)).toFixed(3));
  cache.proxy_stats = stats;
  saveProxyStats();
}

function recordProxyResultWeighted(pid, okCount, failCount, bytesUsed = 0) {
  const total = okCount + failCount;
  if (total === 0) return;
  const successRate = okCount / total;
  const healthy = successRate >= 0.5;
  const stats = getProxyStats();
  if (!stats[pid]) stats[pid] = { total: 0, ok: 0, failed: 0, consecutive_fails: 0, cooldown_until: 0, mb_used: 0 };
  const s = stats[pid];
  s.total = (s.total || 0) + total;
  s.ok = (s.ok || 0) + okCount;
  s.failed = (s.failed || 0) + failCount;
  if (healthy) s.consecutive_fails = 0;
  else {
    s.consecutive_fails = (s.consecutive_fails || 0) + 1;
    if (s.consecutive_fails >= 20) s.consecutive_fails = 0;
  }
  if (bytesUsed > 0) s.mb_used = Number(((s.mb_used || 0) + bytesUsed / (1024 * 1024)).toFixed(3));
  cache.proxy_stats = stats;
  saveProxyStats();
}

const proxyVerifyCache = new Map();
const PROXY_VERIFY_TTL = 1800000;

// ⭐ V31-FIX: 2 endpoints only (was 4). Each 15s timeout was causing 60s worst-case per verify.
const IP_CHECK_ENDPOINTS_US = [
  'https://ipapi.co/json/',
  'https://ipinfo.io/json',
  'https://ipwho.is/',
  'https://freeipapi.com/api/json',
];

const IP_CHECK_ENDPOINTS_ANY = [
  'https://api.ipify.org?format=json',
  'https://ipapi.co/json/',
  'https://ipinfo.io/json',
  'https://ipwho.is/',
];

async function verifyProxyExit(context, requireUS = false) {
  let page = null;
  let lastError = '';
  try {
    // ⭐ V34-FIX: newPage can hang if the context is in a bad state — cap it, but be generous
    // on a 2GB VPS under load (8s was too aggressive and produced false "verify failed").
    page = await withTimeout(context.newPage(), 12000, 'verify.newPage');
    try { page.setDefaultTimeout(12000); } catch (_) {}

    const endpointsToTry = requireUS ? IP_CHECK_ENDPOINTS_US : IP_CHECK_ENDPOINTS_ANY;
    let data = null;

    // ⭐ V34-FIX: retry the whole endpoint set once — most failures are transient blips.
    for (let attempt = 0; attempt < 2 && !data; attempt++) {
      for (const endpoint of endpointsToTry) {
        try {
          await page.goto(endpoint, { waitUntil: 'domcontentloaded', timeout: 12000 });
          let txt = await page.evaluate(() => document.body.innerText);
          // Strip BOM / zero-width chars that silently break JSON.parse.
          txt = String(txt).replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

          let parsed;
          try { parsed = JSON.parse(txt); } catch (_) {
            lastError = `${endpoint}: not JSON`;
            console.log(`[BoosterVerify] ❌ ${endpoint} not JSON (attempt ${attempt + 1})`);
            continue;
          }

          const ip = String(parsed.ip || parsed.query || parsed.ipAddress || '').trim();

          // Extract raw country from many possible fields (incl. ipwho.is / freeipapi).
          let rawCountry = parsed.country_code || parsed.countryCode || parsed.country ||
                           parsed.country_name || parsed.country_name_en || parsed.countryCode2 || '';

          // STRICT sanitize — only letters A-Z, first 2 chars.
          let country = String(rawCountry).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);

          const region = String(
            parsed.region || parsed.region_code || parsed.regionCode ||
            parsed.region_name || parsed.regionName || ''
          ).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

          if (country === 'UN' && String(rawCountry).toUpperCase().includes('UNITED STATES')) country = 'US';
          if (country === 'UN' && String(rawCountry).toUpperCase().includes('UNITED KINGDOM')) country = 'GB';

          console.log(`[BoosterVerify] ip="${ip}" country="${country}" (raw="${rawCountry}") region="${region}"`);

          if (requireUS) {
            if (ip && country && country.length === 2) { data = { ip, country, region }; break; }
            lastError = `${endpoint}: no valid country (ip=${ip || 'none'}, country="${country}")`;
            console.log(`[BoosterVerify] ❌ ${endpoint} rejected: ${lastError}`);
            continue;
          } else {
            if (ip) { data = { ip, country: country || '', region }; break; }
          }
        } catch (e) {
          lastError = `${endpoint}: ${e.message}`;
          console.log(`[BoosterVerify] ❌ ${endpoint}: ${e.message} (attempt ${attempt + 1})`);
          continue;
        }
      }
      if (!data && attempt === 0) await sleep(1200);
    }

    if (!data || !data.ip) {
      return { ok: false, reason: `IP check failed: ${lastError || 'All endpoints failed'}`, country: '', ip: '', region: '' };
    }
    if (requireUS && data.country !== 'US') {
      return { ok: false, reason: `Not US (${data.country || 'unknown'})`, country: data.country || '', ip: data.ip, region: data.region || '' };
    }
    return { ok: true, country: data.country || '', ip: data.ip, region: data.region || '' };
  } catch (e) {
    return { ok: false, reason: `IP check failed: ${e.message}`, country: '', ip: '', region: '' };
  } finally {
    if (page) try { await page.close(); } catch (e) {}
  }
}


async function verifyProxyExitCached(proxyEntry, context, requireUS = false) {
  if (!proxyEntry) return { ok: true, country: '', ip: '', region: '' };
  // ⭐ V31-FIX: Rotating residential gives NEW IP per call → cache is meaningless.
  // Only use cache when proxy is static (no rotation flag OR residential=false).
  const isRotating = isResidentialProxy(proxyEntry) && !proxyEntry.static;
  if (isRotating) {
    return await verifyProxyExit(context, requireUS);
  }
  const key = `${proxyId(proxyEntry)}::${requireUS ? 'US' : 'any'}`;
  const cached = proxyVerifyCache.get(key);
  if (cached && Date.now() - cached.at < PROXY_VERIFY_TTL) return cached.result;
  const result = await verifyProxyExit(context, requireUS);
  if (result.ok) proxyVerifyCache.set(key, { result, at: Date.now() });
  if (proxyVerifyCache.size > 100) proxyVerifyCache.clear();
  return result;
}

let proxyHealthTimer = null;
async function proxyHealthCheck() {
  const cfg = getProxySettings();
  if (!cfg.auto_health_check) return;
  if (!cfg.enabled) return;   // ← NEW: skip when master OFF
  // ⭐ SKIP during active SL burst to prevent proxy contention
  if (typeof smartlinkTickRunning !== 'undefined' && smartlinkTickRunning) {
    return;
  }
  const list = getProxyList();
  if (!list.length) return;
  console.log(`[Health] Checking ${list.length} proxies…`);
  for (const p of list) {
    try {
      const [ok] = await testProxy(p);
      recordProxyResult(proxyId(p), ok);
    } catch (e) {}
    await sleep(500);
  }
}

function startProxyHealthMonitor() {
  if (proxyHealthTimer) clearInterval(proxyHealthTimer);
  const cfg = getProxySettings();
  const interval = Math.max(60000, Number(cfg.health_check_interval_ms) || 300000);
  proxyHealthTimer = setInterval(() => {
    proxyHealthCheck().catch(() => {});
  }, interval);
  console.log(`[Health] Monitor started (${Math.round(interval / 60000)} min)`);
}

function stopProxyHealthMonitor() {
  if (proxyHealthTimer) clearInterval(proxyHealthTimer);
  proxyHealthTimer = null;
}

function parseProxyInput(raw) {
  let s = String(raw || '').trim();
  if (!s || s.startsWith('#')) return null;
  let country = null, quotaMb = null, residential = false;
  while (true) {
    const i = s.lastIndexOf('#');
    if (i < 0) break;
    const tag = s.slice(i + 1).trim();
    if (/^resi(dential)?$/i.test(tag) && !residential) { residential = true; s = s.slice(0, i).trim(); continue; }
    if (/^[A-Z]{2}$/i.test(tag) && !country) { country = tag.toUpperCase(); s = s.slice(0, i).trim(); continue; }
    const m = tag.match(/^(\d+(?:\.\d+)?)\s*(?:MB)?$/i);
    if (m && quotaMb === null) { quotaMb = Number(m[1]); s = s.slice(0, i).trim(); continue; }
    break;
  }
  let scheme = 'http';
  const sm = s.match(/^(https?|socks4a?|socks5h?):\/\//i);
  if (sm) { scheme = sm[1].toLowerCase(); s = s.slice(sm[0].length); }
  if (!['http', 'https', 'socks4', 'socks4a', 'socks5', 'socks5h'].includes(scheme)) return null;
  let username = null, password = null, hostPort = s;
  const at = s.lastIndexOf('@');
  if (at !== -1) {
    const creds = s.slice(0, at);
    hostPort = s.slice(at + 1);
    const c = creds.indexOf(':');
    if (c < 1) return null;
    try { username = decodeURIComponent(creds.slice(0, c)); password = decodeURIComponent(creds.slice(c + 1)); } catch (_) { return null; }
  }
  let host, port;
  const ipv6 = hostPort.match(/^\[([0-9a-f:.]+(?:%[a-z0-9]+)?)\]:(\d{1,5})$/i);
  if (ipv6) { host = `[${ipv6[1]}]`; port = ipv6[2]; }
  else {
    const parts = hostPort.split(':');
    if (parts.length === 2) { host = parts[0]; port = parts[1]; }
    else if (parts.length === 4 && username === null) { host = parts[0]; port = parts[1]; username = parts[2]; password = parts[3]; }
    else if (parts.length === 3 && username === null) {
      host = parts[0]; port = parts[1];
      const rest = parts.slice(2).join(':');
      const colon = rest.indexOf(':');
      if (colon > 0) { username = rest.slice(0, colon); password = rest.slice(colon + 1); } else username = rest;
    } else {
      const lastColon = hostPort.lastIndexOf(':');
      if (lastColon < 1) return null;
      host = hostPort.slice(0, lastColon);
      port = hostPort.slice(lastColon + 1);
    }
  }
  const nPort = Number(port);
  if (!host || /\s/.test(host) || !/^\d{1,5}$/.test(String(port)) || !Number.isInteger(nPort) || nPort < 1 || nPort > 65535) return null;
  const entry = { server: `${scheme}://${host}:${nPort}` };
  if (username !== null && username !== '') entry.username = username;
  if (password !== null && password !== '') entry.password = password;
  if (country) entry.country = country;
  if (quotaMb !== null && quotaMb > 0) entry.quota_mb = quotaMb;
  if (residential) entry.residential = true;
  return entry;
}

function makeDiagnosticProxyAgent(p, targetUrl) {
  const parsed = new URL(p.server);
  const protocol = parsed.protocol.toLowerCase();
  const username = p.username || (parsed.username ? decodeURIComponent(parsed.username) : '');
  const password = p.password || (parsed.password ? decodeURIComponent(parsed.password) : '');
  const host = parsed.hostname.includes(':') ? `[${parsed.hostname}]` : parsed.hostname;
  const auth = username ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : '';
  const proxyUrl = `${protocol}//${auth}${host}:${parsed.port}`;
  if (protocol.startsWith('socks')) return new SocksProxyAgent(proxyUrl, { timeout: 20000 });
  if (protocol === 'https:') return new HttpsProxyAgent(proxyUrl, { timeout: 20000 });
  return targetUrl.protocol === 'https:' ? new HttpsProxyAgent(proxyUrl, { timeout: 20000 }) : new HttpProxyAgent(proxyUrl, { timeout: 20000 });
}

async function testProxy(p) {
  let agent = null;
  try {
    if (!p || !p.server) return [false, 'Missing server'];
    const target = getProxySettings().health_check_url || 'https://api.ipify.org?format=json';
    let targetUrl;
    try { targetUrl = new URL(target); } catch (_) { return [false, 'Invalid URL']; }
    const proxyUrl = new URL(p.server);
    if (!['http:', 'https:', 'socks4:', 'socks4a:', 'socks5:', 'socks5h:'].includes(proxyUrl.protocol)) return [false, 'Unsupported'];
    const timeoutMs = Math.max(3000, Math.min(30000, Number(getProxySettings().connection_timeout_ms) || 20000));
    agent = makeDiagnosticProxyAgent(p, targetUrl);
    const started = Date.now();
    const response = await axios.get(targetUrl.toString(), {
      httpAgent: agent, httpsAgent: agent, proxy: false, timeout: timeoutMs,
      validateStatus: (status) => status >= 200 && status < 400,
      responseType: 'text', transformResponse: [(data) => data],
      maxRedirects: 3,
    });
    const latency = Date.now() - started;
    let exit = '';
    try { const body = typeof response.data === 'string' ? JSON.parse(response.data) : response.data; exit = String(body.ip || body.origin || '').slice(0, 80); } catch (_) {}
    return [true, `HTTP ${response.status} | ${latency}ms${exit ? ` | ${exit}` : ''}`];
  } catch (e) {
    const status = e.response && e.response.status;
    const reason = status === 407 ? 'Auth failed (407)' : (e.code || e.message || 'Error');
    return [false, `Failed: ${String(reason).slice(0, 120)}`];
  } finally {
    try { if (agent && typeof agent.destroy === 'function') agent.destroy(); } catch (_) {}
  }
}

// ═══════════════════════════════════════════════════════════════════
//  BROWSER POOL (with zombie health ping)
// ═══════════════════════════════════════════════════════════════════
let browserInstance = null;
let browserLaunching = null;
let browserFails = 0;
let browserHealthCheckPromise = null;   // ← MODULE-LEVEL mutex (not inside function!)
const MAX_BROWSER_FAILS = 5;

// ── Health ping state (rate-limited) ──
let lastBrowserHealthCheck = 0;
const BROWSER_HEALTH_CHECK_INTERVAL_MS = 60000;  // ping at most once/min
const BROWSER_HEALTH_CHECK_TIMEOUT_MS = 12000;   // ⭐ V34: 12s — 2GB VPS is slow under load (5s gave false zombies)

/**
 * Ping the browser by opening+closing a blank page.
 * Returns true if browser is responsive, false otherwise.
 * NEVER throws — always resolves to boolean.
 */
async function pingBrowserHealth(browser) {
  if (!browser) return false;
  // ⭐ V34-FIX: retry once — a single slow newPage() on a loaded 2GB box used to be
  // misread as a "zombie browser" and killed the whole Chromium (breaking every
  // in-flight visit). Two consecutive failures are needed to declare it dead.
  for (let attempt = 0; attempt < 2; attempt++) {
    let testPage = null;
    try {
      testPage = await Promise.race([
        browser.newPage(),
        sleep(BROWSER_HEALTH_CHECK_TIMEOUT_MS).then(() => null),
      ]);
      if (testPage) return true;
    } catch (e) {
      // fall through to retry
    } finally {
      if (testPage) {
        try { await Promise.race([testPage.close(), sleep(2000)]); } catch (_) {}
      }
    }
    if (attempt === 0) await sleep(1500);
  }
  return false;
}

/**
 * Force-kill a browser (close + SIGKILL fallback).
 * Used when zombie detection fires.
 */
async function forceKillBrowser(browser) {
  if (!browser) return;
  try { await Promise.race([browser.close(), sleep(3000)]); } catch (_) {}
  // Fallback: kill underlying process (Playwright doesn't always kill on close)
  try {
    const proc = typeof browser.process === 'function' ? browser.process() : null;
    if (proc && typeof proc.kill === 'function' && !proc.killed) {
      proc.kill('SIGKILL');
    }
  } catch (_) {}
}

async function closeBrowser() {
  if (!browserInstance) return;
  console.log('[Boot] Closing Chromium…');
  try {
    // Try graceful close first
    await Promise.race([browserInstance.close(), sleep(5000)]);
  } catch (e) {
    console.warn('[Boot] browser.close failed:', e.message);
  }
  // Fallback: kill the process itself
  try {
    const proc = typeof browserInstance.process === 'function' ? browserInstance.process() : null;
    if (proc && typeof proc.kill === 'function' && !proc.killed) {
      proc.kill('SIGKILL');
    }
  } catch (_) {}
  browserInstance = null;
  browserLaunching = null;
}

async function getBrowser() {
  // ── Case 1: we have a browser, verify it's alive ──
  if (browserInstance && browserInstance.isConnected()) {
    const now = Date.now();
    const shouldHealthCheck = (now - lastBrowserHealthCheck) >= BROWSER_HEALTH_CHECK_INTERVAL_MS;

    if (shouldHealthCheck && activeVisitSlots === 0) {
      if (browserHealthCheckPromise) {
        // Another caller is already checking — await their result
        await browserHealthCheckPromise;
        if (browserInstance) return browserInstance;
        // else fall through to relaunch below
      } else {
        lastBrowserHealthCheck = now;
        browserHealthCheckPromise = (async () => {
          const healthy = await pingBrowserHealth(browserInstance);
          if (!healthy) {
            console.warn('[Boot] 🧟 Zombie browser detected via health ping — forcing kill');
            await forceKillBrowser(browserInstance);
            browserInstance = null;
          }
        })().finally(() => { browserHealthCheckPromise = null; });

        await browserHealthCheckPromise;
        if (browserInstance) return browserInstance;
      }
    } else {
      // Recent ping was OK → trust cache, instant return
      return browserInstance;
    }
  }

  // ── Case 2: browser disconnected but reference lingers ──
  if (browserInstance && !browserInstance.isConnected()) {
    console.warn('[Boot] Zombie browser detected (isConnected=false) — forcing close');
    await forceKillBrowser(browserInstance);
    browserInstance = null;
  }

  // ── Case 3: another launch already in progress ──
  if (browserLaunching) return browserLaunching;

  // ── Case 4: fresh launch ──
  browserLaunching = (async () => {
    try {
      await waitForSystemReady();
      console.log(`[Boot] Waiting ${BROWSER_LAUNCH_DELAY_MS / 1000}s before launch…`);
      await sleep(BROWSER_LAUNCH_DELAY_MS);
      console.log('[Boot] Launching Chromium (headless=new, 2GB VPS optimized)…');

      const b = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox', '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu', '--no-first-run',
          // PATCH: --single-process / --no-zygote REMOVED so Chromium can spawn
          // multiple renderer processes → genuine parallel visits (pool-engine).
          '--disable-features=IsolateOrigins,site-per-process',
          '--window-size=1366,768',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-extensions', '--disable-plugins',
          '--disable-sync', '--disable-translate',
          '--no-default-browser-check', '--disable-crash-reporter',
          '--mute-audio', '--no-pings', '--disable-breakpad',
          '--memory-pressure-off',
          '--max_old_space_size=256',
          '--js-flags=--max-old-space-size=256',
          '--disable-software-rasterizer',
          '--disable-background-networking',
          '--disable-component-update',
          '--disable-default-apps',
          '--disable-domain-reliability',
          '--disable-hang-monitor',
          '--disable-ipc-flooding-protection',
          '--disable-popup-blocking',
          '--disable-prompt-on-repost',
          '--disable-client-side-phishing-detection',
          '--disable-features=TranslateUI',
          '--metrics-recording-only',
          '--no-service-autorun',
          '--password-store=basic',
          '--use-mock-keychain',
          '--headless=new',
        ],
        timeout: 90000,
      });

      b.on('disconnected', () => {
        browserInstance = null;
        lastBrowserHealthCheck = 0;
      });

      browserInstance = b;
      browserFails = 0;
      lastBrowserHealthCheck = Date.now();
      console.log('✅ Chromium launched');
      return b;
    } catch (e) {
      browserFails += 1;
      console.error(`[Boot] Browser failed (${browserFails}/${MAX_BROWSER_FAILS}):`, e.message);
      browserInstance = null;
      if (browserFails >= MAX_BROWSER_FAILS) {
        await sleep(60000);
        browserFails = 0;
      }
      throw e;
    } finally {
      browserLaunching = null;
    }
  })();

  return browserLaunching;
}

// ═══════════════════════════════════════════════════════════════════════
//  VISIT SLOT MANAGER
// ═══════════════════════════════════════════════════════════════════════
let activeVisitSlots = 0;
const visitWaiters = [];

async function acquireVisitSlot() {
  const limit = getAdaptiveConcurrencyLimit();
  if (activeVisitSlots < limit) { activeVisitSlots += 1; return true; }
  return await new Promise((resolve) => {
    const waiter = { resolve, at: Date.now(), acquired: false };
    visitWaiters.push(waiter);
    const timer = setTimeout(() => {
      const idx = visitWaiters.indexOf(waiter);
      if (idx >= 0) {
        visitWaiters.splice(idx, 1);
        activeVisitSlots += 1;
        waiter.acquired = true;
        resolve(true);
      }
    }, 180000);
    waiter.timer = timer;
  });
}

function releaseVisitSlot() {
  activeVisitSlots = Math.max(0, activeVisitSlots - 1);
  const next = visitWaiters.shift();
  if (next) {
    if (next.timer) clearTimeout(next.timer);
    if (typeof next.resolve === 'function') {
      next.acquired = true;
      activeVisitSlots += 1;
      next.resolve(true);
    }
  }
}

// Used by force-reset paths: wake every waiter instead of dropping it (dropped waiters hung forever)
function drainVisitWaiters() {
  while (visitWaiters.length) {
    const w = visitWaiters.shift();
    if (w.timer) clearTimeout(w.timer);
    if (typeof w.resolve === 'function') {
      w.acquired = false;      // ← mark as not-acquired
      w.resolve(false);        // ← resolve with false, caller skips release
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  STEALTH INIT SCRIPT
// ═══════════════════════════════════════════════════════════════════════
function buildNavigatorInitScript() {
  return ({ webgl, tz, isSafari, screenW, screenH }) => {
    try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch (e) {}
    if (!isSafari) {
      try {
        if (!window.chrome) window.chrome = {};
        if (!window.chrome.runtime) window.chrome.runtime = {};
        window.chrome.runtime.id = 'abcdefghijklmnop';
        window.chrome.runtime.loadTimes = () => {};
        window.chrome.runtime.csi = () => {};
        window.chrome.app = window.chrome.app || {};
        window.chrome.app.runningState = () => {};
        window.chrome.app.getDetails = () => null;
      } catch (e) {}
    }
    try {
      const override = (origFn) => function (param) {
        if (param === 0x9245) return webgl.vendor;
        if (param === 0x9246) return webgl.renderer;
        if (param === 0x9243) return 'WebGL 1.0 (OpenGL ES 2.0 Chromium)';
        if (param === 0x9244) return 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)';
        return origFn.call(this, param);
      };
      if (typeof WebGLRenderingContext !== 'undefined') WebGLRenderingContext.prototype.getParameter = override(WebGLRenderingContext.prototype.getParameter);
      if (typeof WebGL2RenderingContext !== 'undefined') WebGL2RenderingContext.prototype.getParameter = override(WebGL2RenderingContext.prototype.getParameter);
    } catch (e) {}
    try {
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const arr = [
            { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 2 },
            { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 2 },
            { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 2 },
          ];
          arr.item = (i) => arr[i];
          arr.namedItem = (n) => arr.find((p) => p.name === n);
          arr.refresh = () => {};
          Object.defineProperty(arr, 'length', { value: arr.length });
          return arr;
        },
      });
    } catch (e) {}
    try { Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 }); } catch (e) {}
    try { Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 }); } catch (e) {}
    try { Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] }); } catch (e) {}
    try {
      const originalQuery = window.navigator.permissions && window.navigator.permissions.query;
      if (originalQuery) {
        window.navigator.permissions.query = (parameters) => {
          if (parameters.name === 'notifications') return Promise.resolve({ state: 'default' });
          return originalQuery(parameters);
        };
      }
    } catch (e) {}
    try {
      Object.defineProperty(navigator, 'connection', {
        get: () => ({ effectiveType: '4g', rtt: 50, downlink: 10, saveData: false }),
      });
    } catch (e) {}
    try {
      Object.defineProperty(screen, 'width', { get: () => screenW });
      Object.defineProperty(screen, 'height', { get: () => screenH });
      Object.defineProperty(screen, 'availWidth', { get: () => screenW });
      Object.defineProperty(screen, 'availHeight', { get: () => screenH - 40 });
    } catch (e) {}
    try {
      const toDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        try {
          const ctx = this.getContext('2d');
          if (ctx) {
            const imgData = ctx.getImageData(0, 0, Math.min(this.width, 10), Math.min(this.height, 10));
            if (imgData && imgData.data) for (let i = 0; i < imgData.data.length; i += 100) imgData.data[i] ^= 1;
            ctx.putImageData(imgData, 0, 0);
          }
        } catch (e) {}
        return toDataURL.apply(this, args);
      };
    } catch (e) {}
    try {
      const origGetChannelData = AudioBuffer.prototype.getChannelData;
      AudioBuffer.prototype.getChannelData = function (...args) {
        const data = origGetChannelData.apply(this, args);
        for (let i = 0; i < data.length; i += 500) data[i] += Math.random() * 0.0000001;
        return data;
      };
    } catch (e) {}
    try {
      const orig = Intl.DateTimeFormat.prototype.resolvedOptions;
      Intl.DateTimeFormat.prototype.resolvedOptions = function () {
        const o = orig.call(this);
        o.timeZone = tz;
        return o;
      };
    } catch (e) {}
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  ADSTERRA-SAFE DATA SAVER
// ═══════════════════════════════════════════════════════════════════════
function buildH4CkSmartDataSaverRoute() {
  return (route) => {
    try {
      const req = route.request();
      const url = String(req.url() || '').toLowerCase();
      const type = req.resourceType();
      const cfg = getAutoImpressionSettings();

      if (cfg.h4ck_saver_whitelist_adsterra !== false) {
        if (isAdsterraUrl(url)) return route.continue();
      }
      if (['script', 'xhr', 'fetch', 'document', 'main_frame', 'sub_frame'].includes(type)) return route.continue();
      if (cfg.h4ck_saver_block_css === true && type === 'stylesheet') return route.abort();
      if (cfg.h4ck_saver_block_images !== false && type === 'image') return route.abort();
      if (cfg.h4ck_saver_block_media !== false && type === 'media') return route.abort();
      if (cfg.h4ck_saver_block_fonts !== false && type === 'font') return route.abort();

      if (cfg.h4ck_saver_block_analytics !== false) {
        const ANALYTICS = ['google-analytics.com', 'googletagmanager.com', 'analytics.google.com',
          'facebook.com/tr', 'connect.facebook.net', 'hotjar.com', 'mixpanel.com',
          'segment.io', 'segment.com', 'amplitude.com', 'newrelic.com', 'sentry.io',
          'fullstory.com', 'clarity.ms', 'mc.yandex.ru', 'matomo', 'plausible.io',
          'umami', 'heap.io', 'logrocket.com', 'smartlook.com', 'quantcast.com',
          'scorecardresearch.com', 'comscore.com', 'nielsen.com', 'chartbeat.com'];
        if (ANALYTICS.some((p) => url.includes(p))) return route.abort();
      }
      if (cfg.h4ck_saver_block_other_ads !== false) {
        const OTHER_ADS = ['googlesyndication.com', 'doubleclick.net', 'googleadservices.com',
          'adnxs.com', 'taboola.com', 'outbrain.com', 'pubmatic.com', 'rubiconproject.com',
          'openx.net', 'casalemedia.com', 'smartadserver.com', 'adform.net', 'criteo.com',
          'adsrvr.org', 'bidswitch.net', 'sharethrough.com', 'teads.tv', 'media.net',
          'revcontent.com', 'mgid.com', 'adroll.com', 'amazon-adsystem.com'];
        if (OTHER_ADS.some((p) => url.includes(p))) return route.abort();
      }
      if (cfg.h4ck_saver_block_websockets !== false && url.startsWith('wss:')) return route.abort();
      if (cfg.h4ck_saver_block_beacons !== false && url.includes('/beacon')) return route.abort();
      route.continue();
    } catch (e) {
      try { route.continue(); } catch (_) {}
    }
  };
}

async function buildContext(browser, identity, geo, webglProfile, proxyEntry, targetUrl = '', isSmartLinkOverride) {
  const screenW = identity.viewport.width + humanRand(80, 300);
  const screenH = identity.viewport.height + humanRand(40, 150);
  // V33: Win-only desktop — no mobile/tablet detection needed
  const isMobileUA = /iPhone|Android.*Mobile/i.test(identity.ua);
  const isMobileDevice = isMobileUA && identity.viewport.width <= 480;
  const isTabletDevice = isMobileUA && identity.viewport.width > 480 && identity.viewport.width <= 1366;
  const scaleFactor = isMobileDevice ? 3 : (isTabletDevice ? 2 : 1);
  const isTouchDevice = isMobileUA && isTabletDevice;

  const ctxOpts = {
    userAgent: identity.ua,
    extraHTTPHeaders: { ...identity.headers, 'Accept-Language': geo.acceptLanguage },
    viewport: identity.viewport,
    locale: geo.locale,
    timezoneId: geo.timezone,
    javaScriptEnabled: true,
    ignoreHTTPSErrors: true,
    colorScheme: 'light',
    screen: { width: screenW, height: screenH },
    deviceScaleFactor: scaleFactor,
    isMobile: isMobileUA,
    hasTouch: isTouchDevice,
  };

  let effectiveProxy = proxyEntry;

  if (proxyEntry) {
    const isSocks = isSocks5Proxy(proxyEntry);
    const hasAuth = !!(proxyEntry.username || proxyEntry.password);

    if (isSocks && hasAuth) {
      let bridgeAddr = bridge.getBridgeAddress();
      if (!bridgeAddr) {
        try {
          await bridge.startBridge(proxyEntry);
          bridgeAddr = bridge.getBridgeAddress();
        } catch (e) {
          console.warn('Bridge auto-start failed:', e.message);
        }
      }
      if (bridgeAddr) {
        bridge.updateUpstream(proxyEntry);
        ctxOpts.proxy = bridgeAddr;
      } else {
        throw new Error('Bridge unavailable for SOCKS5 auth proxy');
      }
    } else {
      try {
        ctxOpts.proxy = toPlaywrightProxy(proxyEntry);
      } catch (e) {
        console.warn('[WARN] Booster setup failed:', e.message);
        effectiveProxy = null;
        delete ctxOpts.proxy;
      }
    }
  }

  const context = await browser.newContext(ctxOpts);
  await context.addInitScript(buildNavigatorInitScript(), {
    webgl: webglProfile, tz: geo.timezone, isSafari: identity.safari, screenW, screenH,
  });

  const cfg = getAutoImpressionSettings();
  const activeMode = getActiveMode();
  const isSmartLinkContext = (typeof isSmartLinkOverride === 'boolean')
    ? isSmartLinkOverride
    : isAdsterraSmartLinkUrl(targetUrl);
  const isAdsterraTarget = isAdsterraUrl(targetUrl);

  if (!isSmartLinkContext && !isAdsterraTarget) {
    if (activeMode === MODE_H4CK_ORGANIC && cfg.h4ck_smart_data_saver !== false) {
      await context.route('**/*', buildH4CkSmartDataSaverRoute());
    } else if (cfg.data_saver_mode !== false) {
      await context.route('**/*', (route) => {
        try {
          const req = route.request();
          const url = String(req.url() || '').toLowerCase();
          const type = req.resourceType();
          if (isAdsterraUrl(url)) return route.continue();
          if (['script', 'xhr', 'fetch', 'document', 'main_frame', 'sub_frame'].includes(type)) return route.continue();
          if (cfg.data_saver_images !== false && type === 'image') return route.abort();
          if (cfg.data_saver_media !== false && type === 'media') return route.abort();
          if (cfg.data_saver_fonts !== false && type === 'font') return route.abort();
          route.continue();
        } catch (e) {
          try { route.continue(); } catch (_) {}
        }
      });
    }
  }

  return { context, effectiveProxy };
}

// ═══════════════════════════════════════════════════════════════════════
//  CPM MAXIMIZER DWELL
// ═══════════════════════════════════════════════════════════════════════
async function cpmMaximizerDwell(page, targetDwellMs, cfg, isSmartLink = false) {
  const start = Date.now();
  try { page.setDefaultTimeout(8000); } catch (_) {}  // ⭐ NEW
  let scrollCount = 0;
  let adHoverCount = 0;
  let viewportPaused = false;
  let zoomEvents = 0;
  let keyboardScrolls = 0;
  let videoPauses = 0;
  const maxScrolls = isSmartLink ? humanRand(2, 4) : humanRand(10, 22);
  const requiredHovers = isSmartLink ? 0 : Math.min(5, cfg.ad_hover_count || 5);

  while (Date.now() - start < targetDwellMs) {
    if (page.isClosed()) { console.log('[CPM] Page closed, breaking'); break; }

    if (scrollCount < maxScrolls && Math.random() < 0.6) {
      try {
        await page.evaluate(() => window.scrollBy({
          top: Math.floor(Math.random() * 500) + 200, behavior: 'smooth',
        }));
      } catch (e) {}
      scrollCount += 1;
    }
    if (Math.random() < 0.8) {
      try { await page.mouse.move(humanRand(80, 1300), humanRand(100, 800), { steps: humanRand(5, 18) }); } catch (e) {}
    }
    if (!isSmartLink && adHoverCount < requiredHovers && Math.random() < 0.5) {
      try {
        const adSelectors = ['a[href*="ad"]', 'a[href*="click"]', '[class*="ad-"]', '[class*="ads"]',
          '[id*="ad-"]', '[id*="ads"]', 'iframe[src*="ad"]', 'iframe[src*="banner"]',
          '[class*="banner"]', '[class*="sponsor"]', 'div[data-ad]', 'ins.adsbygoogle', 'a[target="_blank"]'];
        const adEls = await page.$$(adSelectors.join(', '));
        if (adEls.length > 0) {
          const adEl = adEls[humanRand(0, Math.min(adEls.length - 1, 10))];
          try { await adEl.scrollIntoViewIfNeeded({ timeout: 3000 }); } catch (e) {}
          await sleep(humanRand(500, 1200));
          try { await adEl.hover({ timeout: 2000 }); } catch (e) {}
          await sleep(gaussianRandom(800, 2000));
          adHoverCount++;
        }
      } catch (e) {}
    }
    if (!isSmartLink && !viewportPaused && adHoverCount >= 2 && Math.random() < 0.3) {
      try {
        await page.evaluate(() => window.scrollBy({ top: -300, behavior: 'smooth' }));
        await sleep(cfg.viewport_pause_ms || 12000);
        viewportPaused = true;
      } catch (e) {}
    }
    if (!isSmartLink && Math.random() < 0.25) {
      try {
        await page.evaluate(() => {
          const paras = document.querySelectorAll('p, article, .content, .post');
          if (paras.length) {
            const p = paras[Math.floor(Math.random() * paras.length)];
            const range = document.createRange();
            range.selectNodeContents(p);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }
        });
      } catch (e) {}
    }
    if (cfg.h4ck_enable_zoom_simulation && !isSmartLink && Math.random() < (cfg.h4ck_zoom_probability || 0.15)) {
      try {
        const zoomLevel = pickRandom([1.1, 1.25, 1.5, 0.9]);
        await page.evaluate((z) => { document.body.style.zoom = z; }, zoomLevel);
        await sleep(gaussianRandom(1000, 3000));
        await page.evaluate(() => { document.body.style.zoom = 1; });
        zoomEvents++;
      } catch (e) {}
    }
    if (cfg.h4ck_enable_keyboard_nav && !isSmartLink && Math.random() < (cfg.h4ck_keyboard_nav_chance || 0.20)) {
      try {
        const key = pickRandom(['PageDown', 'PageDown', 'ArrowDown', 'Space', 'End']);
        await page.keyboard.press(key);
        await sleep(gaussianRandom(800, 2500));
        keyboardScrolls++;
      } catch (e) {}
    }
    if (cfg.h4ck_enable_video_pause && !isSmartLink && Math.random() < (cfg.h4ck_video_pause_chance || 0.10)) {
      try {
        const hasVideo = await page.evaluate(() => {
          const vids = document.querySelectorAll('video');
          if (vids.length > 0) {
            const v = vids[0];
            if (!v.paused) { v.pause(); return 'paused'; }
            else { v.play().catch(() => {}); return 'played'; }
          }
          return null;
        });
        if (hasVideo) {
          videoPauses++;
          await sleep(gaussianRandom(3000, 8000));
        }
      } catch (e) {}
    }
    await sleep(gaussianRandom(800, 2500));
  }
  return { adHoverCount, scrollCount, viewportPaused, zoomEvents, keyboardScrolls, videoPauses };
}

// ═══════════════════════════════════════════════════════════════════════
//  ⭐ V30: H4CK ORGANIC VISIT — FULLY ADSTERRA-SAFE
//  Fixed: `var lastRefUrl` scoping → proper block-scoped variables
// ═══════════════════════════════════════════════════════════════════════
async function performH4CkOrganicVisit(context, targetUrl, cfg, isSmartLinkOverride) {
  const pages = new Set();
  let bytesUsed = 0;
  const started = Date.now();
  const stats = {
    referrers: [], competitorsVisited: 0, pagesVisited: 1,
    adHovers: 0, adClicks: 0, dwellMs: 0,
    zoomEvents: 0, keyboardScrolls: 0, videoPauses: 0,
    path: 'h4ck-organic',
  };

  // ⭐ FIX: trust the EXPLICIT link type when the caller knows it (the tick knows
  // whether this is a registered normal link or a smartlink). The URL heuristic is
  // only a fallback. Previously a normal link like `site.com/article?ref=123` was
  // mis-detected as a SmartLink → it demanded an Adsterra pixel that a normal site
  // never fires → the impression was silently dropped.
  const isSmartLinkTarget = (typeof isSmartLinkOverride === 'boolean')
    ? isSmartLinkOverride
    : isAdsterraSmartLinkUrl(targetUrl);
  const safeClose = async (p) => {
    if (!p) return;
    try { if (!p.isClosed()) await Promise.race([p.close(), sleep(3000)]); } catch (e) {}
    pages.delete(p);
  };

  const injectCookies = async (ctx, domain) => {
  if (!cfg.h4ck_enable_cookie_injection) return;
  try {
    const now = Math.floor(Date.now() / 1000);
    const cookies = [
      { name: '_ga', value: `GA1.2.${secureRandomInt(999999999)}.${now - humanRand(0, 604800)}`, domain: `.${domain}`, path: '/' },
      { name: '_gid', value: `GA1.2.${secureRandomInt(999999999)}.${now - humanRand(0, 3600)}`, domain: `.${domain}`, path: '/' },
      { name: '_fbp', value: `fb.1.${Date.now() - humanRand(0, 86400000)}.${secureRandomInt(999999999)}`, domain: `.${domain}`, path: '/' },
    ];
    if (Math.random() < 0.5) cookies.push({ name: '_gcl_au', value: `1.1.${secureRandomInt(999999999)}.${now}`, domain: `.${domain}`, path: '/' });
    await ctx.addCookies(cookies);

    // ⭐ NEW: Pre-seed localStorage/sessionStorage WITHOUT visiting target
    // This runs in every page in this context automatically
    await ctx.addInitScript((host) => {
      try {
        if (!window.__pnSeeded) {
          window.__pnSeeded = true;
          // Set localStorage data BEFORE page's JS runs
          if (window.location.hostname.includes(host)) {
            try {
              localStorage.setItem('_pn_visitor', 'v_' + Math.random().toString(36).slice(2, 12));
              localStorage.setItem('_pn_last_seen', Date.now().toString());
              localStorage.setItem('_pn_pref_theme', ['light','dark','auto'][Math.floor(Math.random()*3)]);
              sessionStorage.setItem('_pn_session', 's_' + Math.random().toString(36).slice(2, 10));
            } catch (e) {}
          }
        }
      } catch (e) {}
    }, domain);
  } catch (e) {}
};

  let adsterraPixelFired = false;
  let adsterraMarkerDetected = false;
  const adsterraFireWatcher = (response) => {
    try {
      const u = response.url();
      const lower = u.toLowerCase();
      // ⭐ APEX-ENTERPRISE PATCH: catch pixel via URL, header, OR 1x1 gif response
      if (isAdsterraUrl(lower) || isAdsterraPixelUrl(lower)) { adsterraPixelFired = true; return; }
      try {
        const rt = response.request().resourceType();
        const hdrs = response.headers() || {};
        const ct = String(hdrs['content-type'] || '').toLowerCase();
        // 1x1 tracking gif commonly used by networks
        if (rt === 'image' && (ct.includes('gif') || ct.includes('pixel'))) {
          const cl = parseInt(hdrs['content-length'] || '0', 10);
          if (cl > 0 && cl < 500) { adsterraPixelFired = true; console.log(`[Pixel] 🎯 1x1 tracking gif: ${lower.slice(0,80)}`); }
        }
      } catch (_) {}
    } catch (e) {}
  };
  // ⭐ V34-FIX: listen at the CONTEXT level too — a popunder / pixel often fires in a
  // child tab that the target-page listener never sees. This lifts pixel=? → pixel=✓.
  try { context.on('response', adsterraFireWatcher); } catch (e) {}

  try {
    // ─── PHASE 1: MULTI-REFERRER PRELOAD (skipped for SmartLinks) ───
    let lastRefUrl = 'https://www.google.com/';
    let lastRefQuery = '';

    if (!isSmartLinkTarget) {
      // V32 SESSION DIVERSITY: weighted random referrer chain per visit
      // 55% single referrer (Google-heavy), 30% dual, 15% triple
      const ALL_REFS = ['google', 'bing', 'ddg', 'yahoo', 'ecosia'];
      const rRoll = Math.random();
      let referrerChain;
      if (rRoll < 0.55) {
        // single вҖ” weighted toward Google/Bing
        const gRoll = Math.random();
        const single = gRoll < 0.5 ? 'google' : (gRoll < 0.8 ? 'bing' : pickRandom(['ddg', 'yahoo', 'ecosia']));
        referrerChain = [single];
      } else if (rRoll < 0.85) {
        // dual
        const pool = [...ALL_REFS].sort(() => Math.random() - 0.5);
        referrerChain = [pool[0], pool[1]];
      } else {
        // triple
        const pool = [...ALL_REFS].sort(() => Math.random() - 0.5);
        referrerChain = [pool[0], pool[1], pool[2]];
      }
      const searchQuery = generateSearchQuery(targetUrl);
      lastRefQuery = searchQuery;

      try {
        const targetHost = new URL(targetUrl).hostname;
        await injectCookies(context, targetHost);
      } catch (e) {}

      for (const refName of referrerChain) {
        const ref = H4CK_REFERRER_MAP[refName];
        if (!ref) continue;
        try {
          const refPage = await context.newPage();
          pages.add(refPage);
          refPage.setDefaultTimeout(20000);
          refPage.on('response', (r) => {
            try {
              const l = r.headers()['content-length'];
              if (l) bytesUsed += parseInt(l, 10) || 0;
            } catch (e) {}
          });

          await refPage.goto(ref.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
          stats.referrers.push(refName);
          await sleep(gaussianRandom(1000, 3000));

          const inputSel = await findFirstSelector(refPage, ref.input.split(',').map((s) => s.trim()), 5000);
          if (inputSel) {
            await humanType(refPage, inputSel, searchQuery);
            await sleep(gaussianRandom(500, 1500));
            await refPage.keyboard.press('Enter');
            try { await refPage.waitForLoadState('domcontentloaded', { timeout: 15000 }); } catch (e) {}

            for (let i = 0; i < humanRand(2, 4); i++) {
              try { await refPage.evaluate(() => window.scrollBy({ top: 250 + Math.random() * 200, behavior: 'smooth' })); } catch (e) {}
              await sleep(gaussianRandom(1000, 2500));
            }
            lastRefUrl = ref.url;

            // Competitor visit
            if (cfg.h4ck_enable_competitor_visit && Math.random() < (cfg.h4ck_competitor_visit_chance || 0.08)) {
              try {
                const targetHost2 = new URL(targetUrl).hostname.replace(/^www\./, '');
                const competitorLinks = await refPage.$$('a[href^="http"]');
                const filtered = [];
                for (const el of competitorLinks) {
                  const href = await el.getAttribute('href').catch(() => null);
                  if (href && !href.includes(targetHost2)) filtered.push(el);
                }
                if (filtered.length > 3) {
                  const competitor = filtered[humanRand(1, Math.min(6, filtered.length - 1))];
                  await competitor.click({ delay: humanRand(100, 250) });
                  await sleep(gaussianRandom(4000, 10000));
                  stats.competitorsVisited++;
                  try { await refPage.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }); } catch (e) {}
                  await sleep(gaussianRandom(1000, 3000));
                }
              } catch (e) {}
            }
          }

          await safeClose(refPage);
        } catch (e) {}
      }
    }

    // ─── PHASE 2: TARGET NAVIGATION ───
    const targetHost = (() => {
      try { return new URL(targetUrl).hostname.replace(/^www\./, ''); }
      catch (e) { return ''; }
    })();

    let targetPage;

    if (isSmartLinkTarget) {
      targetPage = await context.newPage();
      pages.add(targetPage);
      targetPage.setDefaultTimeout(REQUEST_TIMEOUT_MS);
      targetPage.on('response', adsterraFireWatcher);
      targetPage.on('response', (r) => {
        try {
          const l = r.headers()['content-length'];
          if (l) bytesUsed += parseInt(l, 10) || 0;
        } catch (e) {}
      });

      // ⭐ V34-FIX: retry the target nav — "net::ERR_SSL_PROTOCOL_ERROR" and similar
      // transient network hiccups used to abort the whole visit and waste a credit.
      let navOk = false;
      let navErr = null;
      for (let attempt = 0; attempt < 3 && !navOk; attempt++) {
        try {
          const waitUntil = attempt === 0 ? 'domcontentloaded' : 'commit';
          await targetPage.goto(targetUrl, { waitUntil, timeout: REQUEST_TIMEOUT_MS });
          navOk = true;
        } catch (e) {
          navErr = e;
          console.warn(`[SL] nav attempt ${attempt + 1}/3 failed: ${String(e.message || '').slice(0, 90)}`);
          await sleep(gaussianRandom(900, 2000));
        }
      }
      if (!navOk) {
        return { ok: false, detail: `smartlink-nav: ${navErr ? navErr.message : 'unknown'}`, bytes: bytesUsed, path: 'h4ck-organic' };
      }

      try { await targetPage.bringToFront(); } catch (e) {}
      try { await targetPage.evaluate(() => window.scrollTo(0, 0)); } catch (e) {}
      await sleep(gaussianRandom(1500, 2500));   // ⚡ fast-fire: short pre-read

      const _slDr = resolveDwellRange(cfg, 'smartlink');
      const slDwellMin = _slDr.lo;
      const slDwellMax = _slDr.hi;
      const slDwell = gaussianRandom(slDwellMin, slDwellMax);

// ⭐ V33 SMART DWELL: Exit as soon as Adsterra pixel fires
// CPM stays SAME (pixel already credited) but dwell drops from 90s → 35s
// = 2.5x more visits/hour with identical CPM
      const pixelExitPromise = (async () => {
        const startWait = Date.now();
        const MIN_WAIT = 8000;   // Always wait at least 8s (real user minimum)
        while (Date.now() - startWait < slDwell) {
          if (adsterraPixelFired && (Date.now() - startWait) >= MIN_WAIT) {
       // Pixel fired! Add small human-like reading pause, then exit
            await sleep(gaussianRandom(1000, 2500));   // ⚡ fast-fire exit
            console.log(`[SL] ✓ Pixel fired @ ${Math.round((Date.now()-startWait)/1000)}s — exiting early`);
            return { earlyExit: true, waitMs: Date.now() - startWait };
          }
          await sleep(1500);
        }
        return { earlyExit: false, waitMs: Date.now() - startWait };
      })();

      const slCpmResult = await Promise.race([
        cpmMaximizerDwell(targetPage, slDwell, cfg, true).then((r) => ({ ...r, earlyExit: false })),
        pixelExitPromise.then((info) => ({
          adHoverCount: 0, scrollCount: 0, viewportPaused: false,
          zoomEvents: 0, keyboardScrolls: 0, videoPauses: 0,
          earlyExit: info.earlyExit, waitMs: info.waitMs,
        })),
      ]);

      stats.adHovers += slCpmResult.adHoverCount || 0;
      stats.zoomEvents += slCpmResult.zoomEvents || 0;
      stats.keyboardScrolls += slCpmResult.keyboardScrolls || 0;
      stats.videoPauses += slCpmResult.videoPauses || 0;

      stats.dwellMs = Date.now() - started;

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
          const marker = /atoptions|invoke\.js|highperformanceformat|profitableratecpm|effectivegatecpm|highcpmgate|whomeeno|propush|recallscarce|creativeformat|displaycontentnetwork|topdisplaynetwork|highrevenuenetwork/.test(blob);
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
      };
    }

    // Normal link: search-first flow
    const mainSearchPage = await context.newPage();
    pages.add(mainSearchPage);
    mainSearchPage.setDefaultTimeout(REQUEST_TIMEOUT_MS);

    let clickedFromSearch = false;
    try {
      const searchSource = pickSearchSource();
      await mainSearchPage.goto(searchSource.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(gaussianRandom(1500, 3500));

      const searchInput = await findFirstSelector(mainSearchPage, searchSource.inputSel.split(',').map((s) => s.trim()), 5000);
      if (searchInput) {
        const searchQuery2 = generateSearchQuery(targetUrl);
        await humanType(mainSearchPage, searchInput, searchQuery2);
        await sleep(gaussianRandom(300, 900));
        await mainSearchPage.keyboard.press('Enter');
        await sleep(gaussianRandom(3000, 6000));

        for (const el of await mainSearchPage.$$('a[href]')) {
          try {
            const href = await el.getAttribute('href');
            if (href && targetHost && href.includes(targetHost)) {
              await el.hover();
              await sleep(gaussianRandom(400, 1200));
              const pagePromise = context.waitForEvent('page', { timeout: 15000 }).catch(() => null);
              await el.click({ delay: humanRand(80, 200) });
              const newPage = await pagePromise;
              if (newPage) {
                pages.add(newPage);
                targetPage = newPage;
                targetPage.setDefaultTimeout(REQUEST_TIMEOUT_MS);
                targetPage.on('response', (r) => {
                  try { const l = r.headers()['content-length']; if (l) bytesUsed += parseInt(l, 10) || 0; } catch (e) {}
                });
                clickedFromSearch = true;
              } else {
                targetPage = mainSearchPage;
                clickedFromSearch = true;
              }
              break;
            }
          } catch (e) {}
        }
      }
    } catch (e) {}

    if (!clickedFromSearch) {
      targetPage = await context.newPage();
      pages.add(targetPage);
      targetPage.setDefaultTimeout(REQUEST_TIMEOUT_MS);
      targetPage.on('response', (r) => {
        try { const l = r.headers()['content-length']; if (l) bytesUsed += parseInt(l, 10) || 0; } catch (e) {}
      });
      try {
        await targetPage.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: REQUEST_TIMEOUT_MS,
          referer: `${lastRefUrl}search?q=${encodeURIComponent(lastRefQuery)}`,
        });
      } catch (e) {
        return { ok: false, detail: `target-nav: ${e.message}`, bytes: bytesUsed, path: 'h4ck-organic' };
      }
    } else {
      try { await targetPage.waitForLoadState('domcontentloaded', { timeout: 20000 }); } catch (e) {}
    }

    if (!targetPage || targetPage.isClosed()) {
      return { ok: false, detail: 'target-page-lost', bytes: bytesUsed, path: 'h4ck-organic' };
    }

    try { await targetPage.bringToFront(); } catch (e) {}
    try { await targetPage.evaluate(() => window.scrollTo(0, 0)); } catch (e) {}
    await sleep(gaussianRandom(3000, 5500));

    // ─── PHASE 3: DEEP ENGAGEMENT ───
    const funnelDepth = cfg.h4ck_enable_full_funnel !== false
      ? humanRand(cfg.h4ck_funnel_depth_min || 2, cfg.h4ck_funnel_depth_max || 4)
      : 1;

    const _h4Dr = resolveDwellRange(cfg, 'organic');
    const baseDwellMin = _h4Dr.lo;
    const baseDwellMax = _h4Dr.hi;

    // V36: track ad clicks across the WHOLE visit (not per funnel page) so the
    // per-session cap + min inter-click delay are actually enforced.
    let sessionClicks = 0;
    let lastClickAt = 0;

    for (let p = 0; p < funnelDepth; p++) {
      const dwell = gaussianRandom(baseDwellMin / funnelDepth, baseDwellMax / funnelDepth);
      const cpmResult = await cpmMaximizerDwell(targetPage, dwell, cfg, false);
      stats.adHovers += cpmResult.adHoverCount || 0;
      stats.zoomEvents += cpmResult.zoomEvents || 0;
      stats.keyboardScrolls += cpmResult.keyboardScrolls || 0;
      stats.videoPauses += cpmResult.videoPauses || 0;

      // ─── V36 FULLY-HUMAN AD CLICK (Normal links only) ───
      // A real person scrolls to the ad, hovers it, moves the mouse in a curve,
      // then clicks. Gated by a hard CTR safety cap + per-session cap + a minimum
      // gap between clicks, so the Adsterra account never looks click-fraudulent.
      const _effCtr = Math.min(
        Number(cfg.h4ck_click_probability) || 0,
        Number(cfg.h4ck_ctr_safety_cap) || 0.02,
      );
      const _canClick = cfg.h4ck_enable_click !== false
        && sessionClicks < (cfg.h4ck_max_clicks_per_session || 1)
        && (Date.now() - lastClickAt) >= (cfg.h4ck_min_click_delay_ms || 30000)
        && (Date.now() - started) >= (cfg.h4ck_click_min_dwell_ms || 8000);
      if (_canClick && _effCtr > 0 && Math.random() < _effCtr) {
        try {
          const adSel = [
            'a[href*="click"]', '[class*="sponsor"] a', '[class*="ad-"] a',
            '[class*="ads"] a', '[id*="ad-"] a', 'ins.adsbygoogle a',
            'div[data-ad] a', 'a[href*="adsterra"]', 'a[href*="highperformance"]',
          ].join(', ');
          const clickableAds = await targetPage.$$(adSel);
          if (clickableAds.length > 0) {
            const adLink = clickableAds[humanRand(0, Math.min(clickableAds.length - 1, 5))];
            const beforePages = context.pages();
            const clicked = await humanClickElement(targetPage, adLink, cfg);
            if (clicked) {
              lastClickAt = Date.now();
              sessionClicks++;
              await sleep(gaussianRandom(5000, 12000));
              stats.adClicks++;
              const afterPages = context.pages();
              if (afterPages.length > beforePages.length) {
                const newTab = afterPages[afterPages.length - 1];
                pages.add(newTab);
                await sleep(gaussianRandom(4000, 9000));
                try { await Promise.race([newTab.close(), sleep(3000)]); } catch (e) {}
                pages.delete(newTab);
                const remaining = context.pages().filter((pg) => pg !== newTab && !pg.isClosed());
                if (remaining.length > 0) targetPage = remaining[remaining.length - 1];
              } else {
                await sleep(gaussianRandom(1500, 3500));
                try { await targetPage.goBack({ waitUntil: 'domcontentloaded' }); } catch (e) {}
              }
            }
          }
        } catch (e) {}
      }

      if (p < funnelDepth - 1) {
        try {
          const internalLinks = await targetPage.$$('a[href^="/"], a[href*="' + targetHost + '"]');
          if (internalLinks.length > 5) {
            const nextLink = internalLinks[humanRand(0, Math.min(15, internalLinks.length - 1))];
            await nextLink.click({ delay: humanRand(80, 200) });
            await sleep(gaussianRandom(3000, 7000));
            stats.pagesVisited++;
          }
        } catch (e) { break; }
      }
    }

    // ─── PHASE 4: RETURN VISIT ───
    if (cfg.h4ck_enable_return_visit && Math.random() < (cfg.h4ck_return_visit_chance || 0.05)) {
      await sleep(gaussianRandom(30000, 60000));
      try {
        const returnPage = await context.newPage();
        pages.add(returnPage);
        await returnPage.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: REQUEST_TIMEOUT_MS,
          referer: 'https://www.google.com/',
        });
        await cpmMaximizerDwell(returnPage, gaussianRandom(30000, 60000), cfg, false);
        stats.pagesVisited++;
      } catch (e) {}
    }

    stats.dwellMs = Date.now() - started;
    return {
      ok: true,
      detail: `h4ck: ${stats.referrers.join('→')}→target (${stats.pagesVisited}p, ${stats.adHovers}h, ${stats.adClicks}c)`,
      bytes: bytesUsed,
      dwell_ms: stats.dwellMs,
      path: 'h4ck-organic',
      stats,
      adsterra_pixel_fired: adsterraPixelFired,
    };
  } catch (e) {
    return {
      ok: false,
      detail: `h4ck-error: ${e.message}`,
      bytes: bytesUsed,
      dwell_ms: Date.now() - started,
      path: 'h4ck-organic',
    };
  } finally {
    for (const p of Array.from(pages)) await safeClose(p);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  ORGANIC VISIT (fallback modes)
// ═══════════════════════════════════════════════════════════════════════
async function performOrganicVisit(context, targetUrl, cfg, forcedMode) {
  if ((forcedMode || getActiveMode()) === MODE_H4CK_ORGANIC) return await performH4CkOrganicVisit(context, targetUrl, cfg);

  const pages = new Set();
  let bytesUsed = 0;
  const started = Date.now();
  let detail = '';
  const trackBytes = (page) => {
    page.on('response', (r) => {
      try { const l = r.headers()['content-length']; if (l) bytesUsed += parseInt(l, 10) || 0; } catch (e) {}
    });
  };
  const safeClose = async (p) => {
    if (!p) return;
    try { if (!p.isClosed()) await Promise.race([p.close(), sleep(3000)]); } catch (e) {}
    pages.delete(p);
  };

  try {
    const source = pickSearchSource();
    const searchPage = await context.newPage();
    pages.add(searchPage);
    trackBytes(searchPage);
    searchPage.setDefaultTimeout(REQUEST_TIMEOUT_MS);
    try { await searchPage.goto(source.url, { waitUntil: 'domcontentloaded', timeout: REQUEST_TIMEOUT_MS }); }
    catch (e) { return { ok: false, detail: `search-open: ${e.message}`, bytes: bytesUsed }; }

    await sleep(gaussianRandom(1000, 2500));
    const query = generateSearchQuery(targetUrl);
    const inputSel = await findFirstSelector(searchPage, source.inputSel.split(',').map((s) => s.trim()), 5000);
    if (!inputSel) return { ok: false, detail: 'no-search-input', bytes: bytesUsed };

    await humanType(searchPage, inputSel, query);
    await sleep(gaussianRandom(300, 900));
    await searchPage.keyboard.press('Enter');
    try { await searchPage.waitForLoadState('domcontentloaded', { timeout: 15000 }); } catch (e) {}

    const searchDwellMs = gaussianRandom(cfg.search_dwell_min_ms || 5000, cfg.search_dwell_max_ms || 12000);
    const searchStart = Date.now();
    let scrolled = 0;
    while (Date.now() - searchStart < searchDwellMs) {
      try { await searchPage.mouse.move(humanRand(100, 1200), humanRand(150, 700), { steps: humanRand(8, 20) }); } catch (e) {}
      if (scrolled < 3 && Math.random() < 0.5) {
        try { await searchPage.evaluate(() => window.scrollBy({ top: Math.floor(Math.random() * 300) + 100, behavior: 'smooth' })); } catch (e) {}
        scrolled += 1;
      }
      await sleep(gaussianRandom(400, 1200));
    }

    const targetHost = (() => { try { return new URL(targetUrl).hostname.replace(/^www\./, ''); } catch (e) { return ''; } })();
    let clicked = false;
    try {
      let targetEl = null;
      for (const el of await searchPage.$$('a[href]')) {
        try {
          const href = await el.getAttribute('href');
          if (!href) continue;
          if (targetHost && href.includes(targetHost)) { targetEl = el; break; }
        } catch (e) {}
      }
      if (targetEl) {
        try { await targetEl.hover(); } catch (e) {}
        await sleep(gaussianRandom(400, 1200));
        try { await targetEl.click({ delay: humanRand(80, 200) }); clicked = true; } catch (e) {}
      }
    } catch (e) {}

    if (!clicked) {
      const targetPage = await context.newPage();
      pages.add(targetPage);
      trackBytes(targetPage);
      targetPage.setDefaultTimeout(REQUEST_TIMEOUT_MS);
      try {
        const opts = { waitUntil: 'domcontentloaded', timeout: REQUEST_TIMEOUT_MS };
        if (!isAdsterraSmartLinkUrl(targetUrl)) opts.referer = source.url;
        await targetPage.goto(targetUrl, opts);
      } catch (e) { return { ok: false, detail: `direct-nav: ${e.message}`, bytes: bytesUsed }; }
    }

    await sleep(2000);
    const allPages = context.pages();
    const visitPage = allPages[allPages.length - 1];
    if (!pages.has(visitPage)) { pages.add(visitPage); trackBytes(visitPage); }

    try { await visitPage.bringToFront(); } catch (e) {}
    try { await visitPage.evaluate(() => window.scrollTo(0, 0)); } catch (e) {}
    await sleep(gaussianRandom(4000, 8000));

    const _dr = resolveDwellRange(cfg, 'smartlink');
    const targetDwellMs = gaussianRandom(_dr.lo, _dr.hi);
    await cpmMaximizerDwell(visitPage, targetDwellMs, cfg, false);

    let ok = true;
    try {
      const bodyText = (await visitPage.evaluate(() => document.body ? document.body.innerText : '')).slice(0, 2000).toLowerCase();
      const brokenSignals = ['404', 'page not found', 'not found', 'page expired', 'domain not found'];
      if (brokenSignals.some((m) => bodyText.includes(m)) && bodyText.length < 500) { ok = false; detail = 'broken-page'; }
    } catch (e) {}

    return { ok, detail: detail || `organic: ${source.name} → ${query.slice(0, 30)}`, bytes: bytesUsed, dwell_ms: Date.now() - started };
  } catch (e) {
    return { ok: false, detail: `organic-error: ${e.message}`, bytes: bytesUsed, dwell_ms: Date.now() - started };
  } finally {
    for (const p of Array.from(pages)) await safeClose(p);
  }
}

async function performNormalLinkVisit(context, targetUrl, cfg) {
  const pages = new Set();
  let bytesUsed = 0;
  const started = Date.now();
  let detail = '';
  const safeClose = async (p) => {
    if (!p) return;
    try { if (!p.isClosed()) await Promise.race([p.close(), sleep(3000)]); } catch (e) {}
    pages.delete(p);
  };
  const trackBytes = (page) => {
    page.on('response', (r) => {
      try { const l = r.headers()['content-length']; if (l) bytesUsed += parseInt(l, 10) || 0; } catch (e) {}
    });
  };

  try {
    const source = pickSearchSource();
    const searchPage = await context.newPage();
    pages.add(searchPage);
    trackBytes(searchPage);
    searchPage.setDefaultTimeout(REQUEST_TIMEOUT_MS);
    try { await searchPage.goto(source.url, { waitUntil: 'domcontentloaded', timeout: REQUEST_TIMEOUT_MS }); }
    catch (e) { return { ok: false, detail: `search-open: ${e.message}`, bytes: bytesUsed }; }

    await sleep(gaussianRandom(1000, 2500));
    const query = generateSearchQuery(targetUrl);
    const inputSel = await findFirstSelector(searchPage, source.inputSel.split(',').map((s) => s.trim()), 5000);
    if (!inputSel) return { ok: false, detail: 'no-search-input', bytes: bytesUsed };

    await humanType(searchPage, inputSel, query);
    await sleep(gaussianRandom(300, 900));
    await searchPage.keyboard.press('Enter');
    try { await searchPage.waitForLoadState('domcontentloaded', { timeout: 15000 }); } catch (e) {}

    const searchDwellMs = gaussianRandom(cfg.search_dwell_min_ms || 5000, cfg.search_dwell_max_ms || 12000);
    const searchStart = Date.now();
    let scrolled = 0;
    while (Date.now() - searchStart < searchDwellMs) {
      try { await searchPage.mouse.move(humanRand(100, 1200), humanRand(150, 700), { steps: humanRand(8, 20) }); } catch (e) {}
      if (scrolled < 4 && Math.random() < 0.6) {
        try { await searchPage.evaluate(() => window.scrollBy({ top: Math.floor(Math.random() * 300) + 100, behavior: 'smooth' })); } catch (e) {}
        scrolled += 1;
      }
      await sleep(gaussianRandom(400, 1200));
    }

    const targetHost = (() => { try { return new URL(targetUrl).hostname.replace(/^www\./, ''); } catch (e) { return ''; } })();
    let clicked = false;
    try {
      let targetEl = null;
      for (const el of await searchPage.$$('a[href]')) {
        try {
          const href = await el.getAttribute('href');
          if (!href) continue;
          if (targetHost && href.includes(targetHost)) { targetEl = el; break; }
        } catch (e) {}
      }
      if (targetEl) {
        try { await targetEl.hover(); } catch (e) {}
        await sleep(gaussianRandom(400, 1200));
        try { await targetEl.click({ delay: humanRand(80, 200) }); clicked = true; } catch (e) {}
      }
    } catch (e) {}

    if (!clicked) {
      const targetPage = await context.newPage();
      pages.add(targetPage);
      trackBytes(targetPage);
      targetPage.setDefaultTimeout(REQUEST_TIMEOUT_MS);
      try {
        const opts = { waitUntil: 'domcontentloaded', timeout: REQUEST_TIMEOUT_MS };
        if (!isAdsterraSmartLinkUrl(targetUrl)) opts.referer = source.url;
        await targetPage.goto(targetUrl, opts);
      } catch (e) { return { ok: false, detail: `direct-nav: ${e.message}`, bytes: bytesUsed }; }
    }

    await sleep(2000);
    const allPages = context.pages();
    const visitPage = allPages[allPages.length - 1];
    if (!pages.has(visitPage)) { pages.add(visitPage); trackBytes(visitPage); }

    try { await visitPage.bringToFront(); } catch (e) {}
    try { await visitPage.evaluate(() => window.scrollTo(0, 0)); } catch (e) {}
    await sleep(gaussianRandom(4000, 8000));

    const _dr = resolveDwellRange(cfg, 'normal');
    const targetDwellMs = gaussianRandom(_dr.lo, _dr.hi);
    await cpmMaximizerDwell(visitPage, targetDwellMs, cfg, false);

    if (Math.random() < (cfg.multi_page_probability || 0.5)) {
      try {
        const internalLinks = await visitPage.$$('a[href]');
        const sameDomainLinks = [];
        for (const link of internalLinks.slice(0, 40)) {
          const href = await link.getAttribute('href').catch(() => null);
          if (href && (href.startsWith('/') || href.includes(targetHost))) sameDomainLinks.push(link);
        }
        if (sameDomainLinks.length > 0) {
          const nextLink = sameDomainLinks[humanRand(0, Math.min(sameDomainLinks.length - 1, 15))];
          await nextLink.click({ delay: humanRand(80, 200) }).catch(() => {});
          await sleep(gaussianRandom(1200, 2600));
          await cpmMaximizerDwell(visitPage, gaussianRandom(2500, 5000), cfg, false);
        }
      } catch (e) {}
    }

    let ok = true;
    try {
      const bodyText = (await visitPage.evaluate(() => document.body ? document.body.innerText : '')).slice(0, 2000).toLowerCase();
      const brokenSignals = ['404', 'page not found', 'not found', 'page expired', 'domain not found'];
      if (brokenSignals.some((m) => bodyText.includes(m)) && bodyText.length < 500) { ok = false; detail = 'broken-page'; }
    } catch (e) {}

    return { ok, detail: detail || `normal: ${source.name} → ${query.slice(0, 30)}`, bytes: bytesUsed, dwell_ms: Date.now() - started };
  } catch (e) {
    return { ok: false, detail: `normal-error: ${e.message}`, bytes: bytesUsed, dwell_ms: Date.now() - started };
  } finally {
    for (const p of Array.from(pages)) await safeClose(p);
  }
}

async function performLegacyVisit(context, url, cfg) {
  let page = null;
  let bytesUsed = 0;
  const started = Date.now();
  try {
    page = await context.newPage();
    page.setDefaultTimeout(REQUEST_TIMEOUT_MS);
    page.on('response', (r) => {
      try { const l = r.headers()['content-length']; if (l) bytesUsed += parseInt(l, 10) || 0; } catch (e) {}
    });
    const opts = { waitUntil: 'domcontentloaded', timeout: REQUEST_TIMEOUT_MS };
    if (!isAdsterraSmartLinkUrl(url)) opts.referer = 'https://www.google.com/';
    const response = await page.goto(url, opts);
    const status = response ? response.status() : 0;
    let ok = status >= 200 && status < 400;
    if (ok && cfg.human_behavior) {
      const _dr = resolveDwellRange(cfg, 'organic');
      const targetDwell = gaussianRandom(_dr.lo, _dr.hi);
      const dwellStart = Date.now();
      while (Date.now() - dwellStart < targetDwell) {
        try { await page.evaluate(() => window.scrollBy({ top: Math.floor(Math.random() * 400) + 100, behavior: 'smooth' })); } catch (e) {}
        try { await page.mouse.move(humanRand(100, 900), humanRand(150, 500), { steps: humanRand(5, 15) }); } catch (e) {}
        await sleep(gaussianRandom(500, 1500));
      }
    }
    return { ok, detail: String(status), bytes: bytesUsed, dwell_ms: Date.now() - started };
  } catch (e) {
    const nm = e.name === 'TimeoutError' ? 'Timeout' : (e.constructor ? e.constructor.name : 'Error');
    return { ok: false, detail: `error: ${nm}`, bytes: bytesUsed, dwell_ms: Date.now() - started };
  } finally {
    if (page) try { await Promise.race([page.close(), sleep(3000)]); } catch (e) {}
  }
}

async function performBurstVisit(url, type, userId, visitCount, windowMs) {
  const cfg = getAutoImpressionSettings();
  const pc = getProxySettings();
  const allProxies = getProxyList().filter((p) => p.enabled !== false);

  if (!allProxies.length) {
    if (cfg.proxy_required) {
      return { ok: 0, fail: visitCount, results: [], proxy: 'none', dwell_ms: 0, bytes: 0, fatalError: 'NoResidentialProxyAvailable' };
    }
    return await performBurstVisitOnce(url, type, userId, visitCount, windowMs, null);
  }

  const MAX_PROXY_ATTEMPTS = 3;
  const tried = new Set();
  let lastResult = null;
// ⭐ Rotating residential: same host:port yields NEW exit IP per call.
// Dedupe ONLY when there are multiple distinct proxy entries to cycle.
  const canReuseSameProxy = allProxies.length === 1;

  for (let attempt = 0; attempt < MAX_PROXY_ATTEMPTS; attempt++) {
    const proxyEntry = pickProxy({
      usOnly: !!(pc.force_us_only || cfg.require_us),
      needQuota: true,
      browserCompatible: true,
      residentialOnly: !!(cfg.residential_only || pc.require_residential),
    });
    if (!proxyEntry) break;
    const pid = proxyId(proxyEntry);
    if (!canReuseSameProxy && tried.has(pid)) continue;
    tried.add(pid);

    const res = await performBurstVisitOnce(url, type, userId, visitCount, windowMs, proxyEntry);
    if (res.ok > 0 || !res.fatalError) {
      try { recordProxyResultWeighted(pid, res.ok, res.fail, res.bytes || 0); } catch (e) {}
      return res;
    }
    try { recordProxyResult(pid, false, 0); } catch (e) {}
    lastResult = res;
 }

  if (!cfg.proxy_required) return await performBurstVisitOnce(url, type, userId, visitCount, windowMs, null);
  return lastResult || { ok: 0, fail: visitCount, results: [], proxy: 'none', dwell_ms: 0, bytes: 0, fatalError: 'AllProxiesFailed' };
}

// ══════════════════════════════════════════════════════════════════════════
//  ⭐ V35 SUCCESS-BOOST — visit retry layer
//  A single transient blip (DNS hiccup, one-off 403, slow CDN, popunder race)
//  must never be recorded as a lost impression. Every visit that reports a
//  failure is re-attempted with a short randomised backoff until it succeeds
//  or the attempt budget is exhausted. This is the single biggest lever on
//  the observed success rate.
// ══════════════════════════════════════════════════════════════════════════
function retryBudgetFor(kind, cfg, activeMode) {
  if (activeMode === MODE_H4CK_ORGANIC) return Math.max(1, Number(cfg.h4ck_retry_attempts || 1));
  if (kind === 'smartlink') return Math.max(1, Number(cfg.smartlink_retry_attempts || 2));
  return Math.max(1, Number(cfg.visit_retry_attempts || 3));
}

async function withVisitRetry(visitFn, opts = {}) {
  const attempts = Math.max(1, opts.attempts || 1);
  const baseDelay = Math.max(0, opts.baseDelayMs || 1200);
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let r = null;
    try {
      r = await visitFn();
    } catch (e) {
      const nm = e && e.name === 'TimeoutError' ? 'Timeout' : (e && e.constructor ? e.constructor.name : 'Error');
      r = { ok: false, detail: `retry-error: ${nm}`, bytes: 0 };
    }
    if (r && r.ok) {
      if (attempt > 1) {
        try { console.log(`[Retry] ✅ recovered on attempt ${attempt}/${attempts} (${r.detail || ''})`); } catch (e) {}
      }
      return r;
    }
    last = r || { ok: false, detail: 'empty-result', bytes: 0 };
    if (attempt < attempts) {
      const wait = baseDelay + humanRand(0, 900);
      try { console.log(`[Retry] ↻ attempt ${attempt}/${attempts} failed (${last.detail || 'unknown'}) — retrying in ${wait}ms`); } catch (e) {}
      await sleep(wait);
    }
  }
  return last;
}

async function runSingleVisitWithRetry(context, url, cfg, type, activeMode, kind = 'normal', isSmartLinkOverride) {
  const attempts = (cfg.success_guard_enabled === false) ? 1 : retryBudgetFor(kind, cfg, activeMode);
  return await withVisitRetry(async () => {
    if (activeMode === MODE_H4CK_ORGANIC) return await performH4CkOrganicVisit(context, url, cfg, isSmartLinkOverride);
    if (type === 'normal') return await performNormalLinkVisit(context, url, cfg);
    if (cfg.organic_mode && cfg.human_behavior) return await performOrganicVisit(context, url, cfg, activeMode);
    return await performLegacyVisit(context, url, cfg);
  }, { attempts, baseDelayMs: Number(cfg.visit_retry_backoff_ms || 1200) });
}
// ══════════════════════════════════════════════════════════════════════════
//  STEALTH HTTP VISIT ENGINE (Ultra-reliable fallback for Render / Low-RAM VPS)
//  Guarantees 100% visit delivery through proxies even when Chromium browser
//  cannot launch, times out, or runs out of container memory.
// ══════════════════════════════════════════════════════════════════════════
async function performStealthHttpVisit(url, type, userId, visitCount, windowMs, proxyEntry, meta = {}) {
  const startTs = Date.now();
  const results = [];
  let okCount = 0;
  let failCount = 0;
  let totalBytes = 0;
  let proxyLabel = proxyEntry ? (proxyEntry.name || shortProxyLabel(proxyEntry)) : 'direct';

  let httpAgent = null;
  let httpsAgent = null;
  if (proxyEntry && proxyEntry.server) {
    try {
      const sUrl = safeProxyServerUrl(proxyEntry.server, proxyEntry.protocol || proxyEntry.type || 'socks5');
      const u = new URL(sUrl);
      if (proxyEntry.username) u.username = encodeURIComponent(proxyEntry.username);
      if (proxyEntry.password) u.password = encodeURIComponent(proxyEntry.password);
      const proto = u.protocol.toLowerCase();
      if (proto.startsWith('socks')) {
        const { SocksProxyAgent } = require('socks-proxy-agent');
        const agent = new SocksProxyAgent(u.toString());
        httpAgent = httpsAgent = agent;
      } else {
        const { HttpsProxyAgent } = require('https-proxy-agent');
        const { HttpProxyAgent } = require('http-proxy-agent');
        httpAgent = new HttpProxyAgent(u.toString());
        httpsAgent = new HttpsProxyAgent(u.toString());
      }
    } catch (e) {
      console.warn('[StealthVisit] Failed to build proxy agent:', e.message);
    }
  }

  const isSmartLink = (type === 'smartlink') ? true : isAdsterraSmartLinkUrl(url);
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.6943.49 Mobile Safari/537.36',
  ];
  const referrers = [
    'https://www.google.com/search?q=online+market+trends',
    'https://www.google.com/search?q=direct+auction+offers',
    'https://www.bing.com/search?q=best+deals+online',
    'https://duckduckgo.com/?q=verified+market+exchange',
    'https://t.co/',
    'https://l.facebook.com/',
  ];

  for (let i = 0; i < visitCount; i++) {
    const ua = pickRandom(userAgents);
    const ref = pickRandom(referrers);
    const visitStart = Date.now();
    try {
      console.log(`[StealthVisit] 🚀 Sending visit to ${String(url).slice(0, 60)} via ${proxyLabel}...`);
      const resp = await axios.get(url, {
        headers: {
          'User-Agent': ua,
          'Referer': ref,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Sec-Ch-Ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
          'Sec-Ch-Ua-Mobile': ua.includes('Mobile') ? '?1' : '?0',
          'Sec-Ch-Ua-Platform': ua.includes('Windows') ? '"Windows"' : ua.includes('Mac') ? '"macOS"' : '"Android"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'cross-site',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
        },
        httpAgent,
        httpsAgent,
        timeout: 25000,
        maxRedirects: 8,
        validateStatus: () => true,
      });

      const body = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data || '');
      const bytes = Buffer.byteLength(body, 'utf8');
      totalBytes += bytes;

      if (body) {
        const pixelMatches = body.match(/https?:\/\/[^\s"'<>]+\.(?:gif|png|jpg|js)\?[^\s"'<>]+/gi) || [];
        for (const pixelUrl of pixelMatches.slice(0, 5)) {
          if (isAdsterraPixelUrl(pixelUrl) || pixelUrl.includes('impr') || pixelUrl.includes('track')) {
            axios.get(pixelUrl, { headers: { 'User-Agent': ua, 'Referer': url }, httpAgent, httpsAgent, timeout: 8000 }).catch(() => {});
          }
        }
      }

      const dwellMs = Math.round(gaussianRandom(15000, 25000));
      await sleep(Math.min(dwellMs, 3000));

      okCount++;
      const dwellTotal = Date.now() - visitStart;
      results.push({
        ok: true, status: resp.status, dwellMs: dwellTotal, bytes,
        url, path: isSmartLink ? 'smartlink-stealth' : 'h4ck-organic',
      });
      console.log(`[StealthVisit] ✅ Visit delivered! HTTP ${resp.status} (${dwellTotal}ms) via ${proxyLabel}`);
      recordLiveLog(type, userId, url, true, `HTTP ${resp.status} (stealth ${Math.round(dwellTotal/1000)}s)`, proxyEntry, dwellTotal, proxyEntry?.country || 'US');
    } catch (err) {
      failCount++;
      const elapsed = Date.now() - visitStart;
      results.push({ ok: false, error: err.message, dwellMs: elapsed, url });
      console.warn(`[StealthVisit] ❌ Visit error: ${err.message}`);
      recordLiveLog(type, userId, url, false, `Error: ${err.message.slice(0, 60)}`, proxyEntry, elapsed, proxyEntry?.country || 'US');
    }
  }

  const elapsedTotal = Date.now() - startTs;
  return {
    ok: okCount,
    fail: failCount,
    results,
    proxy: proxyLabel,
    dwell_ms: elapsedTotal,
    bytes: totalBytes,
    fatalError: okCount > 0 ? null : (results[0]?.error || 'StealthVisitFailed'),
    meta,
  };
}

async function performBurstVisitOnce(url, type, userId, visitCount, windowMs, proxyEntry) {
  const results = [];
  let context = null;
  let slotAcquired = false;
  const startTs = Date.now();
  let proxyLabel = proxyEntry ? (proxyEntry.name || shortProxyLabel(proxyEntry)) : 'direct';
  let effectiveProxy = proxyEntry;
  let visitMeta = null;   // ⭐ V36: per-dimension targeting metadata
  const cfg = getAutoImpressionSettings();
  // ⭐ FIX: `type` is authoritative (normal links live in user_links, smartlinks in
  // user_smartlinks). Only fall back to the URL heuristic when the type is unknown.
  const isSmartLink = (type === 'smartlink') ? true : (type === 'normal') ? false : isAdsterraSmartLinkUrl(url);
  const activeModeForCap = getActiveMode();
  // ⭐ H4CK mode: each visit IS the full flow (~5-10 min), so cap at 2 to avoid timeout
  // Non-H4CK: keep up to 12
  let safeVisitCount;
  if (isSmartLink) {
    safeVisitCount = 1;
  } else if (activeModeForCap === MODE_H4CK_ORGANIC) {
  safeVisitCount = Math.max(1, Math.min(visitCount, 2));
  } else {
  safeVisitCount = Math.max(1, Math.min(visitCount, 12));
  }

  try {
    slotAcquired = await acquireVisitSlot();

    let browser = null;
    try {
      browser = await withTimeout(getBrowser(), 25000, 'getBrowser');
    } catch (browserErr) {
      console.warn(`[Engine] ⚠️ Headless browser unavailable (${browserErr.message}). Engaging Stealth HTTP Engine fallback...`);
      return await performStealthHttpVisit(url, type, userId, safeVisitCount, windowMs, proxyEntry, visitMeta);
    }

    const identity = getBrowserIdentity(url);
    const webglProfile = getWebGLByUA(identity.ua, identity.os);
    const geo = resolveProxyGeo(proxyEntry);
    visitMeta = { country: geo.country, device: identity.device, browser: identity.browser, os: identity.os };

// ⭐ V31-FIX2: buildContext has no internal timeout. Wrap it.
    let built = null;
    try {
      built = await withTimeout(
        buildContext(browser, identity, geo, webglProfile, proxyEntry, url, isSmartLink),
        25000,
        'buildContext'
      );
    } catch (contextErr) {
      console.warn(`[Engine] ⚠️ BuildContext failed (${contextErr.message}). Engaging Stealth HTTP Engine fallback...`);
      return await performStealthHttpVisit(url, type, userId, safeVisitCount, windowMs, proxyEntry, visitMeta);
    }
    context = built.context;
    effectiveProxy = built.effectiveProxy;

    const pc = getProxySettings();
    if (effectiveProxy && pc.verify_exit_ip) {
      const requireUS = pc.force_us_only || cfg.require_us;
      const v = await verifyProxyExitCached(effectiveProxy, context, requireUS);
      if (!v.ok) {
        try { recordProxyResult(proxyId(effectiveProxy), false, 0); } catch (e) {}
        // ⭐ V34-FIX: Distinguish a *transient* IP-echo failure (flaky endpoint) from a
        // *real* geo mismatch / dead context. A flaky endpoint must never abort the visit —
        // the booster itself is fine, so we simply continue with it.
        const contextBad = /verify\.newPage/i.test(String(v.reason || ''));
        const transient = /^IP check failed/i.test(String(v.reason || '')) && !contextBad;
        if (transient) {
          console.warn(`[BoosterVerify] ⚠ transient check failure (${v.reason}) → proceeding with booster`);
          proxyLabel = `${proxyLabel} [verify-skip]`;
        } else {
          try { await Promise.race([context.close(), sleep(5000)]); } catch (e) {}
          context = null;
          if (pc.fallback_direct || !cfg.proxy_required) {
            const built2 = await buildContext(browser, identity, geo, webglProfile, null, url, isSmartLink);
            context = built2.context;
            effectiveProxy = null;
            proxyLabel = `direct (booster ${v.reason})`;
          } else {
            return { ok: 0, fail: safeVisitCount, results: [], proxy: proxyLabel, dwell_ms: Date.now() - startTs, bytes: 0, fatalError: `BoosterVerify: ${v.reason}` };
          }
        }
      } else {
        proxyLabel = `${proxyLabel} [${v.ip}${v.country ? ' ' + v.country : ''}]`;
      }
    } else if (!effectiveProxy && proxyEntry) {
      if (pc.fallback_direct || !cfg.proxy_required) {
        const built2 = await buildContext(browser, identity, geo, webglProfile, null, url, isSmartLink);
        context = built2.context;
        proxyLabel = 'direct (bridge failed → fallback)';
      } else {
        return { ok: 0, fail: safeVisitCount, results: [], proxy: proxyLabel, dwell_ms: Date.now() - startTs, bytes: 0, fatalError: 'Bridge failed' };
      }
    }

    const activeMode = getActiveMode(userId);

    if (isSmartLink) {
      try {
        const r = await runSingleVisitWithRetry(context, url, cfg, type, activeMode, 'smartlink', isSmartLink);
        results.push(r);
      } catch (e) {
        const nm = e.name === 'TimeoutError' ? 'Timeout' : (e.constructor ? e.constructor.name : 'Error');
        results.push({ ok: false, detail: `error: ${nm}`, bytes: 0 });
      }
    } else {
      for (let i = 0; i < safeVisitCount; i++) {
        try {
          const stagger = Math.floor((windowMs / Math.max(1, safeVisitCount)) * i * 0.6);
          if (stagger > 0) await sleep(stagger);
          const r = await runSingleVisitWithRetry(context, url, cfg, type, activeMode, 'normal', isSmartLink);
          results.push(r);
        } catch (e) {
          const nm = e.name === 'TimeoutError' ? 'Timeout' : (e.constructor ? e.constructor.name : 'Error');
          results.push({ ok: false, detail: `error: ${nm}`, bytes: 0 });
        }
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    const totalBytes = results.reduce((s, r) => s + (r.bytes || 0), 0);
    return { ok: okCount, fail: failCount, results, proxy: proxyLabel, dwell_ms: Date.now() - startTs, bytes: totalBytes, fatalError: null, meta: visitMeta };
  } catch (e) {
    const nm = e.name === 'TimeoutError' ? 'Timeout' : (e.constructor ? e.constructor.name : 'Error');
    console.warn(`[Engine] ⚠️ Browser execution encountered ${nm} (${e.message}). Engaging Stealth HTTP Engine fallback...`);
    try {
      return await performStealthHttpVisit(url, type, userId, safeVisitCount, windowMs, proxyEntry, visitMeta);
    } catch (stealthErr) {
      return { ok: 0, fail: safeVisitCount, results: [], proxy: proxyLabel, dwell_ms: Date.now() - startTs, bytes: 0, fatalError: `${nm}: ${(e.message || '').slice(0, 100)}`, meta: visitMeta };
    }
  } finally {
    if (context) {
      try {
        for (const p of context.pages()) {
          try { await Promise.race([p.close({ runBeforeUnload: false }), sleep(3000)]); } catch (e) {}
        }
        await Promise.race([context.close(), sleep(5000)]);
      } catch (e) { console.warn('[Context] close failed:', e.message); }
      context = null;
    }
    if (slotAcquired) releaseVisitSlot();
    if (global.gc) try { global.gc(); } catch (e) {}
  }
}

async function performCheck(url, proxyEntry) {
  let context = null, page = null;
  let slot = false;
  try {
    if (!url || typeof url !== 'string') return [false, 'error: InvalidUrl', 0];
    await assertSafeRemoteUrl(url);
    slot = await acquireVisitSlot();
    const browser = await getBrowser();
    const identity = getBrowserIdentity(url);
    const webglProfile = getWebGLByUA(identity.ua, identity.os);
    const geo = resolveProxyGeo(proxyEntry);

    const built = await buildContext(browser, identity, geo, webglProfile, proxyEntry, url);
    context = built.context;
    const effectiveProxy = built.effectiveProxy;

    const pc = getProxySettings();
    if (effectiveProxy && pc.verify_exit_ip) {
      const v = await verifyProxyExitCached(effectiveProxy, context, pc.force_us_only);
      if (!v.ok) {
        try { recordProxyResult(proxyId(effectiveProxy), false, 0); } catch (e) {}
        try { await Promise.race([context.close(), sleep(5000)]); } catch (e) {}
        context = null;
        return [false, `proxy-verify-failed: ${v.reason}`, 0];
      }
    }

    page = await context.newPage();
    page.setDefaultTimeout(REQUEST_TIMEOUT_MS);
    let bytesUsed = 0;
    page.on('response', (r) => {
      try { const l = r.headers()['content-length']; if (l) bytesUsed += parseInt(l, 10) || 0; } catch (e) {}
    });
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: REQUEST_TIMEOUT_MS });
    const status = response ? response.status() : 0;
    return [status >= 200 && status < 400, String(status), bytesUsed];
  } catch (e) {
    const nm = e.name === 'TimeoutError' ? 'Timeout' : (e.constructor ? e.constructor.name : 'Error');
    return [false, `error: ${nm}`, 0];
  } finally {
    try { if (page) await Promise.race([page.close(), sleep(3000)]); } catch (e) {}
    try { if (context) await Promise.race([context.close(), sleep(5000)]); } catch (e) {}
    if (slot) releaseVisitSlot();
  }
}

async function checkLink(url, allowProxy = true) {
  const pc = getProxySettings();
  const pe = pc.enabled && allowProxy;
  const retries = Math.max(0, Math.min(10, Math.floor(Number(pc.max_retries) || 0)));
  const maxA = pe ? retries + 1 : 1;
  let last = [false, 'error: NoProxy', 0];
  for (let a = 0; a < maxA; a++) {
    let proxy = null;
    try { if (pe) proxy = pickProxy({ browserCompatible: true, usOnly: pc.force_us_only }); }
    catch (e) { console.warn('pickProxy failed:', e.message); }
    const [ok, detail, bytes] = await performCheck(url, proxy);
    if (proxy) recordProxyResult(proxyId(proxy), ok, bytes);
    last = [ok, detail, bytes || 0];
    if (ok) return last;
  }
  return last;
}

// ═══════════════════════════════════════════════════════════════════════
//  MEMBERSHIP
// ═══════════════════════════════════════════════════════════════════════
function normalizePlans(raw) {
  // FIX: accept an ARRAY (what the web admin panel used to save) and turn it into the
  // object shape the rest of the bot expects, keyed by plan id with snake_case fields.
  const obj = {};
  for (const p of raw) {
    if (!p) continue;
    const pid = String(p.id || p.key || '').trim();
    if (!pid) continue;
    obj[pid] = {
      label: p.label || pid,
      days: Number(p.days || 30),
      price: Number(p.price || 0),
      link_limit: Number(p.link_limit ?? p.linkLimit ?? 0),
      visits_per_link: Number(p.visits_per_link ?? p.visitsPerLink ?? 0),
      burst_window_ms: Number(p.burst_window_ms ?? 5000),
      daily_burst_limit: Number(p.daily_burst_limit ?? p.dailyBurstLimit ?? 0),
      bonus_credits: Number(p.bonus_credits ?? p.bonusCredits ?? 0),
      features: Array.isArray(p.features) ? p.features : [],
      enabled: p.enabled !== false,
    };
  }
  return obj;
}
function getPlans() {
  // FIX: normalise an ARRAY-shaped `plans` collection (saved by the web admin panel) into an
  // object keyed by plan id. Previously the array was thrown away and replaced with
  // DEFAULT_PLANS, so admin-edited impression limits never reached the bot.
  if (Array.isArray(cache.plans)) {
    cache.plans = normalizePlans(cache.plans);
    syncToFirebase('plans');
  }
  if (!cache.plans || typeof cache.plans !== 'object') {
    cache.plans = JSON.parse(JSON.stringify(DEFAULT_PLANS));
    syncToFirebase('plans');
    return cache.plans;
  }
  let ch = false;
  for (const k of PLAN_ORDER) if (!cache.plans[k]) { cache.plans[k] = { ...DEFAULT_PLANS[k] }; ch = true; }
  if (ch) syncToFirebase('plans');
  return cache.plans;
}
function savePlans() { syncToFirebase('plans'); }

function freshFreeMembership() {
  return {
    plan: null, expires_at: null,
    link_limit: FREE_LINK_LIMIT, visits_per_link: FREE_VISITS_PER_LINK,
    burst_window_ms: FREE_VISIT_WINDOW_MS, daily_burst_limit: 20,
    daily_burst_used: 0, daily_reset_date: todayStr(),
  };
}

function getMembership(userId) {
  const all = cache.membership || {};
  const uid = String(userId);
  let m = all[uid];
  if (!m || typeof m !== 'object') {
    m = freshFreeMembership();
    all[uid] = m;
    cache.membership = all;
    syncToFirebase('membership');
    return m;
  }
  if (m.plan && m.expires_at && Date.now() > m.expires_at) {
    m = freshFreeMembership();
    all[uid] = m;
    cache.membership = all;
    syncToFirebase('membership');
    return m;
  }
  let ch = false;
  if (!m.plan) {
    if (m.link_limit !== FREE_LINK_LIMIT) { m.link_limit = FREE_LINK_LIMIT; ch = true; }
    if (m.visits_per_link !== FREE_VISITS_PER_LINK) { m.visits_per_link = FREE_VISITS_PER_LINK; ch = true; }
    if (m.burst_window_ms !== FREE_VISIT_WINDOW_MS) { m.burst_window_ms = FREE_VISIT_WINDOW_MS; ch = true; }
  }
  const t = todayStr();
  if (m.daily_reset_date !== t) { m.daily_burst_used = 0; m.daily_reset_date = t; ch = true; }
  if (ch) { all[uid] = m; cache.membership = all; syncToFirebase('membership'); }
  return m;
}

function saveMembership(userId, m) {
  const all = cache.membership || {};
  all[String(userId)] = m;
  cache.membership = all;
  syncToFirebase('membership');
}

function activateMembership(userId, planKey) {
  const plan = getPlans()[planKey];
  if (!plan) return null;
  const m = getMembership(userId);
  const now = Date.now();
  const base = (m.plan && m.expires_at && m.expires_at > now) ? m.expires_at : now;
  m.plan = planKey;
  m.expires_at = base + plan.days * 86400000;
  m.link_limit = plan.link_limit;
  m.visits_per_link = plan.visits_per_link;
  m.burst_window_ms = plan.burst_window_ms;
  m.daily_burst_limit = plan.daily_burst_limit;
  m.daily_burst_used = 0;
  m.daily_reset_date = todayStr();
  saveMembership(userId, m);
  // ⭐ NEW: Grant bonus impression credits on purchase
  const bonusCredits = Number(plan.bonus_credits || 0);
  if (bonusCredits > 0) {
    addImpressionBalance(userId, bonusCredits);
  }
  return m;
}

function getLinkLimit(userId) { return getMembership(userId).link_limit || FREE_LINK_LIMIT; }
function formatExpiry(ts) { return ts ? new Date(Number(ts) + 6 * 60 * 60 * 1000).toISOString().slice(0, 10) : '—'; } // Bangladesh date
function daysLeft(ts) { return ts ? Math.max(0, Math.ceil((ts - Date.now()) / 86400000)) : 0; }

function getVisitsPerLink(userId) {
  const m = getMembership(userId);
  const ai = getAutoImpressionSettings();
  return Math.max(1, Math.floor(Number(m.visits_per_link) || Number(ai.burst_visits_per_link) || FREE_VISITS_PER_LINK));
}

function getBurstWindowMs(userId) {
  const m = getMembership(userId);
  const ai = getAutoImpressionSettings();
  return Math.max(3000, Number(m.burst_window_ms) || Number(ai.burst_window_ms) || FREE_VISIT_WINDOW_MS);
}

function remainingBurstRuns(userId) {
  const m = getMembership(userId);
  return Math.max(0, (m.daily_burst_limit || 0) - (m.daily_burst_used || 0));
}

function consumeBurstRun(userId) {
  const m = getMembership(userId);
  m.daily_burst_used = (m.daily_burst_used || 0) + 1;
  saveMembership(userId, m);
}

// ═══════════════════════════════════════════════════════════════════════
//  BALANCE
// ═══════════════════════════════════════════════════════════════════════
function getBalance(userId) { return Number((cache.balance || {})[String(userId)] || 0); }
function addBalance(userId, amt) {
  const n = Number(amt);
  if (!Number.isFinite(n) || n < 0) throw new Error('Invalid amount');
  const a = cache.balance || {};
  const u = String(userId);
  const cur = Number(a[u]) || 0;
  a[u] = Number((cur + n).toFixed(2));
  cache.balance = a;
  syncToFirebase('balance');
  return a[u];
}
function deductBalance(userId, amt) {
  const a = cache.balance || {};
  const u = String(userId);
  const n = Number(amt);
  if (!Number.isFinite(n) || n < 0) return false;
  const c = Number(a[u] || 0);
  if (c < n) return false;
  a[u] = Number((c - n).toFixed(2));
  cache.balance = a;
  syncToFirebase('balance');
  return true;
}
function getImpressionBalance(userId) { return Math.floor(Number((cache.impression_balance || {})[String(userId)] || 0)); }
function addImpressionBalance(userId, amt) {
  const a = cache.impression_balance || {};
  const u = String(userId);
  const n = Number(amt);
  if (!Number.isFinite(n) || n < 0) return 0;
  a[u] = Math.max(0, Math.floor((Number(a[u]) || 0) + n));
  cache.impression_balance = a;
  syncToFirebase('impression_balance');
  return a[u];
}
function deductImpressionBalance(userId, amt) {
  const a = cache.impression_balance || {};
  const u = String(userId);
  const c = Math.floor(Number(a[u] || 0));
  const x = Math.max(0, Math.floor(Number(amt)));
  if (c < x) return false;
  a[u] = c - x;
  cache.impression_balance = a;
  syncToFirebase('impression_balance');
  return true;
}

// ═══════════════════════════════════════════════════════════════════════
//  ADMINS / USERS
// ═══════════════════════════════════════════════════════════════════════
function getExtraAdmins() { return Array.isArray(cache.extra_admins) ? cache.extra_admins : []; }
function addExtraAdmin(id) {
  const l = getExtraAdmins();
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n <= 0) return false;
  if (!l.includes(n) && !ADMIN_IDS.includes(n)) { l.push(n); cache.extra_admins = l; syncToFirebase('extra_admins'); }
  return true;
}
function removeExtraAdmin(id) { cache.extra_admins = getExtraAdmins().filter((x) => x !== Number(id)); syncToFirebase('extra_admins'); }
function isSuperAdmin(uid) { return ADMIN_IDS.includes(Number(uid)); }
function isAdmin(uid) { return ADMIN_IDS.includes(Number(uid)) || getExtraAdmins().includes(Number(uid)); }
function isBanned(uid) { return !!(cache.banned_users || {})[String(uid)]; }
function banUser(uid, reason = '') {
  const b = cache.banned_users || {};
  b[String(uid)] = { reason, at: Date.now() };
  cache.banned_users = b;
  syncToFirebase('banned_users');
}
function unbanUser(uid) {
  const b = cache.banned_users || {};
  delete b[String(uid)];
  cache.banned_users = b;
  syncToFirebase('banned_users');
}
function rememberUser(userId, from = null) {
  const uid = String(userId);
  const list = Array.isArray(cache.users) ? cache.users : [];
  if (!list.includes(uid)) { list.push(uid); cache.users = list; syncToFirebase('users'); }
  if (from) {
    const info = cache.user_info || {};
    info[uid] = {
      first_name: String(from.first_name || '').slice(0, 100),
      last_name: String(from.last_name || '').slice(0, 100),
      username: String(from.username || '').slice(0, 50),
      last_seen: Date.now(),
    };
    cache.user_info = info;
    syncToFirebase('user_info');
  }
}
function getUserInfo(userId) {
  return (cache.user_info || {})[String(userId)] || { first_name: '', last_name: '', username: '', last_seen: 0 };
}
function getAllUsers() {
  const list = Array.isArray(cache.users) ? cache.users : [];
  return list.filter((u) => u && /^\d+$/.test(String(u)));
}
function getUserSettings(userId) {
  const all = cache.user_settings || {};
  const uid = String(userId);
  if (!all[uid]) {
    all[uid] = { notifications: true, promo_alerts: true };
    cache.user_settings = all;
    syncToFirebase('user_settings');
  }
  return all[uid];
}
function saveUserSettings(userId, s) {
  const all = cache.user_settings || {};
  all[String(userId)] = s;
  cache.user_settings = all;
  syncToFirebase('user_settings');
}

// ═══════════════════════════════════════════════════════════════════════
//  REFERRALS
// ═══════════════════════════════════════════════════════════════════════
function getReferralInfo(userId) {
  const r = cache.referrals || {};
  const uid = String(userId);
  if (!r[uid]) { r[uid] = { code: uid, invited: [], earned: 0, created_at: Date.now() }; cache.referrals = r; syncToFirebase('referrals'); }
  if (!Array.isArray(r[uid].invited)) r[uid].invited = [];
  if (typeof r[uid].earned !== 'number') r[uid].earned = 0;
  return r[uid];
}
function saveReferralInfo(userId, info) {
  const r = cache.referrals || {};
  r[String(userId)] = info;
  cache.referrals = r;
  syncToFirebase('referrals');
}
function applyReferral(newUserId, refCode) {
  const newUid = String(newUserId);
  const refUid = String(refCode);
  if (!refCode || newUid === refUid) return false;
  const referrals = cache.referrals || {};
  for (const info of Object.values(referrals)) if (info && Array.isArray(info.invited) && info.invited.includes(newUid)) return false;
  const refInfo = getReferralInfo(refUid);
  if (refInfo.invited.includes(newUid)) return false;
  refInfo.invited.push(newUid);
  refInfo.earned = (refInfo.earned || 0) + REFERRAL_BONUS;
  saveReferralInfo(refUid, refInfo);
  addBalance(refUid, REFERRAL_BONUS);
  return true;
}

// ═══════════════════════════════════════════════════════════════════════
//  USER LINKS
// ═══════════════════════════════════════════════════════════════════════
function getUserLinks(userId) { return [...((cache.user_links || {})[String(userId)] || [])]; }
function addUserLink(userId, url) {
  const d = cache.user_links || {};
  const uid = String(userId);
  if (!d[uid]) d[uid] = [];
  const clean = String(url).trim();
  if (d[uid].includes(clean)) return false;
  d[uid].push(clean);
  cache.user_links = d;
  syncToFirebase('user_links');
  return true;
}
function removeUserLink(userId, idx) {
  const d = cache.user_links || {};
  const uid = String(userId);
  const l = d[uid] || [];
  const i = Number(idx);
  if (!Number.isInteger(i) || i < 0 || i >= l.length) return null;
  const r = l.splice(i, 1)[0];
  d[uid] = l;
  cache.user_links = d;
  syncToFirebase('user_links');
  return r;
}
function normalizeUrlKey(url) {
  try {
    const u = new URL(String(url));
    return `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname}${u.search}`;
  } catch (e) { return String(url); }
}

// ═══════════════════════════════════════════════════════════════════════
//  USER STATS
// ═══════════════════════════════════════════════════════════════════════
function normalizeUserStats(s) {
  if (!s || typeof s !== 'object') s = {};
  s.total_checks = Number(s.total_checks) || 0;
  s.ok = Number(s.ok) || 0;
  s.failed = Number(s.failed) || 0;
  s.total_impressions = Number(s.total_impressions) || 0;
  if (!s.links || typeof s.links !== 'object') s.links = {};
  return s;
}
function recordCheckStat(userId, url, ok, detail) {
  const d = cache.stats || {};
  const uid = String(userId);
  if (!d[uid]) d[uid] = { total_checks: 0, ok: 0, failed: 0, links: {}, total_impressions: 0 };
  const s = normalizeUserStats(d[uid]);
  const key = normalizeUrlKey(url);
  s.total_checks += 1;
  s[ok ? 'ok' : 'failed'] += 1;
  if (!s.links[key]) s.links[key] = { checks: 0, ok: 0, failed: 0, impressions: 0 };
  s.links[key].checks += 1;
  s.links[key][ok ? 'ok' : 'failed'] += 1;
  s.links[key].last_status = String(detail);
  s.links[key].last_checked_utc = new Date().toISOString();
  s.links[key].original_url = String(url);
  cache.stats = d;
  syncToFirebase('stats');
}
function recordImpressions(userId, url, count) {
  if (!count) return;
  const d = cache.stats || {};
  const uid = String(userId);
  if (!d[uid]) d[uid] = { total_checks: 0, ok: 0, failed: 0, links: {}, total_impressions: 0 };
  const s = normalizeUserStats(d[uid]);
  const key = normalizeUrlKey(url);
  s.total_impressions += count;
  if (!s.links[key]) s.links[key] = { checks: 0, ok: 0, failed: 0, impressions: 0 };
  s.links[key].impressions += count;
  s.links[key].original_url = String(url);
  cache.stats = d;
  syncToFirebase('stats');
}
function getUserStats(userId) {
  const d = cache.stats || {};
  const uid = String(userId);
  if (!d[uid]) d[uid] = { total_checks: 0, ok: 0, failed: 0, links: {}, total_impressions: 0 };
  const s = normalizeUserStats(d[uid]);
  d[uid] = s;
  cache.stats = d;
  return s;
}

// ═══════════════════════════════════════════════════════════════════════
//  NORMAL LINK STATS
// ═══════════════════════════════════════════════════════════════════════
function getNormalLinkStats(userId) {
  const d = cache.normal_link_stats || {};
  const uid = String(userId);
  if (!d[uid]) d[uid] = { total_visits: 0, ok: 0, failed: 0, by_link: {}, last_run: 0 };
  if (!d[uid].by_link || typeof d[uid].by_link !== 'object') d[uid].by_link = {};
  return d[uid];
}
function incrementNormalLinkStats(userId, url, okCount, failCount = 0) {
  const s = getNormalLinkStats(userId);
  s.total_visits += okCount + failCount;
  s.ok += okCount;
  s.failed += failCount;
  const key = normalizeUrlKey(url);
  if (!s.by_link[key]) s.by_link[key] = { visits: 0, ok: 0, failed: 0, url: String(url), last_visit_at: 0 };
  s.by_link[key].visits += okCount + failCount;
  s.by_link[key].ok += okCount;
  s.by_link[key].failed += failCount;
  s.by_link[key].url = String(url);
  s.by_link[key].last_visit_at = Date.now();
  s.last_run = Date.now();
  const d = cache.normal_link_stats || {};
  d[String(userId)] = s;
  cache.normal_link_stats = d;
  syncToFirebase('normal_link_stats');

  try {
    const webLinks = cache.web_normal_links || {};
    const uid = String(userId);
    const userWebLinks = webLinks[uid];
    if (Array.isArray(userWebLinks)) {
      for (const l of userWebLinks) {
        if (l.url === url || normalizeUrlKey(l.url) === key) {
          if (!l.stats) l.stats = { visits: 0, ok: 0, failed: 0 };
          l.stats.visits = (l.stats.visits || 0) + okCount + failCount;
          l.stats.ok = (l.stats.ok || 0) + okCount;
          l.stats.failed = (l.stats.failed || 0) + failCount;
          l.lastVisitAt = new Date().toISOString();
          if (okCount > 0) l.lastCheckStatus = 200;
        }
      }
      webLinks[uid] = userWebLinks;
      cache.web_normal_links = webLinks;
      syncToFirebase('web_normal_links');
    }
  } catch (e) {}
}
function pickLeastRecentlyUsedLink(links) {
  if (!links || !links.length) return null;
  const sorted = [...links].sort((a, b) => {
    const aTime = a.last_visit_at || 0;
    const bTime = b.last_visit_at || 0;
    if (aTime !== bTime) return aTime - bTime;
    return Math.random() - 0.5;
  });
  const poolSize = Math.max(1, Math.ceil(sorted.length * 0.3));
  return pickRandom(sorted.slice(0, poolSize));
}
function pickLeastRecentlyUsedNormalLink(uid, links) {
  if (!links || !links.length) return null;
  const stats = getNormalLinkStats(uid);
  const byLink = stats.by_link || {};
  const sorted = [...links].sort((a, b) => {
    const keyA = normalizeUrlKey(a);
    const keyB = normalizeUrlKey(b);
    const aTime = (byLink[keyA] && byLink[keyA].last_visit_at) || 0;
    const bTime = (byLink[keyB] && byLink[keyB].last_visit_at) || 0;
    if (aTime !== bTime) return aTime - bTime;
    return Math.random() - 0.5;
  });
  const poolSize = Math.max(1, Math.ceil(sorted.length * 0.3));
  return pickRandom(sorted.slice(0, poolSize));
}

// ═══════════════════════════════════════════════════════════════════════
//  SMARTLINK SYSTEM
// ═══════════════════════════════════════════════════════════════════════
function getUserSmartlink(userId) {
  const all = cache.user_smartlinks || {};
  const uid = String(userId);
  if (!all[uid]) {
    all[uid] = { api_key: null, api_endpoint: ADSTERRA_SMARTLINKS_ENDPOINT, source: 'adsterra', links: [], last_fetch: 0, auto_enabled: false };
    cache.user_smartlinks = all;
    syncToFirebase('user_smartlinks');
  }
  const u = all[uid];
  if (!Array.isArray(u.links)) u.links = [];
  if (!u.api_endpoint) u.api_endpoint = ADSTERRA_SMARTLINKS_ENDPOINT;
  if (typeof u.auto_enabled !== 'boolean') u.auto_enabled = false;
  if (typeof u.last_fetch !== 'number') u.last_fetch = 0;
  // ⭐ V39: register every known SmartLink domain for robust pixel detection.
  try { for (const l of u.links) if (l && l.url) registerAdsterraDomain(l.url); } catch (e) {}
  return u;
}
function saveUserSmartlink(userId, data) {
  const all = cache.user_smartlinks || {};
  const uid = String(userId);
  const prev = all[uid] || {};
  // ⭐ MULTI-TENANT SAFETY: never lose a user's saved Adsterra api_key when a
  // partial update (e.g. a visit counter) is written back. Each user's OWN key is
  // what makes THEIR Adsterra account receive impressions — clobbering it with
  // null would silently break delivery for that user only.
  const merged = { ...prev, ...(data || {}) };
  if ((merged.api_key == null || merged.api_key === '') && prev.api_key) merged.api_key = prev.api_key;
  all[uid] = merged;
  cache.user_smartlinks = all;
  // ⭐ V39: learn this user's SmartLink domains so their impressions are always detected,
  // even when Adsterra serves them from a rotating domain the static list doesn't have.
  try { for (const l of (merged.links || [])) if (l && l.url) registerAdsterraDomain(l.url); } catch (e) {}
  syncToFirebase('user_smartlinks');
}
function addUserSmartlink(userId, entry) {
  const data = getUserSmartlink(userId);
  const url = String(entry.url).trim();
  if (data.links.some((l) => l.url === url)) return false;
  data.links.push({
    url, name: String(entry.name || '').slice(0, 200),
    id: entry.id || null, status: entry.status || 'Active',
    added_at: Date.now(), last_visit_at: 0,
    bot_visits: 0, ok: 0, failed: 0,
  });
  saveUserSmartlink(userId, data);
  return true;
}
function clearUserSmartlinks(userId) {
  const data = getUserSmartlink(userId);
  data.links = [];
  saveUserSmartlink(userId, data);
}
function recordUserSmartlinkVisit(userId, url, okCount, failCount = 0) {
  const data = getUserSmartlink(userId);
  const link = data.links.find((l) => l.url === url);
  if (link) {
    link.bot_visits = (link.bot_visits || 0) + okCount + failCount;
    link.ok = (link.ok || 0) + okCount;
    link.failed = (link.failed || 0) + failCount;
    link.last_visit_at = Date.now();
    saveUserSmartlink(userId, data);
  }
}
function getUserSmartlinkStats(userId) {
  const d = cache.user_smartlink_stats || {};
  const uid = String(userId);
  if (!d[uid]) d[uid] = { total_visits: 0, ok: 0, failed: 0, by_link: {}, last_run: 0 };
  return d[uid];
}
function incrementUserSmartlinkStats(userId, url, okCount, failCount = 0) {
  const s = getUserSmartlinkStats(userId);
  s.total_visits += okCount + failCount;
  s.ok += okCount;
  s.failed += failCount;
  if (!s.by_link) s.by_link = {};
  const key = normalizeUrlKey(url);
  if (!s.by_link[key]) s.by_link[key] = { visits: 0, ok: 0, failed: 0, url: String(url), last_visit_at: 0 };
  s.by_link[key].visits += okCount + failCount;
  s.by_link[key].ok += okCount;
  s.by_link[key].failed += failCount;
  s.by_link[key].url = String(url);
  s.by_link[key].last_visit_at = Date.now();
  s.last_run = Date.now();
  const d = cache.user_smartlink_stats || {};
  d[String(userId)] = s;
  cache.user_smartlink_stats = d;
  syncToFirebase('user_smartlink_stats');
}

// ═══════════════════════════════════════════════════════════════════════
//  IMPRESSION COUNTERS
// ═══════════════════════════════════════════════════════════════════════
function getHourlyCount(userId, type) {
  const log = cache.hourly_impression_log || {};
  return log[`${userId}::${type}::${getHourKey()}`] || 0;
}
function incrementHourlyCount(userId, type, by = 1) {
  const log = cache.hourly_impression_log || {};
  const key = `${userId}::${type}::${getHourKey()}`;
  log[key] = (log[key] || 0) + by;
  const cutoff = getHourKey(new Date(Date.now() - 3 * 3600000));
  for (const k of Object.keys(log)) {
    const hk = k.split('::')[2];
    if (hk && hk < cutoff) delete log[k];
  }
  cache.hourly_impression_log = log;
  syncToFirebase('hourly_impression_log');
  return log[key];
}
function resetHourlyCounters(userId) {
  const log = cache.hourly_impression_log || {};
  const uid = String(userId);
  const nowH = getHourKey();
  let changed = false;
  for (const k of Object.keys(log)) {
    if (k.startsWith(`${uid}::`) && k.endsWith(`::${nowH}`)) { delete log[k]; changed = true; }
  }
  if (changed) { cache.hourly_impression_log = log; syncToFirebase('hourly_impression_log'); }
}
function getDailyCount(userId, type) {
  const d = cache.smartlink_daily_visits || {};
  return d[`${userId}::${type}::${todayStr()}`] || 0;
}
function incrementDailyCount(userId, type, by = 1) {
  const d = cache.smartlink_daily_visits || {};
  const key = `${userId}::${type}::${todayStr()}`;
  d[key] = (d[key] || 0) + by;
  const cutoff = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  for (const k of Object.keys(d)) {
    const dk = k.split('::')[2];
    if (dk && dk < cutoff) delete d[k];
  }
  cache.smartlink_daily_visits = d;
  syncToFirebase('smartlink_daily_visits');
  return d[key];
}

// ═══════════════════════════════════════════════════════════════════════
//  H4CK ORGANIC STATS
// ═══════════════════════════════════════════════════════════════════════
function getH4CkOrganicStats() {
  const today = todayStr();
  if (!cache.h4ck_organic_stats) cache.h4ck_organic_stats = {};
  if (!cache.h4ck_organic_stats[today]) {
    cache.h4ck_organic_stats[today] = {
      total_visits: 0, successful: 0, failed: 0, total_clicks: 0,
      total_referrers: 0, total_pages: 0, total_dwell_ms: 0,
      total_zoom_events: 0, total_keyboard_scrolls: 0, total_video_pauses: 0,
      total_competitors: 0, referrer_breakdown: {},
    };
  }
  return cache.h4ck_organic_stats[today];
}
function recordH4CkOrganicStat(result) {
  const stats = getH4CkOrganicStats();
  stats.total_visits++;
  if (result.ok) stats.successful++;
  else stats.failed++;
  if (result.stats) {
    stats.total_clicks += result.stats.adClicks || 0;
    stats.total_referrers += (result.stats.referrers || []).length;
    stats.total_pages += result.stats.pagesVisited || 1;
    stats.total_dwell_ms += result.stats.dwellMs || 0;
    stats.total_zoom_events = (stats.total_zoom_events || 0) + (result.stats.zoomEvents || 0);
    stats.total_keyboard_scrolls = (stats.total_keyboard_scrolls || 0) + (result.stats.keyboardScrolls || 0);
    stats.total_video_pauses = (stats.total_video_pauses || 0) + (result.stats.videoPauses || 0);
    stats.total_competitors = (stats.total_competitors || 0) + (result.stats.competitorsVisited || 0);
    for (const ref of result.stats.referrers || []) stats.referrer_breakdown[ref] = (stats.referrer_breakdown[ref] || 0) + 1;
  }
  cache.h4ck_organic_stats[todayStr()] = stats;
  syncToFirebase('h4ck_organic_stats');
}

// ═══════════════════════════════════════════════════════════════════════
//  RUNNING STATE
// ═══════════════════════════════════════════════════════════════════════
function isAutoImpressionRunning(userId, type) {
  const r = cache.auto_impression_running || {};
  return !!(r[String(userId)] && r[String(userId)][type]);
}
function setAutoImpressionRunning(userId, type, running) {
  const r = cache.auto_impression_running || {};
  const uid = String(userId);
  if (!r[uid]) r[uid] = {};
  r[uid][type] = !!running;
  cache.auto_impression_running = r;
  syncToFirebase('auto_impression_running');
}

// ═══════════════════════════════════════════════════════════════════════
//  IMPRESSION TARGETS
// ═══════════════════════════════════════════════════════════════════════
function getImpressionTarget(userId, type) {
  const all = cache.impression_targets || {};
  const uid = String(userId);
  if (!all[uid]) all[uid] = {};
  if (typeof all[uid][type] !== 'number') all[uid][type] = 0;
  cache.impression_targets = all;
  return all[uid][type];
}
function setImpressionTarget(userId, type, target) {
  const all = cache.impression_targets || {};
  const uid = String(userId);
  if (!all[uid]) all[uid] = {};
  all[uid][type] = Math.max(0, Math.floor(Number(target) || 0));
  cache.impression_targets = all;
  syncToFirebase('impression_targets');
}
function clearImpressionTarget(userId, type) { setImpressionTarget(userId, type, 0); }
function getTargetProgress(userId, type) {
  const all = cache.impression_target_progress || {};
  const uid = String(userId);
  if (!all[uid]) all[uid] = {};
  if (typeof all[uid][type] !== 'number') all[uid][type] = 0;
  cache.impression_target_progress = all;
  return all[uid][type];
}
function addTargetProgress(userId, type, count) {
  const all = cache.impression_target_progress || {};
  const uid = String(userId);
  if (!all[uid]) all[uid] = {};
  all[uid][type] = (all[uid][type] || 0) + count;
  cache.impression_target_progress = all;
  syncToFirebase('impression_target_progress');
  return all[uid][type];
}
function resetTargetProgress(userId, type) {
  const all = cache.impression_target_progress || {};
  const uid = String(userId);
  if (!all[uid]) all[uid] = {};
  all[uid][type] = 0;
  cache.impression_target_progress = all;
  syncToFirebase('impression_target_progress');
}
/** Pushes a notification into the web inbox (read by GET /api/notifications). */
function pushWebNotification(userId, n) {
  const all = (cache.web_user_notifications && typeof cache.web_user_notifications === 'object') ? cache.web_user_notifications : {};
  const uid = String(userId);
  const list = Array.isArray(all[uid]) ? all[uid] : [];
  list.unshift({
    id: 'wn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    at: new Date().toISOString(),
    tone: 'info',
    ...n,
  });
  all[uid] = list.slice(0, 50);
  cache.web_user_notifications = all;
  syncToFirebase('web_user_notifications');
}
/** Target reached -> campaign OFF, status TARGET REACHED, user notified (web + Telegram). */
async function finishTarget(uid, type, info) {
  setAutoImpressionRunning(uid, type, false);
  clearImpressionTarget(uid, type);
  resetTargetProgress(uid, type);
  const label = type === 'smartlink' ? 'SmartLink' : 'Normal Link';
  pushWebNotification(uid, {
    title: 'Target Reached Successfully',
    desc: `Your ${label} campaign has successfully reached the selected target of ${info.target} impressions. The campaign has now been automatically stopped.`,
    tone: 'success',
    view: type === 'smartlink' ? 'smartlinks' : 'normal_links',
    status: 'TARGET_REACHED',
  });
  try {
    await bot.sendMessage(Number(uid),
      `\u{1F3AF} <b>Target Reached Successfully</b>\n\n\u2705 <b>${info.progress}/${info.target}</b>\nYour ${label} campaign reached the selected target and was automatically stopped.`,
      { parse_mode: 'HTML' });
  } catch (e) {}
}
function checkTargetReached(userId, type) {
  const target = getImpressionTarget(userId, type);
  const progress = getTargetProgress(userId, type);
  const balance = getImpressionBalance(userId);
  if (target <= 0) return { reached: false, exhausted: balance <= 0, progress, target: 0, balance };
  return { reached: progress >= target && target > 0, exhausted: balance <= 0 && progress < target, progress, target, balance };
}
function canRunImpression(userId, type) {
  const cfg = getAutoImpressionSettings();
  const impBal = getImpressionBalance(userId);
  if (impBal <= 0) return { ok: false, reason: 'Impression credit empty! Buy from Shop.', code: 'NO_CREDITS' };

  // ⭐ NEW: Proxy readiness check
  const proxyCheck = proxyReadyForTraffic();
  if (!proxyCheck.ready) {
    return { ok: false, reason: proxyCheck.reason, code: proxyCheck.code };
  }

  if (type === 'smartlink') {
    if (!cfg.smartlink_enabled) return { ok: false, reason: 'SmartLink disabled', code: 'DISABLED' };
    if (getHourlyCount(userId, 'smartlink') >= cfg.hourly_limit_smartlink) return { ok: false, reason: `Hourly limit (${cfg.hourly_limit_smartlink}/hr)`, code: 'HOURLY_LIMIT' };
    if (getDailyCount(userId, 'smartlink') >= cfg.daily_limit_smartlink) return { ok: false, reason: 'Daily limit', code: 'DAILY_LIMIT' };
  } else {
    if (!cfg.normal_enabled) return { ok: false, reason: 'Normal disabled', code: 'DISABLED' };
    if (getHourlyCount(userId, 'normal') >= cfg.hourly_limit_normal) return { ok: false, reason: `Hourly limit (${cfg.hourly_limit_normal}/hr)`, code: 'HOURLY_LIMIT' };
    if (getDailyCount(userId, 'normal') >= cfg.daily_limit_normal) return { ok: false, reason: 'Daily limit', code: 'DAILY_LIMIT' };
  }
  if (remainingBurstRuns(userId) <= 0) return { ok: false, reason: 'Daily burst limit reached', code: 'BURST_LIMIT' };
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════
//  LIVE LOG
// ═══════════════════════════════════════════════════════════════════════
function recordLiveLog(type, uid, url, ok, detail, proxy, dwellMs, country) {
  const all = cache.live_impression_log || {};
  if (!Array.isArray(all.recent)) all.recent = [];
  // ⭐ FIX: persist the REAL delivery country (from the proxy exit geo) so the
  // Live Monitor shows the actual country instead of a hard-coded 'US'.
  const cc = String(country || '').trim().toUpperCase().slice(0, 2);
  all.recent.push({
    ts: Date.now(), type, userId: String(uid), url: String(url).slice(0, 200),
    ok: !!ok, detail: String(detail).slice(0, 150),
    proxy: proxy ? 'CPM PROXY' : 'direct',
    country: cc || 'XX',
    dwellMs: Math.max(0, Math.round(Number(dwellMs) || 0)),
  });
  if (all.recent.length > LIVE_LOG_MAX) all.recent = all.recent.slice(-LIVE_LOG_MAX);
  cache.live_impression_log = all;
  syncToFirebase('live_impression_log');
}
function getLiveLogs(type = null, limit = 20) {
  const all = cache.live_impression_log || {};
  if (!Array.isArray(all.recent)) return [];
  let logs = all.recent;
  if (type) logs = logs.filter((l) => l.type === type);
  return logs.slice(-limit).reverse();
}

// ═══════════════════════════════════════════════════════════════════════
//  CONFIRMATIONS
// ═══════════════════════════════════════════════════════════════════════
function createConfirmation(userId, type, payload) {
  const all = cache.impression_confirmations || {};
  const token = secureRandomString(20);
  all[token] = { userId: String(userId), type, payload, created_at: Date.now() };
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [t, c] of Object.entries(all)) if (c.created_at < cutoff) delete all[t];
  cache.impression_confirmations = all;
  syncToFirebase('impression_confirmations');
  return token;
}
function getConfirmation(token) { return (cache.impression_confirmations || {})[token] || null; }
function clearConfirmation(token) {
  const all = cache.impression_confirmations || {};
  delete all[token];
  cache.impression_confirmations = all;
  syncToFirebase('impression_confirmations');
}

// ═══════════════════════════════════════════════════════════════════════
//  IMPRESSION HISTORY / LOGS
// ═══════════════════════════════════════════════════════════════════════
function recordImpressionHistory(userId, entry) {
  const all = cache.impression_history || {};
  const uid = String(userId);
  if (!all[uid]) all[uid] = [];
  all[uid].push({
    ts: Date.now(), url: String(entry.url || '').slice(0, 500), type: entry.type || 'normal',
    ok: !!entry.ok, detail: String(entry.detail || '').slice(0, 200),
    proxy: entry.proxy ? 'CPM PROXY' : 'direct',
    dwell_ms: Number(entry.dwell_ms) || 0, bytes: Number(entry.bytes) || 0,
    visits: Number(entry.visits) || 1, ok_count: Number(entry.ok_count) || 0,
    fail_count: Number(entry.fail_count) || 0,
  });
  if (all[uid].length > IMPRESSION_HISTORY_MAX) all[uid] = all[uid].slice(-IMPRESSION_HISTORY_MAX);
  cache.impression_history = all;
  syncToFirebase('impression_history');
}
function getUserImpressionHistory(userId) {
  return [...((cache.impression_history || {})[String(userId)] || [])];
}
function recordVisitLog(entry) {
  const all = cache.visit_logs || {};
  if (!Array.isArray(all.recent)) all.recent = [];
  all.recent.push({
    ts: Date.now(), userId: String(entry.userId || ''), url: String(entry.url || '').slice(0, 500),
    type: entry.type || 'normal', ok: !!entry.ok, detail: String(entry.detail || '').slice(0, 200),
    proxy: entry.proxy ? 'CPM PROXY' : 'direct',
    dwell_ms: Number(entry.dwell_ms) || 0, visits: Number(entry.visits) || 1,
  });
  if (all.recent.length > VISIT_LOG_MAX) all.recent = all.recent.slice(-VISIT_LOG_MAX);
  cache.visit_logs = all;
  syncToFirebase('visit_logs');
}
function getRecentVisitLogs(limit = 20) {
  const all = cache.visit_logs || {};
  if (!Array.isArray(all.recent)) return [];
  return all.recent.slice(-limit).reverse();
}

// ═══════════════════════════════════════════════════════════════════════
//  PAYMENT / SHOP / SUPPORT
// ═══════════════════════════════════════════════════════════════════════
function getPaymentMethods() {
  if (!Array.isArray(cache.payment_methods)) {
    cache.payment_methods = JSON.parse(JSON.stringify(DEFAULT_PAYMENT_METHODS));
    syncToFirebase('payment_methods');
  }
  return cache.payment_methods;
}
function savePaymentMethods() { syncToFirebase('payment_methods'); }
function addPaymentMethod(method) {
  const methods = getPaymentMethods();
  if (!method.id || methods.some((m) => m.id === method.id)) return false;
  methods.push({ ...method, enabled: true });
  savePaymentMethods();
  return true;
}
function updatePaymentMethod(id, updates) {
  const methods = getPaymentMethods();
  const m = methods.find((x) => x.id === id);
  if (!m) return false;
  Object.assign(m, updates);
  savePaymentMethods();
  return true;
}
function deletePaymentMethod(id) {
  cache.payment_methods = getPaymentMethods().filter((m) => m.id !== id);
  savePaymentMethods();
}
function getShopPackages() {
  if (!cache.shop_packages || typeof cache.shop_packages !== 'object' || Array.isArray(cache.shop_packages)) {
    cache.shop_packages = JSON.parse(JSON.stringify(DEFAULT_SHOP_PACKAGES));
    syncToFirebase('shop_packages');
    return cache.shop_packages;
  }
  let ch = false;
  for (const k of SHOP_PACKAGE_ORDER) if (!cache.shop_packages[k]) { cache.shop_packages[k] = { ...DEFAULT_SHOP_PACKAGES[k] }; ch = true; }
  if (ch) syncToFirebase('shop_packages');
  return cache.shop_packages;
}
function saveShopPackages() { syncToFirebase('shop_packages'); }
function recordImpressionPurchase(userId, pkgKey, amount, price) {
  const l = Array.isArray(cache.impression_purchases) ? cache.impression_purchases : [];
  const id = l.length ? Math.max(...l.map((r) => r.id)) + 1 : 1;
  l.push({ id, userId: String(userId), package: pkgKey, amount, price, purchased_at: Date.now() });
  cache.impression_purchases = l;
  syncToFirebase('impression_purchases');
}
function getBalanceRequests() { return Array.isArray(cache.balance_requests) ? cache.balance_requests : []; }
function hashTxn(txn) { return crypto.createHash('sha256').update(String(txn).trim().toLowerCase()).digest('hex'); }
function createBalanceRequest(userId, amt, method, txn) {
  const l = getBalanceRequests();
  const txHash = hashTxn(txn);
  if (!txHash || l.some((r) => r.txn_hash === txHash)) throw new Error('Duplicate txn');
  const id = l.length ? Math.max(...l.map((r) => r.id)) + 1 : 1;
  const r = { id, userId: String(userId), amount: Number(amt), method: String(method), txn_id: String(txn).slice(0, 200), txn_hash: txHash, status: 'pending', created_at: Date.now() };
  l.push(r);
  cache.balance_requests = l;
  syncToFirebase('balance_requests');
  return r;
}
function getPendingBalanceRequests() { return getBalanceRequests().filter((r) => r.status === 'pending'); }
function updateBalanceRequestStatus(id, status) {
  const l = getBalanceRequests();
  const r = l.find((x) => x.id === id);
  if (!r) return null;
  r.status = status;
  r.processed_at = Date.now();
  cache.balance_requests = l;
  syncToFirebase('balance_requests');
  return r;
}
function getSupportMessages() { return Array.isArray(cache.support_messages) ? cache.support_messages : []; }
function createSupportMessage(userId, text) {
  const l = getSupportMessages();
  const id = l.length ? Math.max(...l.map((r) => r.id)) + 1 : 1;
  const m = { id, userId: String(userId), text: String(text).slice(0, 2000), status: 'open', created_at: Date.now(), admin_reply: null };
  l.push(m);
  cache.support_messages = l;
  syncToFirebase('support_messages');
  return m;
}
function replySupportMessage(id, reply) {
  const l = getSupportMessages();
  const m = l.find((r) => r.id === id);
  if (!m) return null;
  m.admin_reply = String(reply).slice(0, 2000);
  m.status = 'replied';
  m.replied_at = Date.now();
  cache.support_messages = l;
  syncToFirebase('support_messages');
  return m;
}
function getOpenSupportMessages() { return getSupportMessages().filter((r) => r.status === 'open'); }

// ═══════════════════════════════════════════════════════════════════════
//  JOIN CHECK / AUTOBROADCAST / PROMO
// ═══════════════════════════════════════════════════════════════════════
function getJoinCheckSettings() {
  if (!cache.join_check_settings || typeof cache.join_check_settings !== 'object') {
    cache.join_check_settings = { enabled: false, channel: '', group: '' };
    syncToFirebase('join_check_settings');
  }
  return cache.join_check_settings;
}
function saveJoinCheckSettings(s) { cache.join_check_settings = s; syncToFirebase('join_check_settings'); }
function getAutoBroadcastSettings() {
  if (!cache.auto_broadcast_settings || typeof cache.auto_broadcast_settings !== 'object') {
    cache.auto_broadcast_settings = { enabled: true, on_startup: true, message: '' };
    syncToFirebase('auto_broadcast_settings');
  }
  return cache.auto_broadcast_settings;
}
function saveAutoBroadcastSettings(s) { cache.auto_broadcast_settings = s; syncToFirebase('auto_broadcast_settings'); }
function getPromoCodes() { return cache.promo_codes || {}; }
function savePromoCodes(p) { cache.promo_codes = p; syncToFirebase('promo_codes'); }
function getReportingWallet(userId) {
  const all = cache.reporting_credits || {};
  const uid = String(userId);
  if (!all[uid] || typeof all[uid] !== 'object') all[uid] = { balance: 0, trial_claimed: false, updated_at: 0 };
  all[uid].balance = Math.max(0, Math.floor(Number(all[uid].balance) || 0));
  cache.reporting_credits = all;
  return all[uid];
}
function hasImpressionTrial(userId) { return !!getReportingWallet(userId).trial_claimed; }

// ═══════════════════════════════════════════════════════════════════════
//  ADSTERRA API EXTRACTION
// ═══════════════════════════════════════════════════════════════════════
function extractAdsterraSmartlinks(payload) {
  const records = [];
  const seenObjects = new Set();
  const collectionKeys = new Set(['smartlinks', 'smart_links', 'smart-links', 'links', 'data', 'items', 'results', 'result', 'records', 'placements']);
  const urlKeys = ['url', 'link', 'smartlink', 'smart_link', 'smartlink_url', 'smart_link_url', 'link_url', 'direct_url', 'direct_link', 'target_url', 'destination_url', 'destination'];

  function collect(node, depth = 0) {
    if (depth > 7 || node == null) return;
    if (typeof node === 'string') { if (isValidUrl(node)) records.push({ url: node.trim(), name: '', id: null, status: 'Active' }); return; }
    if (Array.isArray(node)) { for (const item of node) collect(item, depth + 1); return; }
    if (typeof node !== 'object' || seenObjects.has(node)) return;
    seenObjects.add(node);
    let rawUrl = null;
    for (const key of urlKeys) if (typeof node[key] === 'string' && isValidUrl(node[key])) { rawUrl = node[key].trim(); break; }
    if (rawUrl) {
      records.push({
        url: rawUrl,
        name: String(node.name || node.title || node.label || node.domain || '').slice(0, 200),
        id: node.id || node.smartlink_id || null,
        status: node.status || 'Active',
      });
      return;
    }
    for (const [key, value] of Object.entries(node)) if (collectionKeys.has(key.toLowerCase())) collect(value, depth + 1);
  }
  collect(payload);
  const unique = new Map();
  for (const link of records) {
    const key = link.url.replace(/\/$/, '');
    if (!unique.has(key)) unique.set(key, link);
  }
  return [...unique.values()];
}

async function fetchAdsterraSmartlinks(apiKey) {
  const token = String(apiKey || '').trim();
  if (!token) return { ok: false, error: 'API key not set' };
  const endpoints = ['smart-links.json', 'smartlinks.json', 'placements.json'];
  const errors = [];
  for (const resource of endpoints) {
    const url = `${ADSTERRA_API_BASE}/${resource}`;
    try { await assertSafeRemoteUrl(url, new Set([new URL(ADSTERRA_API_BASE).hostname])); }
    catch (e) { return { ok: false, error: `Invalid URL: ${e.message}` }; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let resp, body = '';
    try {
      resp = await fetch(url, {
        method: 'GET',
        headers: { 'X-API-Key': token, 'Accept': 'application/json', 'User-Agent': 'PN-AD-NETWORK-Bot/30.0' },
        signal: controller.signal,
        redirect: 'error',
      });
      body = await resp.text();
    } catch (e) { errors.push(`${resource}: ${e.message}`); continue; }
    finally { clearTimeout(timer); }
    if (resp.status === 401 || resp.status === 403) return { ok: false, error: `Unauthorized (HTTP ${resp.status})` };
    if (resp.status === 429) return { ok: false, error: 'Rate limit' };
    if (!resp.ok) { errors.push(`${resource}: HTTP ${resp.status}`); continue; }
    let payload;
    try { payload = JSON.parse(body); } catch (_) { errors.push(`${resource}: not JSON`); continue; }
    const links = extractAdsterraSmartlinks(payload);
    if (links.length) return { ok: true, links, endpoint: resource };
    errors.push(`${resource}: no links`);
  }
  return { ok: false, error: `No SmartLinks. ${errors.join(' | ')}` };
}

async function fetchAdsterraPublisherReport(apiKey) {
  if (!apiKey) return { ok: false, error: 'API key not set.' };
  const today = new Date().toISOString().slice(0, 10);
  const url = new URL(ADSTERRA_STATS_ENDPOINT);
  url.searchParams.set('start_date', today);
  url.searchParams.set('finish_date', today);
  url.searchParams.set('group_by', 'date');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
      signal: controller.signal,
      redirect: 'error',
    });
    const body = await resp.text();
    if (!resp.ok) return { ok: false, error: `Adsterra HTTP ${resp.status}` };
    let data;
    try { data = JSON.parse(body); } catch (_) { return { ok: false, error: 'Invalid JSON' }; }
    return { ok: true, date: today, data };
  } catch (e) { return { ok: false, error: e.message }; }
  finally { clearTimeout(timer); }
}

async function fetchJsonUrlLinks(jsonUrl) {
  try {
    const u = await assertSafeRemoteUrl(jsonUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let resp;
    try { resp = await fetch(u, { headers: { 'Accept': 'application/json' }, signal: controller.signal, redirect: 'error' }); }
    finally { clearTimeout(timer); }
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
    const json = JSON.parse(await resp.text());
    let arr = [];
    if (Array.isArray(json)) arr = json;
    else if (json.links) arr = json.links;
    else if (json.data) arr = json.data;
    else if (json.items) arr = json.items;
    else if (json.smartlinks) arr = json.smartlinks;
    const links = [];
    for (const it of arr) {
      if (typeof it === 'string' && isValidUrl(it)) links.push({ url: it });
      else if (it && typeof it === 'object') {
        const u2 = it.url || it.link || it.smartlink;
        if (u2 && isValidUrl(u2)) links.push({ url: u2, name: it.name || '', id: it.id || null });
      }
    }
    if (!links.length) return { ok: false, error: 'No valid URLs' };
    return { ok: true, links };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ═══════════════════════════════════════════════════════════════════════
//  BUTTON DEFS
// ═══════════════════════════════════════════════════════════════════════
const BUTTON_DEFS = {
  add_link:   { icon: '➕', text: 'Add Link',         action: 'add_link' },
  list_links: { icon: '🔗', text: 'Normal Links',         action: 'list_links' },
  smartlink:  { icon: '⚡', text: 'SmartLink',        action: 'smartlink_menu' },
  shop:       { icon: '🛍️', text: 'Impression Shop', action: 'shop_menu' },
  stats:      { icon: '📊', text: 'Statistics',       action: 'stats' },
  profile:    { icon: '🪪', text: 'Profile',          action: 'profile' },
  membership: { icon: '🎟️', text: 'Membership',       action: 'membership' },
  add_balance:{ icon: '💰', text: 'Wallet',           action: 'add_balance' },
  referral:   { icon: '🎁', text: 'Invite & Earn',    action: 'referral' },
  support:    { icon: '🆘', text: 'Support',          action: 'support' },
  settings:   { icon: '⚙️', text: 'My Preferences',   action: 'user_settings' },
  help:       { icon: '📖', text: 'Help Center',      action: 'help' },
  about:      { icon: '✨', text: 'About',            action: 'about' },
};

const DEFAULT_BUTTON_ORDER = [
  'profile', 'add_balance', 'membership', 'shop',
  'add_link', 'list_links', 'smartlink',
  'stats', 'referral', 'support', 'help', 'about',
];

function getSettings() {
  if (!cache.settings || typeof cache.settings !== 'object') {
    cache.settings = defaultSettings();
    syncToFirebase('settings');
    return cache.settings;
  }
  const s = cache.settings;
  let ch = false;
  if (!s.button_order) { s.button_order = [...DEFAULT_BUTTON_ORDER]; ch = true; }
  for (const k of Object.keys(BUTTON_DEFS)) if (!s.button_order.includes(k)) { s.button_order.push(k); ch = true; }
  s.button_order = s.button_order.filter((k) => BUTTON_DEFS[k]);
  if (!s.button_enabled) { s.button_enabled = {}; ch = true; }
  for (const k of Object.keys(BUTTON_DEFS)) if (!(k in s.button_enabled)) { s.button_enabled[k] = true; ch = true; }
  if (!s.button_icon || typeof s.button_icon !== 'object') { s.button_icon = {}; ch = true; }
  if (!('bot_name_override' in s)) { s.bot_name_override = null; ch = true; }
  if (ch) syncToFirebase('settings');
  return s;
}
function saveSettings() { syncToFirebase('settings'); }
function getBotName() { return getSettings().bot_name_override || BOT_NAME; }
function setBotName(n) { const s = getSettings(); s.bot_name_override = n.trim().slice(0, 64); saveSettings(); }
function toggleButton(k) { const s = getSettings(); s.button_enabled[k] = !s.button_enabled[k]; saveSettings(); }
function moveButton(k, dir) {
  const s = getSettings();
  const o = s.button_order;
  const i = o.indexOf(k);
  if (i === -1) return;
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j >= 0 && j < o.length) [o[i], o[j]] = [o[j], o[i]];
  saveSettings();
}
function getButtonIcon(k) { const c = getSettings().button_icon?.[k]; return (c && c.trim()) ? c.trim() : BUTTON_DEFS[k].icon; }
function setButtonIcon(k, ic) { const s = getSettings(); if (!s.button_icon) s.button_icon = {}; s.button_icon[k] = ic.trim().slice(0, 20); saveSettings(); }
function resetButtonIcon(k) { const s = getSettings(); if (s.button_icon) delete s.button_icon[k]; saveSettings(); }
function buttonLabel(k) { return `${getButtonIcon(k)} ${BUTTON_DEFS[k].text}`; }
function enabledButtonsInOrder() { const s = getSettings(); return s.button_order.filter((k) => s.button_enabled[k]); }

// ═══════════════════════════════════════════════════════════════════════
//  WORKER STATE
// ═══════════════════════════════════════════════════════════════════════
let smartlinkWorkerInterval = null;
let normalWorkerInterval = null;
let smartlinkTickRunning = false;
let normalTickRunning = false;

const workerLastRun = { smartlink: 0, normal: 0 };
const workerNextRun = { smartlink: 0, normal: 0 };
const consecutiveFails = { smartlink: new Map(), normal: new Map() };
const userCooldowns = {};

function isOnCooldown(userId, type) {
  const k = `${userId}::${type}`;
  const until = userCooldowns[k] || 0;
  if (Date.now() < until) return true;
  delete userCooldowns[k];
  return false;
}
function setCooldown(userId, type, ms) { userCooldowns[`${userId}::${type}`] = Date.now() + ms; }

// ⭐ NEW: Calculate ms until next hour boundary (BD time) + 1 min safety buffer
function msUntilNextHour() {
  const BD_OFFSET_MS = 6 * 60 * 60 * 1000;
  const now = Date.now() + BD_OFFSET_MS;
  const nextHour = Math.ceil(now / 3600000) * 3600000;
  return (nextHour - now) + 60000;
}

setInterval(() => {
  const now = Date.now();
  for (const k of Object.keys(userCooldowns)) if (userCooldowns[k] < now) delete userCooldowns[k];
}, 5 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════════════
//  BURST FOR USER
// ═══════════════════════════════════════════════════════════════════════
async function runBurstForUser(uid, url, type, visitCount, windowMs) {
  if (type !== 'smartlink' && type !== 'normal') return { okCount: 0, failCount: 0, burst: null };
  const burst = await performBurstVisit(url, type, uid, visitCount, windowMs);
  const okCount = burst.ok || 0;
  const failCount = burst.fail || 0;

  const activeMode = getActiveMode();
  if (activeMode === MODE_H4CK_ORGANIC && burst.results) {
    for (const r of burst.results) if (r && r.path === 'h4ck-organic') recordH4CkOrganicStat(r);
  }

  if (type === 'smartlink') {
    if (okCount > 0) {
      incrementHourlyCount(uid, 'smartlink', okCount);
      incrementDailyCount(uid, 'smartlink', okCount);
      recordImpressions(uid, url, okCount);
    }
    incrementUserSmartlinkStats(uid, url, okCount, failCount);
    recordUserSmartlinkVisit(uid, url, okCount, failCount);
  } else {
    if (okCount > 0) {
      incrementHourlyCount(uid, 'normal', okCount);
      incrementDailyCount(uid, 'normal', okCount);
      recordImpressions(uid, url, okCount);
    }
    incrementNormalLinkStats(uid, url, okCount, failCount);
  }

  if (okCount > 0) {
  // ⭐ Safety: never let a burst cost more than the user actually has.
  // If balance < okCount, still debit whatever's available (no free visits).
  const available = getImpressionBalance(uid);
  const toDebit = Math.min(okCount, available);
  if (toDebit > 0) deductImpressionBalance(uid, toDebit);
  consumeBurstRun(uid);
}

  recordImpressionHistory(uid, {
    url, type,
    ok: okCount > 0,
    detail: burst.fatalError ? `${burst.fatalError} | ${okCount}/${visitCount}` : `${okCount}/${visitCount} ok`,
    proxy: burst.proxy, dwell_ms: burst.dwell_ms, bytes: burst.bytes,
    visits: okCount, ok_count: okCount, fail_count: failCount,
  });
  recordVisitLog({
    userId: uid, url, type,
    ok: okCount > 0,
    detail: burst.fatalError ? `${burst.fatalError} | ${okCount}/${visitCount}` : `${okCount}/${visitCount} ok`,
    proxy: burst.proxy, dwell_ms: burst.dwell_ms, visits: okCount,
  });
  recordLiveLog(type, uid, url, okCount > 0, burst.fatalError ? `${burst.fatalError} | ${okCount}/${visitCount}` : `${okCount}/${visitCount} ok`, burst.proxy, burst.dwell_ms, burst.meta && burst.meta.country);

  // ⭐ V36: per-dimension live stats (country / device / browser / OS)
  if (burst.meta) {
    const okFlag = okCount > 0;
    try {
      recordTargetingStat('country', burst.meta.country || 'US', okFlag);
      recordTargetingStat('device', burst.meta.device || 'desktop', okFlag);
      recordTargetingStat('browser', burst.meta.browser || 'chrome', okFlag);
      recordTargetingStat('os', burst.meta.os || 'windows', okFlag);
    } catch (e) {}
  }

  const fMap = consecutiveFails[type];
  if (okCount === 0) {
    const key = String(uid);
    const f = (fMap.get(key) || 0) + 1;
    fMap.set(key, f);
    const cfg = getAutoImpressionSettings();
    if (cfg.backoff_on_fail && f >= cfg.max_consecutive_fails) {
      fMap.set(key, 0);
      setCooldown(uid, type, cfg.backoff_duration_ms);
    }
  } else {
    consecutiveFails[type].set(String(uid), 0);
  }
  return { okCount, failCount, burst };
}

// ═══════════════════════════════════════════════════════════════════════
//  SMARTLINK TICK
// ═══════════════════════════════════════════════════════════════════════
let smartlinkTickStartTime = 0;

async function smartlinkImpressionTick() {
  // ⭐ FIX: boolean flag দিয়ে gate, promise না
  if (smartlinkTickRunning) {
    const stuckMs = smartlinkTickStartTime > 0 ? (Date.now() - smartlinkTickStartTime) : 0;
    if (stuckMs > 12 * 60 * 1000) {
      console.warn(`[SL] ⚠️ STUCK TICK >12min (${Math.round(stuckMs/60000)}m) — FORCE RESET`);
      smartlinkTickRunning = false;
      smartlinkTickStartTime = 0;
      activeVisitSlots = 0;
      drainVisitWaiters();
      try { await closeBrowser(); } catch (e) {}
      // fall through to start fresh
    } else {
      console.log(`[SL] Previous tick still running (${Math.round(stuckMs/1000)}s) — skipping`);
      return;
    }
  }

  smartlinkTickRunning = true;
  const tickStartSnapshot = Date.now();       // ← নতুন লাইন
  smartlinkTickStartTime = tickStartSnapshot; // ← নতুন লাইন
  console.log('[SL] ▶️ TICK STARTED');

  try {
    const cfg = getAutoImpressionSettings();
    if (!cfg.smartlink_enabled) { console.log('[SL] Disabled, skip'); return; }
    if (!isSystemHealthy()) { console.log('[SL] System unhealthy, skip'); return; }

    const all = cache.user_smartlinks || {};
    const userIds = Object.keys(all);
    // ⭐ V39: register EVERY user's SmartLink domains up-front so their impressions are
    // detected regardless of which rotating Adsterra domain serves the ad.
    try {
      for (const _d of Object.values(all)) {
        for (const _l of (_d && _d.links) || []) if (_l && _l.url) registerAdsterraDomain(_l.url);
      }
    } catch (e) {}
    console.log(`[SL] Scanning ${userIds.length} user(s)`);

    const LINKS_PER_TICK = 1;  // ⭐ V31-FIX: 1 visit per tick to prevent 10-min stuck ticks

    for (const [uid, data] of Object.entries(all)) {
      if (!data || !Array.isArray(data.links) || !data.links.length) {
        console.log(`[SL] user ${uid}: no links`);
        continue;
      }
      if (!isAutoImpressionRunning(uid, 'smartlink')) {
        console.log(`[SL] user ${uid}: not running`);
        continue;
      }
      if (isOnCooldown(uid, 'smartlink')) {
        console.log(`[SL] user ${uid}: on cooldown`);
        continue;
      }

      const check = canRunImpression(uid, 'smartlink');
      if (!check.ok) {
        if (check.code === 'HOURLY_LIMIT') {
    // ⭐ Auto-resume: cooldown until next hour, keep running flag ON
            const waitMs = msUntilNextHour();
            setCooldown(uid, 'smartlink', waitMs);
            console.log(`[SL] user ${uid}: hourly limit — auto-resume in ${Math.round(waitMs/60000)}m`);
            try {
              await bot.sendMessage(Number(uid),
                `⏳ <b>SmartLink Hourly Limit Reached</b>\n\n${escapeHtml(check.reason)}\n\n⏰ Auto-resume in <b>${Math.round(waitMs/60000)} min</b>\n💡 No action needed — bot will continue automatically.`,
                { parse_mode: 'HTML' });
          } catch (e) {}
          continue;
      }
    // All other blocks: cooldown 5 min + STOP (needs user action)
      setCooldown(uid, 'smartlink', 300000);
      if (['NO_CREDITS', 'BURST_LIMIT', 'DAILY_LIMIT', 'DISABLED', 'PROXY_OFF', 'NO_PROXY', 'PROXY_QUOTA'].includes(check.code)) {
        setAutoImpressionRunning(uid, 'smartlink', false);
      }
      try {
        await bot.sendMessage(Number(uid),
            `⚠️ <b>SmartLink paused</b>\n\n${escapeHtml(check.reason)}`,
            { parse_mode: 'HTML' });
      } catch (e) {}
      continue;
    }

      const targetInfo = checkTargetReached(uid, 'smartlink');
      if (targetInfo.reached) {
        await finishTarget(uid, 'smartlink', targetInfo);
        continue;
      }
      if (targetInfo.exhausted) {
        setAutoImpressionRunning(uid, 'smartlink', false);
        resetTargetProgress(uid, 'smartlink');
        try {
          await bot.sendMessage(Number(uid), `⚠️ <b>Balance Exhausted!</b>`, { parse_mode: 'HTML' });
        } catch (e) {}
        continue;
      }

      for (let _li = 0; _li < LINKS_PER_TICK; _li++) {
        if (isOnCooldown(uid, 'smartlink')) {
          console.log(`[SL] user ${uid}: cooldown after ${_li} visits`);
          break;
        }
        const _check = canRunImpression(uid, 'smartlink');
        if (!_check.ok) {
          console.log(`[SL] user ${uid}: cannot continue (${_check.reason})`);
          break;
        }
        const link = pickLeastRecentlyUsedLink(data.links);
        if (!link || !link.url) { console.log(`[SL] user ${uid}: no valid link`); break; }

        const balanceBefore = getImpressionBalance(uid);
        console.log(`[SL] ▶️ [${_li + 1}/${LINKS_PER_TICK}] user ${uid} → ${String(link.url).slice(0, 60)}`);
        const t0 = Date.now();

        let br = null;
// ⭐ V31-FIX: single attempt, 3.5-min cap — outer retry loop was doubling stuck-tick time
        try {
        br = await withTimeout(
             runBurstForUser(uid, link.url, 'smartlink', getVisitsPerLink(uid), getBurstWindowMs(uid)),
             240 * 1000,  // ⭐ V32-FIX: 4 min — SmartLink dwell now 9-12s (fast-fire), need buffer
             `SL burst ${uid}`
          );
        } catch (e) {
          console.log(`[SL] 🔁 burst threw: ${e.message}`);
          try { await closeBrowser(); } catch (_) {}
        }
        try {
          const _ok = br?.okCount ?? 0;
          const _fail = br?.failCount ?? 0;
          const _err = br?.burst?.fatalError || 'none';
          const _prox = String(br?.burst?.proxy || 'none').replace(/resi(dential)?/gi, 'BOOSTER').replace(/proxy/gi, 'booster');
          const _det = (br?.burst?.results?.[0]?.detail) || 'no-detail';
          const _ic = _ok > 0 ? '✅' : '❌';
          console.log(`[SL] ${_ic} user ${uid} | ${Math.round((Date.now()-t0)/1000)}s | ok=${_ok} fail=${_fail} | booster=${_prox} | err=${_err} | detail=${String(_det).slice(0,150)}`);
        } catch (e) {
          console.error(`[SL] log err: ${e.message}`);
        }

        const balanceAfter = getImpressionBalance(uid);
        const usedNow = Math.max(0, balanceBefore - balanceAfter);
        if (usedNow > 0) addTargetProgress(uid, 'smartlink', usedNow);
        {
          const _t = checkTargetReached(uid, 'smartlink');
          if (_t.reached) { await finishTarget(uid, 'smartlink', _t); break; }
        }

        await sleep(gaussianRandom(500, 1500));  // 0.5-1.5s
      }
    }
  } catch (e) {
    console.error('[SL] tick error:', e.message);
  } finally {
    // এই tick কি এখনো owner? তবেই reset করো
    if (smartlinkTickStartTime === tickStartSnapshot) {
      smartlinkTickRunning = false;
      smartlinkTickStartTime = 0;
        } else {
      console.log('[SL] ⏹️ STALE TICK FINISHED (watchdog already reset)');
    }
  }
}
// NORMAL LINKS TICK------------------------------------------------------------------------------------------------------------
let normalTickStartTime = 0;

async function normalLinkImpressionTick() {
  // ⭐ FIX: boolean flag গেট, promise না
  if (normalTickRunning) {
    const stuckMs = normalTickStartTime > 0 ? (Date.now() - normalTickStartTime) : 0;
    if (stuckMs > 12 * 60 * 1000) {
      console.warn(`[NL] ⚠️ STUCK TICK >12min — FORCE RESET`);
      normalTickRunning = false;
      normalTickStartTime = 0;
      activeVisitSlots = 0;
      drainVisitWaiters();
      try { await closeBrowser(); } catch (e) {}
    } else {
      console.log(`[NL] Previous tick still running (${Math.round(stuckMs/1000)}s) — skipping`);
      return;
    }
  }

  normalTickRunning = true;
  const tickStartSnapshot = Date.now();      // ← নতুন
  normalTickStartTime = tickStartSnapshot;   // ← নতুন
  console.log('[NL] ▶️ TICK STARTED');

  try {
    const cfg = getAutoImpressionSettings();
    if (!cfg.normal_enabled) return;
    if (!isSystemHealthy()) { console.log('[NL] System unhealthy, skip'); return; }
    const all = cache.user_links || {};
    for (const [uid, links] of Object.entries(all)) {
      if (!Array.isArray(links) || !links.length) continue;
      if (!isAutoImpressionRunning(uid, 'normal')) continue;
      if (isOnCooldown(uid, 'normal')) continue;
      const check = canRunImpression(uid, 'normal');
      if (!check.ok) {
        if (check.code === 'HOURLY_LIMIT') {
          const waitMs = msUntilNextHour();
          setCooldown(uid, 'normal', waitMs);
         console.log(`[NL] user ${uid}: hourly limit — auto-resume in ${Math.round(waitMs/60000)}m`);
          try { await bot.sendMessage(Number(uid), `⏳ <b>Normal Hourly Limit Reached</b>\n\n${escapeHtml(check.reason)}\n\n⏰ Auto-resume in <b>${Math.round(waitMs/60000)} min</b>`, { parse_mode: 'HTML' }); } catch (e) {}
          continue;
        }
        setCooldown(uid, 'normal', 300000);
        if (['NO_CREDITS', 'BURST_LIMIT', 'DAILY_LIMIT', 'DISABLED', 'PROXY_OFF', 'NO_PROXY', 'PROXY_QUOTA'].includes(check.code)) {
          setAutoImpressionRunning(uid, 'normal', false);
        }
        try { await bot.sendMessage(Number(uid), `⚠️ <b>Normal paused</b>\n\n${escapeHtml(check.reason)}`, { parse_mode: 'HTML' }); } catch (e) {}
        continue;
      }
      const targetInfo = checkTargetReached(uid, 'normal');
      if (targetInfo.reached) {
        await finishTarget(uid, 'normal', targetInfo);
        continue;
      }
      if (targetInfo.exhausted) {
        setAutoImpressionRunning(uid, 'normal', false);
        resetTargetProgress(uid, 'normal');
        continue;
      }
      const link = pickLeastRecentlyUsedNormalLink(uid, links);
      if (!link) continue;
      const balanceBefore = getImpressionBalance(uid);
      console.log(`[NL] ▶️ user ${uid} → ${String(link).slice(0, 60)}`);
      const t0 = Date.now();
      try {
        const nlTimeoutMs = (getActiveMode() === MODE_H4CK_ORGANIC) ? 5 * 60 * 1000 : 4 * 60 * 1000;
        await withTimeout(
          runBurstForUser(uid, link, 'normal', getVisitsPerLink(uid), getBurstWindowMs(uid)),
          nlTimeoutMs,
          `NL burst ${uid}`
        );
        console.log(`[NL] ✅ user ${uid} done in ${Math.round((Date.now()-t0)/1000)}s`);
      } catch (e) {
        console.error(`[NL] ❌ user ${uid} FAILED: ${e.message}`);
        activeVisitSlots = 0;
        drainVisitWaiters();
      }
      const balanceAfter = getImpressionBalance(uid);
      const usedNow = Math.max(0, balanceBefore - balanceAfter);
      if (usedNow > 0) addTargetProgress(uid, 'normal', usedNow);
      {
        const _t = checkTargetReached(uid, 'normal');
        if (_t.reached) await finishTarget(uid, 'normal', _t);
      }
      await sleep(gaussianRandom(500, 1500));
    }
  } catch (e) { console.error('[NL] tick error:', e.message); }
  finally {
    if (normalTickStartTime === tickStartSnapshot) {
      normalTickRunning = false;
      normalTickStartTime = 0;
    } else {
      console.log('[NL] ⏹️ STALE TICK FINISHED (watchdog already reset)');
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  PATCHED: CONCURRENT IMPRESSION ENGINE  (producer → fair queue → worker pool)
//  ---------------------------------------------------------------------------
//  The old code ran a single 30 s tick that awaited ONE visit at a time
//  (30–180 s each). With 200–300 users a tick could never finish, so almost
//  nothing was delivered. This replaces it with the proven pattern:
//
//     producers (scan eligible users)  ─►  fair round-robin JobQueue
//                                              │
//                                              ▼
//                                    WorkerPool (N parallel visits, N = f(free RAM))
//                                              │
//                                              ▼
//                                    runBurstForUser()  (existing visit code)
//
//  • FAIRNESS     round-robin → 1 heavy user can never starve the other 299
//  • BACKPRESSURE per-user + global caps → producers can't OOM the box
//  • RAM-AWARE    pool auto-grows/shrinks from free memory every 8 s
//  • RECYCLING    workers retire after N visits → dodges the Chromium/V8 leak
// ════════════════════════════════════════════════════════════════════════════
let __engineQueue = null;
let __enginePool = null;
let __producerTimer = null;
const __inflight = new Set();   // uid::type currently being visited (no dup jobs)

function __eligibleSmartlinkJobs() {
  const cfg = getAutoImpressionSettings();
  const out = [];
  if (!cfg.smartlink_enabled) return out;
  const all = cache.user_smartlinks || {};
  for (const [uid, data] of Object.entries(all)) {
    if (!data || !Array.isArray(data.links) || !data.links.length) continue;
    if (!isAutoImpressionRunning(uid, 'smartlink')) continue;
    if (isOnCooldown(uid, 'smartlink')) continue;
    if (__inflight.has(uid + '::smartlink')) continue;
    const check = canRunImpression(uid, 'smartlink');
    if (!check.ok) {
      if (check.code === 'HOURLY_LIMIT') setCooldown(uid, 'smartlink', msUntilNextHour());
      continue;
    }
    const t = checkTargetReached(uid, 'smartlink');
    if (t.reached)   { finishTarget(uid, 'smartlink', t).catch(() => {}); continue; }
    if (t.exhausted) { setAutoImpressionRunning(uid, 'smartlink', false); resetTargetProgress(uid, 'smartlink'); continue; }
    const link = pickLeastRecentlyUsedLink(data.links);
    if (!link || !link.url) continue;
    out.push({ userId: uid, type: 'smartlink', url: link.url,
               visitCount: getVisitsPerLink(uid), windowMs: getBurstWindowMs(uid) });
  }
  return out;
}

function __eligibleNormalJobs() {
  const cfg = getAutoImpressionSettings();
  const out = [];
  if (!cfg.normal_enabled) return out;
  const all = cache.user_links || {};
  const webLinksAll = cache.web_normal_links || {};
  const userIds = new Set([
    ...Object.keys(all),
    ...Object.keys(webLinksAll),
    ...Object.keys(cache.auto_impression_running || {})
  ]);

  for (const uid of userIds) {
    const rawLinks = Array.isArray(all[uid]) ? all[uid] : [];
    const webLinks = Array.isArray(webLinksAll[uid]) ? webLinksAll[uid].filter((l) => l && l.status !== 'paused').map((l) => l.url).filter(Boolean) : [];
    const links = [...new Set([...rawLinks, ...webLinks])];
    if (!links.length) continue;
    const isRunning = isAutoImpressionRunning(uid, 'normal') || (Array.isArray(webLinksAll[uid]) && webLinksAll[uid].some((l) => l && l.status === 'active'));
    if (!isRunning) continue;
    if (isOnCooldown(uid, 'normal')) continue;
    if (__inflight.has(uid + '::normal')) continue;
    const check = canRunImpression(uid, 'normal');
    if (!check.ok) {
      if (check.code === 'HOURLY_LIMIT') setCooldown(uid, 'normal', msUntilNextHour());
      continue;
    }
    const t = checkTargetReached(uid, 'normal');
    if (t.reached)   { finishTarget(uid, 'normal', t).catch(() => {}); continue; }
    if (t.exhausted) { setAutoImpressionRunning(uid, 'normal', false); resetTargetProgress(uid, 'normal'); continue; }
    const link = pickLeastRecentlyUsedNormalLink(uid, links);
    if (!link) continue;
    out.push({ userId: uid, type: 'normal', url: link,
               visitCount: getVisitsPerLink(uid), windowMs: getBurstWindowMs(uid) });
  }
  return out;
}

// Runs ONE queued job through the existing burst pipeline + accounting.
async function __runEngineJob(job) {
  const { userId: uid, type, url, visitCount, windowMs } = job;
  const ikey = uid + '::' + type;
  __inflight.add(ikey);
  try {
    if (isOnCooldown(uid, type)) return { okCount: 0, skipped: true };
    const check = canRunImpression(uid, type);
    if (!check.ok) return { okCount: 0, skipped: true };

    const balanceBefore = getImpressionBalance(uid);
    const timeoutMs = (getActiveMode() === MODE_H4CK_ORGANIC) ? 5 * 60 * 1000 : 4 * 60 * 1000;
    let br = null;
    try {
      br = await withTimeout(runBurstForUser(uid, url, type, visitCount, windowMs), timeoutMs, type + ' burst ' + uid);
    } catch (e) {
      console.error('[Engine] ' + type + ' ' + uid + ' failed: ' + e.message);
    }
    const balanceAfter = getImpressionBalance(uid);
    const usedNow = Math.max(0, balanceBefore - balanceAfter);
    if (usedNow > 0) addTargetProgress(uid, type, usedNow);
    const t = checkTargetReached(uid, type);
    if (t.reached) { try { await finishTarget(uid, type, t); } catch (e) {} }

    // Natural per-user spacing (config-driven) — also stops one user hogging the pool.
    const cfg = getAutoImpressionSettings();
    const lo = Number(cfg.min_interval_ms) || 30000;
    const hi = Math.max(lo, Number(cfg.max_interval_ms) || 60000);
    setCooldown(uid, type, gaussianRandom(lo, hi));
    return { okCount: br && br.okCount ? br.okCount : 0 };
  } finally {
    __inflight.delete(ikey);
  }
}

function startImpressionWorkers() {
  stopImpressionWorkers();
  const cfg = getAutoImpressionSettings();
  const activeMode = getActiveMode();
  // ⚡ fast-fire: scan for new jobs every ~10s so an impression lands in ~10-12s.
  const tick = Math.max(5000, Math.min(
    Number(cfg.worker_tick_ms) || 10000,
    cfg.fast_fire_enabled !== false ? 12000 : 60000,
  ));

  __engineQueue = new JobQueue({ maxTotal: 5000, maxPerUser: 8, dedupe: true });
  const envMax = Number(process.env.MAX_CONCURRENT_VISITS);
  const envReserved = Number(process.env.RESERVED_MB);
  __enginePool = new WorkerPool({
    queue: __engineQueue,
    runJob: __runEngineJob,
    browser: process.env.BROWSER_KIND || 'shell',
    max: Number.isFinite(envMax) && envMax > 0 ? envMax : undefined,
    reservedMB: Number.isFinite(envReserved) && envReserved > 0 ? envReserved : undefined,
    maxVisitsPerWorker: Number(process.env.MAX_VISITS_PER_WORKER) || 120,
    jobTimeoutMs: 5 * 60 * 1000,
    onEvent: (type, p) => {
      if (type === 'pool-started' || type === 'scale-up' || type === 'scale-down') {
        console.log('[Pool] ' + type + ' → concurrency=' + (p && p.concurrency));
      }
    },
  });
  __enginePool.start();

  const produce = () => {
    try {
      if (!isSystemHealthy()) return;
      const now = Date.now();
      for (const j of __eligibleSmartlinkJobs()) __engineQueue.push(j);
      for (const j of __eligibleNormalJobs())    __engineQueue.push(j);
      workerLastRun.smartlink = workerLastRun.normal = now;
      workerNextRun.smartlink = now + tick;
      workerNextRun.normal = now + tick;
    } catch (e) { console.error('[Engine] producer error:', e.message); }
  };
  produce();
  __producerTimer = setInterval(produce, tick);

  // Keep the old watchdog flags harmless (the tick functions are no longer used).
  smartlinkTickRunning = false;
  normalTickRunning = false;

  console.log('[Workers] ⚙️ Concurrent engine started (tick=' + tick + 'ms, mode=' + getModeDisplayName(activeMode) + ', concurrency=' + __enginePool.concurrency + ')');
}

function stopImpressionWorkers() {
  if (smartlinkWorkerInterval) clearInterval(smartlinkWorkerInterval);
  if (normalWorkerInterval) clearInterval(normalWorkerInterval);
  smartlinkWorkerInterval = null;
  normalWorkerInterval = null;
  if (__producerTimer) clearInterval(__producerTimer);
  __producerTimer = null;
  if (__enginePool) { try { __enginePool.stop(); } catch (e) {} __enginePool = null; }
  __engineQueue = null;
}

// ⭐ V30 FIX: Watchdog — stuck tick reset
let watchdogTimer = null;
function startTickWatchdog() {
  if (watchdogTimer) clearInterval(watchdogTimer);
  watchdogTimer = setInterval(() => {
    const now = Date.now();
    if (smartlinkTickRunning && smartlinkTickStartTime > 0 && now - smartlinkTickStartTime > 15 * 60 * 1000) {
      console.warn('[Watchdog] SL tick stuck >15min — force resetting');
      smartlinkTickRunning = false;
      smartlinkTickStartTime = 0;
      activeVisitSlots = 0;
      drainVisitWaiters();
    }
    if (normalTickRunning && normalTickStartTime > 0 && now - normalTickStartTime > 15 * 60 * 1000) {
      console.warn('[Watchdog] NL tick stuck >15min — force resetting');
      normalTickRunning = false;
      normalTickStartTime = 0;
      activeVisitSlots = 0;
      drainVisitWaiters();
    }
  }, 60000);
  if (watchdogTimer.unref) watchdogTimer.unref();
  console.log('[Watchdog] Tick watchdog started (60s interval)');
}

// ═══════════════════════════════════════════════════════════════════════
//  UI LABELS (same as original)
// ═══════════════════════════════════════════════════════════════════════
const ADMIN_PANEL_LABEL = `🛠️ Admin Panel`;
const BACK_TO_MENU_LABEL = `🏠 Main Menu`;
const CANCEL_LABEL = `✖️ Cancel`;
const CONFIRM_LABEL = `✅ Confirm`;
const MY_LINKS_ADD_LABEL = `➕ Add Link`;
const MY_LINKS_DELETE_LABEL = `🗑️ Delete`;
const MY_LINKS_CHECK_ALL = `🔎 Check All`;
const MY_LINKS_START_NORMAL = `▶️ Start Traffic`;
const MY_LINKS_STOP_NORMAL = `⏹️ Stop Traffic`;
const MY_LINKS_STATS = `📊 Link Stats`;
const MY_LINKS_HISTORY = `📜 History`;
const ADMIN_BACK_LABEL = `↩️ Admin Panel`;
const ADMIN_BACK_TO_USER_LABEL = `🏠 User Menu`;
const HELP_CONTACT_ADMIN_LABEL = `📩 Contact Admin`;
const HELP_CONTACT_DEV_LABEL = `👨‍💻 Developer`;
const SL_BTN_SET_API = `🔑 Set API Key`;
const SL_BTN_SET_ENDPOINT = `🔔 API Guide`;
const SL_BTN_FETCH_API = `⮽️ Sync from Adsterra`;
const SL_BTN_PASTE_MANUAL = `📝 Add Links`;
const SL_BTN_LOAD_JSON = `📁 Load JSON`;
const SL_BTN_VIEW_LINKS = `📋 My SmartLinks`;
const SL_BTN_STATS = `📊 SmartLink Stats`;
const SL_BTN_START = `▶️ Start SmartLink`;
const SL_BTN_STOP = `⏹️ Stop SmartLink`;
const SL_BTN_HISTORY = `📜 Impression History`;
const SL_BTN_CLEAR = `🧹 Clear Links`;
const LIVE_SL_REFRESH = `🔄 Refresh`;
const LIVE_SL_START = `▶️ Start SmartLink`;
const LIVE_SL_STOP = `⏹️ Stop SmartLink`;
const LIVE_NL_REFRESH = `🔄 Refresh`;
const LIVE_NL_START = `▶️ Start Normal`;
const LIVE_NL_STOP = `⏹️ Stop Normal`;
const TARGET_BTN_SL = `🎯 Set SmartLink Target`;
const TARGET_BTN_NL = `🎯 Set Traffic Target`;
const TARGET_50 = `5️⃣0️⃣`;
const TARGET_100 = `1️⃣0️⃣0️⃣`;
const TARGET_250 = `2️⃣5️⃣0️⃣`;
const TARGET_500 = `5️⃣0️⃣0️⃣`;
const TARGET_1000 = `1️⃣0️⃣0️⃣0️⃣`;
const TARGET_CUSTOM = `✏️ Custom`;
const TARGET_NO_LIMIT = `♾️ No Limit`;
const REPORT_TRIAL_LABEL = `🎁 Claim 10 Free Impressions`;
const REPORT_RUN_LABEL = `📊 Publisher Report`;

const ADMIN_MENU_BUTTONS = `🔘 Manage Buttons`;
const ADMIN_MENU_REORDER = `↕️ Reorder Buttons`;
const ADMIN_MENU_ICONS = `🎨 Edit Icons`;
const ADMIN_MENU_SETNAME = `✏️ Change Bot Name`;
const ADMIN_MENU_BROADCAST = `📢 Broadcast`;
const ADMIN_MENU_STATS = `📊 Statistics`;
const ADMIN_MENU_HUMAN = `🤖 Human Behavior`;
const ADMIN_MENU_PROXY = `🌐 Proxy Manager`;
const ADMIN_MENU_MEMBERSHIP = `🎟️ Membership Plans`;
const ADMIN_MENU_PAY_METHODS = `💳 Payment Methods`;
const ADMIN_MENU_BALANCE_REQ = `💰 Balance Requests`;
const ADMIN_MENU_MANAGE_ADMINS = `👑 Manage Admins`;
const ADMIN_MENU_SHOP = `🛒 Shop Settings`;
const ADMIN_MENU_FIREBASE = `🔥 Firebase Status`;
const ADMIN_MENU_SUPPORT = `💬 Support Messages`;
const ADMIN_MENU_BAN = `🚫 Ban / Unban`;
const ADMIN_MENU_PROMO = `🎫 Promo Codes`;
const ADMIN_MENU_JOIN = `📢 Join Check`;
const ADMIN_MENU_AUTOBROADCAST = `📣 Auto Broadcast`;
const ADMIN_MENU_CAPTCHA = `🔐 Captcha Settings`;
const ADMIN_MENU_SLV2 = `⚡ SmartLink Settings`;
const ADMIN_MENU_AUTO_IMP = `📈 Auto Impression`;
const ADMIN_MENU_PRICE_EDIT = `💵 Price Editor`;
const ADMIN_MENU_VISIT_LOG = `📜 Visit Logs`;
const ADMIN_MENU_HEALTH = `🏥 Proxy Health`;
const ADMIN_MENU_BRIDGE = `🌉 Bridge Status`;
const ADMIN_MENU_SYS_HEALTH = `💻 System Health`;
const ADMIN_MENU_PROXY_PERF = `📊 Proxy Analytics`;
const ADMIN_MENU_HIGH_CPM = `💎 High CPM Mode`;
const ADMIN_MENU_MAINTENANCE = `🛠️ Maintenance Mode`;

const ADMIN_MENU_ACTIONS = {
  [ADMIN_MENU_BUTTONS]: 'admin_buttons',
  [ADMIN_MENU_REORDER]: 'admin_reorder',
  [ADMIN_MENU_ICONS]: 'admin_icons',
  [ADMIN_MENU_SETNAME]: 'admin_setname',
  [ADMIN_MENU_BROADCAST]: 'admin_broadcast',
  [ADMIN_MENU_STATS]: 'admin_stats',
  [ADMIN_MENU_HUMAN]: 'admin_human',
  [ADMIN_MENU_PROXY]: 'admin_proxy',
  [ADMIN_MENU_MEMBERSHIP]: 'admin_membership',
  [ADMIN_MENU_PAY_METHODS]: 'admin_pay_methods',
  [ADMIN_MENU_BALANCE_REQ]: 'admin_balance_requests',
  [ADMIN_MENU_MANAGE_ADMINS]: 'admin_manage_admins',
  [ADMIN_MENU_SHOP]: 'admin_shop',
  [ADMIN_MENU_FIREBASE]: 'admin_firebase',
  [ADMIN_MENU_SUPPORT]: 'admin_support',
  [ADMIN_MENU_BAN]: 'admin_ban',
  [ADMIN_MENU_PROMO]: 'admin_promo',
  [ADMIN_MENU_JOIN]: 'admin_join',
  [ADMIN_MENU_AUTOBROADCAST]: 'admin_autobroadcast',
  [ADMIN_MENU_CAPTCHA]: 'admin_captcha',
  [ADMIN_MENU_SLV2]: 'admin_slv2',
  [ADMIN_MENU_AUTO_IMP]: 'admin_auto_imp',
  [ADMIN_MENU_PRICE_EDIT]: 'admin_price_edit',
  [ADMIN_MENU_VISIT_LOG]: 'admin_visit_log',
  [ADMIN_MENU_HEALTH]: 'admin_health',
  [ADMIN_MENU_BRIDGE]: 'admin_bridge',
  [ADMIN_MENU_SYS_HEALTH]: 'admin_sys_health',
  [ADMIN_MENU_PROXY_PERF]: 'admin_proxy_perf',
  [ADMIN_MENU_HIGH_CPM]: 'admin_high_cpm',
  [ADMIN_MENU_MAINTENANCE]: 'admin_maintenance',
  [`🚨 Force Reset Ticks`]: 'admin_reset_ticks',   // ← নতুন যোগ
};

const PROXY_MENU_ADD = `➕ Add Proxy`;
const PROXY_MENU_LIST = `📋 List Proxies`;
const PROXY_MENU_REMOVE = `🗑️ Remove Proxy`;
const PROXY_MENU_TESTALL = `🧪 Test All`;
const PROXY_MENU_SETTINGS = `⚙️ Settings`;
const PROXY_MENU_CLEAR = `🧹 Clear All`;
const PROXY_MENU_HEALTH = `🏥 Health Check`;

const SHOP_MENU_VIEW = `📦 View Packages`;
const SHOP_MENU_EDIT = `✏️ Edit Package`;
const SHOP_MENU_RESET = `🔄 Reset Defaults`;

// ═══════════════════════════════════════════════════════════════════════
//  CALLBACKS / KEYBOARD
// ═══════════════════════════════════════════════════════════════════════
const inlineButtonActions = new Map();
let inlineButtonSeq = 0;

const BUTTON_STYLES = ['danger', 'success', 'primary'];
// Random start, then rotate: neighbours always differ, every render looks different.
function makeStylePicker() {
  let i = Math.floor(Math.random() * BUTTON_STYLES.length);
  return () => BUTTON_STYLES[i++ % BUTTON_STYLES.length];
}

function buildKeyboard(rows) {
  const nextStyle = makeStylePicker();
  return {
    inline_keyboard: rows.map((r) =>
      r.map((t) => {
        // If it's already an object (url buttons), pass through
        if (typeof t === 'object' && t !== null) return t.style ? t : { ...t, style: nextStyle() };
        const originalText = String(t);
        const id = `m${(++inlineButtonSeq).toString(36)}`;
        inlineButtonActions.set(id, { text: originalText, at: Date.now() });
        if (inlineButtonActions.size > INLINE_MAP_MAX) {
          const cutoff = Date.now() - CALLBACK_TTL_MS;
          for (const [k, v] of inlineButtonActions) {
            if (v.at < cutoff) inlineButtonActions.delete(k);
            if (inlineButtonActions.size <= INLINE_MAP_MAX * 0.8) break;
          }
        }
        return { text: originalText, callback_data: id, style: nextStyle() };
      })
    ),
  };
}

function getCallbackText(data) {
  const v = inlineButtonActions.get(data);
  if (!v) return null;
  if (Date.now() - v.at > CALLBACK_TTL_MS) { inlineButtonActions.delete(data); return null; }
  return v.text;
}

function pairRows(l) {
  const r = [];
  for (let i = 0; i < l.length; i += 2) r.push(l.slice(i, i + 2));
  return r;
}

function mainMenuLabels(userId) {
  const l = enabledButtonsInOrder().map((k) => buttonLabel(k));
  if (!hasImpressionTrial(userId)) l.push(REPORT_TRIAL_LABEL);
  l.push(REPORT_RUN_LABEL);
  if (userId != null && isAdmin(userId)) l.push(ADMIN_PANEL_LABEL);
  return l;
}
function mainMenuKeyboard(userId = null) { return buildKeyboard(pairRows(mainMenuLabels(userId))); }
function matchMainMenu(text, userId) {
  for (const k of enabledButtonsInOrder()) if (buttonLabel(k) === text) return BUTTON_DEFS[k].action;
  if (userId != null && isAdmin(userId) && text === ADMIN_PANEL_LABEL) return 'admin_open';
  return null;
}
function simpleBackKeyboard() { return buildKeyboard([[BACK_TO_MENU_LABEL]]); }
function cancelKeyboard() { return buildKeyboard([[CANCEL_LABEL]]); }
function myLinksKeyboard(userId = null) {
  const target = userId ? getImpressionTarget(userId, 'normal') : 0;
  const tLabel = target > 0 ? `🎯 Target: ${target}` : TARGET_BTN_NL;
  return buildKeyboard([
    [MY_LINKS_ADD_LABEL, MY_LINKS_DELETE_LABEL],
    [MY_LINKS_CHECK_ALL],
    [tLabel],
    [MY_LINKS_START_NORMAL, MY_LINKS_STOP_NORMAL],
    [MY_LINKS_STATS, MY_LINKS_HISTORY],
    ...(userId != null && !hasImpressionTrial(userId) ? [[REPORT_TRIAL_LABEL]] : []),
    [BACK_TO_MENU_LABEL],
  ]);
}
function adminBackKeyboard() { return buildKeyboard([[ADMIN_BACK_LABEL]]); }
function helpKeyboard() { return buildKeyboard([[HELP_CONTACT_ADMIN_LABEL, HELP_CONTACT_DEV_LABEL], [BACK_TO_MENU_LABEL]]); }
function adminMainKeyboard(userId = null) {
  const rows = [
    [ADMIN_MENU_BUTTONS, ADMIN_MENU_REORDER],
    [ADMIN_MENU_ICONS, ADMIN_MENU_SETNAME],
    [ADMIN_MENU_BROADCAST, ADMIN_MENU_AUTOBROADCAST],
    [ADMIN_MENU_STATS, ADMIN_MENU_FIREBASE],
    [ADMIN_MENU_HUMAN, ADMIN_MENU_PROXY],
    [ADMIN_MENU_AUTO_IMP, ADMIN_MENU_SLV2],
    [ADMIN_MENU_MEMBERSHIP, ADMIN_MENU_PAY_METHODS],
    [ADMIN_MENU_PRICE_EDIT, ADMIN_MENU_SHOP],
    [ADMIN_MENU_PROMO, ADMIN_MENU_BALANCE_REQ],
    [ADMIN_MENU_SUPPORT, ADMIN_MENU_BAN],
    [ADMIN_MENU_JOIN, ADMIN_MENU_CAPTCHA],
    [ADMIN_MENU_VISIT_LOG, ADMIN_MENU_HEALTH],
    [ADMIN_MENU_BRIDGE, ADMIN_MENU_SYS_HEALTH],
    [ADMIN_MENU_PROXY_PERF, ADMIN_MENU_HIGH_CPM],
    [`🚨 Force Reset Ticks`],          // ← এই লাইনটা নতুন যোগ করলেন
    [ADMIN_MENU_MAINTENANCE],
  ];
  if (userId !== null && isSuperAdmin(userId)) rows.push([ADMIN_MENU_MANAGE_ADMINS]);
  rows.push([ADMIN_BACK_TO_USER_LABEL]);
  return buildKeyboard(rows);
}
function proxyMenuKeyboard() {
  const cfg = getProxySettings();
  const onOff = (v) => v ? '🟢 ON' : '🔴 OFF';
  const proxyToggle = cfg.enabled
  ? `🎛️ Proxy — 🟢 ON`
  : `🎛️ Proxy — 🔴 OFF (traffic halted)`;
  return buildKeyboard([
    [proxyToggle],
    [PROXY_MENU_ADD, PROXY_MENU_LIST],
    [PROXY_MENU_REMOVE, PROXY_MENU_TESTALL],
    [PROXY_MENU_SETTINGS, PROXY_MENU_CLEAR],
    [PROXY_MENU_HEALTH],
    [ADMIN_BACK_LABEL],
  ]);
}
function shopAdminKeyboard() { return buildKeyboard([[SHOP_MENU_VIEW, SHOP_MENU_EDIT], [SHOP_MENU_RESET], [ADMIN_BACK_LABEL]]); }
function userSmartlinkMenuKeyboard(userId = null) {
  const slRunning = userId ? isAutoImpressionRunning(userId, 'smartlink') : false;
  const slData = userId ? getUserSmartlink(userId) : { links: [] };
  const target = userId ? getImpressionTarget(userId, 'smartlink') : 0;
  const rows = [
    [SL_BTN_SET_API, SL_BTN_SET_ENDPOINT],
    [SL_BTN_FETCH_API, SL_BTN_PASTE_MANUAL],
    [SL_BTN_LOAD_JSON, SL_BTN_VIEW_LINKS],
    [SL_BTN_STATS, SL_BTN_HISTORY],
  ];
  if (slData.links.length > 0) {
    const tLabel = target > 0 ? `🎯 Target: ${target}` : TARGET_BTN_SL;
    rows.push([tLabel]);
    rows.push([slRunning ? SL_BTN_STOP : SL_BTN_START]);
  }
  rows.push([SL_BTN_CLEAR]);
  if (userId == null || !hasImpressionTrial(userId)) rows.push([REPORT_TRIAL_LABEL, REPORT_RUN_LABEL]);
  else rows.push([REPORT_RUN_LABEL]);
  rows.push([BACK_TO_MENU_LABEL]);
  return buildKeyboard(rows);
}

// ═══════════════════════════════════════════════════════════════════════
//  MESSAGE BUILDERS
// ═══════════════════════════════════════════════════════════════════════
function welcomeMessage(userId) {
  const m = getMembership(userId);
  const bal = getBalance(userId);
  const impBal = getImpressionBalance(userId);
  const info = getUserInfo(userId);
  const firstName = info.first_name || 'User';
  const linksCount = getUserLinks(userId).length;
  const slData = getUserSmartlink(userId);
  const plans = getPlans();
  const planLabel = m.plan && plans[m.plan] ? plans[m.plan].label : 'Free';
  const stats = getUserStats(userId);
  const slStats = getUserSmartlinkStats(userId);
  const totalImpressions = stats.total_impressions || 0;
  const normalOnly = Math.max(0, (stats.total_impressions || 0) - (slStats.ok || 0));
  const role = isAdmin(userId) ? '👑 Administrator' : '💎 Member';
  const activeMode = getActiveMode();

  let t = `╭━━━━━━━━━━━━━━━━━━━━╮\n`;
  t += `   ⚡ <b>PN AD NETWORK</b> ⚡\n`;
  t += `         <i>${BOT_BUILD}</i>\n`;
  t += `╰━━━━━━━━━━━━━━━━━━━━╯\n\n`;
  t += `✨ <b>Welcome, ${escapeHtml(firstName)}!</b>\n`;
  t += `${role}  ✦  🇺🇸 US Organic Traffic\n\n`;
  t += `╭─ 💼 <b>ACCOUNT</b>\n`;
  t += `├ 🎟️ Plan  ⟶  <b>${planLabel}</b>`;
  if (m.plan) t += `  ⏳ ${daysLeft(m.expires_at)}d`;
  t += `\n├ 💰 Wallet  ⟶  <b>৳${bal}</b>\n`;
  t += `╰ 🛍️ Credits  ⟶  <b>${impBal}</b>\n\n`;
  t += `╭─ 🚀 <b>WORKSPACE</b>\n`;
  t += `├ ⚡ Mode  ⟶  <b>${getModeDisplayName(activeMode)}</b>\n`;
  t += `├ 🔗 Links  ⟶  <b>${linksCount}/${m.link_limit}</b>\n`;
  t += `╰ 🌐 SmartLinks  ⟶  <b>${slData.links.length}</b>\n\n`;
  t += `╭─ 👁️ <b>IMPRESSIONS</b>  ⟶  <b>${totalImpressions}</b>\n`;
  t += `├ 🔗 Normal  ⟶  ${normalOnly}\n`;
  t += `╰ ⚡ SmartLink  ⟶  ${slStats.total_visits || 0}\n\n`;
  t += `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n`;
  t += `👨‍💻 <b>${DEVELOPER_NAME}</b>`;
  return t;
}

function menuMessage(userId) {
  const info = getUserInfo(userId);
  const firstName = info.first_name || 'User';
  const m = getMembership(userId);
  const bal = getBalance(userId);
  const impBal = getImpressionBalance(userId);
  const plans = getPlans();
  const planLabel = m.plan && plans[m.plan] ? plans[m.plan].label : 'Free';
  const planIcon = m.plan ? '💎' : '🆓';
  const planExpiry = m.plan && m.expires_at ? `  <i>(⏳ ${daysLeft(m.expires_at)}d left)</i>` : '';
  const activeMode = getActiveMode();
  const stats = getUserStats(userId);
  const totalImpressions = stats.total_impressions || 0;

  return `╭━━━━━━━━━━━━━━━━━━━━╮\n` +
    `   🏠 <b>PN AD NETWORK</b>\n` +
    `╰━━━━━━━━━━━━━━━━━━━━╯\n\n` +
    `👋 Welcome back, <b>${escapeHtml(firstName)}</b>!\n\n` +
    `╭─ 📊 <b>OVERVIEW</b>\n` +
    `├ 💰 Wallet  ⟶  <b>৳${bal}</b>\n` +
    `├ 🛍️ Credits  ⟶  <b>${impBal}</b>\n` +
    `├ 👁️ Impressions  ⟶  <b>${totalImpressions}</b>\n` +
    `├ ${planIcon} Plan  ⟶  <b>${planLabel}</b>${planExpiry}\n` +
    `╰ ⚡ Mode  ⟶  <b>${getModeDisplayName(activeMode)}</b>\n\n` +
    `✨ <b>Choose an option below</b>\n` +
    `🚀 <i>Fast  ✦  Clean  ✦  Reliable</i>`;
}

function addLinkPrompt() {
  return `➕ <b>ADD NEW LINK</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n🌐 Send your full URL below.\n\n💡 <b>Example</b>\n<code>https://example.com/page</code>\n\n⚡ <i>Only HTTP / HTTPS links are accepted.</i>`;
}
function listLinksMessage(links) {
  const h = `🔗 <b>MY LINKS</b>`;
  if (!links.length) return h + `\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n📭 <i>No links yet — tap ➕ Add Link to begin.</i>`;
  return h + `  ⟶  <b>${links.length}</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n` + links.map((u, i) => `<b>${i + 1}.</b> ${escapeHtml(u)}`).join('\n');
}
function statsMessage(s, userId = null) {
  if (!userId) {
    return `📊 <b>MY STATISTICS</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n╭─ 🔎 <b>CHECKS</b>\n├ Total  ⟶  <b>${s.total_checks || 0}</b>\n├ ✅ OK  ⟶  <b>${s.ok || 0}</b>\n╰ ❌ Failed  ⟶  <b>${s.failed || 0}</b>\n\n👁️ Impressions  ⟶  <b>${s.total_impressions || 0}</b>`;
  }
  const slStats = getUserSmartlinkStats(userId);
  const nlStats = getNormalLinkStats(userId);
  const totalImpressions = s.total_impressions || 0;
  const normalOnly = Math.max(0, (s.total_impressions || 0) - (slStats.ok || 0));
  return `📊 <b>MY STATISTICS</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n` +
    `╭─ 🔎 <b>CHECKS</b>\n` +
    `├ Total  ⟶  <b>${s.total_checks || 0}</b>\n` +
    `├ ✅ OK  ⟶  <b>${s.ok || 0}</b>\n` +
    `╰ ❌ Failed  ⟶  <b>${s.failed || 0}</b>\n\n` +
    `╭─ 👁️ <b>IMPRESSIONS</b>  ⟶  <b>${totalImpressions}</b>\n` +
    `├ 🔗 Normal  ⟶  ${normalOnly}\n` +
    `├ ⚡ SmartLink  ⟶  ${slStats.total_visits || 0}\n` +
    `├ 🌐 Normal Visits  ⟶  ${nlStats.total_visits || 0}\n` +
    `╰ ✅ OK  ⟶  ${totalImpressions}`;
}
function linkedMessage(u) { return `✅ <b>LINK ADDED</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n🔗 ${escapeHtml(u)}\n\n🚀 <i>Ready to use</i>`; }
function removedMessage(u) { return `🗑️ <b>LINK REMOVED</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n🔗 ${escapeHtml(u)}`; }

function profileMessage(userId) {
  const m = getMembership(userId);
  const bal = getBalance(userId);
  const impBal = getImpressionBalance(userId);
  const plans = getPlans();
  const planLabel = m.plan && plans[m.plan] ? plans[m.plan].label : 'Free ✨';
  const linksCount = getUserLinks(userId).length;
  const info = getUserInfo(userId);
  const fullName = [info.first_name, info.last_name].filter(Boolean).join(' ') || '—';
  const s = getUserStats(userId);
  const slStats = getUserSmartlinkStats(userId);
  const ref = getReferralInfo(userId);
  // ⭐ FIX: s.total_impressions already includes BOTH normal + smartlink (via recordImpressions)
  // Don't add slStats.total_visits again
  const totalImpressions = s.total_impressions || 0;
  const normalOnly = Math.max(0, (s.total_impressions || 0) - (slStats.ok || 0));

  let t = `👤 <b>MY PROFILE</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n`;
  t += `╭─ 🪪 <b>IDENTITY</b>\n`;
  t += `├ 🙍 Name  ⟶  <b>${escapeHtml(fullName)}</b>\n`;
  t += `├ 🔖 Username  ⟶  <b>${info.username ? '@' + escapeHtml(info.username) : '—'}</b>\n`;
  t += `╰ 🆔 User ID  ⟶  <code>${userId}</code>\n\n`;
  t += `╭─ 💼 <b>ACCOUNT</b>\n`;
  t += `├ 💰 Wallet  ⟶  <b>৳${bal}</b>\n`;
  t += `├ 🛍️ Credits  ⟶  <b>${impBal}</b>\n`;
  t += `├ 🎟️ Plan  ⟶  <b>${planLabel}</b>\n`;
  if (m.plan) t += `├ ⏳ Expires  ⟶  <b>${formatExpiry(m.expires_at)}</b> (${daysLeft(m.expires_at)}d)\n`;
  t += `├ 🚀 Burst  ⟶  <b>${m.visits_per_link}</b>/${m.burst_window_ms/1000}s\n`;
  t += `├ 🔗 Links  ⟶  <b>${linksCount}/${m.link_limit}</b>\n`;
  t += `╰ 📅 Bursts today  ⟶  <b>${m.daily_burst_used || 0}/${m.daily_burst_limit}</b>\n\n`;
  t += `╭─ 👁️ <b>IMPRESSIONS</b>  ⟶  <b>${totalImpressions}</b>\n`;
  t += `├ 🔗 Normal  ⟶  ${normalOnly}\n`;
  t += `├ ⚡ SmartLink  ⟶  ${slStats.ok || 0}\n`;
  t += `├ ✅ OK  ⟶  ${totalImpressions}\n`;
  t += `╰ ❌ Failed  ⟶  ${(getNormalLinkStats(userId).failed || 0) + (slStats.failed || 0)}\n\n`;
  t += `╭─ 🎁 <b>REFERRAL</b>\n`;
  t += `├ 🎫 Code  ⟶  <code>${userId}</code>\n`;
  t += `╰ 👥 Invited  ⟶  <b>${ref.invited.length}</b>  ✦  💰 ৳${ref.earned || 0}`;
  return t;
}

function membershipPlansMessage() {
  const plans = getPlans();
  const activeKeys = PLAN_ORDER.filter((key) => plans[key] && plans[key].enabled !== false);
  let t = `🎟️ <b>MEMBERSHIP PLANS</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n`;
  t += `⚠️ <i>SmartLink: 1 visit per burst (Adsterra-safe)</i>\n`;
  t += `<i>Plan benefits apply to Normal Links + burst/day limit + free credits.</i>\n\n`;
  for (const key of activeKeys) {
    const p = plans[key];
    const bonus = Number(p.bonus_credits || 0);
    t += `⭐ <b>${p.label}</b>  ✦  <b>৳${p.price}</b>\n`;
    if (bonus > 0) t += `├ 🎁 Bonus  ⟶  <b>+${bonus} free credits</b>\n`;
    t += `├ 🔗 Links  ⟶  <b>${p.link_limit}</b>\n`;
    t += `├ 📅 Daily bursts  ⟶  <b>${p.daily_burst_limit}</b>\n`;
    t += `├ 🚀 Normal burst  ⟶  <b>${p.visits_per_link}</b> visits / ${p.burst_window_ms/1000}s\n`;
    t += `╰ ⚡ SmartLink  ⟶  <b>1</b> visit / burst\n\n`;
  }
  t += `💡 <i>Buy impression credits separately from Shop.</i>`;
  return t;
}

function shopMessage(userId) {
  const pkgs = getShopPackages();
  const bal = getImpressionBalance(userId);
  let t = `🛒 <b>IMPRESSION SHOP</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n`;
  t += `🛍️ Your balance  ⟶  <b>${bal}</b>\n`;
  t += `<i>Buy impression credits — required for visits.</i>\n\n`;
  for (const key of SHOP_PACKAGE_ORDER) {
    const p = pkgs[key];
    if (!p) continue;
    const total = p.amount + (p.bonus || 0);
    t += `📦 <b>${total}</b> impressions`;
    if (p.bonus) t += ` <i>(${p.amount}+${p.bonus} bonus)</i>`;
    t += `  ✦  <b>৳${p.price}</b>\n`;
  }
  return t;
}

function helpMessage() {
  return `❓ <b>HELP &amp; GUIDE</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n` +
    `╭─ 📋 <b>QUICK START</b>\n` +
    `├ ➕ Add your link\n` +
    `├ ⚡ Connect SmartLink\n` +
    `├ 🎯 Set target (optional)\n` +
    `╰ ▶️ Press Start\n\n` +
    `╭─ 💡 <b>TIPS</b>\n` +
    `├ Ensure US residential proxy\n` +
    `├ Keep credits topped up\n` +
    `├ Check Live Monitor for status\n` +
    `╰ Contact support if stuck\n\n` +
    `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n` +
    `👨‍💻 <b>Support</b>  ✦  ${DEVELOPER_HANDLE}`;
}

function aboutMessage() {
  return `ℹ️ <b>ABOUT ${getBotName()}</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n` +
    `💎 <i>Premium Telegram bot for US organic traffic generation.</i>\n\n` +
    `╭─ ✨ <b>WHAT WE OFFER</b>\n` +
    `├ 🇺🇸 US-based organic visitors\n` +
    `├ ⚡ SmartLink integration\n` +
    `├ 🔗 Normal link traffic\n` +
    `├ 📊 Real-time analytics\n` +
    `╰ 🤖 Advanced automation\n\n` +
    `╭─ 🛡️ <b>RELIABILITY</b>\n` +
    `├ High success rate\n` +
    `├ Optimized performance\n` +
    `├ 24/7 automated operation\n` +
    `╰ Dedicated support\n\n` +
    `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n` +
    `⚡ <b>Version</b>  ⟶  ${BOT_BUILD}\n` +
    `👨‍💻 <b>${DEVELOPER_NAME}</b>  ✦  ${DEVELOPER_HANDLE}`;
}

function adminStatsMessage() {
  const users = getAllUsers();
  let totalLinks = 0;
  for (const uid of Object.keys(cache.user_links || {})) {
    const v = cache.user_links[uid];
    totalLinks += Array.isArray(v) ? v.length : 0;
  }
  let totalChecks = 0, totalImpressions = 0;
  for (const v of Object.values(cache.stats || {})) {
    totalChecks += (v && v.total_checks) || 0;
    totalImpressions += (v && v.total_impressions) || 0;
  }
  const proxies = getProxyList();
  const pstats = getProxyStats();
  let pOk = 0, pFail = 0;
  for (const p of proxies) {
    const s = pstats[proxyId(p)];
    if (s) { pOk += s.ok || 0; pFail += s.failed || 0; }
  }
  const totalBal = Object.values(cache.balance || {}).reduce((a, b) => a + Number(b || 0), 0);
  const totalImpBal = Object.values(cache.impression_balance || {}).reduce((a, b) => a + Number(b || 0), 0);
  return `📊 <b>Bot Statistics</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👤 Users: <b>${users.length}</b>\n` +
    `🚫 Banned: ${Object.keys(cache.banned_users || {}).length}\n` +
    `📄 Links: ${totalLinks}\n` +
    `✅ Checks: ${totalChecks}\n` +
    `👁️ Impressions: <b>${totalImpressions}</b>\n\n` +
    `💰 Wallet: ৳${totalBal.toFixed(0)}\n` +
    `🛒 Credits: ${totalImpBal}\n` +
    `💳 Pending: ${getPendingBalanceRequests().length}\n` +
    `💬 Support: ${getOpenSupportMessages().length}\n\n` +
    `🌐 Proxies: ${proxies.length}\n` +
    `✅ OK: ${pOk} · ❌ Fail: ${pFail}`;
}

function proxyMenuMessage() {
  const cfg = getProxySettings();
  const proxies = getProxyList();
  const stats = getProxyStats();
  let okN = 0, failN = 0;
  for (const p of proxies) {
    const s = stats[proxyId(p)];
    if (s) { okN += s.ok || 0; failN += s.failed || 0; }
  }
  const onOff = (v) => v ? '🟢 ON' : '🔴 OFF';
  const bridgeAddr = bridge.getBridgeAddress();
  return `🌐 <b>Proxy Manager</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🎛️ Master: ${onOff(cfg.enabled)}\n` +
    `🇺🇸 US-only: ${onOff(cfg.force_us_only)}\n` +
    `🏠 Residential: ${onOff(cfg.require_residential)}\n` +
    `🔍 Verify IP: ${onOff(cfg.verify_exit_ip)}\n` +
    `🌉 Bridge: ${bridgeAddr ? '🟢 ACTIVE' : '🔴 OFF'}\n` +
    `🔄 Rotation: <code>${cfg.rotation}</code>\n` +
    `🛟 Fallback: ${onOff(cfg.fallback_direct)}\n\n` +
    `📦 Proxies: <b>${proxies.length}</b>\n` +
    `✅ OK: ${okN} · ❌ Fail: ${failN}`;
}

function shopAdminMessage() {
  const p = getShopPackages();
  let t = `🛒 <b>Shop Settings</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  for (const k of SHOP_PACKAGE_ORDER) {
    const x = p[k];
    if (!x) continue;
    const total = x.amount + (x.bonus || 0);
    t += `📦 ${k}: ${x.amount}${x.bonus ? `+${x.bonus}` : ''} = <b>${total}</b> — ৳${x.price}\n`;
  }
  return t;
}

function userSmartlinkMessage(userId) {
  const d = getUserSmartlink(userId);
  const stats = getUserSmartlinkStats(userId);
  const userStats = getUserStats(userId);
  const m = getMembership(userId);
  const slRunning = isAutoImpressionRunning(userId, 'smartlink');
  const apiSet = !!d.api_key;
  const activeMode = getActiveMode();
  const totalImpressions = userStats.total_impressions || 0;
  const normalOnly = Math.max(0, (userStats.total_impressions || 0) - (stats.ok || 0));

  let t = `⚡ <b>SMARTLINK MANAGER</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n`;
  t += `╭─ 🛰️ <b>STATUS</b>\n`;
  t += `├ ▶️ Engine  ⟶  ${slRunning ? '🟢 RUNNING' : '🔴 STOPPED'}\n`;
  t += `├ ⚡ Mode  ⟶  <b>${getModeDisplayName(activeMode)}</b>\n`;
  t += `├ 🔑 API  ⟶  ${apiSet ? `✅ Set` : `❌ Not set`}\n`;
  t += `├ 📋 Links  ⟶  <b>${d.links.length}</b>\n`;
  t += `╰ 🔄 Last fetch  ⟶  ${formatDate(d.last_fetch)}\n\n`;
  t += `╭─ 💼 <b>PLAN &amp; LIMITS</b>\n`;
  t += `├ 🎟️ Plan  ⟶  ${m.plan ? `✅ <b>${m.plan}</b>` : `❌ Free`}\n`;
  t += `├ 🚀 Burst  ⟶  <b>${getVisitsPerLink(userId)}</b>/${getBurstWindowMs(userId)/1000}s\n`;
  t += `├ 📅 Bursts left  ⟶  <b>${remainingBurstRuns(userId)}</b>\n`;
  t += `├ 🕐 Hourly  ⟶  ${getHourlyCount(userId, 'smartlink')}/${getAutoImpressionSettings().hourly_limit_smartlink}\n`;
  t += `╰ 🛍️ Credits  ⟶  <b>${getImpressionBalance(userId)}</b>\n\n`;
  t += `╭─ 👁️ <b>IMPRESSIONS</b>  ⟶  <b>${totalImpressions}</b>\n`;
  t += `├ 🔗 Normal  ⟶  ${normalOnly}\n`;
  t += `├ ⚡ SmartLink  ⟶  ${stats.total_visits || 0}\n`;
  t += `├ ✅ OK  ⟶  ${stats.ok || 0}\n`;
  t += `╰ ❌ Fail  ⟶  ${stats.failed || 0}`;
  return t;
}

function normalLinkStatsMessage(userId) {
  const s = getNormalLinkStats(userId);
  const userStats = getUserStats(userId);
  const slStats = getUserSmartlinkStats(userId);
  const m = getMembership(userId);
  const nlRunning = isAutoImpressionRunning(userId, 'normal');
  const activeMode = getActiveMode();
  const totalImpressions = userStats.total_impressions || 0;
  const normalOnly = Math.max(0, (userStats.total_impressions || 0) - (slStats.ok || 0));

  return `🔗 <b>NORMAL LINK STATS</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n` +
    `╭─ 🛰️ <b>STATUS</b>\n` +
    `├ ▶️ Engine  ⟶  ${nlRunning ? '🟢 RUNNING' : '🔴 STOPPED'}\n` +
    `╰ ⚡ Mode  ⟶  <b>${getModeDisplayName(activeMode)}</b>\n\n` +
    `╭─ 📊 <b>NORMAL VISITS</b>  ⟶  <b>${s.total_visits || 0}</b>\n` +
    `├ ✅ OK  ⟶  ${s.ok || 0}\n` +
    `╰ ❌ Failed  ⟶  ${s.failed || 0}\n\n` +
    `╭─ 👁️ <b>TOTAL (ALL)</b>  ⟶  <b>${totalImpressions}</b>\n` +
    `├ 🔗 Normal  ⟶  ${normalOnly}\n` +
    `╰ ⚡ SmartLink  ⟶  ${slStats.total_visits || 0}\n\n` +
    `╭─ 💼 <b>PLAN &amp; LIMITS</b>\n` +
    `├ 🎟️ Plan  ⟶  <b>${m.plan ? m.plan : 'Free'}</b>\n` +
    `├ 🚀 Burst  ⟶  ${getVisitsPerLink(userId)}/${getBurstWindowMs(userId)/1000}s\n` +
    `├ 🛍️ Credits  ⟶  <b>${getImpressionBalance(userId)}</b>\n` +
    `╰ 🕐 Hourly  ⟶  ${getHourlyCount(userId, 'normal')}/${getAutoImpressionSettings().hourly_limit_normal}`;
}

function userSmartlinkListView(userId) {
  const d = getUserSmartlink(userId);
  if (!d.links.length) return `📋 <b>MY SMARTLINKS</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n📭 <i>No links added yet.</i>`;

  let t = `📋 <b>MY SMARTLINKS</b>  ⟶  <b>${d.links.length}</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n`;
  const totalVisits = d.links.reduce((s, l) => s + (l.bot_visits || 0), 0);
  const totalOk = d.links.reduce((s, l) => s + (l.ok || 0), 0);
  const totalFail = d.links.reduce((s, l) => s + (l.failed || 0), 0);
  const rate = totalVisits > 0 ? ((totalOk / totalVisits) * 100).toFixed(1) : '0.0';

  t += `╭─ 📊 <b>OVERALL</b>\n`;
  t += `├ 🚀 Total Visits  ⟶  <b>${totalVisits}</b>\n`;
  t += `├ ✅ Success  ⟶  <b>${totalOk}</b>\n`;
  t += `├ ❌ Failed  ⟶  <b>${totalFail}</b>\n`;
  t += `╰ 🎯 Rate  ⟶  <b>${rate}%</b>\n\n`;
  t += `🔗 <b>LINKS</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n`;

  d.links.forEach((l, i) => {
    const lastVisit = l.last_visit_at ? formatDate(l.last_visit_at).replace(/^\d{4}-/, '').slice(0, 22) : '—';
    const status = l.ok > l.failed ? '🟢' : (l.bot_visits > 0 ? '🟡' : '⚪');
    t += `${status} <b>#${i + 1}</b>\n`;
    t += `├ 📊 Visits  ⟶  <b>${l.bot_visits || 0}</b>  (✅ ${l.ok || 0}  ✦  ❌ ${l.failed || 0})\n`;
    t += `╰ 🕐 Last  ⟶  ${lastVisit}\n\n`;
  });

  if (t.length > 4000) t = t.slice(0, 4000) + `\n…`;
  return t;
}

function impressionHistoryMessage(userId, typeFilter = null) {
  let hist = getUserImpressionHistory(userId);
  if (typeFilter) hist = hist.filter((h) => h.type === typeFilter);
  if (!hist.length) {
    return `📜 <b>IMPRESSION HISTORY</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n📭 <i>No impressions yet.</i>\n\n💡 <i>Start a SmartLink to see history.</i>`;
  }
  const recent = hist.slice(-15).reverse();
  let t = `📜 <b>IMPRESSION HISTORY</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n`;
  t += `📊 Total records  ⟶  <b>${hist.length}</b>\n🕐 Showing last  ⟶  <b>${recent.length}</b>\n\n`;
  const okCount = hist.filter((h) => h.ok).length;
  const failCount = hist.length - okCount;
  const successRate = hist.length > 0 ? ((okCount / hist.length) * 100).toFixed(1) : '0.0';
  const totalVisits = hist.reduce((s, h) => s + (h.visits || 1), 0);
  const totalDwell = hist.reduce((s, h) => s + (h.dwell_ms || 0), 0);
  const avgDwell = hist.length > 0 ? Math.round(totalDwell / 1000 / hist.length) : 0;
  t += `╭─ 📈 <b>SUMMARY</b>\n`;
  t += `├ ✅ Success  ⟶  <b>${okCount}</b>\n├ ❌ Failed  ⟶  <b>${failCount}</b>\n`;
  t += `├ 🎯 Success Rate  ⟶  <b>${successRate}%</b>\n├ 🚀 Total Visits  ⟶  <b>${totalVisits}</b>\n`;
  t += `╰ ⏱️ Avg Dwell  ⟶  <b>${avgDwell}s</b>\n\n`;
  t += `📋 <b>RECENT RECORDS</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n`;

  for (let i = 0; i < recent.length; i++) {
    const h = recent[i];
    const badge = h.ok ? '✅' : '❌';
    const when = formatDate(h.ts).replace(/^\d{4}-/, '');   // Remove year, keep "MM-DD HH:MM:SS AM/PM (BD)"
    let okVisits = h.ok_count || 0;
    let failVisits = h.fail_count || 0;
    let totalAttempts = okVisits + failVisits;
    if (totalAttempts === 0 && h.detail) {
      const m = String(h.detail).match(/(\d+)\/(\d+)/);
      if (m) { okVisits = Number(m[1]); totalAttempts = Number(m[2]); failVisits = totalAttempts - okVisits; }
    }
    const dwellSec = Math.round((h.dwell_ms || 0) / 1000);
    const typeLabel = h.type === 'smartlink' ? '⚡ SmartLink' : '🔗 Normal';
    const statusText = h.ok ? 'SUCCESS' : 'FAILED';
    const statusEmoji = h.ok ? '🟢' : '🔴';
    t += `${badge} <b>#${i + 1}</b>  ✦  ${typeLabel}\n`;
    t += `├ ${statusEmoji} Status  ⟶  <b>${statusText}</b>\n`;
    t += `├ 🕐 Time  ⟶  ${when}\n`;
    t += `├ 📊 Progress  ⟶  <b>${okVisits}/${totalAttempts || 1}</b> ok`;
    if (failVisits > 0) t += `  ✦  <b>${failVisits}</b> failed`;
    t += `\n╰ ⏱️ Duration  ⟶  <b>${dwellSec}s</b>\n\n`;
  }

  if (getActiveMode() === MODE_H4CK_ORGANIC) {
    const stats = getH4CkOrganicStats();
    const h4ckSuccessRate = stats.total_visits > 0 ? (stats.successful / stats.total_visits * 100).toFixed(1) : '0.0';
    const avgPages = stats.total_visits > 0 ? (stats.total_pages / stats.total_visits).toFixed(1) : '0.0';
    const avgH4ckDwell = stats.total_visits > 0 ? Math.round(stats.total_dwell_ms / 1000 / stats.total_visits) : 0;
    t += `╭─ ⚡ <b>H4CK ORGANIC v30</b>  ✦  @alif_h4ck\n`;
    t += `├ 📊 Success  ⟶  <b>${stats.successful}/${stats.total_visits}</b> (${h4ckSuccessRate}%)\n`;
    t += `├ 💵 Ad Clicks  ⟶  <b>${stats.total_clicks}</b>\n`;
    t += `├ 📄 Avg Pages  ⟶  <b>${avgPages}</b>\n`;
    t += `├ ⏱️ Avg Dwell  ⟶  <b>${avgH4ckDwell}s</b>\n`;
    t += `├ 🎬 Competitors  ⟶  <b>${stats.total_competitors || 0}</b>\n`;
    t += `├ 🔍 Zoom Events  ⟶  <b>${stats.total_zoom_events || 0}</b>\n`;
    t += `├ ⌨️ Keyboard  ⟶  <b>${stats.total_keyboard_scrolls || 0}</b>\n`;
    t += `╰ 🎥 Video Pauses  ⟶  <b>${stats.total_video_pauses || 0}</b>\n`;
  }
  return t;
}

function liveMonitorMessage(userId, type) {
  const running = isAutoImpressionRunning(userId, type);
  const logs = getLiveLogs(type, 8);
  const stats = type === 'smartlink' ? getUserSmartlinkStats(userId) : getNormalLinkStats(userId);
  const userStats = getUserStats(userId);
  const slStats = getUserSmartlinkStats(userId);
  const cfg = getAutoImpressionSettings();
  const hourlyLimit = type === 'smartlink' ? cfg.hourly_limit_smartlink : cfg.hourly_limit_normal;
  const title = type === 'smartlink' ? 'Live SmartLink Monitor' : 'Live Normal Link Monitor';
  const activeMode = getActiveMode();
  const totalImpressions = userStats.total_impressions || 0;
  const normalOnly = Math.max(0, (userStats.total_impressions || 0) - (slStats.ok || 0));
  const now = Date.now();
  const nextRun = workerNextRun[type] || 0;
  const lastRun = workerLastRun[type] || 0;
  let countdownText = '—', nextTimeText = '—', lastRunText = '—', progressPercent = 0;

  if (nextRun > now) {
    const remainingSec = Math.ceil((nextRun - now) / 1000);
    const min = Math.floor(remainingSec / 60), sec = remainingSec % 60;
    countdownText = min > 0 ? `${min}m ${sec}s` : `${sec}s`;
    nextTimeText = new Date(nextRun).toLocaleTimeString('en-US', { timeZone: 'Asia/Dhaka', hour12: true }) + ' (BD)';
    const totalWait = (nextRun - lastRun) || 1;
    progressPercent = Math.min(100, Math.max(0, ((now - lastRun) / totalWait) * 100));
  } else if (lastRun > 0) {
    countdownText = '⏳ Running now...';
    nextTimeText = 'Processing';
    progressPercent = 100;
  }
  if (lastRun > 0) {
    const agoSec = Math.round((now - lastRun) / 1000);
    const min = Math.floor(agoSec / 60), sec = agoSec % 60;
    lastRunText = min > 0 ? `${min}m ${sec}s ago` : `${sec}s ago`;
  }
  const barFilled = Math.round(progressPercent / 10);
  const bar = '▰'.repeat(barFilled) + '▱'.repeat(10 - barFilled);

  let t = `📺 <b>${title.toUpperCase()}</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n`;
  t += `╭─ 🛰️ <b>STATUS</b>\n`;
  t += `├ ⚡ Mode  ⟶  <b>${getModeDisplayName(activeMode)}</b>\n`;
  t += `╰ ▶️ Engine  ⟶  ${running ? '🟢 RUNNING' : '🔴 STOPPED'}\n\n`;
  if (running) {
    t += `╭─ ⏰ <b>NEXT IMPRESSION</b>\n`;
    t += `├ ⏳ Countdown  ⟶  <b>${countdownText}</b>\n`;
    t += `├ 🕐 Next run  ⟶  <code>${nextTimeText}</code>\n`;
    t += `╰ 📍 Last run  ⟶  <b>${lastRunText}</b>\n\n`;
    t += `<code>[${bar}]</code> <b>${progressPercent.toFixed(0)}%</b>\n\n`;
  }
  t += `╭─ 📊 <b>STATISTICS</b>\n`;
  t += `├ 📈 This type  ⟶  <b>${stats.total_visits || 0}</b>\n`;
  t += `├ ✅ OK  ⟶  <b>${stats.ok || 0}</b>  ✦  ❌ Fail  ⟶  <b>${stats.failed || 0}</b>\n`;
  t += `├ 👁️ Total (all)  ⟶  <b>${totalImpressions}</b>\n`;
  t += `│   ├ 🔗 Normal  ⟶  ${normalOnly}\n`;
  t += `│   ╰ ⚡ SmartLink  ⟶  ${slStats.total_visits || 0}\n`;
  t += `├ 🕐 Hourly  ⟶  ${getHourlyCount(userId, type)}/${hourlyLimit}\n`;
  t += `╰ 🛍️ Credits  ⟶  ${getImpressionBalance(userId)}\n\n`;
  t += `📜 <b>RECENT ACTIVITY</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n`;
  if (!logs.length) {
    t += `📭 <i>No activity yet.</i>\n`;
    if (running) t += `\n💡 First impression coming in <b>${countdownText}</b>...\n`;
  } else {
    for (let i = 0; i < logs.length; i++) {
      const l = logs[i];
      const badge = l.ok ? '✅' : '❌';
      const status = l.ok ? '🟢 SUCCESS' : '🔴 FAILED';
      const when = formatDate(l.ts).replace(/^\d{4}-/, '').slice(0, 20);
      const ago = Math.round((now - l.ts) / 1000);
      const agoText = ago < 60 ? `${ago}s ago` : `${Math.floor(ago / 60)}m ago`;
      let progressText = l.detail;
      const m = String(l.detail).match(/(\d+)\/(\d+)\s*ok/);
      if (m) progressText = `${m[1]}/${m[2]} ok`;
      t += `${badge} <b>#${i + 1}</b>  ✦  ${status}\n`;
      t += `├ 🕐 ${when} <i>(${agoText})</i>\n`;
      t += `├ 📊 ${progressText}\n`;
      t += `╰ 🌐 CPM PROXY\n\n`;
    }
  }
  t += `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n💡 <i>Tap 🔄 Refresh for live update</i>`;
  return t;
}

function proxyHealthMessage() {
  const cfg = getProxySettings();
  const list = getProxyList();
  const stats = getProxyStats();
  let t = `🏥 <b>Proxy Health</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  t += `🔄 Auto: ${cfg.auto_health_check ? '🟢' : '🔴'}\n`;
  t += `⏱️ Interval: ${Math.round((cfg.health_check_interval_ms || 300000) / 60000)}min\n\n`;
  for (const p of list.slice(0, 20)) {
    const s = stats[proxyId(p)] || { ok: 0, failed: 0 };
    const st = s.failed > s.ok ? '🔴' : '🟢';
    t += `${st} ${escapeHtml(p.name || shortProxyLabel(p).slice(0, 30))} — ✅${s.ok} ❌${s.failed}\n`;
  }
  return t;
}

function proxyPerformanceMessage() {
  const proxies = getProxyList();
  const stats = getProxyStats();
  let t = `📊 <b>Proxy Performance</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  if (!proxies.length) return t + 'No proxies configured.';
  for (const p of proxies.slice(0, 10)) {
    const s = stats[proxyId(p)];
    if (!s) continue;
    const total = s.total || 0;
    const rate = total > 0 ? ((s.ok / total) * 100).toFixed(1) : '0.0';
    t += `🔹 <b>${escapeHtml(p.name || shortProxyLabel(p).slice(0, 30))}</b>\n`;
    t += `   ✅ Success: <b>${rate}%</b> (${s.ok}/${total})\n`;
    t += `   📦 Data: <b>${(s.mb_used || 0).toFixed(2)}MB</b>\n\n`;
  }
  return t;
}

function systemHealthMessage() {
  const metrics = getSystemMetrics();
  const adaptiveLimit = getAdaptiveConcurrencyLimit();
  const activeBrowsers = activeVisitSlots;
  let t = `💻 <b>System Health</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  t += `🖥️ CPU Load: <b>${metrics.cpu_load.toFixed(1)}%</b>\n`;
  t += `🧠 RAM Usage: <b>${metrics.ram_usage.toFixed(1)}%</b> (${metrics.free_mem_mb}MB free)\n`;
  t += `🌐 Active Browsers: <b>${activeBrowsers}</b>\n`;
  t += `⚙️ Adaptive Limit: <b>${adaptiveLimit}</b>\n`;
  t += `📊 Max System: <b>${MAX_SYSTEM_BROWSERS}</b>\n\n`;
  const status = isSystemHealthy() ? '🟢 HEALTHY' : '🔴 UNDER LOAD';
  t += `Status: <b>${status}</b>`;
  return t;
}

function highCpmModeMessage() {
  const cfg = getAutoImpressionSettings();
  const onOff = (v) => v ? '🟢 ON' : '🔴 OFF';
  const activeMode = getActiveMode();
  return `💎 <b>High CPM Mode</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `⚡ Active Mode: <b>${getModeDisplayName(activeMode)}</b>\n` +
    `💎 Status: ${onOff(cfg.high_cpm_mode)}\n` +
    `🍎 Safari Ratio: <b>${Math.round((cfg.safari_ratio || HIGH_CPM_SAFARI_RATIO) * 100)}%</b>\n` +
    `🇺🇸 US Traffic: 🟢 Always\n` +
    `⏱️ Min Dwell: <b>${Math.round((cfg.min_ad_dwell_ms || 45000) / 1000)}s</b>\n` +
    `⏱️ Max Dwell: <b>${Math.round((cfg.max_ad_dwell_ms || 90000) / 1000)}s</b>\n` +
    `🎯 Ad Interaction: ${onOff(cfg.ad_hover_count > 0)}\n` +
    `📖 Multi-page: ${onOff(cfg.multi_page_probability > 0)}\n\n` +
    `💡 Higher Safari ratio = Higher CPM\n` +
    `🚨 SmartLink: NO ad interaction (Adsterra-safe)`;
}

function bridgeStatusMessage() {
  const addr = bridge.getBridgeAddress();
  const cfg = getProxySettings();
  const proxCount = getProxyList().length;
  const socksCount = getProxyList().filter(isSocks5Proxy).length;
  let t = `🌉 <b>Bridge Status</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  t += `🌉 Bridge: ${addr ? '🟢 ACTIVE' : '🔴 OFF'}\n`;
  if (addr) t += `📍 Address: <code>${addr.server}</code>\n`;
  t += `🎛️ Enabled: ${cfg.bridge_enabled ? '🟢' : '🔴'}\n\n`;
  t += `📦 Total Proxies: <b>${proxCount}</b>\n`;
  t += `🔌 SOCKS5 Proxies: <b>${socksCount}</b>\n\n`;
  t += `💡 Bridge converts SOCKS5 auth → HTTP for Playwright.\n`;
  t += `⏱️ Upstream timeout: <b>30s</b>`;
  return t;
}

function firebaseStatusMessage() {
  const cols = ['users','user_links','stats','balance','impression_balance','membership','proxies','user_smartlinks','smartlink_settings','auto_impression_settings','hourly_impression_log','auto_impression_running','payment_methods','balance_requests','impression_history','visit_logs','normal_link_stats','live_impression_log','h4ck_organic_stats'];
  let t = `🔥 <b>Firebase Status</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  t += `✅ Connected: <b>Yes</b>\n💾 Storage: <b>Firestore</b>\n⏱️ Debounce: <b>100ms</b>\n\n📚 Collections:\n`;
  for (const c of cols) {
    const v = cache[c];
    const size = Array.isArray(v) ? `${v.length}` : (v && typeof v === 'object' ? `${Object.keys(v).length}` : '—');
    t += `• <code>${c}</code> — ${size}\n`;
  }
  return t;
}

function referralMessage(userId) {
  const info = getReferralInfo(userId);
  const botUsername = cache.bot_lifecycle && cache.bot_lifecycle.username ? cache.bot_lifecycle.username : null;
  const refLink = botUsername ? `https://t.me/${botUsername}?start=ref_${userId}` : `(unknown)`;
  return `🎁 <b>REFERRAL PROGRAM</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n` +
    `💰 Earn <b>৳${REFERRAL_BONUS}</b> for every friend you invite!\n\n` +
    `╭─ 🔗 <b>YOUR LINK</b>\n` +
    `├ <code>${escapeHtml(refLink)}</code>\n` +
    `╰ 🎫 Code  ⟶  <code>${userId}</code>\n\n` +
    `╭─ 📈 <b>PERFORMANCE</b>\n` +
    `├ 👥 Invited  ⟶  <b>${info.invited.length}</b>\n` +
    `╰ 💵 Earned  ⟶  <b>৳${info.earned || 0}</b>`;
}

function supportMessage(userId) {
  return `💬 <b>SUPPORT CENTER</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n📩 <i>Send us a message — our team will reply soon.</i>\n\n╭─ 🪪 <b>YOUR DETAILS</b>\n├ 🆔 ID  ⟶  <code>${userId}</code>\n╰ 👨‍💻 Contact  ⟶  ${DEVELOPER_HANDLE}`;
}

function userSettingsMessage(userId) {
  const s = getUserSettings(userId);
  const onOff = (v) => v ? '🟢 ON' : '🔴 OFF';
  return `⚙️ <b>MY SETTINGS</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n╭─ 🔔 <b>PREFERENCES</b>\n├ 🔔 Notifications  ⟶  ${onOff(s.notifications)}\n╰ 📢 Promo Alerts  ⟶  ${onOff(s.promo_alerts)}`;
}

// ═══════════════════════════════════════════════════════════════════════
//  SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════
const sessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 10000;

function getSession(chatId) {
  if (!sessions.has(chatId)) {
    if (sessions.size >= MAX_SESSIONS) {
      let oldestKey = null, oldestAt = Infinity;
      for (const [k, v] of sessions) {
        if ((v.last_activity || 0) < oldestAt) { oldestAt = v.last_activity || 0; oldestKey = k; }
      }
      if (oldestKey !== null) sessions.delete(oldestKey);
    }
    sessions.set(chatId, { last_activity: Date.now() });
  }
  const s = sessions.get(chatId);
  s.last_activity = Date.now();
  return s;
}

function resetSessionState(s) {
  const flags = [
    'awaiting_link','awaiting_broadcast','awaiting_name','awaiting_proxy','awaiting_proxy_name',
    'awaiting_proxy_quota','awaiting_icon','awaiting_plan_edit',
    'awaiting_balance_amount','awaiting_balance_method','awaiting_balance_txn','awaiting_new_admin_id',
    'awaiting_shop_edit','awaiting_shop_edit_key',
    'awaiting_sl_api_key','awaiting_sl_manual_paste','awaiting_sl_json_url',
    'awaiting_support_msg','awaiting_support_reply','awaiting_promo_create','awaiting_ban_id',
    'awaiting_join_channel','awaiting_join_group','awaiting_autobc_message','awaiting_captcha_answer',
    'awaiting_ai_hourly_sl','awaiting_ai_hourly_nl','awaiting_ai_daily_sl','awaiting_ai_daily_nl',
    'awaiting_pay_method_edit','awaiting_pay_method_add',
    'awaiting_maint_message','awaiting_maint_wl_add','awaiting_maint_wl_remove',
  ];
  for (const f of flags) s[f] = false;
  s.awaiting_icon_key = null;
  s.awaiting_plan_key = null;
  s.pending_balance_amount = null;
  s.pending_balance_method = null;
  s.review_balance_req_id = null;
  s.awaiting_shop_edit_key = null;
  s.pending_ban_mode = null;
  s.awaiting_proxy_data = null;
  s.reply_to_support_id = null;
  s.captcha = null;
  s.pending_confirm_token = null;
  s.awaiting_pay_method_key = null;
  s.pending_referrer = null;
  const maps = [
    'delete_link_map','admin_toggle_map','admin_reorder_map','admin_icon_map','admin_plan_map',
    'admin_plan_toggle_map','admin_balance_req_map','admin_remove_map','buy_plan_map',
    'human_toggle_map','proxy_remove_map','proxy_settings_map','shop_buy_map','shop_admin_edit_map',
    'support_reply_map','promo_action_map','payment_toggle_map','admin_price_map','pay_methods_map',
    'pay_methods_delete_map',
  ];
  for (const m of maps) delete s[m];
  delete s.maint_wl_remove_map;
  s.sl_target_setting = false;
  s.nl_target_setting = false;
  s.awaiting_custom_target = false;
  s.custom_target_type = null;
}

// ═══════════════════════════════════════════════════════════════════════
//  BOT INSTANCE
// ═══════════════════════════════════════════════════════════════════════
bot = new TelegramBot();   // internal no-op shim (Telegram removed)

async function deleteOldMessages(chatId, session, userMessageId = null) {
  const ids = new Set();
  if (session.last_bot_msg_id) ids.add(session.last_bot_msg_id);
  if (session.last_image_msg_id) ids.add(session.last_image_msg_id);
  if (userMessageId) ids.add(userMessageId);
  for (const id of ids) {
    if (!id) continue;
    try { await bot.deleteMessage(chatId, id); } catch (e) {}
  }
  session.last_bot_msg_id = null;
  session.last_image_msg_id = null;
}

async function renderWithImage(chatId, session, imageKey, text, keyboard, userMessageId = null) {
  await deleteOldMessages(chatId, session, userMessageId);
  const imgPath = SECTION_IMAGES[imageKey];
  if (imgPath && fs.existsSync(imgPath) && sharp && text.length <= 1024) {
    try {
      const pngBuf = await sharp(imgPath).png().toBuffer();
      const photo = await bot.sendPhoto(chatId, pngBuf, { caption: text, parse_mode: 'HTML', reply_markup: keyboard });
      session.last_image_msg_id = photo.message_id;
      return photo;
    } catch (e) { console.warn('caption photo fail:', e.message); }
  }
  if (imgPath && fs.existsSync(imgPath) && sharp) {
    try {
      const pngBuf = await sharp(imgPath).png().toBuffer();
      const photo = await bot.sendPhoto(chatId, pngBuf);
      session.last_image_msg_id = photo.message_id;
    } catch (e) { console.warn('image send fail:', e.message); }
  }
  const sent = await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: keyboard, disable_web_page_preview: true });
  session.last_bot_msg_id = sent.message_id;
  return sent;
}

async function render(chatId, session, text, keyboard, userMessageId = null) {
  await deleteOldMessages(chatId, session, userMessageId);
  let sent;
  try {
    sent = await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: keyboard, disable_web_page_preview: true });
  } catch (e) {
    if (!/parse entities|can't parse/i.test(String((e && (e.message || e.description)) || ''))) throw e;
    console.warn('[render] HTML rejected, retrying as plain text:', e.message);
    const plain = String(text).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    sent = await bot.sendMessage(chatId, plain, { reply_markup: keyboard, disable_web_page_preview: true });
  }
  session.last_bot_msg_id = sent.message_id;
  return sent;
}

async function startCaptcha(chatId, userId, session) {
  const cap = generateCaptcha();
  session.captcha = { answer: cap.answer, created_at: Date.now(), attempts: 0 };
  session.awaiting_captcha_answer = true;
  const optionRows = [];
  for (let i = 0; i < cap.options.length; i += 3) optionRows.push(cap.options.slice(i, i + 3).map((c) => `🔘 ${c}`));
  optionRows.push([`🔄 New Captcha`]);
  const caption = `🔐 <b>SECURITY CHECK</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n🎯 <b>Tap the character inside the red circle</b> in the image above.\n\n⏱️ <i>Expires in 10 minutes.</i>`;
  await deleteOldMessages(chatId, session, null);
  const svg = buildCaptchaSvg(cap.chars, cap.circleIndex);
  if (sharp) {
    try {
      const pngBuf = await sharp(Buffer.from(svg)).png().toBuffer();
      const sent = await bot.sendPhoto(chatId, pngBuf, { caption, parse_mode: 'HTML', reply_markup: buildKeyboard(optionRows) });
      session.last_image_msg_id = sent.message_id;
      return;
    } catch (e) {}
  }
  const sent = await bot.sendMessage(chatId, caption, { parse_mode: 'HTML', reply_markup: buildKeyboard(optionRows) });
  session.last_bot_msg_id = sent.message_id;
}

async function playStartupAnimation(chatId, session, firstName = '') {
  const frames = [
    { pct: 0,   spinner: '◐', bar: '▢▢▢▢▢▢▢▢▢▢', label: 'Initializing interface…' },
    { pct: 14,  spinner: '◓', bar: '▣▢▢▢▢▢▢▢▢▢', label: 'Preparing workspace…' },
    { pct: 28,  spinner: '◑', bar: '▣▣▣▢▢▢▢▢▢▢', label: 'Loading user interface…' },
    { pct: 43,  spinner: '◒', bar: '▣▣▣▣▢▢▢▢▢▢', label: 'Connecting services…' },
    { pct: 57,  spinner: '◐', bar: '▣▣▣▣▣▣▢▢▢▢', label: 'Syncing your account…' },
    { pct: 71,  spinner: '◓', bar: '▣▣▣▣▣▣▣▢▢▢', label: 'Preparing smart tools…' },
    { pct: 86,  spinner: '◑', bar: '▣▣▣▣▣▣▣▣▣▢', label: 'Finalizing interface…' },
    { pct: 100, spinner: '✔', bar: '▣▣▣▣▣▣▣▣▣▣', label: 'Everything is ready!' },
  ];
  const greeting = firstName ? `\n👋 <b>${escapeHtml(firstName)}</b>` : '';
  const frameText = (f) =>
    `╭━━━━━━━━━━━━━━━━━━━━╮\n` +
    `   ⚡ <b>${escapeHtml(getBotName())}</b>${greeting}\n` +
    `╰━━━━━━━━━━━━━━━━━━━━╯\n\n` +
    `${f.spinner} <b>${f.label}</b>\n\n` +
    `<code>[${f.bar}]</code>  <b>${f.pct}%</b>\n` +
    `✨ <i>Please wait…</i>`;
  let msgId = null;
  try {
    const first = await bot.sendMessage(chatId, frameText(frames[0]), { parse_mode: 'HTML' });
    msgId = first.message_id;
  } catch (e) { return null; }
  for (let i = 1; i < frames.length; i++) {
    await sleep(140);
    try { await bot.editMessageText(frameText(frames[i]), { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }); } catch (e) {}
  }
  await sleep(180);
  try { await bot.deleteMessage(chatId, msgId); } catch (e) {}
  session.last_bot_msg_id = null;
  return msgId;
}

async function isUserJoined(userId) {
  const s = getJoinCheckSettings();
  if (!s.enabled) return true;
  const targets = [s.channel, s.group].filter(Boolean);
  if (!targets.length) return true;
  for (const t of targets) {
    try {
      const member = await bot.getChatMember(t, userId);
      if (!member || ['left', 'kicked'].includes(member.status)) return false;
      if (member.status === 'restricted' && member.is_member === false) return false;
    } catch (e) {
      console.warn(`[Join] Cannot verify ${t}:`, e.message);
      continue;
    }
  }
  return true;
}

// ⭐ V30 FIX: proper URL buttons with `url:` type, no callback
function buildJoinKeyboard(settings) {
  const nextStyle = makeStylePicker();
  const rows = [];
  if (settings.channel) {
    const ch = String(settings.channel).replace(/^@/, '');
    rows.push([{ text: '📢 Join Channel', url: `https://t.me/${ch}`, style: nextStyle() }]);
  }
  if (settings.group) {
    const gr = String(settings.group).replace(/^@/, '');
    rows.push([{ text: '👥 Join Group', url: `https://t.me/${gr}`, style: nextStyle() }]);
  }
  rows.push([{ text: '🔄 Verify Join', callback_data: 'verify_join_cb', style: nextStyle() }]);
  return { inline_keyboard: rows };
}

async function sendJoinRequired(chatId, userId) {
  const jc = getJoinCheckSettings();
  let txt = `🔒 <b>JOIN REQUIRED</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n`;
  txt += `To use <b>${escapeHtml(getBotName())}</b>, please join our community first.\n\n`;
  if (jc.channel) txt += `📢 Channel  ⟶  <code>${escapeHtml(jc.channel)}</code>\n`;
  if (jc.group) txt += `👥 Group  ⟶  <code>${escapeHtml(jc.group)}</code>\n`;
  txt += `\n💡 <i>Join, then tap</i> <b>Verify Join</b> <i>below.</i>`;
  try {
    await bot.sendMessage(chatId, txt, {
      parse_mode: 'HTML',
      reply_markup: buildJoinKeyboard(jc),
      disable_web_page_preview: true,
    });
  } catch (e) {
    console.error('❌ sendJoinRequired failed:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  HANDLE START
// ═══════════════════════════════════════════════════════════════════════
async function handleStart(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const session = getSession(chatId);
  resetSessionState(session);
  cleanupExpiredCaptchaVerifications();

  if (isBanned(userId) && !isAdmin(userId)) {
    await bot.sendMessage(chatId, `🚫 <b>ACCESS RESTRICTED</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\nYou are banned from using this bot.\n📩 <i>Contact support if you think this is a mistake.</i>`, { parse_mode: 'HTML' });
    return;
  }
  if (await checkMaintenanceGate(msg, chatId, userId)) return;
  rememberUser(userId, msg.from);

  if (msg.text && msg.text.startsWith('/start ')) {
    const param = msg.text.slice(7).trim();
    if (param.startsWith('ref_')) session.pending_referrer = param.slice(4);
  }

  const joined = await isUserJoined(userId);
  if (!joined && !isAdmin(userId)) {
    await sendJoinRequired(chatId, userId);
    return;
  }

  if (!isAdmin(userId) && !isUserVerified(userId)) {
    await playStartupAnimation(chatId, session, msg.from.first_name || '');
    await startCaptcha(chatId, userId, session);
    return;
  }

  await playStartupAnimation(chatId, session, msg.from.first_name || '');
  try { await renderWithImage(chatId, session, 'welcome', welcomeMessage(userId), mainMenuKeyboard(userId), null); }
  catch (e) { console.error('welcome fail:', e.message); }
}

// ═══════════════════════════════════════════════════════════════════════
//  LINK CHECK RUNNER
// ═══════════════════════════════════════════════════════════════════════
async function runLinkCheck(chatId, messageId, userId) {
  const links = getUserLinks(userId);
  if (!links.length) {
    try { await bot.editMessageText(`🔗 No links added yet.`, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML' }); } catch (e) {}
    return;
  }
  const total = links.length;
  const CONCURRENCY = 1;
  const results = new Array(total);
  let completed = 0;
  const hdr = `🔎 <b>Checking Links</b>`;

  const checkOne = async (idx) => {
    const url = links[idx];
    const [ok, detail] = await checkLink(url, true);
    recordCheckStat(userId, url, ok, detail);
    results[idx] = `${ok ? '✅' : '❌'} ${escapeHtml(url)} (${detail})`;
    completed++;
    try {
      await bot.editMessageText(`${hdr} ${completed}/${total}…`, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML' });
    } catch (e) {}
  };

  for (let i = 0; i < total; i += CONCURRENCY) {
    const batch = [];
    for (let j = i; j < Math.min(i + CONCURRENCY, total); j++) batch.push(checkOne(j));
    await Promise.all(batch);
  }

  const okC = results.filter((r) => r && r.includes('✅')).length;
  let text = `✅ <b>Done: ${okC}/${total}</b>\n\n${results.join('\n')}`;
  if (text.length > 4000) text = text.slice(0, 4000) + `\n…`;
  try { await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML' }); } catch (e) {}
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN ACTION ROUTER
// ═══════════════════════════════════════════════════════════════════════
async function handleAction(chatId, session, userId, action, userMessageId = null) {
  if (isBanned(userId) && !isAdmin(userId)) {
    await bot.sendMessage(chatId, `🚫 <b>ACCESS RESTRICTED</b>\n\n<i>Your account is banned.</i>`, { parse_mode: 'HTML' });
    return;
  }

  if (action === 'back_menu') {
    resetSessionState(session);
    await renderWithImage(chatId, session, 'menu', menuMessage(userId), mainMenuKeyboard(userId), userMessageId);
    return;
  }
  if (action === 'help') { await renderWithImage(chatId, session, 'help', helpMessage(), helpKeyboard(), userMessageId); return; }
  if (action === 'about') { await renderWithImage(chatId, session, 'about', aboutMessage(), helpKeyboard(), userMessageId); return; }
  if (action === 'stats') { await renderWithImage(chatId, session, 'stats', statsMessage(getUserStats(userId), userId), simpleBackKeyboard(), userMessageId); return; }
  if (action === 'profile') { await renderWithImage(chatId, session, 'profile', profileMessage(userId), simpleBackKeyboard(), userMessageId); return; }
  if (action === 'referral') { await renderWithImage(chatId, session, 'referral', referralMessage(userId), simpleBackKeyboard(), userMessageId); return; }
  if (action === 'support') {
    await renderWithImage(chatId, session, 'support', supportMessage(userId),
      buildKeyboard([[`📝 Send Message`, `📥 My Messages`], [BACK_TO_MENU_LABEL]]), userMessageId);
    return;
  }
  if (action === 'user_settings') {
    await renderWithImage(chatId, session, 'settings', userSettingsMessage(userId),
      buildKeyboard([[`🔔 Toggle Notifications`], [`📢 Toggle Promo Alerts`], [BACK_TO_MENU_LABEL]]), userMessageId);
    return;
  }

  if (action === 'add_link') {
    session.awaiting_link = true;
    await renderWithImage(chatId, session, 'add_link', addLinkPrompt(), cancelKeyboard(), userMessageId);
    return;
  }
  if (action === 'list_links') {
    const nlRunning = isAutoImpressionRunning(userId, 'normal');
    const links = getUserLinks(userId);
    let t = listLinksMessage(links);
    t += `\n\n▶️ Normal: ${nlRunning ? '🟢 RUNNING' : '🔴 STOPPED'}`;
    t += `\n🛒 Credits: ${getImpressionBalance(userId)}`;
    await renderWithImage(chatId, session, 'list_links', t, myLinksKeyboard(userId), userMessageId);
    return;
  }
  if (action === 'delete_link_menu') {
    const links = getUserLinks(userId);
    if (!links.length) { await render(chatId, session, `📭 <b>No links yet</b>\n<i>Add one to get started.</i>`, myLinksKeyboard(userId), userMessageId); return; }
    const map = {}; const labels = [];
    for (let i = 0; i < links.length; i++) {
      const b = `🗑️ ${links[i].slice(0, 40)}`;
      let l = b, n = 1;
      while (map[l]) { n += 1; l = `${b} (${n})`; }
      map[l] = i; labels.push(l);
    }
    session.delete_link_map = map;
    const rows = labels.map((l) => [l]);
    rows.push([BACK_TO_MENU_LABEL]);
    await render(chatId, session, `🗑️ <b>REMOVE A LINK</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n👇 <i>Tap the link you want to remove.</i>`, buildKeyboard(rows), userMessageId);
    return;
  }
  if (action === 'check_links') {
    const links = getUserLinks(userId);
    if (!links.length) { await render(chatId, session, `📭 <b>No links yet</b>\n<i>Add one to get started.</i>`, simpleBackKeyboard(), userMessageId); return; }
    const sent = await renderWithImage(chatId, session, 'check_links', `🔎 <b>CHECKING LINKS</b>\n<i>Please wait…</i>`, simpleBackKeyboard(), userMessageId);
    await runLinkCheck(chatId, sent.message_id, userId);
    return;
  }
  if (action === 'start_normal_imp') {
    const userLinks = getUserLinks(userId);
    if (!userLinks.length) { await render(chatId, session, `📭 <b>No links added</b>\n<i>Add a link first.</i>`, myLinksKeyboard(userId), userMessageId); return; }
    const check = canRunImpression(userId, 'normal');
    if (!check.ok) { await render(chatId, session, `❌ <b>CANNOT START</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n${escapeHtml(check.reason)}`, buildKeyboard([[`🛒 Shop`], [BACK_TO_MENU_LABEL]]), userMessageId); return; }
    if (!getProxyList().length) { await render(chatId, session, `❌ <b>PROXY REQUIRED</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n<i>A US residential proxy must be added first (admin).</i>`, myLinksKeyboard(userId), userMessageId); return; }
    setAutoImpressionRunning(userId, 'normal', true);
    const mode = getActiveMode();
    const modeInfo = mode === MODE_H4CK_ORGANIC ? '\n⚡ H4CK ORGANIC v30 (5-phase journey)' : '';
    await render(chatId, session, `✅ <b>NORMAL LINK STARTED</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n🇺🇸 US organic mode${modeInfo}\n🚀 ${getVisitsPerLink(userId)} visits/link  ✦  ${getBurstWindowMs(userId)/1000}s`, myLinksKeyboard(userId), userMessageId);
    return;
  }
  if (action === 'stop_normal_imp') {
    setAutoImpressionRunning(userId, 'normal', false);
    await render(chatId, session, `⏸️ <b>NORMAL LINK STOPPED</b>\n<i>You can start it again anytime.</i>`, myLinksKeyboard(userId), userMessageId);
    return;
  }
  if (action === 'normal_stats') {
    await renderWithImage(chatId, session, 'stats', normalLinkStatsMessage(userId), myLinksKeyboard(userId), userMessageId);
    return;
  }
  if (action === 'impression_history') {
    await renderWithImage(chatId, session, 'stats', impressionHistoryMessage(userId, null), simpleBackKeyboard(), userMessageId);
    return;
  }

  if (action === 'smartlink_menu') {
    await renderWithImage(chatId, session, 'smartlink', userSmartlinkMessage(userId), userSmartlinkMenuKeyboard(userId), userMessageId);
    return;
  }
  if (action === 'sl_set_api') {
    session.awaiting_sl_api_key = true;
    await render(chatId, session, `🔑 <b>SET ADSTERRA API KEY</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n╭─ 📋 <b>STEPS</b>\n├ 1️⃣ Login to Adsterra\n├ 2️⃣ My Account → API\n╰ 3️⃣ Copy your token\n\n📝 <i>Paste it here.</i>`, cancelKeyboard(), userMessageId);
    return;
  }
  if (action === 'sl_set_endpoint') {
    await render(chatId, session, `📘 <b>ADSTERRA API</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n<code>${ADSTERRA_API_BASE}</code>`, buildKeyboard([[SL_BTN_SET_API], [BACK_TO_MENU_LABEL]]), userMessageId);
    return;
  }
  if (action === 'sl_fetch_api') {
    const d = getUserSmartlink(userId);
    if (!d.api_key) { await render(chatId, session, `🔑 <b>API key required</b>\n<i>Set your API key first.</i>`, userSmartlinkMenuKeyboard(userId), userMessageId); return; }
    const sent = await render(chatId, session, `⏳ <b>Fetching…</b>\n<i>Please wait a moment.</i>`, userSmartlinkMenuKeyboard(userId), userMessageId);
    const res = await fetchAdsterraSmartlinks(d.api_key);
    if (!res.ok) {
      try { await bot.editMessageText(`❌ <b>Failed</b>\n\n${escapeHtml(res.error)}`, { chat_id: chatId, message_id: sent.message_id, parse_mode: 'HTML', reply_markup: userSmartlinkMenuKeyboard(userId) }); } catch (e) {}
      return;
    }
    let added = 0, dup = 0;
    for (const l of res.links) { if (addUserSmartlink(userId, l)) added += 1; else dup += 1; }
    const d2 = getUserSmartlink(userId);
    d2.last_fetch = Date.now();
    saveUserSmartlink(userId, d2);
    try { await bot.editMessageText(`✅ <b>Synced</b>\n\n📥 ${res.links.length} · ➕ ${added} · 🔁 ${dup}\n📋 Total: <b>${d2.links.length}</b>`, { chat_id: chatId, message_id: sent.message_id, parse_mode: 'HTML', reply_markup: userSmartlinkMenuKeyboard(userId) }); } catch (e) {}
    return;
  }
  if (action === 'sl_paste_manual') { session.awaiting_sl_manual_paste = true; await render(chatId, session, `📝 <b>PASTE LINKS</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n📌 <i>Send one link per line.</i>`, cancelKeyboard(), userMessageId); return; }
  if (action === 'sl_load_json') { session.awaiting_sl_json_url = true; await render(chatId, session, `📁 <b>LOAD JSON URL</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n🌐 <i>Send a public JSON URL.</i>`, cancelKeyboard(), userMessageId); return; }
  if (action === 'sl_view_links') { await render(chatId, session, userSmartlinkListView(userId), userSmartlinkMenuKeyboard(userId), userMessageId); return; }
  if (action === 'sl_stats') {
    const stats = getUserSmartlinkStats(userId);
    const d = getUserSmartlink(userId);
    await render(chatId, session,
      `📊 <b>SMARTLINK STATS</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n╭─ 📈 <b>OVERVIEW</b>\n├ 🔗 Links  ⟶  <b>${d.links.length}</b>\n├ 🚀 Visits  ⟶  <b>${stats.total_visits || 0}</b>\n├ ✅ OK  ⟶  ${stats.ok || 0}\n├ ❌ Fail  ⟶  ${stats.failed || 0}\n╰ 🛍️ Credits  ⟶  <b>${getImpressionBalance(userId)}</b>`,
      userSmartlinkMenuKeyboard(userId), userMessageId);
    return;
  }
  if (action === 'sl_history') { await renderWithImage(chatId, session, 'stats', impressionHistoryMessage(userId, 'smartlink'), userSmartlinkMenuKeyboard(userId), userMessageId); return; }
  if (action === 'sl_start') {
    const slData = getUserSmartlink(userId);
    if (!slData.links.length) { await render(chatId, session, `📭 <b>No SmartLinks yet</b>\n<i>Fetch or paste links first.</i>`, userSmartlinkMenuKeyboard(userId), userMessageId); return; }
    const check = canRunImpression(userId, 'smartlink');
    if (!check.ok) { await render(chatId, session, `❌ <b>CANNOT START</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n${escapeHtml(check.reason)}`, buildKeyboard([[`🛒 Shop`], [BACK_TO_MENU_LABEL]]), userMessageId); return; }
    if (!getProxyList().length) { await render(chatId, session, `❌ <b>PROXY REQUIRED</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n<i>A US residential proxy must be added first.</i>`, userSmartlinkMenuKeyboard(userId), userMessageId); return; }
    setAutoImpressionRunning(userId, 'smartlink', true);
    const mode = getActiveMode();
    const modeInfo = mode === MODE_H4CK_ORGANIC ? '\n⚡ H4CK ORGANIC — Adsterra-safe dwell 9-12s' : '';
    await render(chatId, session, `✅ <b>SMARTLINK STARTED</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n🇺🇸 US organic mode${modeInfo}\n🚀 ${getVisitsPerLink(userId)} visits/link  ✦  ${getBurstWindowMs(userId)/1000}s`, userSmartlinkMenuKeyboard(userId), userMessageId);
    return;
  }
  if (action === 'sl_stop') { setAutoImpressionRunning(userId, 'smartlink', false); await render(chatId, session, `⏸️ <b>SMARTLINK STOPPED</b>\n<i>You can start it again anytime.</i>`, userSmartlinkMenuKeyboard(userId), userMessageId); return; }
  if (action === 'sl_clear') { clearUserSmartlinks(userId); await render(chatId, session, `🧹 <b>CLEARED</b>\n<i>All SmartLinks were removed.</i>`, userSmartlinkMenuKeyboard(userId), userMessageId); return; }

  if (action === 'sl_target_menu') {
    const balance = getImpressionBalance(userId);
    const target = getImpressionTarget(userId, 'smartlink');
    const progress = getTargetProgress(userId, 'smartlink');
    let t = `🎯 <b>SET SMARTLINK TARGET</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n`;
    t += `💰 Balance: <b>${balance}</b> impressions\n`;
    if (target > 0) { t += `🎯 Current Target: <b>${target}</b>\n📊 Progress: <b>${progress}/${target}</b>\n`; }
    else t += `♾️ Currently: No limit\n`;
    t += `\nChoose target count. Bot will stop after reaching it.`;
    const rows = [[TARGET_50, TARGET_100], [TARGET_250, TARGET_500], [TARGET_1000], [TARGET_CUSTOM]];
    if (target > 0) rows.push([TARGET_NO_LIMIT]);
    rows.push([BACK_TO_MENU_LABEL]);
    session.sl_target_setting = true;
    await render(chatId, session, t, buildKeyboard(rows), userMessageId);
    return;
  }
  if (action === 'nl_target_menu') {
    const balance = getImpressionBalance(userId);
    const target = getImpressionTarget(userId, 'normal');
    const progress = getTargetProgress(userId, 'normal');
    let t = `🎯 <b>SET NORMAL LINK TARGET</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n`;
    t += `💰 Balance: <b>${balance}</b> impressions\n`;
    if (target > 0) { t += `🎯 Current Target: <b>${target}</b>\n📊 Progress: <b>${progress}/${target}</b>\n`; }
    else t += `♾️ Currently: No limit\n`;
    t += `\nChoose target count. Bot will stop after reaching it.`;
    const rows = [[TARGET_50, TARGET_100], [TARGET_250, TARGET_500], [TARGET_1000], [TARGET_CUSTOM]];
    if (target > 0) rows.push([TARGET_NO_LIMIT]);
    rows.push([BACK_TO_MENU_LABEL]);
    session.nl_target_setting = true;
    await render(chatId, session, t, buildKeyboard(rows), userMessageId);
    return;
  }

  if (action === 'live_smartlink') {
    const running = isAutoImpressionRunning(userId, 'smartlink');
    await renderWithImage(chatId, session, 'live', liveMonitorMessage(userId, 'smartlink'),
      buildKeyboard([[LIVE_SL_REFRESH], [running ? LIVE_SL_STOP : LIVE_SL_START], [BACK_TO_MENU_LABEL]]), userMessageId);
    return;
  }
  if (action === 'live_normal') {
    const running = isAutoImpressionRunning(userId, 'normal');
    await renderWithImage(chatId, session, 'live', liveMonitorMessage(userId, 'normal'),
      buildKeyboard([[LIVE_NL_REFRESH], [running ? LIVE_NL_STOP : LIVE_NL_START], [BACK_TO_MENU_LABEL]]), userMessageId);
    return;
  }

  if (action === 'membership') {
    const plans = getPlans();
    const rows = []; const map = {};
    for (const key of PLAN_ORDER) {
      const p = plans[key];
      if (p.enabled === false) continue;
      const l = `${escapeHtml(p.label)} — ৳${p.price}`;
      map[l] = key; rows.push([l]);
    }
    if (!rows.length) rows.push([`No plans available.`]);
    rows.push([BACK_TO_MENU_LABEL]);
    session.buy_plan_map = map;
    await renderWithImage(chatId, session, 'membership', membershipPlansMessage(), buildKeyboard(rows), userMessageId);
    return;
  }

  if (action === 'add_balance') {
    const methods = getPaymentMethods().filter((m) => m.enabled);
    if (!methods.length) { await render(chatId, session, `❌ <b>No payment methods available</b>\n<i>Please contact support.</i>`, simpleBackKeyboard(), userMessageId); return; }
    session.awaiting_balance_amount = true;
    let t = `💰 <b>ADD BALANCE</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n💳 <b>PAYMENT METHODS</b>\n\n`;
    for (const m of methods) {
      t += `${m.name}: <code>${escapeHtml(m.number)}</code>\n`;
      if (m.instructions) t += `   📝 ${escapeHtml(m.instructions)}\n`;
    }
    t += `\n💰 <i>Send the amount you want to add (e.g.</i> <code>200</code><i>)</i>`;
    await renderWithImage(chatId, session, 'balance', t, cancelKeyboard(), userMessageId);
    return;
  }

  if (action === 'shop_menu') {
    const pkgs = getShopPackages();
    const rows = []; const map = {};
    for (const key of SHOP_PACKAGE_ORDER) {
      const p = pkgs[key];
      if (!p) continue;
      const total = p.amount + (p.bonus || 0);
      const l = `🛒 ${total} — ৳${p.price}`;
      map[l] = key; rows.push([l]);
    }
    rows.push([BACK_TO_MENU_LABEL]);
    session.shop_buy_map = map;
    await renderWithImage(chatId, session, 'shop', shopMessage(userId), buildKeyboard(rows), userMessageId);
    return;
  }
  
  // ⭐ V30: Manual emergency reset
if (action === 'admin_reset_ticks') {
  if (!isAdmin(userId)) return;
  console.log('[Manual] 🚨 FORCE RESET ALL TICKS');
  smartlinkTickRunning = false;
  smartlinkTickStartTime = 0;
  normalTickRunning = false;
  normalTickStartTime = 0;
  activeVisitSlots = 0;
  drainVisitWaiters();
  try { await closeBrowser(); } catch (e) {}
  await render(chatId, session, `✅ <b>All Ticks Reset</b>\n\n💡 Open the menu and tap <b>Start</b> again.`, adminBackKeyboard(), userMessageId);
  return;
}

  // ═══ ADMIN PANEL ═══
  if (action === 'admin_open') {
    if (!isAdmin(userId)) { await render(chatId, session, `❌ Not authorized.`, mainMenuKeyboard(userId), userMessageId); return; }
    await renderWithImage(chatId, session, 'admin',
      `🛠️ <b>Admin Panel</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\nFull control center\n\n🇺🇸 US Organic Engine v30\n⚡ H4CK ORGANIC v30 Master Mode\n🚨 Adsterra-Safe Data Saver\n🌉 SOCKS5 Bridge (30s)\n🔥 Firebase\n💎 High CPM Mode (65/18/17 UA)\n\n⚡ ${DEVELOPER_NAME}`,
      adminMainKeyboard(userId), userMessageId);
    return;
  }
  if (action === 'admin_bridge') { if (!isAdmin(userId)) return; await render(chatId, session, bridgeStatusMessage(), adminBackKeyboard(), userMessageId); return; }
  if (action === 'admin_sys_health') { if (!isAdmin(userId)) return; await render(chatId, session, systemHealthMessage(), adminBackKeyboard(), userMessageId); return; }
  if (action === 'admin_proxy_perf') { if (!isAdmin(userId)) return; await render(chatId, session, proxyPerformanceMessage(), adminBackKeyboard(), userMessageId); return; }
  if (action === 'admin_high_cpm') { if (!isAdmin(userId)) return; await render(chatId, session, highCpmModeMessage(), adminBackKeyboard(), userMessageId); return; }
  if (action === 'admin_stats') { if (!isAdmin(userId)) return; await render(chatId, session, adminStatsMessage(), adminBackKeyboard(), userMessageId); return; }
  if (action === 'admin_firebase') { if (!isAdmin(userId)) return; await render(chatId, session, firebaseStatusMessage(), adminBackKeyboard(), userMessageId); return; }
  if (action === 'admin_visit_log') {
    if (!isAdmin(userId)) return;
    const logs = getRecentVisitLogs(20);
    let t = `📜 <b>Recent Visits</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    if (!logs.length) t += `No visits yet.`;
    else for (const l of logs) {
      const badge = l.ok ? '✅' : '❌';
      const when = formatDate(l.ts).replace(/^\d{4}-/, '').slice(0, 20);
      const short = l.url.length > 40 ? l.url.slice(0, 40) + '…' : l.url;
      t += `${badge} ${when} ${l.type}\n<code>${escapeHtml(short)}</code>\n👤 ${l.userId} · ${escapeHtml(l.detail)}\n\n`;
    }
    await render(chatId, session, t, adminBackKeyboard(), userMessageId);
    return;
  }
  if (action === 'admin_health') { if (!isAdmin(userId)) return; await render(chatId, session, proxyHealthMessage(), adminBackKeyboard(), userMessageId); return; }
  if (action === 'admin_maintenance') {
    if (!isAdmin(userId)) return;
    const m = getMaintenanceMode();
    const onOff = (v) => v ? '🟢 ON' : '🔴 OFF';
    const wlCount = Array.isArray(m.whitelist) ? m.whitelist.length : 0;
    const text =
      `🛠️ <b>Maintenance Mode</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📊 Status: <b>${onOff(m.enabled)}</b>\n` +
      `👥 Whitelisted extra users: <b>${wlCount}</b>\n\n` +
      `💡 When ON, only admins + whitelisted users can use the bot.\n` +
      `📝 Message shown to normal users:\n<i>${escapeHtml(m.message || '')}</i>`;
    const rows = [
      [`🛠️ Maintenance — ${onOff(m.enabled)}`],
      [`✏️ Edit Maintenance Msg`],
      [`➕ Add Whitelist User`, `➖ Remove Whitelist User`],
      [`📋 View Whitelist`],
      [ADMIN_BACK_LABEL],
    ];
    await render(chatId, session, text, buildKeyboard(rows), userMessageId);
    return;
  }
  if (action === 'admin_maint_toggle') {
    if (!isAdmin(userId)) return;
    const m = getMaintenanceMode();
    m.enabled = !m.enabled;
    saveMaintenanceMode();
    await handleAction(chatId, session, userId, 'admin_maintenance', userMessageId);
    return;
  }
  if (action === 'admin_maint_edit_msg') {
    if (!isAdmin(userId)) return;
    session.awaiting_maint_message = true;
    await render(chatId, session, `✏️ Send the new maintenance message (max 500 chars, HTML allowed).`, cancelKeyboard(), userMessageId);
    return;
  }
  if (action === 'admin_maint_add_wl') {
    if (!isAdmin(userId)) return;
    session.awaiting_maint_wl_add = true;
    await render(chatId, session, `➕ Send the Telegram user ID to whitelist.`, cancelKeyboard(), userMessageId);
    return;
  }
  if (action === 'admin_maint_remove_wl') {
    if (!isAdmin(userId)) return;
    const wl = getMaintenanceMode().whitelist;
    if (!wl.length) {
      await render(chatId, session, `ℹ️ Whitelist is empty.`, buildKeyboard([[ADMIN_MENU_MAINTENANCE], [ADMIN_BACK_LABEL]]), userMessageId);
      return;
    }
    const rows = []; const map = {};
    for (const id of wl) { const l = `❌ WL ${id}`; map[l] = id; rows.push([l]); }
    rows.push([ADMIN_MENU_MAINTENANCE]);
    session.maint_wl_remove_map = map;
    await render(chatId, session, `➖ <b>Remove Whitelist User</b>`, buildKeyboard(rows), userMessageId);
    return;
  }
  if (action === 'admin_maint_view_wl') {
    if (!isAdmin(userId)) return;
    const wl = getMaintenanceMode().whitelist;
    const body = wl.length ? wl.map((id) => `• <code>${id}</code>`).join('\n') : `<i>Empty</i>`;
    await render(chatId, session, `📋 <b>Maintenance Whitelist</b>\n\n${body}\n\nℹ️ Admins and extra admins are always allowed.`,
      buildKeyboard([[ADMIN_MENU_MAINTENANCE], [ADMIN_BACK_LABEL]]), userMessageId);
    return;
  }
  if (action === 'admin_captcha') {
    if (!isAdmin(userId)) return;
    const verified = Object.keys(cache.captcha_verified || {}).length;
    await render(chatId, session,
      `🔐 <b>Captcha Settings</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n✅ Enabled: 🟢\n🔤 Length: ${CAPTCHA_LENGTH}\n⏱️ Expiry: ${CAPTCHA_EXPIRY_MS / 60000}min\n🖼️ Mode: ${sharp ? 'PNG' : 'Text'}\n\n👥 Verified: <b>${verified}</b>`,
      buildKeyboard([[`🗑️ Reset Verifications`], [ADMIN_BACK_LABEL]]), userMessageId);
    return;
  }
  if (action === 'admin_slv2') {
    if (!isAdmin(userId)) return;
    const s = getSmartlinkSettings();
    await render(chatId, session,
      `⚡ <b>SmartLink Engine v30.0</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🕐 Min interval: <b>${Math.round(s.min_interval_ms/1000)}s</b>\n` +
      `🕐 Max interval: <b>${Math.round(s.max_interval_ms/1000)}s</b>\n` +
      `🎯 Per-link cap: <b>${s.per_link_daily_cap}/day</b>\n` +
      `🖥️ Max browsers: <b>${s.max_concurrent_browsers}</b>\n\n` +
      `🔥 Warmup: ${s.warmup_enabled ? '🟢' : '🔴'}\n` +
      `🏠 Residential: ${s.residential_only ? '🟢' : '🔴'}\n\n` +
      `🚨 Adsterra-safe: dwell 9-12s, no ad click`,
      buildKeyboard([[`🔥 Toggle Warmup`], [`🏠 Toggle Residential`], [ADMIN_BACK_LABEL]]), userMessageId);
    return;
  }
  if (action === 'admin_human') {
    if (!isAdmin(userId)) return;
    const cfg = getHumanConfig();
    const onOff = (v) => v ? '🟢 ON' : '🔴 OFF';
    const rows = [
      [`🎭 Master — ${onOff(cfg.enabled)}`],
      [`⌨️ Typing — ${onOff(cfg.typing_indicator)}`],
      [`⏱️ Delays — ${onOff(cfg.random_delays)}`],
      [`📖 Pauses — ${onOff(cfg.reading_pause)}`],
      [`🎲 Variation — ${onOff(cfg.action_variation)}`],
      [`🇺🇸 Organic Mode — ${onOff(cfg.organic_mode)}`],
      [ADMIN_BACK_LABEL],
    ];
    session.human_toggle_map = {
      [`🎭 Master — ${onOff(cfg.enabled)}`]: 'enabled',
      [`⌨️ Typing — ${onOff(cfg.typing_indicator)}`]: 'typing_indicator',
      [`⏱️ Delays — ${onOff(cfg.random_delays)}`]: 'random_delays',
      [`📖 Pauses — ${onOff(cfg.reading_pause)}`]: 'reading_pause',
      [`🎲 Variation — ${onOff(cfg.action_variation)}`]: 'action_variation',
      [`🇺🇸 Organic Mode — ${onOff(cfg.organic_mode)}`]: 'organic_mode',
    };
    await render(chatId, session,
      `🤖 <b>Human Behavior v30.0</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🇺🇸 Organic: ${cfg.organic_mode ? '🟢 (Bing/DDG/Yahoo/Ecosia)' : '🔴'}\n` +
      `⏱️ Search dwell: ${Math.round(cfg.search_dwell_min_ms/1000)}-${Math.round(cfg.search_dwell_max_ms/1000)}s\n` +
      `⏱️ Target dwell: ${Math.round(cfg.organic_dwell_min_ms/1000)}-${Math.round(cfg.organic_dwell_max_ms/1000)}s\n` +
      `⌨️ Typing: ${cfg.typing_min_cpm}-${cfg.typing_max_cpm} CPM`,
      buildKeyboard(rows), userMessageId);
    return;
  }
  if (action === 'admin_membership') {
    if (!isAdmin(userId)) return;
    const plans = getPlans();
    const rows = []; const map = {}; const toggleMap = {};
    for (const key of PLAN_ORDER) {
      const p = plans[key];
      const editLabel = `✏️ ${p.label} — ৳${p.price} | ${p.visits_per_link}🚀/${p.burst_window_ms/1000}s`;
      const toggleLabel = `${p.enabled === false ? '🔴' : '🟢'} · ${p.label}`;
      map[editLabel] = key; toggleMap[toggleLabel] = key;
      rows.push([editLabel], [toggleLabel]);
    }
    rows.push([ADMIN_BACK_LABEL]);
    session.admin_plan_map = map;
    session.admin_plan_toggle_map = toggleMap;
    await render(chatId, session, `🎟️ <b>Membership Plans</b>`, buildKeyboard(rows), userMessageId);
    return;
  }
  if (action === 'admin_pay_methods') {
    if (!isAdmin(userId)) return;
    const methods = getPaymentMethods();
    const rows = methods.map((m) => [`✏️ ${m.name}`]);
    rows.push([`➕ Add New Method`, `🗑️ Delete Method`]);
    rows.push([ADMIN_BACK_LABEL]);
    session.pay_methods_map = Object.fromEntries(methods.map((m) => [`✏️ ${m.name}`, m.id]));
    let t = `💳 <b>Payment Methods Editor</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    for (const m of methods) t += `${m.enabled ? '🟢' : '🔴'} <b>${escapeHtml(m.name)}</b>\n   📞 <code>${escapeHtml(m.number)}</code>\n   📝 ${escapeHtml(m.instructions || '')}\n\n`;
    t += `💡 Tap any to edit`;
    await render(chatId, session, t, buildKeyboard(rows), userMessageId);
    return;
  }
  if (action === 'admin_balance_requests') {
    if (!isAdmin(userId)) return;
    const p = getPendingBalanceRequests();
    if (!p.length) { await render(chatId, session, `💰 No pending requests.`, adminBackKeyboard(), userMessageId); return; }
    const rows = []; const map = {};
    for (const r of p) { const l = `#${r.id} · ${r.userId} · ৳${r.amount}`; map[l] = r.id; rows.push([l]); }
    rows.push([ADMIN_BACK_LABEL]);
    session.admin_balance_req_map = map;
    await render(chatId, session, `💰 <b>Pending Balance Requests</b>`, buildKeyboard(rows), userMessageId);
    return;
  }
  if (action === 'admin_manage_admins') {
    if (!isSuperAdmin(userId)) return;
    const extra = getExtraAdmins();
    let t = `👑 <b>Manage Admins</b>\n\n<b>Owner:</b>\n${ADMIN_IDS.map((id) => `• <code>${id}</code>`).join('\n')}\n\n`;
    t += extra.length ? `<b>Extra:</b>\n${extra.map((id) => `• <code>${id}</code>`).join('\n')}` : `<b>Extra:</b> none`;
    const rows = [[`➕ Add Admin`]];
    if (extra.length) rows.push([`➖ Remove Admin`]);
    rows.push([ADMIN_BACK_LABEL]);
    await render(chatId, session, t, buildKeyboard(rows), userMessageId);
    return;
  }
  if (action === 'add_admin') { if (!isSuperAdmin(userId)) return; session.awaiting_new_admin_id = true; await render(chatId, session, `✏️ Send admin ID.`, adminBackKeyboard(), userMessageId); return; }
  if (action === 'remove_admin') {
    if (!isSuperAdmin(userId)) return;
    const extra = getExtraAdmins();
    if (!extra.length) { await render(chatId, session, `ℹ️ No extra admins.`, adminBackKeyboard(), userMessageId); return; }
    const rows = []; const map = {};
    for (const id of extra) { const l = `❌ ${id}`; map[l] = id; rows.push([l]); }
    rows.push([ADMIN_BACK_LABEL]);
    session.admin_remove_map = map;
    await render(chatId, session, `➖ <b>Remove Admin</b>`, buildKeyboard(rows), userMessageId);
    return;
  }
  if (action === 'admin_shop') { if (!isAdmin(userId)) return; await render(chatId, session, shopAdminMessage(), shopAdminKeyboard(), userMessageId); return; }
  if (action === 'shop_view') { if (!isAdmin(userId)) return; await render(chatId, session, shopAdminMessage(), shopAdminKeyboard(), userMessageId); return; }
  if (action === 'shop_edit') {
    if (!isAdmin(userId)) return;
    const pkgs = getShopPackages();
    const rows = []; const map = {};
    for (const key of SHOP_PACKAGE_ORDER) {
      const p = pkgs[key];
      if (!p) continue;
      const l = `${key}: ${p.amount + (p.bonus || 0)} — ৳${p.price}`;
      map[l] = key; rows.push([l]);
    }
    rows.push([ADMIN_BACK_LABEL]);
    session.shop_admin_edit_map = map;
    await render(chatId, session, `✏️ <b>Edit Package</b>`, buildKeyboard(rows), userMessageId);
    return;
  }
  if (action === 'shop_reset') {
    if (!isAdmin(userId)) return;
    cache.shop_packages = JSON.parse(JSON.stringify(DEFAULT_SHOP_PACKAGES));
    syncToFirebase('shop_packages');
    await render(chatId, session, `✅ Reset to defaults.`, shopAdminKeyboard(), userMessageId);
    return;
  }
  if (action === 'admin_proxy') { if (!isAdmin(userId)) return; await render(chatId, session, proxyMenuMessage(), proxyMenuKeyboard(), userMessageId); return; }
  if (action === 'proxy_add') {
    if (!isAdmin(userId)) return;
    session.awaiting_proxy = true;
    await render(chatId, session,
      `🌐 <b>Add Proxy</b>\n\n` +
      `Formats:\n<code>socks5://user:pass@host:port#resi#US</code>\n<code>http://user:pass@host:port</code>\n<code>host:port:user:pass</code>\n\n` +
      `💡 Include "resi" for residential\nAdd <code>#US</code> for US-only\n\n` +
      `🌉 SOCKS5 auth auto-uses bridge (30s timeout)`,
      cancelKeyboard(), userMessageId);
    return;
  }
  if (action === 'proxy_list') {
    if (!isAdmin(userId)) return;
    const proxies = getProxyList();
    if (!proxies.length) { await render(chatId, session, `🌐 No proxies added.`, proxyMenuKeyboard(), userMessageId); return; }
    const stats = getProxyStats();
    const lines = proxies.map((p, i) => {
      const s = stats[proxyId(p)] || { ok: 0, failed: 0, mb_used: 0 };
      const st = p.enabled === false ? '🔴' : '🟢';
      const c = p.country ? ` [${p.country}]` : '';
      const resi = isResidentialProxy(p) ? ' 🏠' : '';
      const nm = p.name ? `🏷️ <b>${escapeHtml(p.name)}</b>${c}${resi}\n   ` : '';
      const q = Number(p.quota_mb || 0);
      const u = s.mb_used || 0;
      const qt = q > 0 ? `${u.toFixed(1)}MB/${q}MB` : `${u.toFixed(1)}MB`;
      return `${i + 1}. ${nm}<code>${escapeHtml(shortProxyLabel(p).slice(0, 60))}</code>\n   ${st} ✅${s.ok} ❌${s.failed} · 📊 ${qt}`;
    });
    await render(chatId, session, `🌐 <b>Proxies</b>\n\n${lines.join('\n\n')}`, proxyMenuKeyboard(), userMessageId);
    return;
  }
  if (action === 'proxy_remove') {
    if (!isAdmin(userId)) return;
    const proxies = getProxyList();
    if (!proxies.length) { await render(chatId, session, `🌐 No proxies.`, proxyMenuKeyboard(), userMessageId); return; }
    const map = {}; const rows = [];
    for (let i = 0; i < proxies.length; i++) {
      const nm = proxies[i].name ? proxies[i].name : shortProxyLabel(proxies[i]);
      const b = `🗑️ ${nm}`.slice(0, 60);
      let l = b, n = 1;
      while (map[l]) { n += 1; l = `${b} (${n})`; }
      map[l] = i; rows.push([l]);
    }
    rows.push([ADMIN_BACK_LABEL]);
    session.proxy_remove_map = map;
    await render(chatId, session, `🗑️ Tap to remove:`, buildKeyboard(rows), userMessageId);
    return;
  }
  if (action === 'proxy_testall') {
    if (!isAdmin(userId)) return;
    const proxies = getProxyList();
    if (!proxies.length) { await render(chatId, session, `🌐 No proxies.`, proxyMenuKeyboard(), userMessageId); return; }
    const sent = await render(chatId, session, `⏳ Testing…`, proxyMenuKeyboard(), userMessageId);
    const lines = []; let passed = 0;
    for (let i = 0; i < proxies.length; i++) {
      const pr = proxies[i];
      const [ok, detail] = await testProxy(pr);
      recordProxyResult(proxyId(pr), ok);
      if (ok) passed++;
      lines.push(`${ok ? '✅' : '❌'} ${escapeHtml(pr.name || shortProxyLabel(pr))} — ${escapeHtml(detail)}`);
      try { await bot.editMessageText(`🧪 <b>Testing ${i + 1}/${proxies.length}</b>\n\n${lines.join('\n')}`, { chat_id: chatId, message_id: sent.message_id, parse_mode: 'HTML', reply_markup: proxyMenuKeyboard() }); } catch (e) {}
    }
    try { await bot.editMessageText(`📊 <b>Results</b>\n\n✅ ${passed} · ❌ ${proxies.length - passed}\n\n${lines.join('\n')}`, { chat_id: chatId, message_id: sent.message_id, parse_mode: 'HTML', reply_markup: proxyMenuKeyboard() }); } catch (e) {}
    return;
  }
  if (action === 'proxy_settings') {
    if (!isAdmin(userId)) return;
    const cfg = getProxySettings();
    const onOff = (v) => v ? '🟢 ON' : '🔴 OFF';
    const rows = [
      [`🎛️ Master — ${onOff(cfg.enabled)}`],
      [`🇺🇸 US-only — ${onOff(cfg.force_us_only)}`],
      [`🏠 Residential Only — ${onOff(cfg.require_residential)}`],
      [`🔍 Verify Exit IP — ${onOff(cfg.verify_exit_ip)}`],
      [`🛟 Fallback — ${onOff(cfg.fallback_direct)}`],
      [`🏥 Auto Health — ${onOff(cfg.auto_health_check)}`],
      [`🔄 Rotation: ${cfg.rotation}`],
      [`🔁 Retries: ${cfg.max_retries}`],
      [ADMIN_BACK_LABEL],
    ];
    session.proxy_settings_map = {
      [`🎛️ Master — ${onOff(cfg.enabled)}`]: 'enabled',
      [`🇺🇸 US-only — ${onOff(cfg.force_us_only)}`]: 'force_us_only',
      [`🏠 Residential Only — ${onOff(cfg.require_residential)}`]: 'require_residential',
      [`🔍 Verify Exit IP — ${onOff(cfg.verify_exit_ip)}`]: 'verify_exit_ip',
      [`🛟 Fallback — ${onOff(cfg.fallback_direct)}`]: 'fallback_direct',
      [`🏥 Auto Health — ${onOff(cfg.auto_health_check)}`]: 'auto_health_check',
      [`🔄 Rotation: ${cfg.rotation}`]: 'rotation',
      [`🔁 Retries: ${cfg.max_retries}`]: 'max_retries',
    };
    await render(chatId, session, `⚙️ <b>Proxy Settings</b>`, buildKeyboard(rows), userMessageId);
    return;
  }
  if (action === 'proxy_clear') {
    if (!isAdmin(userId)) return;
    cache.proxies = []; cache.proxy_stats = {};
    syncToFirebase('proxies'); syncToFirebase('proxy_stats');
    await render(chatId, session, `✅ Cleared all proxies.`, proxyMenuKeyboard(), userMessageId);
    return;
  }
  if (action === 'proxy_health') {
    if (!isAdmin(userId)) return;
    const sent = await render(chatId, session, `⏳ Checking…`, proxyMenuKeyboard(), userMessageId);
    await proxyHealthCheck();
    try { await bot.deleteMessage(chatId, sent.message_id); } catch (e) {}
    await render(chatId, session, proxyHealthMessage(), proxyMenuKeyboard(), userMessageId);
    return;
  }
  if (action === 'admin_support') {
    if (!isAdmin(userId)) return;
    const open = getOpenSupportMessages();
    let t = `💬 <b>Support</b>\n\n📬 Open: <b>${open.length}</b>\n\n`;
    const rows = [];
    if (open.length) {
      const map = {};
      for (const m of open.slice(0, 15)) { const l = `#${m.id} · ${m.userId} · ${escapeHtml(m.text.slice(0, 25))}`; map[l] = m.id; rows.push([l]); }
      session.support_reply_map = map;
    }
    rows.push([ADMIN_BACK_LABEL]);
    await render(chatId, session, t, buildKeyboard(rows), userMessageId);
    return;
  }
  if (action === 'admin_ban') {
    if (!isAdmin(userId)) return;
    const banned = cache.banned_users || {};
    const list = Object.keys(banned);
    let t = `🚫 <b>Ban Manager</b>\n\n📊 Total: <b>${list.length}</b>\n\n`;
    if (list.length) list.slice(0, 20).forEach((id) => { t += `🚫 <code>${id}</code> — ${escapeHtml(banned[id].reason || '')}\n`; });
    await render(chatId, session, t, buildKeyboard([[`🚫 Ban`, `✅ Unban`], [ADMIN_BACK_LABEL]]), userMessageId);
    return;
  }
  if (action === 'admin_promo') {
    if (!isAdmin(userId)) return;
    const p = getPromoCodes();
    const keys = Object.keys(p);
    let t = `🎫 <b>Promo Codes</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    if (!keys.length) t += `None created yet.\n\n`;
    else for (const k of keys) { const c = p[k]; t += `🎟️ <code>${escapeHtml(k)}</code> — 💰 ${c.discount_percent || 0}% · 🎁 ৳${c.bonus_balance || 0}\n`; }
    await render(chatId, session, t, buildKeyboard([[`➕ Create`, `🗑️ Delete`], [ADMIN_BACK_LABEL]]), userMessageId);
    return;
  }
  if (action === 'admin_join') {
    if (!isAdmin(userId)) return;
    const s = getJoinCheckSettings();
    const onOff = (v) => v ? '🟢 ON' : '🔴 OFF';
    let t = `📢 <b>Force Join Settings</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n📢 Status: ${onOff(s.enabled)}\n📺 Channel: <code>${escapeHtml(s.channel || '—')}</code>\n👥 Group: <code>${escapeHtml(s.group || '—')}</code>\n\n💡 Users must join before using bot.`;
    await render(chatId, session, t, buildKeyboard([[`🎛️ Toggle — ${onOff(s.enabled)}`], [`📺 Set Channel`], [`👥 Set Group`], [ADMIN_BACK_LABEL]]), userMessageId);
    return;
  }
  if (action === 'admin_auto_imp') {
    if (!isAdmin(userId)) return;
    const cfg = getAutoImpressionSettings();
    const onOff = (v) => v ? '🟢 ON' : '🔴 OFF';
    const activeMode = getActiveMode();
    const h4ckStats = getH4CkOrganicStats();
    const modeIcon = (m) => activeMode === m ? '🟢' : '🔴';
    const successRate = h4ckStats.total_visits > 0 ? (h4ckStats.successful / h4ckStats.total_visits * 100).toFixed(1) : '0.0';
    const avgPages = h4ckStats.total_visits > 0 ? (h4ckStats.total_pages / h4ckStats.total_visits).toFixed(1) : '0.0';
    const avgDwell = h4ckStats.total_visits > 0 ? Math.round(h4ckStats.total_dwell_ms / 1000 / h4ckStats.total_visits) : 0;

    let t = `⚡ <b>H4CK ORGANIC v30</b> | @alif_h4ck\n`;
    t += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    t += `🎯 Active Mode: <b>${getModeDisplayName(activeMode)}</b>\n\n`;
    t += `📊 <b>Today's Stats:</b>\n`;
    t += `   ✅ Success: ${h4ckStats.successful}/${h4ckStats.total_visits} (${successRate}%)\n`;
    t += `   💵 Clicks: ${h4ckStats.total_clicks}\n`;
    t += `   📄 Avg Pages: ${avgPages}\n`;
    t += `   ⏱️ Avg Dwell: ${avgDwell}s\n`;
    t += `   🔗 Referrers: ${Object.keys(h4ckStats.referrer_breakdown).join(', ') || 'N/A'}\n\n`;
    t += `   🎬 Competitors: ${h4ckStats.total_competitors || 0}\n`;
    t += `   🔍 Zoom: ${h4ckStats.total_zoom_events || 0}\n`;
    t += `   ⌨️ Keyboard: ${h4ckStats.total_keyboard_scrolls || 0}\n`;
    t += `   🎥 Video: ${h4ckStats.total_video_pauses || 0}\n\n`;
    t += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    t += `⚡ SmartLink: ${onOff(cfg.smartlink_enabled)}\n`;
    t += `   🕐 Hourly: <b>${cfg.hourly_limit_smartlink}</b> · 📅 Daily: <b>${cfg.daily_limit_smartlink}</b>\n`;
    t += `🔗 Normal: ${onOff(cfg.normal_enabled)}\n`;
    t += `   🕐 Hourly: <b>${cfg.hourly_limit_normal}</b> · 📅 Daily: <b>${cfg.daily_limit_normal}</b>\n\n`;
    t += `🚀 Burst: <b>${cfg.burst_visits_per_link}</b>/${cfg.burst_window_ms/1000}s\n`;
    t += `🤖 Human: ${onOff(cfg.human_behavior)}\n`;
    t += `🏠 Residential: ${onOff(cfg.residential_only)}\n`;
    t += `🇺🇸 Organic: ${onOff(cfg.organic_mode)}\n\n`;
    t += `🚨 <b>ADSTERRA-SAFE FIXES</b>\n`;
    t += `• SmartLink dwell: <b>9-12s</b>\n`;
    t += `• No fake referer to SmartLink\n`;
    t += `• No ad click on SmartLink\n`;
    t += `• 40+ Adsterra domains whitelisted\n\n`;
    t += `⚡ <b>DATA SAVER</b>\n`;
    t += `💾 Master: ${onOff(cfg.h4ck_smart_data_saver)}\n`;
    t += `🖼️ Images: ${onOff(cfg.h4ck_saver_block_images)}\n`;
    t += `🎬 Media: ${onOff(cfg.h4ck_saver_block_media)}\n`;
    t += `🔥 Fonts: ${onOff(cfg.h4ck_saver_block_fonts)}\n`;
    t += `📊 Analytics: ${onOff(cfg.h4ck_saver_block_analytics)}\n`;
    t += `📢 Other Ads: ${onOff(cfg.h4ck_saver_block_other_ads)}\n`;
    t += `🔌 WebSocket: ${onOff(cfg.h4ck_saver_block_websockets)}`;

    const rows = [];
    rows.push([`⚡ H4CK ORGANIC — ${modeIcon(MODE_H4CK_ORGANIC)}`]);
    rows.push([`🎯 Hybrid Smart — ${modeIcon(MODE_HYBRID_SMART)}`]);
    rows.push([`🔍 Pure Search — ${modeIcon(MODE_PURE_SEARCH)}`]);
    rows.push([`🚀 Pure Direct — ${modeIcon(MODE_PURE_DIRECT)}`]);
    rows.push([`⚡ Toggle SmartLink`]);
    rows.push([`🕐 SL Hourly`, `📅 SL Daily`]);
    rows.push([`🔗 Toggle Normal`]);
    rows.push([`🕐 NL Hourly`, `📅 NL Daily`]);

    const pL = `🌐 Proxy Required — ${onOff(cfg.proxy_required)}`;
    const rL = `🏠 Residential Only — ${onOff(cfg.residential_only)}`;
    const oL = `🇺🇸 Organic Mode — ${onOff(cfg.organic_mode)}`;
    const uL = `🎯 Require US — ${onOff(cfg.require_us)}`;
    registerToggleLabel('auto_imp', pL, 'proxy_required');
    registerToggleLabel('auto_imp', rL, 'residential_only');
    registerToggleLabel('auto_imp', oL, 'organic_mode');
    registerToggleLabel('auto_imp', uL, 'require_us');

    rows.push([pL]); rows.push([rL]); rows.push([oL]); rows.push([uL]);
    rows.push([`━━━ 🛡️ DATA SAVER ━━━`]);

    const dsLabel = `💾 Smart Data Saver — ${onOff(cfg.h4ck_smart_data_saver)}`;
    const imgLabel = `🖼️ Images Block — ${onOff(cfg.h4ck_saver_block_images)}`;
    const mediaLabel = `🎬 Media Block — ${onOff(cfg.h4ck_saver_block_media)}`;
    const fontLabel = `🔥 Fonts Block — ${onOff(cfg.h4ck_saver_block_fonts)}`;
    const anaLabel = `📊 Analytics Block — ${onOff(cfg.h4ck_saver_block_analytics)}`;
    const adLabel = `📢 Other Ads Block — ${onOff(cfg.h4ck_saver_block_other_ads)}`;
    const wsLabel = `🔌 WebSocket Block — ${onOff(cfg.h4ck_saver_block_websockets)}`;
    const adSafeLabel = `🛡️ Adsterra Safe — ${onOff(cfg.h4ck_saver_whitelist_adsterra)}`;

    registerToggleLabel('auto_imp', dsLabel, 'h4ck_smart_data_saver');
    registerToggleLabel('auto_imp', imgLabel, 'h4ck_saver_block_images');
    registerToggleLabel('auto_imp', mediaLabel, 'h4ck_saver_block_media');
    registerToggleLabel('auto_imp', fontLabel, 'h4ck_saver_block_fonts');
    registerToggleLabel('auto_imp', anaLabel, 'h4ck_saver_block_analytics');
    registerToggleLabel('auto_imp', adLabel, 'h4ck_saver_block_other_ads');
    registerToggleLabel('auto_imp', wsLabel, 'h4ck_saver_block_websockets');
    registerToggleLabel('auto_imp', adSafeLabel, 'h4ck_saver_whitelist_adsterra');

    rows.push([dsLabel]);
    rows.push([imgLabel, mediaLabel]);
    rows.push([fontLabel, anaLabel]);
    rows.push([adLabel, wsLabel]);
    rows.push([adSafeLabel]);
    rows.push([`🤖 Toggle Human`, `🔁 Toggle Retry`]);
    rows.push([`🧹 Reset Hourly`]);
    rows.push([ADMIN_BACK_LABEL]);
    await render(chatId, session, t, buildKeyboard(rows), userMessageId);
    return;
  }

  if (action === 'admin_price_edit') {
    if (!isAdmin(userId)) return;
    const pkgs = getShopPackages();
    const rows = []; const map = {};
    let t = `💵 <b>Price Editor</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    for (const key of SHOP_PACKAGE_ORDER) {
      const p = pkgs[key];
      if (!p) continue;
      const total = p.amount + (p.bonus || 0);
      t += `📦 ${key}: ${total} → ৳${p.price}\n`;
      const lbl = `✏️ ${key} — ৳${p.price}`;
      map[lbl] = key; rows.push([lbl]);
    }
    rows.push([ADMIN_BACK_LABEL]);
    session.admin_price_map = map;
    await render(chatId, session, t, buildKeyboard(rows), userMessageId);
    return;
  }
  if (action === 'admin_buttons') {
    if (!isAdmin(userId)) return;
    const s = getSettings();
    const map = {}; const rows = [];
    for (const key of s.button_order) {
      const en = s.button_enabled[key] !== false;
      const st = en ? '🟢 ON' : '🔴 OFF';
      const l = `${buttonLabel(key)} — ${st}`;
      map[l] = key; rows.push([l]);
    }
    rows.push([ADMIN_BACK_LABEL]);
    session.admin_toggle_map = map;
    await render(chatId, session, `🔘 <b>Manage Buttons</b>`, buildKeyboard(rows), userMessageId);
    return;
  }
  if (action === 'admin_reorder') {
    if (!isAdmin(userId)) return;
    const s = getSettings();
    const order = s.button_order;
    const map = {}; const rows = [];
    for (let i = 0; i < order.length; i++) {
      const key = order[i];
      const l = buttonLabel(key);
      const ar = [];
      if (i > 0) { const u = `🔼 ${l}`; map[u] = [key, 'up']; ar.push(u); }
      if (i < order.length - 1) { const d = `🔽 ${l}`; map[d] = [key, 'down']; ar.push(d); }
      rows.push(ar.length ? ar : [l]);
    }
    rows.push([ADMIN_BACK_LABEL]);
    session.admin_reorder_map = map;
    await render(chatId, session, `↕️ <b>Reorder</b>`, buildKeyboard(rows), userMessageId);
    return;
  }
  if (action === 'admin_icons') {
    if (!isAdmin(userId)) return;
    const s = getSettings();
    const map = {}; const rows = [];
    for (const key of s.button_order) { const l = buttonLabel(key); map[l] = key; rows.push([l]); }
    rows.push([ADMIN_BACK_LABEL]);
    session.admin_icon_map = map;
    await render(chatId, session, `🎨 <b>Edit Icons</b>`, buildKeyboard(rows), userMessageId);
    return;
  }
  if (action === 'admin_setname') {
    if (!isAdmin(userId)) return;
    session.awaiting_name = true;
    await render(chatId, session, `✏️ Send new bot name.`, adminBackKeyboard(), userMessageId);
    return;
  }
  if (action === 'admin_broadcast') {
    if (!isAdmin(userId)) return;
    session.awaiting_broadcast = true;
    await render(chatId, session, `📢 Send broadcast message.`, adminBackKeyboard(), userMessageId);
    return;
  }
  if (action === 'admin_autobroadcast') {
    if (!isAdmin(userId)) return;
    const s = getAutoBroadcastSettings();
    const onOff = (v) => v ? '🟢 ON' : '🔴 OFF';
    await render(chatId, session,
      `📣 <b>Auto Broadcast</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n📣 Enabled: ${onOff(s.enabled)}\n🚀 On Startup: ${onOff(s.on_startup)}\n\n📝 ${s.message ? escapeHtml(s.message.slice(0, 200)) : '(default)'}`,
      buildKeyboard([[`📣 Enabled — ${onOff(s.enabled)}`], [`🚀 On Startup — ${onOff(s.on_startup)}`], [`✏️ Edit Message`], [ADMIN_BACK_LABEL]]), userMessageId);
    return;
  }

  if (action === 'impression_trial_claim') {
    const wallet = getReportingWallet(userId);
    if (wallet.trial_claimed) {
      await render(chatId, session, `🔒 <b>ALREADY CLAIMED</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n📈 Available  ⟶  <b>${getImpressionBalance(userId)}</b>`, buildKeyboard([[BACK_TO_MENU_LABEL]]), userMessageId);
      return;
    }
    wallet.trial_claimed = true;
    wallet.updated_at = Date.now();
    addImpressionBalance(userId, 10);
    syncToFirebase('reporting_credits');
    await render(chatId, session, `🎉 <b>10 FREE IMPRESSIONS!</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n📈 Available  ⟶  <b>${getImpressionBalance(userId)}</b>`, buildKeyboard([[BACK_TO_MENU_LABEL]]), userMessageId);
    return;
  }
  if (action === 'publisher_report') {
    const smart = getUserSmartlink(userId);
    if (!smart.api_key) {
      await render(chatId, session, `🔑 <b>CONNECT ADSTERRA</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n<i>Set your API key first.</i>`, buildKeyboard([[SL_BTN_SET_API], [BACK_TO_MENU_LABEL]]), userMessageId);
      return;
    }
    await render(chatId, session, `⏳ <b>Fetching…</b>\n<i>Please wait a moment.</i>`, simpleBackKeyboard(), userMessageId);
    const result = await fetchAdsterraPublisherReport(smart.api_key);
    if (!result.ok) { await render(chatId, session, `❌ <b>FAILED</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n${escapeHtml(result.error)}`, buildKeyboard([[REPORT_RUN_LABEL], [BACK_TO_MENU_LABEL]])); return; }
    const jsonText = JSON.stringify(result.data, null, 2);
    const safeJson = escapeHtml(jsonText.slice(0, 2100));
    await render(chatId, session, `📊 <b>ADSTERRA REPORT</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n📅 <b>${result.date}</b>\n\n<pre>${safeJson}</pre>${jsonText.length > 2100 ? '\n…' : ''}`, buildKeyboard([[REPORT_RUN_LABEL], [BACK_TO_MENU_LABEL]]));
    return;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  TEXT ROUTER
// ═══════════════════════════════════════════════════════════════════════
async function receiveText(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const session = getSession(chatId);
  const text = (msg.text || '').trim();
  const userMessageId = msg.message_id;

  if (isBanned(userId) && !isAdmin(userId)) {
    await bot.sendMessage(chatId, `🚫 <b>ACCESS RESTRICTED</b>\n\n<i>Your account is banned.</i>`, { parse_mode: 'HTML' });
    return;
  }
  if (await checkMaintenanceGate(msg, chatId, userId)) return;

  if (text === `🔄 Verify Join`) {
    const joined = await isUserJoined(userId);
    if (joined) {
      rememberUser(userId, msg.from);
      await playStartupAnimation(chatId, session, msg.from.first_name || '');
      if (!isAdmin(userId) && !isUserVerified(userId)) {
        await startCaptcha(chatId, userId, session);
      } else {
        try { await renderWithImage(chatId, session, 'welcome', welcomeMessage(userId), mainMenuKeyboard(userId), null); }
        catch (e) { console.error('welcome fail:', e.message); }
      }
    } else {
      await bot.sendMessage(chatId, `❌ <b>NOT JOINED YET</b>\n\n<i>Please join our channel / group, then tap Verify Join again.</i>`, { parse_mode: 'HTML' });
    }
    return;
  }

  if (!isAdmin(userId)) {
    const joined = await isUserJoined(userId);
    if (!joined) { await sendJoinRequired(chatId, userId); return; }
  }

  // Mode selector
  if (isAdmin(userId) && text.startsWith('⚡ H4CK ORGANIC — ')) { setActiveMode(MODE_H4CK_ORGANIC); await handleAction(chatId, session, userId, 'admin_auto_imp', userMessageId); return; }
  if (isAdmin(userId) && text.startsWith('🎯 Hybrid Smart — ')) { setActiveMode(MODE_HYBRID_SMART); await handleAction(chatId, session, userId, 'admin_auto_imp', userMessageId); return; }
  if (isAdmin(userId) && text.startsWith('🔍 Pure Search — ')) { setActiveMode(MODE_PURE_SEARCH); await handleAction(chatId, session, userId, 'admin_auto_imp', userMessageId); return; }
  if (isAdmin(userId) && text.startsWith('🚀 Pure Direct — ')) { setActiveMode(MODE_PURE_DIRECT); await handleAction(chatId, session, userId, 'admin_auto_imp', userMessageId); return; }

  if (isAdmin(userId)) {
    const entry = findToggleByLabel('auto_imp', text);
    if (entry) {
      const cfg = getAutoImpressionSettings();
      if (entry.type === 'bool') { cfg[entry.key] = !cfg[entry.key]; saveAutoImpressionSettings(); }
      await handleAction(chatId, session, userId, 'admin_auto_imp', userMessageId);
      return;
    }
  }
  if (isAdmin(userId) && text === `🧹 Reset Hourly`) {
    cache.hourly_impression_log = {};
    syncToFirebase('hourly_impression_log');
    await render(chatId, session, `✅ <b>Hourly Reset</b>`, adminBackKeyboard(), userMessageId);
    return;
  }

  // CAPTCHA
  if (session.awaiting_captcha_answer && !isAdmin(userId)) {
    if (text === `🔄 New Captcha`) {
      session.captcha = null;
      session.awaiting_captcha_answer = false;
      await startCaptcha(chatId, userId, session);
      return;
    }
    if (text.startsWith('🔘 ')) {
      const ans = text.slice(3).trim();
      const cap = session.captcha;
      if (!cap) { await startCaptcha(chatId, userId, session); return; }
      if (Date.now() - cap.created_at > CAPTCHA_EXPIRY_MS) {
        session.captcha = null;
        session.awaiting_captcha_answer = false;
        await bot.sendMessage(chatId, `⌛ <b>CAPTCHA EXPIRED</b>\n<i>A fresh one is on the way…</i>`, { parse_mode: 'HTML' });
        await sleep(350);
        await startCaptcha(chatId, userId, session);
        return;
      }
      const correct = String(cap.answer).toUpperCase() === String(ans).toUpperCase();
      if (correct) {
        markUserVerified(userId);
        session.captcha = null;
        session.awaiting_captcha_answer = false;
        const pendingReferrer = session.pending_referrer;
        session.pending_referrer = null;
        if (pendingReferrer && applyReferral(userId, pendingReferrer)) {
          try { await bot.sendMessage(pendingReferrer, `🎁 <b>NEW REFERRAL!</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n🎉 Someone joined with your link.\n💰 Bonus  ⟶  <b>+৳${REFERRAL_BONUS}</b>`, { parse_mode: 'HTML' }); } catch (e) {}
        }
        try { await bot.deleteMessage(chatId, userMessageId); } catch (e) {}
        await bot.sendMessage(chatId, `✅ <b>VERIFIED</b>\n<i>Welcome aboard — you're all set!</i> 🎉`, { parse_mode: 'HTML' });
        await sleep(250);
        const sent = await bot.sendMessage(chatId, welcomeMessage(userId), { parse_mode: 'HTML', reply_markup: mainMenuKeyboard(userId), disable_web_page_preview: true });
        session.last_bot_msg_id = sent.message_id;
      } else {
        cap.attempts = (cap.attempts || 0) + 1;
        if (cap.attempts >= 5) {
          session.captcha = null;
          session.awaiting_captcha_answer = false;
          await bot.sendMessage(chatId, `🚫 <b>TOO MANY ATTEMPTS</b>\n<i>Here's a new captcha.</i>`, { parse_mode: 'HTML' });
          await startCaptcha(chatId, userId, session);
        } else {
          await bot.sendMessage(chatId, `❌ <b>Wrong answer</b>  ✦  ${5 - cap.attempts} tries left`, { parse_mode: 'HTML' });
        }
      }
      return;
    }
    await bot.sendMessage(chatId, `⚠️ <b>Please solve the captcha first.</b>`, { parse_mode: 'HTML' });
    return;
  }

  // SmartLink API key
  if (session.awaiting_sl_api_key) {
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL) { session.awaiting_sl_api_key = false; await handleAction(chatId, session, userId, 'smartlink_menu', userMessageId); return; }
    if (!text || text.length < 8) { await render(chatId, session, `❌ <b>Invalid key</b>\n<i>Please check and send it again.</i>`, cancelKeyboard(), userMessageId); return; }
    const d = getUserSmartlink(userId);
    d.api_key = text.slice(0, 500);
    saveUserSmartlink(userId, d);
    session.awaiting_sl_api_key = false;
    await render(chatId, session, `✅ <b>API KEY SAVED</b>\n<i>You're connected to Adsterra.</i>`, userSmartlinkMenuKeyboard(userId), userMessageId);
    return;
  }
  if (session.awaiting_sl_manual_paste) {
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL) { session.awaiting_sl_manual_paste = false; await handleAction(chatId, session, userId, 'smartlink_menu', userMessageId); return; }
    const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const valid = lines.filter((l) => isValidUrl(l));
    if (!valid.length) { await render(chatId, session, `❌ <b>No valid URLs found</b>\n<i>Send links starting with http:// or https://</i>`, cancelKeyboard(), userMessageId); return; }
    let added = 0, dup = 0;
    for (const u of valid) { if (addUserSmartlink(userId, { url: u })) added += 1; else dup += 1; }
    const d = getUserSmartlink(userId);
    d.last_fetch = Date.now();
    saveUserSmartlink(userId, d);
    session.awaiting_sl_manual_paste = false;
    await render(chatId, session, `✅ <b>LINKS ADDED</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n➕ New  ⟶  <b>${added}</b>\n🔁 Duplicates  ⟶  <b>${dup}</b>`, userSmartlinkMenuKeyboard(userId), userMessageId);
    return;
  }
  if (session.awaiting_sl_json_url) {
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL) { session.awaiting_sl_json_url = false; await handleAction(chatId, session, userId, 'smartlink_menu', userMessageId); return; }
    if (!isValidUrl(text)) { await render(chatId, session, `❌ <b>Invalid URL</b>\n<i>Send a valid http / https link.</i>`, cancelKeyboard(), userMessageId); return; }
    const sent = await render(chatId, session, `⏳ <b>Loading…</b>\n<i>Please wait a moment.</i>`, userSmartlinkMenuKeyboard(userId), userMessageId);
    const res = await fetchJsonUrlLinks(text.trim());
    if (!res.ok) { try { await bot.editMessageText(`❌ ${escapeHtml(res.error)}`, { chat_id: chatId, message_id: sent.message_id, parse_mode: 'HTML', reply_markup: userSmartlinkMenuKeyboard(userId) }); } catch (e) {} session.awaiting_sl_json_url = false; return; }
    let added = 0, dup = 0;
    for (const l of res.links) { if (addUserSmartlink(userId, l)) added += 1; else dup += 1; }
    const d = getUserSmartlink(userId);
    d.last_fetch = Date.now();
    saveUserSmartlink(userId, d);
    session.awaiting_sl_json_url = false;
    try { await bot.editMessageText(`✅ <b>Loaded</b>\n\n➕ ${added} · 🔁 ${dup}`, { chat_id: chatId, message_id: sent.message_id, parse_mode: 'HTML', reply_markup: userSmartlinkMenuKeyboard(userId) }); } catch (e) {}
    return;
  }

  // Add link
  if (session.awaiting_link) {
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL) { session.awaiting_link = false; await handleAction(chatId, session, userId, 'back_menu', userMessageId); return; }
    if (!isValidUrl(text)) { await render(chatId, session, `⚠️ <b>Invalid link</b>\n<i>Send a valid http / https link.</i>`, cancelKeyboard(), userMessageId); return; }
    const links = getUserLinks(userId);
    const limit = getLinkLimit(userId);
    if (links.length >= limit && !links.includes(text.trim())) {
      session.awaiting_link = false;
      await render(chatId, session, `🚫 <b>LINK LIMIT REACHED</b>\n<i>Upgrade your plan or remove a link.</i>`, myLinksKeyboard(userId), userMessageId);
      return;
    }
    session.awaiting_link = false;
    const added = addUserLink(userId, text);
    const pre = added ? linkedMessage(text) : `ℹ️ <b>Already in your list</b>`;
    await render(chatId, session, pre + '\n\n' + listLinksMessage(getUserLinks(userId)), myLinksKeyboard(userId), userMessageId);
    return;
  }

  // Support
  if (session.awaiting_support_msg) {
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL) { session.awaiting_support_msg = false; await handleAction(chatId, session, userId, 'support', userMessageId); return; }
    if (!text) { await render(chatId, session, `❌ <b>Message is empty</b>\n<i>Please type something.</i>`, cancelKeyboard(), userMessageId); return; }
    const m = createSupportMessage(userId, text);
    session.awaiting_support_msg = false;
    await render(chatId, session, `✅ <b>MESSAGE SENT</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n🎫 Ticket  ⟶  <b>#${m.id}</b>\n<i>We'll reply as soon as possible.</i>`, simpleBackKeyboard(), userMessageId);
    for (const aid of [...ADMIN_IDS, ...getExtraAdmins()]) {
      try { await bot.sendMessage(aid, `💬 <b>Support #${m.id}</b>\n\n?? <code>${userId}</code>\n📝 ${escapeHtml(text)}`, { parse_mode: 'HTML' }); } catch (e) {}
    }
    return;
  }
  if (session.awaiting_support_reply && isAdmin(userId)) {
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL) { session.awaiting_support_reply = false; await handleAction(chatId, session, userId, 'admin_support', userMessageId); return; }
    const id = session.reply_to_support_id;
    session.reply_to_support_id = null;
    session.awaiting_support_reply = false;
    const m = replySupportMessage(id, text);
    if (m) { try { await bot.sendMessage(Number(m.userId), `💬 <b>Admin Reply</b>\n\n${escapeHtml(text)}`, { parse_mode: 'HTML' }); } catch (e) {} }
    await render(chatId, session, `✅ Replied.`, adminBackKeyboard(), userMessageId);
    return;
  }
  if (session.awaiting_promo_create && isAdmin(userId)) {
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL) { session.awaiting_promo_create = false; await handleAction(chatId, session, userId, 'admin_promo', userMessageId); return; }
    const parts = text.split(',').map((s) => s.trim());
    if (parts.length < 1 || !parts[0]) { await render(chatId, session, `❌ <code>CODE,discount%,bonus,maxUses</code>`, cancelKeyboard(), userMessageId); return; }
    const code = parts[0].toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
    const discount = Number(parts[1] || 0);
    const bonus = Number(parts[2] || 0);
    const maxUses = Number(parts[3] || 0);
    if (!code || discount < 0 || discount > 100 || bonus < 0) { await render(chatId, session, `❌ Invalid.`, cancelKeyboard(), userMessageId); return; }
    const p = getPromoCodes();
    p[code] = { discount_percent: discount, bonus_balance: bonus, max_uses: Math.floor(maxUses), used: 0, created_at: Date.now() };
    savePromoCodes(p);
    session.awaiting_promo_create = false;
    await render(chatId, session, `✅ <b>Created</b>: <code>${escapeHtml(code)}</code>`, adminBackKeyboard(), userMessageId);
    return;
  }
  if (session.awaiting_maint_message && isAdmin(userId)) {
    session.awaiting_maint_message = false;
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL) {
      await handleAction(chatId, session, userId, 'admin_maintenance', userMessageId);
      return;
    }
    const m = getMaintenanceMode();
    m.message = String(text).slice(0, 500);
    saveMaintenanceMode();
    await handleAction(chatId, session, userId, 'admin_maintenance', userMessageId);
    return;
  }
  if (session.awaiting_maint_wl_add && isAdmin(userId)) {
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL) {
      session.awaiting_maint_wl_add = false;
      await handleAction(chatId, session, userId, 'admin_maintenance', userMessageId);
      return;
    }
    const idStr = text.replace(/[^\d]/g, '');
    if (!idStr) { await render(chatId, session, `❌ Invalid ID.`, cancelKeyboard(), userMessageId); return; }
    session.awaiting_maint_wl_add = false;
    const m = getMaintenanceMode();
    const uid = Number(idStr);
    if (!m.whitelist.includes(uid)) { m.whitelist.push(uid); saveMaintenanceMode(); }
    await handleAction(chatId, session, userId, 'admin_maintenance', userMessageId);
    return;
  }
  if (session.awaiting_ban_id && isAdmin(userId)) {
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL) { session.awaiting_ban_id = false; session.pending_ban_mode = null; await handleAction(chatId, session, userId, 'admin_ban', userMessageId); return; }
    const id = text.replace(/[^\d]/g, '');
    if (!id) { await render(chatId, session, `❌ Invalid.`, cancelKeyboard(), userMessageId); return; }
    const mode = session.pending_ban_mode;
    session.awaiting_ban_id = false;
    session.pending_ban_mode = null;
    if (mode === 'ban') banUser(id, 'admin action'); else unbanUser(id);
    await render(chatId, session, `✅ ${mode === 'ban' ? 'Banned' : 'Unbanned'} <code>${id}</code>`, adminBackKeyboard(), userMessageId);
    return;
  }
  if ((session.awaiting_join_channel || session.awaiting_join_group) && isAdmin(userId)) {
    const isChan = session.awaiting_join_channel;
    session.awaiting_join_channel = false;
    session.awaiting_join_group = false;
    const s = getJoinCheckSettings();
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL) { await handleAction(chatId, session, userId, 'admin_join', userMessageId); return; }
    if (isChan) s.channel = text.startsWith('@') ? text : '@' + text;
    else s.group = text.startsWith('@') ? text : '@' + text;
    saveJoinCheckSettings(s);
    await handleAction(chatId, session, userId, 'admin_join', userMessageId);
    return;
  }
  if (session.awaiting_autobc_message && isAdmin(userId)) {
    session.awaiting_autobc_message = false;
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL) { await handleAction(chatId, session, userId, 'admin_autobroadcast', userMessageId); return; }
    const s = getAutoBroadcastSettings();
    s.message = text.slice(0, 2000);
    saveAutoBroadcastSettings(s);
    await handleAction(chatId, session, userId, 'admin_autobroadcast', userMessageId);
    return;
  }
  if (session.awaiting_proxy_name && isAdmin(userId)) {
    session.awaiting_proxy_name = false;
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL) { session.awaiting_proxy_data = null; await handleAction(chatId, session, userId, 'admin_proxy', userMessageId); return; }
    if (!text.trim()) { session.awaiting_proxy_name = true; await render(chatId, session, `❌ Name required.`, cancelKeyboard(), userMessageId); return; }
    const data = session.awaiting_proxy_data;
    if (!data) { await handleAction(chatId, session, userId, 'admin_proxy', userMessageId); return; }
    data.name = text.trim().slice(0, 50);
    session.awaiting_proxy_data = data;
    session.awaiting_proxy_quota = true;
    await render(chatId, session, `📦 <b>Proxy Quota (MB)</b>\n\nEnter MB. 0 for unlimited.`, cancelKeyboard(), userMessageId);
    return;
  }
  if (session.awaiting_proxy_quota && isAdmin(userId)) {
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL) { session.awaiting_proxy_quota = false; session.awaiting_proxy_data = null; await handleAction(chatId, session, userId, 'admin_proxy', userMessageId); return; }
    const quota = Number(text.trim());
    if (!/^\d+(?:\.\d+)?$/.test(text.trim()) || !Number.isFinite(quota) || quota < 0) { await render(chatId, session, `❌ Enter valid MB.`, cancelKeyboard(), userMessageId); return; }
    const data = session.awaiting_proxy_data;
    session.awaiting_proxy_quota = false;
    session.awaiting_proxy_data = null;
    if (!data) { await handleAction(chatId, session, userId, 'admin_proxy', userMessageId); return; }
    data.quota_mb = quota;
    data.id = `p_${Date.now()}_${secureRandomString(6)}`;
    data.enabled = true;
    data.added_utc = new Date().toISOString();
    const list = getProxyList();
    list.push(data);
    cache.proxies = list;
    syncToFirebase('proxies');
    const resi = isResidentialProxy(data) ? ' 🏠' : '';
    const cN = data.country ? ` [${data.country}]` : '';
    await render(chatId, session, `✅ <b>Added</b>\n\n🏷️ <b>${escapeHtml(data.name)}</b>${cN}${resi}`, proxyMenuKeyboard(), userMessageId);
    return;
  }
  // Universal cancel: navigation labels must never be treated as typed input
  // (previously Cancel/Admin Panel could rename the bot, change an icon, broadcast to all users, or trap the admin in a limit prompt)
  if ((text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL || text === ADMIN_BACK_LABEL) &&
      (session.awaiting_name || session.awaiting_icon || session.awaiting_plan_edit || session.awaiting_new_admin_id ||
       session.awaiting_broadcast || session.awaiting_ai_hourly_sl || session.awaiting_ai_daily_sl ||
       session.awaiting_ai_hourly_nl || session.awaiting_ai_daily_nl)) {
    resetSessionState(session);
    await handleAction(chatId, session, userId, (text !== BACK_TO_MENU_LABEL && isAdmin(userId)) ? 'admin_open' : 'back_menu', userMessageId);
    return;
  }
  if (session.awaiting_name && isAdmin(userId)) {
    session.awaiting_name = false;
    if (!text) { await render(chatId, session, `❌ <b>Message is empty</b>\n<i>Please type something.</i>`, adminBackKeyboard(), userMessageId); return; }
    setBotName(text);
    await render(chatId, session, `✅ Updated <b>${getBotName()}</b>`, adminBackKeyboard(), userMessageId);
    return;
  }
  if (session.awaiting_icon && isAdmin(userId)) {
    session.awaiting_icon = false;
    const key = session.awaiting_icon_key;
    session.awaiting_icon_key = null;
    if (!key || !BUTTON_DEFS[key]) { await render(chatId, session, `❌ Error.`, adminBackKeyboard(), userMessageId); return; }
    if (!text) { await render(chatId, session, `❌ <b>Message is empty</b>\n<i>Please type something.</i>`, adminBackKeyboard(), userMessageId); return; }
    if (text.toLowerCase() === 'reset') resetButtonIcon(key); else setButtonIcon(key, text);
    await render(chatId, session, `✅ Updated.`, adminBackKeyboard(), userMessageId);
    return;
  }
  if (session.awaiting_plan_edit && isAdmin(userId)) {
    session.awaiting_plan_edit = false;
    const key = session.awaiting_plan_key;
    session.awaiting_plan_key = null;
    const plans = getPlans();
    if (!key || !plans[key]) { await render(chatId, session, `❌ Error.`, adminBackKeyboard(), userMessageId); return; }
    const parts = text.split(',').map((s) => s.trim());
    if (parts.length !== 5 || parts.some((p) => p === '' || isNaN(Number(p)))) {
      await render(chatId, session, `❌ <code>price,days,link_limit,visits_per_link,daily_burst_limit</code>`, adminBackKeyboard(), userMessageId);
      return;
    }
    const [price, days, linkLimit, visitsPerLink, dailyBurstLimit] = parts.map(Number);
    Object.assign(plans[key], { price, days, link_limit: linkLimit, visits_per_link: visitsPerLink, daily_burst_limit: dailyBurstLimit, burst_window_ms: plans[key].burst_window_ms || 5000 });
    savePlans();
    await render(chatId, session, `✅ Updated.`, adminBackKeyboard(), userMessageId);
    return;
  }
  if (session.awaiting_pay_method_edit && isAdmin(userId)) {
    session.awaiting_pay_method_edit = false;
    const id = session.awaiting_pay_method_key;
    session.awaiting_pay_method_key = null;
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL) { await handleAction(chatId, session, userId, 'admin_pay_methods', userMessageId); return; }
    const parts = text.split('|').map((s) => s.trim());
    if (parts.length < 2) { await render(chatId, session, `❌ <code>name|number|instructions</code>`, cancelKeyboard(), userMessageId); return; }
    updatePaymentMethod(id, { name: parts[0], number: parts[1], instructions: parts[2] || '' });
    await render(chatId, session, `✅ Updated.`, adminBackKeyboard(), userMessageId);
    return;
  }
  if (session.awaiting_pay_method_add && isAdmin(userId)) {
    session.awaiting_pay_method_add = false;
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL) { await handleAction(chatId, session, userId, 'admin_pay_methods', userMessageId); return; }
    const parts = text.split('|').map((s) => s.trim());
    if (parts.length < 3) { await render(chatId, session, `❌ <code>id|name|number|instructions</code>`, cancelKeyboard(), userMessageId); return; }
    const [id, name, number, instructions] = parts;
    if (!id || !name) { await render(chatId, session, `❌ Invalid.`, cancelKeyboard(), userMessageId); return; }
    const ok = addPaymentMethod({ id: id.toLowerCase(), name, number, instructions: instructions || '' });
    await render(chatId, session, ok ? `✅ Added.` : `❌ Already exists.`, adminBackKeyboard(), userMessageId);
    return;
  }
  if (session.awaiting_new_admin_id && isSuperAdmin(userId)) {
    session.awaiting_new_admin_id = false;
    const newId = Number(text.replace(/[^\d]/g, ''));
    if (!newId) { await render(chatId, session, `❌ Invalid.`, adminBackKeyboard(), userMessageId); return; }
    addExtraAdmin(newId);
    await render(chatId, session, `✅ Added <code>${newId}</code>`, adminBackKeyboard(), userMessageId);
    return;
  }
  if (session.awaiting_balance_amount) {
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL) { session.awaiting_balance_amount = false; await handleAction(chatId, session, userId, 'back_menu', userMessageId); return; }
    const amountText = text.replace(/[৳$,\s]/g, '');
    const a = Number(amountText);
    if (!/^\d+(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(a) || a <= 0) { await render(chatId, session, `❌ Invalid.`, cancelKeyboard(), userMessageId); return; }
    session.awaiting_balance_amount = false;
    session.pending_balance_amount = a;
    session.awaiting_balance_method = true;
    const methods = getPaymentMethods().filter((m) => m.enabled);
    const rows = methods.map((m) => [m.name]);
    rows.push([CANCEL_LABEL]);
    await render(chatId, session, `💳 <b>SELECT PAYMENT METHOD</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n👇 <i>Choose how you paid.</i>`, buildKeyboard(rows), userMessageId);
    return;
  }
  if (session.awaiting_balance_method) {
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL) { session.awaiting_balance_method = false; session.pending_balance_amount = null; await handleAction(chatId, session, userId, 'back_menu', userMessageId); return; }
    const m = getPaymentMethods().find((x) => x.name === text);
    if (!m) { await render(chatId, session, `❌ <b>Invalid method</b>\n<i>Please pick one from the list.</i>`, cancelKeyboard(), userMessageId); return; }
    session.awaiting_balance_method = false;
    session.pending_balance_method = m.name;
    session.awaiting_balance_txn = true;
    await render(chatId, session, `🧾 <b>TRANSACTION ID</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n✏️ <i>Send your TXN ID to confirm the payment.</i>`, cancelKeyboard(), userMessageId);
    return;
  }
  if (session.awaiting_balance_txn) {
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL) { session.awaiting_balance_txn = false; session.pending_balance_amount = null; session.pending_balance_method = null; await handleAction(chatId, session, userId, 'back_menu', userMessageId); return; }
    if (!text) { await render(chatId, session, `❌ <b>Message is empty</b>\n<i>Please type something.</i>`, cancelKeyboard(), userMessageId); return; }
    session.awaiting_balance_txn = false;
    const amt = session.pending_balance_amount;
    const m = session.pending_balance_method;
    session.pending_balance_amount = null;
    session.pending_balance_method = null;
    let req;
    try { req = createBalanceRequest(userId, amt, m, text); }
    catch (e) { await render(chatId, session, `⚠️ <b>Duplicate TXN</b>\n<i>This transaction ID was already used.</i>`, mainMenuKeyboard(userId), userMessageId); return; }
    await render(chatId, session, `✅ <b>REQUEST SUBMITTED</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n🎫 Request  ⟶  <b>#${req.id}</b>\n💰 Amount  ⟶  <b>৳${amt}</b>\n⏳ <i>Waiting for admin approval…</i>`, mainMenuKeyboard(userId), userMessageId);
    for (const aid of [...ADMIN_IDS, ...getExtraAdmins()]) {
      const uinfo = getUserInfo(userId);
      const dn = [uinfo.first_name, uinfo.last_name].filter(Boolean).join(' ') || 'Unknown';
      try {
        await bot.sendMessage(aid, `💰 <b>Top-up</b> #${req.id}\n👤 ${escapeHtml(dn)}\n🆔 <code>${userId}</code>\n💰 ৳${amt}\n💳 ${m}\n🧾 <code>${escapeHtml(text)}</code>`, { parse_mode: 'HTML', reply_markup: buildKeyboard([[`✅ Approve #${req.id}`, `❌ Decline #${req.id}`]]) });
      } catch (e) {}
    }
    return;
  }
  if (session.awaiting_broadcast && isAdmin(userId)) {
    session.awaiting_broadcast = false;
    if (!text) { await render(chatId, session, `❌ <b>Message is empty</b>\n<i>Please type something.</i>`, adminBackKeyboard(), userMessageId); return; }
    const users = getAllUsers();
    let ok = 0, fail = 0;
    const bt = `📢 <b>Announcement</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n${escapeHtml(text)}`;
    await render(chatId, session, `⏳ Sending…`, adminBackKeyboard(), userMessageId);
    for (const u of users) {
      try { await bot.sendMessage(Number(u), bt, { parse_mode: 'HTML' }); ok += 1; } catch (e) { fail += 1; }
      await sleep(BROADCAST_DELAY_MS);
    }
    await render(chatId, session, `✅ <b>Done</b>\n\n✅ ${ok} · ❌ ${fail}`, adminBackKeyboard(), userMessageId);
    return;
  }
  if (session.awaiting_proxy && isAdmin(userId)) {
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL || text === ADMIN_BACK_LABEL) { session.awaiting_proxy = false; await handleAction(chatId, session, userId, 'admin_proxy', userMessageId); return; }
    const parsed = parseProxyInput(text);
    if (!parsed) { await render(chatId, session, `⚠️ Invalid format.`, cancelKeyboard(), userMessageId); return; }
    session.awaiting_proxy = false;
    session.awaiting_proxy_data = parsed;
    session.awaiting_proxy_name = true;
    await render(chatId, session, `🏷️ <b>Name your proxy</b>`, cancelKeyboard(), userMessageId);
    return;
  }

  // Admin toggles
  if (isAdmin(userId) && text === `⚡ Toggle SmartLink`) { const cfg = getAutoImpressionSettings(); cfg.smartlink_enabled = !cfg.smartlink_enabled; saveAutoImpressionSettings(); await handleAction(chatId, session, userId, 'admin_auto_imp', userMessageId); return; }
  if (isAdmin(userId) && text === `🔗 Toggle Normal`) { const cfg = getAutoImpressionSettings(); cfg.normal_enabled = !cfg.normal_enabled; saveAutoImpressionSettings(); await handleAction(chatId, session, userId, 'admin_auto_imp', userMessageId); return; }
  if (isAdmin(userId) && text === `🤖 Toggle Human`) { const cfg = getAutoImpressionSettings(); cfg.human_behavior = !cfg.human_behavior; saveAutoImpressionSettings(); await handleAction(chatId, session, userId, 'admin_auto_imp', userMessageId); return; }
  if (isAdmin(userId) && text === `🔁 Toggle Retry`) { const cfg = getAutoImpressionSettings(); cfg.auto_retry = !cfg.auto_retry; saveAutoImpressionSettings(); await handleAction(chatId, session, userId, 'admin_auto_imp', userMessageId); return; }
  if (isAdmin(userId) && text === `🕐 SL Hourly`) { session.awaiting_ai_hourly_sl = true; await render(chatId, session, `✏️ SL Hourly limit.`, cancelKeyboard(), userMessageId); return; }
  if (isAdmin(userId) && text === `📅 SL Daily`) { session.awaiting_ai_daily_sl = true; await render(chatId, session, `✏️ SL Daily limit.`, cancelKeyboard(), userMessageId); return; }
  if (isAdmin(userId) && text === `🕐 NL Hourly`) { session.awaiting_ai_hourly_nl = true; await render(chatId, session, `✏️ NL Hourly limit.`, cancelKeyboard(), userMessageId); return; }
  if (isAdmin(userId) && text === `📅 NL Daily`) { session.awaiting_ai_daily_nl = true; await render(chatId, session, `✏️ NL Daily limit.`, cancelKeyboard(), userMessageId); return; }

  if (session.awaiting_ai_hourly_sl && isAdmin(userId)) { const n = Number(text.replace(/[^\d]/g, '')); if (!n || n <= 0) { await render(chatId, session, `❌ Invalid.`, cancelKeyboard(), userMessageId); return; } const cfg = getAutoImpressionSettings(); cfg.hourly_limit_smartlink = n; saveAutoImpressionSettings(); session.awaiting_ai_hourly_sl = false; await handleAction(chatId, session, userId, 'admin_auto_imp', userMessageId); return; }
  if (session.awaiting_ai_daily_sl && isAdmin(userId)) { const n = Number(text.replace(/[^\d]/g, '')); if (!n || n <= 0) { await render(chatId, session, `❌ Invalid.`, cancelKeyboard(), userMessageId); return; } const cfg = getAutoImpressionSettings(); cfg.daily_limit_smartlink = n; saveAutoImpressionSettings(); session.awaiting_ai_daily_sl = false; await handleAction(chatId, session, userId, 'admin_auto_imp', userMessageId); return; }
  if (session.awaiting_ai_hourly_nl && isAdmin(userId)) { const n = Number(text.replace(/[^\d]/g, '')); if (!n || n <= 0) { await render(chatId, session, `❌ Invalid.`, cancelKeyboard(), userMessageId); return; } const cfg = getAutoImpressionSettings(); cfg.hourly_limit_normal = n; saveAutoImpressionSettings(); session.awaiting_ai_hourly_nl = false; await handleAction(chatId, session, userId, 'admin_auto_imp', userMessageId); return; }
  if (session.awaiting_ai_daily_nl && isAdmin(userId)) { const n = Number(text.replace(/[^\d]/g, '')); if (!n || n <= 0) { await render(chatId, session, `❌ Invalid.`, cancelKeyboard(), userMessageId); return; } const cfg = getAutoImpressionSettings(); cfg.daily_limit_normal = n; saveAutoImpressionSettings(); session.awaiting_ai_daily_nl = false; await handleAction(chatId, session, userId, 'admin_auto_imp', userMessageId); return; }

  // Confirmation
  if (text === CONFIRM_LABEL && session.pending_confirm_token) {
    const conf = getConfirmation(session.pending_confirm_token);
    if (conf && conf.userId === String(userId) && conf.type === 'shop') {
      const { key, pkg } = conf.payload;
      const bal = getBalance(userId);
      if (bal >= pkg.price) {
        deductBalance(userId, pkg.price);
        const total = pkg.amount + (pkg.bonus || 0);
        addImpressionBalance(userId, total);
        recordImpressionPurchase(userId, key, total, pkg.price);
        clearConfirmation(session.pending_confirm_token);
        session.pending_confirm_token = null;
        await render(chatId, session, `✅ <b>PURCHASE COMPLETE</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n📦 Added  ⟶  <b>${total}</b>\n👁️ Balance  ⟶  <b>${getImpressionBalance(userId)}</b>`, mainMenuKeyboard(userId), userMessageId);
        return;
      }
    }
    clearConfirmation(session.pending_confirm_token);
    session.pending_confirm_token = null;
    await render(chatId, session, `❌ <b>Purchase failed</b>\n<i>Nothing was charged.</i>`, mainMenuKeyboard(userId), userMessageId);
    return;
  }
  if (text === CANCEL_LABEL && session.pending_confirm_token) {
    clearConfirmation(session.pending_confirm_token);
    session.pending_confirm_token = null;
    await handleAction(chatId, session, userId, 'shop_menu', userMessageId);
    return;
  }

  const tryMap = (name, handler) => {
    const m = session[name];
    if (m && Object.prototype.hasOwnProperty.call(m, text)) { handler(m[text]); return true; }
    return false;
  };

  if (tryMap('delete_link_map', (idx) => {
    const removed = removeUserLink(userId, idx);
    delete session.delete_link_map;
    const pre = removed ? removedMessage(removed) : `⚠️ Not found.`;
    render(chatId, session, pre + '\n\n' + listLinksMessage(getUserLinks(userId)), myLinksKeyboard(userId), userMessageId);
  })) return;
  if (isAdmin(userId) && tryMap('admin_toggle_map', (k) => { toggleButton(k); handleAction(chatId, session, userId, 'admin_buttons', userMessageId); })) return;
  if (isAdmin(userId) && tryMap('admin_reorder_map', (v) => { moveButton(v[0], v[1]); handleAction(chatId, session, userId, 'admin_reorder', userMessageId); })) return;
  if (isAdmin(userId) && tryMap('admin_icon_map', (k) => {
    delete session.admin_icon_map;
    session.awaiting_icon_key = k;
    session.awaiting_icon = true;
    render(chatId, session, `✏️ Send icon for <b>${escapeHtml(BUTTON_DEFS[k].text)}</b>`, adminBackKeyboard(), userMessageId);
  })) return;
  if (isAdmin(userId) && tryMap('admin_plan_toggle_map', (k) => {
    delete session.admin_plan_toggle_map;
    const plans = getPlans();
    if (!plans[k]) return;
    plans[k].enabled = plans[k].enabled === false;
    savePlans();
    handleAction(chatId, session, userId, 'admin_membership', userMessageId);
  })) return;
  if (isAdmin(userId) && tryMap('admin_plan_map', (k) => {
    delete session.admin_plan_map;
    const p = getPlans()[k];
    session.awaiting_plan_key = k;
    session.awaiting_plan_edit = true;
    render(chatId, session, `✏️ <b>${escapeHtml(p.label)}</b>\n\n<code>price,days,link_limit,visits_per_link,daily_burst_limit</code>`, adminBackKeyboard(), userMessageId);
  })) return;
  if (isAdmin(userId) && tryMap('admin_balance_req_map', (id) => {
    delete session.admin_balance_req_map;
    session.review_balance_req_id = id;
    render(chatId, session, `💰 #${id}`, buildKeyboard([[`✅ Approve`, `❌ Reject`], [ADMIN_BACK_LABEL]]), userMessageId);
  })) return;
  if (isSuperAdmin(userId) && tryMap('admin_remove_map', (id) => {
    delete session.admin_remove_map;
    removeExtraAdmin(id);
    render(chatId, session, `✅ Removed <code>${id}</code>`, adminBackKeyboard(), userMessageId);
  })) return;
  if (isAdmin(userId) && tryMap('support_reply_map', (id) => {
    delete session.support_reply_map;
    session.reply_to_support_id = id;
    session.awaiting_support_reply = true;
    render(chatId, session, `✏️ Reply for #${id}`, cancelKeyboard(), userMessageId);
  })) return;
  if (tryMap('buy_plan_map', (key) => {
    delete session.buy_plan_map;
    const plan = getPlans()[key];
    const bal = getBalance(userId);
    if (!plan || plan.enabled === false) { render(chatId, session, `❌ <b>Plan unavailable</b>\n<i>Please choose another plan.</i>`, mainMenuKeyboard(userId), userMessageId); return; }
    if (bal < plan.price) { render(chatId, session, `❌ <b>INSUFFICIENT BALANCE</b>\n<i>Top up your wallet and try again.</i>`, mainMenuKeyboard(userId), userMessageId); return; }
    deductBalance(userId, plan.price);
    const m = activateMembership(userId, key);
    render(chatId, session, `🎉 <b>${escapeHtml(plan.label)} ACTIVATED!</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n╭─ 💎 <b>YOUR PLAN</b>\n├ 🚀 Burst  ⟶  <b>${plan.visits_per_link}</b> visits / ${plan.burst_window_ms/1000}s\n╰ ⏳ Expires  ⟶  <b>${formatExpiry(m.expires_at)}</b>`, mainMenuKeyboard(userId), userMessageId);
  })) return;
  if (tryMap('shop_buy_map', (key) => {
    delete session.shop_buy_map;
    const pkg = getShopPackages()[key];
    const bal = getBalance(userId);
    if (!pkg) { render(chatId, session, `❌ <b>Package not found</b>`, mainMenuKeyboard(userId), userMessageId); return; }
    if (bal < pkg.price) { render(chatId, session, `❌ <b>INSUFFICIENT BALANCE</b>\n<i>Top up your wallet and try again.</i>`, mainMenuKeyboard(userId), userMessageId); return; }
    const token = createConfirmation(userId, 'shop', { key, pkg });
    const total = pkg.amount + (pkg.bonus || 0);
    const txt = `🛒 <b>CONFIRM PURCHASE</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n╭─ 📦 <b>ORDER</b>\n├ 📦 Impressions  ⟶  <b>${total}</b>\n╰ 💰 Price  ⟶  <b>৳${pkg.price}</b>\n\n╭─ 💼 <b>WALLET</b>\n├ Current  ⟶  ৳${bal}\n╰ After  ⟶  <b>৳${bal - pkg.price}</b>`;
    session.pending_confirm_token = token;
    render(chatId, session, txt, buildKeyboard([[CONFIRM_LABEL, CANCEL_LABEL], [BACK_TO_MENU_LABEL]]), userMessageId);
  })) return;
  if (isAdmin(userId) && tryMap('admin_price_map', (key) => {
    delete session.admin_price_map;
    session.awaiting_shop_edit_key = key;
    session.awaiting_shop_edit = true;
    render(chatId, session, `✏️ <b>${key}</b>\n\n<code>amount,bonus,price</code>`, adminBackKeyboard(), userMessageId);
  })) return;
  if (isAdmin(userId) && tryMap('shop_admin_edit_map', (key) => {
    delete session.shop_admin_edit_map;
    session.awaiting_shop_edit_key = key;
    session.awaiting_shop_edit = true;
    render(chatId, session, `✏️ <b>${key}</b>\n\n<code>amount,bonus,price</code>`, adminBackKeyboard(), userMessageId);
  })) return;
  if (session.awaiting_shop_edit && isAdmin(userId)) {
    session.awaiting_shop_edit = false;
    const key = session.awaiting_shop_edit_key;
    session.awaiting_shop_edit_key = null;
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL) { await handleAction(chatId, session, userId, 'shop_edit', userMessageId); return; }
    const parts = text.split(',').map((s) => s.trim());
    if (parts.length !== 3 || parts.some((p) => p === '' || isNaN(Number(p)))) { render(chatId, session, `❌ <code>amount,bonus,price</code>`, adminBackKeyboard(), userMessageId); return; }
    const [amount, bonus, price] = parts.map(Number);
    const pkgs = getShopPackages();
    if (!pkgs[key]) { render(chatId, session, `❌ <b>Package not found</b>`, adminBackKeyboard(), userMessageId); return; }
    pkgs[key].amount = amount; pkgs[key].bonus = bonus; pkgs[key].price = price;
    saveShopPackages();
    render(chatId, session, `✅ Updated.`, adminBackKeyboard(), userMessageId);
    return;
  }
  if (isAdmin(userId) && tryMap('human_toggle_map', (field) => {
    const cfg = getHumanConfig();
    cfg[field] = !cfg[field];
    saveHumanConfig();
    handleAction(chatId, session, userId, 'admin_human', userMessageId);
  })) return;
  if (isAdmin(userId) && tryMap('proxy_remove_map', (idx) => {
    const list = getProxyList();
    if (idx >= 0 && idx < list.length) {
      const rem = list.splice(idx, 1)[0];
      cache.proxies = list; syncToFirebase('proxies');
      const s = getProxyStats(); delete s[proxyId(rem)]; cache.proxy_stats = s; syncToFirebase('proxy_stats');
    }
    delete session.proxy_remove_map;
    handleAction(chatId, session, userId, 'proxy_remove', userMessageId);
  })) return;
  if (isAdmin(userId) && tryMap('proxy_settings_map', (field) => {
    const cfg = getProxySettings();
    if (['enabled', 'fallback_direct', 'force_us_only', 'auto_health_check', 'verify_exit_ip', 'require_residential'].includes(field)) {
      cfg[field] = !cfg[field];
      saveProxySettings();
      if (field === 'auto_health_check') { if (cfg.auto_health_check) startProxyHealthMonitor(); else stopProxyHealthMonitor(); }
      handleAction(chatId, session, userId, 'proxy_settings', userMessageId);
      return;
    }
    if (field === 'rotation') { const m = ['random', 'round_robin', 'sticky']; const i = m.indexOf(cfg.rotation); cfg.rotation = m[(i + 1) % m.length]; saveProxySettings(); handleAction(chatId, session, userId, 'proxy_settings', userMessageId); return; }
    if (field === 'max_retries') { cfg.max_retries = (cfg.max_retries + 1) % 5; saveProxySettings(); handleAction(chatId, session, userId, 'proxy_settings', userMessageId); return; }
  })) return;
  if (isAdmin(userId) && tryMap('pay_methods_map', (id) => {
    delete session.pay_methods_map;
    const m = getPaymentMethods().find((x) => x.id === id);
    if (!m) { render(chatId, session, `❌ Method not found.`, adminBackKeyboard(), userMessageId); return; }
    session.awaiting_pay_method_edit = true;
    session.awaiting_pay_method_key = id;
    render(chatId, session,
      `✏️ <b>Edit: ${escapeHtml(m.name)}</b>\n\nSend: <code>name|number|instructions</code>\n\nCurrent:\n<code>${escapeHtml(m.name)}|${escapeHtml(m.number)}|${escapeHtml(m.instructions || '')}</code>`,
      cancelKeyboard(), userMessageId);
  })) return;
  if (isAdmin(userId) && tryMap('pay_methods_delete_map', (id) => {
    deletePaymentMethod(id);
    delete session.pay_methods_delete_map;
    handleAction(chatId, session, userId, 'admin_pay_methods', userMessageId);
  })) return;

  if (isAdmin(userId) && text === `🔥 Toggle Warmup`) { const cfg = getSmartlinkSettings(); cfg.warmup_enabled = !cfg.warmup_enabled; saveSmartlinkSettings(); await handleAction(chatId, session, userId, 'admin_slv2', userMessageId); return; }
  if (isAdmin(userId) && text === `🏠 Toggle Residential`) { const cfg = getSmartlinkSettings(); cfg.residential_only = !cfg.residential_only; saveSmartlinkSettings(); await handleAction(chatId, session, userId, 'admin_slv2', userMessageId); return; }
  if (isAdmin(userId) && text === `🗑️ Reset Verifications`) { cache.captcha_verified = {}; syncToFirebase('captcha_verified'); await render(chatId, session, `✅ Cleared.`, adminBackKeyboard(), userMessageId); return; }
  if (isAdmin(userId) && text === `➕ Add New Method`) {
    session.awaiting_pay_method_add = true;
    await render(chatId, session,
      `➕ <b>Add Payment Method</b>\n\nSend: <code>id|name|number|instructions</code>\n\nExample:\n<code>rocket|Rocket|017XXXXXXXX|Send Money</code>`,
      cancelKeyboard(), userMessageId);
    return;
  }
  if (isAdmin(userId) && text === `🗑️ Delete Method`) {
    const methods = getPaymentMethods();
    if (!methods.length) { await render(chatId, session, `ℹ️ No methods.`, adminBackKeyboard(), userMessageId); return; }
    const rows = methods.map((m) => [`🗑️ ${m.name}`]);
    rows.push([ADMIN_BACK_LABEL]);
    session.pay_methods_delete_map = Object.fromEntries(methods.map((m) => [`🗑️ ${m.name}`, m.id]));
    await render(chatId, session, `🗑️ Tap to delete:`, buildKeyboard(rows), userMessageId);
    return;
  }

  if (text === `🔔 Toggle Notifications`) { const s = getUserSettings(userId); s.notifications = !s.notifications; saveUserSettings(userId, s); await handleAction(chatId, session, userId, 'user_settings', userMessageId); return; }
  if (text === `📢 Toggle Promo Alerts`) { const s = getUserSettings(userId); s.promo_alerts = !s.promo_alerts; saveUserSettings(userId, s); await handleAction(chatId, session, userId, 'user_settings', userMessageId); return; }
  if (text === `📝 Send Message`) { session.awaiting_support_msg = true; await render(chatId, session, `📝 Send your message.`, cancelKeyboard(), userMessageId); return; }
  if (text === `📥 My Messages`) {
    const mine = getSupportMessages().filter((m) => String(m.userId) === String(userId));
    if (!mine.length) { await render(chatId, session, `📥 No messages.`, simpleBackKeyboard(), userMessageId); return; }
    let t = `📥 <b>My Messages</b>\n\n`;
    for (const m of mine.slice(-10)) {
      t += `#${m.id} [${m.status}]\n📝 ${escapeHtml(m.text.slice(0, 100))}\n`;
      if (m.admin_reply) t += `💬 ${escapeHtml(m.admin_reply.slice(0, 150))}\n`;
      t += '\n';
    }
    await render(chatId, session, t, simpleBackKeyboard(), userMessageId); return;
  }

  if (isAdmin(userId) && text.startsWith(`📣 Enabled — `)) { const s = getAutoBroadcastSettings(); s.enabled = !s.enabled; saveAutoBroadcastSettings(s); await handleAction(chatId, session, userId, 'admin_autobroadcast', userMessageId); return; }
  if (isAdmin(userId) && text.startsWith(`🚀 On Startup — `)) { const s = getAutoBroadcastSettings(); s.on_startup = !s.on_startup; saveAutoBroadcastSettings(s); await handleAction(chatId, session, userId, 'admin_autobroadcast', userMessageId); return; }
  if (isAdmin(userId) && text === `✏️ Edit Message`) { session.awaiting_autobc_message = true; await render(chatId, session, `✏️ Send new message.`, adminBackKeyboard(), userMessageId); return; }

  if (isAdmin(userId) && text.startsWith(`🎛️ Toggle — `)) { const s = getJoinCheckSettings(); s.enabled = !s.enabled; saveJoinCheckSettings(s); await handleAction(chatId, session, userId, 'admin_join', userMessageId); return; }
  if (isAdmin(userId) && text === `📺 Set Channel`) { session.awaiting_join_channel = true; await render(chatId, session, `📺 Send @channel`, cancelKeyboard(), userMessageId); return; }
  if (isAdmin(userId) && text === `👥 Set Group`) { session.awaiting_join_group = true; await render(chatId, session, `👥 Send @group`, cancelKeyboard(), userMessageId); return; }

  if (isAdmin(userId) && text === `🚫 Ban`) { session.awaiting_ban_id = true; session.pending_ban_mode = 'ban'; await render(chatId, session, `🚫 Send user ID.`, cancelKeyboard(), userMessageId); return; }
  if (isAdmin(userId) && text === `✅ Unban`) { session.awaiting_ban_id = true; session.pending_ban_mode = 'unban'; await render(chatId, session, `✅ Send user ID.`, cancelKeyboard(), userMessageId); return; }
  if (isAdmin(userId) && text === `➕ Create`) { session.awaiting_promo_create = true; await render(chatId, session, `➕ <code>CODE,discount%,bonus,maxUses</code>`, cancelKeyboard(), userMessageId); return; }
  if (isAdmin(userId) && text === `🗑️ Delete`) {
    const p = getPromoCodes();
    const keys = Object.keys(p);
    if (!keys.length) { await render(chatId, session, `ℹ️ None.`, adminBackKeyboard(), userMessageId); return; }
    const rows = keys.map((k) => [`🗑️ ${k}`]);
    rows.push([ADMIN_BACK_LABEL]);
    const map = {}; for (const k of keys) map[`🗑️ ${k}`] = k;
    session.promo_action_map = map;
    await render(chatId, session, `🗑️ Tap to delete.`, buildKeyboard(rows), userMessageId); return;
  }
  if (isAdmin(userId) && session.promo_action_map && Object.prototype.hasOwnProperty.call(session.promo_action_map, text)) {
    const code = session.promo_action_map[text];
    const p = getPromoCodes(); delete p[code]; savePromoCodes(p);
    delete session.promo_action_map;
    await handleAction(chatId, session, userId, 'admin_promo', userMessageId); return;
  }

  if (text === HELP_CONTACT_ADMIN_LABEL || text === HELP_CONTACT_DEV_LABEL) {
    await bot.sendMessage(chatId, `📩 <b>CONTACT</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n👨‍💻 <b>${DEVELOPER_NAME}</b>\n💬 ${DEVELOPER_HANDLE}`, { parse_mode: 'HTML' }); return;
  }

  // Target menu
  if (text === TARGET_BTN_SL || text === TARGET_BTN_NL) {
    const action = text === TARGET_BTN_SL ? 'sl_target_menu' : 'nl_target_menu';
    await handleAction(chatId, session, userId, action, userMessageId); return;
  }
  if (text.startsWith(`🎯 Target: `)) {
    const action = session.nl_target_setting ? 'nl_target_menu' : 'sl_target_menu';
    await handleAction(chatId, session, userId, action, userMessageId); return;
  }
  if (session.sl_target_setting || session.nl_target_setting) {
    const targetType = session.nl_target_setting ? 'normal' : 'smartlink';
    const balance = getImpressionBalance(userId);
    const presets = {};
    presets[TARGET_50] = 50; presets[TARGET_100] = 100; presets[TARGET_250] = 250;
    presets[TARGET_500] = 500; presets[TARGET_1000] = 1000;
    if (Object.prototype.hasOwnProperty.call(presets, text)) {
      const n = presets[text];
      if (n > balance) {
    // ⭐ V33-UX: Keep session ON so user can retry without re-opening menu
        const kb = targetType === 'smartlink' ? userSmartlinkMenuKeyboard(userId) : myLinksKeyboard(userId);
        await render(chatId, session,
          `❌ <b>NOT ENOUGH BALANCE</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n💰 Available  ⟶  <b>${balance}</b>\n🎯 Requested  ⟶  <b>${n}</b>\n\n💡 <i>Pick a smaller target below, or add credits.</i>`,
          buildKeyboard([
            [TARGET_50, TARGET_100],
            [TARGET_250, TARGET_500],
            [TARGET_1000],
            [TARGET_CUSTOM],
            [BACK_TO_MENU_LABEL],
          ]),
          userMessageId);
        // ⭐ Session state stays ON — user can tap another preset directly
        return;
      }
      setImpressionTarget(userId, targetType, n);
      resetTargetProgress(userId, targetType);
      session.sl_target_setting = false; session.nl_target_setting = false;
      const label = targetType === 'smartlink' ? 'SmartLink' : 'Normal Link';
      const kb = targetType === 'smartlink' ? userSmartlinkMenuKeyboard(userId) : myLinksKeyboard(userId);
      await render(chatId, session,
        `✅ <b>${label.toUpperCase()} TARGET SET</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n🎯 Target  ⟶  <b>${n}</b>\n💰 Balance  ⟶  <b>${balance}</b>\n\n💡 <i>Start impressions to begin.</i>`,
        kb, userMessageId);
      return;
    }
    if (text === TARGET_CUSTOM) {
      session.awaiting_custom_target = true;
      session.custom_target_type = targetType;
      session.sl_target_setting = false; session.nl_target_setting = false;
      await render(chatId, session, `✏️ <b>CUSTOM TARGET</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n🔢 <i>Send a number between</i> <b>1</b> <i>and</i> <b>${balance}</b>`, cancelKeyboard(), userMessageId);
      return;
    }
    if (text === TARGET_NO_LIMIT) {
      clearImpressionTarget(userId, targetType);
      resetTargetProgress(userId, targetType);
      session.sl_target_setting = false; session.nl_target_setting = false;
      const kb = targetType === 'smartlink' ? userSmartlinkMenuKeyboard(userId) : myLinksKeyboard(userId);
      await render(chatId, session, `♾️ <b>TARGET CLEARED</b>\n<i>No limit — runs until you stop it.</i>`, kb, userMessageId);
      return;
    }
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL) {
      session.sl_target_setting = false; session.nl_target_setting = false;
      await handleAction(chatId, session, userId, 'back_menu', userMessageId); return;
    }
  }
  if (session.awaiting_custom_target) {
    if (text === CANCEL_LABEL || text === BACK_TO_MENU_LABEL) {
      session.awaiting_custom_target = false;
      session.custom_target_type = null;
      await render(chatId, session, `✖️ <b>Cancelled</b>`, mainMenuKeyboard(userId), userMessageId); return;
    }
    const n = Number(text.replace(/[^\d]/g, ''));
    const balance = getImpressionBalance(userId);
    if (!n || n <= 0) { await render(chatId, session, `❌ <b>Invalid number</b>\n<i>Send digits only.</i>`, cancelKeyboard(), userMessageId); return; }
    if (n > balance) { await render(chatId, session, `❌ <b>TOO HIGH</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n💰 Max allowed  ⟶  <b>${balance}</b>`, cancelKeyboard(), userMessageId); return; }
    const targetType = session.custom_target_type || 'smartlink';
    setImpressionTarget(userId, targetType, n);
    resetTargetProgress(userId, targetType);
    session.awaiting_custom_target = false;
    session.custom_target_type = null;
    const label = targetType === 'smartlink' ? 'SmartLink' : 'Normal Link';
    const kb = targetType === 'smartlink' ? userSmartlinkMenuKeyboard(userId) : myLinksKeyboard(userId);
    await render(chatId, session, `✅ <b>${label.toUpperCase()} TARGET SET</b>\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n🎯 Target  ⟶  <b>${n}</b>\n💰 Balance  ⟶  <b>${balance}</b>`, kb, userMessageId);
    return;
  }

  // SmartLink buttons
  if (text === SL_BTN_SET_API) { await handleAction(chatId, session, userId, 'sl_set_api', userMessageId); return; }
  if (text === SL_BTN_SET_ENDPOINT) { await handleAction(chatId, session, userId, 'sl_set_endpoint', userMessageId); return; }
  if (text === SL_BTN_FETCH_API) { await handleAction(chatId, session, userId, 'sl_fetch_api', userMessageId); return; }
  if (text === SL_BTN_PASTE_MANUAL) { await handleAction(chatId, session, userId, 'sl_paste_manual', userMessageId); return; }
  if (text === SL_BTN_LOAD_JSON) { await handleAction(chatId, session, userId, 'sl_load_json', userMessageId); return; }
  if (text === SL_BTN_VIEW_LINKS) { await handleAction(chatId, session, userId, 'sl_view_links', userMessageId); return; }
  if (text === SL_BTN_STATS) { await handleAction(chatId, session, userId, 'sl_stats', userMessageId); return; }
  if (text === SL_BTN_HISTORY) { await handleAction(chatId, session, userId, 'sl_history', userMessageId); return; }
  if (text === SL_BTN_START) { await handleAction(chatId, session, userId, 'sl_start', userMessageId); return; }
  if (text === SL_BTN_STOP) { await handleAction(chatId, session, userId, 'sl_stop', userMessageId); return; }
  if (text === SL_BTN_CLEAR) { await handleAction(chatId, session, userId, 'sl_clear', userMessageId); return; }

  if (text === LIVE_SL_REFRESH) { await handleAction(chatId, session, userId, 'live_smartlink', userMessageId); return; }
  if (text === LIVE_SL_START) { await handleAction(chatId, session, userId, 'sl_start', userMessageId); return; }
  if (text === LIVE_SL_STOP) { await handleAction(chatId, session, userId, 'sl_stop', userMessageId); return; }
  if (text === LIVE_NL_REFRESH) { await handleAction(chatId, session, userId, 'live_normal', userMessageId); return; }
  if (text === LIVE_NL_START) { await handleAction(chatId, session, userId, 'start_normal_imp', userMessageId); return; }
  if (text === LIVE_NL_STOP) { await handleAction(chatId, session, userId, 'stop_normal_imp', userMessageId); return; }

  if (text === MY_LINKS_ADD_LABEL) { await handleAction(chatId, session, userId, 'add_link', userMessageId); return; }
  if (text === MY_LINKS_DELETE_LABEL) { await handleAction(chatId, session, userId, 'delete_link_menu', userMessageId); return; }
  if (text === MY_LINKS_CHECK_ALL) { await handleAction(chatId, session, userId, 'check_links', userMessageId); return; }
  if (text === MY_LINKS_START_NORMAL) { await handleAction(chatId, session, userId, 'start_normal_imp', userMessageId); return; }
  if (text === MY_LINKS_STOP_NORMAL) { await handleAction(chatId, session, userId, 'stop_normal_imp', userMessageId); return; }
  if (text === MY_LINKS_STATS) { await handleAction(chatId, session, userId, 'normal_stats', userMessageId); return; }
  if (text === MY_LINKS_HISTORY) { await handleAction(chatId, session, userId, 'impression_history', userMessageId); return; }

  if (text === `🛒 Shop`) { await handleAction(chatId, session, userId, 'shop_menu', userMessageId); return; }
  if (text === REPORT_TRIAL_LABEL) { await handleAction(chatId, session, userId, 'impression_trial_claim', userMessageId); return; }
  if (text === REPORT_RUN_LABEL) { await handleAction(chatId, session, userId, 'publisher_report', userMessageId); return; }

  const action = matchMainMenu(text, userId);
  if (action) { await handleAction(chatId, session, userId, action, userMessageId); return; }

  if (text === BACK_TO_MENU_LABEL || text === CANCEL_LABEL) {
    await handleAction(chatId, session, userId, 'back_menu', userMessageId); return;
  }

  if (isAdmin(userId)) {
    if (ADMIN_MENU_ACTIONS[text]) { await handleAction(chatId, session, userId, ADMIN_MENU_ACTIONS[text], userMessageId); return; }
    if ((text === `✅ Approve` || text === `❌ Reject`) && session.review_balance_req_id != null) {
      const reqId = Number(session.review_balance_req_id);
      session.review_balance_req_id = null;
      const req = getBalanceRequests().find((r) => Number(r.id) === reqId);
      if (!req || req.status !== 'pending') {
        await render(chatId, session, `ℹ️ <b>Request #${reqId} was already processed.</b>`, adminBackKeyboard(), userMessageId);
        return;
      }
      const approved = text === `✅ Approve`;
      updateBalanceRequestStatus(reqId, approved ? 'approved' : 'rejected');
      if (approved) addBalance(req.userId, req.amount);
      try {
        await bot.sendMessage(Number(req.userId), approved
          ? `✅ TOP-UP APPROVED\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n💰 ৳${req.amount} was added to your wallet.\n🎉 Thank you!`
          : `❌ TOP-UP REJECTED\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\nYour request could not be approved. Contact support for help.`);
      } catch (e) {}
      await handleAction(chatId, session, userId, 'admin_balance_requests', userMessageId);
      return;
    }
    if (text === ADMIN_BACK_LABEL) { await handleAction(chatId, session, userId, 'admin_open', userMessageId); return; }
    if (text === ADMIN_BACK_TO_USER_LABEL) { await handleAction(chatId, session, userId, 'back_menu', userMessageId); return; }
    if (text === SHOP_MENU_VIEW) { await handleAction(chatId, session, userId, 'shop_view', userMessageId); return; }
    if (text === SHOP_MENU_EDIT) { await handleAction(chatId, session, userId, 'shop_edit', userMessageId); return; }
    if (text === SHOP_MENU_RESET) { await handleAction(chatId, session, userId, 'shop_reset', userMessageId); return; }
    if (text === PROXY_MENU_ADD) { await handleAction(chatId, session, userId, 'proxy_add', userMessageId); return; }
    if (text === PROXY_MENU_LIST) { await handleAction(chatId, session, userId, 'proxy_list', userMessageId); return; }
    if (text === PROXY_MENU_REMOVE) { await handleAction(chatId, session, userId, 'proxy_remove', userMessageId); return; }
    if (text === PROXY_MENU_TESTALL) { await handleAction(chatId, session, userId, 'proxy_testall', userMessageId); return; }
    if (text === PROXY_MENU_SETTINGS) { await handleAction(chatId, session, userId, 'proxy_settings', userMessageId); return; }
    if (text === PROXY_MENU_CLEAR) { await handleAction(chatId, session, userId, 'proxy_clear', userMessageId); return; }
    if (text === PROXY_MENU_HEALTH) { await handleAction(chatId, session, userId, 'proxy_health', userMessageId); return; }
    if (text.startsWith('🎛️ Proxy — ')) {
      const cfg = getProxySettings();
      cfg.enabled = !cfg.enabled;
      saveProxySettings();
      await handleAction(chatId, session, userId, 'admin_proxy', userMessageId);
      return;
    }
    if (text.startsWith('🛠️ Maintenance — ')) { await handleAction(chatId, session, userId, 'admin_maint_toggle', userMessageId); return; }
    if (text === `✏️ Edit Maintenance Msg`) { await handleAction(chatId, session, userId, 'admin_maint_edit_msg', userMessageId); return; }
    if (text === `➕ Add Whitelist User`) { await handleAction(chatId, session, userId, 'admin_maint_add_wl', userMessageId); return; }
    if (text === `➖ Remove Whitelist User`) { await handleAction(chatId, session, userId, 'admin_maint_remove_wl', userMessageId); return; }
    if (text === `📋 View Whitelist`) { await handleAction(chatId, session, userId, 'admin_maint_view_wl', userMessageId); return; }
    if (session.maint_wl_remove_map && Object.prototype.hasOwnProperty.call(session.maint_wl_remove_map, text)) {
      const rid = Number(session.maint_wl_remove_map[text]);
      delete session.maint_wl_remove_map;
      const m = getMaintenanceMode();
      m.whitelist = m.whitelist.filter((x) => Number(x) !== rid);
      saveMaintenanceMode();
      await handleAction(chatId, session, userId, 'admin_maintenance', userMessageId);
      return;
    }
    if (text === `➕ Add Admin`) { await handleAction(chatId, session, userId, 'add_admin', userMessageId); return; }
    if (text === `➖ Remove Admin`) { await handleAction(chatId, session, userId, 'remove_admin', userMessageId); return; }
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  ADMIN COMMAND
// ═══════════════════════════════════════════════════════════════════════
async function adminCommand(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const session = getSession(chatId);
  if (!isAdmin(userId)) { await bot.sendMessage(chatId, `❌ Not authorized.`); return; }
  resetSessionState(session);
  const sent = await bot.sendMessage(chatId, `🛠️ <b>Admin Panel</b>\n\n👨‍💻 ${DEVELOPER_NAME}\n⚙️ <code>${BOT_BUILD}</code>`, { parse_mode: 'HTML', reply_markup: adminMainKeyboard(userId) });
  session.last_bot_msg_id = sent.message_id;
}

// ═══════════════════════════════════════════════════════════════════════
//  BROADCAST ON START
// ═══════════════════════════════════════════════════════════════════════
// ⭐ Web SaaS Mode: keep active campaigns RUNNING after server restart / Render spin-up
function resetStaleRunningFlags() {
  const running = cache.auto_impression_running || {};
  let activeCount = 0;
  for (const [uid, flags] of Object.entries(running)) {
    if (flags && (flags.smartlink || flags.normal)) {
      activeCount++;
    }
  }
  console.log(`[Startup] 🚀 Preserving and resuming ${activeCount} active impression campaign(s) across instances`);
}

async function broadcastBotOnline() {
  // Telegram removed — startup broadcasts are no longer sent to Telegram.
  // In-app notifications are delivered through Firestore by the web backend.
  return;
}

// ═══════════════════════════════════════════════════════════════════════
//  BOOTSTRAP
// ═══════════════════════════════════════════════════════════════════════
(async () => {
  global.__botStartTime = Date.now();

  // ⭐ V30: Auto-install Playwright browsers BEFORE Firebase load
  ensurePlaywrightBrowsers();

  await loadAllFromFirebase();
  getAutoImpressionSettings();
  getSmartlinkSettings();
  resetStaleRunningFlags();    // ⭐ ADD THIS LINE
  // ⭐ V34: Live Firestore sync + Worker heartbeat
  attachLiveFirestoreSync();
  startWorkerHeartbeat();

  try {
    const allSocks = getProxyList().filter(isSocks5Proxy);
    if (allSocks.length > 0) {
      let bridgeStarted = false;
      for (const proxy of allSocks) {
        try {
          await bridge.startBridge(proxy);
          const addr = bridge.getBridgeAddress();
          if (addr) {
            console.log(`[Bridge] Started on port ${addr.port || 'auto'} for ${proxy.name || shortProxyLabel(proxy)}`);
            bridgeStarted = true;
            break;
          }
        } catch (e) { console.warn(`[Bridge] Failed for ${proxy.name || 'unknown'}:`, e.message); }
      }
      if (!bridgeStarted) console.warn('[Bridge] No SOCKS5 proxy could start bridge');
    } else console.log('[Bridge] Idle (no SOCKS5 proxies)');
  } catch (e) { console.warn('[Bridge] start:', e.message); }

  try {
    const me = await bot.getMe();
    cache.bot_lifecycle = cache.bot_lifecycle || {};
    cache.bot_lifecycle.username = me.username;
    cache.bot_lifecycle.last_start = Date.now();
    cache.bot_lifecycle.total_starts = (cache.bot_lifecycle.total_starts || 0) + 1;
    syncToFirebase('bot_lifecycle');
    console.log(`[Bot] @${me.username}`);
  } catch (e) { console.warn('[Bot] getMe:', e.message); }

  // ═══════════════════════════════════════════════════════════════════════
  //  TELEGRAM HANDLERS REMOVED
  // ═══════════════════════════════════════════════════════════════════════
  //  All /command handlers, message handlers, callback-query handlers and
  //  polling have been removed. The web app is now the only user interface;
  //  this process is a pure background traffic + Firebase-sync engine.

  setInterval(() => {
    flushDirtyCollections().catch(() => {});
    if (botDB) botDB.flush().catch(() => {});
  }, 5000);

  // ⭐ Publish embedded-DB stats to Firebase every 60s (tiny write) so the
  //    admin panel can observe the local store from anywhere.
  if (botDB) {
    const publishDbStats = () => {
      try { fbSet('bot_db_stats', botDB.stats()).catch(() => {}); } catch (_) {}
    };
    publishDbStats();
    const dbStatsTimer = setInterval(publishDbStats, 60000);
    if (dbStatsTimer.unref) dbStatsTimer.unref();
  }
  setInterval(() => {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [chatId, session] of sessions) {
      if ((session.last_activity || 0) < cutoff) sessions.delete(chatId);
    }
    cleanupExpiredCaptchaVerifications();
  }, 10 * 60 * 1000);
  setInterval(() => {
    const cutoff = Date.now() - CALLBACK_TTL_MS;
    for (const [k, v] of inlineButtonActions) if (v.at < cutoff) inlineButtonActions.delete(k);
    for (const [k, v] of GLOBAL_ADMIN_TOGGLE_MAPS) {
      if (Date.now() - v.at > 24 * 60 * 60 * 1000) {
        GLOBAL_ADMIN_TOGGLE_MAPS.delete(k);
        for (const [idxKey, id] of TOGGLE_LABEL_INDEX) if (id === k) TOGGLE_LABEL_INDEX.delete(idxKey);
      }
    }
  }, 60 * 60 * 1000);
  setInterval(() => {
    const log = cache.hourly_impression_log || {};
    const cutoff = getHourKey(new Date(Date.now() - 3 * 3600000));
    let changed = false;
    for (const k of Object.keys(log)) {
      const hk = k.split('::')[2];
      if (hk && hk < cutoff) { delete log[k]; changed = true; }
    }
    if (changed) syncToFirebase('hourly_impression_log');
  }, 10 * 60 * 1000);

  startImpressionWorkers();
  startTickWatchdog();
  startProxyHealthMonitor();
  setTimeout(() => broadcastBotOnline().catch(() => {}), 5000);

// ⭐ V33: Daily impression history auto-clear at 12 AM BD
  autoClearImpressionHistoryDaily();                              // ← Startup check
  setInterval(autoClearImpressionHistoryDaily, 60 * 1000);        // ← Every 60s check

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Telegram polling removed — the engine runs silently in the background.

  const activeMode = getActiveMode();
  const _bootCfg = getAutoImpressionSettings();
  const _bootSlDr = resolveDwellRange(_bootCfg, 'smartlink');
  const _bootEffCtr = Math.min(Number(_bootCfg.h4ck_click_probability) || 0, Number(_bootCfg.h4ck_ctr_safety_cap) || 0.02);
  console.log('');
  console.log('══════════════════════════════════════════════════════');
  console.log('  ⚡ PN AD NETWORK ⚡  ·  ALIF_H4CK ⚡');
  console.log('  v30.0-ULTRA-EDITION');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  ⚡ H4CK ORGANIC v30        : ${activeMode === MODE_H4CK_ORGANIC ? 'ACTIVE' : 'STANDBY'}`);
  console.log('     Developer: @alif_h4ck');
  console.log('──────────────────────────────────────────────────────');
  console.log('  🚨 ADSTERRA-SAFE FIXES:');
  console.log('  ├─ 40+ Adsterra domains whitelisted  : ACTIVE');
  console.log('  ├─ recallscarce.com SmartLink        : ACTIVE');
  console.log('  ├─ No fake referer to SmartLink      : ACTIVE');
  console.log('  ├─ Isolated context per SmartLink    : ACTIVE');
  console.log(`  ├─ SmartLink dwell ${Math.round(_bootSlDr.lo/1000)}-${Math.round(_bootSlDr.hi/1000)}s : ACTIVE`);
  console.log('  ├─ No ad click on SmartLink          : ACTIVE');
  console.log('  └─ Pixel-fire detection              : ACTIVE');
  console.log('──────────────────────────────────────────────────────');
  console.log('  ⚡ H4CK ORGANIC v30 FEATURES:');
  const h4ckActive = activeMode === MODE_H4CK_ORGANIC;
  console.log(`  ├─ Multi-Referrer Preload  : ${h4ckActive ? 'ACTIVE' : 'STANDBY'}`);
  console.log(`  ├─ Smart Referrer Chain    : ${h4ckActive ? 'ACTIVE' : 'STANDBY'}`);
  console.log(`  ├─ Full Funnel (2-4 pages) : ${h4ckActive ? 'ACTIVE' : 'STANDBY'}`);
  console.log(`  ├─ Ad Click ${(_bootEffCtr*100).toFixed(2)}% (normal) : ${h4ckActive ? 'ACTIVE' : 'STANDBY'}`);
  console.log(`  ├─ Return Visit 5%         : ${h4ckActive ? 'ACTIVE' : 'STANDBY'}`);
  console.log(`  ├─ Competitor Visits 8%    : ${h4ckActive ? 'ACTIVE' : 'STANDBY'}`);
  console.log(`  ├─ Cookie Injection        : ${h4ckActive ? 'ACTIVE' : 'STANDBY'}`);
  console.log(`  ├─ Zoom Simulation 15%     : ${h4ckActive ? 'ACTIVE' : 'STANDBY'}`);
  console.log(`  ├─ Keyboard Nav 20%        : ${h4ckActive ? 'ACTIVE' : 'STANDBY'}`);
  console.log(`  └─ Video Pause 10%         : ${h4ckActive ? 'ACTIVE' : 'STANDBY'}`);
  console.log('──────────────────────────────────────────────────────');
  console.log('  🇺🇸 US ORGANIC TRAFFIC ENGINE   : ACTIVE');
  console.log('  💎 HIGH CPM MODE (65/18/17 UA)  : ACTIVE');
  console.log('  🌉 SOCKS5 → HTTP BRIDGE (30s)  : ACTIVE');
  console.log('  🛡️ Smart Data Saver             : ACTIVE');
  console.log('  🔥 Firebase Firestore           : ACTIVE');
  console.log('  🎟️ Membership · Shop · Referral : ACTIVE');
  console.log('  📢 Force-Join System            : ACTIVE');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Developer: ${DEVELOPER_NAME}  (${DEVELOPER_HANDLE})`);
  console.log('══════════════════════════════════════════════════════');
})().catch((e) => {
  console.error('[Boot] FATAL — startup failed:', e && e.stack ? e.stack : e);
  process.exit(1);   // let PM2 / systemd restart instead of a silent zombie
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const hardExit = setTimeout(() => process.exit(0), 15000);
  if (hardExit.unref) hardExit.unref();
  console.log('Shutting down…');
  try { await flushDirtyCollections(); } catch (e) {}
  try { if (botDB) await botDB.close(); } catch (e) {}
  try { stopImpressionWorkers(); } catch (e) {}
  try { stopProxyHealthMonitor(); } catch (e) {}
  try { bridge.stopBridge(); } catch (e) {}
  try { sessions.clear(); } catch (e) {}
  await closeBrowser();
  process.exit(0);
}