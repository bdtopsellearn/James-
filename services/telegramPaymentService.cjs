'use strict';

/**
 * ⚡ PN AD NETWORK ⚡ — Telegram payment notifications
 *
 * IMPORTANT CONTEXT: this project intentionally runs WITHOUT Telegram (the bot
 * in bot-source/bot.cjs is a no-op shim and the token in .env is a dummy). So
 * this service is built to degrade gracefully:
 *
 *   • Every alert is ALWAYS written to the Firestore outbox collection
 *     `web_payment_alerts` (visible in the admin dashboard), regardless of
 *     whether Telegram is reachable.
 *   • A real Telegram message is ALSO sent — but only when a genuine
 *     TELEGRAM_BOT_TOKEN is configured AND a chat id is available. With the
 *     dummy token present, isConfigured() returns false and the send is skipped.
 *
 * This means the integration is complete and ready, but never breaks a payment
 * if Telegram is missing, and never spams a disabled bot.
 */

const DUMMY_TOKENS = new Set([
  '',
  'worker_mode_disabled_no_telegram',
  'disabled',
  'none',
  'changeme',
]);

function createTelegramPaymentService({ updateRoot, logger = console, brand = 'PN AD NETWORK' } = {}) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const adminChatId = String(process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.ADMIN_IDS || '').split(',')[0].trim();
  const apiBase = 'https://api.telegram.org';

  function isConfigured() {
    return !!token && !DUMMY_TOKENS.has(token.toLowerCase());
  }

  async function sendMessage(chatId, text, opts = {}) {
    if (!isConfigured() || !chatId) return { ok: false, skipped: true };
    try {
      const res = await fetch(`${apiBase}/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: String(text || '').slice(0, 4000),
          parse_mode: opts.parse_mode || 'HTML',
          disable_web_page_preview: true,
        }),
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok && !!data && data.ok, data };
    } catch (e) {
      if (logger && logger.warn) logger.warn('[Telegram] send failed:', (e && e.message) || e);
      return { ok: false, error: (e && e.message) || 'send_failed' };
    }
  }

  /** Persist an alert to the Firestore outbox (always) + optionally Telegram. */
  async function recordAlert(alert) {
    const entry = {
      id: 'pal_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      type: alert.type || 'info',
      title: alert.title || '',
      body: alert.body || '',
      paymentId: alert.paymentId || null,
      amount: alert.amount != null ? alert.amount : null,
      currency: alert.currency || null,
      createdAt: new Date().toISOString(),
    };
    try {
      if (updateRoot) {
        await updateRoot('web_payment_alerts', (cur) => {
          const list = Array.isArray(cur) ? cur : [];
          return [entry, ...list].slice(0, 200);
        });
      }
    } catch (e) {
      if (logger && logger.warn) logger.warn('[Telegram] outbox write failed:', (e && e.message) || e);
    }
    return entry;
  }

  function fmtAmount(p) {
    const cur = p && p.currency ? p.currency : 'BDT';
    const amt = p && p.amount != null ? Number(p.amount).toLocaleString('en-US') : '0';
    return `${cur} ${amt}`;
  }

  async function notifyAdmin(text, meta = {}) {
    await recordAlert({ type: meta.type || 'info', title: meta.title || brand, body: text, ...meta });
    if (!isConfigured() || !adminChatId) return { ok: false, skipped: true };
    return sendMessage(adminChatId, text);
  }

  async function paymentPaid(payment) {
    const p = payment || {};
    const text =
      `✅ <b>Payment Received</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💳 <b>${fmtAmount(p)}</b>\n` +
      `🧾 Order: <code>${p.orderId || p.id || '-'}</code>\n` +
      `👤 ${p.customerName || p.customerEmail || p.userId || 'Customer'}\n` +
      `🌐 ${p.isLive ? 'LIVE' : 'TEST'} mode\n` +
      `🕒 ${new Date().toISOString()}`;
    return notifyAdmin(text, { type: 'payment_paid', title: 'Payment received', paymentId: p.id, amount: p.amount, currency: p.currency });
  }

  async function paymentRefunded(payment) {
    const p = payment || {};
    const text =
      `↩️ <b>Payment Refunded</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💳 <b>${fmtAmount(p)}</b>\n` +
      `🧾 Order: <code>${p.orderId || p.id || '-'}</code>\n` +
      `📝 ${p.refundReason || 'Refund processed'}`;
    return notifyAdmin(text, { type: 'payment_refunded', title: 'Payment refunded', paymentId: p.id, amount: p.amount, currency: p.currency });
  }

  return { isConfigured, sendMessage, notifyAdmin, paymentPaid, paymentRefunded, recordAlert };
}

module.exports = { createTelegramPaymentService };
