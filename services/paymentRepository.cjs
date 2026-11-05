'use strict';

/**
 * ⚡ PN AD NETWORK ⚡ — Payment repository
 *
 * Persists payments + payment events using the project's EXISTING storage
 * system (Firebase Firestore, single-doc-per-collection pattern):
 *
 *   web_payments/_root        { value: { [paymentId]: paymentRecord }, updated_at }
 *   web_payment_events/_root  { value: { [paymentId]: [eventRecord, ...] }, updated_at }
 *
 * The data helpers (readRoot / readRootFresh / updateRoot) are injected by
 * api-server.cjs so this module reuses the same read-through cache, timeouts
 * and transactional writes as the rest of the app. No new database is created
 * and no existing collection is touched.
 *
 * The state machine (PENDING → PROCESSING → PAID → REFUNDED, with
 * FAILED / CANCELLED / EXPIRED as terminal side-states) lives here so every
 * writer goes through the same rules. The frontend can never set a status.
 */

const PAYMENTS = 'web_payments';
const EVENTS = 'web_payment_events';

const STATUSES = ['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED'];
const TERMINAL = new Set(['PAID', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED']);

/** Can a payment move from `from` to `to`? */
function canTransition(from, to) {
  const a = String(from || '').toUpperCase();
  const b = String(to || '').toUpperCase();
  if (!STATUSES.includes(b)) return false;
  if (a === b) return false;
  if (a === 'PAID') return b === 'REFUNDED';                 // only refund after paid
  if (a === 'REFUNDED') return false;                        // fully terminal
  if (a === 'FAILED' || a === 'CANCELLED' || a === 'EXPIRED') return false; // terminal
  // from PENDING / PROCESSING (or unknown → treat as PENDING)
  return ['PROCESSING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(b);
}

function createPaymentRepository(deps) {
  const readRoot = deps.readRoot;
  const readRootFresh = deps.readRootFresh;
  const updateRoot = deps.updateRoot;

  async function allPayments() {
    const v = await readRoot(PAYMENTS);
    return (v && typeof v === 'object') ? v : {};
  }
  async function allEvents() {
    const v = await readRoot(EVENTS);
    return (v && typeof v === 'object') ? v : {};
  }

  return {
    STATUSES,
    TERMINAL,
    canTransition,

    async create(record) {
      await updateRoot(PAYMENTS, (cur) => ({ ...(cur && typeof cur === 'object' ? cur : {}), [record.id]: record }));
      return record;
    },

    async get(id) {
      const all = await allPayments();
      return all[id] || null;
    },

    /** Bypass the read cache — used right before a status decision. */
    async getFresh(id) {
      const v = await readRootFresh(PAYMENTS);
      const all = (v && typeof v === 'object') ? v : {};
      return all[id] || null;
    },

    async findByProviderId(providerId) {
      if (!providerId) return null;
      const all = await allPayments();
      return Object.values(all).find((p) => p && String(p.providerPaymentId) === String(providerId)) || null;
    },

    async findByIdempotencyKey(key) {
      if (!key) return null;
      const all = await allPayments();
      return Object.values(all).find((p) => p && p.idempotencyKey === key) || null;
    },

    /** Atomic update. `updater(prev)` returns the next record (or prev for no-op). */
    async update(id, updater) {
      let out = null;
      await updateRoot(PAYMENTS, (cur) => {
        const all = { ...(cur && typeof cur === 'object' ? cur : {}) };
        const prev = all[id];
        if (!prev) return all;
        out = updater({ ...prev });
        if (out) all[id] = out;
        return all;
      });
      return out;
    },

    /**
     * Atomically advance a payment's status following the state machine.
     * Returns { payment, changed, from, to } — `changed` is false when the
     * transition is illegal or a no-op (already in that state).
     */
    async transition(id, to, patch = {}) {
      const target = String(to || '').toUpperCase();
      let result = null;
      await updateRoot(PAYMENTS, (cur) => {
        const all = { ...(cur && typeof cur === 'object' ? cur : {}) };
        const prev = all[id];
        if (!prev) { result = { payment: null, changed: false, from: null, to: target }; return all; }
        const from = String(prev.status || '').toUpperCase();
        const changed = canTransition(from, target);
        const next = {
          ...prev,
          ...patch,
          status: changed ? target : prev.status,
          updatedAt: new Date().toISOString(),
        };
        all[id] = next;
        result = { payment: next, changed, from, to: target };
        return all;
      });
      return result;
    },

    /**
     * Atomically mark a payment PAID and claim the right to credit the wallet.
     *
     * This is the single guard that guarantees a payment is fulfilled EXACTLY
     * ONCE, no matter how many webhooks are re-delivered or how many status
     * polls happen concurrently: the first caller flips `fulfillmentClaimedAt`,
     * every later caller sees it set and gets `claimed: false`.
     *
     * Returns { payment, claimed }.
     */
    async claimFulfillment(id, patch = {}) {
      let claimed = false;
      let payment = null;
      await updateRoot(PAYMENTS, (cur) => {
        const all = { ...(cur && typeof cur === 'object' ? cur : {}) };
        const prev = all[id];
        if (!prev) return all;
        if (prev.fulfilled || prev.fulfillmentClaimedAt) { payment = prev; return all; }
        const now = new Date().toISOString();
        const next = { ...prev, ...patch, status: 'PAID', fulfillmentClaimedAt: now, updatedAt: now };
        all[id] = next;
        claimed = true;
        payment = next;
        return all;
      });
      return { payment, claimed };
    },

    /** Mark a claimed payment as fully fulfilled (wallet credited). */
    async markFulfilled(id, patch = {}) {
      let out = null;
      await updateRoot(PAYMENTS, (cur) => {
        const all = { ...(cur && typeof cur === 'object' ? cur : {}) };
        const prev = all[id];
        if (!prev) return all;
        const now = new Date().toISOString();
        out = { ...prev, ...patch, fulfilled: true, fulfilledAt: prev.fulfilledAt || now, updatedAt: now };
        all[id] = out;
        return all;
      });
      return out;
    },

    /**
     * Release a fulfillment claim after a failure so a later webhook / poll can
     * retry the credit. The payment stays PAID (the provider confirmed it) but
     * `fulfilled` remains false until the wallet write succeeds.
     */
    async releaseFulfillment(id, error) {
      let out = null;
      await updateRoot(PAYMENTS, (cur) => {
        const all = { ...(cur && typeof cur === 'object' ? cur : {}) };
        const prev = all[id];
        if (!prev) return all;
        out = {
          ...prev,
          fulfillmentClaimedAt: null,
          lastFulfillmentError: String(error || '').slice(0, 300),
          updatedAt: new Date().toISOString(),
        };
        all[id] = out;
        return all;
      });
      return out;
    },

    async list({ status, userId, q, limit = 200 } = {}) {
      const all = await allPayments();
      let list = Object.values(all).filter(Boolean);
      if (status) list = list.filter((p) => String(p.status).toUpperCase() === String(status).toUpperCase());
      if (userId) list = list.filter((p) => p.userId === userId);
      if (q) {
        const s = String(q).toLowerCase();
        list = list.filter((p) => [p.id, p.orderId, p.providerPaymentId, p.transactionId, p.customerName, p.customerEmail, p.customerPhone]
          .some((v) => String(v || '').toLowerCase().includes(s)));
      }
      list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      return list.slice(0, Math.max(1, Math.min(1000, Number(limit) || 200)));
    },

    async stats() {
      const all = await allPayments();
      const list = Object.values(all).filter(Boolean);
      const s = { total: list.length, paid: 0, pending: 0, processing: 0, failed: 0, cancelled: 0, expired: 0, refunded: 0, totalAmount: 0, paidAmount: 0 };
      for (const p of list) {
        const st = String(p.status || '').toUpperCase();
        const amt = Number(p.amount) || 0;
        s.totalAmount += amt;
        if (st === 'PAID') { s.paid += 1; s.paidAmount += amt; }
        else if (st === 'PENDING') s.pending += 1;
        else if (st === 'PROCESSING') s.processing += 1;
        else if (st === 'FAILED') s.failed += 1;
        else if (st === 'CANCELLED') s.cancelled += 1;
        else if (st === 'EXPIRED') s.expired += 1;
        else if (st === 'REFUNDED') s.refunded += 1;
      }
      s.totalAmount = Math.round(s.totalAmount * 100) / 100;
      s.paidAmount = Math.round(s.paidAmount * 100) / 100;
      return s;
    },

    async appendEvent(paymentId, event) {
      const record = {
        id: 'pev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        paymentId,
        eventId: event.eventId || null,
        eventType: event.eventType || 'unknown',
        oldStatus: event.oldStatus || null,
        newStatus: event.newStatus || null,
        provider: event.provider || 'superchat',
        providerTransactionId: event.providerTransactionId || null,
        payloadHash: event.payloadHash || null,
        note: event.note || null,
        createdAt: new Date().toISOString(),
      };
      await updateRoot(EVENTS, (cur) => {
        const all = { ...(cur && typeof cur === 'object' ? cur : {}) };
        const list = Array.isArray(all[paymentId]) ? all[paymentId] : [];
        all[paymentId] = [record, ...list].slice(0, 200);
        return all;
      });
      return record;
    },

    async listEvents(paymentId) {
      const all = await allEvents();
      return Array.isArray(all[paymentId]) ? all[paymentId] : [];
    },

    /** True when an event with this provider event-id or payload hash was already stored. */
    async hasEventKey(paymentId, key) {
      if (!key) return false;
      const all = await allEvents();
      const list = Array.isArray(all[paymentId]) ? all[paymentId] : [];
      return list.some((e) => (e.eventId && e.eventId === key) || (e.payloadHash && e.payloadHash === key));
    },
  };
}

module.exports = { createPaymentRepository, PAYMENTS, EVENTS, STATUSES };
