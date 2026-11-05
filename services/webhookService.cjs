'use strict';

/**
 * ⚡ PN AD NETWORK ⚡ — SuperChat webhook service
 *
 * Handles POST /api/webhooks/superchat. Steps, in order:
 *
 *   1. Verify the signature (HMAC-SHA256 of "<t>.<raw body>", header
 *      `x-superchat-signature: t=…,v1=…`) with a timestamp-tolerance check.
 *      An invalid signature is rejected with 401 and NOTHING is written.
 *   2. Parse the JSON envelope { id, event, created_at, data }.
 *   3. Resolve the local payment (via metadata.payment_id or provider id).
 *   4. Idempotency: if this event id (or the raw payload hash) was already
 *      stored for this payment, acknowledge and stop — SuperChat retries
 *      deliveries, so duplicates are expected and must be harmless.
 *   5. Persist the event, then hand off to paymentService.processProviderEvent
 *      which applies the state machine + fulfills the wallet exactly once.
 *
 * The raw body MUST be captured before any JSON parser runs (the route mounts
 * express.raw before express.json), otherwise the signature cannot be verified.
 */

function createWebhookService(deps) {
  const cfg = deps.cfg;
  const repo = deps.repo;
  const paymentService = deps.paymentService;
  const verifyWebhookSignature = deps.verifyWebhookSignature;
  const sha256Hex = deps.sha256Hex;
  const logger = deps.logger || console;

  function header(headers, name) {
    if (!headers) return '';
    const lower = name.toLowerCase();
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === lower) {
        const v = headers[k];
        return Array.isArray(v) ? String(v[0] || '') : String(v || '');
      }
    }
    return '';
  }

  /**
   * @returns {Promise<{status:number, body:object}>} — always safe to send to the provider.
   */
  async function handle({ rawBody, headers }) {
    const signature = header(headers, 'x-superchat-signature');
    const eventHeader = header(headers, 'x-superchat-event');
    const deliveryId = header(headers, 'x-superchat-delivery');

    // ── 1. Signature ──────────────────────────────────────────────────────
    if (!cfg.webhookSecretSet) {
      if (logger && logger.error) logger.error('[Webhook] Rejected: SUPERCHAT_WEBHOOK_SECRET is not configured.');
      return { status: 503, body: { ok: false, error: 'Webhook secret not configured.' } };
    }
    const verdict = verifyWebhookSignature({
      rawBody,
      signatureHeader: signature,
      secret: cfg.webhookSecret,
      toleranceSec: cfg.webhookToleranceSec,
    });
    if (!verdict.ok) {
      if (logger && logger.warn) logger.warn(`[Webhook] Signature rejected (${verdict.reason}).`);
      return { status: 401, body: { ok: false, error: 'Invalid signature.', reason: verdict.reason } };
    }

    // ── 2. Parse ──────────────────────────────────────────────────────────
    let event;
    try {
      event = JSON.parse(rawBody);
    } catch (_) {
      return { status: 400, body: { ok: false, error: 'Invalid JSON body.' } };
    }
    if (!event || typeof event !== 'object') {
      return { status: 400, body: { ok: false, error: 'Invalid event envelope.' } };
    }

    const eventId = event.id || deliveryId || null;
    const eventType = event.event || eventHeader || 'unknown';
    const payloadHash = sha256Hex(rawBody);

    // ── 3. Resolve local payment ──────────────────────────────────────────
    let resolved;
    try {
      resolved = await paymentService.resolvePaymentFromEvent(event);
    } catch (e) {
      if (logger && logger.error) logger.error('[Webhook] resolve failed:', (e && e.message) || e);
      resolved = { payment: null, providerId: null };
    }
    const payment = resolved.payment;

    // ── 4. Idempotency ────────────────────────────────────────────────────
    if (payment) {
      try {
        if (eventId && await repo.hasEventKey(payment.id, eventId)) {
          return { status: 200, body: { ok: true, received: true, duplicate: true, event: eventType } };
        }
        if (await repo.hasEventKey(payment.id, payloadHash)) {
          return { status: 200, body: { ok: true, received: true, duplicate: true, event: eventType } };
        }
      } catch (e) {
        if (logger && logger.warn) logger.warn('[Webhook] dedupe check failed:', (e && e.message) || e);
      }
    }

    // ── 5. Persist + apply ────────────────────────────────────────────────
    if (payment) {
      try {
        await repo.appendEvent(payment.id, {
          eventId,
          eventType,
          oldStatus: payment.status || null,
          newStatus: payment.status || null,
          providerTransactionId: resolved.providerId || null,
          payloadHash,
          note: `Webhook received (delivery ${deliveryId || 'n/a'}).`,
        });
      } catch (e) {
        if (logger && logger.warn) logger.warn('[Webhook] event persist failed:', (e && e.message) || e);
      }
    }

    let result;
    try {
      result = await paymentService.processProviderEvent(event);
    } catch (e) {
      if (logger && logger.error) logger.error('[Webhook] processing failed:', (e && e.message) || e);
      // Return 200 so SuperChat does not retry forever on a permanent bug;
      // the event is already stored and a status poll will reconcile.
      return { status: 200, body: { ok: true, received: true, applied: false, event: eventType, note: 'processing_error' } };
    }

    if (logger && logger.info) {
      logger.info(`[Webhook] ${eventType} → ${result && result.status ? result.status : 'ok'} (payment ${payment ? payment.id : 'unmatched'})`);
    }

    return {
      status: 200,
      body: {
        ok: true,
        received: true,
        event: eventType,
        applied: !!(result && result.changed),
        status: (result && result.status) || null,
        payment_id: payment ? payment.id : null,
      },
    };
  }

  return { handle };
}

module.exports = { createWebhookService };
