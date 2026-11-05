/**
 * ══════════════════════════════════════════════════════════════════════════════
 *   ⚡ PN AD NETWORK ⚡  |  ALIF_H4CK ⚡  |  DATA ROUTING LAYER
 * ══════════════════════════════════════════════════════════════════════════════
 *   shared/data-routing.cjs
 *
 *   Decides WHERE each bot collection is persisted:
 *
 *     • CRITICAL  → Firebase Firestore (shared with the web app + admin panel,
 *                   must be real-time and durable). Written on every change.
 *
 *     • LOCAL     → the bot's own embedded database (services/botDatabase.cjs).
 *                   These are high-frequency telemetry / analytics collections.
 *                   They are written locally (fast, zero Firestore quota) and
 *                   a *throttled mirror* is pushed to Firestore so the web
 *                   dashboards still receive fresh-enough data.
 *
 *   This is what the user asked for: "only necessary data goes to Firebase,
 *   less-important data goes to the bot's own database".
 * ══════════════════════════════════════════════════════════════════════════════
 */

'use strict';

// ── Collections that MUST live in Firebase (web app depends on them) ─────────
const CRITICAL_COLLECTIONS = new Set([
  // identity / accounts
  'extra_admins', 'user_info', 'user_links', 'users', 'user_settings',
  'banned_users', 'captcha_verified', 'web_users', 'web_admins',
  // money / membership
  'membership', 'balance', 'impression_balance', 'reporting_credits',
  'plans', 'shop_packages', 'payment_methods', 'payment_settings',
  'balance_requests', 'impression_purchases',
  // proxies (admin manages these; targeting depends on them)
  'proxies', 'proxy_settings',
  // links / smartlinks
  'user_smartlinks', 'user_smartlink_stats', 'smartlink_settings',
  // engine control (web writes these, worker reads them live)
  'auto_impression_settings', 'auto_impression_running',
  'impression_targets', 'impression_target_progress', 'impression_target_modes',
  'targeting_settings', 'maintenance_mode', 'history_clear_state',
  // misc shared config / messaging
  'settings', 'support_messages', 'referrals', 'promo_codes',
  'join_check_settings', 'auto_broadcast_settings', 'bot_lifecycle',
  'human_behavior', 'web_user_notifications', 'web_worker_control',
  // aggregate headline stats (dashboard top cards)
  'stats',
]);

// ── High-frequency / low-importance telemetry → bot embedded DB ──────────────
const LOCAL_COLLECTIONS = new Set([
  'live_impression_log',       // written on EVERY impression
  'hourly_impression_log',     // written very frequently
  'impression_history',        // rolling history
  'visit_logs',                // per-visit detail
  'normal_link_stats',         // per-visit counters
  'targeting_stats',           // device/browser/os/country counters (per impression)
  'smartlink_daily_visits',    // per-visit daily buckets
  'proxy_stats',               // per-proxy usage counters
  'h4ck_organic_stats',        // engine-internal counters
  'impression_confirmations',  // transient confirmations
]);

// ── Collections that should be MIRRORED to Firebase on a throttle ────────────
// (the web app reads these, so we still push them — just far less often)
const MIRRORED_LOCAL_COLLECTIONS = new Set([
  'live_impression_log',
  'hourly_impression_log',
  'impression_history',
  'targeting_stats',
  'smartlink_daily_visits',
  'proxy_stats',
  'normal_link_stats',
  'visit_logs',
  'h4ck_organic_stats',
]);

function routeFor(collection) {
  if (CRITICAL_COLLECTIONS.has(collection)) return 'firebase';
  if (LOCAL_COLLECTIONS.has(collection)) return 'local';
  // Unknown collections default to LOCAL so we never accidentally burn quota.
  return 'local';
}

function isCritical(collection) {
  return routeFor(collection) === 'firebase';
}

function isLocal(collection) {
  return routeFor(collection) === 'local';
}

function shouldMirror(collection) {
  return MIRRORED_LOCAL_COLLECTIONS.has(collection);
}

// Default mirror interval (ms). Overridable via env BOT_DB_MIRROR_MS.
const MIRROR_INTERVAL_MS = Number(process.env.BOT_DB_MIRROR_MS || 45000);

module.exports = {
  CRITICAL_COLLECTIONS,
  LOCAL_COLLECTIONS,
  MIRRORED_LOCAL_COLLECTIONS,
  MIRROR_INTERVAL_MS,
  routeFor,
  isCritical,
  isLocal,
  shouldMirror,
};
