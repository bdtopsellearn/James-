import React, { useState } from 'react';
import {
  ShoppingBag,
  Zap,
  Tag,
  Check,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { ShopPackageItem, Wallet, Credits } from '../types';
import { InfoCallout } from '../components/rayobyte/InfoCallout';
import { AnimatedNumber } from '../components/ui/AnimatedNumber';

interface ShopViewProps {
  packages: ShopPackageItem[];
  wallet: Wallet;
  credits: Credits;
  onBuyPackage: (pkg: ShopPackageItem, promoCode?: string) => void | boolean | Promise<boolean | void>;
  onApplyPromo: (code: string) => { discount: number; bonus: number } | null;
  trialClaimed?: boolean;
  onClaimTrial?: () => void | Promise<void>;
}

export const ShopView: React.FC<ShopViewProps> = ({
  packages,
  wallet,
  credits,
  onBuyPackage,
  onApplyPromo,
  trialClaimed = false,
  onClaimTrial
}) => {
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discount: number; bonus: number } | null>(null);
  const [selectedPkg, setSelectedPkg] = useState<ShopPackageItem | null>(null);
  const [isBuying, setIsBuying] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const handleClaimTrial = async () => {
    if (claiming || !onClaimTrial) return;
    setClaiming(true);
    try {
      await onClaimTrial();
    } finally {
      setClaiming(false);
    }
  };

  const handleApplyPromo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoCode.trim()) return;
    const res = onApplyPromo(promoCode.trim());
    if (res) {
      setAppliedPromo({ code: promoCode.trim().toUpperCase(), ...res });
      alert(`Promo code applied: ${res.discount}% discount + ${res.bonus} bonus credits!`);
    } else {
      alert('Invalid or expired promo code.');
    }
  };

  const handleConfirmPurchase = async () => {
    if (!selectedPkg || isBuying) return;
    const effectivePrice = appliedPromo
      ? selectedPkg.price * (1 - appliedPromo.discount / 100)
      : selectedPkg.price;

    if (wallet.balance < effectivePrice) {
      alert(`Insufficient wallet balance (৳${wallet.balance.toFixed(2)}). Please top up your wallet first.`);
      return;
    }

    // wait for the server: the success box must only appear when the purchase really went through
    setIsBuying(true);
    let result: boolean | void = undefined;
    try {
      result = await onBuyPackage(selectedPkg);
    } finally {
      setIsBuying(false);
    }
    setSelectedPkg(null);
    if (result === false) return;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Impression Credit Packages
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Exchange your wallet funds directly for high-speed CPM-boosted impression credits. 1 credit = 1 delivered visit.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 text-xs">
            <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Your Wallet Balance</span>
            <span className="font-mono font-bold text-teal-600 dark:text-teal-400 text-base tabular-nums">
              ৳{wallet.balance.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <InfoCallout
        title="Instant Non-Expiring Credits"
        message="Credits purchased from the Impression Shop never expire and roll over indefinitely across membership tiers."
      />

      {/* Free Trial Banner */}
      {!trialClaimed && onClaimTrial && (
        <div className="p-5 rounded-xl border border-teal-300 dark:border-teal-800 bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-950/50 dark:to-emerald-950/40 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-600/10 dark:bg-teal-500/20 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Claim your free welcome trial</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Get <strong className="text-teal-700 dark:text-teal-300">10 free impression credits</strong> instantly — one per account, no payment needed.
              </p>
            </div>
          </div>
          <button
            onClick={handleClaimTrial}
            disabled={claiming}
            className="px-5 py-2.5 text-xs font-bold rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed text-white transition-colors cursor-pointer shrink-0 flex items-center gap-2"
          >
            {claiming ? 'Claiming…' : 'Claim 10 Free Credits'}
          </button>
        </div>
      )}

      {/* Promo Code Bar */}
      <div className="p-4 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Have a promotional code or voucher?
          </span>
        </div>

        <form onSubmit={handleApplyPromo} className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Enter promo code"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            className="flex-1 min-w-0 w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 uppercase focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
          <button
            type="submit"
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 transition-opacity cursor-pointer shrink-0"
          >
            Apply Code
          </button>
        </form>
      </div>

      {appliedPromo && (
        <div className="p-3 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 text-xs text-teal-800 dark:text-teal-300 flex items-center justify-between font-mono">
          <span>Active Code: <strong>{appliedPromo.code}</strong> ({appliedPromo.discount}% off + {appliedPromo.bonus} bonus credits)</span>
          <button onClick={() => setAppliedPromo(null)} className="text-[11px] underline cursor-pointer">Remove</button>
        </div>
      )}

      {/* 6-Card Package Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {packages.filter(p => p.enabled).map((pkg) => {
          const discountMultiplier = appliedPromo ? 1 - appliedPromo.discount / 100 : 1;
          const finalPrice = Math.round(pkg.price * discountMultiplier * 100) / 100;
          const totalCredits = pkg.credits + pkg.bonus + (appliedPromo?.bonus || 0);

          return (
            <div
              key={pkg.id}
              className={`p-6 rounded-xl border bg-white dark:bg-[#0f172a] transition-all flex flex-col justify-between shadow-xs relative ${
                pkg.badge ? 'border-teal-500/80 ring-1 ring-teal-500/20' : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              {pkg.badge && (
                <span className="absolute -top-2.5 right-4 px-2 py-0.5 text-[9px] font-bold tracking-wider rounded-full bg-teal-600 text-white uppercase shadow-xs">
                  {pkg.badge}
                </span>
              )}

              <div>
                <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400">
                  <Zap className="w-5 h-5 fill-current" />
                  <span className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    <AnimatedNumber value={pkg.credits} />
                  </span>
                  <span className="text-xs text-slate-500">Credits</span>
                </div>

                {pkg.bonus > 0 && (
                  <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-mono font-semibold">
                    <Sparkles className="w-3 h-3" />
                    <span>+{pkg.bonus.toLocaleString()} Extra Bonus Visits</span>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-slate-500 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span>Rate per 1k visits:</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200 font-medium">
                      ৳{((pkg.price / (pkg.credits / 1000))).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Effective Volume:</span>
                    <span className="font-mono font-semibold text-teal-600 dark:text-teal-400">
                      {totalCredits.toLocaleString()} visits
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  {appliedPromo && (
                    <span className="text-xs text-slate-400 line-through mr-1 font-mono">
                      ৳{pkg.price}
                    </span>
                  )}
                  <span className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                    ৳{finalPrice.toFixed(2)}
                  </span>
                </div>

                <button
                  onClick={() => setSelectedPkg(pkg)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <span>Buy Package</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation Modal */}
      {selectedPkg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto overscroll-contain">
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-sm w-full p-6 space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Confirm Credit Purchase
            </h3>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 font-mono text-xs space-y-2">
              <div className="flex justify-between">
                <span>Base Credits:</span>
                <span>{selectedPkg.credits.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-emerald-600">
                <span>Bonus Credits:</span>
                <span>+{selectedPkg.bonus + (appliedPromo?.bonus || 0)}</span>
              </div>
              <div className="flex justify-between font-bold border-t border-slate-200 dark:border-slate-700 pt-1 text-slate-900 dark:text-slate-100">
                <span>Total Amount:</span>
                <span>৳{(appliedPromo ? selectedPkg.price * (1 - appliedPromo.discount / 100) : selectedPkg.price).toFixed(2)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedPkg(null)}
                disabled={isBuying}
                className="px-4 py-2 text-xs font-medium rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPurchase}
                disabled={isBuying}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer shadow-xs disabled:opacity-70 disabled:cursor-wait inline-flex items-center gap-2"
              >
                {isBuying && <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                {isBuying ? 'Processing…' : 'Deduct from Wallet & Credit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
