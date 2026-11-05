'use strict';

/**
 * ⚡ PN AD NETWORK ⚡ — SuperChat BD API service
 *
 * Thin, dependency-free wrapper around the CURRENT official SuperChat BD
 * Developer API (verified against the live OpenAPI spec at
 * https://api.superchatbd.com/openapi.json and the official SDK README).
 *
 * Endpoints used (all under SUPERCHAT_BASE_URL, default https://api.superchatbd.com):
 *   POST   /api/v1/payments                 create a payment session (hosted checkout)
 *   GET    /api/v1/payments/:id             fetch one payment (server-side verification)
 *   GET    /api/v1/payments                 list payments
 *   POST   /api/v1/payments/:id/refund      refund a paid payment
 *   POST   /api/v1/webhooks                 register a webhook subscription
 *   GET    /api/v1/webhooks                 list subscriptions
 *   DELETE /api/v1/webhooks/:id             delete a subscription
 *   POST   /api/v1/webhooks/:id/test        send a test delivery
 *   POST   /api/v1/checkout/:id/simulate    simulate a test payment (test sessions only)
 *   POST   /api/v1/checkout/:id/pay         pay a checkout session
 *
 * Auth: Authorization: Bearer <key>  (also sent as x-api-key for compatibility)
 * Idempotency-Key header is supported on create/refund (cached 24h by SuperChat).
 *
 * SECURITY: the API key is only ever used here, server-side. It is never
 * logged and never returned to a client.
 */

const crypto = require('crypto');

class SuperchatApiError extends Error {
  constructor(message, status, code, body) {
    super(message || 'SuperChat API error');
    this.name = 'SuperchatApiError';
    this.status = Number(status) || 0;
    this.code = code || 'SUPERCHAT_ERROR';
    this.body = body || null;
    this.isSuperchat = true;
  }
}

function _safeJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { return null; }
}

function createSuperchatService(cfg, logger = console) {
  const baseUrl = String(cfg.baseUrl || 'https://api.superchatbd.com').replace(/\/+$/, '');
  const apiKey = String(cfg.apiKey || '').trim();
  const timeoutMs = Number(cfg.timeoutMs) || 15000;

  async function request(method, path, opts = {}) {
    if (!apiKey) {
      throw new SuperchatApiError('SuperChat API key is not configured.', 0, 'NO_API_KEY');
    }
    let url = baseUrl + path;
    if (opts.query && Object.keys(opts.query).length) {
      const qs = new URLSearchParams(opts.query).toString();
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'x-api-key': apiKey,
      Accept: 'application/json',
    };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.idempotencyKey) headers['Idempotency-Key'] = String(opts.idempotencyKey);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res, text;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
      text = await res.text();
    } catch (e) {
      const aborted = e && (e.name === 'AbortError');
      throw new SuperchatApiError(
        aborted ? `SuperChat request timed out after ${timeoutMs}ms` : `SuperChat network error: ${e && e.message ? e.message : e}`,
        0,
        aborted ? 'TIMEOUT' : 'NETWORK',
      );
    } finally {
      clearTimeout(timer);
    }

    const data = _safeJson(text);
    if (!res.ok) {
      const rawMsg = (data && (data.message || data.error || data.detail)) || `SuperChat API error (HTTP ${res.status})`;
      const msg = typeof rawMsg === 'string' ? rawMsg : JSON.stringify(rawMsg);
      throw new SuperchatApiError(msg, res.status, (data && data.code) || `HTTP_${res.status}`, data);
    }
    return data;
  }

  return {
    baseUrl,
    environment: cfg.environment,
    isLive: !!cfg.isLive,

    /** Create a payment session. Returns the provider payment object (id, checkoutUrl, status, ...). */
    createPayment(payload, idempotencyKey) {
      return request('POST', '/api/v1/payments', { body: payload, idempotencyKey });
    },
    getPayment(id) {
      return request('GET', `/api/v1/payments/${encodeURIComponent(id)}`);
    },
    listPayments({ page = 1, limit = 20, status } = {}) {
      const query = { page: String(page), limit: String(limit) };
      if (status) query.status = String(status);
      return request('GET', '/api/v1/payments', { query });
    },
    refundPayment(id, reason, idempotencyKey) {
      return request('POST', `/api/v1/payments/${encodeURIComponent(id)}/refund`, {
        body: { reason: reason || 'Refund requested by merchant' },
        idempotencyKey,
      });
    },
    createWebhook({ url, events, appId }) {
      return request('POST', '/api/v1/webhooks', { body: { url, events, ...(appId ? { appId } : {}) } });
    },
    listWebhooks() {
      return request('GET', '/api/v1/webhooks');
    },
    deleteWebhook(id) {
      return request('DELETE', `/api/v1/webhooks/${encodeURIComponent(id)}`);
    },
    testWebhook(id) {
      return request('POST', `/api/v1/webhooks/${encodeURIComponent(id)}/test`, { body: {} });
    },
    simulateCheckout(id, outcome) {
      const body = {};
      if (outcome) body.status = outcome;
      return request('POST', `/api/v1/checkout/${encodeURIComponent(id)}/simulate`, { body });
    },
    payCheckout(id, body) {
      return request('POST', `/api/v1/checkout/${encodeURIComponent(id)}/pay`, { body: body || {} });
    },
  };
}

/**
 * Verify a SuperChat webhook signature.
 * Header format:  x-superchat-signature: t=<unix-seconds>,v1=<hex hmac>
 * Signed payload: `${t}.${rawBody}`  (HMAC-SHA256, hex)
 * Mirrors SuperChat's own /api/v1/webhooks/verify endpoint exactly.
 */
function verifyWebhookSignature({ rawBody, signatureHeader, secret, toleranceSec = 300 }) {
  if (!secret) return { ok: false, reason: 'missing_secret' };
  if (!signatureHeader) return { ok: false, reason: 'missing_signature' };
  const parts = {};
  for (const kv of String(signatureHeader).split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return { ok: false, reason: 'malformed_signature' };
  const ts = Number(t);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad_timestamp' };
  if (Number(toleranceSec) > 0) {
    const age = Math.abs(Date.now() / 1000 - ts);
    if (age > Number(toleranceSec)) return { ok: false, reason: 'timestamp_out_of_tolerance', age: Math.round(age) };
  }
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected, 'hex');
  let b;
  try { b = Buffer.from(String(v1), 'hex'); } catch (_) { return { ok: false, reason: 'signature_mismatch' }; }
  if (!a.length || a.length !== b.length) return { ok: false, reason: 'signature_mismatch' };
  let ok = false;
  try { ok = crypto.timingSafeEqual(a, b); } catch (_) { ok = false; }
  return { ok, reason: ok ? 'ok' : 'signature_mismatch' };
}

/** SHA-256 hex of a raw payload — used for webhook dedupe / event payload_hash. */
function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input || '')).digest('hex');
}

module.exports = { createSuperchatService, verifyWebhookSignature, sha256Hex, SuperchatApiError };
