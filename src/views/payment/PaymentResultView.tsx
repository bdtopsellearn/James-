import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Wallet,
  Receipt,
  Copy,
  Check,
  RefreshCw,
  ShieldCheck,
  PartyPopper,
  Ban,
  Sparkles,
} from 'lucide-react';
import { PaymentShell } from './PaymentShell';
import { apiGetPayment, apiPaymentStatus, apiVerifyPayment, ApiError } from '../../services/api';
import type { PaymentRecord } from '../../types';
import { formatBDT } from '../../lib/currency';
import type { ResultKind } from './paymentRoutes';

export type { ResultKind };

interface PaymentResultViewProps {
  paymentId: string;
  kind: ResultKind;
}

const BADGE: Record<ResultKind, string> = {
  success: 'Payment Result',
  cancel: 'Payment Cancelled',
  failed: 'Payment Result',
  expired: 'Payment Result',
  'already-paid': 'Payment Result',
};

function fmtWhen(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/** A single presentational result card used by every terminal state. */
const ResultCard: React.FC<{
  tone: 'success' | 'warn' | 'error' | 'info';
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}> = ({ tone, icon, title, subtitle, children }) => {
  const ring =
    tone === 'success' ? 'ring-emerald-500/30 bg-emerald-500/15'
    : tone === 'warn' ? 'ring-amber-500/30 bg-amber-500/15'
    : tone === 'error' ? 'ring-rose-500/30 bg-rose-500/15'
    : 'ring-cyan-500/30 bg-cyan-500/15';
  const text =
    tone === 'success' ? 'text-emerald-400'
    : tone === 'warn' ? 'text-amber-400'
    : tone === 'error' ? 'text-rose-400'
    : 'text-cyan-400';
  return (
    <div className="animate-fade-up rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center shadow-2xl backdrop-blur sm:p-8">
      <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ring-1 ${ring} ${text} animate-pop`}>
        {icon}
      </div>
      <h1 className="mt-5 text-xl font-extrabold tracking-tight text-white sm:text-2xl">{title}</h1>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-400">{subtitle}</p>
      {children}
    </div>
  );
};

const ActionButtons: React.FC<{ onRetry?: () => void; retryLabel?: string }> = ({ onRetry, retryLabel = 'Try Again' }) => (
  <div className="mt-6 space-y-2.5">
    {onRetry && (
      <button
        onClick={onRetry}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-[0_10px_40px_-12px_rgba(16,185,129,0.6)] transition hover:brightness-110 active:scale-[0.99]"
      >
        <RefreshCw className="h-4 w-4" /> {retryLabel}
      </button>
    )}
    <button
      onClick={() => { window.location.href = '/wallet'; }}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
    >
      <Wallet className="h-4 w-4" /> Back to Wallet
    </button>
  </div>
);

export const PaymentResultView: React.FC<PaymentResultViewProps> = ({ paymentId, kind }) => {
  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(kind === 'success');
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<number | null>(null);
  const attemptsRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const p = await apiGetPayment(paymentId);
      setPayment(p);
      setError(null);
      return p;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'We could not load this payment.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [paymentId]);

  // Initial load (+ a forced server-side verification on the success page).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await load();
      if (cancelled) return;
      if (kind === 'success' && p && p.status !== 'PAID') {
        try {
          const out = await apiVerifyPayment(paymentId);
          if (!cancelled) setPayment(out.payment);
        } catch { /* fall back to polling */ }
      }
    })();
    return () => { cancelled = true; };
  }, [load, kind, paymentId]);

  // On the success page, keep polling until the payment is confirmed PAID
  // (webhooks can take a few seconds to arrive).
  useEffect(() => {
    if (kind !== 'success') return;
    if (payment && payment.status === 'PAID') { setConfirming(false); return; }
    if (attemptsRef.current >= 15) { setConfirming(false); return; }
    pollRef.current = window.setTimeout(async () => {
      attemptsRef.current += 1;
      try {
        const p = await apiPaymentStatus(paymentId, true);
        setPayment(p);
        if (p.status === 'PAID') setConfirming(false);
      } catch { /* keep trying */ }
    }, 4000);
    return () => { if (pollRef.current) window.clearTimeout(pollRef.current); };
  }, [kind, payment, paymentId]);

  const copyOrder = async () => {
    if (!payment) return;
    try {
      await navigator.clipboard.writeText(payment.order_id || payment.payment_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked */ }
  };

  const OrderMeta: React.FC = () => {
    if (!payment) return null;
    return (
      <dl className="mt-6 space-y-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-slate-500">Amount</dt>
          <dd className="font-bold text-white">{formatBDT(payment.amount, { decimals: 2 })}</dd>
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
          <dt className="text-slate-500">{kind === 'success' ? 'Paid at' : 'Updated'}</dt>
          <dd className="text-xs font-medium text-slate-300">{fmtWhen(kind === 'success' ? (payment.paid_at || payment.updated_at) : payment.updated_at)}</dd>
        </div>
      </dl>
    );
  };

  // ── Loading ──
  if (loading) {
    return (
      <PaymentShell badge={BADGE[kind]}>
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
          <p className="text-sm text-slate-400">Checking your payment…</p>
        </div>
      </PaymentShell>
    );
  }

  // ── Unknown payment ──
  if (error || !payment) {
    return (
      <PaymentShell badge={BADGE[kind]}>
        <ResultCard
          tone="error"
          icon={<AlertTriangle className="h-9 w-9" />}
          title="Payment Not Found"
          subtitle={error || 'This payment link is invalid or has been removed.'}
        >
          <ActionButtons />
        </ResultCard>
      </PaymentShell>
    );
  }

  const env = payment.environment;

  // ── SUCCESS ──
  if (kind === 'success') {
    if (payment.status === 'PAID') {
      return (
        <PaymentShell badge="Payment Successful" environment={env}>
          <ResultCard
            tone="success"
            icon={<CheckCircle2 className="h-10 w-10" />}
            title="Payment Successful!"
            subtitle={`Your wallet has been topped up with ${formatBDT(payment.amount, { decimals: 2 })}.`}
          >
            <div className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-3 text-sm font-semibold text-emerald-200">
              <PartyPopper className="h-4 w-4" /> {payment.fulfilled ? 'Balance credited to your wallet' : 'Payment confirmed — crediting shortly'}
            </div>
            <OrderMeta />
            <ActionButtons />
            <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500/70" /> Verified server-side with SuperChat BD
            </p>
          </ResultCard>
        </PaymentShell>
      );
    }

    if (confirming || payment.status === 'PENDING' || payment.status === 'PROCESSING') {
      return (
        <PaymentShell badge="Confirming Payment" environment={env}>
          <ResultCard
            tone="info"
            icon={<Loader2 className="h-10 w-10 animate-spin" />}
            title="Confirming Your Payment"
            subtitle="We're verifying your payment with SuperChat BD. This usually takes a few seconds — please keep this page open."
          >
            <OrderMeta />
            <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-500">
              <Sparkles className="h-3.5 w-3.5 text-cyan-400/70" /> Auto-checking every few seconds…
            </div>
          </ResultCard>
        </PaymentShell>
      );
    }

    // Reached the success URL but the payment is not actually paid.
    return (
      <PaymentShell badge="Payment Result" environment={env}>
        <ResultCard
          tone="warn"
          icon={<AlertTriangle className="h-9 w-9" />}
          title="Payment Not Completed"
          subtitle="We could not confirm a successful payment for this order. If money left your account, it will be reconciled automatically — contact support with your Order ID."
        >
          <OrderMeta />
          <ActionButtons />
        </ResultCard>
      </PaymentShell>
    );
  }

  // ── CANCELLED ──
  if (kind === 'cancel') {
    return (
      <PaymentShell badge="Payment Cancelled" environment={env}>
        <ResultCard
          tone="warn"
          icon={<Ban className="h-9 w-9" />}
          title="Payment Cancelled"
          subtitle="You cancelled the checkout. No money has been deducted from your account."
        >
          <OrderMeta />
          <ActionButtons retryLabel="Start a New Top-up" />
        </ResultCard>
      </PaymentShell>
    );
  }

  // ── FAILED ──
  if (kind === 'failed') {
    return (
      <PaymentShell badge="Payment Failed" environment={env}>
        <ResultCard
          tone="error"
          icon={<XCircle className="h-9 w-9" />}
          title="Payment Failed"
          subtitle="Your payment could not be completed. No money has been deducted — please try again with a different method."
        >
          <OrderMeta />
          <ActionButtons retryLabel="Try Again" />
        </ResultCard>
      </PaymentShell>
    );
  }

  // ── EXPIRED ──
  if (kind === 'expired') {
    return (
      <PaymentShell badge="Session Expired" environment={env}>
        <ResultCard
          tone="warn"
          icon={<Clock className="h-9 w-9" />}
          title="Payment Session Expired"
          subtitle="This checkout session timed out before it was completed. Please start a new top-up."
        >
          <OrderMeta />
          <ActionButtons retryLabel="Start a New Top-up" />
        </ResultCard>
      </PaymentShell>
    );
  }

  // ── ALREADY PAID ──
  return (
    <PaymentShell badge="Already Paid" environment={env}>
      <ResultCard
        tone="success"
        icon={<CheckCircle2 className="h-10 w-10" />}
        title="Already Paid"
        subtitle={`This order has already been paid${payment.paid_at ? ` on ${fmtWhen(payment.paid_at)}` : ''}. You have not been charged again.`}
      >
        <div className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-3 text-sm font-semibold text-emerald-200">
          <Receipt className="h-4 w-4" /> {formatBDT(payment.amount, { decimals: 2 })} credited to your wallet
        </div>
        <OrderMeta />
        <ActionButtons />
      </ResultCard>
    </PaymentShell>
  );
};

export default PaymentResultView;
