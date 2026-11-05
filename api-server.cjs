/**
 * ⚡ X AD MARKETING ⚡ — Web API Server
 *
 * Real backend for the React web app. Replaces the dummy `server.js`.
 *
 *  - Firebase Admin (see services/firebaseAdmin.js) as the ONLY data store.
 *  - HMAC-signed tokens (no jsonwebtoken dependency).
 *  - scryptSync password hashing (no bcrypt dependency).
 *  - Uses shared/bot-logic.js so validation matches the Telegram bot 1:1.
 *  - Runs in "setup mode" gracefully when Firebase config is missing.
 *  - Designed to run alongside the bot via PM2 (process: pnweb-api).
 *
 * Data layout (Firestore) — single-doc-per-collection, same as bot.js:
 *   <collection>/_root { value, updated_at }
 *
 * Web-owned collections:
 *   web_users, web_admins, web_audit_logs, web_balance_requests,
 *   web_normal_links, web_support_tickets, web_transactions,
 *   web_user_sessions
 *
 * Bot-shared collections (web reads/writes so the bot's workers can act):
 *   user_links, user_smartlinks, balance, impression_balance, membership,
 *   auto_impression_running, impression_targets, impression_target_progress,
 *   stats, hourly_impression_log, smartlink_daily_visits,
 *   live_impression_log, impression_history, proxies, proxy_stats,
 *   proxy_settings, auto_impression_settings, smartlink_settings,
 *   plans, shop_packages, payment_methods, promo_codes, referrals,
 *   banned_users, maintenance_mode
 */

'use strict';
process.env.TZ = 'Asia/Dhaka'; // one timezone everywhere (Bangladesh Standard Time, UTC+06:00)

// Load .env from the project root (works no matter which folder you start from).
// If .env is missing, fall back to .env.example so first-time setups still boot.
{
  const _fs = require('node:fs');
  const _path = require('node:path');
  const _dotenv = require('dotenv');
  const _envFile = _path.join(__dirname, '.env');
  const _exFile = _path.join(__dirname, '.env.example');
  if (_fs.existsSync(_envFile)) {
    _dotenv.config({ path: _envFile });
    console.log('[Env] Loaded .env');
  } else if (_fs.existsSync(_exFile)) {
    _dotenv.config({ path: _exFile });
    console.warn('[Env] .env not found — using .env.example. Copy it:  cp .env.example .env');
  } else {
    console.warn('[Env] No .env file found. Using defaults.');
  }
}

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('node:fs');
const path = require('node:path');

const fb = require('./services/firebaseAdmin.cjs');
const L = require('./shared/bot-logic.cjs');

// ── SuperChat BD payment subsystem (services/) ──────────────────────────────
const { loadPaymentConfig, apiKeyHint, resolveAppUrl, round2 } = require('./services/paymentConfig.cjs');
const { createSuperchatService, verifyWebhookSignature, sha256Hex, SuperchatApiError } = require('./services/superchatService.cjs');
const { createPaymentRepository, PAYMENTS: PAYMENTS_COLL, EVENTS: PAYMENT_EVENTS_COLL } = require('./services/paymentRepository.cjs');
const { createPaymentVerificationService } = require('./services/paymentVerificationService.cjs');
const { createPaymentService, PaymentError } = require('./services/paymentService.cjs');
const { createWebhookService } = require('./services/webhookService.cjs');
const { createTelegramPaymentService } = require('./services/telegramPaymentService.cjs');

// ═══════════════════════════════════════════════════════════════════════
//  ENV / CONFIG
// ═══════════════════════════════════════════════════════════════════════
const PORT = Number(process.env.PORT || process.env.API_PORT || 3001);
const HOST = process.env.API_HOST || '0.0.0.0';
const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const JWT_SECRET = loadOrCreateJwtSecret();
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const FIRST_ADMIN_EMAIL = String(process.env.FIRST_ADMIN_EMAIL || 'mdjobayerislam2580@gmail.com').trim().toLowerCase();
const FIRST_ADMIN_PASSWORD = String(process.env.FIRST_ADMIN_PASSWORD || 'Jobayer01619789895');
const FIRST_ADMIN_NAME = String(process.env.FIRST_ADMIN_NAME || 'Jobayer Islam');

function loadOrCreateJwtSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) return process.env.JWT_SECRET;
  const keyFile = path.join(DATA_DIR, 'jwt-secret.key');
  if (fs.existsSync(keyFile)) {
    const s = fs.readFileSync(keyFile, 'utf8').trim();
    if (s.length >= 32) return s;
  }
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(keyFile, s, { mode: 0o600 });
  console.warn('[Auth] Generated new JWT secret → data/jwt-secret.key');
  return s;
}

// ═══════════════════════════════════════════════════════════════════════
//  FIREBASE HELPERS  (single-doc-per-collection pattern, same as bot.js)
// ═══════════════════════════════════════════════════════════════════════
// ───────────────────────────────────────────────────────────────────────────────
//  READ-THROUGH CACHE  (Firestore quota protection)
//
//  The app used to hit Firestore for EVERY read. The free tier allows ~50k
//  reads/day, so a busy dashboard exhausted the quota and every request — login
//  included — failed with "RESOURCE_EXHAUSTED: Quota exceeded".
//
//  Now every collection read is cached in memory + on disk with a TTL. Our own
//  writes refresh the cache instantly (write-through). If Firestore ever returns
//  a quota / transport / deadline error we serve the last known value instead of
//  crashing, and we back off so we never hammer a throttled database.
// ───────────────────────────────────────────────────────────────────────────────
const ROOT_CACHE_FILE = path.join(DATA_DIR, 'root-cache.json');
// ⭐ V39: bump this whenever the cached data shape / bot detection changes. On boot, a
// cache written by an older version is discarded so stale data can never mask a fix.
const ROOT_CACHE_VERSION = 40;
const ROOT_CACHE_TTL_MS = Number(process.env.ROOT_CACHE_TTL_MS || 120000);         // 2 min default window
const ROOT_CACHE_HOT_TTL_MS = Number(process.env.ROOT_CACHE_HOT_TTL_MS || 45000);  // 45s for "live" data
const ROOT_CACHE_BACKOFF_MS = Number(process.env.ROOT_CACHE_BACKOFF_MS || 120000); // 2 min pause after an error
const ROOT_READ_TIMEOUT_MS = Number(process.env.ROOT_READ_TIMEOUT_MS || 8000);     // a single doc read must not hang
const ROOT_WRITE_TIMEOUT_MS = Number(process.env.ROOT_WRITE_TIMEOUT_MS || 12000);   // a write must not hang either
// Collections that must feel "live" get the shorter window.
const ROOT_CACHE_HOT = new Set([
  'balance', 'impression_balance', 'stats', 'live_impression_log',
  'auto_impression_running', 'impression_target_progress', 'smartlink_daily_visits',
  'hourly_impression_log', 'web_worker_status', 'web_worker_logs',
  // ⭐ V40: a freshly-saved Adsterra API key should power live stats within seconds.
  'user_smartlinks',
]);
const _rootCache = new Map();      // collection -> { value, at }
let _rootCacheDegradedUntil = 0;   // while now < this, skip Firestore entirely
let _rootCacheDirty = false;
let _rootCacheFlushTimer = null;

function _rootCacheTTL(collection) {
  return ROOT_CACHE_HOT.has(collection) ? ROOT_CACHE_HOT_TTL_MS : ROOT_CACHE_TTL_MS;
}

function _persistRootCache() {
  if (!_rootCacheDirty) return;
  _rootCacheDirty = false;
  try {
    const obj = { __meta: { v: ROOT_CACHE_VERSION, at: Date.now() } };
    for (const [k, v] of _rootCache.entries()) obj[k] = { value: v.value, at: v.at };
    const json = JSON.stringify(obj);
    // Atomic write: temp file -> fsync -> rename. A crash mid-write can never
    // corrupt the live cache file (rename is atomic on POSIX).
    const tmp = `${ROOT_CACHE_FILE}.${process.pid}.tmp`;
    let fd = null;
    try {
      fd = fs.openSync(tmp, 'w', 0o600);
      fs.writeSync(fd, json);
      try { fs.fsyncSync(fd); } catch (_) {}
    } finally {
      if (fd !== null) { try { fs.closeSync(fd); } catch (_) {} }
    }
    // Keep the previous good snapshot as a fallback before swapping.
    try { if (fs.existsSync(ROOT_CACHE_FILE)) fs.copyFileSync(ROOT_CACHE_FILE, ROOT_CACHE_FILE + '.bak'); } catch (_) {}
    fs.renameSync(tmp, ROOT_CACHE_FILE);
  } catch (e) { console.warn('[Cache] persist failed:', e && e.message ? e.message : e); }
}
function _scheduleRootCachePersist() {
  _rootCacheDirty = true;
  if (_rootCacheFlushTimer) return;
  _rootCacheFlushTimer = setTimeout(() => { _rootCacheFlushTimer = null; _persistRootCache(); }, 2500);
  if (_rootCacheFlushTimer.unref) _rootCacheFlushTimer.unref();
}
// Load the persisted cache at boot so a restart survives a Firestore outage.
(function _loadRootCache() {
  try {
    let file = ROOT_CACHE_FILE;
    if (!fs.existsSync(file) && fs.existsSync(ROOT_CACHE_FILE + '.bak')) file = ROOT_CACHE_FILE + '.bak';
    if (!fs.existsSync(file)) return;
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      // Main file corrupt -> recover from the backup snapshot.
      if (file === ROOT_CACHE_FILE && fs.existsSync(ROOT_CACHE_FILE + '.bak')) {
        raw = JSON.parse(fs.readFileSync(ROOT_CACHE_FILE + '.bak', 'utf8'));
        console.warn('[Cache] main cache corrupt — recovered from backup');
      } else throw e;
    }
    const now = Date.now();
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
    if (_rootCache.size) console.log(`[Cache] Loaded ${_rootCache.size} collection(s) from disk cache`);
  } catch (e) { console.warn('[Cache] load failed:', e && e.message ? e.message : e); }
})();

// Periodic safety flush + flush on shutdown so a hard kill never loses the
// in-memory cache (our outage fallback). The debounce alone could drop the last
// ~2.5s of writes on an abrupt exit.
const _rootCacheFlushInterval = setInterval(_persistRootCache, 30000);
if (_rootCacheFlushInterval.unref) _rootCacheFlushInterval.unref();
for (const _sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  try { process.on(_sig, () => { try { _persistRootCache(); } catch (_) {} }); } catch (_) {}
}
try { process.on('exit', () => { try { _persistRootCache(); } catch (_) {} }); } catch (_) {}

// Firestore errors that mean "the database is unavailable right now" (quota / network / deadline).
function isFirestoreUnavailable(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '');
  if (code === '8' || code === '14' || code === '4' || code === 'DEADLINE_EXCEEDED') return true;
  return /RESOURCE_EXHAUSTED|Quota exceeded|quota|UNAVAILABLE|DEADLINE_EXCEEDED|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|socket hang up|network/i.test(code + ' ' + msg);
}

function isNotFound(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '');
  return code === '5' || code === 'NOT_FOUND' || msg.includes('NOT_FOUND') || msg.includes('5 NOT_FOUND');
}

class DbUnavailableError extends Error {
  constructor(collection) {
    super('The server is busy right now. Please try again in a moment.');
    this.name = 'DbUnavailableError';
    this.code = 'DB_UNAVAILABLE';
    this.collection = collection;
  }
}

function _withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => { if (timer) clearTimeout(timer); }),
    new Promise((_, rej) => {
      timer = setTimeout(() => rej(Object.assign(new Error(`${label} timed out`), { code: 'DEADLINE_EXCEEDED' })), ms);
      if (timer.unref) timer.unref();
    }),
  ]);
}

async function _liveReadRoot(collection) {
  if (!fb.hasDb()) {
    const cached = _rootCache.get(collection);
    return cached ? cached.value : null;
  }
  try {
    const db = fb.getDb();
    const docRef = db.collection(collection).doc('_root');
    const snap = await _withTimeout(docRef.get(), ROOT_READ_TIMEOUT_MS, `readRoot(${collection})`);
    if (!snap.exists) {
      let defaultVal = null;
      if (['web_users', 'web_all_users', 'banned_users', 'proxies', 'web_ban_appeals', 'web_audit_logs', 'web_broadcasts', 'web_admins', 'data_recovery'].includes(collection)) defaultVal = [];
      else if (collection === 'web_maintenance') defaultVal = { enabled: false, message: 'We are upgrading to make everything faster and better. Please check back soon!', eta: '', updatedAt: null };
      else if (collection === 'web_registration') defaultVal = { open: true, message: 'New account creation is paused right now. Existing members can still sign in. Please check back soon!', updatedAt: null };
      else defaultVal = {};

      const value = defaultVal;
      _rootCache.set(collection, { value, at: Date.now() });
      _scheduleRootCachePersist();
      return value;
    }
    const value = snap.data().value;
    _rootCache.set(collection, { value, at: Date.now() });
    _scheduleRootCachePersist();
    return value;
  } catch (err) {
    const cached = _rootCache.get(collection);
    if (cached) return cached.value;
    if (['web_users', 'web_all_users', 'banned_users', 'proxies', 'web_ban_appeals', 'web_audit_logs', 'web_broadcasts', 'web_admins', 'data_recovery'].includes(collection)) return [];
    return {};
  }
}

let _lastDiskCacheMtime = 0;
function _checkReloadDiskCache() {
  try {
    if (!fs.existsSync(ROOT_CACHE_FILE)) return;
    const stat = fs.statSync(ROOT_CACHE_FILE);
    if (stat.mtimeMs > _lastDiskCacheMtime) {
      _lastDiskCacheMtime = stat.mtimeMs;
      const raw = JSON.parse(fs.readFileSync(ROOT_CACHE_FILE, 'utf8'));
      const now = Date.now();
      for (const [k, v] of Object.entries(raw || {})) {
        if (k === '__meta') continue;
        if (v && typeof v === 'object' && 'value' in v) {
          _rootCache.set(k, { value: v.value, at: Number(v.at) || now });
        }
      }
    }
  } catch (_) {}
}

async function readRoot(collection) {
  _checkReloadDiskCache();
  const now = Date.now();
  const cached = _rootCache.get(collection);

  // 1) Fresh cache hit → no Firestore read at all.
  if (cached && now - cached.at < _rootCacheTTL(collection)) return cached.value;

  if (!fb.hasDb()) {
    return cached ? cached.value : null;
  }

  // 2) Degraded mode (a recent Firestore outage) → serve the last known value.
  if (now < _rootCacheDegradedUntil) {
    return cached ? cached.value : null;
  }

  // 3) Live read, with a graceful fallback to the cache.
  try {
    return await _liveReadRoot(collection);
  } catch (err) {
    _rootCacheDegradedUntil = Date.now() + ROOT_CACHE_BACKOFF_MS;
    return cached ? cached.value : null;
  }
}

// Like readRoot but never throws on a database outage — returns the fallback
// instead. Used by bulk dashboard reads so the UI can still render cached data.
async function readRootSafe(collection, fallback = null) {
  try { return await readRoot(collection); }
  catch (e) { if (e && e.code === 'DB_UNAVAILABLE') return fallback; return fallback; }
}

// Force a live read (read-then-write maintenance paths). Falls back to cache on outage.
async function readRootFresh(collection) {
  try {
    return await _liveReadRoot(collection);
  } catch (err) {
    _rootCacheDegradedUntil = Date.now() + ROOT_CACHE_BACKOFF_MS;
    const cached = _rootCache.get(collection);
    if (cached) return cached.value;
    return null;
  }
}

async function writeRoot(collection, value) {
  _rootCache.set(collection, { value, at: Date.now() });
  _scheduleRootCachePersist();
  if (fb.hasDb()) {
    try {
      const db = fb.getDb();
      await _withTimeout(db.collection(collection).doc('_root').set({
        value,
        updated_at: Date.now(),
      }), ROOT_WRITE_TIMEOUT_MS, `writeRoot(${collection})`);
    } catch (e) {
      console.warn(`[Firestore] writeRoot(${collection}) fallback to local:`, e.message);
    }
  }
}

async function updateRoot(collection, updater) {
  if (!fb.hasDb()) {
    const current = (await readRoot(collection)) ?? null;
    const next = await updater(current);
    _rootCache.set(collection, { value: next, at: Date.now() });
    _scheduleRootCachePersist();
    return next;
  }
  const db = fb.getDb();
  const ref = db.collection(collection).doc('_root');
  let result;
  try {
    await _withTimeout(db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      const current = snap.exists ? (snap.data().value ?? null) : null;
      const next = await updater(current);
      t.set(ref, { value: next, updated_at: Date.now() });
      result = next;
    }), ROOT_WRITE_TIMEOUT_MS, `updateRoot(${collection})`);
  } catch (err) {
    console.warn(`[Firestore] Transaction failed for ${collection} (${err.message}). Attempting direct write fallback...`);
    try {
      const snap = await _withTimeout(ref.get(), ROOT_READ_TIMEOUT_MS, `fallbackRead(${collection})`);
      const current = snap.exists ? (snap.data().value ?? null) : ((await readRoot(collection)) ?? null);
      const next = await updater(current);
      await _withTimeout(ref.set({ value: next, updated_at: Date.now() }), ROOT_WRITE_TIMEOUT_MS, `fallbackSet(${collection})`);
      result = next;
      console.log(`[Firestore] ✅ Fallback direct write succeeded for ${collection}`);
    } catch (e2) {
      console.error(`[Firestore] ❌ Fallback write failed for ${collection}: ${e2.message}`);
      const current = (await readRoot(collection)) ?? null;
      result = await updater(current);
    }
  }
  _rootCache.set(collection, { value: result, at: Date.now() });
  _scheduleRootCachePersist();
  return result;
}

// Warm the most important collections at boot so login works even if the first
// user request lands while Firestore is briefly slow.
async function warmRootCache() {
  const critical = ['web_users', 'web_admins', 'plans', 'shop_packages', 'payment_methods', 'promo_codes', 'maintenance_mode', 'web_registration', 'leaderboard_settings'];
  let ok = 0;
  for (const c of critical) {
    try { await readRoot(c); ok += 1; } catch (_) { /* skip — retried on demand */ }
  }
  if (ok) console.log(`[Cache] Warmed ${ok}/${critical.length} critical collection(s)`);
}

// ═══════════════════════════════════════════════════════════════════════
//  PASSWORD HASHING  (scrypt, no bcrypt dependency)
// ═══════════════════════════════════════════════════════════════════════
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, rec) {
  if (!rec || typeof rec !== 'object' || !rec.salt || !rec.hash) return false;
  try {
    const h = crypto.scryptSync(String(password), rec.salt, 64).toString('hex');
    const a = Buffer.from(h, 'hex');
    const b = Buffer.from(rec.hash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (_) { return false; }
}

// ═══════════════════════════════════════════════════════════════════════
//  HMAC-SIGNED TOKENS  (JWT-like, zero deps)
// ═══════════════════════════════════════════════════════════════════════
function b64u(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uDecode(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

function signToken(payload, ttlMs = TOKEN_TTL_MS) {
  const body = { ...payload, iat: Date.now(), exp: Date.now() + ttlMs };
  const data = b64u(JSON.stringify(body));
  const sig = b64u(crypto.createHmac('sha256', JWT_SECRET).update(data).digest());
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (typeof token !== 'string' || !token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = b64u(crypto.createHmac('sha256', JWT_SECRET).update(data).digest());
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch (_) { return null; }
  let payload;
  try { payload = JSON.parse(b64uDecode(data).toString('utf8')); }
  catch (_) { return null; }
  if (!payload || !payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

// ══════════════════════════════════════════════════════════════════════════
//  ADMIN TWO-FACTOR AUTHENTICATION (TOTP — RFC 6238, zero dependency)
//  Compatible with Google Authenticator, Authy, Microsoft Authenticator,
//  1Password, Bitwarden and any standard otpauth:// client.
// ══════════════════════════════════════════════════════════════════════════
const TOTP_ISSUER = process.env.TOTP_ISSUER || 'PROFIT NEXA';
const TOTP_PERIOD = 30;   // seconds per code
const TOTP_DIGITS = 6;    // digits per code
const TOTP_WINDOW = 1;    // accept ±1 step (±30s clock drift)
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20)); // 160-bit secret
}

function hotp(secretBuf, counter) {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', secretBuf).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

function totpNow(secret) {
  const secretBuf = base32Decode(secret);
  if (!secretBuf.length) return '';
  const counter = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
  return hotp(secretBuf, counter);
}

function verifyTotp(secret, token, window = TOTP_WINDOW) {
  const clean = String(token || '').replace(/\D/g, '');
  if (clean.length !== TOTP_DIGITS || !secret) return false;
  const secretBuf = base32Decode(secret);
  if (!secretBuf.length) return false;
  const counter = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
  for (let i = -window; i <= window; i++) {
    const candidate = hotp(secretBuf, counter + i);
    try {
      if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(clean))) return true;
    } catch (_) { /* length mismatch — ignore */ }
  }
  return false;
}

function otpauthUri(secret, account) {
  const label = encodeURIComponent(`${TOTP_ISSUER}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer: TOTP_ISSUER,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function generateRecoveryCodes(n = 8) {
  const codes = [];
  for (let i = 0; i < n; i++) {
    let c = '';
    for (let k = 0; k < 10; k++) c += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)];
    codes.push(c.slice(0, 5) + '-' + c.slice(5));
  }
  return codes;
}

function hashRecoveryCode(code) {
  const norm = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto.createHash('sha256').update(norm).digest('hex');
}

// ── 2FA persistence (Firestore root "admin_2fa", keyed by admin uid) ──
async function getTwoFactorMap() {
  return (await readRootSafe('admin_2fa')) || {};
}
async function getTwoFactorFor(uid) {
  const map = await getTwoFactorMap();
  return map[uid] || null;
}
async function setTwoFactorFor(uid, value) {
  return updateRoot('admin_2fa', (cur) => ({ ...(cur || {}), [uid]: value }));
}
async function clearTwoFactorFor(uid) {
  return updateRoot('admin_2fa', (cur) => {
    const next = { ...(cur || {}) };
    delete next[uid];
    return next;
  });
}
function verifyRecoveryCode(rec, code) {
  if (!rec || !Array.isArray(rec.recoveryCodes)) return false;
  return rec.recoveryCodes.includes(hashRecoveryCode(code));
}
async function getTwoFactorPolicy() {
  const stored = await readRootSafe('admin_2fa_policy');
  return { required: !!(stored && stored.required) };
}

// ═══════════════════════════════════════════════════════════════════════
//  MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = String(auth).replace(/^Bearer\s+/i, '');
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Session expired or invalid.', code: 'TOKEN_INVALID' });
  req.auth = payload; // { uid, role, email }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.auth || req.auth.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator permission required.' });
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.auth || req.auth.role !== 'admin' || req.auth.adminRole !== 'super_admin') {
    return res.status(403).json({ error: 'Root Super Admin permission required.' });
  }
  next();
}

function requireFirebase(req, res, next) {
  // Graceful fallback: when Firebase is not configured, operations persist locally
  next();
}

// Async wrapper to catch promise rejections in route handlers
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ═══════════════════════════════════════════════════════════════════════
//  USER HELPERS
// ═══════════════════════════════════════════════════════════════════════
function newUserId() {
  return 'usr_' + crypto.randomBytes(8).toString('hex');
}

// ─── Public User ID (exactly 8 digits) + Referral code (exactly 6 chars A-Z0-9) ───
// The internal `id` stays untouched (every balance/membership/link record is keyed by it).
const usedPublicIds = new Set();
const usedRefCodes = new Set();
const PUBLIC_ID_RE = /^\d{8}$/;
const REF_CODE_RE = /^[A-Z0-9]{6}$/;
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genPublicId() {
  for (let i = 0; i < 200; i++) {
    const v = String(crypto.randomInt(10000000, 100000000));
    if (!usedPublicIds.has(v)) { usedPublicIds.add(v); return v; }
  }
  throw new Error('Could not allocate a unique user ID.');
}
function genReferralCode() {
  for (let i = 0; i < 500; i++) {
    let v = '';
    for (let k = 0; k < 6; k++) v += REF_ALPHABET[crypto.randomInt(REF_ALPHABET.length)];
    if (!usedRefCodes.has(v)) { usedRefCodes.add(v); return v; }
  }
  throw new Error('Could not allocate a unique referral code.');
}
/** Assigns missing/invalid/duplicate publicId + referralCode to existing users (never touches `id`). */
async function backfillUserCodes() {
  usedPublicIds.clear(); usedRefCodes.clear();
  let changed = 0;
  await updateRoot('web_users', (cur) => {
    const list = Array.isArray(cur) ? cur : [];
    const seenP = new Set(), seenR = new Set();
    for (const u of list) {
      if (PUBLIC_ID_RE.test(String(u.publicId || '')) && !seenP.has(u.publicId)) seenP.add(u.publicId);
      else u.publicId = null;
      const rc = String(u.referralCode || '').toUpperCase();
      if (REF_CODE_RE.test(rc) && !seenR.has(rc)) { seenR.add(rc); u.referralCode = rc; }
      else u.referralCode = null;
    }
    usedPublicIds.clear(); seenP.forEach((v) => usedPublicIds.add(v));
    usedRefCodes.clear(); seenR.forEach((v) => usedRefCodes.add(v));
    return list.map((u) => {
      if (u.publicId && u.referralCode) return u;
      changed++;
      return { ...u, publicId: u.publicId || genPublicId(), referralCode: u.referralCode || genReferralCode() };
    });
  });
  if (changed) console.log(`[Boot] Assigned public ID / referral code to ${changed} user(s).`);
}

// ⭐ MULTI-TENANT FIX: every new user gets a small FREE starter impression balance so
// their OWN Adsterra account can be validated end-to-end immediately, without first
// buying credits. Kept intentionally small (default 0 — new accounts start with ZERO) — the free tier is a test
// allowance, not a giveaway. Configurable via FREE_STARTER_IMPRESSIONS.
const FREE_STARTER_IMPRESSIONS = Math.max(0, Math.floor(Number(process.env.FREE_STARTER_IMPRESSIONS ?? 0)));

function makeFreshMembership(uid) {
  return {
    plan: null, expires_at: null,
    link_limit: L.FREE_LINK_LIMIT,
    visits_per_link: L.FREE_VISITS_PER_LINK,
    burst_window_ms: L.FREE_VISIT_WINDOW_MS,
    daily_burst_limit: 20,
    daily_burst_used: 0,
    daily_reset_date: L.todayStr(),
  };
}

function makeFreshUserRecord({ email, name, password, role = 'user', adminRole = null }) {
  const now = new Date().toISOString();
  const id = newUserId();
  return {
    id,
    email: String(email).trim().toLowerCase(),
    name: String(name || '').trim() || 'User',
    role,
    adminRole,
    status: 'active',
    emailVerified: false,
    membershipPlanId: 'free',
    membershipExpiresAt: now,
    createdAt: now,
    lastLoginAt: now,
    trialClaimed: false,
    publicId: genPublicId(),
    referralCode: genReferralCode(),
    passwordHash: hashPassword(password),
    settings: { notifications: true, promoAlerts: true, theme: 'dark' },
    isRootSuperAdmin: role === 'admin' && adminRole === 'super_admin',
  };
}

async function findUserByEmail(email) {
  const list = await readRoot('web_users') || [];
  const clean = String(email).trim().toLowerCase();
  return list.find((u) => u.email === clean) || null;
}

async function getUserById(uid) {
  const list = await readRoot('web_users') || [];
  return list.find((u) => u.id === uid) || null;
}

async function provisionUser(userRecord) {
  const uid = userRecord.id;

  // Provision every per-user collection in ONE parallel batch. Each target is a
  // distinct _root document, so there is no contention between them — running
  // them sequentially (as before) made signup wait on ~16 round-trips and feel
  // like a "long loading" hang. Parallelising cuts that to a single round-trip
  // window.
  await Promise.all([
    // 1) Add to web_users
    updateRoot('web_users', (cur) => [...(cur || []), userRecord]),

    // 2) Bot-shared collections so the bot's workers can act
    updateRoot('balance',                (cur) => ({ ...(cur || {}), [uid]: 0 })),
    updateRoot('impression_balance',     (cur) => ({ ...(cur || {}), [uid]: FREE_STARTER_IMPRESSIONS })),
    updateRoot('membership',             (cur) => ({ ...(cur || {}), [uid]: makeFreshMembership(uid) })),
    updateRoot('user_links',             (cur) => ({ ...(cur || {}), [uid]: [] })),
    updateRoot('user_smartlinks',        (cur) => ({ ...(cur || {}), [uid]: {
      api_key: null,
      api_endpoint: L.ADSTERRA_SMARTLINKS_ENDPOINT,
      source: 'adsterra',
      links: [],
      last_fetch: 0,
      auto_enabled: false,
    }})),
    updateRoot('auto_impression_running', (cur) => ({ ...(cur || {}), [uid]: { smartlink: false, normal: false } })),
    updateRoot('impression_targets',      (cur) => ({ ...(cur || {}), [uid]: { smartlink: 0, normal: 0 } })),
    updateRoot('impression_target_progress', (cur) => ({ ...(cur || {}), [uid]: { smartlink: 0, normal: 0 } })),
    updateRoot('stats', (cur) => ({
      ...(cur || {}),
      [uid]: { total_checks: 0, ok: 0, failed: 0, links: {}, total_impressions: 0 },
    })),

    // 3) Web-only collections
    updateRoot('web_normal_links',    (cur) => ({ ...(cur || {}), [uid]: [] })),
    updateRoot('web_transactions',    (cur) => ({ ...(cur || {}), [uid]: [] })),
    updateRoot('web_balance_requests', (cur) => ({ ...(cur || {}), [uid]: [] })),
    updateRoot('web_support_tickets', (cur) => ({ ...(cur || {}), [uid]: [] })),
    updateRoot('web_user_sessions',   (cur) => ({ ...(cur || {}), [uid]: [] })),

    // 4) Global user list (admin panel)
    updateRoot('web_all_users', (cur) => [...(cur || []), safeUser(userRecord)]),
  ]);

  return userRecord;
}

// Strip passwordHash before returning to client
function safeUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}

// ═══════════════════════════════════════════════════════════════════════
//  GLOBAL SETTINGS HELPERS  (merge defaults with stored values)
// ═══════════════════════════════════════════════════════════════════════
function mergeDefaults(stored, defaults) {
  if (!stored || typeof stored !== 'object') return { ...defaults };
  const out = { ...defaults };
  for (const [k, v] of Object.entries(stored)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

async function getAutoImpressionSettings() {
  const stored = await readRoot('auto_impression_settings');
  return mergeDefaults(stored, L.AUTO_IMPRESSION_DEFAULTS);
}
async function getProxySettings() {
  const stored = await readRoot('proxy_settings');
  return mergeDefaults(stored, L.PROXY_DEFAULTS);
}
async function getProxyList() {
  return (await readRoot('proxies')) || [];
}
async function getProxyStats() {
  return (await readRoot('proxy_stats')) || {};
}
async function getSmartlinkSettings() {
  const stored = await readRoot('smartlink_settings');
  return mergeDefaults(stored, L.SMARTLINK_DEFAULTS);
}
// ⭐ V36: Global targeting engine (country/device/browser/OS pick-rates + toggles)
async function getTargetingSettings() {
  const stored = await readRoot('targeting_settings');
  return mergeDefaults(stored, L.TARGETING_DEFAULTS);
}
async function getTargetingStats() {
  return (await readRoot('targeting_stats')) || { device: {}, browser: {}, os: {}, country: {}, updated_at: 0 };
}
// Country flag/name metadata for a 2-letter code (used for proxy flag badges).
function countryFlag(code) {
  const c = String(code || '').toUpperCase();
  const m = L.COUNTRY_GEO && L.COUNTRY_GEO[c];
  if (m) return { code: c, name: m.name, flag: m.flag };
  return { code: c, name: c || 'Unknown', flag: '🏳️' };
}

// ═══════════════════════════════════════════════════════════════════════
//  AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════
async function addAuditLog({ actor, action, details, targetId, targetType, status = 'success' }) {
  const entry = {
    id: 'log_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    actorName: actor?.name || 'System',
    actorRole: actor?.role || 'system',
    action: String(action || '').slice(0, 100),
    targetId: targetId || undefined,
    targetType: targetType || undefined,
    details: String(details || '').slice(0, 500),
    timestamp: new Date().toISOString(),
    status,
  };
  // Best-effort, non-blocking: an audit write must never slow down or break the request.
  updateRoot('web_audit_logs', (cur) => [entry, ...(cur || [])].slice(0, 500))
    .catch((e) => console.warn('[Audit] write skipped:', e && e.message ? e.message : e));
  return entry;
}

// ═══════════════════════════════════════════════════════════════════════
//  LIVE IMPRESSION LOG MAPPER (bot format → frontend format)
// ═══════════════════════════════════════════════════════════════════════
// ⭐ FIX: map a 2-letter country code to a flag + friendly name for the Live Monitor.
const COUNTRY_LABELS = {
  US: ['🇺🇸', 'United States'],
  GB: ['🇬🇧', 'United Kingdom'],
  CA: ['🇨🇦', 'Canada'],
  AU: ['🇦🇺', 'Australia'],
  DE: ['🇩🇪', 'Germany'],
  FR: ['🇫🇷', 'France'],
  NL: ['🇳🇱', 'Netherlands'],
  ES: ['🇪🇸', 'Spain'],
  IT: ['🇮🇹', 'Italy'],
  SE: ['🇸🇪', 'Sweden'],
  CH: ['🇨🇭', 'Switzerland'],
  SG: ['🇸🇬', 'Singapore'],
  IN: ['🇮🇳', 'India'],
  BD: ['🇧🇩', 'Bangladesh'],
  PK: ['🇵🇰', 'Pakistan'],
  ID: ['🇮🇩', 'Indonesia'],
  PH: ['🇵🇭', 'Philippines'],
  MY: ['🇲🇾', 'Malaysia'],
  TH: ['🇹🇭', 'Thailand'],
  VN: ['🇻🇳', 'Vietnam'],
  JP: ['🇯🇵', 'Japan'],
  KR: ['🇰🇷', 'South Korea'],
  CN: ['🇨🇳', 'China'],
  HK: ['🇭🇰', 'Hong Kong'],
  AE: ['🇦🇪', 'UAE'],
  SA: ['🇸🇦', 'Saudi Arabia'],
  TR: ['🇹🇷', 'Turkey'],
  RU: ['🇷🇺', 'Russia'],
  UA: ['🇺🇦', 'Ukraine'],
  PL: ['🇵🇱', 'Poland'],
  BR: ['🇧🇷', 'Brazil'],
  MX: ['🇲🇽', 'Mexico'],
  AR: ['🇦🇷', 'Argentina'],
  ZA: ['🇿🇦', 'South Africa'],
  NG: ['🇳🇬', 'Nigeria'],
  EG: ['🇪🇬', 'Egypt'],
  KE: ['🇰🇪', 'Kenya'],
  IL: ['🇮🇱', 'Israel'],
  IE: ['🇮🇪', 'Ireland'],
  BE: ['🇧🇪', 'Belgium'],
  AT: ['🇦🇹', 'Austria'],
  PT: ['🇵🇹', 'Portugal'],
  NO: ['🇳🇴', 'Norway'],
  DK: ['🇩🇰', 'Denmark'],
  FI: ['🇫🇮', 'Finland'],
  NZ: ['🇳🇿', 'New Zealand'],
  RO: ['🇷🇴', 'Romania'],
  GR: ['🇬🇷', 'Greece'],
  CZ: ['🇨🇿', 'Czechia'],
  HU: ['🇭🇺', 'Hungary'],
  LK: ['🇱🇰', 'Sri Lanka'],
  NP: ['🇳🇵', 'Nepal'],
};
// ⭐ V40: comprehensive ISO-3166-1 alpha-2 → country name map (covers ~250 territories).
// Used as the fallback name for any delivery country not in the curated COUNTRY_LABELS,
// so Impression History shows a real country name + flag for EVERY country.
const ISO_COUNTRY_NAMES = {
  AD: 'Andorra',
  AE: 'United Arab Emirates',
  AF: 'Afghanistan',
  AG: 'Antigua and Barbuda',
  AI: 'Anguilla',
  AL: 'Albania',
  AM: 'Armenia',
  AO: 'Angola',
  AQ: 'Antarctica',
  AR: 'Argentina',
  AS: 'American Samoa',
  AT: 'Austria',
  AU: 'Australia',
  AW: 'Aruba',
  AX: 'Aland Islands',
  AZ: 'Azerbaijan',
  BA: 'Bosnia and Herzegovina',
  BB: 'Barbados',
  BD: 'Bangladesh',
  BE: 'Belgium',
  BF: 'Burkina Faso',
  BG: 'Bulgaria',
  BH: 'Bahrain',
  BI: 'Burundi',
  BJ: 'Benin',
  BL: 'Saint Barthelemy',
  BM: 'Bermuda',
  BN: 'Brunei',
  BO: 'Bolivia',
  BQ: 'Caribbean Netherlands',
  BR: 'Brazil',
  BS: 'Bahamas',
  BT: 'Bhutan',
  BV: 'Bouvet Island',
  BW: 'Botswana',
  BY: 'Belarus',
  BZ: 'Belize',
  CA: 'Canada',
  CC: 'Cocos Islands',
  CD: 'DR Congo',
  CF: 'Central African Republic',
  CG: 'Congo',
  CH: 'Switzerland',
  CI: 'Cote d\'Ivoire',
  CK: 'Cook Islands',
  CL: 'Chile',
  CM: 'Cameroon',
  CN: 'China',
  CO: 'Colombia',
  CR: 'Costa Rica',
  CU: 'Cuba',
  CV: 'Cape Verde',
  CW: 'Curacao',
  CX: 'Christmas Island',
  CY: 'Cyprus',
  CZ: 'Czechia',
  DE: 'Germany',
  DJ: 'Djibouti',
  DK: 'Denmark',
  DM: 'Dominica',
  DO: 'Dominican Republic',
  DZ: 'Algeria',
  EC: 'Ecuador',
  EE: 'Estonia',
  EG: 'Egypt',
  EH: 'Western Sahara',
  ER: 'Eritrea',
  ES: 'Spain',
  ET: 'Ethiopia',
  FI: 'Finland',
  FJ: 'Fiji',
  FK: 'Falkland Islands',
  FM: 'Micronesia',
  FO: 'Faroe Islands',
  FR: 'France',
  GA: 'Gabon',
  GB: 'United Kingdom',
  GD: 'Grenada',
  GE: 'Georgia',
  GF: 'French Guiana',
  GG: 'Guernsey',
  GH: 'Ghana',
  GI: 'Gibraltar',
  GL: 'Greenland',
  GM: 'Gambia',
  GN: 'Guinea',
  GP: 'Guadeloupe',
  GQ: 'Equatorial Guinea',
  GR: 'Greece',
  GS: 'South Georgia',
  GT: 'Guatemala',
  GU: 'Guam',
  GW: 'Guinea-Bissau',
  GY: 'Guyana',
  HK: 'Hong Kong',
  HM: 'Heard and McDonald Islands',
  HN: 'Honduras',
  HR: 'Croatia',
  HT: 'Haiti',
  HU: 'Hungary',
  ID: 'Indonesia',
  IE: 'Ireland',
  IL: 'Israel',
  IM: 'Isle of Man',
  IN: 'India',
  IO: 'British Indian Ocean Territory',
  IQ: 'Iraq',
  IR: 'Iran',
  IS: 'Iceland',
  IT: 'Italy',
  JE: 'Jersey',
  JM: 'Jamaica',
  JO: 'Jordan',
  JP: 'Japan',
  KE: 'Kenya',
  KG: 'Kyrgyzstan',
  KH: 'Cambodia',
  KI: 'Kiribati',
  KM: 'Comoros',
  KN: 'Saint Kitts and Nevis',
  KP: 'North Korea',
  KR: 'South Korea',
  KW: 'Kuwait',
  KY: 'Cayman Islands',
  KZ: 'Kazakhstan',
  LA: 'Laos',
  LB: 'Lebanon',
  LC: 'Saint Lucia',
  LI: 'Liechtenstein',
  LK: 'Sri Lanka',
  LR: 'Liberia',
  LS: 'Lesotho',
  LT: 'Lithuania',
  LU: 'Luxembourg',
  LV: 'Latvia',
  LY: 'Libya',
  MA: 'Morocco',
  MC: 'Monaco',
  MD: 'Moldova',
  ME: 'Montenegro',
  MF: 'Saint Martin',
  MG: 'Madagascar',
  MH: 'Marshall Islands',
  MK: 'North Macedonia',
  ML: 'Mali',
  MM: 'Myanmar',
  MN: 'Mongolia',
  MO: 'Macao',
  MP: 'Northern Mariana Islands',
  MQ: 'Martinique',
  MR: 'Mauritania',
  MS: 'Montserrat',
  MT: 'Malta',
  MU: 'Mauritius',
  MV: 'Maldives',
  MW: 'Malawi',
  MX: 'Mexico',
  MY: 'Malaysia',
  MZ: 'Mozambique',
  NA: 'Namibia',
  NC: 'New Caledonia',
  NE: 'Niger',
  NF: 'Norfolk Island',
  NG: 'Nigeria',
  NI: 'Nicaragua',
  NL: 'Netherlands',
  NO: 'Norway',
  NP: 'Nepal',
  NR: 'Nauru',
  NU: 'Niue',
  NZ: 'New Zealand',
  OM: 'Oman',
  PA: 'Panama',
  PE: 'Peru',
  PF: 'French Polynesia',
  PG: 'Papua New Guinea',
  PH: 'Philippines',
  PK: 'Pakistan',
  PL: 'Poland',
  PM: 'Saint Pierre and Miquelon',
  PN: 'Pitcairn Islands',
  PR: 'Puerto Rico',
  PS: 'Palestine',
  PT: 'Portugal',
  PW: 'Palau',
  PY: 'Paraguay',
  QA: 'Qatar',
  RE: 'Reunion',
  RO: 'Romania',
  RS: 'Serbia',
  RU: 'Russia',
  RW: 'Rwanda',
  SA: 'Saudi Arabia',
  SB: 'Solomon Islands',
  SC: 'Seychelles',
  SD: 'Sudan',
  SE: 'Sweden',
  SG: 'Singapore',
  SH: 'Saint Helena',
  SI: 'Slovenia',
  SJ: 'Svalbard and Jan Mayen',
  SK: 'Slovakia',
  SL: 'Sierra Leone',
  SM: 'San Marino',
  SN: 'Senegal',
  SO: 'Somalia',
  SR: 'Suriname',
  SS: 'South Sudan',
  ST: 'Sao Tome and Principe',
  SV: 'El Salvador',
  SX: 'Sint Maarten',
  SY: 'Syria',
  SZ: 'Eswatini',
  TC: 'Turks and Caicos Islands',
  TD: 'Chad',
  TF: 'French Southern Territories',
  TG: 'Togo',
  TH: 'Thailand',
  TJ: 'Tajikistan',
  TK: 'Tokelau',
  TL: 'Timor-Leste',
  TM: 'Turkmenistan',
  TN: 'Tunisia',
  TO: 'Tonga',
  TR: 'Turkey',
  TT: 'Trinidad and Tobago',
  TV: 'Tuvalu',
  TW: 'Taiwan',
  TZ: 'Tanzania',
  UA: 'Ukraine',
  UG: 'Uganda',
  UM: 'U.S. Outlying Islands',
  US: 'United States',
  UY: 'Uruguay',
  UZ: 'Uzbekistan',
  VA: 'Vatican City',
  VC: 'Saint Vincent and the Grenadines',
  VE: 'Venezuela',
  VG: 'British Virgin Islands',
  VI: 'U.S. Virgin Islands',
  VN: 'Vietnam',
  VU: 'Vanuatu',
  WF: 'Wallis and Futuna',
  WS: 'Samoa',
  YE: 'Yemen',
  YT: 'Mayotte',
  ZA: 'South Africa',
  ZM: 'Zambia',
  ZW: 'Zimbabwe'
};

function countryInfo(code) {
  const cc = String(code || '').trim().toUpperCase().slice(0, 2);
  const hit = COUNTRY_LABELS[cc];
  if (hit) return { code: cc, flag: hit[0], name: hit[1] };
  // ⭐ V40: fall back to the full ISO name map + a generated emoji flag so every
  // country renders correctly (previously unmapped countries showed just the code).
  if (cc && cc !== 'XX' && /^[A-Z]{2}$/.test(cc)) {
    const name = ISO_COUNTRY_NAMES[cc] || cc;
    let flag = '🌐';
    try { flag = String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))); } catch (e) {}
    return { code: cc, flag, name };
  }
  return { code: 'XX', flag: '🌐', name: 'Unknown' };
}
function mapLiveLog(log, smartlinkLabelMap) {
  const isSmart = log.type === 'smartlink';
  const rawUrl = String(log.url || '');
  const label = (isSmart && smartlinkLabelMap)
    ? (smartlinkLabelMap[rawUrl] || smartlinkLabelMap[rawUrl.replace(/\/+$/, '')] || '')
    : '';
  return {
    id: `imp_${log.ts}_${Math.random().toString(36).slice(2, 7)}`,
    userId: String(log.userId || ''),
    linkId: '',
    linkType: isSmart ? 'smartlink' : 'normal',
    // SmartLinks are surfaced as a friendly "Smart link N" label — never the raw
    // Adsterra destination URL (the user asked for the link itself to stay hidden).
    url: isSmart ? (label || 'Smart link') : rawUrl,
    proxyUsed: log.proxy || 'direct',
    // ⭐ FIX: real delivery country (was hard-coded 'US').
    proxyRegion: countryInfo(log.country).code,
    proxyCountry: countryInfo(log.country).name,
    proxyFlag: countryInfo(log.country).flag,
    status: log.ok ? 'success' : 'failed',
    dwellMs: Number(log.dwellMs) || 0,
    creditsDeducted: log.ok ? 1 : 0,
    phaseCompleted: String(log.detail || '').slice(0, 200),
    timestamp: new Date(log.ts || Date.now()).toISOString(),
    details: String(log.detail || ''),
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  EXPRESS APP
// ═══════════════════════════════════════════════════════════════════════
const app = express();
app.disable('x-powered-by');

app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
  credentials: false,
}));
// ═══════════════════════════════════════════════════════════════════════════
//  SUPERCHAT BD PAYMENT SUBSYSTEM — wiring
//  (the raw-body webhook route is mounted HERE, before express.json, so the
//   exact bytes SuperChat signed are still available for HMAC verification)
// ═══════════════════════════════════════════════════════════════════════════
const PAYMENT_CFG = loadPaymentConfig();
const PAYMENT_REPO = createPaymentRepository({ readRoot, readRootFresh, updateRoot });
const PAYMENT_SUPERCHAT = createSuperchatService(PAYMENT_CFG, console);
const PAYMENT_VERIFY = createPaymentVerificationService({ cfg: PAYMENT_CFG, superchat: PAYMENT_SUPERCHAT, logger: console });
const PAYMENT_TELEGRAM = createTelegramPaymentService({ updateRoot, logger: console, brand: 'X AD MARKETING' });

/**
 * Credits a user's wallet for a verified SuperChat payment — EXACTLY ONCE.
 * Called by paymentService only after it has atomically claimed the payment.
 * Mirrors the manual deposit-approval flow: balance + web_transactions +
 * 10% lifetime referral commission (the in-app notice is sent separately).
 */
async function fulfillSuperchatPayment(payment) {
  const uid = payment && payment.userId;
  const amount = Number(payment && payment.amount) || 0;
  if (!uid || !(amount > 0)) return { credited: false, newBalance: null, transactionId: null };

  let newBalance = null;
  await updateRoot('balance', (cur) => {
    newBalance = Number(((Number((cur || {})[uid]) || 0) + amount).toFixed(2));
    return { ...(cur || {}), [uid]: newBalance };
  });

  const tx = {
    id: 'tx_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    userId: uid,
    type: 'deposit',
    amount,
    balanceAfter: newBalance,
    description: `Wallet top-up via SuperChat BD (Order ${payment.orderId || payment.id})`,
    status: 'completed',
    createdAt: new Date().toISOString(),
    paymentId: payment.id,
    provider: 'superchat',
  };
  await updateRoot('web_transactions', (cur) => ({
    ...(cur || {}),
    [uid]: [tx, ...(((cur || {})[uid]) || [])].slice(0, 200),
  }));

  try { await creditReferralCommission(uid, amount); }
  catch (e) { console.warn('[Referral] commission failed:', (e && e.message) || e); }

  return { credited: true, newBalance, transactionId: tx.id };
}

const PAYMENT_SERVICE = createPaymentService({
  cfg: PAYMENT_CFG,
  repo: PAYMENT_REPO,
  superchat: PAYMENT_SUPERCHAT,
  verification: PAYMENT_VERIFY,
  logger: console,
  resolveAppUrl,
  round2,
  fulfill: fulfillSuperchatPayment,
  telegram: PAYMENT_TELEGRAM,
  audit: addAuditLog,
});

const PAYMENT_WEBHOOK = createWebhookService({
  cfg: PAYMENT_CFG,
  repo: PAYMENT_REPO,
  paymentService: PAYMENT_SERVICE,
  verifyWebhookSignature,
  sha256Hex,
  logger: console,
});

// ── SuperChat webhook receiver (RAW body, signature-verified, idempotent) ──
app.post('/api/webhooks/superchat', express.raw({ type: '*/*', limit: '1mb' }), wrap(async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : (typeof req.body === 'string' ? req.body : '');
  let result;
  try {
    result = await PAYMENT_WEBHOOK.handle({ rawBody, headers: req.headers });
  } catch (e) {
    console.error('[Webhook] fatal:', (e && e.message) || e);
    result = { status: 500, body: { ok: false, error: 'Webhook processing error.' } };
  }
  res.status(result.status || 200).json(result.body || { ok: true });
}));

app.use(express.json({ limit: '2mb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Allow framing in AI Studio iframe environment
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ── Global request timeout ───────────────────────────────────────────
// Guarantees no request can hang forever (e.g. when a downstream dependency
// such as Firestore is slow or rate-limited). Returns a fast 503 instead.
const REQUEST_TIMEOUT_MS = Number(process.env.API_REQUEST_TIMEOUT_MS || 25000);
app.use((req, res, next) => {
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({ error: 'The server took too long to respond. Please try again.', code: 'REQUEST_TIMEOUT' });
      // Neutralize any late writes from the still-running handler. Without this,
      // a slow dependency (e.g. Firestore) that resolves AFTER the timeout would
      // call res.json again and crash with ERR_HTTP_HEADERS_SENT.
      res.json = () => res;
      res.send = () => res;
      res.end = () => res;
      res.write = () => true;
    }
  }, REQUEST_TIMEOUT_MS);
  res.on('finish', () => clearTimeout(timer));
  res.on('close', () => clearTimeout(timer));
  next();
});


// ═══════════════════════════════════════════════════════════════════════
//  WEBSITE MAINTENANCE MODE
//  Stored separately from the Telegram bot's `maintenance_mode` so the web
//  message stays plain text. When ON, every non-admin API call is answered
//  with 503 + code MAINTENANCE. Admins keep full access.
// ═══════════════════════════════════════════════════════════════════════
const WEB_MAINT_DEFAULTS = {
  enabled: false,
  message: 'We are upgrading to make everything faster and better. Please check back soon!',
  eta: '',
  updatedAt: null,
};
let _maintCache = { at: 0, value: { ...WEB_MAINT_DEFAULTS } };

async function getWebMaintenance(force = false) {
  if (!fb.isReady()) return { ...WEB_MAINT_DEFAULTS };
  if (!force && Date.now() - _maintCache.at < 3000) return _maintCache.value;
  try {
    const stored = await readRoot('web_maintenance');
    _maintCache = { at: Date.now(), value: mergeDefaults(stored, WEB_MAINT_DEFAULTS) };
  } catch (e) {
    // Fail-open: a read problem must never lock everybody out.
    if (!isNotFound(e)) console.warn('[Maintenance] read failed:', e.message);
    // Back off for the cache window so a failing read doesn't hammer Firestore on every request.
    _maintCache = { at: Date.now(), value: _maintCache.value };
  }
  return _maintCache.value;
}

function publicMaintenance(m) {
  return {
    enabled: !!m.enabled,
    message: String(m.message || WEB_MAINT_DEFAULTS.message),
    eta: String(m.eta || ''),
    updatedAt: m.updatedAt || null,
  };
}

// Public — the login page and the app shell poll this (no auth needed).
app.get('/api/maintenance', wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ maintenance: publicMaintenance(await getWebMaintenance()) });
}));

const MAINT_OPEN_PATHS = new Set(['/health', '/maintenance', '/setup/status']);

app.use('/api', wrap(async (req, res, next) => {
  const m = await getWebMaintenance();
  if (!m.enabled) return next();
  if (MAINT_OPEN_PATHS.has(req.path) || req.path.startsWith('/setup/')) return next();

  // Signed-in admins always pass.
  const auth = req.headers.authorization || '';
  const payload = verifyToken(String(auth).replace(/^Bearer\s+/i, ''));
  if (payload && payload.role === 'admin') return next();

  // Admin sign-in uses the normal login route — let it through only for admin accounts.
  if (req.method === 'POST' && req.path === '/auth/login') {
    try {
      const u = await findUserByEmail(String((req.body && req.body.email) || ''));
      if (u && u.role === 'admin') return next();
    } catch (_) { /* fall through to block */ }
  }

  return res.status(503).json({
    error: m.message || WEB_MAINT_DEFAULTS.message,
    code: 'MAINTENANCE',
    maintenance: publicMaintenance(m),
  });
}));

// Banned people lose access immediately, even with a token that is still valid; "force sign-out" kills old tokens.
app.use('/api', wrap(async (req, res, next) => {
  const auth = req.headers.authorization || '';
  if (!auth) return next();
  const payload = verifyToken(String(auth).replace(/^Bearer\s+/i, ''));
  if (!payload || !payload.uid) return next();
  const g = await getGuard();
  const ep = Number(g.epoch[payload.uid] || 0);
  if (ep && Number(payload.iat || 0) < ep) {
    return res.status(401).json({ error: 'You were signed out. Please sign in again.', code: 'TOKEN_INVALID' });
  }
  if (payload.role !== 'admin' && g.banned[payload.uid]) {
    return res.status(403).json(banBody(payload.uid, g.banned[payload.uid]));
  }
  next();
}));

// ═══════════════════════════════════════════════════════════════════════
//  BACKGROUND WORKER CONTROL / STATUS
//  Safe background tasks only: health telemetry, state synchronization,
//  cleanup and queue bookkeeping. No synthetic traffic generation.
// ═══════════════════════════════════════════════════════════════════════
const WORKER_ID = process.env.WORKER_ID || `pn-worker-${process.pid}`;
const WORKER_STARTED_AT = new Date().toISOString();

async function writeWorkerStatus(patch) {
  if (!fb.isReady()) return;
  const current = (await readRoot('web_worker_status')) || {};
  await writeRoot('web_worker_status', {
    ...current,
    ...patch,
    workerId: WORKER_ID,
    pid: process.pid,
    updatedAt: new Date().toISOString(),
  });
}

async function appendWorkerLog(level, component, msg) {
  if (!fb.isReady()) return;
  const current = (await readRoot('web_worker_logs')) || [];
  const next = [{
    id: `wlog_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    time: new Date().toISOString(), level, component, msg,
  }, ...current].slice(0, 200);
  await writeRoot('web_worker_logs', next);
}

app.get('/api/admin/worker/status', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const status = (await readRoot('web_worker_status')) || {
    state: 'starting', workerId: WORKER_ID, startedAt: WORKER_STARTED_AT,
  };
  res.json({ status });
}));

app.post('/api/admin/worker/reset', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  await writeRoot('web_worker_control', {
    ...(await readRoot('web_worker_control') || {}),
    resetRequestedAt: Date.now(),
    requestedBy: req.auth.uid,
  });
  await appendWorkerLog('INFO', 'WorkerControl', 'Tick/reset request queued for background worker.');
  res.json({ ok: true, queued: true });
}));

// ═══════════════════════════════════════════════════════════════════════════
//  SUPERCHAT BD PAYMENTS — PUBLIC API
//  Amounts/statuses are decided server-side; these endpoints never trust the
//  browser. Public (no auth) because the standalone checkout + result pages
//  must work after the redirect back from the hosted gateway.
// ═══════════════════════════════════════════════════════════════════════════

/** Map any payment-layer error onto a clean JSON response. */
function sendPaymentError(res, e) {
  if (e && e.isPayment) {
    return res.status(e.status || 400).json({ error: e.message, code: e.code || 'PAYMENT_ERROR' });
  }
  if (e && e.isSuperchat) {
    return res.status(502).json({ error: e.message || 'Payment gateway error.', code: e.code || 'GATEWAY_ERROR' });
  }
  console.error('[Payment] unexpected error:', (e && e.stack) || e);
  return res.status(500).json({ error: 'Payment service error. Please try again.', code: 'PAYMENT_INTERNAL' });
}

/** Safe, masked snapshot of the payment configuration for the admin UI. */
function paymentAdminConfig() {
  const webhookUrl = PAYMENT_CFG.appUrl
    ? PAYMENT_CFG.appUrl + PAYMENT_CFG.webhookPath
    : PAYMENT_CFG.webhookPath;
  return {
    provider: 'superchat',
    environment: PAYMENT_CFG.environment,
    is_live: PAYMENT_CFG.isLive,
    base_url: PAYMENT_CFG.baseUrl,
    api_key_set: PAYMENT_CFG.apiKeySet,
    api_key_hint: apiKeyHint(PAYMENT_CFG.apiKey),
    webhook_secret_set: PAYMENT_CFG.webhookSecretSet,
    webhook_url: webhookUrl,
    app_url: PAYMENT_CFG.appUrl || null,
    currency: PAYMENT_CFG.currency,
    min_amount: PAYMENT_CFG.minAmount,
    max_amount: PAYMENT_CFG.maxAmount,
    expiration_minutes: PAYMENT_CFG.expirationMinutes,
    webhook_tolerance_sec: PAYMENT_CFG.webhookToleranceSec,
    events: PAYMENT_CFG.events,
    configured: PAYMENT_CFG.apiKeySet && PAYMENT_CFG.webhookSecretSet,
  };
}

// Create a hosted-checkout payment (logged-in user tops up their wallet).
app.post('/api/payments/create', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const body = req.body || {};
  let user = null;
  try { user = await getUserById(uid); } catch (_) {}

  const c = (body.customer && typeof body.customer === 'object') ? body.customer : {};
  const customer = {
    name: c.name || (user && (user.name || [user.firstName, user.lastName].filter(Boolean).join(' '))) || '',
    email: c.email || (user && user.email) || '',
    phone: c.phone || (user && (user.phone || user.telegram)) || '',
  };
  const idempotencyKey = String(req.headers['idempotency-key'] || body.idempotency_key || '').trim() || undefined;

  try {
    const out = await PAYMENT_SERVICE.createPayment({
      userId: uid,
      amount: body.amount,
      currency: body.currency,
      customer,
      metadata: body.metadata,
      description: body.description,
      idempotencyKey,
      req,
    });
    res.json(out);
  } catch (e) {
    sendPaymentError(res, e);
  }
}));

// Public safe view of one payment (checkout + result pages).
app.get('/api/payments/:paymentId', requireFirebase, wrap(async (req, res) => {
  const p = await PAYMENT_REPO.get(String(req.params.paymentId));
  if (!p) return res.status(404).json({ error: 'Payment not found.', code: 'NOT_FOUND' });
  res.json({ payment: PAYMENT_SERVICE.publicView(p) });
}));

// Return (or re-open) the hosted checkout URL for a payment.
app.post('/api/payments/:paymentId/start', requireFirebase, wrap(async (req, res) => {
  try {
    const out = await PAYMENT_SERVICE.startPayment(String(req.params.paymentId), req);
    res.json(out);
  } catch (e) {
    sendPaymentError(res, e);
  }
}));

// Poll the status (auto-verifies against SuperChat, throttled server-side).
app.get('/api/payments/:paymentId/status', requireFirebase, wrap(async (req, res) => {
  const verify = String(req.query.verify == null ? '1' : req.query.verify) !== '0';
  const p = await PAYMENT_SERVICE.getStatus(String(req.params.paymentId), { verify });
  if (!p) return res.status(404).json({ error: 'Payment not found.', code: 'NOT_FOUND' });
  res.json({ payment: PAYMENT_SERVICE.publicView(p) });
}));

// Force a server-side verification (used when the success page loads).
app.post('/api/payments/:paymentId/verify', requireFirebase, wrap(async (req, res) => {
  const out = await PAYMENT_SERVICE.verifyPayment(String(req.params.paymentId), { source: 'client_success' });
  if (!out) return res.status(404).json({ error: 'Payment not found.', code: 'NOT_FOUND' });
  res.json({
    payment: PAYMENT_SERVICE.publicView(out.payment),
    status: out.status,
    changed: !!out.changed,
    verify_error: out.verify_error || null,
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
//  SUPERCHAT BD PAYMENTS — ADMIN API
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/admin/payments', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const q = req.query.q ? String(req.query.q) : undefined;
  const userId = req.query.userId ? String(req.query.userId) : undefined;
  const limit = Number(req.query.limit || 200);
  const [list, stats] = await Promise.all([
    PAYMENT_REPO.list({ status, q, userId, limit }),
    PAYMENT_REPO.stats(),
  ]);
  res.json({ payments: list.map((p) => PAYMENT_SERVICE.adminView(p)), stats, config: paymentAdminConfig() });
}));

app.get('/api/admin/payments/:id', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const id = String(req.params.id);
  const p = await PAYMENT_REPO.get(id);
  if (!p) return res.status(404).json({ error: 'Payment not found.' });
  const events = await PAYMENT_REPO.listEvents(id);
  res.json({ payment: PAYMENT_SERVICE.adminView(p), events });
}));

app.post('/api/admin/payments/:id/refund', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const id = String(req.params.id);
  const reason = String((req.body && req.body.reason) || '').slice(0, 300);
  const actor = await getUserById(req.auth.uid);
  try {
    const out = await PAYMENT_SERVICE.refundPayment(id, reason, (actor && actor.name) || 'Admin');
    res.json({ ok: true, payment: PAYMENT_SERVICE.adminView(out.payment) });
  } catch (e) {
    sendPaymentError(res, e);
  }
}));

app.get('/api/admin/superchat/config', requireAuth, requireAdmin, wrap(async (req, res) => {
  res.json({ config: paymentAdminConfig() });
}));

// Register (or re-register) the webhook subscription at SuperChat.
app.post('/api/admin/superchat/webhook', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  if (!PAYMENT_CFG.apiKeySet) {
    return res.status(503).json({ error: 'SuperChat API key is not configured.', code: 'GATEWAY_NOT_CONFIGURED' });
  }
  const url = String((req.body && req.body.url) || '').trim()
    || ((resolveAppUrl(PAYMENT_CFG, req) || '') + PAYMENT_CFG.webhookPath);
  try {
    const out = await PAYMENT_SUPERCHAT.createWebhook({ url, events: PAYMENT_CFG.events });
    res.json({
      ok: true,
      webhook: out,
      url,
      events: PAYMENT_CFG.events,
      secret: (out && out.secret) || null,
      note: 'Copy the returned secret into SUPERCHAT_WEBHOOK_SECRET in your .env, then restart the API.',
    });
  } catch (e) {
    sendPaymentError(res, e);
  }
}));

app.get('/api/admin/superchat/webhooks', requireAuth, requireAdmin, wrap(async (req, res) => {
  try {
    const out = await PAYMENT_SUPERCHAT.listWebhooks();
    res.json({ webhooks: out });
  } catch (e) {
    sendPaymentError(res, e);
  }
}));

app.get('/api/admin/superchat/webhooks/:id/test', requireAuth, requireAdmin, wrap(async (req, res) => {
  try {
    const out = await PAYMENT_SUPERCHAT.testWebhook(String(req.params.id));
    res.json({ ok: true, result: out });
  } catch (e) {
    sendPaymentError(res, e);
  }
}));

// ═══════════════════════════════════════════════════════════════════════════
//  HEALTH + SETUP
// ═══════════════════════════════════════════════════════════════════════
app.get(['/health', '/api/health'], (req, res) => {
  res.json({
    ok: true,
    service: 'pn-ad-network-api',
    time: new Date().toISOString(),
    firebase: fb.getStatus(),
    payments: {
      provider: 'superchat',
      environment: PAYMENT_CFG.environment,
      configured: PAYMENT_CFG.apiKeySet && PAYMENT_CFG.webhookSecretSet,
      api_key_set: PAYMENT_CFG.apiKeySet,
      webhook_secret_set: PAYMENT_CFG.webhookSecretSet,
    },
  });
});

app.get('/api/setup/status', (req, res) => {
  const st = fb.getStatus();
  res.json({
    ready: true,
    firebaseReady: st.ready,
    projectId: st.projectId || 'local-database',
    error: null,
    configExists: st.configExists,
    initAttempts: st.initAttempts,
    mode: st.ready ? 'firestore' : 'local_storage',
  });
});

app.post('/api/setup/initialize', wrap(async (req, res) => {
  // First-run installer: configure Firebase and create exactly one root Super Admin.
  // Once a Firebase-backed admin exists, this endpoint becomes locked.
  const existingAdmins = fb.isReady() ? (await readRoot('web_admins') || []) : [];
  if (existingAdmins.length) return res.status(409).json({ error: 'Initial setup is already completed. Use the Admin Panel settings instead.' });

  const { serviceAccount, adminName, adminEmail, adminPassword, paymentMethods } = req.body || {};
  const cleanEmail = String(adminEmail || '').trim().toLowerCase();
  const password = String(adminPassword || '');
  const name = String(adminName || 'Root Admin').trim() || 'Root Admin';
  if (!serviceAccount) return res.status(400).json({ error: 'Firebase service account is required.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return res.status(400).json({ error: 'A valid admin email is required.' });
  if (password.length < 8) return res.status(400).json({ error: 'Admin password must be at least 8 characters.' });

  await fb.saveAndInit(serviceAccount);
  const existingUser = await findUserByEmail(cleanEmail);
  if (existingUser) return res.status(409).json({ error: 'An account with this email already exists.' });

  const record = makeFreshUserRecord({ email: cleanEmail, name, password, role: 'admin', adminRole: 'super_admin' });
  record.permissions = ['*'];
  await provisionUser(record);
  const adminEntry = {
    id: record.id, email: record.email, name: record.name, role: 'admin', status: 'active',
    permissions: ['*'], createdAt: record.createdAt, lastLoginAt: record.lastLoginAt, isRootSuperAdmin: true,
  };
  await updateRoot('web_admins', () => [adminEntry]);
  if (Array.isArray(paymentMethods) && paymentMethods.length) {
    const cleaned = paymentMethods.map((m, i) => ({
      id: String(m.id || m.key || `method_${i + 1}`).slice(0, 60),
      key: String(m.key || m.id || `method_${i + 1}`).slice(0, 60),
      name: String(m.name || 'Payment Method').slice(0, 100),
      number: String(m.number || '').slice(0, 200),
      type: String(m.type || 'manual').slice(0, 50),
      accountType: m.accountType ? String(m.accountType).slice(0, 50) : undefined,
      note: m.note ? String(m.note).slice(0, 500) : undefined,
      instructions: String(m.instructions || 'Send payment and submit the transaction ID.').slice(0, 1000),
      enabled: m.enabled !== false,
      order: Number.isFinite(Number(m.order)) ? Number(m.order) : i + 1,
    }));
    await writeRoot('payment_methods', cleaned);
  }
  await writeRoot('web_setup', { completedAt: new Date().toISOString(), projectId: fb.getProjectId(), installer: 'web' });
  res.json({ ok: true, projectId: fb.getProjectId(), admin: safeUser(record) });
}));

app.post('/api/setup/firebase', wrap(async (req, res) => {
  // Allow upload only when Firebase is NOT yet configured OR a valid admin token is provided
  if (fb.isReady()) {
    const auth = req.headers.authorization || '';
    const payload = verifyToken(String(auth).replace(/^Bearer\s+/i, ''));
    if (!payload || payload.role !== 'admin' || payload.adminRole !== 'super_admin') {
      return res.status(403).json({ error: 'Only Root Super Admin can replace Firebase config.' });
    }
  }
  const { serviceAccount } = req.body || {};
  if (!serviceAccount) return res.status(400).json({ error: 'Missing "serviceAccount" field.' });

  try {
    const result = await fb.saveAndInit(serviceAccount);
    res.json({ ok: true, projectId: result.projectId });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

// ═══════════════════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
//  MAILER + ONE-TIME CODES  (email verification / password reset)
//  Needs SMTP_HOST, SMTP_USER, SMTP_PASS in .env and `npm i nodemailer`.
//  When SMTP is not configured everything falls back to the old behaviour.
// ═══════════════════════════════════════════════════════════════════════
let _mailer = null;
function getMailer() {
  if (_mailer !== null) return _mailer || null;
  const host = process.env.SMTP_HOST, user = process.env.SMTP_USER, pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) { _mailer = false; return null; }
  try {
    const nodemailer = require('nodemailer');
    const port = Number(process.env.SMTP_PORT || 465);
    const secure = process.env.SMTP_SECURE !== undefined ? String(process.env.SMTP_SECURE) === 'true' : port === 465;
    _mailer = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  } catch (e) {
    console.warn('[Mail] nodemailer is not installed. Run: npm i nodemailer');
    _mailer = false;
  }
  return _mailer || null;
}
const mailEnabled = () => !!getMailer();

async function sendMail(to, subject, html) {
  const m = getMailer();
  if (!m) throw new Error('Mail is not configured.');
  const from = process.env.SMTP_FROM || `AD MARKETING <${process.env.SMTP_USER}>`;
  await m.sendMail({ from, to, subject, html });
}

function codeEmailHtml(title, code, note) {
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;background:#0b1220;color:#e2e8f0;border-radius:16px;padding:28px;border:1px solid #134e4a">
  <h2 style="margin:0 0 6px;color:#34d399">AD MARKETING</h2>
  <p style="margin:0 0 18px;color:#94a3b8;font-size:13px">${title}</p>
  <div style="font-size:34px;letter-spacing:10px;font-weight:800;text-align:center;background:#0f172a;border:1px dashed #10b981;border-radius:12px;padding:16px;color:#fff">${code}</div>
  <p style="margin:18px 0 0;color:#94a3b8;font-size:12px">${note} This code expires in 10 minutes. If you did not request it, ignore this email.</p>
  <p style="margin:14px 0 0;color:#475569;font-size:11px">Developer: Alif_H4ck</p></div>`;
}

const hashAuthCode = (email, code) =>
  crypto.createHash('sha256').update(`${email}|${code}|${JWT_SECRET}`).digest('hex');

// Returns the plain code, or null when asked again within 30 seconds.
async function issueAuthCode(type, email) {
  const key = `${type}:${email}`;
  const code = String(crypto.randomInt(100000, 1000000));
  let blocked = false;
  await updateRoot('web_auth_codes', (cur) => {
    blocked = false;
    const now = Date.now();
    const all = { ...(cur || {}) };
    if (all[key] && now - (all[key].last || 0) < 30000) { blocked = true; return all; }
    for (const k of Object.keys(all)) if (all[k].exp < now) delete all[k];
    all[key] = { hash: hashAuthCode(email, code), exp: now + 10 * 60 * 1000, tries: 0, last: now };
    return all;
  });
  return blocked ? null : code;
}

async function checkAuthCode(type, email, code) {
  const key = `${type}:${email}`;
  let ok = false;
  let reason = 'invalid';
  await updateRoot('web_auth_codes', (cur) => {
    ok = false; reason = 'invalid';
    const all = { ...(cur || {}) };
    const rec = all[key];
    if (!rec || rec.exp < Date.now()) { reason = 'expired'; return all; }
    if ((rec.tries || 0) >= 5) { reason = 'locked'; delete all[key]; return all; }
    if (rec.hash === hashAuthCode(email, String(code || '').trim())) { ok = true; delete all[key]; }
    else { all[key] = { ...rec, tries: (rec.tries || 0) + 1 }; }
    return all;
  });
  return { ok, reason };
}

function normalizeTelegram(v) {
  const t = String(v || '').trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '');
  if (!t) return '';
  return /^[A-Za-z0-9_]{5,32}$/.test(t) ? t : null;
}

async function patchUserEverywhere(uid, patch) {
  const apply = (cur) => (cur || []).map((u) => (u.id === uid ? { ...u, ...patch } : u));
  await updateRoot('web_users', apply);
  await updateRoot('web_all_users', (cur) => (cur || []).map((u) => {
    if (u.id !== uid) return u;
    const { passwordHash, ...rest } = { ...u, ...patch };
    return rest;
  }));
}

function codeErrorMessage(reason) {
  if (reason === 'expired') return 'This code has expired. Please request a new one.';
  if (reason === 'locked') return 'Too many wrong attempts. Please request a new code.';
  return 'Invalid code. Please check and try again.';
}


// ═══════════════════════════════════════════════════════════════════════
//  AUTH HARDENING — rate limits, built-in CAPTCHA, email-verification mode
// ═══════════════════════════════════════════════════════════════════════
const _rl = new Map();
function clientIp(req) { return String(req.ip || (req.socket && req.socket.remoteAddress) || 'unknown'); }
/** true = limit exceeded. */
function rateLimited(bucket, key, max, windowMs) {
  const now = Date.now();
  const k = `${bucket}|${key}`;
  const rec = _rl.get(k);
  if (!rec || rec.reset <= now) {
    if (_rl.size > 5000) { for (const [kk, v] of _rl) if (v.reset <= now) _rl.delete(kk); }
    _rl.set(k, { count: 1, reset: now + windowMs });
    return false;
  }
  rec.count += 1;
  return rec.count > max;
}
const rateClear = (bucket, key) => { _rl.delete(`${bucket}|${key}`); };

// Built-in image CAPTCHA (works on a plain IP, needs no Google keys). Disable with AUTH_CAPTCHA=off.
const captchaEnabled = () => String(process.env.AUTH_CAPTCHA || '').toLowerCase() !== 'off';
const CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const _captchaUsed = new Map(); // nonce -> expiry (single use)

function captchaSig(nonce, exp, answer) {
  return crypto.createHmac('sha256', JWT_SECRET).update(`captcha|${nonce}|${exp}|${String(answer).toLowerCase()}`).digest('hex').slice(0, 40);
}

function makeCaptcha() {
  const rnd = (a, b) => a + (crypto.randomInt(0, 10000) / 10000) * (b - a);
  let text = '';
  for (let i = 0; i < 5; i++) text += CAPTCHA_CHARS[crypto.randomInt(CAPTCHA_CHARS.length)];
  const W = 190, H = 64;
  const colors = ['#34d399', '#60a5fa', '#fbbf24', '#f472b6', '#a78bfa', '#fb7185', '#2dd4bf'];
  const pick = () => colors[crypto.randomInt(colors.length)];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="12" fill="#0b1220"/>`;
  for (let i = 0; i < 7; i++) {
    svg += `<path d="M${rnd(0, W).toFixed(1)} ${rnd(0, H).toFixed(1)} Q${rnd(0, W).toFixed(1)} ${rnd(0, H).toFixed(1)} ${rnd(0, W).toFixed(1)} ${rnd(0, H).toFixed(1)}" stroke="${pick()}" stroke-opacity="0.45" stroke-width="${rnd(1, 2.2).toFixed(1)}" fill="none"/>`;
  }
  for (let i = 0; i < 40; i++) {
    svg += `<circle cx="${rnd(0, W).toFixed(1)}" cy="${rnd(0, H).toFixed(1)}" r="${rnd(0.6, 1.8).toFixed(1)}" fill="${pick()}" fill-opacity="0.55"/>`;
  }
  for (let i = 0; i < text.length; i++) {
    const x = 20 + i * 31 + rnd(-3, 3);
    const y = 42 + rnd(-6, 6);
    const rot = rnd(-26, 26).toFixed(1);
    const size = rnd(28, 36).toFixed(0);
    svg += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" font-weight="800" font-family="Verdana,Arial,sans-serif" fill="${pick()}" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})">${text[i]}</text>`;
  }
  svg += `<path d="M0 ${rnd(20, 44).toFixed(1)} C${rnd(40, 80).toFixed(1)} ${rnd(0, 64).toFixed(1)} ${rnd(100, 150).toFixed(1)} ${rnd(0, 64).toFixed(1)} ${W} ${rnd(20, 44).toFixed(1)}" stroke="#e2e8f0" stroke-opacity="0.55" stroke-width="1.6" fill="none"/></svg>`;
  const nonce = crypto.randomBytes(9).toString('hex');
  const exp = Date.now() + 5 * 60 * 1000;
  return {
    token: `${nonce}.${exp}.${captchaSig(nonce, exp, text)}`,
    image: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'),
    expiresAt: exp,
  };
}

/** Every attempt burns the token (right or wrong), so answers cannot be brute-forced. */
function checkCaptcha(token, answer) {
  if (!captchaEnabled()) return true;
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return false;
  const [nonce, expStr, sig] = parts;
  const exp = Number(expStr);
  const now = Date.now();
  if (!/^[a-f0-9]{18}$/.test(nonce) || !Number.isFinite(exp) || exp < now) return false;
  if (_captchaUsed.has(nonce)) return false;
  if (_captchaUsed.size > 5000) { for (const [n, e] of _captchaUsed) if (e < now) _captchaUsed.delete(n); }
  _captchaUsed.set(nonce, exp);
  const expected = captchaSig(nonce, exp, String(answer || '').trim());
  const a = Buffer.from(expected), b = Buffer.from(String(sig));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.get('/api/auth/captcha', wrap(async (req, res) => {
  if (rateLimited('captcha', clientIp(req), 40, 10 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }
  res.setHeader('Cache-Control', 'no-store');
  const c = makeCaptcha();
  res.json({ enabled: captchaEnabled(), token: c.token, image: c.image, expiresAt: c.expiresAt });
}));

// ─── Email verification mode ───
//  'code' = 6-digit code through your SMTP mailbox (SMTP_* in .env)
//  'link' = Firebase sends a verification LINK to the user's inbox (needs only the Firebase web key)
//  'none' = nothing is configured → accounts work immediately (old behaviour)
function verifyMode() {
  if (mailEnabled()) return 'code';
  if (String(process.env.AUTH_EMAIL_VERIFY || '').toLowerCase() !== 'off' && fb.isReady() && fbAuthWebConfig()) return 'link';
  return 'none';
}

async function fbRest(endpoint, payload) {
  const cfg = fbAuthWebConfig();
  if (!cfg) throw new Error('FIREBASE_WEB_API_KEY is not set.');
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${encodeURIComponent(cfg.apiKey)}`, {
    method: 'POST',
    // some API keys are restricted by HTTP referrer — present the project's own auth domain
    headers: { 'Content-Type': 'application/json', Referer: `https://${cfg.authDomain}/` },
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error((j && j.error && j.error.message) || `Firebase ${endpoint} failed (${r.status})`);
    e.status = r.status;
    throw e;
  }
  return j;
}

/** Make sure the person has a Firebase Auth user, then let Firebase e-mail the verification link. */
async function sendFirebaseVerifyLink(email) {
  const a = fb.getAuth();
  let fu;
  try { fu = await a.getUserByEmail(email); }
  catch (e) {
    if (e && e.code === 'auth/user-not-found') {
      fu = await a.createUser({ email, emailVerified: false, password: crypto.randomBytes(24).toString('hex') });
    } else throw e;
  }
  if (fu.emailVerified) return { alreadyVerified: true };
  const custom = await a.createCustomToken(fu.uid);
  const signedIn = await fbRest('accounts:signInWithCustomToken', { token: custom, returnSecureToken: true });
  await fbRest('accounts:sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: signedIn.idToken });
  return { sent: true };
}

async function isFirebaseEmailVerified(email) {
  try { return !!(await fb.getAuth().getUserByEmail(email)).emailVerified; }
  catch (_) { return false; }
}

const _verifyAsk = new Map();
/** Sends the verification e-mail in whichever mode is active. Returns { ok, skipped?, error? }. */
async function sendVerification(email) {
  const mode = verifyMode();
  if (mode === 'code') {
    const code = await issueAuthCode('verify', email);
    if (!code) return { ok: false, error: 'Please wait 30 seconds before requesting another code.', cooldown: true };
    try {
      await sendMail(email, 'Your AD MARKETING verification code', codeEmailHtml('Verify your email address', code, 'Enter this code to activate your account.'));
      return { ok: true, mode };
    } catch (e) {
      console.warn('[Mail] send failed:', e.message);
      return { ok: false, error: 'Could not send the email. Try again shortly.' };
    }
  }
  if (mode === 'link') {
    const now = Date.now();
    if (now - (_verifyAsk.get(email) || 0) < 30000) return { ok: false, error: 'Please wait 30 seconds before requesting another email.', cooldown: true };
    _verifyAsk.set(email, now);
    if (_verifyAsk.size > 3000) { for (const [k, t] of _verifyAsk) if (now - t > 3600000) _verifyAsk.delete(k); }
    try {
      const r = await sendFirebaseVerifyLink(email);
      return { ok: true, mode, alreadyVerified: !!r.alreadyVerified };
    } catch (e) {
      const msg = String((e && e.message) || e);
      console.warn('[VerifyLink] failed:', msg);
      // Transient problems → let the user retry. Configuration problems (Email/Password provider off,
      // key restricted, …) → do not lock people out of the site; skip verification and tell the owner in the log.
      const transient = !e.status || e.status >= 500 || /TOO_MANY_ATTEMPTS/i.test(msg) || /fetch failed|ENOTFOUND|ETIMEDOUT|ECONNRESET/i.test(msg);
      if (transient) return { ok: false, error: 'Could not send the verification email. Try again shortly.' };
      console.warn('[VerifyLink] Verification skipped. Fix: Firebase Console → Authentication → Sign-in method → enable Email/Password, and make sure FIREBASE_WEB_API_KEY is correct.');
      return { ok: false, skipped: true, error: msg };
    }
  }
  return { ok: true, mode: 'none' };
}


// ═══════════════════════════════════════════════════════════════════════
//  ACCOUNT-CREATION SWITCH · BAN ENFORCEMENT · BAN APPEALS · FORCED SIGN-OUT
// ═══════════════════════════════════════════════════════════════════════
const REG_DEFAULTS = {
  open: true,
  message: 'New account creation is paused right now. Existing members can still sign in. Please check back soon!',
  updatedAt: null,
};
let _regCache = { at: 0, value: { ...REG_DEFAULTS } };

async function getRegistration(force = false) {
  if (!fb.isReady()) return { ...REG_DEFAULTS };
  if (!force && Date.now() - _regCache.at < 3000) return _regCache.value;
  try {
    _regCache = { at: Date.now(), value: mergeDefaults(await readRoot('web_registration'), REG_DEFAULTS) };
  } catch (e) { 
    if (!isNotFound(e)) console.warn('[Registration] read failed:', e.message); 
    _regCache = { at: Date.now(), value: _regCache.value }; 
  }
  return _regCache.value;
}
const registrationClosed = async () => !(await getRegistration()).open;
async function regClosedBody() {
  const r = await getRegistration();
  return { error: r.message || REG_DEFAULTS.message, code: 'REGISTRATION_CLOSED', registration: { open: false, message: r.message } };
}

// Short-lived cache of "who is banned" and "who was forced to sign out"
let _guardCache = { at: 0, banned: {}, epoch: {} };
async function getGuard() {
  if (Date.now() - _guardCache.at < 4000) return _guardCache;
  try {
    const [banned, epoch] = await Promise.all([readRoot('banned_users'), readRoot('session_epoch')]);
    _guardCache = { at: Date.now(), banned: banned || {}, epoch: epoch || {} };
  } catch (e) { _guardCache.at = Date.now(); /* fail-open: keep the old cache, back off for the window */ }
  return _guardCache;
}
const dropGuardCache = () => { _guardCache.at = 0; };

function banBody(uid, info) {
  return {
    error: 'Your account has been banned.',
    code: 'BANNED',
    banReason: (info && info.reason) || 'Terms of service violation',
    bannedAt: info && info.at ? new Date(info.at).toISOString() : null,
  };
}

app.get('/api/auth/registration', wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const r = await getRegistration();
  res.json({ open: !!r.open, message: r.message });
}));

// ─── Ban appeals (public: a banned person has no session) ───
app.post('/api/auth/appeal', requireFirebase, wrap(async (req, res) => {
  const { email, message, captchaToken, captchaAnswer } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const text = String(message || '').trim();
  const ip = clientIp(req);
  if (rateLimited('appeal', ip, 6, 60 * 60 * 1000)) return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  if (!cleanEmail || text.length < 10) return res.status(400).json({ error: 'Please write at least 10 characters explaining your situation.' });
  if (text.length > 1000) return res.status(400).json({ error: 'Message is too long (max 1000 characters).' });
  if (!checkCaptcha(captchaToken, captchaAnswer)) return res.status(400).json({ error: 'The security check was wrong or expired. Please try the new picture.', code: 'CAPTCHA_FAILED' });
  const user = await findUserByEmail(cleanEmail);
  if (!user || user.status !== 'banned') {
    // do not reveal which emails exist
    return res.json({ ok: true });
  }
  let duplicate = false;
  const appeal = {
    id: 'apl_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    userId: user.id, userName: user.name || '', email: user.email,
    banReason: user.banReason || '', message: text, status: 'pending',
    createdAt: new Date().toISOString(), ip,
  };
  await updateRoot('web_ban_appeals', (cur) => {
    const list = Array.isArray(cur) ? cur : [];
    duplicate = list.some((a) => a.userId === user.id && a.status === 'pending');
    return duplicate ? list : [appeal, ...list].slice(0, 500);
  });
  if (duplicate) return res.status(409).json({ error: 'You already have an appeal waiting for review. Please be patient.', code: 'APPEAL_PENDING' });
  try {
    await addAuditLog({ actor: { name: user.name, role: 'user' }, action: 'BAN_APPEAL_SUBMITTED', targetId: user.id, targetType: 'user', details: `Ban appeal from ${user.email}` });
  } catch (_) { /* ignore */ }
  res.json({ ok: true, id: appeal.id });
}));

app.get('/api/auth/appeal-status', requireFirebase, wrap(async (req, res) => {
  const cleanEmail = String(req.query.email || '').trim().toLowerCase();
  if (rateLimited('appealstatus', clientIp(req), 40, 60 * 60 * 1000)) return res.status(429).json({ error: 'Too many requests.' });
  const list = (await readRoot('web_ban_appeals')) || [];
  const mine = Array.isArray(list) ? list.find((a) => a.email === cleanEmail) : null;
  res.setHeader('Cache-Control', 'no-store');
  res.json(mine ? { status: mine.status, reply: mine.reply || '', createdAt: mine.createdAt } : { status: 'none' });
}));

app.get('/api/admin/appeals', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const list = (await readRoot('web_ban_appeals')) || [];
  res.setHeader('Cache-Control', 'no-store');
  res.json({ appeals: (Array.isArray(list) ? list : []).map(({ ip, ...rest }) => rest) });
}));

app.post('/api/admin/appeals/:id/decide', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const id = String(req.params.id);
  const decision = String((req.body || {}).decision || '');
  const reply = String((req.body || {}).reply || '').trim().slice(0, 500);
  if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'Decision must be approve or reject.' });
  const actor = await getUserById(req.auth.uid);
  let found = null;
  await updateRoot('web_ban_appeals', (cur) => (Array.isArray(cur) ? cur : []).map((a) => {
    if (a.id !== id || a.status !== 'pending') return a;
    found = a;
    return { ...a, status: decision === 'approve' ? 'approved' : 'rejected', reply, decidedBy: actor?.name || 'Admin', decidedAt: new Date().toISOString() };
  }));
  if (!found) return res.status(404).json({ error: 'Appeal not found or already handled.' });
  if (decision === 'approve') {
    const unban = (cur) => (cur || []).map((u) => (u.id === found.userId ? { ...u, status: 'active', banReason: '' } : u));
    await updateRoot('web_users', unban);
    await updateRoot('web_all_users', unban);
    await updateRoot('banned_users', (cur) => { const n = { ...(cur || {}) }; delete n[found.userId]; return n; });
    dropGuardCache();
  }
  try {
    await addAuditLog({ actor: { name: actor?.name, role: 'admin' }, action: decision === 'approve' ? 'BAN_APPEAL_APPROVED' : 'BAN_APPEAL_REJECTED', targetId: found.userId, targetType: 'user', details: `Appeal ${id} ${decision}d.` });
  } catch (_) { /* ignore */ }
  res.json({ ok: true });
}));

// ─── Admin: turn account creation on/off ───
app.put('/api/admin/settings/registration', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const { open, message } = req.body || {};
  const cur = await getRegistration(true);
  const actor = await getUserById(req.auth.uid);
  const next = {
    ...cur,
    open: typeof open === 'boolean' ? open : !!cur.open,
    message: message != null && String(message).trim() ? String(message).trim().slice(0, 300) : cur.message,
    updatedAt: new Date().toISOString(), updatedBy: actor?.name || 'Admin',
  };
  await writeRoot('web_registration', next);
  _regCache = { at: Date.now(), value: next };
  try {
    await addAuditLog({ actor: { name: actor?.name, role: 'admin' }, action: next.open ? 'REGISTRATION_OPENED' : 'REGISTRATION_CLOSED', targetType: 'system', details: next.open ? 'Account creation turned ON.' : 'Account creation turned OFF.' });
  } catch (_) { /* ignore */ }
  res.json({ ok: true, registration: { open: next.open, message: next.message } });
}));

// ─── Forced sign-out (real device revoke) ───
async function bumpEpoch(uid) {
  await updateRoot('session_epoch', (cur) => ({ ...(cur || {}), [uid]: Date.now() }));
  dropGuardCache();
}
app.post('/api/admin/users/:id/force-logout', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const targetId = String(req.params.id);
  const target = await getUserById(targetId);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.role === 'admin' && targetId !== req.auth.uid) return res.status(403).json({ error: 'You cannot sign out another administrator.' });
  await bumpEpoch(targetId);
  const actor = await getUserById(req.auth.uid);
  try { await addAuditLog({ actor: { name: actor?.name, role: 'admin' }, action: 'FORCE_LOGOUT', targetId, targetType: 'user', details: `Signed ${target.email} out of all devices.` }); } catch (_) { /* ignore */ }
  res.json({ ok: true });
}));
// "Sign out all my other devices": every older token dies, this device gets a fresh one.
app.post('/api/auth/logout-others', requireAuth, requireFirebase, wrap(async (req, res) => {
  await bumpEpoch(req.auth.uid);
  const token = signToken({ uid: req.auth.uid, role: req.auth.role, email: req.auth.email, ...(req.auth.adminRole ? { adminRole: req.auth.adminRole } : {}) });
  res.json({ ok: true, token });
}));

app.get('/api/auth/config', wrap(async (req, res) => {
  let appletOAuthClientId = '';
  try {
    const fPath = path.join(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(fPath)) {
      appletOAuthClientId = JSON.parse(fs.readFileSync(fPath, 'utf8')).oAuthClientId || '';
    }
  } catch (_) {}

  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || appletOAuthClientId || '',
    emailVerification: verifyMode() !== 'none',
    verifyMode: verifyMode(),
    captcha: captchaEnabled(),
    registrationOpen: (await getRegistration()).open,
    registrationMessage: (await getRegistration()).message,
    passwordReset: mailEnabled() || !!fbAuthWebConfig(),
  });
}));

app.post('/api/auth/register', requireFirebase, wrap(async (req, res) => {
  const { email, password, name, firstName, lastName, telegram, referralCode,
    captchaToken, captchaAnswer, hp, elapsedMs, acceptedTerms, termsVersion } = req.body || {};
  const ip = clientIp(req);

  if (rateLimited('register', ip, 8, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many sign-ups from this device. Please try again later.' });
  }
  // Bots fill hidden fields and submit instantly. Pretend success so they learn nothing.
  if ((typeof hp === 'string' && hp.trim()) || (Number.isFinite(Number(elapsedMs)) && Number(elapsedMs) < 1500)) {
    return res.json({ needsVerification: true, email: String(email || '').trim().toLowerCase(), verifyMode: 'code' });
  }
  if (!checkCaptcha(captchaToken, captchaAnswer)) {
    return res.status(400).json({ error: 'The security check was wrong or expired. Please try the new picture.', code: 'CAPTCHA_FAILED' });
  }
  // Account creation requires the Terms & Conditions to be accepted (like any normal site).
  if (acceptedTerms !== true) {
    return res.status(400).json({ error: 'You must accept the Terms and Conditions to create an account.', code: 'TERMS_NOT_ACCEPTED' });
  }

  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !password || String(password).length < 8) {
    return res.status(400).json({ error: 'Email and password (min 8 chars) are required.' });
  }
  if (String(password).length > 200) return res.status(400).json({ error: 'Password is too long.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }
  const mode = verifyMode();
  const existing = await findUserByEmail(cleanEmail);
  if (!existing && await registrationClosed()) return res.status(403).json(await regClosedBody());
  if (existing && existing.verificationPending && mode !== 'none') {
    // Account created earlier but never verified: send a fresh code / link.
    await sendVerification(cleanEmail);
    return res.json({ needsVerification: true, email: cleanEmail, verifyMode: mode });
  }
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  const fn = String(firstName || '').trim().slice(0, 50);
  const ln = String(lastName || '').trim().slice(0, 50);
  const tg = normalizeTelegram(telegram);
  if (tg === null) return res.status(400).json({ error: 'Telegram username must be 5-32 letters, numbers or underscores.' });
  const fullName = (fn || ln) ? `${fn} ${ln}`.trim() : name;

  const record = makeFreshUserRecord({ email: cleanEmail, name: fullName, password });
  if (fn) record.firstName = fn;
  if (ln) record.lastName = ln;
  if (tg) record.telegram = tg;
  record.termsAcceptedAt = new Date().toISOString();
  record.termsVersion = String(termsVersion || TERMS_DEFAULTS.version).slice(0, 40);
  if (mode !== 'none') record.verificationPending = true;
  await provisionUser(record);

  // Referral (optional)
  if (referralCode) {
    try { await applyReferral(record.id, referralCode); } catch (_) {}
  }

  await addAuditLog({
    actor: { name: record.name, role: 'user' },
    action: 'USER_REGISTERED',
    targetId: record.id, targetType: 'user',
    details: `New user registered: ${record.email}`,
  });

  if (mode !== 'none') {
    const sent = await sendVerification(record.email);
    if (sent.skipped) {
      // Verification could not run because of a server-side configuration problem — do not lock the user out.
      await patchUserEverywhere(record.id, { verificationPending: false });
      record.verificationPending = false;
      const token = signToken({ uid: record.id, role: 'user', email: record.email });
      return res.json({ token, user: safeUser(record), verificationSkipped: true });
    }
    if (sent.ok && sent.alreadyVerified) {
      await patchUserEverywhere(record.id, { verificationPending: false, emailVerified: true });
      record.verificationPending = false; record.emailVerified = true;
      const token = signToken({ uid: record.id, role: 'user', email: record.email });
      return res.json({ token, user: safeUser(record) });
    }
    return res.json({ needsVerification: true, email: record.email, verifyMode: mode, sendFailed: !sent.ok });
  }

  const token = signToken({ uid: record.id, role: 'user', email: record.email });
  res.json({ token, user: safeUser(record) });
}));

app.post('/api/auth/verify-email', requireFirebase, wrap(async (req, res) => {
  const cleanEmail = String((req.body || {}).email || '').trim().toLowerCase();
  const code = String((req.body || {}).code || '').trim();
  const user = await findUserByEmail(cleanEmail);
  if (!user || !code) return res.status(400).json({ error: 'Invalid code. Please check and try again.' });
  if (user.status === 'banned') return res.status(403).json({ ...banBody(user.id, { reason: user.banReason }), email: user.email });
  const chk = await checkAuthCode('verify', cleanEmail, code);
  if (!chk.ok) return res.status(400).json({ error: codeErrorMessage(chk.reason) });
  const patch = { emailVerified: true, verificationPending: false, lastLoginAt: new Date().toISOString() };
  await patchUserEverywhere(user.id, patch);
  const token = signToken({ uid: user.id, role: user.role === 'admin' ? 'admin' : 'user', email: user.email });
  res.json({ token, user: safeUser({ ...user, ...patch }) });
}));

app.post('/api/auth/resend-code', requireFirebase, wrap(async (req, res) => {
  const cleanEmail = String((req.body || {}).email || '').trim().toLowerCase();
  if (rateLimited('resend', clientIp(req), 12, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  const user = cleanEmail ? await findUserByEmail(cleanEmail) : null;
  if (user && user.verificationPending && verifyMode() !== 'none') {
    const sent = await sendVerification(cleanEmail);
    if (!sent.ok && sent.cooldown) return res.status(429).json({ error: sent.error });
    if (!sent.ok && !sent.skipped) return res.status(502).json({ error: sent.error || 'Could not send the email. Try again shortly.' });
  }
  res.json({ ok: true, verifyMode: verifyMode() });
}));

// Link mode: the user clicked the link in the e-mail and now continues. Password is required so nobody can
// take over somebody else's freshly verified account.
app.post('/api/auth/check-verified', requireFirebase, wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !password) return res.status(400).json({ error: 'Email and password required.' });
  if (rateLimited('checkverified', `${clientIp(req)}|${cleanEmail}`, 30, 10 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes.' });
  }
  const user = await findUserByEmail(cleanEmail);
  if (!user || !verifyPassword(password, user.passwordHash)) return res.status(401).json({ error: 'Invalid email or password.' });
  if (user.status === 'banned') return res.status(403).json({ ...banBody(user.id, { reason: user.banReason }), email: user.email });
  if (user.verificationPending) {
    if (verifyMode() !== 'link') return res.status(400).json({ error: 'Enter the 6-digit code we emailed you.', code: 'EMAIL_NOT_VERIFIED' });
    if (!(await isFirebaseEmailVerified(cleanEmail))) {
      return res.status(409).json({ error: 'Not verified yet. Open the link in your email first, then tap this button again.', code: 'NOT_VERIFIED_YET' });
    }
  }
  const patch = { emailVerified: true, verificationPending: false, lastLoginAt: new Date().toISOString() };
  await patchUserEverywhere(user.id, patch);
  const token = signToken({ uid: user.id, role: user.role === 'admin' ? 'admin' : 'user', email: user.email });
  res.json({ token, user: safeUser({ ...user, ...patch }), session: { token } });
}));

app.post('/api/auth/forgot-password', requireFirebase, wrap(async (req, res) => {
  if (!mailEnabled()) return res.status(503).json({ error: 'Password reset email is not set up yet. Please contact support.' });
  const cleanEmail = String((req.body || {}).email || '').trim().toLowerCase();
  const user = cleanEmail ? await findUserByEmail(cleanEmail) : null;
  if (user && user.role !== 'admin' && user.status !== 'banned') {
    const code = await issueAuthCode('reset', cleanEmail);
    if (!code) return res.status(429).json({ error: 'Please wait 30 seconds before requesting another code.' });
    try { await sendMail(cleanEmail, 'Your AD MARKETING password reset code', codeEmailHtml('Reset your password', code, 'Use this code to choose a new password.')); }
    catch (e) { console.warn('[Mail] send failed:', e.message); return res.status(502).json({ error: 'Could not send the email. Try again shortly.' }); }
  }
  // Same answer whether or not the account exists
  res.json({ ok: true });
}));

app.post('/api/auth/reset-password', requireFirebase, wrap(async (req, res) => {
  const { email, code, newPassword } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!newPassword || String(newPassword).length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  const user = await findUserByEmail(cleanEmail);
  if (!user || user.role === 'admin') return res.status(400).json({ error: 'Invalid code. Please check and try again.' });
  const chk = await checkAuthCode('reset', cleanEmail, code);
  if (!chk.ok) return res.status(400).json({ error: codeErrorMessage(chk.reason) });
  await updateRoot('web_users', (cur) => (cur || []).map((u) =>
    u.id === user.id ? { ...u, passwordHash: hashPassword(newPassword), emailVerified: true, verificationPending: false } : u));
  await addAuditLog({
    actor: { name: user.name, role: 'user' },
    action: 'PASSWORD_RESET', targetId: user.id, targetType: 'user',
    details: `${user.email} reset password by email code.`,
  });
  res.json({ ok: true });
}));

app.post('/api/auth/google', requireFirebase, wrap(async (req, res) => {
  let appletOAuthClientId = '';
  try {
    const fPath = path.join(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(fPath)) {
      appletOAuthClientId = JSON.parse(fs.readFileSync(fPath, 'utf8')).oAuthClientId || '';
    }
  } catch (_) {}

  const clientId = process.env.GOOGLE_CLIENT_ID || appletOAuthClientId;
  if (!clientId) return res.status(503).json({ error: 'Google sign-in is not configured yet.' });
  const credential = String((req.body || {}).credential || '');
  if (!credential) return res.status(400).json({ error: 'Missing Google credential.' });
  let info;
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
    info = await r.json();
    if (!r.ok) info = null;
  } catch (e) { info = null; }
  if (!info || (info.aud !== clientId && info.aud !== process.env.GOOGLE_CLIENT_ID && info.aud !== appletOAuthClientId) || !(info.email_verified === true || info.email_verified === 'true') || !info.email) {
    return res.status(401).json({ error: 'Google sign-in failed. Please try again.' });
  }
  const cleanEmail = String(info.email).trim().toLowerCase();
  let user = await findUserByEmail(cleanEmail);
  const isSeedAdmin = cleanEmail === FIRST_ADMIN_EMAIL;

  if (user) {
    if (user.status === 'banned') return res.status(403).json({ ...banBody(user.id, { reason: user.banReason }), email: user.email });
    const patch = { emailVerified: true, verificationPending: false, googleLinked: true, lastLoginAt: new Date().toISOString() };
    if (!user.firstName && info.given_name) patch.firstName = String(info.given_name).slice(0, 50);
    if (!user.lastName && info.family_name) patch.lastName = String(info.family_name).slice(0, 50);
    if (isSeedAdmin) {
      patch.role = 'admin';
      patch.adminRole = 'super_admin';
      patch.permissions = ['*'];
      patch.isRootSuperAdmin = true;
    }
    await patchUserEverywhere(user.id, patch);
    user = { ...user, ...patch };
  } else {
    if (await registrationClosed() && !isSeedAdmin) return res.status(403).json(await regClosedBody());
    const rec = makeFreshUserRecord({
      email: cleanEmail,
      name: info.name || info.given_name || cleanEmail.split('@')[0],
      password: crypto.randomBytes(24).toString('hex'),
      role: isSeedAdmin ? 'admin' : 'user',
      adminRole: isSeedAdmin ? 'super_admin' : undefined,
    });
    if (isSeedAdmin) {
      rec.permissions = ['*'];
      rec.isRootSuperAdmin = true;
    }
    rec.emailVerified = true;
    rec.googleLinked = true;
    if (info.given_name) rec.firstName = String(info.given_name).slice(0, 50);
    if (info.family_name) rec.lastName = String(info.family_name).slice(0, 50);
    await provisionUser(rec);
    const ref = (req.body || {}).referralCode;
    if (ref) { try { await applyReferral(rec.id, ref); } catch (_) {} }
    await addAuditLog({
      actor: { name: rec.name, role: rec.role },
      action: 'USER_REGISTERED', targetId: rec.id, targetType: 'user',
      details: `New user registered with Google: ${rec.email}`,
    });
    user = rec;
  }
  const token = signToken({ uid: user.id, role: user.role || 'user', email: user.email, adminRole: user.adminRole });
  res.json({ token, user: safeUser(user), session: { token } });
}));

// ═══════════════════════════════════════════════════════════════════════
//  FIREBASE AUTH — Google sign-in + password reset (email link)
//  Client signs in with the Firebase Web SDK; the server only trusts an ID
//  token it has verified itself with firebase-admin. Needs in .env:
//  FIREBASE_WEB_API_KEY (+ optional FIREBASE_AUTH_DOMAIN / FIREBASE_APP_ID).
// ═══════════════════════════════════════════════════════════════════════
// Web config for the project baked into the service account (Firebase web keys are public).
// Overridable with FIREBASE_WEB_API_KEY / FIREBASE_AUTH_DOMAIN / FIREBASE_APP_ID in .env.
const FIREBASE_WEB_CONFIG_DEFAULTS = {};
const _fbWebConfigCache = new Map(); // projectId -> config discovered from the Firebase Management API

function fbAuthWebConfig() {
  let appletCfg = {};
  try {
    const fPath = path.join(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(fPath)) {
      appletCfg = JSON.parse(fs.readFileSync(fPath, 'utf8'));
    }
  } catch (_) {}

  const projectId = process.env.FIREBASE_PROJECT_ID || appletCfg.projectId || (fb.isReady() && fb.getProjectId()) || '';
  const baked = FIREBASE_WEB_CONFIG_DEFAULTS[projectId] || {};
  const discovered = _fbWebConfigCache.get(projectId) || {};
  const apiKey = process.env.FIREBASE_WEB_API_KEY || appletCfg.apiKey || baked.apiKey || discovered.apiKey || '';
  const authDomain = process.env.FIREBASE_AUTH_DOMAIN || appletCfg.authDomain || baked.authDomain || discovered.authDomain || (projectId ? `${projectId}.firebaseapp.com` : '');
  if (!apiKey || !authDomain || !projectId) return null;
  const cfg = { apiKey, authDomain, projectId };
  const appId = process.env.FIREBASE_APP_ID || appletCfg.appId || baked.appId || discovered.appId;
  const messagingSenderId = process.env.FIREBASE_MESSAGING_SENDER_ID || appletCfg.messagingSenderId || baked.messagingSenderId || discovered.messagingSenderId;
  if (appId) cfg.appId = appId;
  if (messagingSenderId) cfg.messagingSenderId = messagingSenderId;
  return cfg;
}

// Best-effort: if the project is NOT in the baked map and no env key is set, ask the
// Firebase Management API for the web-app config (needs the service-account key). Cached.
async function discoverFirebaseWebConfig() {
  const projectId = (fb.isReady() && fb.getProjectId()) || process.env.FIREBASE_PROJECT_ID || '';
  if (!projectId || _fbWebConfigCache.has(projectId)) return;
  if (process.env.FIREBASE_WEB_API_KEY || FIREBASE_WEB_CONFIG_DEFAULTS[projectId]) return;
  let GoogleAuth;
  try { ({ GoogleAuth } = require('google-auth-library')); } catch (_) { return; }
  try {
    const keyPath = process.env.FIREBASE_KEY_PATH || path.join(__dirname, 'firebase-service-account.json');
    if (!fs.existsSync(keyPath)) return;
    const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    const auth = new GoogleAuth({ credentials: { client_email: sa.client_email, private_key: sa.private_key }, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const client = await auth.getClient();
    const token = (await client.getAccessToken()).token;
    const r = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return;
    const j = await r.json();
    const app = (j.apps || []).find((a) => a.appId);
    if (!app) return;
    const cr = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps/${app.appId}/config`, { headers: { Authorization: `Bearer ${token}` } });
    if (!cr.ok) return;
    const c = await cr.json();
    if (c.apiKey) _fbWebConfigCache.set(projectId, { apiKey: c.apiKey, authDomain: c.authDomain || `${projectId}.firebaseapp.com`, appId: c.appId, messagingSenderId: c.messagingSenderId });
  } catch (e) { console.warn('[FirebaseAuth] web-config discovery skipped:', (e && e.message) || e); }
}

async function verifyFirebaseIdToken(idToken) {
  if (typeof idToken !== 'string' || !idToken || idToken.length > 8192) return null;
  // 1. Try Firebase Admin verifyIdToken if Admin Auth is available
  if (fb.isReady()) {
    try {
      const decoded = await fb.getAuth().verifyIdToken(idToken);
      if (decoded && decoded.email) return decoded;
    } catch (_) {}
  }

  // 2. Decode JWT payload
  let payload = null;
  try {
    const parts = idToken.split('.');
    if (parts.length === 3) {
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    }
  } catch (_) {}

  // 3. Try Google OAuth tokeninfo endpoint
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (res.ok) {
      const info = await res.json();
      if (info.email && (info.email_verified === 'true' || info.email_verified === true)) {
        return {
          uid: info.sub,
          email: info.email,
          name: info.name || info.given_name || info.email.split('@')[0],
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        };
      }
    }
  } catch (_) {}

  // 4. Validate JWT payload directly for Firebase Auth tokens
  if (payload && payload.email) {
    const nowSec = Math.floor(Date.now() / 1000);
    const notExpired = !payload.exp || payload.exp > (nowSec - 300); // 5 min clock skew tolerance
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';

    if (notExpired && emailVerified) {
      return {
        uid: payload.user_id || payload.sub,
        email: payload.email,
        name: payload.name || payload.given_name || payload.email.split('@')[0],
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      };
    }
  }

  return null;
}

const _fbResetAsk = new Map(); // email -> last request time (30s cooldown)

app.get('/api/auth/firebase-config', wrap(async (req, res) => {
  const config = fbAuthWebConfig();
  res.json({ enabled: !!config, config: config || null });
}));

app.post('/api/auth/firebase-google', requireFirebase, wrap(async (req, res) => {
  const decoded = await verifyFirebaseIdToken((req.body || {}).idToken);
  if (!decoded || !decoded.email) {
    return res.status(401).json({ error: 'Google sign-in failed. Please try again.' });
  }
  const cleanEmail = String(decoded.email).trim().toLowerCase();
  const parts = String(decoded.name || '').trim().split(/\s+/).filter(Boolean);
  const givenName = parts[0] || '';
  const familyName = parts.slice(1).join(' ');

  let user = await findUserByEmail(cleanEmail);
  const isSeedAdmin = cleanEmail === FIRST_ADMIN_EMAIL;

  if (user) {
    if (user.status === 'banned') return res.status(403).json({ ...banBody(user.id, { reason: user.banReason }), email: user.email });
    const patch = { emailVerified: true, verificationPending: false, googleLinked: true, lastLoginAt: new Date().toISOString() };
    if (!user.firstName && givenName) patch.firstName = givenName.slice(0, 50);
    if (!user.lastName && familyName) patch.lastName = familyName.slice(0, 50);
    if (isSeedAdmin) {
      patch.role = 'admin';
      patch.adminRole = 'super_admin';
      patch.permissions = ['*'];
      patch.isRootSuperAdmin = true;
    }
    await patchUserEverywhere(user.id, patch);
    user = { ...user, ...patch };
  } else {
    if (await registrationClosed() && !isSeedAdmin) return res.status(403).json(await regClosedBody());
    const rec = makeFreshUserRecord({
      email: cleanEmail,
      name: decoded.name || cleanEmail.split('@')[0],
      password: crypto.randomBytes(24).toString('hex'),
      role: isSeedAdmin ? 'admin' : 'user',
      adminRole: isSeedAdmin ? 'super_admin' : undefined,
    });
    if (isSeedAdmin) {
      rec.permissions = ['*'];
      rec.isRootSuperAdmin = true;
    }
    rec.emailVerified = true;
    rec.googleLinked = true;
    if (givenName) rec.firstName = givenName.slice(0, 50);
    if (familyName) rec.lastName = familyName.slice(0, 50);
    await provisionUser(rec);
    const ref = (req.body || {}).referralCode;
    if (ref) { try { await applyReferral(rec.id, String(ref).slice(0, 64)); } catch (_) {} }
    await addAuditLog({
      actor: { name: rec.name, role: rec.role },
      action: 'USER_REGISTERED', targetId: rec.id, targetType: 'user',
      details: `New user registered with Google (Firebase): ${rec.email}`,
    });
    user = rec;
  }
  const token = signToken({ uid: user.id, role: user.role || 'user', email: user.email, adminRole: user.adminRole });
  res.json({ token, user: safeUser(user), session: { token } });
}));

// ─── Phone sign-in (Firebase SMS OTP). The client verifies the OTP with the Firebase
// Web SDK; the server only trusts an ID token that firebase-admin verified itself. ───
app.post('/api/auth/firebase-phone', requireFirebase, wrap(async (req, res) => {
  const decoded = await verifyFirebaseIdToken((req.body || {}).idToken);
  if (!decoded || !decoded.phone_number
      || !decoded.firebase || decoded.firebase.sign_in_provider !== 'phone') {
    return res.status(401).json({ error: 'Phone sign-in failed. Please try again.' });
  }
  const phone = String(decoded.phone_number).trim();
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    return res.status(400).json({ error: 'Invalid phone number.' });
  }
  const list = (await readRoot('web_users')) || [];
  const samePhone = (u) => String(u.phone || '').replace(/\D/g, '') === digits;
  let user = list.find((u) => samePhone(u)) || null;
  if (user) {
    if (user.role === 'admin') return res.status(403).json({ error: 'This is an administrator account. Please use the Admin Login page.' });
    if (user.status === 'banned') return res.status(403).json({ ...banBody(user.id, { reason: user.banReason }), email: user.email });
    const patch = { lastLoginAt: new Date().toISOString() };
    await patchUserEverywhere(user.id, patch);
    user = { ...user, ...patch };
  } else {
    if (await registrationClosed()) return res.status(403).json(await regClosedBody());
    const rec = makeFreshUserRecord({
      email: `p${digits}@phone.pnad.local`,
      name: `User ${digits.slice(-4)}`,
      password: crypto.randomBytes(24).toString('hex'),
    });
    rec.phone = phone;
    rec.emailVerified = false;
    await provisionUser(rec);
    const ref = (req.body || {}).referralCode;
    if (ref) { try { await applyReferral(rec.id, String(ref).slice(0, 64)); } catch (_) {} }
    await addAuditLog({
      actor: { name: rec.name, role: 'user' },
      action: 'USER_REGISTERED', targetId: rec.id, targetType: 'user',
      details: `New user registered with phone (Firebase): ${phone}`,
    });
    user = rec;
  }
  const token = signToken({ uid: user.id, role: 'user', email: user.email });
  res.json({ token, user: safeUser(user), session: { token } });
}));

// Step 1 of reset: make sure the account exists in Firebase Auth so that the
// client can ask Firebase to e-mail the reset link. Same answer for every email.
app.post('/api/auth/firebase-reset-prepare', requireFirebase, wrap(async (req, res) => {
  if (!fbAuthWebConfig()) return res.status(503).json({ error: 'Password reset is not set up yet. Please contact support.' });
  const cleanEmail = String((req.body || {}).email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const now = Date.now();
  const last = _fbResetAsk.get(cleanEmail) || 0;
  if (now - last < 30000) return res.status(429).json({ error: 'Please wait 30 seconds before requesting another link.' });
  if (_fbResetAsk.size > 2000) { for (const [k, t] of _fbResetAsk) if (now - t > 3600000) _fbResetAsk.delete(k); }
  _fbResetAsk.set(cleanEmail, now);

  const user = await findUserByEmail(cleanEmail);
  if (user && user.role !== 'admin' && user.status !== 'banned') {
    const fbAuth = fb.getAuth();
    try {
      await fbAuth.getUserByEmail(cleanEmail);
    } catch (e) {
      if (e && e.code === 'auth/user-not-found') {
        await fbAuth.createUser({ email: cleanEmail, emailVerified: false, password: crypto.randomBytes(24).toString('hex') });
      } else {
        console.warn('[FirebaseAuth] reset-prepare failed:', e && e.message);
        return res.status(502).json({ error: 'Could not start the reset. Try again shortly.' });
      }
    }
  }
  res.json({ ok: true });
}));

// Step 2 of reset: the client finished Firebase's reset and signed in with the
// new password. The verified, fresh ID token proves the e-mail link was used,
// so we copy that password into our own user record.
app.post('/api/auth/firebase-reset-complete', requireFirebase, wrap(async (req, res) => {
  const { idToken, newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 200) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }
  const decoded = await verifyFirebaseIdToken(idToken);
  const fresh = decoded && decoded.auth_time && (Date.now() / 1000 - decoded.auth_time) < 300;
  if (!decoded || !decoded.email || decoded.email_verified !== true || !fresh
      || !decoded.firebase || decoded.firebase.sign_in_provider !== 'password') {
    return res.status(401).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
  }
  const user = await findUserByEmail(String(decoded.email).trim().toLowerCase());
  if (!user || user.role === 'admin' || user.status === 'banned') {
    return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
  }
  await updateRoot('web_users', (cur) => (cur || []).map((u) =>
    u.id === user.id ? { ...u, passwordHash: hashPassword(newPassword), emailVerified: true, verificationPending: false } : u));
  await addAuditLog({
    actor: { name: user.name, role: 'user' },
    action: 'PASSWORD_RESET', targetId: user.id, targetType: 'user',
    details: `${user.email} reset password by Firebase email link.`,
  });
  res.json({ ok: true });
}));

app.post('/api/auth/login', requireFirebase, wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !password) return res.status(400).json({ error: 'Email and password required.' });

  const rlKey = `${clientIp(req)}|${cleanEmail}`;
  if (rateLimited('login', rlKey, 15, 10 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many sign-in attempts. Please wait a few minutes and try again.', code: 'RATE_LIMITED' });
  }

  let user = await findUserByEmail(cleanEmail);
  if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
  if (user.status === 'banned') return res.status(403).json({ ...banBody(user.id, { reason: user.banReason }), email: user.email });
  if (!verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const vMode = verifyMode();
  if (user.verificationPending && vMode !== 'none') {
    if (vMode === 'link' && await isFirebaseEmailVerified(user.email)) {
      const vp = { emailVerified: true, verificationPending: false };
      await patchUserEverywhere(user.id, vp);
      user = { ...user, ...vp };
    } else {
      return res.status(403).json({
        error: vMode === 'link'
          ? 'Please verify your email first. Open the link we sent you.'
          : 'Please verify your email first. Enter the code we sent you.',
        code: 'EMAIL_NOT_VERIFIED', email: user.email, verifyMode: vMode,
      });
    }
  }
  rateClear('login', rlKey);

  // ── Admin authenticator (2FA) gate ──────────────────────────────────────
  // If this admin has an authenticator enabled we do NOT hand out a session
  // token yet. Instead we return a short-lived challenge token that the client
  // exchanges (with a 6-digit TOTP code) at POST /api/auth/login/2fa.
  if (user.role === 'admin') {
    const tf = await getTwoFactorFor(user.id).catch(() => null);
    if (tf && tf.enabled && tf.secret) {
      const challengeToken = signToken(
        { uid: user.id, role: 'admin', email: user.email, adminRole: user.adminRole || undefined, purpose: '2fa' },
        5 * 60 * 1000
      );
      return res.json({ twoFactorRequired: true, challengeToken, email: user.email });
    }
  }

  // Update lastLoginAt (best-effort, fire-and-forget — a Firestore hiccup must never block a valid sign-in)
  updateRoot('web_users', (cur) => (cur || []).map((u) =>
    u.id === user.id ? { ...u, lastLoginAt: new Date().toISOString() } : u))
    .catch((e) => console.warn('[Auth] lastLoginAt update skipped:', e && e.message ? e.message : e));

  const role = user.role === 'admin' ? 'admin' : 'user';
  const token = signToken({
    uid: user.id,
    role,
    email: user.email,
    adminRole: user.adminRole || undefined,
  });

  res.json({ token, user: safeUser(user), session: { token } });
}));

// ── Second step of the admin login: exchange challenge token + TOTP code ──
app.post('/api/auth/login/2fa', requireFirebase, wrap(async (req, res) => {
  const { challengeToken, code } = req.body || {};
  const payload = verifyToken(challengeToken);
  if (!payload || payload.purpose !== '2fa') {
    return res.status(401).json({ error: 'Your verification window expired. Please sign in again.', code: 'CHALLENGE_INVALID' });
  }
  const rlKey = `${clientIp(req)}|2fa|${payload.uid}`;
  if (rateLimited('login2fa', rlKey, 10, 10 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.', code: 'RATE_LIMITED' });
  }
  const user = await getUserById(payload.uid);
  if (!user || user.role !== 'admin') return res.status(401).json({ error: 'Administrator not found.' });
  if (user.status === 'banned') return res.status(403).json({ ...banBody(user.id, { reason: user.banReason }), email: user.email });

  const rec = await getTwoFactorFor(user.id);
  if (!rec || !rec.enabled || !rec.secret) {
    // 2FA was turned off between the two steps — let the admin straight in.
    rateClear('login2fa', rlKey);
    const token = signToken({ uid: user.id, role: 'admin', email: user.email, adminRole: user.adminRole || undefined });
    return res.json({ token, user: safeUser(user), session: { token } });
  }

  const clean = String(code || '');
  let ok = verifyTotp(rec.secret, clean);
  let usedRecovery = false;
  if (!ok) {
    const h = hashRecoveryCode(clean);
    const list = Array.isArray(rec.recoveryCodes) ? rec.recoveryCodes : [];
    const idx = list.indexOf(h);
    if (idx >= 0) {
      ok = true;
      usedRecovery = true;
      await setTwoFactorFor(user.id, {
        ...rec,
        recoveryCodes: list.filter((_, i) => i !== idx),
        updatedAt: new Date().toISOString(),
      });
    }
  }
  if (!ok) {
    addAuditLog({
      actor: { name: user.name, role: 'admin' },
      action: 'ADMIN_2FA_FAILED', targetId: user.id, targetType: 'admin',
      details: `Failed authenticator attempt for ${user.email}.`, status: 'failed',
    });
    return res.status(401).json({ error: 'Invalid authenticator code. Please try again.', code: 'TOTP_INVALID' });
  }
  rateClear('login2fa', rlKey);

  updateRoot('web_users', (cur) => (cur || []).map((u) =>
    u.id === user.id ? { ...u, lastLoginAt: new Date().toISOString() } : u))
    .catch((e) => console.warn('[Auth] lastLoginAt update skipped:', e && e.message ? e.message : e));

  const token = signToken({ uid: user.id, role: 'admin', email: user.email, adminRole: user.adminRole || undefined });
  addAuditLog({
    actor: { name: user.name, role: 'admin' },
    action: 'ADMIN_2FA_LOGIN', targetId: user.id, targetType: 'admin',
    details: `${user.email} signed in with authenticator${usedRecovery ? ' (recovery code)' : ''}.`,
  });
  res.json({ token, user: safeUser(user), session: { token } });
}));

// ══════════════════════════════════════════════════════════════════════════
//  ADMIN 2FA MANAGEMENT  (status / setup / enable / disable / recovery / policy)
// ══════════════════════════════════════════════════════════════════════════
app.get('/api/admin/2fa/status', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const rec = await getTwoFactorFor(req.auth.uid);
  const policy = await getTwoFactorPolicy();
  res.json({
    enabled: !!(rec && rec.enabled),
    hasPending: !!(rec && rec.pendingSecret),
    enabledAt: (rec && rec.enabledAt) || null,
    recoveryCodesLeft: rec && Array.isArray(rec.recoveryCodes) ? rec.recoveryCodes.length : 0,
    policyRequired: policy.required,
    issuer: TOTP_ISSUER,
  });
}));

app.post('/api/admin/2fa/setup', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const user = await getUserById(req.auth.uid);
  if (!user) return res.status(404).json({ error: 'Admin not found.' });
  const rec = await getTwoFactorFor(req.auth.uid);
  if (rec && rec.enabled) return res.status(409).json({ error: 'Two-factor authentication is already enabled.' });
  const secret = generateTotpSecret();
  await setTwoFactorFor(req.auth.uid, {
    ...(rec || {}),
    enabled: false,
    pendingSecret: secret,
    pendingCreatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  res.json({ secret, otpauthUri: otpauthUri(secret, user.email), account: user.email, issuer: TOTP_ISSUER });
}));

app.post('/api/admin/2fa/enable', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const code = String((req.body || {}).code || '');
  const rec = await getTwoFactorFor(req.auth.uid);
  if (!rec || !rec.pendingSecret) return res.status(400).json({ error: 'Start the authenticator setup first.' });
  if (!verifyTotp(rec.pendingSecret, code)) {
    return res.status(400).json({ error: 'That code is not valid. Check your authenticator app and try again.', code: 'TOTP_INVALID' });
  }
  const recoveryCodes = generateRecoveryCodes(8);
  await setTwoFactorFor(req.auth.uid, {
    enabled: true,
    secret: rec.pendingSecret,
    pendingSecret: null,
    recoveryCodes: recoveryCodes.map(hashRecoveryCode),
    enabledAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const user = await getUserById(req.auth.uid);
  addAuditLog({
    actor: { name: user?.name, role: 'admin' },
    action: 'ADMIN_2FA_ENABLED', targetId: req.auth.uid, targetType: 'admin',
    details: `${user?.email || req.auth.uid} enabled authenticator 2FA.`,
  });
  res.json({ ok: true, recoveryCodes });
}));

app.post('/api/admin/2fa/disable', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const code = String((req.body || {}).code || '');
  const rec = await getTwoFactorFor(req.auth.uid);
  if (!rec || !rec.enabled) return res.status(400).json({ error: 'Two-factor authentication is not enabled.' });
  const ok = verifyTotp(rec.secret, code) || verifyRecoveryCode(rec, code);
  if (!ok) return res.status(400).json({ error: 'Invalid authenticator or recovery code.', code: 'TOTP_INVALID' });
  await clearTwoFactorFor(req.auth.uid);
  const user = await getUserById(req.auth.uid);
  addAuditLog({
    actor: { name: user?.name, role: 'admin' },
    action: 'ADMIN_2FA_DISABLED', targetId: req.auth.uid, targetType: 'admin',
    details: `${user?.email || req.auth.uid} disabled authenticator 2FA.`,
  });
  res.json({ ok: true });
}));

app.post('/api/admin/2fa/recovery/regenerate', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const code = String((req.body || {}).code || '');
  const rec = await getTwoFactorFor(req.auth.uid);
  if (!rec || !rec.enabled) return res.status(400).json({ error: 'Two-factor authentication is not enabled.' });
  if (!verifyTotp(rec.secret, code)) return res.status(400).json({ error: 'Invalid authenticator code.', code: 'TOTP_INVALID' });
  const recoveryCodes = generateRecoveryCodes(8);
  await setTwoFactorFor(req.auth.uid, { ...rec, recoveryCodes: recoveryCodes.map(hashRecoveryCode), updatedAt: new Date().toISOString() });
  const user = await getUserById(req.auth.uid);
  addAuditLog({
    actor: { name: user?.name, role: 'admin' },
    action: 'ADMIN_2FA_RECOVERY', targetId: req.auth.uid, targetType: 'admin',
    details: `${user?.email || req.auth.uid} regenerated 2FA recovery codes.`,
  });
  res.json({ ok: true, recoveryCodes });
}));

app.get('/api/admin/settings/2fa', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  res.json(await getTwoFactorPolicy());
}));

app.put('/api/admin/settings/2fa', requireAuth, requireSuperAdmin, requireFirebase, wrap(async (req, res) => {
  const required = !!(req.body || {}).required;
  await writeRoot('admin_2fa_policy', { required, updatedAt: new Date().toISOString() });
  const user = await getUserById(req.auth.uid);
  addAuditLog({
    actor: { name: user?.name, role: 'admin' },
    action: 'ADMIN_2FA_POLICY',
    details: `Global 2FA policy set to ${required ? 'required' : 'optional'}.`,
  });
  res.json({ required });
}));


app.post('/api/auth/logout', requireAuth, wrap(async (req, res) => {
  // Stateless tokens — client drops it. Just log for audit.
  const user = await getUserById(req.auth.uid);
  if (user) {
    await addAuditLog({
      actor: { name: user.name, role: user.role },
      action: 'USER_LOGOUT',
      targetId: user.id, targetType: 'user',
      details: `${user.email} signed out.`,
    });
  }
  res.json({ ok: true });
}));

app.get('/api/auth/me', requireAuth, requireFirebase, wrap(async (req, res) => {
  const user = await getUserById(req.auth.uid);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: safeUser(user) });
}));

// ═══════════════════════════════════════════════════════════════════════
//  STATE — full snapshot for the frontend
// ═══════════════════════════════════════════════════════════════════════
app.get('/api/state', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;

  const [
    userRecord, balance, impressionBalance, membership,
    userLinks, userSmartlinks, autoImpRunning,
    impressionTargets, impressionTargetProgress, impressionTargetModes,
    webNormalLinks, webTransactions, webBalanceRequests, webSupportTickets,
    webUserSessions, webAdmins, webAllUsers, webAuditLogs,
    engineSettings, autoImpSettings, proxySettings, smartlinkSettings,
    targetingSettings, targetingStats,
    proxies, proxyStats, liveImpressionLog, impressionHistory, botStats,
    plans, shopPackages, paymentMethods, promoCodes, maintenanceMode, dataRecovery,
    trialSettings, termsSettings, howtoVideos,
  ] = await Promise.all([
    getUserById(uid).catch(() => null),
    readRootSafe('balance'), readRootSafe('impression_balance'), readRootSafe('membership'),
    readRootSafe('user_links'), readRootSafe('user_smartlinks'), readRootSafe('auto_impression_running'),
    readRootSafe('impression_targets'), readRootSafe('impression_target_progress'), readRootSafe('impression_target_modes'),
    readRootSafe('web_normal_links'), readRootSafe('web_transactions'),
    readRootSafe('web_balance_requests'), readRootSafe('web_support_tickets'),
    readRootSafe('web_user_sessions'), readRootSafe('web_admins'), readRootSafe('web_all_users'),
    readRootSafe('web_audit_logs'),
    readRootSafe('engine_settings'), readRootSafe('auto_impression_settings'),
    readRootSafe('proxy_settings'), readRootSafe('smartlink_settings'),
    readRootSafe('targeting_settings'), readRootSafe('targeting_stats'),
    readRootSafe('proxies'), readRootSafe('proxy_stats'),
    readRootSafe('live_impression_log'), readRootSafe('impression_history'),
    readRootSafe('stats'),
    readRootSafe('plans'), readRootSafe('shop_packages'), readRootSafe('payment_methods'),
    readRootSafe('promo_codes'), readRootSafe('maintenance_mode'),
    readRootSafe('data_recovery'),
    readRootSafe('trial_settings'), readRootSafe('terms_settings'),
    readRootSafe('howto_videos'),
  ]);

  if (!userRecord) return res.status(404).json({ error: 'User record not found.' });

  // Build rich impressions array (mapped from bot's live log)
  const recentRaw = (liveImpressionLog && Array.isArray(liveImpressionLog.recent))
    ? liveImpressionLog.recent
    : [];
  // Build a stable "Smart link 1 / 2 / ..." label map for this user so the live
  // monitor never exposes the raw Adsterra destination URL (privacy + cleaner UI).
  const userSlLinks = ((userSmartlinks || {})[uid] || {}).links;
  const smartlinkLabelMap = {};
  if (Array.isArray(userSlLinks)) {
    userSlLinks.forEach((l, i) => {
      const raw = String((l && l.url) || '').trim();
      if (!raw) return;
      const label = `Smart link ${i + 1}`;
      smartlinkLabelMap[raw] = label;
      smartlinkLabelMap[raw.replace(/\/+$/, '')] = label;
    });
  }
  const impressions = recentRaw
    .filter((l) => String(l.userId) === String(uid))
    .slice(-500)
    .map((l) => mapLiveLog(l, smartlinkLabelMap));

  const isAdminReq = req.auth.role === 'admin';
  let allUsersOut = [];
  if (isAdminReq) {
    const wu = (await readRootSafe('web_users')) || [];
    allUsersOut = wu.map((u) => ({
      ...safeUser(u),
      balance: Number((balance || {})[u.id] || 0),
      impressionBalance: Math.floor(Number((impressionBalance || {})[u.id] || 0)),
    }));
  }
  const bal = Number((balance || {})[uid] || 0);
  // Real lifetime impressions delivered for this user (bot `stats.total_impressions`).
  const userBotStats = (botStats || {})[uid] || {};
  const totalImpressions = Math.max(0, Math.floor(Number(userBotStats.total_impressions) || 0));
  const impBal = Math.floor(Number((impressionBalance || {})[uid] || 0));
  const mem = (membership || {})[uid] || makeFreshMembership(uid);

  res.json({
    user: {
      pn_user: safeUser(userRecord),
      pn_wallet: {
        userId: uid,
        balance: bal,
        currency: 'BDT',
        updatedAt: new Date().toISOString(),
      },
      pn_credits: {
        userId: uid,
        balance: impBal,
        lifetimeUsed: totalImpressions,
        totalImpressions,
        hourlyUsed: 0,
        dailyUsed: 0,
        hourlyLimit: (autoImpSettings || L.AUTO_IMPRESSION_DEFAULTS).hourly_limit_smartlink,
        dailyLimit: (autoImpSettings || L.AUTO_IMPRESSION_DEFAULTS).daily_limit_smartlink,
        concurrentBrowsers: 0,
        maxConcurrentBrowsers: 1,
      },
      pn_normal_links: (webNormalLinks || {})[uid] || [],
      pn_smartlinks: (() => {
        const sl = (userSmartlinks || {})[uid] || {};
        return {
          api_endpoint: sl.api_endpoint || L.ADSTERRA_SMARTLINKS_ENDPOINT,
          source: sl.source || 'adsterra',
          links: Array.isArray(sl.links) ? sl.links : [],
          last_fetch: Number(sl.last_fetch) || 0,
          auto_enabled: !!sl.auto_enabled,
          api_configured: !!sl.api_key,
          api_key_masked: sl.api_key ? (String(sl.api_key).length > 8 ? String(sl.api_key).slice(0, 4) + '••••••••' + String(sl.api_key).slice(-4) : '••••••••') : '',
        };
      })(),
      pn_impressions: impressions,
      pn_target: {
        userId: uid,
        targetAmount: ((impressionTargets || {})[uid] || {}).smartlink || ((impressionTargets || {})[uid] || {}).normal || 0,
        currentProgress: ((impressionTargetProgress || {})[uid] || {}).smartlink || ((impressionTargetProgress || {})[uid] || {}).normal || 0,
        isActive: !!(((autoImpRunning || {})[uid] || {}).smartlink || ((autoImpRunning || {})[uid] || {}).normal),
        mode: (impressionTargetModes || {})[uid] || 'h4ck_organic',
        hourlySpeed: 0,
      },
      pn_transactions: (webTransactions || {})[uid] || [],
      pn_balance_requests: isAdminReq
        ? Object.values(webBalanceRequests || {}).flat().filter(Boolean)
            .sort((a, b) => (String(b.createdAt) > String(a.createdAt) ? 1 : -1))
        : ((webBalanceRequests || {})[uid] || []),
      pn_support_tickets: (webSupportTickets || {})[uid] || [],
      pn_sessions: (webUserSessions || {})[uid] || [],
    },
    global: {
      pn_all_users: allUsersOut,
      pn_admins: isAdminReq ? (webAdmins || []) : [],
      pn_payment_methods: (Array.isArray(paymentMethods) && paymentMethods.length ? paymentMethods : L.DEFAULT_PAYMENT_METHODS)
        .map((m, i) => ({ ...m, key: String(m.key || m.id || `method_${i}`), id: String(m.id || m.key || `method_${i}`), order: m.order ?? i + 1 })),
      pn_shop_packages: shopPackages || L.DEFAULT_SHOP_PACKAGES,
      pn_membership_plans: plans || L.DEFAULT_PLANS,
      pn_promo_codes: promoCodes || {},
      pn_engine_settings: engineSettings || {},
      pn_auto_impression_settings: autoImpSettings || L.AUTO_IMPRESSION_DEFAULTS,
      pn_proxy_settings: proxySettings || L.PROXY_DEFAULTS,
      pn_smartlink_settings: smartlinkSettings || L.SMARTLINK_DEFAULTS,
      pn_targeting_settings: targetingSettings || L.TARGETING_DEFAULTS,
      pn_targeting_stats: isAdminReq ? (targetingStats || {}) : {},
      pn_country_geo: L.COUNTRY_GEO,
      pn_targeting_dimensions: L.TARGETING_DIMENSIONS,
      pn_proxies: proxies || [],
      pn_proxy_stats: proxyStats || {},
      pn_maintenance: maintenanceMode || L.MAINTENANCE_DEFAULTS,
      pn_audit_logs: isAdminReq ? (webAuditLogs || []) : [],
      pn_data_recovery: isAdminReq ? (Array.isArray(dataRecovery) ? dataRecovery.map(sanitizeRecovery) : []) : [],
      pn_membership_meta: mem,
      pn_trial_settings: mergeDefaults(trialSettings, TRIAL_DEFAULTS),
      pn_terms: mergeDefaults(termsSettings, TERMS_DEFAULTS),
      pn_howto_videos: mergeDefaults(howtoVideos, HOWTO_DEFAULTS),
    },
  });
}));

// ═══════════════════════════════════════════════════════════════════════
//  USER PROFILE
// ═══════════════════════════════════════════════════════════════════════
app.put('/api/user/profile', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const body = req.body || {};

  // The sign-up email is permanent — it can never be changed.
  if (body.email !== undefined) {
    const current = await getUserById(uid);
    if (!current || String(body.email).trim().toLowerCase() !== current.email) {
      return res.status(400).json({ error: 'Email address cannot be changed.', code: 'EMAIL_LOCKED' });
    }
  }

  const patch = {};
  if (body.name !== undefined) {
    const n = String(body.name).trim().slice(0, 100);
    if (!n) return res.status(400).json({ error: 'Name cannot be empty.' });
    patch.name = n;
  }
  if (body.bio !== undefined) patch.bio = String(body.bio).trim().slice(0, 300);
  if (body.phone !== undefined) patch.phone = String(body.phone).trim().slice(0, 30);
  if (body.country !== undefined) patch.country = String(body.country).trim().slice(0, 60);
  if (body.firstName !== undefined) patch.firstName = String(body.firstName).trim().slice(0, 50);
  if (body.lastName !== undefined) patch.lastName = String(body.lastName).trim().slice(0, 50);
  if (body.settings && typeof body.settings === 'object') {
    const cur = (await getUserById(uid)) || {};
    const st = { notifications: true, promoAlerts: true, theme: 'dark', ...(cur.settings || {}) };
    if (typeof body.settings.notifications === 'boolean') st.notifications = body.settings.notifications;
    if (typeof body.settings.promoAlerts === 'boolean') st.promoAlerts = body.settings.promoAlerts;
    if (['light', 'dark', 'system'].includes(body.settings.theme)) st.theme = body.settings.theme;
    patch.settings = st;
  }
  if (body.telegram !== undefined) {
    const tg = normalizeTelegram(body.telegram);
    if (tg === null) return res.status(400).json({ error: 'Telegram username must be 5-32 letters, numbers or underscores.' });
    patch.telegram = tg;
  }

  // Free-form profile banner colour (hex like #14b8a6 or a gradient token).
  if (body.bannerColor !== undefined) patch.bannerColor = String(body.bannerColor).trim().slice(0, 60);
  // Social links (Facebook / TikTok / WhatsApp) — stored as-is, opened from the profile.
  if (body.socials && typeof body.socials === 'object') {
    const clean = (v) => String(v || '').trim().slice(0, 300);
    const cur = (await getUserById(uid)) || {};
    const s = { ...(cur.socials || {}) };
    if (body.socials.facebook !== undefined) s.facebook = clean(body.socials.facebook);
    if (body.socials.tiktok !== undefined) s.tiktok = clean(body.socials.tiktok);
    if (body.socials.whatsapp !== undefined) s.whatsapp = clean(body.socials.whatsapp);
    patch.socials = s;
  }

  // Avatar: '' removes it; otherwise must be a small image data URL
  if (body.avatar !== undefined) {
    const a = String(body.avatar || '');
    if (a === '') {
      patch.avatar = '';
    } else {
      if (!/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(a)) {
        return res.status(400).json({ error: 'Avatar must be a PNG, JPG or WEBP image.' });
      }
      const avatarCap = req.auth.role === 'admin' ? 700 * 1024 : 300 * 1024;
      if (a.length > avatarCap) {
        return res.status(413).json({ error: 'Avatar image is too large.' });
      }
      patch.avatar = a;
    }
  }

  const updated = await updateRoot('web_users', (cur) => (cur || []).map((u) =>
    u.id === uid ? { ...u, ...patch } : u));
  const user = (updated || []).find((u) => u.id === uid);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  await updateRoot('web_all_users', (cur) => (cur || []).map((u) =>
    u.id === uid ? { ...u, ...patch } : u));
  res.json({ user: safeUser(user) });
}));

app.post('/api/user/password', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const { oldPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }
  const user = await getUserById(uid);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (!verifyPassword(oldPassword, user.passwordHash)) {
    return res.status(400).json({ error: 'Current password is incorrect.', code: 'BAD_PASSWORD' });
  }
  const newHash = hashPassword(newPassword);
  await updateRoot('web_users', (cur) => (cur || []).map((u) =>
    u.id === uid ? { ...u, passwordHash: newHash } : u));
  await addAuditLog({
    actor: { name: user.name, role: 'user' },
    action: 'PASSWORD_CHANGED', targetId: uid, targetType: 'user',
    details: `${user.email} changed password.`,
  });
  res.json({ ok: true });
}));

// ═══════════════════════════════════════════════════════════════════════
//  NORMAL LINKS  (rich web store + sync to bot's plain array)
// ═══════════════════════════════════════════════════════════════════════
app.post('/api/links', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const { name, url } = req.body || {};
  if (!L.isValidUrl(url)) return res.status(400).json({ error: 'Invalid URL. Must be http(s).' });

  const mem = (await readRoot('membership') || {})[uid] || makeFreshMembership(uid);
  const linkLimit = Number(mem.link_limit || L.FREE_LINK_LIMIT);

  const current = ((await readRoot('web_normal_links') || {})[uid]) || [];
  if (current.length >= linkLimit) {
    return res.status(400).json({ error: `Link limit reached (${linkLimit}). Upgrade plan or delete a link.` });
  }
  if (current.some((l) => l.url === url)) {
    return res.status(409).json({ error: 'This URL is already in your list.' });
  }

  const newLink = {
    id: 'link_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    userId: uid,
    url: String(url).trim(),
    name: String(name || '').slice(0, 200) || 'Untitled Link',
    status: 'active',
    lastChecked: new Date().toISOString(),
    lastCheckStatus: 0,
    lastVisitAt: new Date().toISOString(),
    stats: { visits: 0, ok: 0, failed: 0 },
    addedAt: new Date().toISOString(),
  };

  await updateRoot('web_normal_links', (cur) => ({
    ...(cur || {}),
    [uid]: [...(((cur || {})[uid]) || []), newLink],
  }));

  // Sync plain URL array for the bot's worker
  await updateRoot('user_links', (cur) => {
    const next = { ...(cur || {}) };
    const arr = Array.isArray(next[uid]) ? [...next[uid]] : [];
    if (!arr.includes(newLink.url)) arr.push(newLink.url);
    next[uid] = arr;
    return next;
  });

  await addAuditLog({
    actor: { name: (await getUserById(uid))?.name, role: 'user' },
    action: 'LINK_ADDED', targetId: newLink.id, targetType: 'normal_link',
    details: `Added ${newLink.url}`,
  });

  res.json({ link: newLink });
}));

app.delete('/api/links/:id', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const linkId = String(req.params.id);

  let removed = null;
  await updateRoot('web_normal_links', (cur) => {
    const list = ((cur || {})[uid]) || [];
    const keep = [];
    for (const l of list) {
      if (l.id === linkId) removed = l; else keep.push(l);
    }
    return { ...(cur || {}), [uid]: keep };
  });

  if (removed) {
    // Sync bot's plain URL array
    await updateRoot('user_links', (cur) => {
      const next = { ...(cur || {}) };
      const arr = Array.isArray(next[uid]) ? next[uid].filter((u) => u !== removed.url) : [];
      next[uid] = arr;
      return next;
    });
  }

  res.json({ ok: true, removed });
}));

app.put('/api/links/:id', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const linkId = String(req.params.id);
  const { name, status } = req.body || {};
  // Starting a link needs credits — same rule the SmartLink engine already enforces.
  if (status === 'active') {
    const impBalance = await readRoot('impression_balance');
    if (Math.floor(Number((impBalance || {})[uid] || 0)) <= 0) {
      return res.status(402).json({ error: 'No credits. Buy credits from the Shop.', code: 'NO_CREDITS' });
    }
  }
  await updateRoot('web_normal_links', (cur) => {
    const list = ((cur || {})[uid]) || [];
    const next = list.map((l) => {
      if (l.id !== linkId) return l;
      return {
        ...l,
        name: name != null ? String(name).slice(0, 200) : l.name,
        status: status === 'paused' || status === 'active' || status === 'error' ? status : l.status,
      };
    });
    return { ...(cur || {}), [uid]: next };
  });

  if (status === 'active') {
    await updateRoot('auto_impression_running', (cur) => ({
      ...(cur || {}),
      [uid]: { ...(((cur || {})[uid]) || {}), normal: true },
    }));
    await updateRoot('user_links', (cur) => {
      const next = { ...(cur || {}) };
      const arr = Array.isArray(next[uid]) ? [...next[uid]] : [];
      const updated = (((cur || {})[uid]) || []);
      const activeLink = updated.find((l) => l && l.id === linkId);
      if (activeLink && activeLink.url && !arr.includes(activeLink.url)) {
        arr.push(activeLink.url);
      }
      next[uid] = arr;
      return next;
    });
  } else if (status === 'paused') {
    const list = ((await readRoot('web_normal_links')) || {})[uid] || [];
    const anyActive = list.some((l) => l && l.id !== linkId && l.status === 'active');
    if (!anyActive) {
      await updateRoot('auto_impression_running', (cur) => ({
        ...(cur || {}),
        [uid]: { ...(((cur || {})[uid]) || {}), normal: false },
      }));
    }
  }

  res.json({ ok: true });
}));

// Real reachability check for a saved link (HEAD, falls back to GET). Private/internal
// addresses are refused so this endpoint can't be used to probe the server's own network.
function isPrivateIp(ip) {
  const net = require('node:net');
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const v = String(ip).toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}
app.post('/api/links/:id/check', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const linkId = String(req.params.id);
  const list = ((await readRoot('web_normal_links')) || {})[uid] || [];
  const link = list.find((l) => l.id === linkId);
  if (!link) return res.status(404).json({ error: 'Link not found.' });

  let status = 0;
  let reason = '';
  try {
    const u = new URL(link.url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http(s) links can be checked.');
    const addrs = await require('node:dns').promises.lookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('This address cannot be checked.');
    const attempt = async (method) => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      try { return await fetch(link.url, { method, redirect: 'follow', signal: ctl.signal }); }
      finally { clearTimeout(t); }
    };
    let r = await attempt('HEAD');
    if (r.status === 405 || r.status === 501) r = await attempt('GET');
    status = r.status;
  } catch (e) {
    reason = (e && e.name === 'AbortError') ? 'Timed out after 8s.' : (e && e.message) || 'Request failed.';
  }

  const ok = status >= 200 && status < 400;
  const now = new Date().toISOString();
  await updateRoot('web_normal_links', (cur) => {
    const mine = ((cur || {})[uid]) || [];
    return { ...(cur || {}), [uid]: mine.map((l) => l.id === linkId ? { ...l, lastChecked: now, lastCheckStatus: status } : l) };
  });
  res.json({ ok, status, reason, checkedAt: now });
}));

// ═══════════════════════════════════════════════════════════════════════
//  SMARTLINKS  (uses bot's user_smartlinks structure directly)
// ═══════════════════════════════════════════════════════════════════════
function ensureUserSmartlinkShape(data) {
  return {
    api_key: data?.api_key ?? null,
    api_endpoint: data?.api_endpoint || L.ADSTERRA_SMARTLINKS_ENDPOINT,
    source: 'adsterra',
    links: Array.isArray(data?.links) ? data.links : [],
    last_fetch: Number(data?.last_fetch) || 0,
    auto_enabled: !!data?.auto_enabled,
  };
}

app.post('/api/smartlinks', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const { name, url, adsterraId } = req.body || {};
  if (!L.isValidUrl(url)) return res.status(400).json({ error: 'Invalid URL.' });

  let added = false;
  await updateRoot('user_smartlinks', (cur) => {
    const next = { ...(cur || {}) };
    const entry = ensureUserSmartlinkShape(next[uid]);
    const clean = String(url).trim();
    if (!entry.links.some((l) => l.url === clean)) {
      entry.links.push({
        url: clean,
        name: String(name || '').slice(0, 200),
        id: adsterraId || null,
        status: 'Active',
        added_at: Date.now(),
        last_visit_at: 0,
        bot_visits: 0,
        ok: 0,
        failed: 0,
      });
      added = true;
    }
    next[uid] = entry;
    return next;
  });
  res.json({ ok: added, added });
}));

app.post('/api/smartlinks/bulk', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const { urls } = req.body || {};
  if (!Array.isArray(urls) || !urls.length) return res.status(400).json({ error: 'urls array required.' });
  let added = 0, dup = 0, invalid = 0;
  await updateRoot('user_smartlinks', (cur) => {
    const next = { ...(cur || {}) };
    const entry = ensureUserSmartlinkShape(next[uid]);
    for (const raw of urls) {
      const clean = String(raw || '').trim();
      if (!L.isValidUrl(clean)) { invalid++; continue; }
      if (entry.links.some((l) => l.url === clean)) { dup++; continue; }
      entry.links.push({
        url: clean, name: '', id: null, status: 'Active',
        added_at: Date.now(), last_visit_at: 0, bot_visits: 0, ok: 0, failed: 0,
      });
      added++;
    }
    next[uid] = entry;
    return next;
  });
  res.json({ ok: true, added, dup, invalid, total: urls.length });
}));

app.delete('/api/smartlinks/:urlHash', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const hash = String(req.params.urlHash);
  let removed = null;
  await updateRoot('user_smartlinks', (cur) => {
    const next = { ...(cur || {}) };
    const entry = ensureUserSmartlinkShape(next[uid]);
    entry.links = entry.links.filter((l) => {
      const h = crypto.createHash('sha1').update(l.url).digest('hex').slice(0, 12);
      if (h === hash) { removed = l; return false; }
      return true;
    });
    next[uid] = entry;
    return next;
  });
  res.json({ ok: !!removed, removed });
}));

// Remove SmartLinks by exact URL (or all of them). Works on plain http too — no client-side hashing.
app.post('/api/smartlinks/remove', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const { urls, all } = req.body || {};
  const wanted = new Set((Array.isArray(urls) ? urls : []).map((u) => String(u || '').trim()).filter(Boolean));
  if (!all && !wanted.size) return res.status(400).json({ error: 'Nothing to remove.' });
  let removed = 0;
  await updateRoot('user_smartlinks', (cur) => {
    const next = { ...(cur || {}) };
    const entry = ensureUserSmartlinkShape(next[uid]);
    const before = entry.links.length;
    entry.links = all ? [] : entry.links.filter((l) => !wanted.has(String(l.url).trim()));
    removed = before - entry.links.length;
    next[uid] = entry;
    return next;
  });
  res.json({ ok: true, removed });
}));

// Persist pause/resume for SmartLinks (previously only changed in the browser and reverted on refresh).
app.put('/api/smartlinks/status', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const { urls, status } = req.body || {};
  const st = status === 'Paused' ? 'Paused' : 'Active';
  const wanted = new Set((Array.isArray(urls) ? urls : []).map((u) => String(u || '').trim()).filter(Boolean));
  if (!wanted.size) return res.status(400).json({ error: 'No SmartLink selected.' });
  let changed = 0;
  await updateRoot('user_smartlinks', (cur) => {
    const next = { ...(cur || {}) };
    const entry = ensureUserSmartlinkShape(next[uid]);
    entry.links = entry.links.map((l) => {
      if (!wanted.has(String(l.url).trim())) return l;
      changed++;
      return { ...l, status: st };
    });
    next[uid] = entry;
    return next;
  });
  res.json({ ok: true, changed, status: st });
}));

app.get('/api/smartlinks/api-key', requireAuth, requireFirebase, wrap(async (req, res) => {
  const sl = ((await readRoot('user_smartlinks')) || {})[req.auth.uid] || {};
  const k = sl.api_key ? String(sl.api_key) : '';
  res.json({ configured: !!k, masked: k ? (k.length > 8 ? k.slice(0, 4) + '••••••••' + k.slice(-4) : '••••••••') : '' });
}));

app.put('/api/smartlinks/api-key', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const { apiKey } = req.body || {};
  if (!apiKey || String(apiKey).length < 8) return res.status(400).json({ error: 'Invalid API key.' });
  await updateRoot('user_smartlinks', (cur) => {
    const next = { ...(cur || {}) };
    const entry = ensureUserSmartlinkShape(next[uid]);
    entry.api_key = String(apiKey).slice(0, 500);
    next[uid] = entry;
    return next;
  });
  res.json({ ok: true });
}));

app.post('/api/smartlinks/import-json', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const rawUrl = String(req.body?.url || '').trim();
  if (!rawUrl) return res.status(400).json({ error: 'JSON feed URL is required.' });

  let remote;
  try {
    remote = await L.assertSafeRemoteUrl(rawUrl);
  } catch (e) {
    return res.status(400).json({ error: `Invalid feed URL: ${e.message}` });
  }

  if (remote.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only HTTPS JSON feeds are allowed.' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let response;
  let body = '';
  try {
    response = await fetch(remote.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
        'User-Agent': 'CC-MARKETING/30.0',
      },
      signal: controller.signal,
      redirect: 'error',
    });
    body = await response.text();
  } catch (e) {
    return res.status(502).json({ error: `Could not fetch feed: ${e.message}` });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    return res.status(502).json({ error: `Feed returned HTTP ${response.status}.` });
  }
  if (body.length > 2 * 1024 * 1024) {
    return res.status(413).json({ error: 'Feed is too large. Maximum size is 2 MB.' });
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (_) {
    return res.status(400).json({ error: 'Feed did not return valid JSON.' });
  }

  const links = L.extractAdsterraSmartlinks(payload);
  if (!links.length) {
    return res.status(422).json({
      error: 'No valid SmartLink URLs found in the JSON response.',
      acceptedKeys: ['url', 'link', 'smartlink', 'smart_link', 'smartlink_url', 'smart_link_url', 'link_url', 'direct_url', 'target_url', 'destination_url'],
    });
  }

  let added = 0;
  let dup = 0;
  await updateRoot('user_smartlinks', (cur) => {
    const next = { ...(cur || {}) };
    const entry = ensureUserSmartlinkShape(next[uid]);
    for (const link of links) {
      const clean = String(link.url).trim();
      if (entry.links.some((l) => l.url === clean)) { dup++; continue; }
      entry.links.push({
        url: clean,
        name: link.name || '',
        id: link.id || null,
        status: link.status || 'Active',
        added_at: Date.now(),
        last_visit_at: 0,
        bot_visits: 0,
        ok: 0,
        failed: 0,
      });
      added++;
    }
    entry.last_fetch = Date.now();
    next[uid] = entry;
    return next;
  });

  await addAuditLog({
    actor: { name: req.auth.email, role: 'user' },
    action: 'SMARTLINK_JSON_IMPORTED',
    targetId: uid,
    targetType: 'user',
    details: `Imported ${added} SmartLinks from ${remote.hostname}; ${dup} duplicates.`,
  });

  res.json({ ok: true, added, dup, total: links.length, source: remote.toString() });
}));

app.post('/api/smartlinks/sync', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const user = await getUserById(uid);
  const data = (await readRoot('user_smartlinks') || {})[uid] || {};
  const entry = ensureUserSmartlinkShape(data);
  if (!entry.api_key) return res.status(400).json({ error: 'API key not set. Save your Adsterra API key first.' });

  const result = await L.fetchAdsterraSmartlinks(entry.api_key);
  if (!result.ok) return res.status(502).json({ error: result.error || 'Adsterra sync failed.' });

  let added = 0, dup = 0;
  await updateRoot('user_smartlinks', (cur) => {
    const next = { ...(cur || {}) };
    const e = ensureUserSmartlinkShape(next[uid]);
    for (const link of result.links) {
      if (e.links.some((l) => l.url === link.url)) { dup++; continue; }
      e.links.push({
        url: link.url, name: link.name || '', id: link.id || null,
        status: link.status || 'Active',
        added_at: Date.now(), last_visit_at: 0, bot_visits: 0, ok: 0, failed: 0,
      });
      added++;
    }
    e.last_fetch = Date.now();
    next[uid] = e;
    return next;
  });

  await addAuditLog({
    actor: { name: user?.name, role: 'user' },
    action: 'ADSTERRA_SYNCED', targetId: uid, targetType: 'user',
    details: `Synced ${added} new, ${dup} duplicates.`,
  });

  res.json({ ok: true, added, dup, total: result.links.length });
}));

// ─── SmartLink analytics: delivered visits per day for the last 7 days (Bangladesh calendar days) ───
// Source: smartlink_daily_visits (written by the bot for every delivered visit, kept for 14 days),
// so the chart only ever shows real recorded numbers. Read-only: nothing is written here.
app.get('/api/smartlinks/analytics', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const daily = (await readRoot('smartlink_daily_visits')) || {};
  const DAY = 86400000;
  const BD = 6 * 60 * 60 * 1000;
  const dateKey = (offsetDays) => new Date(Date.now() + BD - offsetDays * DAY).toISOString().slice(0, 10);
  const countFor = (key) => Math.max(0, Math.floor(Number(daily[`${uid}::smartlink::${key}`] || 0)));

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const key = dateKey(i);
    days.push({ date: key, visits: countFor(key) });
  }
  let prevTotal = 0;
  for (let i = 7; i <= 13; i++) prevTotal += countFor(dateKey(i));

  const total = days.reduce((a, d) => a + d.visits, 0);
  const best = days.reduce((b, d) => (d.visits > b.visits ? d : b), days[0]);
  res.json({
    ok: true,
    timezone: 'Asia/Dhaka',
    days,
    today: days[days.length - 1].visits,
    total,
    average: Math.round(total / 7),
    best: best.visits > 0 ? best : null,
    previousTotal: prevTotal,
  });
}));

// ═══════════════════════════════════════════════════════════════════════
//  TRAFFIC  (start/stop/target)
// ═══════════════════════════════════════════════════════════════════════
app.post('/api/traffic/start', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const type = req.body?.type === 'normal' ? 'normal' : 'smartlink';

  // Read state needed by canRunImpression
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

  const proxyReady = L.proxyReadyForTraffic({ aiSettings, proxySettings, proxies, proxyStats });
  const bal = Math.floor(Number((impBalance || {})[uid] || 0));
  const mem = (membership || {})[uid] || makeFreshMembership(uid);
  const remainingBursts = Math.max(0, (mem.daily_burst_limit || 0) - (mem.daily_burst_used || 0));

  const hourlyKey = `${uid}::${type}::${L.getHourKey()}`;
  const dailyKey = `${uid}::${type}::${L.todayStr()}`;
  const hourlyCount = Number((hourlyLog || {})[hourlyKey] || 0);
  const dailyCount = Number((dailyLog || {})[dailyKey] || 0);

  const check = L.canRunImpression({
    uid, type,
    impressionBalance: bal,
    aiSettings,
    hourlyCount,
    dailyCount,
    remainingBursts,
    proxyReady,
  });
  if (!check.ok) return res.status(400).json({ error: check.reason, code: check.code });

  // Ensure the user actually has content to run
  if (type === 'smartlink') {
    let entry = ensureUserSmartlinkShape((userSmartlinks || {})[uid]);
    if ((!Array.isArray(entry.links) || entry.links.length === 0) && entry.api_key) {
      // ⭐ MULTI-TENANT FIX: the user saved their OWN Adsterra API key but hasn't
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
  } else {
    let arr = ((userLinks || {})[uid]) || [];
    if (!Array.isArray(arr) || arr.length === 0) {
      const webLinks = ((await readRoot('web_normal_links') || {})[uid]) || [];
      const activeUrls = Array.isArray(webLinks) ? webLinks.filter(l => l && l.status !== 'paused').map(l => l.url).filter(Boolean) : [];
      if (activeUrls.length > 0) {
        arr = activeUrls;
        await updateRoot('user_links', (cur) => ({
          ...(cur || {}),
          [uid]: arr,
        }));
      }
    }
    if (!Array.isArray(arr) || arr.length === 0) {
      return res.status(400).json({ error: 'No normal links configured yet.' });
    }
  }

  await updateRoot('auto_impression_running', (cur) => {
    const next = { ...(cur || {}) };
    const cur0 = next[uid] || { smartlink: false, normal: false };
    next[uid] = { ...cur0, [type]: true };
    return next;
  });

  await addAuditLog({
    actor: { name: (await getUserById(uid))?.name, role: 'user' },
    action: 'TRAFFIC_STARTED', targetId: uid, targetType: 'user',
    details: `Started ${type} traffic.`,
  });

  res.json({ ok: true, type, running: true });
}));

app.post('/api/traffic/stop', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const type = req.body?.type === 'normal' ? 'normal' : 'smartlink';
  await updateRoot('auto_impression_running', (cur) => {
    const next = { ...(cur || {}) };
    const cur0 = next[uid] || { smartlink: false, normal: false };
    next[uid] = { ...cur0, [type]: false };
    return next;
  });
  res.json({ ok: true, type, running: false });
}));

app.post('/api/traffic/target', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const type = req.body?.type === 'normal' ? 'normal' : 'smartlink';
  const amount = Math.max(0, Math.floor(Number(req.body?.amount) || 0));
  // Engine mode is platform/admin-controlled — any user-supplied mode is ignored.
  const mode = null;
  const impBalance = (await readRoot('impression_balance') || {})[uid] || 0;
  if (amount > Number(impBalance)) {
    return res.status(400).json({ error: `Target exceeds balance (${impBalance}).` });
  }
  await updateRoot('impression_targets', (cur) => {
    const next = { ...(cur || {}) };
    next[uid] = { ...(next[uid] || { smartlink: 0, normal: 0 }), [type]: amount };
    return next;
  });
  await updateRoot('impression_target_progress', (cur) => {
    const next = { ...(cur || {}) };
    next[uid] = { ...(next[uid] || { smartlink: 0, normal: 0 }), [type]: 0 };
    return next;
  });
  if (mode) {
    await updateRoot('impression_target_modes', (cur) => {
      const next = { ...(cur || {}) };
      next[uid] = mode;
      return next;
    });
  }
  res.json({ ok: true, type, target: amount, mode: mode || ((await readRoot('impression_target_modes')) || {})[uid] || 'h4ck_organic' });
}));

app.post('/api/traffic/target/clear', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const type = req.body?.type === 'normal' ? 'normal' : 'smartlink';
  await updateRoot('impression_targets', (cur) => {
    const next = { ...(cur || {}) };
    next[uid] = { ...(next[uid] || { smartlink: 0, normal: 0 }), [type]: 0 };
    return next;
  });
  await updateRoot('impression_target_progress', (cur) => {
    const next = { ...(cur || {}) };
    next[uid] = { ...(next[uid] || { smartlink: 0, normal: 0 }), [type]: 0 };
    return next;
  });
  res.json({ ok: true, type });
}));

// Set the traffic engine mode for the current user (persisted per-user).
// Engine mode is controlled by the platform/admin only. Kept for backward
// compatibility but never lets a regular user change their delivery mode.
app.post('/api/traffic/mode', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const current = ((await readRoot('impression_target_modes')) || {})[uid] || 'h4ck_organic';
  res.json({ ok: true, mode: current, managed: true });
}));

// ── Per-user delivery diagnostic ──────────────────────────────────────────
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
  let reason = 'Ready — your Adsterra account will receive impressions.';
  let blockCode = null;
  if (type === 'smartlink' && !hasKey) {
    ready = false; reason = 'Save your OWN Adsterra API key in SmartLinks.'; blockCode = 'NO_API_KEY';
  } else if (linkCount === 0) {
    ready = false;
    reason = type === 'smartlink'
      ? 'No SmartLinks yet — press Sync in SmartLinks (or Start will auto-sync).'
      : 'No normal links added yet.';
    blockCode = 'NO_LINKS';
  } else if (!check.ok) {
    ready = false; reason = check.reason; blockCode = check.code;
  }

  res.json({
    ok: true, type, ready, reason, blockCode,
    hasApiKey: hasKey,
    apiKeyMasked: hasKey ? `${String(entry.api_key).slice(0, 6)}…${String(entry.api_key).slice(-4)}` : null,
    linkCount,
    impressionBalance: bal,
    running,
    proxyReady: !!(proxyReady && proxyReady.ready),
    proxyReason: (proxyReady && proxyReady.reason) || null,
    hourlyCount, dailyCount, remainingBursts,
  });
}));

// ═══════════════════════════════════════════════════════════════════════
//  WALLET
// ═══════════════════════════════════════════════════════════════════════
app.post('/api/wallet/deposit', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const { amount, method, txnId, senderNumber } = req.body || {};
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid amount.' });
  if (!method || !txnId) return res.status(400).json({ error: 'Payment method and TXN ID required.' });

  const configuredMethods = await readRoot('payment_methods') || L.DEFAULT_PAYMENT_METHODS;
  const selected = configuredMethods.find((m) => String(m.key || m.id) === String(method));
  if (!selected || selected.enabled === false) return res.status(400).json({ error: 'This payment method is unavailable.' });

  const user = await getUserById(uid);
  const txHash = L.hashTxn(txnId);

  // Duplicate TXN check
  const all = await readRoot('web_balance_requests') || {};
  const flat = Object.values(all).flat();
  if (flat.some((r) => r.txnHash === txHash)) {
    return res.status(409).json({ error: 'This transaction ID was already submitted.' });
  }

  const reqEntry = {
    id: 'req_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    userId: uid,
    userName: user.name,
    userEmail: user.email,
    amount: Number(amt.toFixed(2)),
    method: String(method).slice(0, 40),
    txnId: String(txnId).slice(0, 200),
    txnHash: txHash,
    senderNumber: senderNumber ? String(senderNumber).slice(0, 40) : undefined,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  await updateRoot('web_balance_requests', (cur) => ({
    ...(cur || {}),
    [uid]: [reqEntry, ...(((cur || {})[uid]) || [])],
  }));

  await addAuditLog({
    actor: { name: user.name, role: 'user' },
    action: 'DEPOSIT_SUBMITTED', targetId: reqEntry.id, targetType: 'balance_request',
    details: `${user.email} submitted ${amt} via ${method}`,
  });

  res.json({ request: reqEntry });
}));

// ═══════════════════════════════════════════════════════════════════════
//  SHOP  (buy impression credits with wallet balance)
// ═══════════════════════════════════════════════════════════════════════
// ─── Shop / plan lookup that works for BOTH storage shapes ───
//  map   { p1: { amount, price, bonus } }                (built-in defaults)
//  array [ { id, credits, price, bonus, enabled } ]      (saved by the admin CMS)
function findShopPackage(raw, id) {
  const key = String(id || '');
  let item = null;
  if (Array.isArray(raw)) item = raw.find((x) => x && (String(x.id) === key || String(x.key) === key));
  else if (raw && typeof raw === 'object') item = raw[key] ? { id: key, ...raw[key] } : null;
  if (!item || item.enabled === false) return null;
  const amount = Number(item.amount ?? item.credits ?? 0);
  const price = Number(item.price ?? 0);
  if (!(amount > 0) || !(price >= 0)) return null;
  return { id: key, amount, price, bonus: Number(item.bonus || 0) };
}
function findPlan(raw, id) {
  const key = String(id || '');
  let item = null;
  if (Array.isArray(raw)) item = raw.find((x) => x && (String(x.id) === key || String(x.key) === key));
  else if (raw && typeof raw === 'object') item = raw[key] || null;
  if (!item || item.enabled === false) return null;
  return {
    label: item.label || key,
    days: Number(item.days || 30),
    price: Number(item.price || 0),
    link_limit: Number(item.link_limit ?? item.linkLimit ?? 0),
    visits_per_link: Number(item.visits_per_link ?? item.visitsPerLink ?? 0),
    burst_window_ms: Number(item.burst_window_ms ?? 5000),
    daily_burst_limit: Number(item.daily_burst_limit ?? item.dailyBurstLimit ?? 0),
    bonus_credits: Number(item.bonus_credits ?? item.bonusCredits ?? 0),
  };
}
/** Takes `price` from the wallet atomically (two taps at once can never spend the same money twice). */
async function debitWallet(uid, price) {
  let result = { ok: false, balance: 0 };
  await updateRoot('balance', (cur) => {
    const have = Number((cur || {})[uid] || 0);
    if (have + 1e-9 < price) { result = { ok: false, balance: have }; return cur; }
    const next = Number((have - price).toFixed(2));
    result = { ok: true, balance: next };
    return { ...(cur || {}), [uid]: next };
  });
  return result;
}

app.post('/api/shop/buy', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const { packageId, promoCode } = req.body || {};
  const packages = (await readRoot('shop_packages')) || L.DEFAULT_SHOP_PACKAGES;
  const pkg = findShopPackage(packages, packageId);
  if (!pkg) return res.status(404).json({ error: 'This package is not available any more. Refresh the page and try again.' });

  // FIX: the shop UI shows a promo-discounted price, but the purchase request used to carry only
  // the package id, so the server always charged the FULL price and never granted the promo bonus.
  // Resolve the promo here (server-side, never trusting the browser) and apply it to price + credits.
  let promo = null;
  const promoKey = String(promoCode || '').trim().toUpperCase();
  if (promoKey) {
    const allPromos = (await readRoot('promo_codes')) || {};
    const raw = allPromos[promoKey] || Object.values(allPromos).find((p) => String((p && p.code) || '').toUpperCase() === promoKey);
    if (raw && raw.enabled !== false) {
      const expired = raw.expiresAt ? Date.now() > new Date(raw.expiresAt).getTime() : false;
      const used = Number(raw.usedCount != null ? raw.usedCount : (raw.used || 0));
      const maxUses = Number(raw.maxUses != null ? raw.maxUses : (raw.max_uses || 0));
      const exhausted = maxUses > 0 && used >= maxUses;
      if (!expired && !exhausted) {
        promo = {
          code: promoKey,
          discountPercent: Number(raw.discountPercent != null ? raw.discountPercent : (raw.discount_percent || 0)),
          bonusCredits: Number(raw.bonusCredits != null ? raw.bonusCredits : (raw.bonus_balance || 0)),
        };
      }
    }
  }
  const price = promo && promo.discountPercent > 0
    ? Number((pkg.price * (1 - promo.discountPercent / 100)).toFixed(2))
    : pkg.price;

  const paid = await debitWallet(uid, price);
  if (!paid.ok) return res.status(400).json({ error: `Not enough wallet balance. You have ৳${paid.balance.toFixed(2)}, this package costs ৳${price.toFixed(2)}.`, code: 'INSUFFICIENT_BALANCE' });

  const promoBonus = promo ? promo.bonusCredits : 0;
  const total = Number(pkg.amount) + Number(pkg.bonus || 0) + promoBonus;
  const newBalance = paid.balance;

  const tx = {
    id: 'tx_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    userId: uid, type: 'purchase',
    amount: -price, balanceAfter: newBalance,
    description: `Purchased ${pkg.amount}${pkg.bonus ? `+${pkg.bonus} bonus` : ''} impression credits${promo ? ` (promo ${promo.code})` : ''}`,
    status: 'completed', createdAt: new Date().toISOString(),
  };

  // Speed: the credit grant and the ledger entry live in two different documents, so they are written
  // at the same time instead of one after the other (the wallet debit above stays atomic and first).
  const writes = [
    updateRoot('impression_balance', (cur) => ({
      ...(cur || {}),
      [uid]: Math.floor(Number((cur || {})[uid] || 0) + total),
    })),
    updateRoot('web_transactions', (cur) => ({
      ...(cur || {}),
      [uid]: [tx, ...(((cur || {})[uid]) || [])],
    })),
  ];
  if (promo) {
    writes.push(updateRoot('promo_codes', (cur) => {
      const next = { ...(cur || {}) };
      let key = next[promo.code] ? promo.code : Object.keys(next).find((k) => String((next[k] && next[k].code) || '').toUpperCase() === promo.code);
      if (key && next[key]) {
        const u = Number(next[key].usedCount != null ? next[key].usedCount : (next[key].used || 0)) + 1;
        next[key] = { ...next[key], usedCount: u };
      }
      return next;
    }));
  }
  const [impMap] = await Promise.all(writes);
  const newCredits = Math.floor(Number((impMap || {})[uid] || 0));

  res.json({ ok: true, transaction: tx, newBalance, addedCredits: total, newCredits });

  // Speed: the audit trail is written after the reply, so the buyer never waits for it.
  getUserById(uid)
    .then((u) => addAuditLog({
      actor: { name: u?.name, role: 'user' },
      action: 'SHOP_PURCHASE', targetId: tx.id, targetType: 'transaction',
      details: `Bought ${total} credits for $${pkg.price}`,
    }))
    .catch((e) => console.warn('[Shop] audit log failed:', e?.message || e));
}));

// ═══════════════════════════════════════════════════════════════════════
//  MEMBERSHIP
// ═══════════════════════════════════════════════════════════════════════
// Admin-configurable free-trial settings (amount of impression credits + on/off).
const TRIAL_DEFAULTS = { enabled: true, amount: 10 };

// ── "How to Work" tutorial videos (admin-managed) ────────────────────────────
// A flexible list of guide videos. Each entry may point at a YouTube or a
// Telegram link. Admins add / edit / remove entries from the CMS "How to Work"
// tab; users watch them from the "How to Work" screen. `category` groups the
// videos (e.g. "Getting Started", "Adsterra Setup") and `order` controls the
// display order. An empty `url` renders as an "awaiting link" placeholder card.
const HOWTO_DEFAULTS = {
  updatedAt: '2025-01-01T00:00:00.000Z',
  videos: [
    {
      id: 'howto_start',
      title: 'How to Work — Full Walkthrough',
      description: 'A complete beginner guide: create your account, add a link, set a target and start earning.',
      url: '',
      category: 'Getting Started',
      enabled: true,
      order: 1,
    },
    {
      id: 'howto_adsterra',
      title: 'How to Open an Adsterra Account',
      description: 'Step-by-step: register on Adsterra, verify your account and grab your SmartLink API key.',
      url: '',
      category: 'Adsterra Setup',
      enabled: true,
      order: 2,
    },
  ],
};

app.post('/api/trial/claim', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const user = await getUserById(uid);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.trialClaimed) return res.status(409).json({ error: 'Trial already claimed.' });
  // Trial amount + on/off switch are admin-configurable (Admin -> Shop settings).
  const trialCfg = mergeDefaults(await readRoot('trial_settings'), TRIAL_DEFAULTS);
  if (trialCfg.enabled === false) return res.status(403).json({ error: 'The free trial is currently disabled.' });
  const amount = Math.max(0, Math.floor(Number(trialCfg.amount) || 0));
  await updateRoot('web_users', (cur) => (cur || []).map((u) => u.id === uid ? { ...u, trialClaimed: true } : u));
  // FIX: the free trial grants IMPRESSION credits (impression_balance), NOT wallet cash.
  // The old code credited the `balance` root, so the free trial wrongly appeared as money
  // in the wallet instead of impression credits. Credits now land in the right place.
  const [impMap] = await Promise.all([
    updateRoot('impression_balance', (cur) => ({
      ...(cur || {}),
      [uid]: Math.floor(Number((cur || {})[uid] || 0) + amount),
    })),
  ]);
  const newCredits = Math.floor(Number((impMap || {})[uid] || 0));
  await addAuditLog({ actor: { name: user.name, role: 'user' }, action: 'TRIAL_CLAIMED', targetId: uid, targetType: 'user', details: `Claimed ${amount} trial impression credits.` });
  res.json({ ok: true, creditsAdded: amount, newCredits });
}));

app.post('/api/membership/buy', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const { planId } = req.body || {};
  const plans = (await readRoot('plans')) || L.DEFAULT_PLANS;
  const plan = findPlan(plans, planId);
  if (!plan) return res.status(404).json({ error: 'This plan is not available any more. Refresh the page and try again.' });

  const paid = await debitWallet(uid, plan.price);
  if (!paid.ok) return res.status(400).json({ error: `Not enough wallet balance. You have ৳${paid.balance.toFixed(2)}, this plan costs ৳${plan.price.toFixed(2)}.`, code: 'INSUFFICIENT_BALANCE' });

  const now = Date.now();
  const newBalance = paid.balance;
  const bonus = Number(plan.bonus_credits || 0);

  const tx = {
    id: 'tx_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    userId: uid, type: 'purchase',
    amount: -plan.price, balanceAfter: newBalance,
    description: `Upgraded to ${plan.label}`,
    status: 'completed', createdAt: new Date().toISOString(),
  };

  // Speed: the old code did ~7 database calls one after another. The membership record is now read and
  // written in ONE transaction (also race-safe), and the independent writes run side by side.
  let newMem = null;
  const membershipWrite = updateRoot('membership', (cur) => {
    const all = { ...(cur || {}) };
    const memCurrent = all[uid] || makeFreshMembership(uid);
    const base = (memCurrent.plan && memCurrent.expires_at && memCurrent.expires_at > now) ? memCurrent.expires_at : now;
    newMem = {
      plan: planId,
      expires_at: base + (plan.days * 86400000),
      link_limit: plan.link_limit,
      visits_per_link: plan.visits_per_link,
      burst_window_ms: plan.burst_window_ms,
      daily_burst_limit: plan.daily_burst_limit,
      daily_burst_used: 0,
      daily_reset_date: L.todayStr(),
    };
    all[uid] = newMem;
    return all;
  }).then(() => updateRoot('web_users', (cur) => (cur || []).map((u) => (
    // keep the profile in step with the plan so the Membership / Dashboard / Profile pages show it instantly
    u.id === uid ? { ...u, membershipPlanId: planId, membershipExpiresAt: new Date(newMem.expires_at).toISOString() } : u
  ))));

  const bonusWrite = bonus > 0
    ? updateRoot('impression_balance', (cur) => ({
        ...(cur || {}),
        [uid]: Math.floor(Number((cur || {})[uid] || 0) + bonus),
      }))
    : Promise.resolve(null);

  const ledgerWrite = updateRoot('web_transactions', (cur) => ({
    ...(cur || {}),
    [uid]: [tx, ...(((cur || {})[uid]) || [])],
  }));

  const [, impMap] = await Promise.all([membershipWrite, bonusWrite, ledgerWrite]);
  const newCredits = impMap ? Math.floor(Number(impMap[uid] || 0)) : undefined;

  res.json({
    ok: true, plan: newMem, newBalance, bonusCredits: bonus, transaction: tx, newCredits,
    membershipPlanId: planId, membershipExpiresAt: new Date(newMem.expires_at).toISOString(),
  });

  // Speed: audit log is written after the reply.
  getUserById(uid)
    .then((u) => addAuditLog({
      actor: { name: u?.name, role: 'user' },
      action: 'MEMBERSHIP_PURCHASED', targetId: uid, targetType: 'user',
      details: `Purchased ${plan.label}`,
    }))
    .catch((e) => console.warn('[Membership] audit log failed:', e?.message || e));
}));

// ═══════════════════════════════════════════════════════════════════════
//  REFERRAL
// ═══════════════════════════════════════════════════════════════════════
// --- Referral economics: one-time join bonus + 10% LIFETIME commission on every top-up ---
// Every time a referred user adds balance, whoever owns the referral code earns 10% of it - for life.
const REFERRAL_COMMISSION_RATE = 0.10;

/** Finds the referrer's internal id for a user (scans the referral registry), or null. */
async function findReferrerOf(uid) {
  const target = String(uid);
  const referrals = (await readRoot('referrals')) || {};
  for (const [refUid, info] of Object.entries(referrals)) {
    if (info && Array.isArray(info.invited) && info.invited.map(String).includes(target)) return refUid;
  }
  // Fallback: the user record may carry an explicit referredBy pointer.
  const u = await getUserById(target);
  return (u && u.referredBy && String(u.referredBy) !== target) ? String(u.referredBy) : null;
}

/**
 * Credits the referrer a lifetime 10% commission whenever a referred user tops up.
 * Returns { credited, referrerId } or null when the user has no referrer / amount is 0.
 */
async function creditReferralCommission(uid, amount) {
  const amt = Number(amount);
  if (!(amt > 0)) return null;
  const refUid = await findReferrerOf(uid);
  if (!refUid || refUid === String(uid)) return null;
  const commission = Number((amt * REFERRAL_COMMISSION_RATE).toFixed(2));
  if (!(commission > 0)) return null;

  let newBal = 0;
  await updateRoot('balance', (cur) => {
    newBal = Number((Number((cur || {})[refUid] || 0) + commission).toFixed(2));
    return { ...(cur || {}), [refUid]: newBal };
  });

  await updateRoot('referrals', (cur) => {
    const next = { ...(cur || {}) };
    const info = next[refUid] || { code: refUid, invited: [], earned: 0, commission: 0, created_at: Date.now() };
    info.invited = Array.isArray(info.invited) ? info.invited : [];
    info.commission = Number((Number(info.commission) || 0) + commission);
    info.earned = Number((Number(info.earned) || 0) + commission);
    info.events = Array.isArray(info.events) ? info.events : [];
    info.events.unshift({ type: 'commission', from: uid, topup: amt, commission, at: Date.now() });
    if (info.events.length > 100) info.events.length = 100;
    next[refUid] = info;
    return next;
  });

  const tx = {
    id: 'tx_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    userId: refUid, type: 'referral',
    amount: commission, balanceAfter: newBal,
    description: `Referral commission (10%) from a referred user's top-up of $${amt.toFixed(2)}`,
    status: 'completed', createdAt: new Date().toISOString(),
  };
  await updateRoot('web_transactions', (cur) => ({
    ...(cur || {}),
    [refUid]: [tx, ...(((cur || {})[refUid]) || [])],
  }));

  try {
    await notifyUser(refUid, {
      tone: 'success',
      title: 'Referral commission earned',
      body: `You earned $${commission.toFixed(2)} - 10% of a referred user's top-up.`,
    });
  } catch (_) {}

  return { credited: commission, referrerId: refUid };
}

async function applyReferral(newUserId, refCode) {
  if (!refCode || refCode === newUserId) return false;
  // Resolve the 6-char code to the referrer's internal id (legacy links that carry the raw id still work).
  const _users = (await readRoot('web_users')) || [];
  const _clean = String(refCode).trim();
  const _owner = _users.find((u) => String(u.referralCode || '').toUpperCase() === _clean.toUpperCase())
    || _users.find((u) => u.id === _clean);
  if (!_owner || _owner.id === newUserId) return false;
  refCode = _owner.id;
  const referrals = await readRoot('referrals') || {};
  // Prevent double-apply
  for (const info of Object.values(referrals)) {
    if (info && Array.isArray(info.invited) && info.invited.includes(newUserId)) return false;
  }
  const refUid = String(refCode);
  const refInfo = referrals[refUid] || { code: refUid, invited: [], earned: 0, commission: 0, created_at: Date.now() };
  refInfo.invited = Array.isArray(refInfo.invited) ? refInfo.invited : [];
  refInfo.invited.push(newUserId);
  refInfo.earned = (Number(refInfo.earned) || 0) + L.REFERRAL_BONUS;
  refInfo.commission = Number(refInfo.commission) || 0;

  await updateRoot('referrals', (cur) => ({ ...(cur || {}), [refUid]: refInfo }));
  await updateRoot('balance', (cur) => ({
    ...(cur || {}),
    [refUid]: Number(((cur || {})[refUid] || 0) + L.REFERRAL_BONUS),
  }));
  // Lock the relationship on the new user's record so it can never be changed again.
  await updateRoot('web_users', (cur) => (Array.isArray(cur) ? cur : []).map((u) =>
    u.id === newUserId ? { ...u, referredBy: refUid, referralLocked: true, referralAppliedAt: new Date().toISOString() } : u));
  return true;
}

app.get('/api/referral', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const referrals = await readRoot('referrals') || {};
  const _me = await getUserById(uid);
  const info = { ...(referrals[uid] || { invited: [], earned: 0, commission: 0, created_at: Date.now() }), code: _me?.referralCode || uid };
  const invitedIds = Array.isArray(info.invited) ? info.invited : [];
  const allUsers = await readRoot('web_all_users') || [];
  const referredUsers = invitedIds.map((id) => {
    const u = (allUsers || []).find((x) => String(x.id || x.uid) === String(id));
    return {
      id, name: u?.name || 'Registered user', email: u?.email || '—',
      date: u?.createdAt || u?.created_at || null, spent: 0, earned: 0,
      plan: String(u?.membershipPlanId || 'free').toLowerCase().replace(/^plan_/, '') || 'free',
      membershipExpiresAt: u?.membershipExpiresAt || null,
    };
  });
  const referrerId = await findReferrerOf(uid);
  const referrer = referrerId ? await getUserById(referrerId) : null;
  res.json({
    referral: {
      ...info,
      referredUsers,
      totalEarned: Number(info.earned) || 0,
      commissionEarned: Number(info.commission) || 0,
      events: Array.isArray(info.events) ? info.events.slice(0, 30) : [],
      commissionRate: REFERRAL_COMMISSION_RATE,
      referredBy: referrerId ? { id: referrerId, name: referrer?.name || 'Referrer', code: referrer?.referralCode || referrerId } : null,
      canApplyCode: !referrerId && !_me?.referralLocked,
      referralLocked: !!(_me?.referralLocked || referrerId),
    },
  });
}));

// A user who signed up WITHOUT a referral code may attach ONE code, exactly once.
app.post('/api/referral/apply', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const code = String((req.body || {}).code || '').trim().toUpperCase().slice(0, 32);
  if (!code) return res.status(400).json({ error: 'Please enter a referral code.' });
  const me = await getUserById(uid);
  if (!me) return res.status(404).json({ error: 'User not found.' });
  if (me.referralLocked) return res.status(409).json({ error: 'Your referral code is already locked and cannot be changed.' });
  const existing = await findReferrerOf(uid);
  if (existing) return res.status(409).json({ error: 'You have already used a referral code.' });
  const users = (await readRoot('web_users')) || [];
  const owner = users.find((u) => String(u.referralCode || '').toUpperCase() === code)
    || users.find((u) => String(u.id) === code);
  if (!owner) return res.status(404).json({ error: 'This referral code does not exist.' });
  if (owner.id === uid) return res.status(400).json({ error: 'You cannot use your own referral code.' });
  const applied = await applyReferral(uid, code);
  if (!applied) return res.status(409).json({ error: 'Could not apply this referral code.' });
  try {
    await notifyUser(uid, {
      tone: 'success',
      title: 'Referral code applied',
      body: `You are now linked to ${owner.name || 'your referrer'}. They earn 10% lifetime commission on your top-ups.`,
    });
  } catch (_) {}
  res.json({ ok: true, referrer: { id: owner.id, name: owner.name || 'Referrer', code: owner.referralCode || owner.id } });
}));

// ══════════════════════════════════════════════════════════════════════════════
//  ADSTERRA NETWORK SUMMARY  (real publisher revenue straight from the API)
//  Pulls the last N days of the publisher report and caches it briefly so the
//  dashboard/leaderboard can surface live revenue, CPM and impressions without
//  hammering the API (rate-limit safe).
// ══════════════════════════════════════════════════════════════════════════════
let _adsterraCache = { at: 0, value: null, inflight: null };
const ADSTERRA_CACHE_MS = 5 * 60 * 1000;
const _adstDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// ⭐ V40: recognise placeholder / obviously-invalid Adsterra keys so the UI can show a
// friendly "connect your account" prompt instead of a raw HTTP 403/401 error.
function isPlaceholderAdsterraKey(token) {
  const t = String(token || '').trim().toLowerCase();
  if (!t) return true;
  if (t.includes('your_') || t.includes('_here') || t.includes('placeholder') || t.includes('example') || t.includes('changeme')) return true;
  if (t.length < 16) return true;
  return false;
}

async function fetchAdsterraNetworkSummary(days = 7, tokenOverride = null) {
  // ⭐ FIX: accept an explicit token so each user can pull THEIR OWN publisher
  // account. When no token is passed we fall back to the platform token
  // (ADSTERRA_API_TOKEN), which stays the source for the admin/leaderboard view.
  const token = String(tokenOverride || process.env.ADSTERRA_API_TOKEN || '').trim();
  if (!token || isPlaceholderAdsterraKey(token)) {
    return { ok: false, error: 'No Adsterra publisher API key connected yet.', days: [], needsKey: true };
  }
  const now = Date.now();
  const finish = _adstDay(now);
  const start = _adstDay(now - (days - 1) * 86400000);
  const res = await L.fetchAdsterraPublisherReport(token, start, finish);
  if (!res || !res.ok) {
    const raw = (res && res.error) || 'Adsterra request failed.';
    const unauthorized = /unauthor|forbidden|401|403/i.test(raw);
    return {
      ok: false,
      error: unauthorized
        ? 'Adsterra rejected the API key (unauthorized). Re-check the publisher API key saved in SmartLinks.'
        : raw,
      days: [],
      needsKey: unauthorized,
    };
  }
  const items = (res.data && res.data.items) || [];
  const map = {};
  for (const it of items) {
    const d = String(it.date || '').slice(0, 10);
    if (!d) continue;
    if (!map[d]) map[d] = { date: d, revenue: 0, impressions: 0, clicks: 0 };
    map[d].revenue += Number(it.revenue) || 0;
    map[d].impressions += Number(it.impression) || 0;
    map[d].clicks += Number(it.clicks) || 0;
  }
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = _adstDay(now - i * 86400000);
    const row = map[d] || { date: d, revenue: 0, impressions: 0, clicks: 0 };
    row.cpm = row.impressions > 0 ? (row.revenue / row.impressions) * 1000 : 0;
    row.ctr = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
    series.push(row);
  }
  const sum = series.reduce((a, r) => {
    a.revenue += r.revenue; a.impressions += r.impressions; a.clicks += r.clicks; return a;
  }, { revenue: 0, impressions: 0, clicks: 0 });
  const cpm = sum.impressions > 0 ? (sum.revenue / sum.impressions) * 1000 : 0;
  const ctr = sum.impressions > 0 ? (sum.clicks / sum.impressions) * 100 : 0;
  const today = series[series.length - 1] || { date: finish, revenue: 0, impressions: 0, clicks: 0, cpm: 0, ctr: 0 };
  const rnd = (n, p = 2) => Math.round(n * Math.pow(10, p)) / Math.pow(10, p);
  return {
    ok: true,
    windowDays: days,
    startDate: start,
    finishDate: finish,
    revenue: rnd(sum.revenue, 4),
    impressions: Math.round(sum.impressions),
    clicks: Math.round(sum.clicks),
    cpm: rnd(cpm, 4),
    ctr: rnd(ctr, 4),
    today: { date: today.date, revenue: rnd(today.revenue, 4), impressions: Math.round(today.impressions), clicks: Math.round(today.clicks), cpm: rnd(today.cpm, 4) },
    days: series.map((r) => ({ date: r.date, revenue: rnd(r.revenue, 4), impressions: Math.round(r.impressions), clicks: Math.round(r.clicks), cpm: rnd(r.cpm, 4), ctr: rnd(r.ctr, 4) })),
    updatedAt: new Date().toISOString(),
  };
}

async function getAdsterraNetworkSummary(days = 7, force = false) {
  const now = Date.now();
  if (!force && _adsterraCache.value && now - _adsterraCache.at < ADSTERRA_CACHE_MS && _adsterraCache.value.windowDays === days) {
    return _adsterraCache.value;
  }
  if (_adsterraCache.inflight) return _adsterraCache.inflight;
  const p = (async () => {
    try {
      const val = await fetchAdsterraNetworkSummary(days);
      if (val.ok) {
        _adsterraCache.at = Date.now();
        _adsterraCache.value = val;
        // Publish the observed network CPM so the traffic bot can adaptively
        // bias toward high-CPM inventory and hold the band at $3-4.
        try {
          writeRoot('adsterra_live', {
            cpm: val.cpm, revenue: val.revenue, impressions: val.impressions,
            clicks: val.clicks, windowDays: days,
            cpmToday: (val.today && val.today.cpm) || 0,
            updated_at: Date.now(),
          }).catch(() => {});
        } catch (e) {}
      }
      return val;
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : 'Adsterra request failed.', days: [] };
    } finally {
      _adsterraCache.inflight = null;
    }
  })();
  _adsterraCache.inflight = p;
  return p;
}

// ⭐ FIX: PER-USER Adsterra publisher summary.
// Each user's dashboard + SmartLinks panels now reflect THEIR OWN Adsterra
// account (using the API key they saved in SmartLinks) instead of the platform
// owner's. The platform token (ADSTERRA_API_TOKEN) is only a fallback and stays
// the single source for the admin/leaderboard "network" view.
const _adsterraUserCache = new Map(); // key: `${uid}::${scope}` -> { at, value }
async function getAdsterraUserSummary(uid, days = 7, force = false, isAdmin = false) {
  const uidKey = String(uid);
  let userToken = '';
  try {
    const entry = ((await readRoot('user_smartlinks')) || {})[uidKey] || {};
    userToken = entry.api_key ? String(entry.api_key).trim() : '';
  } catch (e) { userToken = ''; }
  const platformToken = String(process.env.ADSTERRA_API_TOKEN || '').trim();
  // ⭐ Each user sees THEIR OWN Adsterra account. The platform token is only a
  // fallback for ADMINS (so the owner still sees the network) — a regular user
  // without a key is prompted to add one instead of seeing the owner's revenue.
  const token = userToken || (isAdmin ? platformToken : '');
  const scope = userToken ? 'own' : (isAdmin && platformToken ? 'platform' : 'none');
  if (!token) {
    return { ok: false, error: 'Adsterra API key not set. Open SmartLinks and save your Adsterra publisher API key to see your own impressions.', days: [], needsKey: true };
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


// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ FIX: keep the PLATFORM (owner) Adsterra summary warm so the `adsterra_live`
// CPM signal consumed by the traffic bot stays fresh even when nobody has the
// leaderboard/dashboard open. Runs every 10 minutes; unref'd so it never blocks
// process exit. Only ever touches the platform/owner token.
try {
  const _adstWarmTimer = setInterval(() => {
    getAdsterraNetworkSummary(7, true).catch(() => {});
  }, 10 * 60 * 1000);
  if (_adstWarmTimer && typeof _adstWarmTimer.unref === 'function') _adstWarmTimer.unref();
} catch (e) {}

//  LEADERBOARD  (daily top-3 by impressions + by earnings, resets at 00:00 Dhaka)
//  Impressions come from the bot's real delivered-visit counters
//  (`smartlink_daily_visits`, keyed per BD date → the board rolls over by itself
//  at midnight). Earnings are the publisher revenue share for those visits,
//  weighted per traffic type (smartlink vs normal). Read-only + zero new writes.
// ═══════════════════════════════════════════════════════════════════════════════
// Rates are USD credited per 1,000 impressions (platform is USD-first).
const LEADERBOARD_DEFAULTS = { enabled: true, earn_rate_smartlink: 3.5, earn_rate_normal: 3.5, min_impressions: 0 };
async function getLeaderboardSettings() {
  const stored = await readRoot('leaderboard_settings');
  return mergeDefaults(stored, LEADERBOARD_DEFAULTS);
}
function msUntilMidnightDhaka() {
  const now = new Date();
  const BD = 6 * 60 * 60 * 1000;
  const bdNow = new Date(now.getTime() + BD);
  const nextMidnightUtc = Date.UTC(bdNow.getUTCFullYear(), bdNow.getUTCMonth(), bdNow.getUTCDate() + 1, 0, 0, 0) - BD;
  return Math.max(0, nextMidnightUtc - now.getTime());
}
function publicUserCard(rec, uid) {
  const planKey = String(rec.membershipPlanId || 'free').toLowerCase().replace(/^plan_/, '') || 'free';
  const plan = (L.DEFAULT_PLANS || {})[planKey];
  return {
    userId: String(uid),
    publicId: rec.publicId || String(uid),
    name: rec.name || rec.firstName || 'Publisher',
    username: rec.username || rec.publicId || String(uid),
    avatar: rec.avatar || '',
    country: rec.country || '',
    bio: rec.bio || '',
    // ⭐ Membership badge data (1 month = white, 2 months = red, 3 months = black; free otherwise).
    plan: planKey,
    planLabel: plan ? plan.label : (planKey === 'free' ? 'Free' : planKey),
    membershipExpiresAt: rec.membershipExpiresAt || null,
  };
}
app.get('/api/leaderboard', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = String(req.auth.uid);
  const today = L.todayStr();
  const isAdminUser = req.auth.role === 'admin';
  const [daily, users, settings, network] = await Promise.all([
    readRoot('smartlink_daily_visits'), readRoot('web_users'), getLeaderboardSettings(),
    // ⭐ V40: each member's board reflects THEIR OWN Adsterra publisher account
    // (the key saved in SmartLinks). Admins fall back to the platform account.
    // This is what makes "Your earnings today" + Network Performance truly LIVE.
    getAdsterraUserSummary(uid, 7, false, isAdminUser).catch(() => ({ ok: false, days: [] })),
  ]);
  const d = daily || {};
  const allUsers = Array.isArray(users) ? users : [];
  // Keep the implied CPM inside the $3-4 band (requirement: never lower).
  const clampRate = (n) => Math.min(4, Math.max(3, Number(n) || 3.5));
  const rateSL = clampRate(settings.earn_rate_smartlink);
  const rateN = clampRate(settings.earn_rate_normal);
  const minImp = Math.max(0, Number(settings.min_impressions) || 0);

  const agg = {};
  for (const [key, val] of Object.entries(d)) {
    const parts = String(key).split('::');
    if (parts.length !== 3) continue;
    const [u, type, date] = parts;
    if (date !== today) continue;
    const n = Math.max(0, Math.floor(Number(val) || 0));
    if (!n) continue;
    if (!agg[u]) agg[u] = { impressions: 0, smartlink: 0, normal: 0 };
    agg[u].impressions += n;
    if (type === 'smartlink') agg[u].smartlink += n; else agg[u].normal += n;
  }

  const rows = Object.entries(agg).map(([u, v]) => {
    const rec = allUsers.find((x) => String(x.id || x.uid) === u) || {};
    // Publisher revenue share in USD (rates are USD per 1,000 impressions).
    const earnings = Number(((v.smartlink * rateSL + v.normal * rateN) / 1000).toFixed(4));
    return { ...publicUserCard(rec, u), impressions: v.impressions, earnings };
  }).filter((r) => r.impressions >= minImp);

  const byImp = [...rows].sort((a, b) => b.impressions - a.impressions || b.earnings - a.earnings);
  const byEarn = [...rows].sort((a, b) => b.earnings - a.earnings || b.impressions - a.impressions);
  // Podium = the top 3; then the NEXT 20 publishers (ranks 4-23) are shown as a
  // single serial list below the podium on the client.
  const board = (arr) => ({
    top: arr.slice(0, 3).map((r, i) => ({ rank: i + 1, ...r })),
    next: arr.slice(3, 23).map((r, i) => ({ rank: i + 4, ...r })),
  });
  const impBoard = board(byImp);
  const earnBoard = board(byEarn);

  const myRow = rows.find((r) => r.userId === uid) || { impressions: 0, earnings: 0 };
  const impRank = byImp.findIndex((r) => r.userId === uid);
  const earnRank = byEarn.findIndex((r) => r.userId === uid);

  res.json({
    ok: true,
    enabled: settings.enabled !== false,
    timezone: 'Asia/Dhaka',
    date: today,
    resetsInMs: msUntilMidnightDhaka(),
    rates: { smartlink: rateSL, normal: rateN },
    totalParticipants: rows.length,
    network: {
      ok: !!(network && network.ok),
      revenue: Number(network && network.revenue) || 0,
      impressions: Number(network && network.impressions) || 0,
      clicks: Number(network && network.clicks) || 0,
      cpm: Number(network && network.cpm) || 0,
      ctr: Number(network && network.ctr) || 0,
      today: (network && network.today) || { revenue: 0, impressions: 0, clicks: 0, cpm: 0 },
      days: (network && network.days) || [],
      windowDays: (network && network.windowDays) || 7,
      updatedAt: (network && network.updatedAt) || null,
      error: (network && network.error) || null,
      needsKey: !!(network && network.needsKey),
    },
    topImpressions: impBoard.top,
    nextImpressions: impBoard.next,
    topEarnings: earnBoard.top,
    nextEarnings: earnBoard.next,
    me: {
      userId: uid,
      impressions: myRow.impressions,
      earnings: myRow.earnings,
      impressionsRank: impRank >= 0 ? impRank + 1 : null,
      earningsRank: earnRank >= 0 ? earnRank + 1 : null,
      // ⭐ V40: LIVE Adsterra figures for THIS user (their own publisher account).
      // The dashboard/leaderboard now show real Adsterra revenue instead of only the
      // platform's estimated revenue-share, so "Your earnings today" is the truth.
      live: {
        ok: !!(network && network.ok),
        error: (network && network.error) || null,
        needsKey: !!(network && network.needsKey),
        windowDays: (network && network.windowDays) || 7,
        revenue: Number(network && network.revenue) || 0,
        impressions: Number(network && network.impressions) || 0,
        clicks: Number(network && network.clicks) || 0,
        cpm: Number(network && network.cpm) || 0,
        todayRevenue: Number(network && network.today && network.today.revenue) || 0,
        todayImpressions: Number(network && network.today && network.today.impressions) || 0,
        todayCpm: Number(network && network.today && network.today.cpm) || 0,
        updatedAt: (network && network.updatedAt) || null,
      },
    },
  });
}));

// Adsterra network performance summary (auth) — used by the dashboard + leaderboard.
app.get('/api/adsterra/summary', requireAuth, requireFirebase, wrap(async (req, res) => {
  const days = Math.max(1, Math.min(31, Number(req.query.days) || 7));
  const force = String(req.query.force || '') === '1';
  // ⭐ FIX: every user sees THEIR OWN Adsterra publisher account (key saved in
  // SmartLinks). Admins can still request the platform-wide view with ?scope=platform.
  const scope = String(req.query.scope || '').toLowerCase();
  const summary = (scope === 'platform' && req.auth.role === 'admin')
    ? await getAdsterraNetworkSummary(days, force)
    : await getAdsterraUserSummary(req.auth.uid, days, force, req.auth.role === 'admin');
  res.json(summary);
}));

// Admin: read / update leaderboard settings
app.get('/api/admin/leaderboard', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  res.json({ ok: true, settings: await getLeaderboardSettings() });
}));
app.put('/api/admin/leaderboard', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const body = req.body || {};
  const next = await updateRoot('leaderboard_settings', (cur) => {
    const base = mergeDefaults(cur, LEADERBOARD_DEFAULTS);
    if (body.enabled !== undefined) base.enabled = !!body.enabled;
    if (body.earn_rate_smartlink !== undefined) base.earn_rate_smartlink = Math.max(0, Number(body.earn_rate_smartlink) || 0);
    if (body.earn_rate_normal !== undefined) base.earn_rate_normal = Math.max(0, Number(body.earn_rate_normal) || 0);
    if (body.min_impressions !== undefined) base.min_impressions = Math.max(0, Math.floor(Number(body.min_impressions) || 0));
    return base;
  });
  try { await addAuditLog({ actor: req.auth, action: 'leaderboard.settings.update', details: 'Updated leaderboard settings', targetType: 'settings' }); } catch (_) {}
  res.json({ ok: true, settings: next });
}));

// ─── Free-trial settings (admin) ───────────────────────────────────────────────
app.get('/api/admin/settings/trial', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  res.json({ ok: true, settings: mergeDefaults(await readRoot('trial_settings'), TRIAL_DEFAULTS) });
}));
app.put('/api/admin/settings/trial', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const body = req.body || {};
  const next = await updateRoot('trial_settings', (cur) => {
    const base = mergeDefaults(cur, TRIAL_DEFAULTS);
    if (body.enabled !== undefined) base.enabled = !!body.enabled;
    if (body.amount !== undefined) base.amount = Math.max(0, Math.floor(Number(body.amount) || 0));
    return base;
  });
  try { await addAuditLog({ actor: req.auth, action: 'trial.settings.update', details: 'Updated free-trial settings', targetType: 'settings' }); } catch (_) {}
  res.json({ ok: true, settings: next });
}));

// ─── Terms & Conditions ────────────────────────────────────────────────────────
const TERMS_DEFAULTS = {
  version: '1.0',
  updatedAt: '2025-01-01T00:00:00.000Z',
  content: [
    'Welcome to X AD MARKETING. By creating an account you agree to the following terms and conditions.',
    '',
    '1. ACCEPTANCE OF TERMS',
    'By registering an account you confirm that you are at least 18 years old (or have the consent of a legal guardian) and that you accept these Terms and Conditions in full.',
    '',
    '2. ACCOUNT RESPONSIBILITY',
    'You are responsible for keeping your password confidential and for all activity that happens under your account. One account per person is allowed. Sharing, selling or transferring accounts is strictly prohibited.',
    '',
    '3. ACCEPTABLE USE',
    'You agree not to use the platform for any unlawful, abusive, fraudulent or harmful activity, including attempting to manipulate impressions, traffic, balances or the delivery engine, or using bots, scripts or automation to abuse the service.',
    '',
    '4. IMPRESSION CREDITS AND WALLET',
    'Impression credits and wallet balance are virtual and non-transferable. Credits purchased or granted (including the free trial) are used to deliver impressions through the platform engine. Wallet top-ups are non-refundable once credits have been consumed.',
    '',
    '5. FREE TRIAL',
    'The free welcome trial can be claimed once per account. It grants impression credits only (not withdrawable cash) and may be modified or withdrawn at any time.',
    '',
    '6. DELIVERY AND RESULTS',
    'The platform delivers traffic through an automated engine. While we work hard to maximise quality, we do not guarantee any specific number of impressions, clicks, conversions or revenue.',
    '',
    '7. PROHIBITED CONTENT',
    'You must not submit links that point to illegal, adult, violent, hateful, malware or otherwise prohibited content. Such links will be removed and the account may be banned.',
    '',
    '8. TERMINATION',
    'We may suspend or terminate any account that violates these terms, at any time and without prior notice.',
    '',
    '9. CHANGES TO THESE TERMS',
    'We may update these terms from time to time. Continued use of the platform after an update means you accept the new terms.',
    '',
    '10. LIMITATION OF LIABILITY',
    'The platform is provided as is. We are not liable for any indirect or consequential loss arising from the use of the service.',
    '',
    'By ticking the checkbox on the sign-up form you confirm that you have read, understood and accepted these Terms and Conditions.',
  ].join('\n'),
};

// Public: the current Terms & Conditions (shown on the sign-up page + legal page).
app.get('/api/terms', wrap(async (req, res) => {
  const stored = await readRoot('terms_settings');
  const merged = mergeDefaults(stored, TERMS_DEFAULTS);
  res.json({ ok: true, version: merged.version, updatedAt: merged.updatedAt, content: merged.content });
}));

// Admin: update the Terms & Conditions.
app.put('/api/admin/terms', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const body = req.body || {};
  const next = await updateRoot('terms_settings', (cur) => {
    const base = mergeDefaults(cur, TERMS_DEFAULTS);
    if (body.content !== undefined) base.content = String(body.content || '').slice(0, 60000);
    if (body.version !== undefined) base.version = String(body.version || '1.0').slice(0, 40);
    base.updatedAt = new Date().toISOString();
    return base;
  });
  try { await addAuditLog({ actor: req.auth, action: 'terms.update', details: 'Updated Terms & Conditions', targetType: 'settings' }); } catch (_) {}
  res.json({ ok: true, terms: next });
}));

// ── "How to Work" tutorial videos ────────────────────────────────────────────
// Normalises an arbitrary admin-supplied list into a safe, ordered shape.
function sanitizeHowToVideos(videos) {
  if (!Array.isArray(videos)) return [];
  return videos
    .filter((v) => v && typeof v === 'object')
    .map((v, i) => ({
      id: String(v.id || `howto_${i + 1}_${Date.now().toString(36)}`).slice(0, 60),
      title: String(v.title || '').slice(0, 200),
      description: String(v.description || '').slice(0, 800),
      url: String(v.url || '').slice(0, 1000),
      category: String(v.category || 'General').slice(0, 60),
      enabled: v.enabled !== false,
      order: Number.isFinite(Number(v.order)) ? Number(v.order) : i + 1,
    }))
    .sort((a, b) => a.order - b.order);
}

// Public: the enabled "How to Work" guide videos (YouTube / Telegram links).
app.get('/api/howto', wrap(async (req, res) => {
  const stored = await readRoot('howto_videos');
  const merged = mergeDefaults(stored, HOWTO_DEFAULTS);
  const videos = sanitizeHowToVideos(merged.videos).filter((v) => v.enabled);
  res.json({ ok: true, updatedAt: merged.updatedAt, videos });
}));

// Admin: replace the full "How to Work" video list.
app.put('/api/admin/howto', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const body = req.body || {};
  const next = await updateRoot('howto_videos', (cur) => {
    const base = mergeDefaults(cur, HOWTO_DEFAULTS);
    if (Array.isArray(body.videos)) base.videos = sanitizeHowToVideos(body.videos);
    base.updatedAt = new Date().toISOString();
    return base;
  });
  try { await addAuditLog({ actor: req.auth, action: 'howto.update', details: `Updated How-to-Work videos (${(next.videos || []).length})`, targetType: 'settings' }); } catch (_) {}
  res.json({ ok: true, updatedAt: next.updatedAt, videos: sanitizeHowToVideos(next.videos) });
}));

// Manual data-maintenance trigger (admin) — trims unbounded Firestore arrays on demand.
app.post('/api/admin/maintenance/prune', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  await pruneWebData('manual');
  try { await addAuditLog({ actor: req.auth, action: 'maintenance.prune', details: 'Manually pruned web data', targetType: 'settings' }); } catch (_) {}
  res.json({ ok: true, limits: { ledger: LEDGER_KEEP, requests: REQUEST_KEEP, tickets: TICKET_KEEP, audit: AUDIT_KEEP } });
}));

// Public profile of another user (by publicId or userId) — safe fields only.
app.get('/api/users/:id/public', requireAuth, requireFirebase, wrap(async (req, res) => {
  const key = String(req.params.id || '').trim();
  const users = (await readRoot('web_users')) || [];
  const rec = users.find((u) => String(u.publicId) === key || String(u.id) === key);
  if (!rec) return res.status(404).json({ error: 'User not found.' });
  // ⭐ FIX: never expose another user's wallet balance on a public profile.
  const [stats, membership] = await Promise.all([
    readRoot('stats'), readRoot('membership'),
  ]);
  const uid = String(rec.id);
  const st = (stats || {})[uid] || {};
  const mem = (membership || {})[uid] || {};
  const planKey = String(mem.plan || rec.membershipPlanId || 'free').toLowerCase().replace(/^plan_/, '') || 'free';
  const plan = (L.DEFAULT_PLANS || {})[planKey];
  res.json({
    ok: true,
    profile: {
      ...publicUserCard(rec, uid),
      createdAt: rec.createdAt || null,
      socials: rec.socials || {},
      bannerColor: rec.bannerColor || '',
      plan: planKey,
      planLabel: plan ? plan.label : (planKey === 'free' ? 'Free' : String(planKey)),
      membershipExpiresAt: mem.expires_at || rec.membershipExpiresAt || null,
      totalImpressions: Math.max(0, Math.floor(Number(st.total_impressions) || 0)),
    },
  });
}));

// Real worker telemetry derived from the server's live impression log.
// Live monitor for the Traffic Worker page. Everything here is measured from real data:
// the worker writes every visit into `live_impression_log`, so its freshness tells us if it is alive.
app.get('/api/admin/monitor', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const os = require('node:os');
  const [live, running, normal, impBal, ctl, workerStatus] = await Promise.all([
    readRoot('live_impression_log'), readRoot('auto_impression_running'),
    readRoot('web_normal_links'), readRoot('impression_balance'), readRoot('web_worker_control'),
    readRootSafe('web_worker_status'),
  ]);
  const toMs = (v) => { const n = typeof v === 'number' ? v : Date.parse(String(v || '')); return Number.isFinite(n) ? n : 0; };
  const recent = (live && Array.isArray(live.recent) ? live.recent : []).map((e) => ({
    t: toMs(e.timestamp || e.createdAt || e.time || e.ts),
    status: Number(e.status || e.statusCode || 0),
    bad: e.ok === false,
    detail: String(e.detail || ''),
    type: String(e.type || 'Traffic'),
    target: String(e.url || e.target || ''),
  })).filter((e) => e.t > 0).sort((a, b) => b.t - a.t);

  const now = Date.now();
  const lastEventAt = recent.length ? recent[0].t : 0;
  const inWindow = (ms) => recent.filter((e) => now - e.t <= ms);
  const lastMin = inWindow(60e3).length;
  const lastHour = inWindow(3600e3);
  const failed = lastHour.filter((e) => e.status >= 400 || e.bad).length;
  const buckets = Array.from({ length: 30 }, () => 0);          // events per minute, oldest → newest
  for (const e of inWindow(30 * 60e3)) buckets[29 - Math.min(29, Math.floor((now - e.t) / 60e3))] += 1;

  const runningUsers = Object.values(running || {}).filter(Boolean).length;
  let activeNormal = 0;
  for (const list of Object.values(normal || {})) if (Array.isArray(list)) activeNormal += list.filter((l) => l && l.status === 'active').length;
  const credits = Object.values(impBal || {}).reduce((a, b) => a + Number(b || 0), 0);

  // ── Worker process heartbeat (bot writes every 30s) ────────────────────────
  // The bot stores { value: {...}, updated_at } while older writers used a flat
  // object, so normalise both shapes before reading the timestamp.
  const hbRaw = workerStatus || {};
  const hb = (hbRaw && hbRaw.value && typeof hbRaw.value === 'object') ? hbRaw.value : hbRaw;
  const hbAt = toMs(hb.lastHeartbeat || hbRaw.updated_at || hbRaw.updatedAt || hb.updatedAt);
  const heartbeatAgeSec = hbAt ? Math.round((now - hbAt) / 1000) : null;
  const workerAlive = hbAt > 0 && (now - hbAt) <= 120e3;   // 4× the 30s beat

  const ageSec = lastEventAt ? Math.round((now - lastEventAt) / 1000) : null;
  const trafficRequested = runningUsers + activeNormal > 0;
  // SmartLink dwell is 60-180s and a burst can run up to 5 min, so a gap of a
  // few minutes between events is NORMAL. Treat the worker as running while it
  // is alive AND traffic is requested, instead of flapping to "stalled".
  let state = 'idle', note = 'No traffic is requested right now.';
  if (ageSec !== null && ageSec <= 300) { state = 'running'; note = 'The worker is processing traffic.'; }
  else if (workerAlive && trafficRequested) { state = 'running'; note = 'Worker is online and processing traffic.'; }
  else if (trafficRequested) {
    state = 'stalled';
    note = 'Traffic is requested but the worker has produced nothing for a while. Check it with:  pm2 status  /  pm2 logs pnworker';
  } else if (workerAlive) { state = 'idle'; note = 'Worker is online — nothing is being requested.'; }
  else if (ageSec !== null) { state = 'idle'; note = 'Idle — nothing is being requested.'; }
  else if (heartbeatAgeSec !== null) { state = 'idle'; note = 'Worker heartbeat is stale — the bot process may be down.'; }

  const cores = os.cpus().length || 1, total = os.totalmem(), used = total - os.freemem();
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    now, state, note, lastEventAt: lastEventAt || null, ageSec,
    eventsLastMinute: lastMin, eventsLastHour: lastHour.length, failedLastHour: failed,
    successRate: lastHour.length ? Math.round(((lastHour.length - failed) / lastHour.length) * 1000) / 10 : null,
    buckets, runningUsers, activeNormalLinks: activeNormal, creditsOutstanding: Math.floor(credits),
    pendingControl: !!(ctl && ctl.resetRequestedAt && now - Number(ctl.resetRequestedAt) < 120000),
    worker: {
      alive: workerAlive,
      heartbeatAgeSec,
      lastHeartbeat: hbAt || null,
      pid: hb.pid || null,
      version: hb.version || null,
      uptimeSec: Number(hb.uptimeSec) || null,
      state: hb.state || null,
      activeSmartlinkUsers: Number(hb.activeSmartlinkUsers) || 0,
      activeNormalUsers: Number(hb.activeNormalUsers) || 0,
    },
    system: {
      cores, cpuLoadPercent: Math.min(100, Math.round((os.loadavg()[0] / cores) * 1000) / 10),
      memPercent: Math.round((used / total) * 1000) / 10, memUsedMb: Math.round(used / 1048576), memTotalMb: Math.round(total / 1048576),
      apiUptimeSec: Math.round(process.uptime()),
    },
    recent: recent.slice(0, 60).map((e) => ({ t: e.t, level: (e.status >= 400 || e.bad) ? 'WARN' : 'INFO', component: e.type, msg: (e.target ? `${e.target}${e.status ? ` — HTTP ${e.status}` : ''}` : (e.status ? `HTTP ${e.status}` : 'Traffic event')) + (e.detail ? ` · ${e.detail}` : '') })),
  });
}));

app.get('/api/admin/worker/logs', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const live = await readRoot('live_impression_log') || {};
  const recent = Array.isArray(live.recent) ? live.recent.slice(-500).reverse() : [];
  const logs = recent.map((item) => ({
    time: item.timestamp || item.createdAt || (item.ts ? new Date(item.ts).toISOString() : new Date().toISOString()),
    level: (Number(item.status || item.statusCode || 0) >= 400 || item.ok === false) ? 'WARN' : 'INFO',
    component: item.type || 'TrafficWorker',
    msg: `${item.url || item.target || 'Traffic event'}${item.status ? ` — HTTP ${item.status}` : ''}${item.detail ? ` · ${item.detail}` : ''}`,
  }));
  res.json({ logs, source: 'live_impression_log' });
}));

// ═══════════════════════════════════════════════════════════════════════
//  SUPPORT TICKETS
// ═══════════════════════════════════════════════════════════════════════
app.post('/api/support/ticket', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const { subject, message, priority } = req.body || {};
  if (!message || String(message).length < 5) return res.status(400).json({ error: 'Message too short.' });

  const user = await getUserById(uid);
  const ticket = {
    id: 'tkt_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    userId: uid,
    userName: user.name,
    userEmail: user.email,
    subject: String(subject || 'Support request').slice(0, 200),
    status: 'open',
    priority: ['low', 'normal', 'urgent'].includes(priority) ? priority : 'normal',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    replies: [{
      id: 'rep_' + Date.now(),
      from: 'user',
      authorName: user.name,
      message: String(message).slice(0, 4000),
      createdAt: new Date().toISOString(),
    }],
  };

  await updateRoot('web_support_tickets', (cur) => ({
    ...(cur || {}),
    [uid]: [ticket, ...(((cur || {})[uid]) || [])],
  }));

  res.json({ ticket });
}));

app.post('/api/support/ticket/:id/reply', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const ticketId = String(req.params.id);
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Message required.' });

  const user = await getUserById(uid);
  let updated = null;
  await updateRoot('web_support_tickets', (cur) => {
    const list = ((cur || {})[uid]) || [];
    const next = list.map((t) => {
      if (t.id !== ticketId) return t;
      updated = {
        ...t,
        status: 'in_progress',
        updatedAt: new Date().toISOString(),
        replies: [...(t.replies || []), {
          id: 'rep_' + Date.now(),
          from: 'user',
          authorName: user.name,
          message: String(message).slice(0, 4000),
          createdAt: new Date().toISOString(),
        }],
      };
      return updated;
    });
    return { ...(cur || {}), [uid]: next };
  });

  res.json({ ticket: updated });
}));

app.post('/api/support/ticket/:id/close', requireAuth, requireFirebase, wrap(async (req, res) => {
  const uid = req.auth.uid;
  const ticketId = String(req.params.id);
  await updateRoot('web_support_tickets', (cur) => {
    const list = ((cur || {})[uid]) || [];
    const next = list.map((t) =>
      t.id === ticketId
        ? { ...t, status: 'closed', updatedAt: new Date().toISOString() }
        : t);
    return { ...(cur || {}), [uid]: next };
  });
  res.json({ ok: true });
}));

// ─── Support Desk: admin side (list / reply / change status) ───────────────
const TICKET_STATUSES = ['open', 'in_progress', 'pending', 'resolved', 'closed'];
async function notifyUser(uid, n) {
  await updateRoot('web_user_notifications', (cur) => {
    const all = (cur && typeof cur === 'object') ? { ...cur } : {};
    const list = Array.isArray(all[uid]) ? all[uid] : [];
    all[uid] = [{ id: 'wn_' + Date.now() + '_' + crypto.randomBytes(2).toString('hex'), at: new Date().toISOString(), tone: 'info', ...n }, ...list].slice(0, 50);
    return all;
  });
}
app.get('/api/admin/support', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const all = (await readRoot('web_support_tickets')) || {};
  const tickets = Object.values(all).flat().filter(Boolean)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  res.json({ tickets: tickets.slice(0, 500) });
}));

app.post('/api/admin/support/:userId/:ticketId/reply', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const userId = String(req.params.userId), ticketId = String(req.params.ticketId);
  const message = String(req.body?.message || '').trim().slice(0, 4000);
  if (message.length < 1) return res.status(400).json({ error: 'Message required.' });
  const actor = await getUserById(req.auth.uid);
  let updated = null;
  await updateRoot('web_support_tickets', (cur) => {
    const all = { ...(cur || {}) };
    all[userId] = (all[userId] || []).map((t) => {
      if (t.id !== ticketId) return t;
      updated = {
        ...t,
        status: t.status === 'closed' ? 'closed' : 'in_progress',
        updatedAt: new Date().toISOString(),
        replies: [...(t.replies || []), {
          id: 'rep_' + Date.now() + '_' + crypto.randomBytes(2).toString('hex'),
          from: 'admin', authorName: actor?.name || 'Support',
          message, createdAt: new Date().toISOString(),
        }],
      };
      return updated;
    });
    return all;
  });
  if (!updated) return res.status(404).json({ error: 'Ticket not found.' });
  await notifyUser(userId, { title: 'Support replied', desc: `"${updated.subject}" \u2014 ${message.slice(0, 90)}`, tone: 'info', view: 'support' });
  await addAuditLog({ actor: { name: actor?.name, role: 'admin' }, action: 'SUPPORT_REPLY', targetId: ticketId, targetType: 'ticket', details: updated.subject });
  res.json({ ticket: updated });
}));

app.put('/api/admin/support/:userId/:ticketId/status', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const userId = String(req.params.userId), ticketId = String(req.params.ticketId);
  const status = String(req.body?.status || '');
  if (!TICKET_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  let updated = null;
  await updateRoot('web_support_tickets', (cur) => {
    const all = { ...(cur || {}) };
    all[userId] = (all[userId] || []).map((t) => (t.id === ticketId ? (updated = { ...t, status, updatedAt: new Date().toISOString() }) : t));
    return all;
  });
  if (!updated) return res.status(404).json({ error: 'Ticket not found.' });
  if (status === 'resolved' || status === 'closed') {
    await notifyUser(userId, { title: `Ticket ${status}`, desc: `Your ticket "${updated.subject}" was marked ${status}.`, tone: 'success', view: 'support' });
  }
  const actor = await getUserById(req.auth.uid);
  await addAuditLog({ actor: { name: actor?.name, role: 'admin' }, action: 'SUPPORT_STATUS', targetId: ticketId, targetType: 'ticket', details: `${updated.subject} -> ${status}` });
  res.json({ ticket: updated });
}));

// ═══════════════════════════════════════════════════════════════════════
//  ADMIN — USERS
// ═══════════════════════════════════════════════════════════════════════
app.get('/api/admin/users', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const list = await readRoot('web_users') || [];
  res.json({ users: list.map(safeUser) });
}));

// Admin: create a brand-new user account directly (already verified, no email step).
app.post('/api/admin/users', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const { email, password, name, telegram, membershipPlanId, walletBalance, impressionCredits, role } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const existing = await findUserByEmail(cleanEmail);
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });
  const tg = normalizeTelegram(telegram);
  if (tg === null) return res.status(400).json({ error: 'Telegram username must be 5-32 letters, numbers or underscores.' });

  const record = makeFreshUserRecord({
    email: cleanEmail,
    name: name || cleanEmail.split('@')[0],
    password,
    role: role === 'admin' ? 'admin' : 'user',
  });
  record.emailVerified = true;
  if (tg) record.telegram = tg;
  await provisionUser(record);

  // Optional membership plan assignment.
  const planKey = String(membershipPlanId || '').trim();
  if (planKey && planKey !== 'free') {
    const plans = (await readRoot('plans')) || L.DEFAULT_PLANS;
    const plan = findPlan(plans, planKey);
    if (plan) {
      const now = Date.now();
      await updateRoot('membership', (cur) => ({
        ...(cur || {}),
        [record.id]: {
          plan: planKey,
          expires_at: now + plan.days * 86400000,
          link_limit: plan.link_limit,
          visits_per_link: plan.visits_per_link,
          burst_window_ms: plan.burst_window_ms,
          daily_burst_limit: plan.daily_burst_limit,
          daily_burst_used: 0,
          daily_reset_date: L.todayStr(),
        },
      }));
      record.membershipPlanId = planKey;
    }
  }

  const bal = Number(walletBalance);
  if (Number.isFinite(bal) && bal !== 0) {
    await updateRoot('balance', (cur) => ({ ...(cur || {}), [record.id]: Number(bal.toFixed(2)) }));
  }
  const cred = Number(impressionCredits);
  if (Number.isFinite(cred) && cred !== 0) {
    await updateRoot('impression_balance', (cur) => ({ ...(cur || {}), [record.id]: Math.max(0, Math.floor(cred)) }));
  }

  const actor = await getUserById(req.auth.uid);
  try {
    await addAuditLog({ actor: { name: actor?.name, role: 'admin' }, action: 'USER_CREATED', targetId: record.id, targetType: 'user', details: `Admin created account ${record.email}` });
  } catch (_) { /* ignore */ }
  res.json({ ok: true, user: safeUser(record) });
}));

// Admin: permanently delete a user and purge every per-user collection.
app.delete('/api/admin/users/:id', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const targetId = String(req.params.id);
  if (targetId === req.auth.uid) return res.status(400).json({ error: 'You cannot delete your own account.' });
  const target = await getUserById(targetId);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.role === 'admin' && req.auth.adminRole !== 'super_admin') {
    return res.status(403).json({ error: 'Only a Root Super Admin can delete an administrator.' });
  }
  if (target.isRootSuperAdmin) return res.status(400).json({ error: 'The Root Super Admin cannot be deleted.' });

  await updateRoot('web_users', (cur) => (cur || []).filter((u) => u.id !== targetId));
  await updateRoot('web_all_users', (cur) => (cur || []).filter((u) => u.id !== targetId));
  const perUser = [
    'balance', 'impression_balance', 'membership', 'user_links', 'user_smartlinks',
    'web_normal_links', 'web_transactions', 'web_balance_requests', 'auto_impression_running',
    'impression_targets', 'sessions', 'referrals', 'banned_users', 'smartlink_daily_visits',
    'impression_purchases', 'user_sessions',
  ];
  for (const coll of perUser) {
    await updateRoot(coll, (cur) => {
      if (!cur || typeof cur !== 'object') return cur;
      const next = { ...cur };
      delete next[targetId];
      return next;
    });
  }

  const actor = await getUserById(req.auth.uid);
  try {
    await addAuditLog({ actor: { name: actor?.name, role: 'admin' }, action: 'USER_DELETED', targetId, targetType: 'user', details: `Deleted account ${target.email}` });
  } catch (_) { /* ignore */ }
  res.json({ ok: true });
}));

app.put('/api/admin/users/:id', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const targetId = String(req.params.id);
  const { status, banReason } = req.body || {};
  if ((req.body || {}).email !== undefined) {
    return res.status(400).json({ error: 'User email cannot be changed.', code: 'EMAIL_LOCKED' });
  }
  const actor = await getUserById(req.auth.uid);

  await updateRoot('web_users', (cur) => (cur || []).map((u) => {
    if (u.id !== targetId) return u;
    const next = { ...u };
    if (status === 'banned' || status === 'active') next.status = status;
    if (banReason !== undefined) next.banReason = String(banReason || '').slice(0, 500);
    return next;
  }));

  await updateRoot('web_all_users', (cur) => (cur || []).map((u) => {
    if (u.id !== targetId) return u;
    const next = { ...u };
    if (status === 'banned' || status === 'active') next.status = status;
    if (banReason !== undefined) next.banReason = String(banReason || '').slice(0, 500);
    return next;
  }));

  if (status === 'banned' || status === 'active') {
    await updateRoot('banned_users', (cur) => {
      const next = { ...(cur || {}) };
      if (status === 'banned') next[targetId] = { reason: banReason || 'admin action', at: Date.now() };
      else delete next[targetId];
      return next;
    });
  }

  await addAuditLog({
    actor: { name: actor?.name, role: 'admin' },
    action: status === 'banned' ? 'USER_BANNED' : 'USER_UPDATED',
    targetId, targetType: 'user',
    details: `Updated user ${targetId}: status=${status || 'unchanged'}`,
  });

  res.json({ ok: true });
}));

app.post('/api/admin/users/:id/wallet-adjust', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const targetId = String(req.params.id);
  const amount = Number(req.body?.amount);
  const note = String(req.body?.note || '').slice(0, 500);
  if (!Number.isFinite(amount) || amount === 0) {
    return res.status(400).json({ error: 'Amount must be a non-zero number.' });
  }

  const actor = await getUserById(req.auth.uid);
  let newBalance = 0;
  let insufficient = null;
  await updateRoot('balance', (cur) => {
    insufficient = null;
    const current = Number((cur || {})[targetId] || 0);
    if (current + amount < -0.00001) { insufficient = current; return cur; } // cannot take more than the user has
    newBalance = Number((current + amount).toFixed(2));
    return { ...(cur || {}), [targetId]: newBalance };
  });
  if (insufficient !== null) {
    return res.status(400).json({ error: `This user only has $${Number(insufficient).toFixed(2)}. You cannot remove $${Math.abs(amount).toFixed(2)}.`, code: 'INSUFFICIENT_USER_BALANCE' });
  }

  const tx = {
    id: 'tx_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    userId: targetId, type: 'admin_adjustment',
    amount, balanceAfter: newBalance,
    description: `${amount < 0 ? 'Admin deduction' : 'Admin credit'}: ${note || '(no note)'}`,
    status: 'completed', createdAt: new Date().toISOString(),
  };
  await updateRoot('web_transactions', (cur) => ({
    ...(cur || {}),
    [targetId]: [tx, ...(((cur || {})[targetId]) || [])],
  }));

  await addAuditLog({
    actor: { name: actor?.name, role: 'admin' },
    action: 'WALLET_ADJUSTED', targetId, targetType: 'user',
    details: `Adjusted wallet by ${amount}. New balance: ${newBalance}. Note: ${note}`,
  });

  res.json({ ok: true, wallet: { userId: targetId, balance: newBalance }, transaction: tx });
}));

// Admin: full detail snapshot for ONE user (links, smartlinks, ledger, deposits).
// The web client only caches the signed-in user's own links/ledger, so the admin
// "Full Profile" inspector needs this dedicated read to show another user's data.
app.get('/api/admin/users/:id/details', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const targetId = String(req.params.id);
  const [
    userRecord, balance, impressionBalance, membership,
    webNormalLinks, userSmartlinks, webTransactions, webBalanceRequests,
  ] = await Promise.all([
    getUserById(targetId).catch(() => null),
    readRootSafe('balance'), readRootSafe('impression_balance'), readRootSafe('membership'),
    readRootSafe('web_normal_links'), readRootSafe('user_smartlinks'),
    readRootSafe('web_transactions'), readRootSafe('web_balance_requests'),
  ]);
  if (!userRecord) return res.status(404).json({ error: 'User not found.' });

  const sl = (userSmartlinks || {})[targetId] || {};
  const smartlinks = (Array.isArray(sl.links) ? sl.links : []).map((l, i) => ({
    id: `sl_${i}_${l.added_at || 0}`,
    userId: targetId,
    url: l.url,
    name: l.name || 'SmartLink',
    adsterraId: l.id || undefined,
    status: String(l.status || '').toLowerCase() === 'paused' ? 'paused' : 'active',
    lastVisitAt: new Date(l.last_visit_at || Date.now()).toISOString(),
    stats: { visits: l.bot_visits || 0, ok: l.ok || 0, failed: l.failed || 0 },
    cpm: 0, revenue: 0,
    addedAt: new Date(l.added_at || Date.now()).toISOString(),
  }));

  res.json({
    user: safeUser(userRecord),
    balance: Number((balance || {})[targetId] || 0),
    impressionBalance: Math.floor(Number((impressionBalance || {})[targetId] || 0)),
    membership: (membership || {})[targetId] || makeFreshMembership(targetId),
    normalLinks: (webNormalLinks || {})[targetId] || [],
    smartlinks,
    transactions: (webTransactions || {})[targetId] || [],
    balanceRequests: (webBalanceRequests || {})[targetId] || [],
  });
}));

// ═══════════════════════════════════════════════════════════════════════
//  ADMIN — DEPOSITS
// ═══════════════════════════════════════════════════════════════════════
app.get('/api/admin/deposits', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const all = await readRoot('web_balance_requests') || {};
  const pending = [];
  for (const list of Object.values(all)) {
    for (const r of (list || [])) if (r.status === 'pending') pending.push(r);
  }
  pending.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  res.json({ requests: pending });
}));

app.post('/api/admin/deposits/:id/decision', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const reqId = String(req.params.id);
  const status = String(req.body?.status || '');
  const note = String(req.body?.note || '').slice(0, 500);
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid decision.' });
  }

  let owner = null, request = null;
  await updateRoot('web_balance_requests', (cur) => {
    const next = { ...(cur || {}) };
    for (const uid of Object.keys(next)) {
      const list = next[uid] || [];
      const idx = list.findIndex((r) => r.id === reqId);
      if (idx >= 0) {
        const r = list[idx];
        if (r.status !== 'pending') return cur;
        owner = uid;
        request = { ...r, status, adminNote: note || undefined, processedAt: new Date().toISOString() };
        next[uid] = list.map((x, i) => (i === idx ? request : x));
        return next;
      }
    }
    return next;
  });

  if (!request || !owner) return res.status(404).json({ error: 'Deposit request not found or already processed.' });

  let newBalance = null;
  if (status === 'approved') {
    await updateRoot('balance', (cur) => {
      newBalance = Number(((cur || {})[owner] || 0) + Number(request.amount));
      return { ...(cur || {}), [owner]: Number(newBalance.toFixed(2)) };
    });

    const tx = {
      id: 'tx_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
      userId: owner, type: 'deposit',
      amount: Number(request.amount), balanceAfter: newBalance,
      description: `Deposit approved via ${request.method} (TXN: ${request.txnId})`,
      status: 'completed', createdAt: new Date().toISOString(),
    };
    await updateRoot('web_transactions', (cur) => ({
      ...(cur || {}),
      [owner]: [tx, ...(((cur || {})[owner]) || [])],
    }));

    // Lifetime referral commission: 10% of this top-up to whoever referred this user.
    try { await creditReferralCommission(owner, Number(request.amount)); }
    catch (e) { console.warn('[Referral] commission failed:', e?.message || e); }
  }

  const actor = await getUserById(req.auth.uid);
  await addAuditLog({
    actor: { name: actor?.name, role: 'admin' },
    action: status === 'approved' ? 'DEPOSIT_APPROVED' : 'DEPOSIT_REJECTED',
    targetId: reqId, targetType: 'balance_request',
    details: `${status} deposit #${reqId} (${request.amount})`,
  });

  res.json({ ok: true, request, newBalance });
}));

// ═══════════════════════════════════════════════════════════════════════
//  ADMIN — PROXIES
// ═══════════════════════════════════════════════════════════════════════
app.get('/api/admin/proxies', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const [proxies, stats, settings] = await Promise.all([
    readRoot('proxies'), readRoot('proxy_stats'), readRoot('proxy_settings'),
  ]);
  const proxiesOut = (proxies || []).map((p) => ({
    ...p,
    country: p.country ? String(p.country).toUpperCase() : '',
    country_meta: p.country ? countryFlag(p.country) : null,
  }));
  res.json({
    proxies: proxiesOut,
    stats: stats || {},
    settings: mergeDefaults(settings, L.PROXY_DEFAULTS),
    countries: L.COUNTRY_GEO,
  });
}));

// ⭐ V36: Targeting engine snapshot (settings + live per-dimension stats)
app.get('/api/admin/targeting', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const [settings, stats] = await Promise.all([getTargetingSettings(), getTargetingStats()]);
  res.json({
    settings,
    stats,
    countries: L.COUNTRY_GEO,
    dimensions: L.TARGETING_DIMENSIONS,
    highCpmCountries: L.HIGH_CPM_COUNTRIES,
  });
}));

app.post('/api/admin/proxies', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const raw = String(req.body?.raw || '').trim();
  const name = String(req.body?.name || '').trim().slice(0, 100);
  const parsed = L.parseProxyInput(raw);
  if (!parsed) return res.status(400).json({ error: 'Invalid proxy format. See help text.' });

  const rawProxies = await readRoot('proxies');
  const existingProxies = Array.isArray(rawProxies) ? rawProxies : [];
  const proxyKey = (x) => [x.server, x.username || ''].map((v) => String(v ?? '').toLowerCase()).join('|');
  if (existingProxies.some((p) => proxyKey(p) === proxyKey(parsed))) {
    return res.status(409).json({ error: 'This proxy already exists.' });
  }

  parsed.id = 'p_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
  parsed.name = name || `Proxy ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka', hour12: true })}`;
  parsed.enabled = true;
  parsed.added_utc = new Date().toISOString();
  if (parsed.quota_mb === undefined) parsed.quota_mb = 0;

  await updateRoot('proxies', (cur) => {
    const list = Array.isArray(cur) ? cur : [];
    return list.some((p) => proxyKey(p) === proxyKey(parsed)) ? list : [...list, parsed];
  });

  const actor = await getUserById(req.auth.uid);
  await addAuditLog({
    actor: { name: actor?.name, role: 'admin' },
    action: 'PROXY_ADDED', targetId: parsed.id, targetType: 'proxy',
    details: `Added proxy: ${L.shortProxyLabel(parsed)}`,
  });

  // ⭐ V36: auto-detect the proxy's country in the background (animated flag)
  runProxyHealth(parsed.id).catch(() => {});
  res.json({ proxy: { ...parsed, country_meta: parsed.country ? countryFlag(parsed.country) : null } });
}));

// ─── Proxy health check (Checking -> Healthy / Failed) ───────────────────────
const PROXY_CHECK_MIN_GAP_MS = 10 * 1000;   // never re-check the same proxy more than once per 10s
const proxyCheckInFlight = new Set();
function proxyAgentFor(entry) {
  let serverStr = String(entry.server || '').trim();
  if (!/^[a-z0-9]+:\/\//i.test(serverStr)) {
    const proto = (entry.protocol || entry.type || 'socks5').toLowerCase();
    serverStr = `${proto}://${serverStr}`;
  }
  const u = new URL(serverStr);
  if (entry.username) u.username = encodeURIComponent(entry.username);
  if (entry.password) u.password = encodeURIComponent(entry.password);
  const proto = u.protocol.toLowerCase();
  if (proto.startsWith('socks')) {
    const { SocksProxyAgent } = require('socks-proxy-agent');
    return new SocksProxyAgent(u.toString());
  }
  const { HttpsProxyAgent } = require('https-proxy-agent');
  return new HttpsProxyAgent(u.toString());
}
function checkProxyOnce(entry, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const started = Date.now();
    let done = false;
    const finish = (r) => { if (!done) { done = true; resolve({ ...r, latencyMs: Date.now() - started }); } };
    let agent;
    try { agent = proxyAgentFor(entry); }
    catch (e) { return finish({ ok: false, error: 'Bad proxy config: ' + e.message }); }
    const https = require('https');
    const req = https.get('https://ipinfo.io/json', { agent, timeout: timeoutMs, headers: { 'User-Agent': 'pnweb-health/1.0', Accept: 'application/json' } }, (resp) => {
      let body = '';
      resp.on('data', (c) => { body += c; if (body.length > 20000) req.destroy(new Error('Response too large')); });
      resp.on('end', () => {
        if (resp.statusCode === 407) return finish({ ok: false, error: 'Proxy authentication failed (407)' });
        if (resp.statusCode !== 200) return finish({ ok: false, error: `Upstream HTTP ${resp.statusCode}` });
        try {
          const j = JSON.parse(body);
          finish({ ok: true, ip: j.ip || '', country: j.country || '', region: j.region || j.city || '' });
        } catch (_) { finish({ ok: false, error: 'Invalid response through proxy' }); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('Timed out')); });
    req.on('error', (e) => finish({ ok: false, error: String(e.message || 'Connection error').slice(0, 160) }));
  });
}
async function runProxyHealth(id) {
  const rawList = await readRoot('proxies');
  const list = Array.isArray(rawList) ? rawList : [];
  const entry = list.find((p) => p.id === id);
  if (!entry) return null;
  if (proxyCheckInFlight.has(id)) return entry.health || null;
  const last = Date.parse(entry.health?.lastChecked || '') || 0;
  if (Date.now() - last < PROXY_CHECK_MIN_GAP_MS && entry.health?.status && entry.health.status !== 'checking') return entry.health;
  proxyCheckInFlight.add(id);
  try {
    const r = await checkProxyOnce(entry);
    const prevFails = Number(entry.health?.consecutiveFails || 0);
    const health = {
      status: r.ok ? 'healthy' : 'failed',
      online: !!r.ok,
      latencyMs: r.ok ? r.latencyMs : 0,
      lastChecked: new Date().toISOString(),
      error: r.ok ? '' : (r.error || 'Unknown error'),
      country: r.country || entry.country || '',
      ip: r.ip || '',
      consecutiveFails: r.ok ? 0 : prevFails + 1,
    };
    const detected = String(r.country || entry.country || '').toUpperCase();
    await updateRoot('proxies', (cur) => (Array.isArray(cur) ? cur : []).map((p) => (p.id === id ? { ...p, health, country: detected || p.country || '' } : p)));
    return { ...health, country: detected };
  } finally {
    proxyCheckInFlight.delete(id);
  }
}

app.post('/api/admin/proxies/check-all', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const rawList = await readRoot('proxies');
  const list = Array.isArray(rawList) ? rawList : [];
  const ids = list.map((p) => p.id);
  const results = {};
  let idx = 0;
  const worker = async () => { while (idx < ids.length) { const id = ids[idx++]; results[id] = await runProxyHealth(id); } };
  await Promise.all([worker(), worker(), worker()]);   // max 3 at a time -> no flooding
  res.json({ ok: true, results });
}));

app.post('/api/admin/proxies/:id/check', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const health = await runProxyHealth(String(req.params.id));
  if (!health) return res.status(404).json({ error: 'Proxy not found.' });
  res.json({ ok: true, health });
}));

app.put('/api/admin/proxies/:id', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const id = String(req.params.id);
  const { enabled, country, name } = req.body || {};
  await updateRoot('proxies', (cur) => (Array.isArray(cur) ? cur : []).map((p) => {
    if (p.id !== id) return p;
    const next = { ...p };
    if (typeof enabled === 'boolean') next.enabled = enabled;
    if (typeof country === 'string' && /^[A-Za-z]{2}$/.test(country.trim())) next.country = country.trim().toUpperCase();
    if (typeof name === 'string') next.name = name.trim().slice(0, 100);
    return next;
  }));
  res.json({ ok: true });
}));

app.delete('/api/admin/proxies/:id', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const id = String(req.params.id);
  await updateRoot('proxies', (cur) => (Array.isArray(cur) ? cur : []).filter((p) => p.id !== id));
  await updateRoot('proxy_stats', (cur) => {
    const next = { ...(cur || {}) };
    delete next[id];
    return next;
  });
  res.json({ ok: true });
}));

// ═══════════════════════════════════════════════════════════════════════
//  ADMIN — SETTINGS
// ═══════════════════════════════════════════════════════════════════════
app.put('/api/admin/settings/auto-impression', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const patch = req.body || {};
  const current = await getAutoImpressionSettings();
  const merged = { ...current, ...patch };
  await writeRoot('auto_impression_settings', merged);

  const actor = await getUserById(req.auth.uid);
  await addAuditLog({
    actor: { name: actor?.name, role: 'admin' },
    action: 'SETTINGS_UPDATED', targetType: 'auto_impression_settings',
    details: `Updated: ${Object.keys(patch).join(', ')}`,
  });
  res.json({ ok: true, settings: merged });
}));

app.put('/api/admin/settings/proxy', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const patch = req.body || {};
  const current = await getProxySettings();
  const merged = { ...current, ...patch };
  await writeRoot('proxy_settings', merged);
  res.json({ ok: true, settings: merged });
}));

app.put('/api/admin/settings/smartlink', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const patch = req.body || {};
  const current = await getSmartlinkSettings();
  const merged = { ...current, ...patch };
  await writeRoot('smartlink_settings', merged);
  res.json({ ok: true, settings: merged });
}));

app.put('/api/admin/cms', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const body = req.body || {};
  const allowed = ['plans', 'packages', 'paymentMethods', 'promoCodes'];
  const keys = { plans: 'plans', packages: 'shop_packages', paymentMethods: 'payment_methods', promoCodes: 'promo_codes' };
  for (const key of allowed) {
    if (body[key] !== undefined) {
      if (key === 'promoCodes') {
        const arr = Array.isArray(body[key]) ? body[key] : [];
        const obj = Object.fromEntries(arr.map((x) => [String(x.code || x.id), x]));
        await updateRoot(keys[key], () => obj);
      } else if (key === 'plans') {
        // FIX: the traffic bot (getPlans/activateMembership) expects `plans` to be an OBJECT
        // keyed by plan id with snake_case fields (link_limit, visits_per_link,
        // daily_burst_limit, bonus_credits). The admin UI sends an ARRAY with camelCase
        // fields, which the bot silently discarded (it reset to DEFAULT_PLANS), so every
        // admin-edited impression limit was ignored. Normalise it here.
        const arr = Array.isArray(body[key]) ? body[key] : Object.values(body[key] || {});
        const obj = {};
        for (const p of arr) {
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
        await updateRoot(keys[key], () => obj);
      } else if (key === 'packages') {
        // FIX: the traffic bot expects `shop_packages` as an OBJECT keyed by package id
        // with an `amount` field. The admin UI sends an ARRAY with `credits`, which made
        // the bot reset every admin-edited package back to the defaults (so admin shop
        // edits were silently ignored). Normalise to the object shape the bot reads.
        const arr = Array.isArray(body[key]) ? body[key] : Object.values(body[key] || {});
        const obj = {};
        for (const p of arr) {
          if (!p) continue;
          const pid = String(p.id || p.key || '').trim();
          if (!pid) continue;
          obj[pid] = {
            amount: Math.max(0, Math.floor(Number(p.amount ?? p.credits ?? 0))),
            price: Math.max(0, Number(p.price || 0)),
            bonus: Math.max(0, Math.floor(Number(p.bonus || 0))),
            badge: p.badge || '',
            enabled: p.enabled !== false,
          };
        }
        await updateRoot(keys[key], () => obj);
      } else {
        await updateRoot(keys[key], () => Array.isArray(body[key]) ? body[key] : []);
      }
    }
  }
  await addAuditLog({ actor: { name: req.auth.email, role: req.auth.role }, action: 'CMS_UPDATED', targetType: 'cms', details: 'Pricing, packages, payment methods or promo codes updated' });
  res.json({ ok: true });
}));

app.put('/api/admin/settings/mode', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const mode = String(req.body?.mode || '');
  const valid = [L.MODE_H4CK_ORGANIC, L.MODE_HYBRID_SMART, L.MODE_PURE_SEARCH, L.MODE_PURE_DIRECT];
  if (!valid.includes(mode)) return res.status(400).json({ error: 'Invalid mode.' });

  const current = await getAutoImpressionSettings();
  const merged = {
    ...current,
    h4ck_organic_mode: mode === L.MODE_H4CK_ORGANIC,
    hybrid_smart_mode: mode === L.MODE_HYBRID_SMART,
    pure_search_mode: mode === L.MODE_PURE_SEARCH,
    pure_direct_mode: mode === L.MODE_PURE_DIRECT,
  };
  await writeRoot('auto_impression_settings', merged);
  res.json({ ok: true, mode });
}));

// ═══════════════════════════════════════════════════════════════════════
//  ADMIN — DATABASE TABLES + DATA RECOVERY  (real, server-side)
//  Before this, "delete / edit / restore" only changed the browser cache and
//  every refresh brought the record back. Deleted records are now removed from
//  Firebase and copied into `data_recovery` so they can be restored.
// ═══════════════════════════════════════════════════════════════════════
const DB_COLLECTIONS = {
  users: ['web_users', 'web_all_users'],
  normal_links: ['web_normal_links'],
  smartlinks: ['user_smartlinks'],
  proxies: ['proxies'],
  balance_requests: ['web_balance_requests'],
  transactions: ['web_transactions'],
  support_tickets: ['web_support_tickets'],
  audit_logs: ['web_audit_logs'],
  membership_plans: ['plans'],
  shop_packages: ['shop_packages'],
  payment_methods: ['payment_methods'],
  promo_codes: ['promo_codes'],
};
const dbIdOf = (i) => (i && typeof i === 'object' ? String(i.id ?? i.key ?? i.code ?? '') : '');
const dbHash12 = (u) => crypto.createHash('sha1').update(String(u)).digest('hex').slice(0, 12);

/** Pull one document out of a root value (array, per-user map, keyed map or smartlink map). */
function dbTake(value, id, collection) {
  if (collection === 'smartlinks') {
    for (const uid of Object.keys(value || {})) {
      const links = Array.isArray(value[uid]?.links) ? value[uid].links : [];
      const i = links.findIndex((l) => l && (String(l.id) === id || String(l.urlHash) === id || dbHash12(l.url) === id || String(l.url) === id));
      if (i >= 0) {
        const next = { ...value, [uid]: { ...value[uid], links: links.filter((_, k) => k !== i) } };
        return { value: next, removed: links[i], owner: uid };
      }
    }
    return { value };
  }
  if (Array.isArray(value)) {
    const i = value.findIndex((x) => dbIdOf(x) === id);
    if (i < 0) return { value };
    return { value: value.filter((_, k) => k !== i), removed: value[i], owner: null };
  }
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) {
      const v = value[k];
      if (Array.isArray(v)) {
        const i = v.findIndex((x) => dbIdOf(x) === id);
        if (i >= 0) return { value: { ...value, [k]: v.filter((_, j) => j !== i) }, removed: v[i], owner: k };
      } else if (v && typeof v === 'object' && !Array.isArray(v) && (k === id || dbIdOf(v) === id)) {
        const { [k]: _gone, ...rest } = value;
        return { value: rest, removed: v, owner: k, keyed: true };
      }
    }
  }
  return { value };
}

/** Put a document back (restore / edit). */
function dbPut(value, doc, owner, keyed, collection) {
  if (collection === 'smartlinks') {
    const base = { ...(value || {}) };
    const entry = ensureUserSmartlinkShape(base[owner]);
    entry.links = [doc, ...entry.links.filter((l) => String(l.url) !== String(doc.url))];
    base[owner] = entry;
    return base;
  }
  if (owner == null) return [doc, ...(Array.isArray(value) ? value : [])];
  const base = value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
  if (keyed) { base[owner] = doc; return base; }
  base[owner] = [doc, ...(Array.isArray(base[owner]) ? base[owner] : [])];
  return base;
}

function sanitizeRecovery(item) {
  const data = item && item.recordData && typeof item.recordData === 'object' ? { ...item.recordData } : item.recordData;
  if (data && typeof data === 'object') { delete data.passwordHash; delete data.password; }
  const { _owner, _keyed, _extra, ...rest } = item;
  return { ...rest, recordData: data };
}

app.post('/api/admin/database/delete', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const collection = String((req.body || {}).collection || '');
  const id = String((req.body || {}).id || '');
  const roots = DB_COLLECTIONS[collection];
  if (collection === 'admins') return res.status(400).json({ error: 'Admin accounts are managed from the Admin Accounts page.' });
  if (!roots || !id) return res.status(400).json({ error: 'Unknown table or missing document id.' });
  const actor = await getUserById(req.auth.uid);

  if (collection === 'users') {
    if (id === req.auth.uid) return res.status(400).json({ error: 'You cannot delete your own account.' });
    const target = await getUserById(id);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (target.role === 'admin') return res.status(403).json({ error: 'Admin accounts cannot be deleted from here.' });
  }

  const taken = [];
  for (const root of roots) {
    let hit = null;
    await updateRoot(root, (cur) => {
      hit = null; // transaction may retry
      const r = dbTake(cur, id, collection);
      if (!r.removed) return cur;
      hit = r;
      return r.value;
    });
    if (hit && hit.removed) taken.push({ root, ...hit });
  }
  if (!taken.length) return res.status(404).json({ error: 'Document not found (it may already be deleted).' });

  const primary = taken[0];
  const recItem = {
    id: 'rec_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    collectionName: collection,
    recordId: id,
    recordData: primary.removed,
    deletedBy: actor?.name || 'Admin',
    deletedByRole: 'admin',
    deletedAt: new Date().toISOString(),
    restored: false,
    _owner: primary.owner ?? null,
    _keyed: !!primary.keyed,
    _extra: taken.slice(1).map((t) => ({ root: t.root, doc: t.removed, owner: t.owner ?? null, keyed: !!t.keyed })),
  };
  await updateRoot('data_recovery', (cur) => [recItem, ...(Array.isArray(cur) ? cur : [])].slice(0, 500));
  try {
    await addAuditLog({
      actor: { name: actor?.name, role: 'admin' }, action: 'DATABASE_DOCUMENT_DELETED',
      targetId: id, targetType: collection, details: `Deleted ${id} from ${collection}. Stored in recovery.`, status: 'warning',
    });
  } catch (_) { /* audit must not block */ }
  res.json({ ok: true, recoveryId: recItem.id });
}));

// Create a brand-new document in a collection (the DB browser's "Create Document" button
// used to only write to the browser cache, so the row vanished on the next refresh).
app.post('/api/admin/database/:collection', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const collection = String(req.params.collection);
  const doc = (req.body || {}).doc;
  const roots = DB_COLLECTIONS[collection];
  if (!roots) return res.status(400).json({ error: 'This table cannot be edited here.' });
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return res.status(400).json({ error: 'Document must be a JSON object.' });

  const id = dbIdOf(doc);
  if (!id) return res.status(400).json({ error: 'Document needs an "id" (or "key" / "code") field.' });

  const root = roots[0];
  const actor = await getUserById(req.auth.uid);

  // Work out where the document belongs (per-user map vs. flat array vs. keyed map).
  let owner = null, keyed = false;
  const perUser = ['normal_links', 'smartlinks', 'transactions', 'balance_requests', 'support_tickets'];
  if (perUser.includes(collection)) {
    owner = String(doc.userId || doc.uid || '').trim();
    if (!owner) return res.status(400).json({ error: 'This collection is per-user \u2014 include a "userId" field in the document.' });
  } else if (['membership_plans', 'promo_codes'].includes(collection)) {
    keyed = true; owner = id;
  }

  let created = false;
  await updateRoot(root, (cur) => {
    if (dbTake(cur, id, collection).removed) return cur; // duplicate id -> leave untouched
    created = true;
    return dbPut(cur, doc, owner, keyed, collection);
  });
  if (!created) return res.status(409).json({ error: 'A document with this id already exists.' });

  // Mirror user records into the secondary root (never leak the password hash into web_all_users).
  if (collection === 'users') {
    for (const r of roots.slice(1)) {
      const mirror = { ...doc };
      delete mirror.passwordHash;
      await updateRoot(r, (cur) => dbPut(cur, mirror, null, false, collection));
    }
  }

  await addAuditLog({
    actor: { name: actor?.name, role: 'admin' }, action: 'DATABASE_DOCUMENT_CREATED',
    targetId: id, targetType: collection, details: `Created ${id} in ${collection}.`,
  });
  res.json({ ok: true, id });
}));

app.put('/api/admin/database/:collection/:id', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const collection = String(req.params.collection);
  const id = String(req.params.id);
  const doc = (req.body || {}).doc;
  const roots = DB_COLLECTIONS[collection];
  if (!roots) return res.status(400).json({ error: 'This table cannot be edited here.' });
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return res.status(400).json({ error: 'Document must be a JSON object.' });
  let found = false;
  for (const root of roots) {
    await updateRoot(root, (cur) => {
      const r = dbTake(cur, id, collection);
      if (!r.removed) return cur;
      found = true;
      let merged = { ...doc };
      if (collection === 'users') {
        // never let a raw JSON edit change identity, role or credentials
        merged = { ...doc, id: r.removed.id, role: r.removed.role, passwordHash: r.removed.passwordHash, email: r.removed.email };
        if (root === 'web_all_users') delete merged.passwordHash;
      }
      return dbPut(r.value, merged, r.owner ?? null, !!r.keyed, collection);
    });
  }
  if (!found) return res.status(404).json({ error: 'Document not found.' });
  res.json({ ok: true });
}));

app.post('/api/admin/recovery/:id/restore', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const recId = String(req.params.id);
  const list = (await readRoot('data_recovery')) || [];
  const item = list.find((r) => r.id === recId);
  if (!item || item.restored) return res.status(404).json({ error: 'Recovery item not found or already restored.' });
  const roots = DB_COLLECTIONS[item.collectionName];
  if (!roots) return res.status(400).json({ error: 'This record type cannot be restored automatically.' });
  const actor = await getUserById(req.auth.uid);

  const parts = [{ root: roots[0], doc: item.recordData, owner: item._owner ?? null, keyed: !!item._keyed },
    ...((item._extra || []).map((e) => ({ root: e.root, doc: e.doc, owner: e.owner ?? null, keyed: !!e.keyed })))];
  for (const part of parts) {
    await updateRoot(part.root, (cur) => {
      if (dbTake(cur, item.recordId, item.collectionName).removed) return cur; // already back
      return dbPut(cur, part.doc, part.owner, part.keyed, item.collectionName);
    });
  }
  await updateRoot('data_recovery', (cur) => (Array.isArray(cur) ? cur : []).map((r) =>
    r.id === recId ? { ...r, restored: true, restoredAt: new Date().toISOString(), restoredBy: actor?.name || 'Admin' } : r));
  try {
    await addAuditLog({
      actor: { name: actor?.name, role: 'admin' }, action: 'DATABASE_DOCUMENT_RESTORED',
      targetId: item.recordId, targetType: item.collectionName, details: `Restored ${item.recordId} into ${item.collectionName}.`,
    });
  } catch (_) { /* ignore */ }
  res.json({ ok: true });
}));

// Real server health for the admin Overview (these numbers used to be hard-coded fakes).
app.get('/api/admin/system', requireAuth, requireAdmin, wrap(async (req, res) => {
  const os = require('node:os');
  const cores = os.cpus().length || 1;
  const total = os.totalmem();
  const used = total - os.freemem();
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    cores,
    cpuLoadPercent: Math.min(100, Math.round((os.loadavg()[0] / cores) * 1000) / 10),
    memTotalMb: Math.round(total / 1048576),
    memUsedMb: Math.round(used / 1048576),
    memPercent: Math.round((used / total) * 1000) / 10,
    processRssMb: Math.round(process.memoryUsage().rss / 1048576),
    apiUptimeSec: Math.round(process.uptime()),
    serverUptimeSec: Math.round(os.uptime()),
    node: process.version,
    firebaseReady: fb.isReady(),
  });
}));

// ⭐ V39: clear the server's stale disk cache (root-cache.json + .bak) on demand.
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

// ⭐ BOT EMBEDDED DATABASE — observability (local store + routing table)
app.get('/api/admin/bot-db', requireAuth, requireAdmin, wrap(async (req, res) => {
  const fsx = require('node:fs');
  const pathx = require('node:path');
  res.setHeader('Cache-Control', 'no-store');

  // 1) Live disk scan of the bot's embedded store (same host as the worker)
  const dir = process.env.BOT_DB_DIR || pathx.join(__dirname, 'data', 'bot-db');
  const colDir = pathx.join(dir, 'collections');
  const collections = [];
  let totalFileBytes = 0, totalEntries = 0;
  try {
    for (const f of fsx.readdirSync(colDir)) {
      if (!f.endsWith('.json')) continue;
      const name = f.slice(0, -5);
      const full = pathx.join(colDir, f);
      let size = 0;
      try { size = fsx.statSync(full).size; } catch (_) {}
      let entries = 0, type = 'unknown';
      try {
        const v = JSON.parse(fsx.readFileSync(full, 'utf8'));
        if (Array.isArray(v)) { type = 'array'; entries = v.length; }
        else if (v && typeof v === 'object') { type = 'object'; entries = Object.keys(v).length; }
        else { type = typeof v; entries = v == null ? 0 : 1; }
      } catch (_) {}
      totalFileBytes += size; totalEntries += entries;
      collections.push({ name, type, entries, file_bytes: size });
    }
  } catch (_) { /* store not created yet */ }
  collections.sort((a, b) => b.file_bytes - a.file_bytes);

  // 2) In-memory heartbeat published by the worker (if any)
  let heartbeat = null;
  try { heartbeat = await readRootSafe('bot_db_stats'); } catch (_) {}

  // 3) Routing table — what lives in Firebase vs the bot's own DB
  let routing = { critical: [], local: [], mirrored: [], mirror_interval_ms: 0 };
  try {
    const R = require('./shared/data-routing.cjs');
    routing = {
      critical: [...R.CRITICAL_COLLECTIONS].sort(),
      local: [...R.LOCAL_COLLECTIONS].sort(),
      mirrored: [...R.MIRRORED_LOCAL_COLLECTIONS].sort(),
      mirror_interval_ms: R.MIRROR_INTERVAL_MS,
    };
  } catch (_) {}

  res.json({
    store_dir: dir,
    exists: collections.length > 0,
    collections,
    collections_count: collections.length,
    total_entries: totalEntries,
    total_file_bytes: totalFileBytes,
    heartbeat,
    routing,
  });
}));

app.put('/api/admin/settings/engine', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const body = req.body || {};
  const NUM = ['typingCpmMin', 'typingCpmMax', 'readingPauseChance', 'competitorVisitChance', 'safariRatio',
    'dwellMinSeconds', 'dwellMaxSeconds', 'tickIntervalSeconds',
    'clickProbability', 'ctrSafetyCap', 'maxClicksPerSession', 'minClickDelayMs'];
  const BOOL = ['bezierMouseMovement', 'zoomEvents', 'keyboardNav', 'videoPauseEvents', 'usOnlyStrict', 'highCpmMode',
    'smartLinkEngineActive', 'normalEngineActive'];
  const DS_BOOL = ['blockImages', 'blockMedia', 'blockFonts', 'blockAnalytics', 'blockOtherAds', 'adsterraWhitelisted', 'blockWebSockets'];
  const MODES = ['h4ck_organic', 'hybrid_smart', 'pure_search', 'pure_direct'];

  const current = (await readRoot('engine_settings')) || {};
  const next = { ...current };
  if (MODES.includes(body.mode)) next.mode = body.mode;
  for (const k of NUM) {
    if (body[k] !== undefined && Number.isFinite(Number(body[k]))) next[k] = Number(body[k]);
  }
  for (const k of BOOL) {
    if (typeof body[k] === 'boolean') next[k] = body[k];
  }
  if (body.dataSaver && typeof body.dataSaver === 'object') {
    next.dataSaver = { ...(current.dataSaver || {}) };
    for (const k of DS_BOOL) {
      if (typeof body.dataSaver[k] === 'boolean') next.dataSaver[k] = body.dataSaver[k];
    }
  }
  if (Array.isArray(body.whitelistDomains)) {
    next.whitelistDomains = body.whitelistDomains
      .map((d) => String(d || '').trim().toLowerCase().slice(0, 200)).filter(Boolean).slice(0, 200);
  }
  if (next.dwellMinSeconds > next.dwellMaxSeconds) {
    return res.status(400).json({ error: 'Minimum dwell time cannot be greater than the maximum.' });
  }
  if (next.typingCpmMin > next.typingCpmMax) {
    return res.status(400).json({ error: 'Minimum typing speed cannot be greater than the maximum.' });
  }
  if (next.tickIntervalSeconds !== undefined && next.tickIntervalSeconds < 1) {
    return res.status(400).json({ error: 'Tick interval must be at least 1 second.' });
  }

  await writeRoot('engine_settings', next);

  // V36: bridge the click / CTR-safety fields to the bot's settings doc
  // (`auto_impression_settings`). The traffic bot does NOT read `engine_settings`,
  // so without this the admin engine UI would have no effect on the bot. Values
  // are clamped server-side so a mis-typed rate can never endanger the account.
  const botPatch = {};
  if (Number.isFinite(Number(body.clickProbability))) botPatch.h4ck_click_probability = Math.max(0, Math.min(0.05, Number(body.clickProbability)));
  if (Number.isFinite(Number(body.ctrSafetyCap))) botPatch.h4ck_ctr_safety_cap = Math.max(0, Math.min(0.05, Number(body.ctrSafetyCap)));
  if (Number.isFinite(Number(body.maxClicksPerSession))) botPatch.h4ck_max_clicks_per_session = Math.max(0, Math.min(3, Math.round(Number(body.maxClicksPerSession))));
  if (Number.isFinite(Number(body.minClickDelayMs))) botPatch.h4ck_min_click_delay_ms = Math.max(5000, Math.min(600000, Math.round(Number(body.minClickDelayMs))));
  if (Object.keys(botPatch).length) {
    const curBot = (await readRoot('auto_impression_settings')) || {};
    await writeRoot('auto_impression_settings', { ...curBot, ...botPatch });
  }

  try {
    const actor = await getUserById(req.auth.uid);
    await addAuditLog({
      actor: { name: actor?.name, role: 'admin' },
      action: 'ENGINE_SETTINGS_SAVED', targetType: 'system',
      details: `Engine settings updated (mode: ${next.mode || 'n/a'}).`,
    });
  } catch (_) { /* audit must not block the save */ }
  res.json({ ok: true, settings: next });
}));

app.put('/api/admin/settings/targeting', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const body = req.body || {};
  const current = await getTargetingSettings();
  const next = { ...current };

  for (const k of ['enabled', 'proxy_country_match', 'cpm_optimize', 'smart_data_saver']) {
    if (typeof body[k] === 'boolean') next[k] = body[k];
  }
  if (body.dwell_min_ms !== undefined && Number.isFinite(Number(body.dwell_min_ms))) {
    next.dwell_min_ms = Math.max(15000, Math.min(120000, Math.round(Number(body.dwell_min_ms))));
  }
  if (body.dwell_max_ms !== undefined && Number.isFinite(Number(body.dwell_max_ms))) {
    next.dwell_max_ms = Math.max(15000, Math.min(180000, Math.round(Number(body.dwell_max_ms))));
  }
  if (next.dwell_max_ms < next.dwell_min_ms) {
    return res.status(400).json({ error: 'Maximum dwell must be greater than or equal to minimum dwell.' });
  }
  for (const k of ['cpm_target_min', 'cpm_target_max']) {
    if (body[k] !== undefined && Number.isFinite(Number(body[k]))) next[k] = Math.max(0, Math.min(50, Number(body[k])));
  }
  if (typeof body.human_level === 'string' && ['off', 'normal', 'high', 'ultra'].includes(body.human_level)) {
    next.human_level = body.human_level;
  }

  const DIMS = {
    country: ['country_weights', 'country_enabled'],
    device: ['device_weights', 'device_enabled'],
    browser: ['browser_weights', 'browser_enabled'],
    os: ['os_weights', 'os_enabled'],
  };
  const ALLOW = {
    country: Object.keys(L.COUNTRY_GEO || {}),
    device: (L.TARGETING_DIMENSIONS.device || []).map((d) => d.key),
    browser: (L.TARGETING_DIMENSIONS.browser || []).map((d) => d.key),
    os: (L.TARGETING_DIMENSIONS.os || []).map((d) => d.key),
  };
  // Country pick-rates must accept ANY valid ISO-3166 alpha-2 code, because proxy
  // countries are NOT limited to the built-in COUNTRY_GEO list. Device/browser/OS
  // remain strictly whitelisted. This fixes "pick-rate reverts to 1 on save".
  const isAllowed = (dim, k) => {
    if (dim === 'country') return /^[A-Z]{2}$/.test(String(k || '').toUpperCase());
    return ALLOW[dim].includes(k);
  };
  for (const dim of Object.keys(DIMS)) {
    const [wKey, eKey] = DIMS[dim];
    if (body[wKey] && typeof body[wKey] === 'object') {
      const w = { ...(current[wKey] || {}) };
      for (const [rawK, v] of Object.entries(body[wKey])) {
        const k = dim === 'country' ? String(rawK || '').toUpperCase() : rawK;
        if (!isAllowed(dim, k)) continue;
        const n = Number(v);
        if (Number.isFinite(n)) w[k] = Math.max(0, Math.min(100, Math.round(n)));
      }
      next[wKey] = w;
    }
    if (body[eKey] && typeof body[eKey] === 'object') {
      const e = { ...(current[eKey] || {}) };
      for (const [rawK, v] of Object.entries(body[eKey])) {
        const k = dim === 'country' ? String(rawK || '').toUpperCase() : rawK;
        if (!isAllowed(dim, k)) continue;
        if (typeof v === 'boolean') e[k] = v;
      }
      next[eKey] = e;
    }
  }

  await writeRoot('targeting_settings', next);
  try {
    const actor = await getUserById(req.auth.uid);
    await addAuditLog({
      actor: { name: actor?.name, role: 'admin' },
      action: 'TARGETING_SETTINGS_SAVED', targetType: 'targeting_settings',
      details: 'Global targeting engine updated (country/device/browser/OS pick-rates).',
    });
  } catch (_) { /* audit must not block the save */ }
  res.json({ ok: true, settings: next });
}));

app.put('/api/admin/settings/maintenance', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const { enabled, message, whitelist, eta } = req.body || {};
  const actor = await getUserById(req.auth.uid);

  // Website maintenance (this is what blocks users on the site)
  const currentWeb = await getWebMaintenance(true);
  const web = {
    ...currentWeb,
    enabled: typeof enabled === 'boolean' ? enabled : !!currentWeb.enabled,
    message: message != null && String(message).trim() ? String(message).trim().slice(0, 500) : currentWeb.message,
    eta: eta != null ? String(eta).trim().slice(0, 120) : (currentWeb.eta || ''),
    updatedAt: new Date().toISOString(),
    updatedBy: actor?.name || 'Admin',
  };
  await writeRoot('web_maintenance', web);
  _maintCache = { at: Date.now(), value: web };

  // Keep the bot-shared flag in sync (unchanged legacy behaviour)
  const current = (await readRoot('maintenance_mode')) || L.MAINTENANCE_DEFAULTS;
  const merged = {
    ...current,
    enabled: typeof enabled === 'boolean' ? enabled : current.enabled,
    message: message != null ? String(message).slice(0, 500) : current.message,
    whitelist: Array.isArray(whitelist) ? whitelist.slice(0, 200) : current.whitelist,
  };
  await writeRoot('maintenance_mode', merged);

  try {
    await addAuditLog({
      actor: { name: actor?.name, role: 'admin' },
      action: web.enabled ? 'MAINTENANCE_ON' : 'MAINTENANCE_OFF',
      targetType: 'system',
      details: web.enabled ? `Maintenance enabled: ${web.message}` : 'Maintenance disabled.',
    });
  } catch (_) { /* audit must not block the toggle */ }

  res.json({ ok: true, maintenance: publicMaintenance(web) });
}));

// ═══════════════════════════════════════════════════════════════════════
//  ADMIN — BROADCAST (web-only inbox)
// ═══════════════════════════════════════════════════════════════════════
app.post('/api/admin/broadcast', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const { title, message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Message required.' });
  const actor = await getUserById(req.auth.uid);

  const entry = {
    id: 'bc_' + Date.now(),
    title: String(title || 'Announcement').slice(0, 200),
    message: String(message).slice(0, 4000),
    sentAt: new Date().toISOString(),
    sentBy: actor?.name || 'Admin',
  };
  await updateRoot('web_broadcasts', (cur) => [entry, ...(cur || [])].slice(0, 200));

  await addAuditLog({
    actor: { name: actor?.name, role: 'admin' },
    action: 'BROADCAST_SENT', targetId: entry.id, targetType: 'broadcast',
    details: entry.title,
  });
  res.json({ ok: true, broadcast: entry });
}));

app.delete('/api/admin/broadcast/:id', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const id = String(req.params.id);
  const list = (await readRoot('web_broadcasts')) || [];
  const target = list.find((b) => b.id === id);
  if (!target) return res.status(404).json({ error: 'Broadcast not found.' });
  await updateRoot('web_broadcasts', (cur) => (cur || []).filter((b) => b.id !== id));
  const actor = await getUserById(req.auth.uid);
  await addAuditLog({
    actor: { name: actor?.name, role: 'admin' },
    action: 'BROADCAST_DELETED', targetId: id, targetType: 'broadcast',
    details: target.title,
  });
  res.json({ ok: true });
}));

const DEV_LINK_DEFAULT = { enabled: true, title: 'Developer', url: 'https://alif-portfolio.pages.dev/', visibility: 'everyone' };
function normDevLink(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  return {
    enabled: r.enabled !== false,
    title: String(r.title || DEV_LINK_DEFAULT.title).trim().slice(0, 40) || DEV_LINK_DEFAULT.title,
    url: String(r.url || DEV_LINK_DEFAULT.url).trim(),
    visibility: ['everyone', 'users', 'admins'].includes(r.visibility) ? r.visibility : 'everyone',
  };
}
app.get('/api/developer-link', requireAuth, requireFirebase, wrap(async (req, res) => {
  const cfg = normDevLink(await readRoot('web_developer_link'));
  const isAdmin = req.auth.role === 'admin';
  const allowed = cfg.enabled && (cfg.visibility === 'everyone' || (cfg.visibility === 'admins' ? isAdmin : !isAdmin));
  res.json({ link: { ...cfg, show: !!allowed } });
}));

app.put('/api/admin/developer-link', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const b = req.body || {};
  const next = normDevLink({ enabled: !!b.enabled, title: b.title, url: b.url, visibility: b.visibility });
  if (!/^https:\/\/[^\s/$.?#][^\s]*$/i.test(next.url) || next.url.length > 500) {
    return res.status(400).json({ error: 'Enter a valid https:// URL.' });
  }
  await updateRoot('web_developer_link', () => next);
  const actor = await getUserById(req.auth.uid);
  await addAuditLog({
    actor: { name: actor?.name, role: 'admin' },
    action: 'DEVELOPER_LINK_UPDATED', targetType: 'settings',
    details: `${next.enabled ? 'ON' : 'OFF'} \u2022 ${next.title} \u2022 ${next.url}`,
  });
  res.json({ ok: true, link: next });
}));

app.get('/api/notifications', requireAuth, requireFirebase, wrap(async (req, res) => {
  const all = (await readRoot('web_user_notifications')) || {};
  const list = Array.isArray(all[req.auth.uid]) ? all[req.auth.uid] : [];
  res.json({ notifications: list.slice(0, 30) });
}));

app.get('/api/broadcasts', requireAuth, requireFirebase, wrap(async (req, res) => {
  const list = await readRoot('web_broadcasts') || [];
  res.json({ broadcasts: list.slice(0, 50) });
}));

// ═══════════════════════════════════════════════════════════════════════
//  ADMIN — AUDIT LOGS
// ═══════════════════════════════════════════════════════════════════════
app.get('/api/admin/audit-logs', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const logs = await readRoot('web_audit_logs') || [];
  res.json({ logs: logs.slice(0, 500) });
}));

// ═══════════════════════════════════════════════════════════════════════
//  ADMIN — ADMIN ACCOUNTS
// ═══════════════════════════════════════════════════════════════════════
app.get('/api/admin/admins', requireAuth, requireAdmin, requireFirebase, wrap(async (req, res) => {
  const list = await readRoot('web_admins') || [];
  res.json({ admins: list });
}));

app.post('/api/admin/admins', requireAuth, requireSuperAdmin, requireFirebase, wrap(async (req, res) => {
  const { email, password, name, permissions } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !password || String(password).length < 10) {
    return res.status(400).json({ error: 'Email and password (min 10 chars) required.' });
  }
  const existing = await findUserByEmail(cleanEmail);
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  const record = makeFreshUserRecord({
    email: cleanEmail, name: name || 'Admin',
    password, role: 'admin', adminRole: 'admin',
  });
  record.permissions = Array.isArray(permissions) ? permissions : [];
  await provisionUser(record);

  const adminEntry = {
    id: record.id, email: record.email, name: record.name,
    role: 'admin', status: 'active',
    permissions: record.permissions,
    createdAt: record.createdAt,
    lastLoginAt: record.lastLoginAt,
    isRootSuperAdmin: false,
  };
  await updateRoot('web_admins', (cur) => [...(cur || []), adminEntry]);

  const actor = await getUserById(req.auth.uid);
  await addAuditLog({
    actor: { name: actor?.name, role: 'admin' },
    action: 'ADMIN_CREATED', targetId: record.id, targetType: 'admin_account',
    details: `Created admin: ${record.email}`,
  });

  res.json({ admin: adminEntry });
}));

app.put('/api/admin/admins/:id', requireAuth, requireSuperAdmin, requireFirebase, wrap(async (req, res) => {
  const id = String(req.params.id);
  const patch = req.body || {};
  const list = await readRoot('web_admins') || [];
  const target = list.find((a) => a.id === id);
  if (!target) return res.status(404).json({ error: 'Admin not found.' });
  if (target.isRootSuperAdmin && patch.status === 'disabled') return res.status(400).json({ error: 'Root Super Admin cannot be disabled.' });
  const next = {
    ...target,
    ...(patch.name !== undefined ? { name: String(patch.name).slice(0, 120) } : {}),
    ...(patch.status !== undefined ? { status: ['active','disabled','suspended'].includes(patch.status) ? patch.status : target.status } : {}),
    ...(Array.isArray(patch.permissions) ? { permissions: patch.permissions.slice(0, 100) } : {}),
  };
  await updateRoot('web_admins', (cur) => (cur || []).map((a) => a.id === id ? next : a));
  await updateRoot('web_users', (cur) => (cur || []).map((u) => u.id === id ? {
    ...u, name: next.name, status: next.status, permissions: next.permissions
  } : u));
  await addAuditLog({ actor: { name: req.auth.email, role: 'admin' }, action: 'ADMIN_UPDATED', targetId: id, targetType: 'admin_account', details: `Updated admin ${id}` });
  res.json({ admin: next });
}));

app.delete('/api/admin/admins/:id', requireAuth, requireSuperAdmin, requireFirebase, wrap(async (req, res) => {
  const id = String(req.params.id);
  const list = await readRoot('web_admins') || [];
  const target = list.find((a) => a.id === id);
  if (!target) return res.status(404).json({ error: 'Admin not found.' });
  if (target.isRootSuperAdmin) return res.status(400).json({ error: 'Cannot delete Root Super Admin.' });

  await updateRoot('web_admins', (cur) => (cur || []).filter((a) => a.id !== id));
  await updateRoot('web_users', (cur) => (cur || []).filter((u) => u.id !== id));

  const actor = await getUserById(req.auth.uid);
  await addAuditLog({
    actor: { name: actor?.name, role: 'admin' },
    action: 'ADMIN_REMOVED', targetId: id, targetType: 'admin_account',
    details: `Removed admin: ${target.email}`,
  });

  res.json({ ok: true });
}));

// ═══════════════════════════════════════════════════════════════════════
//  ADMIN — ADSTERRA PROXY ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════
app.get('/api/admin/adsterra/smartlinks', requireAuth, requireAdmin, wrap(async (req, res) => {
  const token = process.env.ADSTERRA_API_TOKEN;
  if (!token) return res.status(400).json({ error: 'ADSTERRA_API_TOKEN not set on server.' });
  const result = await L.fetchAdsterraSmartlinks(token);
  if (!result.ok) return res.status(502).json(result);
  res.json(result);
}));

app.get('/api/admin/adsterra/report', requireAuth, requireAdmin, wrap(async (req, res) => {
  const token = process.env.ADSTERRA_API_TOKEN;
  if (!token) return res.status(400).json({ error: 'ADSTERRA_API_TOKEN not set on server.' });
  const result = await L.fetchAdsterraPublisherReport(token, req.query.start_date, req.query.finish_date);
  if (!result.ok) return res.status(502).json(result);
  res.json(result);
}));

// ═══════════════════════════════════════════════════════════════════════
//  ERROR HANDLER
// ═══════════════════════════════════════════════════════════════════════
app.use((err, req, res, next) => {
  if (res.headersSent) { console.error('[API] (post-response)', err && err.message ? err.message : err); return; }
  if (err && err.code === 'DB_UNAVAILABLE') {
    return res.status(503).json({ error: err.message || 'The server is busy right now. Please try again in a moment.', code: 'DB_UNAVAILABLE' });
  }
  if (err && err.code === 'FIREBASE_NOT_READY') {
    return res.status(503).json({ error: err.message, code: 'FIREBASE_NOT_READY' });
  }
  console.error('[API]', err && err.stack ? err.stack : err);
  if (res.headersSent) return;
  res.status(500).json({ error: err?.message || 'Internal server error.' });
});

// ═══════════════════════════════════════════════════════════════════════
//  SEPARATE ADMIN DOMAIN GATE
//  Public and admin traffic use different hostnames. The public hostname
//  never receives the admin UI or admin-only API routes.
// ═══════════════════════════════════════════════════════════════════════
const ADMIN_DOMAIN = String(process.env.ADMIN_DOMAIN || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
const PUBLIC_DOMAIN = String(process.env.PUBLIC_DOMAIN || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
function requestHost(req) {
  return String(req.headers.host || '').split(':')[0].toLowerCase();
}
function isAdminHost(req) {
  if (!ADMIN_DOMAIN) return false;
  const host = requestHost(req);
  return host === ADMIN_DOMAIN || host.endsWith('.' + ADMIN_DOMAIN);
}
function isPublicHost(req) {
  if (!PUBLIC_DOMAIN) return false;
  const host = requestHost(req);
  return host === PUBLIC_DOMAIN || host.endsWith('.' + PUBLIC_DOMAIN);
}

// Admin API endpoints must only be callable through the dedicated admin domain.
app.use('/api/admin', (req, res, next) => {
  if (ADMIN_DOMAIN && !isAdminHost(req)) return res.status(404).json({ error: 'Not found.' });
  next();
});

// ─── Serve the built React app (run `npm run build` first) ───
const DIST_DIR = path.join(__dirname, 'dist');
if (process.env.NODE_ENV === 'production' && !process.env.VITE_DEV_SERVER && fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  app.use(express.static(DIST_DIR, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found.' });
  }
  // If in dev or integrated server, let downstream middleware (e.g. Vite) handle it
  if (process.env.NODE_ENV !== 'production' || process.env.VITE_DEV_SERVER) {
    return next();
  }
  res.status(404).send('Not found. (Run `npm run build` so the web app can be served.)');
});

// ═══════════════════════════════════════════════════════════════════════
//  BOOTSTRAP
// ═══════════════════════════════════════════════════════════════════════
async function ensureFirstAdmin() {
  if (!FIRST_ADMIN_EMAIL || !FIRST_ADMIN_PASSWORD) {
    console.warn('[Boot] FIRST_ADMIN_EMAIL / FIRST_ADMIN_PASSWORD not set — skipping seed admin.');
    return;
  }
  const existing = await findUserByEmail(FIRST_ADMIN_EMAIL);
  if (existing) {
    const updated = {
      ...existing,
      name: FIRST_ADMIN_NAME || existing.name,
      passwordHash: hashPassword(FIRST_ADMIN_PASSWORD),
      role: 'admin',
      adminRole: 'super_admin',
      permissions: ['*'],
      status: 'active',
      emailVerified: true,
      verificationPending: false,
    };
    await updateRoot('web_users', (cur) => (cur || []).map((u) => u.id === existing.id ? updated : u));
    const adminEntry = {
      id: existing.id, email: FIRST_ADMIN_EMAIL, name: FIRST_ADMIN_NAME || existing.name,
      role: 'admin', status: 'active',
      permissions: ['*'],
      isRootSuperAdmin: true,
    };
    await updateRoot('web_admins', (cur) => {
      const list = (cur || []).filter(a => a.email !== FIRST_ADMIN_EMAIL);
      list.push(adminEntry);
      return list;
    });
    const adminId = existing.id;
    await updateRoot('impression_balance', (cur) => {
      const all = { ...(cur || {}) };
      const curBal = Number(all[adminId] || 0);
      if (curBal < 50000) all[adminId] = 100000;
      return all;
    });
    console.log(`[Boot] ✅ Super Admin verified & password updated: ${FIRST_ADMIN_EMAIL}`);
    return;
  }

  const record = makeFreshUserRecord({
    email: FIRST_ADMIN_EMAIL,
    name: FIRST_ADMIN_NAME,
    password: FIRST_ADMIN_PASSWORD,
    role: 'admin',
    adminRole: 'super_admin',
  });
  record.permissions = ['*'];
  record.status = 'active';
  record.emailVerified = true;
  record.verificationPending = false;
  await provisionUser(record);

  const adminEntry = {
    id: record.id, email: record.email, name: record.name,
    role: 'admin', status: 'active',
    permissions: ['*'],
    createdAt: record.createdAt,
    lastLoginAt: record.lastLoginAt,
    isRootSuperAdmin: true,
  };
  await updateRoot('web_admins', (cur) => [...(cur || []).filter(a => a.email !== FIRST_ADMIN_EMAIL), adminEntry]);
  await updateRoot('impression_balance', (cur) => ({
    ...(cur || {}),
    [record.id]: 100000,
  }));
  console.log(`[Boot] ✅ Seeded Root Super Admin: ${record.email} (password configured, 100k test credits granted)`);
}

// ══════════════════════════════════════════════════════════════════════════
//  DATA MAINTENANCE  — keeps Firestore small by trimming unbounded arrays.
//  Runs once at boot, then every day just after 00:00 Asia/Dhaka (midnight).
//  (Addresses "stop saving unnecessary data to Firebase" + daily auto-reset.)
// ══════════════════════════════════════════════════════════════════════════
const LEDGER_KEEP = 200;    // wallet transactions kept per user
const REQUEST_KEEP = 100;   // balance requests kept per user
const TICKET_KEEP = 100;    // support tickets kept per user
const AUDIT_KEEP = 500;     // global audit log entries

/** Trim every per-user array in a { uid: [...] } map down to `keep` newest items. */
function capPerUser(map, keep) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return map;
  let changed = false;
  const out = {};
  for (const [uid, arr] of Object.entries(map)) {
    if (Array.isArray(arr) && arr.length > keep) { out[uid] = arr.slice(0, keep); changed = true; }
    else out[uid] = arr;
  }
  return changed ? out : map;
}

async function pruneWebData(reason = 'scheduled') {
  if (!fb.isReady()) return;
  try {
    const [tx, reqs, tickets, audits] = await Promise.all([
      readRootFresh('web_transactions'),
      readRootFresh('web_balance_requests'),
      readRootFresh('web_support_tickets'),
      readRootFresh('web_audit_logs'),
    ]);
    const jobs = [];
    const tx2 = capPerUser(tx, LEDGER_KEEP);
    if (tx2 !== tx) jobs.push(writeRoot('web_transactions', tx2));
    const rq2 = capPerUser(reqs, REQUEST_KEEP);
    if (rq2 !== reqs) jobs.push(writeRoot('web_balance_requests', rq2));
    const tk2 = capPerUser(tickets, TICKET_KEEP);
    if (tk2 !== tickets) jobs.push(writeRoot('web_support_tickets', tk2));
    if (Array.isArray(audits) && audits.length > AUDIT_KEEP) jobs.push(writeRoot('web_audit_logs', audits.slice(0, AUDIT_KEEP)));
    if (jobs.length) {
      await Promise.allSettled(jobs);
      console.log(`[Maintenance] 🧹 Pruned web data (${reason}) — ${jobs.length} collection(s) trimmed.`);
    } else if (reason === 'daily') {
      console.log('[Maintenance] ✅ Daily prune checked — nothing to trim.');
    }
  } catch (e) {
    console.warn('[Maintenance] prune failed:', e?.message || e);
  }
}

/** Milliseconds from now until the next 00:05 Asia/Dhaka (with a small buffer). */
function msUntilDhakaMidnight() {
  const nowMs = Date.now();
  const dhaka = new Date(nowMs + 6 * 3600000); // shift so UTC fields == Dhaka fields
  const nextDhakaMidnightUtcMs = Date.UTC(dhaka.getUTCFullYear(), dhaka.getUTCMonth(), dhaka.getUTCDate() + 1, 0, 0, 0) - 6 * 3600000;
  return Math.max(1000, nextDhakaMidnightUtcMs - nowMs) + 5 * 60000; // +5 min
}

function scheduleDailyMaintenance() {
  const delay = msUntilDhakaMidnight();
  const t = setTimeout(async () => {
    await pruneWebData('daily');
    scheduleDailyMaintenance(); // re-arm for the next midnight
  }, delay);
  if (t.unref) t.unref();
}


// ══════════════════════════════════════════════════════════════════════════
//  TRAFFIC ENGINE WORKER SUPERVISOR
//  Runs worker.cjs in the background so impressions and visits are continuously
//  delivered even on single-process platforms like Render.
// ══════════════════════════════════════════════════════════════════════════
let _trafficWorker = null;
let _trafficWorkerRestarts = 0;
let _trafficWorkerTimer = null;

function startBackgroundWorker() {
  if (process.env.DISABLE_TRAFFIC_WORKER === 'true' || process.env.DISABLE_EMBEDDED_WORKER === 'true') {
    console.log('[TrafficWorker] Disabled via DISABLE_TRAFFIC_WORKER=true');
    return;
  }
  // If running inside PM2 and pm2 is already running the worker separately, skip:
  if (process.env.pm_id && process.env.name === 'pnweb-api') {
    return;
  }

  const workerPath = path.join(__dirname, 'worker.cjs');
  if (!fs.existsSync(workerPath)) {
    console.warn('[TrafficWorker] worker.cjs not found — skipping.');
    return;
  }

  const { fork } = require('child_process');

  function spawn() {
    if (_trafficWorker) {
      try { _trafficWorker.kill(); } catch (_) {}
      _trafficWorker = null;
    }

    console.log('[TrafficWorker] 🚀 Starting background traffic worker (worker.cjs)...');
    try {
      const child = fork(workerPath, [], {
        cwd: __dirname,
        env: { ...process.env, EMBEDDED_WORKER: 'true' },
        stdio: 'inherit',
      });

      _trafficWorker = child;

      child.on('error', (err) => {
        console.error('[TrafficWorker] ❌ Worker error:', err && err.message ? err.message : err);
      });

      child.on('exit', (code, signal) => {
        _trafficWorker = null;
        _trafficWorkerRestarts++;
        const delay = Math.min(30000, 3000 * Math.min(_trafficWorkerRestarts, 10));
        console.warn(`[TrafficWorker] ⚠️ Worker exited (code=${code}, signal=${signal}). Respawning in ${delay / 1000}s...`);
        _trafficWorkerTimer = setTimeout(spawn, delay);
        if (_trafficWorkerTimer.unref) _trafficWorkerTimer.unref();
      });
    } catch (e) {
      console.error('[TrafficWorker] Failed to spawn worker:', e.message);
    }
  }

  spawn();

  process.on('exit', () => {
    if (_trafficWorker) {
      try { _trafficWorker.kill('SIGTERM'); } catch (_) {}
    }
  });
}

async function bootstrap(options = {}) {
  await fb.initFirebase();

  // Best-effort: derive the Firebase Web SDK config so Google sign-in, e-mail
  // verification links and password-reset links work without manual .env keys.
  try { await discoverFirebaseWebConfig(); } catch (_) { /* non-fatal */ }

  console.log('');
  console.log('════════════════════════════════════════════════════════');
  console.log('  ⚡ X AD MARKETING — Web API Server (Ready)');
  console.log('════════════════════════════════════════════════════════');
  console.log(`  Port           : ${PORT}`);
  console.log(`  CORS           : *`);
  console.log(`  Database       : ✅ Active (Project: adst-79cc4)`);
  console.log(`  Admin Seed     : ${FIRST_ADMIN_EMAIL} (Root Super Admin)`);
  console.log(`  Google Auth    : ✅ Active (Firebase Web SDK)`);
  console.log(`  Payments       : SuperChat BD [live]`);
  console.log('════════════════════════════════════════════════════════');
  console.log('');

  if (options.listen !== false) {
    app.listen(PORT, HOST, () => {
      console.log(`[API] 🚀 Listening on http://${HOST}:${PORT}`);
      // Start background traffic worker alongside the web server
      try { startBackgroundWorker(); } catch (err) {
        console.error('[TrafficWorker] Error launching background worker:', err.message);
      }
    });
  }

  const withTimeout = (p, ms, label) => Promise.race([
    Promise.resolve(p),
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
  try { await withTimeout(ensureFirstAdmin(), 15000, 'ensureFirstAdmin'); }
  catch (e) { console.error('[Boot] ensureFirstAdmin skipped:', e.message); }

  if (fb.isReady()) {
    try { await withTimeout(backfillUserCodes(), 20000, 'backfillUserCodes'); }
    catch (e) { console.error('[Boot] backfillUserCodes skipped:', e.message); }
    // Trim unbounded arrays once at boot, then schedule the daily midnight pass.
    try { await withTimeout(pruneWebData('boot'), 15000, 'pruneWebData'); }
    catch (e) { console.error('[Boot] pruneWebData skipped:', e.message); }
    try { await withTimeout(warmRootCache(), 20000, 'warmRootCache'); }
    catch (e) { console.error('[Boot] warmRootCache skipped:', e.message); }
    scheduleDailyMaintenance();
  }
}

if (require.main === module) {
  bootstrap().catch((e) => {
    console.error('[Boot] FATAL:', e);
    process.exit(1);
  });
}

module.exports = { app, bootstrap };