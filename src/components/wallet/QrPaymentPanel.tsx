import React, { useMemo, useState } from 'react';
import { Wallet as WalletIcon, Copy, Check, ExternalLink, ChevronDown, Coins, Smartphone } from 'lucide-react';
import { USD_TO_BDT, RATE_LABEL } from '../../lib/currency';

interface PaymentDetailsPanelProps {
  methodKey: string;
  methodName: string;
  methodNumber: string;
}

const CRYPTO_KEYS = ['binance', 'usdt', 'usdt_trc20', 'trc20', 'btc', 'eth'];

/**
 * Payment Details — a second, independent top-up channel that sits beside the manual
 * deposit form. It shows the recipient account / wallet address with one-tap copy and
 * a deep-link to the relevant app, plus the live USD↔BDT preview for crypto methods
 * at the fixed reference rate (1 USD = ৳128). No QR codes are used anywhere.
 */
export const PaymentDetailsPanel: React.FC<PaymentDetailsPanelProps> = ({ methodKey, methodName, methodNumber }) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState('1000');

  const isCrypto = CRYPTO_KEYS.includes(String(methodKey).toLowerCase());
  const number = (methodNumber || '').trim();

  const usdPreview = useMemo(() => {
    const bdt = parseFloat(amount) || 0;
    return bdt / USD_TO_BDT;
  }, [amount]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(number);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = number; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      } catch { return; }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const openApp = () => {
    if (!number) return;
    // Deep-link best-effort — opens the relevant wallet/app on mobile.
    const deep = isCrypto ? `https://www.binance.com/en/pay` : `https://www.google.com/search?q=${encodeURIComponent((methodName || '') + ' ' + number)}`;
    window.open(deep, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-50/70 to-fuchsia-50/40 dark:from-violet-950/30 dark:to-fuchsia-950/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full min-h-12 flex items-center justify-between gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-violet-500/5"
      >
        <span className="flex items-center gap-3 text-left">
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shrink-0">
            <WalletIcon className="w-5 h-5" />
          </span>
          <span>
            <span className="block text-sm font-extrabold tracking-wide text-slate-900 dark:text-white">Payment Details</span>
            <span className="block text-[11px] text-violet-700/80 dark:text-violet-300/80">
              {isCrypto ? `Send crypto directly \u00b7 ${RATE_LABEL}` : 'Copy the account number to send payment'}
            </span>
          </span>
        </span>
        <ChevronDown className={`w-5 h-5 shrink-0 text-violet-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 animate-fade-up">
          {!number ? (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              No account/address is configured for this method yet. Please pick another method or contact support.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                  {isCrypto ? <Coins className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
                  {isCrypto ? 'Wallet address' : 'Recipient account'}
                </span>
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 select-all truncate">{number}</span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-violet-600 hover:bg-violet-700 text-white cursor-pointer transition-colors shrink-0"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={openApp}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-violet-700 dark:text-violet-300 hover:underline cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open {isCrypto ? 'Binance Pay' : methodName}
                </button>
              </div>

              {isCrypto && (
                <div className="p-3 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-violet-500/20 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    <span>Amount in ৳ (BDT)</span>
                    <span className="text-violet-700 dark:text-violet-300">{RATE_LABEL}</span>
                  </div>
                  <input
                    type="number"
                    min="50"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none focus:border-violet-500"
                  />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">You pay (approx.)</span>
                    <span className="font-mono font-bold text-violet-700 dark:text-violet-300">
                      ${usdPreview.toFixed(2)} <span className="text-[10px] font-normal text-slate-400">USDT</span>
                    </span>
                  </div>
                  <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Crypto is settled at the fixed rate <strong>{RATE_LABEL}</strong>. Send the exact USDT amount, then submit the
                    transaction hash in the deposit form so the network can verify and credit your wallet.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
