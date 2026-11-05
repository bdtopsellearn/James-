import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Clock,
  Loader2,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Receipt,
  Wallet,
  ExternalLink,
  Copy,
  Check,
  UserRound,
  ArrowLeft,
} from 'lucide-react';
import { PaymentShell } from './PaymentShell';
import { apiGetPayment, apiStartPayment, apiPaymentStatus, ApiError } from '../../services/api';
import type { PaymentRecord } from '../../types';
import { formatBDT } from '../../lib/currency';

interface CheckoutViewProps {
  paymentId: string;
}

/** Route to the correct result page for a terminal payment. */
function resultPathFor(status: string, id: string): string | null {
  switch (status) {
    case 'PAID': return `/payment/success/${encodeURIComponent(id)}`;
    case 'CANCELLED': return `/payment/cancel/${encodeURIComponent(id)}`;
    case 'FAILED': return `/payment/failed/${encodeURIComponent(id)}`;
    case 'EXPIRED': return `/payment/expired/${encodeURIComponent(id)}`;
    case 'REFUNDED': return `/payment/success/${encodeURIComponent(id)}`;
    default: return null;
  }
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export const CheckoutView: React.FC<CheckoutViewProps> = ({ paymentId }) => {
  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const redirectingRef = useRef(false);

  const go = useCallback((path: string) => {
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    window.location.href = path;
  }, []);

  // ── Load the payment ──
  const load = useCallback(async () => {
    try {
      const p = await apiGetPayment(paymentId);
      setPayment(p);
      setError(null);
      const rp = resultPathFor(p.status, p.payment_id);
      if (rp) go(rp);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'We could not load this payment.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [paymentId, go]);

  useEffect(() => { load(); }, [load]);

  // ── Live countdown ──
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Poll while pending (a payment may complete in another tab) ──
  useEffect(() => {
    if (!payment) return;
    if (payment.status !== 'PENDING' && payment.status !== 'PROCESSING') return;
    const t = setInterval(async () => {
      try {
        const p = await apiPaymentStatus(paymentId, true);
        setPayment(p);
        const rp = resultPathFor(p.status, p.payment_id);
        if (rp) go(rp);
      } catch { /* keep the current view on transient errors */ }
    }, 6000);
    return () => clearInterval(t);
  }, [payment, paymentId, go]);

  const expiresAt = payment?.expires_at ? new Date(payment.expires_at).getTime() : null;
  const remainingMs = expiresAt ? expiresAt - now : null;
  const expired = remainingMs !== null && remainingMs <= 0;

  const handlePay = useCallback(async () => {
    if (!payment || starting) return;
    setStarting(true);
    setStartError(null);
    try {
      const out = await apiStartPayment(payment.payment_id);
      if (out.success && out.checkout_url) {
        // Hand off to the SuperChat BD hosted checkout.
        window.location.href = out.checkout_url;
        return;
      }
      if (out.already_paid || out.status === 'PAID') {
        go(`/payment/success/${encodeURIComponent(payment.payment_id)}`);
        return;
      }
      const rp = resultPathFor(out.status, payment.payment_id);
      if (rp) { go(rp); return; }
      setStartError(out.reason === 'expired' ? 'This payment session has expired.' : 'This payment can no longer be started.');
    } catch (e) {
      setStartError(e instanceof ApiError ? e.message : 'Could not reach the payment gateway. Please try again.');
    } finally {
      setStarting(false);
    }
  }, [payment, starting, go]);

  const copyOrder = async () => {
    if (!payment) return;
    try {
      await navigator.clipboard.writeText(payment.order_id || payment.payment_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked */ }
  };

  // ── Loading ──
  if (loading) {
    return (
      <PaymentShell badge="Secure Checkout">
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
          <p className="text-sm text-slate-400">Preparing your secure checkout…</p>
        </div>
      </PaymentShell>
    );
  }

  // ── Error ──
  if (error || !payment) {
    return (
      <PaymentShell badge="Secure Checkout">
        <div className="mx-auto w-full max-w-sm rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/15 ring-1 ring-rose-500/30">
            <AlertTriangle className="h-7 w-7 text-rose-400" />
          </div>
          <h1 className="mt-4 text-lg font-bold text-white">Payment Not Found</h1>
          <p className="mt-1.5 text-sm text-slate-400">{error || 'This payment link is invalid or has been removed.'}</p>
          <button
            onClick={() => go('/wallet')}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            <Wallet className="h-4 w-4" /> Back to Wallet
          </button>
        </div>
      </PaymentShell>
    );
  }

  const isBusyState = payment.status === 'PROCESSING';
  const disabled = starting || expired || isBusyState;

  return (
    <PaymentShell badge="Secure Checkout" environment={payment.environment}>
      <div className="animate-fade-up space-y-4">
        {/* Amount hero */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-6 text-center shadow-2xl backdrop-blur">
          <div aria-hidden className="absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="relative">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Amount to pay</p>
            <div className="mt-2 flex items-end justify-center gap-1">
              <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-5xl font-extrabold tracking-tight text-transparent">
                {formatBDT(payment.amount, { decimals: 2 })}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">{payment.currency || 'BDT'} · Wallet top-up</p>

            {remainingMs !== null && !expired && (
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-300">
                <Clock className="h-3.5 w-3.5" />
                Expires in {fmtCountdown(remainingMs)}
              </div>
            )}
            {expired && (
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-[11px] font-semibold text-rose-300">
                <AlertTriangle className="h-3.5 w-3.5" /> Session expired
              </div>
            )}
          </div>
        </section>

        {/* Order summary */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Receipt className="h-4 w-4 text-emerald-400" /> Order Summary
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500">Description</dt>
              <dd className="max-w-[62%] text-right font-medium text-slate-200">{payment.description || 'Wallet top-up'}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">Order ID</dt>
              <dd className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-300">
                {payment.order_id || payment.payment_id}
                <button onClick={copyOrder} className="text-slate-500 transition hover:text-emerald-400" title="Copy order ID">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">Customer</dt>
              <dd className="font-medium text-slate-200">{payment.customer_name || '—'}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-white/5 pt-3">
              <dt className="font-semibold text-slate-300">Total</dt>
              <dd className="text-base font-extrabold text-white">{formatBDT(payment.amount, { decimals: 2 })}</dd>
            </div>
          </dl>
        </section>

        {/* Customer information */}
        {(payment.customer_name || payment.customer_email || payment.customer_phone) && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              <UserRound className="h-4 w-4 text-emerald-400" /> Customer Information
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              {payment.customer_name && (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-slate-500">Name</dt>
                  <dd className="font-medium text-slate-200">{payment.customer_name}</dd>
                </div>
              )}
              {payment.customer_email && (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-slate-500">Email</dt>
                  <dd className="font-mono text-xs font-medium text-slate-300">{payment.customer_email}</dd>
                </div>
              )}
              {payment.customer_phone && (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-slate-500">Phone</dt>
                  <dd className="font-mono text-xs font-medium text-slate-300">{payment.customer_phone}</dd>
                </div>
              )}
            </dl>
          </section>
        )}

        {/* Provider */}
        <section className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 ring-1 ring-emerald-500/25">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold text-white">SuperChat BD</p>
              <p className="text-[11px] text-slate-500">bKash · Nagad · Rocket · Card · Bank</p>
            </div>
          </div>
          <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
            Hosted Checkout
          </span>
        </section>

        {/* Status / error */}
        {isBusyState && (
          <div className="flex items-center gap-2.5 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] px-4 py-3 text-sm text-cyan-200">
            <Loader2 className="h-4 w-4 animate-spin" /> Finalising your payment — please wait…
          </div>
        )}
        {startError && (
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {startError}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handlePay}
          disabled={disabled}
          className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-6 py-4 text-base font-bold text-slate-950 shadow-[0_10px_40px_-10px_rgba(16,185,129,0.6)] transition enabled:hover:brightness-110 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {starting ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Opening secure gateway…</>
          ) : expired ? (
            <>Session expired</>
          ) : (
            <><ShieldCheck className="h-5 w-5" /> Pay {formatBDT(payment.amount, { decimals: 2 })} Securely <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" /></>
          )}
        </button>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={load}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.07]"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button
            onClick={() => go(`/payment/cancel/${encodeURIComponent(payment.payment_id)}`)}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.07]"
          >
            <ArrowLeft className="h-4 w-4" /> Cancel
          </button>
        </div>

        <p className="flex items-center justify-center gap-1.5 pt-1 text-center text-[11px] text-slate-500">
          <BadgeCheck className="h-3.5 w-3.5 text-emerald-500/70" />
          You'll be redirected to SuperChat BD's secure checkout
          <ExternalLink className="h-3 w-3" />
        </p>
      </div>
    </PaymentShell>
  );
};

export default CheckoutView;
