'use strict';

/**
 * ⚡ PN AD NETWORK ⚡ — Payment service (orchestration)
 *
 * Ties together:
 *   paymentConfig          → what the gateway settings are
 *   superchatService       → how to talk to SuperChat BD
 *   paymentVerification    → what the provider status means / is it trustworthy
 *   paymentRepository      → how we persist + move the state machine
 *
 * Responsibilities:
 *   createPayment()        → validate, create local record, open hosted checkout
 *   startPayment()         → return (or re-create) the hosted checkout URL
 *   getStatus()            → safe public status, with throttled auto-verification
 *   verifyPayment()        → server-side verify against the provider + apply
 *   processProviderEvent() → apply a signed webhook event (idempotent)
 *
 * SECURITY INVARIANTS (never violated anywhere in this file):
 *   • The amount + currency are decided server-side and re-checked against the
 *     provider before a single taka is credited. The browser can never set them.
 *   • A payment is credited EXACTLY ONCE via repo.claimFulfillment().
 *   • The API key / webhook secret never leave the server.
 */

const crypto = require('crypto');

/** A structured, route-friendly error. */
class PaymentError extends Error {
  constructor(message, code, status = 400, extra) {
    super(message || 'Payment error');
    this.name = 'PaymentError';
    this.code = code || 'PAYMENT_ERROR';
    this.status = Number(status) || 400;
    this.isPayment = true;
    if (extra) this.extra = extra;
  }
}

function newPublicPaymentId() {
  // Unpredictable, URL-safe, brand-prefixed: SC + 20 hex chars.
  return 'SC' + crypto.randomBytes(10).toString('hex').toUpperCase();
}

function newOrderId() {
  return 'ORD' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();
}

function _s(v, max = 200) { return String(v == null ? '' : v).trim().slice(0, max); }

// PII shown on the (bearer-token) checkout page is masked so a leaked link
// never reveals a full email/phone.
function maskEmail(v) {
  const s = _s(v, 160);
  const at = s.indexOf('@');
  if (at <= 0) return '';
  const user = s.slice(0, at);
  const domain = s.slice(at);
  const head = user.slice(0, Math.min(2, user.length));
  return `${head}${'*'.repeat(Math.max(3, user.length - head.length))}${domain}`;
}

function maskPhone(v) {
  const s = _s(v, 40).replace(/\s+/g, '');
  if (!s) return '';
  if (s.length <= 5) return s[0] + '*'.repeat(Math.max(1, s.length - 1));
  const head = s.slice(0, 3);
  const tail = s.slice(-3);
  return `${head}${'*'.repeat(Math.max(3, s.length - 6))}${tail}`;
}

function clientIp(req) {
  try {
    const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return xf || req.socket?.remoteAddress || req.ip || null;
  } catch (_) { return null; }
}

function createPaymentService(deps) {
  const cfg = deps.cfg;
  const repo = deps.repo;
  const superchat = deps.superchat;
  const verification = deps.verification;
  const logger = deps.logger || console;
  const resolveAppUrl = deps.resolveAppUrl;
  const round2 = deps.round2 || ((n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100);
  const fulfill = deps.fulfill;                 // async (payment) => { credited, newBalance, transactionId }
  const notify = deps.notify || null;           // async (payment) => void (best-effort user notice)
  const audit = deps.audit || null;             // async ({...}) => void
  const telegram = deps.telegram || null;       // telegramPaymentService

  const expectedCurrency = String(cfg.currency || 'BDT').toUpperCase();

  // ────────────────────────────────────────────────────────────────────────
  //  PUBLIC VIEW — the ONLY shape ever sent to a browser
  // ────────────────────────────────────────────────────────────────────────
  function publicView(p) {
    if (!p) return null;
    return {
      payment_id: p.id,
      order_id: p.orderId || null,
      amount: Number(p.amount) || 0,
      currency: p.currency || expectedCurrency,
      status: p.status,
      checkout_url: p.checkoutUrl || null,
      description: p.description || '',
      customer_name: p.customerName || '',
      customer_email: maskEmail(p.customerEmail),
      customer_phone: maskPhone(p.customerPhone),
      created_at: p.createdAt || null,
      updated_at: p.updatedAt || null,
      expires_at: p.expiresAt || null,
      paid_at: p.paidAt || null,
      refunded_at: p.refundedAt || null,
      environment: p.environment || cfg.environment,
      provider: p.provider || 'superchat',
      fulfilled: !!p.fulfilled,
      flagged: p.flagged || null,
    };
  }

  function adminView(p) {
    if (!p) return null;
    return {
      ...publicView(p),
      provider_payment_id: p.providerPaymentId || null,
      provider_status: p.providerStatus || null,
      provider_raw_status: p.providerRawStatus || null,
      user_id: p.userId || null,
      customer_email: p.customerEmail || '',
      customer_phone: p.customerPhone || '',
      idempotency_key: p.idempotencyKey || null,
      paid_source: p.paidSource || null,
      fulfilled_at: p.fulfilledAt || null,
      balance_after: p.balanceAfter != null ? p.balanceAfter : null,
      credited_transaction_id: p.creditedTransactionId || null,
      last_fulfillment_error: p.lastFulfillmentError || null,
      metadata: p.metadata || {},
      is_live: !!p.isLive,
      ip: p.ip || null,
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  //  VALIDATION
  // ────────────────────────────────────────────────────────────────────────
  function validateAmount(amount) {
    const amt = round2(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) throw new PaymentError('Please enter a valid amount.', 'INVALID_AMOUNT', 400);
    if (amt < cfg.minAmount) throw new PaymentError(`Minimum top-up is ${cfg.minAmount} ${expectedCurrency}.`, 'AMOUNT_TOO_SMALL', 400);
    if (cfg.maxAmount > 0 && amt > cfg.maxAmount) throw new PaymentError(`Maximum top-up is ${cfg.maxAmount} ${expectedCurrency}.`, 'AMOUNT_TOO_LARGE', 400);
    return amt;
  }

  function validateCurrency(currency) {
    const cur = String(currency || expectedCurrency).toUpperCase();
    if (cur !== expectedCurrency) throw new PaymentError(`Unsupported currency. Only ${expectedCurrency} is accepted.`, 'UNSUPPORTED_CURRENCY', 400);
    return cur;
  }

  function sanitizeCustomer(customer) {
    const c = customer && typeof customer === 'object' ? customer : {};
    const name = _s(c.name || c.customer_name, 120);
    const email = _s(c.email || c.customer_email, 160);
    const phone = _s(c.phone || c.phoneNumber || c.customer_phone, 40);
    const out = {};
    if (name) out.name = name;
    if (email) out.email = email;
    if (phone) out.phone = phone;
    return out;
  }

  function sanitizeMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') return {};
    const out = {};
    let count = 0;
    for (const [k, v] of Object.entries(metadata)) {
      if (count >= 20) break;
      const key = _s(k, 40);
      if (!key) continue;
      if (v == null) continue;
      if (typeof v === 'object') continue; // flat scalars only
      out[key] = _s(v, 200);
      count += 1;
    }
    return out;
  }

  // ────────────────────────────────────────────────────────────────────────
  //  PROVIDER SESSION
  // ────────────────────────────────────────────────────────────────────────
  function buildUrls(record, req) {
    const appUrl = resolveAppUrl(cfg, req);
    if (!appUrl) {
      throw new PaymentError(
        'Payment gateway is not fully configured (APP_URL missing). Please contact support.',
        'APP_URL_MISSING',
        500,
      );
    }
    // Prefer the dedicated redirect base (may be an HTTPS domain) for the browser
    // callbacks; fall back to the request-derived app URL.
    let base = String(cfg.redirectBaseUrl || '').trim() || appUrl;
    // SuperChat's live gateway rejects non-HTTPS redirect URLs, so in live mode we
    // upgrade the scheme to https (the operator must terminate TLS on that host).
    if (cfg.isLive && /^http:\/\//i.test(base)) {
      base = base.replace(/^http:\/\//i, 'https://');
    }
    base = base.replace(/\/+$/, '');
    return {
      successUrl: `${base}/payment/success/${record.id}`,
      cancelUrl: `${base}/payment/cancel/${record.id}`,
      appUrl: base,
    };
  }

  async function openProviderSession(record, req) {
    const { successUrl, cancelUrl } = buildUrls(record, req);
    const cust = record.customer || {};
    const hasCustomer = !!(cust.name || cust.email || cust.phone);

    const payload = {
      amount: Number(record.amount),
      currency: record.currency,
      description: record.description,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        payment_id: record.id,
        order_id: record.orderId,
        user_id: record.userId || '',
        ...(record.metadata || {}),
      },
      expires_in: Math.max(300, Number(cfg.expirationMinutes || 60) * 60),
    };
    if (hasCustomer) payload.customer = cust;

    let provider;
    try {
      provider = await superchat.createPayment(payload, record.idempotencyKey);
    } catch (e) {
      const msg = (e && e.message) || 'Could not open the payment session.';
      throw new PaymentError(msg, 'GATEWAY_CREATE_FAILED', 502, { providerStatus: e && e.status });
    }

    const providerPaymentId = provider?.id || provider?.payment_id || provider?.paymentId || null;
    const checkoutUrl = provider?.checkoutUrl || provider?.checkout_url || null;
    if (!checkoutUrl) {
      throw new PaymentError('The payment gateway did not return a checkout URL.', 'NO_CHECKOUT_URL', 502);
    }
    return { provider, providerPaymentId, checkoutUrl };
  }

  // ────────────────────────────────────────────────────────────────────────
  //  CREATE
  // ────────────────────────────────────────────────────────────────────────
  async function createPayment({ userId, amount, currency, customer, metadata, description, idempotencyKey, req } = {}) {
    if (!cfg.apiKeySet) {
      throw new PaymentError('The payment gateway is not configured yet. Please contact support.', 'GATEWAY_NOT_CONFIGURED', 503);
    }
    const amt = validateAmount(amount);
    const cur = validateCurrency(currency);

    // Idempotency — a repeated request with the same key returns the same payment.
    const idem = _s(idempotencyKey, 120) || ('idem_' + crypto.randomBytes(12).toString('hex'));
    const existing = await repo.findByIdempotencyKey(idem);
    if (existing) {
      return { success: true, reused: true, payment: publicView(existing), checkout_url: existing.checkoutUrl || null, status: existing.status };
    }

    const now = new Date().toISOString();
    const cust = sanitizeCustomer(customer);
    const meta = sanitizeMetadata(metadata);
    const id = newPublicPaymentId();
    const orderId = newOrderId();
    const expiresAt = new Date(Date.now() + Number(cfg.expirationMinutes || 60) * 60000).toISOString();

    const record = {
      id,
      orderId,
      userId: userId || null,
      amount: amt,
      currency: cur,
      status: 'PENDING',
      provider: 'superchat',
      providerPaymentId: null,
      providerStatus: null,
      providerRawStatus: null,
      checkoutUrl: null,
      customer: cust,
      customerName: cust.name || '',
      customerEmail: cust.email || '',
      customerPhone: cust.phone || '',
      metadata: meta,
      description: _s(description, 300) || `Wallet top-up ${cur} ${amt}`,
      idempotencyKey: idem,
      environment: cfg.environment,
      isLive: !!cfg.isLive,
      fulfilled: false,
      fulfillmentClaimedAt: null,
      flagged: null,
      createdAt: now,
      updatedAt: now,
      expiresAt,
      createdBy: userId || null,
      ip: req ? clientIp(req) : null,
    };

    await repo.create(record);
    await repo.appendEvent(id, { eventType: 'payment.created', newStatus: 'PENDING', note: 'Payment record created (local).' });

    let session;
    try {
      session = await openProviderSession(record, req);
    } catch (e) {
      await repo.transition(id, 'FAILED', { failureReason: (e && e.message) || 'provider_create_failed' });
      await repo.appendEvent(id, {
        eventType: 'payment.create_failed',
        oldStatus: 'PENDING',
        newStatus: 'FAILED',
        note: (e && e.message) || 'provider_create_failed',
      });
      if (audit) {
        audit({
          actor: { name: record.customerName || 'Customer', role: 'user' },
          action: 'PAYMENT_CREATE_FAILED',
          targetId: id,
          targetType: 'payment',
          status: 'error',
          details: `SuperChat create failed: ${(e && e.message) || 'unknown'}`,
        }).catch(() => {});
      }
      throw e;
    }

    const updated = await repo.update(id, (prev) => ({
      ...prev,
      providerPaymentId: session.providerPaymentId,
      checkoutUrl: session.checkoutUrl,
      providerStatus: session.provider?.status || null,
      providerRawStatus: session.provider?.rawStatus || session.provider?.raw_status || null,
      providerCreatedAt: session.provider?.createdAt || session.provider?.created_at || now,
      updatedAt: new Date().toISOString(),
    }));

    await repo.appendEvent(id, {
      eventType: 'payment.provider_created',
      newStatus: 'PENDING',
      providerTransactionId: session.providerPaymentId,
      note: 'Hosted checkout session created.',
    });

    if (audit) {
      audit({
        actor: { name: record.customerName || 'Customer', role: 'user' },
        action: 'PAYMENT_CREATED',
        targetId: id,
        targetType: 'payment',
        details: `${cur} ${amt} payment created (order ${orderId}).`,
      }).catch(() => {});
    }
    if (logger && logger.info) logger.info(`[Payment] created ${id} (${cur} ${amt}) provider=${session.providerPaymentId}`);

    return { success: true, payment: publicView(updated), checkout_url: session.checkoutUrl, status: 'PENDING' };
  }

  // ────────────────────────────────────────────────────────────────────────
  //  START (return / re-open the hosted checkout URL)
  // ────────────────────────────────────────────────────────────────────────
  async function startPayment(paymentId, req) {
    const p = await repo.getFresh(paymentId);
    if (!p) throw new PaymentError('Payment not found.', 'NOT_FOUND', 404);

    const st = String(p.status || '').toUpperCase();
    if (st === 'PAID') return { success: true, already_paid: true, status: 'PAID', checkout_url: null };
    if (['REFUNDED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(st)) {
      return { success: false, status: st, checkout_url: null, reason: 'terminal' };
    }

    if (p.expiresAt && Date.now() > Date.parse(p.expiresAt)) {
      const r = await repo.transition(paymentId, 'EXPIRED', {});
      await repo.appendEvent(paymentId, { eventType: 'payment.expired', oldStatus: st, newStatus: 'EXPIRED', note: 'Local expiry reached.' });
      return { success: false, status: 'EXPIRED', checkout_url: null, reason: 'expired', payment: publicView(r.payment || p) };
    }

    if (p.checkoutUrl) {
      return { success: true, status: st, checkout_url: p.checkoutUrl, payment: publicView(p) };
    }

    // No stored URL (e.g. the create call failed) — open a fresh session now.
    const session = await openProviderSession(p, req);
    const updated = await repo.update(paymentId, (prev) => ({
      ...prev,
      providerPaymentId: session.providerPaymentId,
      checkoutUrl: session.checkoutUrl,
      providerStatus: session.provider?.status || null,
      providerRawStatus: session.provider?.rawStatus || session.provider?.raw_status || null,
      updatedAt: new Date().toISOString(),
    }));
    await repo.appendEvent(paymentId, {
      eventType: 'payment.provider_reopened',
      newStatus: st,
      providerTransactionId: session.providerPaymentId,
      note: 'Checkout session re-opened.',
    });
    return { success: true, status: st, checkout_url: session.checkoutUrl, payment: publicView(updated) };
  }

  // ────────────────────────────────────────────────────────────────────────
  //  STATUS (public, throttled auto-verify)
  // ────────────────────────────────────────────────────────────────────────
  async function getStatus(paymentId, { verify = true } = {}) {
    let p = await repo.getFresh(paymentId);
    if (!p) return null;

    const st = String(p.status || '').toUpperCase();
    if (verify && (st === 'PENDING' || st === 'PROCESSING')) {
      const last = p.lastVerifiedAt ? Date.parse(p.lastVerifiedAt) : 0;
      if (Date.now() - last > 4000) {
        try {
          const r = await verifyPayment(paymentId, { source: 'status_poll' });
          if (r && r.payment) p = r.payment;
          await repo.update(paymentId, (prev) => ({ ...prev, lastVerifiedAt: new Date().toISOString() }));
        } catch (e) {
          if (logger && logger.warn) logger.warn('[Payment] status auto-verify skipped:', (e && e.message) || e);
        }
      }
    }
    return p;
  }

  // ────────────────────────────────────────────────────────────────────────
  //  VERIFY + APPLY
  // ────────────────────────────────────────────────────────────────────────
  async function verifyPayment(paymentId, { source = 'manual' } = {}) {
    const p = await repo.getFresh(paymentId);
    if (!p) return null;

    const st = String(p.status || '').toUpperCase();
    if (st === 'PAID' || st === 'REFUNDED') {
      return { payment: p, changed: false, status: st, already_final: true };
    }

    const verdict = await verification.verifyWithProvider(p);
    if (!verdict.ok) {
      return { payment: p, changed: false, status: st, verify_error: verdict.reason };
    }
    return applyVerdict(p, verdict, source);
  }

  async function applyVerdict(payment, verdict, source) {
    const from = String(payment.status || '').toUpperCase();
    const target = verdict.internalStatus;

    if (target === 'PAID') {
      if (!verdict.amountMatches || !verdict.currencyMatches) {
        await repo.appendEvent(payment.id, {
          eventType: 'payment.amount_mismatch',
          oldStatus: from,
          newStatus: from,
          providerTransactionId: payment.providerPaymentId,
          note: `Expected ${verdict.expectedAmount} ${verdict.expectedCurrency}, provider reported ${verdict.providerAmount} ${verdict.providerCurrency}.`,
        });
        await repo.update(payment.id, (prev) => ({ ...prev, flagged: 'amount_mismatch', updatedAt: new Date().toISOString() }));
        if (logger && logger.error) logger.error(`[Payment] AMOUNT MISMATCH on ${payment.id} — refusing to credit.`);
        if (audit) audit({
          actor: { name: 'System', role: 'system' },
          action: 'PAYMENT_AMOUNT_MISMATCH',
          targetId: payment.id,
          targetType: 'payment',
          status: 'error',
          details: `Expected ${verdict.expectedAmount} ${verdict.expectedCurrency}, got ${verdict.providerAmount} ${verdict.providerCurrency}`,
        }).catch(() => {});
        return { payment: await repo.getFresh(payment.id), changed: false, status: from, mismatch: true };
      }
      return fulfillPaid(payment, verdict, source);
    }

    if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(target)) {
      const r = await repo.transition(payment.id, target, {
        providerStatus: verdict.providerStatus,
        providerRawStatus: verdict.provider?.rawStatus || verdict.provider?.raw_status || null,
      });
      if (r.changed) {
        await repo.appendEvent(payment.id, {
          eventType: `payment.${target.toLowerCase()}`,
          oldStatus: from,
          newStatus: target,
          providerTransactionId: payment.providerPaymentId,
          note: `Verified via ${source}.`,
        });
      }
      return { payment: r.payment, changed: r.changed, status: target };
    }

    // PENDING / PROCESSING — just refresh the provider's view.
    const updated = await repo.update(payment.id, (prev) => ({
      ...prev,
      providerStatus: verdict.providerStatus,
      providerRawStatus: verdict.provider?.rawStatus || verdict.provider?.raw_status || null,
      updatedAt: new Date().toISOString(),
    }));
    return { payment: updated, changed: false, status: from };
  }

  async function fulfillPaid(payment, verdict, source) {
    const { payment: claimed, claimed: didClaim } = await repo.claimFulfillment(payment.id, {
      providerStatus: verdict.providerStatus,
      providerRawStatus: verdict.provider?.rawStatus || verdict.provider?.raw_status || null,
      providerTransactionId: payment.providerPaymentId,
      paidAt: new Date().toISOString(),
      paidSource: source,
    });

    if (!didClaim) {
      // Another worker/webhook already claimed it — never credit twice.
      return { payment: claimed, changed: false, status: 'PAID', already_fulfilled: true };
    }

    await repo.appendEvent(payment.id, {
      eventType: 'payment.paid',
      oldStatus: String(payment.status || '').toUpperCase(),
      newStatus: 'PAID',
      providerTransactionId: payment.providerPaymentId,
      note: `Verified via ${source}.`,
    });

    let result = null;
    try {
      result = fulfill ? await fulfill(claimed) : { credited: false };
    } catch (e) {
      if (logger && logger.error) logger.error(`[Payment] fulfillment failed for ${payment.id}:`, (e && e.message) || e);
      await repo.releaseFulfillment(payment.id, (e && e.message) || 'fulfillment_failed');
      await repo.appendEvent(payment.id, {
        eventType: 'payment.fulfillment_failed',
        newStatus: 'PAID',
        note: (e && e.message) || 'fulfillment_failed',
      });
      return { payment: claimed, changed: true, status: 'PAID', fulfillment_error: true };
    }

    const final = await repo.markFulfilled(payment.id, {
      creditedAmount: result && result.credited ? Number(claimed.amount) : 0,
      creditedTransactionId: (result && result.transactionId) || null,
      balanceAfter: result && result.newBalance != null ? result.newBalance : null,
    });
    await repo.appendEvent(payment.id, {
      eventType: 'payment.fulfilled',
      newStatus: 'PAID',
      note: `Wallet credited ${claimed.amount} ${claimed.currency}.`,
    });

    if (notify) { try { await notify(final); } catch (_) {} }
    if (telegram) { try { await telegram.paymentPaid(final); } catch (_) {} }
    if (audit) {
      audit({
        actor: { name: 'System', role: 'system' },
        action: 'PAYMENT_PAID',
        targetId: payment.id,
        targetType: 'payment',
        details: `${claimed.currency} ${claimed.amount} paid (order ${claimed.orderId}); wallet credited.`,
      }).catch(() => {});
    }

    return { payment: final, changed: true, status: 'PAID', fulfilled: true, credited: !!(result && result.credited) };
  }

  // ────────────────────────────────────────────────────────────────────────
  //  PROVIDER EVENT (webhook) — idempotent application
  // ────────────────────────────────────────────────────────────────────────
  async function resolvePaymentFromEvent(event) {
    const data = (event && event.data) || {};
    const providerPayment = data.payment || data;
    const providerId = providerPayment?.id || providerPayment?.payment_id || data.payment_id || null;
    const metaPaymentId =
      (providerPayment?.metadata && providerPayment.metadata.payment_id) ||
      (data.metadata && data.metadata.payment_id) ||
      null;

    let payment = metaPaymentId ? await repo.getFresh(metaPaymentId) : null;
    if (!payment && providerId) payment = await repo.findByProviderId(providerId);
    return { payment, providerId, metaPaymentId, providerPayment };
  }

  async function processProviderEvent(event) {
    const type = String((event && event.event) || '').toLowerCase();
    const { payment, providerId, providerPayment } = await resolvePaymentFromEvent(event);

    if (!payment) return { ok: false, reason: 'payment_not_found', providerId };

    const from = String(payment.status || '').toUpperCase();
    if (from === 'PAID' || from === 'REFUNDED') {
      // Already final — still handle a late refund event below.
      if (!type.includes('refund')) {
        return { ok: true, payment, status: from, changed: false, already_final: true };
      }
    }

    const providerStatus = String(providerPayment?.status || providerPayment?.rawStatus || '').toLowerCase();
    const internalStatus = verification.mapProviderStatus(providerStatus);

    // Refund
    if (type.includes('refund') || internalStatus === 'REFUNDED') {
      const r = await repo.transition(payment.id, 'REFUNDED', {
        providerStatus,
        refundedAt: new Date().toISOString(),
      });
      if (r.changed) {
        await repo.appendEvent(payment.id, {
          eventType: 'payment.refunded',
          oldStatus: from,
          newStatus: 'REFUNDED',
          providerTransactionId: providerId,
          note: 'Refund confirmed by provider webhook.',
        });
        if (telegram) { try { await telegram.paymentRefunded(r.payment || payment); } catch (_) {} }
      }
      return { ok: true, payment: r.payment, status: 'REFUNDED', changed: r.changed };
    }

    // Completed / paid — verify against the provider, fall back to the signed event.
    if (type.includes('completed') || type.includes('paid') || internalStatus === 'PAID') {
      let verdict = null;
      try {
        const v = await verification.verifyWithProvider(payment);
        if (v.ok && v.internalStatus === 'PAID') verdict = v;
      } catch (_) { /* fall through to event-based verdict */ }

      if (!verdict) {
        // The signed webhook is authoritative — evaluate its own payload.
        verdict = verification.evaluate(payment, providerPayment);
        verdict.internalStatus = 'PAID';
      }
      const applied = await applyVerdict(payment, verdict, 'webhook');
      return { ok: true, ...applied };
    }

    // created / processing — refresh provider view only.
    const updated = await repo.update(payment.id, (prev) => ({
      ...prev,
      providerStatus: providerStatus || prev.providerStatus,
      providerRawStatus: providerPayment?.rawStatus || providerPayment?.raw_status || null,
      updatedAt: new Date().toISOString(),
    }));
    return { ok: true, payment: updated, status: updated?.status, changed: false };
  }

  // ────────────────────────────────────────────────────────────────────────
  //  REFUND (admin)
  // ────────────────────────────────────────────────────────────────────────
  async function refundPayment(paymentId, reason, actor) {
    const p = await repo.getFresh(paymentId);
    if (!p) throw new PaymentError('Payment not found.', 'NOT_FOUND', 404);
    const st = String(p.status || '').toUpperCase();
    if (st !== 'PAID') throw new PaymentError('Only paid payments can be refunded.', 'NOT_REFUNDABLE', 409);
    if (!p.providerPaymentId) throw new PaymentError('This payment has no provider reference.', 'NO_PROVIDER_ID', 409);

    let providerResult = null;
    try {
      providerResult = await superchat.refundPayment(p.providerPaymentId, _s(reason, 300) || 'Refund requested by merchant', 'refund_' + paymentId);
    } catch (e) {
      throw new PaymentError((e && e.message) || 'Refund failed at the gateway.', 'GATEWAY_REFUND_FAILED', 502);
    }

    const r = await repo.transition(paymentId, 'REFUNDED', {
      refundedAt: new Date().toISOString(),
      refundReason: _s(reason, 300) || 'Refund requested by merchant',
      providerStatus: 'refunded',
    });
    await repo.appendEvent(paymentId, {
      eventType: 'payment.refunded',
      oldStatus: st,
      newStatus: 'REFUNDED',
      providerTransactionId: p.providerPaymentId,
      note: `Refunded by admin${actor ? ' ' + actor : ''}: ${_s(reason, 200) || 'no reason given'}`,
    });
    if (telegram) { try { await telegram.paymentRefunded(r.payment || p); } catch (_) {} }
    if (audit) {
      audit({
        actor: { name: actor || 'Admin', role: 'admin' },
        action: 'PAYMENT_REFUNDED',
        targetId: paymentId,
        targetType: 'payment',
        details: `Refunded ${p.currency} ${p.amount} (order ${p.orderId}). Reason: ${_s(reason, 200) || 'n/a'}`,
      }).catch(() => {});
    }
    return { payment: r.payment, provider: providerResult };
  }

  return {
    PaymentError,
    publicView,
    adminView,
    createPayment,
    startPayment,
    getStatus,
    verifyPayment,
    applyVerdict,
    processProviderEvent,
    resolvePaymentFromEvent,
    refundPayment,
  };
}

module.exports = { createPaymentService, PaymentError, newPublicPaymentId, newOrderId };
