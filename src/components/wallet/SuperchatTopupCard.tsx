import React, { useCallback, useMemo, useState } from 'react';
import {
  Zap,
  ShieldCheck,
  Loader2,
  ArrowRight,
  AlertCircle,
  Smartphone,
  CreditCard,
  Landmark,
} from 'lucide-react';
import { apiCreatePayment, ApiError } from '../../services/api';
import { formatBDT } from '../../lib/currency';

interface SuperchatTopupCardProps {
  /** Optional starting amount (BDT). */
  initialAmount?: number;
  /** Called with the new payment id so the host can route to /checkout/:id. */
  onCreated?: (paymentId: string, checkoutUrl: string | null) => void;
}

const QUICK = [100, 500, 1000, 2000, 5000];

function newIdempotencyKey(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch { /* ignore */ }
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Primary wallet top-up entry — creates a SuperChat BD hosted-checkout payment
 * and hands the user off to /checkout/:id. The amount is re-validated and
 * re-priced on the server; nothing here is trusted for money movement.
 */
export const SuperchatTopupCard: React.FC<SuperchatTopupCardProps> = ({ initialAmount = 500, onCreated }) => {
  const [amount, setAmount] = useState<string>(String(initialAmount));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) ? n : 0;
  }, [amount]);

  const valid = parsed >= 10;

  const handlePay = useCallback(async () => {
    if (busy) return;
    setError(null);
    if (!valid) { setError('Please enter an amount of at least ৳10.'); return; }
    setBusy(true);
    try {
      const out = await apiCreatePayment({
        amount: parsed,
        description: 'Wallet top-up',
        idempotencyKey: newIdempotencyKey(),
      });
      const id = out.payment.payment_id;
      if (onCreated) onCreated(id, out.checkout_url || null);
      else window.location.href = `/checkout/${encodeURIComponent(id)}`;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start the payment. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, valid, parsed, onCreated]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.08] via-teal-500/[0.04] to-cyan-500/[0.06] p-6 shadow-sm">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/20 blur-3xl" />

      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_6px_20px_-6px_rgba(16,185,129,0.7)]">
              <Zap className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Instant Top-up</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Credited automatically — no waiting for approval</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-300">
            <ShieldCheck className="h-3 w-3" /> Powered by SuperChat BD
          </span>
        </div>

        {/* Amount */}
        <div className="mt-5">
          <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Top-up Amount (৳ BDT)
          </label>
          <div className="flex flex-wrap gap-2">
            {QUICK.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(String(v))}
                className={`rounded-lg border px-3 py-1.5 text-xs font-mono font-semibold transition-colors cursor-pointer ${
                  parsed === v
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-400'
                }`}
              >
                ৳{v.toLocaleString()}
              </button>
            ))}
          </div>
          <div className="relative mt-2.5">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">৳</span>
            <input
              type="number"
              min={10}
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-8 pr-3 text-sm font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handlePay}
          disabled={busy || !valid}
          className="group mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-3.5 text-sm font-bold text-slate-950 shadow-[0_10px_30px_-10px_rgba(16,185,129,0.6)] transition enabled:hover:brightness-110 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Opening secure checkout…</>
          ) : (
            <><ShieldCheck className="h-4 w-4" /> Pay {valid ? formatBDT(parsed, { decimals: 0 }) : ''} Securely <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>
          )}
        </button>

        <div className="mt-3 flex items-center justify-center gap-3 text-[10px] font-medium text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1"><Smartphone className="h-3 w-3" /> bKash</span>
          <span className="inline-flex items-center gap-1"><Smartphone className="h-3 w-3" /> Nagad</span>
          <span className="inline-flex items-center gap-1"><Smartphone className="h-3 w-3" /> Rocket</span>
          <span className="inline-flex items-center gap-1"><CreditCard className="h-3 w-3" /> Card</span>
          <span className="inline-flex items-center gap-1"><Landmark className="h-3 w-3" /> Bank</span>
        </div>
      </div>
    </div>
  );
};

export default SuperchatTopupCard;
