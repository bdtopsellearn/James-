'use strict';

/**
 * ⚡ PN AD NETWORK ⚡ — SuperChat BD payment configuration
 *
 * Single source of truth for every SuperChat BD / payment setting.
 * Reads process.env lazily (via loadPaymentConfig()) so it always sees the
 * values that api-server.cjs loaded from .env at boot.
 *
 * SECURITY: the API key and webhook secret live ONLY here (from env) and are
 * never written to the database, never logged and never sent to a browser.
 * The admin config endpoint only ever returns a masked hint.
 */

function _str(v, d = '') { return String(v == null ? d : v).trim(); }
function _num(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function _bool(v, d = false) {
  if (v == null || v === '') return d;
  const s = String(v).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'enabled', 'live'].includes(s);
}
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

/**
 * Normalise APP_URL down to a bare origin (scheme://host[:port]).
 *
 * The success/cancel/webhook URLs are built by appending real PATHS
 * (/payment/success/:id, /api/webhooks/superchat) to this value, so any path,
 * query or hash fragment in APP_URL would corrupt them. A very common misconfig
 * is copy-pasting the SPA URL including its hash route — e.g.
 * "http://host:3001/#/overview" — which previously produced broken callback
 * URLs like ".../#/overview/payment/success/xxx" and silently broke instant
 * top-ups. This strips all of that back to the origin.
 */
function normalizeAppUrl(raw) {
  const s = _str(raw, '');
  if (!s) return '';
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`.replace(/\/+$/, '');
  } catch (_) {
    // Fallback for values the URL parser rejects: drop hash, query, trailing slash.
    return s.replace(/#.*$/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  }
}

function loadPaymentConfig() {
  const environment = (_str(process.env.SUPERCHAT_ENVIRONMENT, 'test') || 'test').toLowerCase();
  const baseUrl = (_str(process.env.SUPERCHAT_BASE_URL, 'https://api.superchatbd.com') || 'https://api.superchatbd.com').replace(/\/+$/, '');
  const apiKey = _str(process.env.SUPERCHAT_API_KEY, '');
  const webhookSecret = _str(process.env.SUPERCHAT_WEBHOOK_SECRET, '');
  const appUrl = normalizeAppUrl(_str(process.env.APP_URL, ''));
  // Optional dedicated base for the browser redirect URLs (success/cancel). Lets an
  // operator point callbacks at an HTTPS domain while APP_URL stays as the origin.
  const redirectBaseUrl = normalizeAppUrl(_str(process.env.PAYMENT_REDIRECT_BASE_URL, '')) || appUrl;
  const expirationMinutes = Math.max(5, Math.min(10080, _num(process.env.PAYMENT_EXPIRATION_MINUTES, 60)));
  const timeoutMs = Math.max(3000, _num(process.env.SUPERCHAT_TIMEOUT_MS, 15000));
  const webhookToleranceSec = Math.max(0, _num(process.env.SUPERCHAT_WEBHOOK_TOLERANCE, 300));
  const currency = (_str(process.env.PAYMENT_CURRENCY, 'BDT') || 'BDT').toUpperCase();
  const minAmount = Math.max(1, _num(process.env.PAYMENT_MIN_AMOUNT, 10));
  const maxAmount = Math.max(0, _num(process.env.PAYMENT_MAX_AMOUNT, 0)); // 0 = no limit
  const isLive = /^sk_live_/i.test(apiKey) || environment === 'live' || environment === 'production';
  return {
    environment,
    isLive,
    baseUrl,
    apiKey,
    apiKeySet: !!apiKey,
    webhookSecret,
    webhookSecretSet: !!webhookSecret,
    appUrl,
    redirectBaseUrl,
    expirationMinutes,
    timeoutMs,
    webhookToleranceSec,
    currency,
    minAmount,
    maxAmount,
    webhookPath: '/api/webhooks/superchat',
    events: ['payment.created', 'payment.completed', 'payment.refunded'],
  };
}

/** Masked hint for the admin UI — never the real key. */
function apiKeyHint(key) {
  const k = _str(key, '');
  if (!k) return '';
  return k.length <= 8 ? '••••' : '••••' + k.slice(-4);
}

/**
 * Resolve the public base URL used for success/cancel URLs.
 * Prefers APP_URL; otherwise derives it from the incoming request so the
 * system still works before APP_URL is configured (e.g. behind a proxy).
 */
function resolveAppUrl(cfg, req) {
  if (cfg && cfg.appUrl) return cfg.appUrl;
  try {
    const proto = _str(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
      || (req.secure ? 'https' : 'http');
    const host = _str(req.headers['x-forwarded-host'] || req.headers.host || '');
    if (host) return `${proto}://${host}`.replace(/\/+$/, '');
  } catch (_) { /* ignore */ }
  return '';
}

module.exports = { loadPaymentConfig, apiKeyHint, resolveAppUrl, round2, _str, _num, _bool };
