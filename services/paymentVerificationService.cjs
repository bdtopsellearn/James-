'use strict';

/**
 * ⚡ PN AD NETWORK ⚡ — Payment verification service
 *
 * The ONLY place that decides what a SuperChat BD status means for us, and the
 * only place that fetches the authoritative payment from the provider.
 *
 * It performs NO database writes — it returns a verdict and the caller
 * (paymentService) applies it through the repository state machine. This keeps
 * the "what does the provider say" question completely separate from "what do
 * we do about it", which makes both easy to reason about and test.
 *
 * SECURITY: the frontend can NEVER influence the outcome. Amount and currency
 * are always compared against the value WE stored server-side at creation time.
 */

/**
 * Map a SuperChat public/raw status onto our internal state machine status.
 * SuperChat public statuses: pending | completed | failed | cancelled | refunded | expired
 * SuperChat raw statuses   : created | processing | paid | ...
 */
const PROVIDER_TO_INTERNAL = {
  created: 'PENDING',
  pending: 'PENDING',
  initiated: 'PENDING',
  processing: 'PROCESSING',
  in_progress: 'PROCESSING',
  paid: 'PAID',
  completed: 'PAID',
  success: 'PAID',
  succeeded: 'PAID',
  failed: 'FAILED',
  failure: 'FAILED',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  expired: 'EXPIRED',
  refunded: 'REFUNDED',
  refund: 'REFUNDED',
};

function mapProviderStatus(providerStatus) {
  const s = String(providerStatus || '').trim().toLowerCase();
  return PROVIDER_TO_INTERNAL[s] || 'PENDING';
}

/** Read the amount/currency out of a provider payment object (tolerant of aliases). */
function readProviderAmount(provider) {
  const amount = Number(provider && (provider.amount != null ? provider.amount : provider.total_amount));
  const currency = String((provider && (provider.currency || provider.currency_code)) || '').toUpperCase();
  return { amount: Number.isFinite(amount) ? amount : NaN, currency };
}

function createPaymentVerificationService({ cfg, superchat, logger = console }) {
  const expectedCurrency = String((cfg && cfg.currency) || 'BDT').toUpperCase();

  /**
   * Fetch the authoritative payment from SuperChat and compare it to our record.
   * Returns:
   *   { ok:false, reason }                                    → could not verify
   *   { ok:true, provider, providerStatus, internalStatus,
   *     amountMatches, currencyMatches, providerAmount,
   *     expectedAmount, providerCurrency, expectedCurrency }  → verified
   */
  async function verifyWithProvider(payment) {
    if (!payment) return { ok: false, reason: 'not_found' };
    if (!payment.providerPaymentId) return { ok: false, reason: 'no_provider_id' };

    let provider;
    try {
      provider = await superchat.getPayment(payment.providerPaymentId);
    } catch (e) {
      if (logger && logger.warn) logger.warn('[PaymentVerify] provider fetch failed:', (e && e.message) || e);
      return { ok: false, reason: 'provider_error', error: e };
    }
    return evaluate(payment, provider);
  }

  /**
   * Evaluate a provider payment object (from a fetch OR a signed webhook body)
   * against our stored record. Pure — no I/O.
   */
  function evaluate(payment, provider) {
    const providerStatus = String(
      (provider && (provider.status || provider.rawStatus || provider.raw_status)) || ''
    ).toLowerCase();
    const internalStatus = mapProviderStatus(providerStatus);

    const { amount: providerAmount, currency: providerCurrencyRaw } = readProviderAmount(provider);
    const expectedAmount = Number(payment.amount);
    const providerCurrency = (providerCurrencyRaw || expectedCurrency).toUpperCase();
    const expected = String(payment.currency || expectedCurrency).toUpperCase();

    const amountMatches =
      Number.isFinite(providerAmount) && Math.abs(providerAmount - expectedAmount) < 0.01;
    const currencyMatches = providerCurrency === expected;

    return {
      ok: true,
      provider,
      providerStatus,
      internalStatus,
      amountMatches,
      currencyMatches,
      providerAmount,
      expectedAmount,
      providerCurrency,
      expectedCurrency: expected,
    };
  }

  return { mapProviderStatus, verifyWithProvider, evaluate, readProviderAmount };
}

module.exports = { createPaymentVerificationService, mapProviderStatus, readProviderAmount };
