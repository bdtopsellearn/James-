import React, { useEffect, useState } from 'react';
import { Target, Rocket, X, Wallet, Sparkles, Loader2, Gauge, BellRing } from 'lucide-react';

interface StartLimitModalProps {
  open: boolean;
  type: 'normal' | 'smartlink';
  /** Human label for what is being started (link name or "All links"). */
  scopeLabel?: string;
  /** Available impression balance (credits). */
  balance: number;
  onClose: () => void;
  onConfirm: (amount: number) => void | Promise<void>;
}

const PRESETS = [100, 200, 500, 1000, 5000];

/**
 * Shown whenever a user starts a Normal Link or SmartLink campaign.
 * The user picks how many successful impressions to deliver; the engine
 * starts and then auto-stops (with a notification) once the target is hit.
 */
export const StartLimitModal: React.FC<StartLimitModalProps> = ({
  open,
  type,
  scopeLabel,
  balance,
  onClose,
  onConfirm,
}) => {
  const [selected, setSelected] = useState<number>(500);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setCustom('');
    // Default to the largest preset the user can actually afford so the modal
    // never opens already showing an "exceeds your balance" error. If the
    // balance is below the smallest preset, pre-fill the full balance instead.
    const affordable = PRESETS.filter((p) => p <= balance);
    if (affordable.length) {
      setSelected(affordable[affordable.length - 1]);
    } else {
      setSelected(0);
      setCustom(balance > 0 ? String(Math.floor(balance)) : '');
    }
  }, [open, balance]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const amount = custom ? Math.max(0, parseInt(custom, 10) || 0) : selected;
  const exceeds = amount > balance;
  const typeLabel = type === 'smartlink' ? 'SmartLink' : 'Normal Link';

  const handleConfirm = async () => {
    if (amount <= 0 || exceeds || busy) return;
    setBusy(true);
    try {
      await onConfirm(amount);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative p-5 bg-gradient-to-br from-teal-600 via-teal-600 to-cyan-600 text-white">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm">
                <Rocket className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-bold leading-tight">Start {typeLabel} Campaign</h3>
                <p className="text-[11px] text-white/80 mt-0.5 truncate max-w-[220px]">
                  {scopeLabel || `All ${typeLabel}s`}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/15 text-white/90 cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Balance */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <span className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Wallet className="w-3.5 h-3.5" /> Available impressions
            </span>
            <span className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100 tabular-nums">
              {balance.toLocaleString()}
            </span>
          </div>

          {/* Presets */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              <Target className="w-3.5 h-3.5 text-teal-600" />
              Set your visit limit
            </label>
            <div className="grid grid-cols-5 gap-2">
              {PRESETS.map((p) => {
                const active = !custom && selected === p;
                const disabled = p > balance;
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setSelected(p);
                      setCustom('');
                    }}
                    className={`py-2 rounded-lg border text-xs font-bold transition-all cursor-pointer tabular-nums ${
                      active
                        ? 'border-teal-500 ring-1 ring-teal-500 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300'
                        : disabled
                        ? 'border-slate-100 dark:border-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-teal-400'
                    }`}
                  >
                    {p >= 1000 ? `${p / 1000}k` : p}
                  </button>
                );
              })}
            </div>

            <div className="mt-2.5 relative">
              <Gauge className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="number"
                min={1}
                placeholder="Custom amount…"
                value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full pl-8 pr-3 py-2.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
            {exceeds && (
              <p className="text-[11px] text-rose-500 mt-1.5">
                Amount exceeds your available balance of {balance.toLocaleString()}.
              </p>
            )}
          </div>

          {/* Info */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200/70 dark:border-teal-900/50">
            <BellRing className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-teal-800 dark:text-teal-200">
              The engine will deliver up to{' '}
              <b className="font-mono">{amount.toLocaleString()}</b> successful impressions, then{' '}
              <b>automatically stop</b> and notify you that your target was reached. Credits are only charged on
              successful visits.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={amount <= 0 || exceeds || busy}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white cursor-pointer shadow-sm transition-colors"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Start Campaign
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
