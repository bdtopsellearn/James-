import React, { useState } from 'react';
import {
  Crown,
  Check,
  Zap,
  Clock,
  Shield,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { MembershipPlanItem, User, Wallet } from '../types';
import { InfoCallout } from '../components/rayobyte/InfoCallout';
import { AnimatedNumber } from '../components/ui/AnimatedNumber';
import { MembershipBadge } from '../components/ui/MembershipBadge';

import { useToast } from '../components/ui/Toast';
interface MembershipViewProps {
  plans: MembershipPlanItem[];
  user: User;
  wallet: Wallet;
  onUpgradePlan: (planId: string) => void | Promise<void>;
}

export const MembershipView: React.FC<MembershipViewProps> = ({
  plans,
  user,
  wallet,
  onUpgradePlan
}) => {
  const { showToast } = useToast();
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<MembershipPlanItem | null>(null);
  const currentPlan = plans.find(p => p.id === user.membershipPlanId) || plans[0];
  const expiresDate = new Date(user.membershipExpiresAt);
  const daysLeft = isNaN(expiresDate.getTime()) ? 0 : Math.max(0, Math.ceil((expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  // Step 1 — validate funds and open the confirmation dialog (never charge on a single tap).
  const handleSelectPlan = (plan: MembershipPlanItem) => {
    if (busyPlanId) return; // one purchase at a time, so a double tap can never charge twice
    if (wallet.balance < plan.price) {
      showToast('Not enough balance', `Your wallet has ৳${wallet.balance.toFixed(2)} but this plan costs ৳${plan.price}. Please top up first.`, 'error');
      return;
    }
    setPendingPlan(plan);
  };

  // Step 2 — the user explicitly confirmed; run the real purchase.
  const handleConfirmPurchase = async () => {
    const plan = pendingPlan;
    if (!plan || busyPlanId) return;
    setBusyPlanId(plan.id);
    try {
      await onUpgradePlan(plan.id); // the result (success / error) is shown by the parent
    } finally {
      setBusyPlanId(null);
      setPendingPlan(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Active Status Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Membership Tiers & Quotas
            </h1>
            <MembershipBadge plan={user.membershipPlanId} expiresAt={user.membershipExpiresAt} size="md" showLabel adminRole={user.role === 'admin' ? (user.adminRole === 'super_admin' ? 'super_admin' : 'admin') : undefined} />
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800">
              Active Tier: {currentPlan?.label}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Higher tiers unlock expanded link slots, priority CPM booster concurrency, and custom Gaussian CPM tuning.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 text-right min-w-[200px]">
          <span className="text-[11px] font-medium text-teal-800 dark:text-teal-300 uppercase tracking-wider block">
            Plan Validity Countdown
          </span>
          <span className="text-2xl font-bold font-mono text-teal-600 dark:text-teal-400 tabular-nums">
            <AnimatedNumber value={daysLeft} /> Days Left
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">
            Expires on {expiresDate.toLocaleDateString()}
          </span>
        </div>
      </div>

      <InfoCallout
        title="Immediate Quota Provisioning"
        message="Upgrading your tier instantly increases your simultaneous link limits and expands your concurrency pool without stopping in-flight traffic runs."
      />

      {/* 3-Column Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.filter(p => p.enabled).map((plan) => {
          const isCurrent = user.membershipPlanId === plan.id;

          return (
            <div
              key={plan.id}
              className={`p-6 rounded-xl border bg-white dark:bg-[#0f172a] flex flex-col justify-between transition-all shadow-xs relative ${
                isCurrent
                  ? 'border-teal-500 ring-2 ring-teal-500/20 shadow-md'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
              }`}
            >
              {isCurrent && (
                <span className="absolute -top-3 left-6 px-3 py-0.5 text-[10px] font-bold tracking-wider rounded-full bg-teal-600 text-white uppercase shadow-xs">
                  Your Current Plan
                </span>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {plan.label}
                  </h3>
                  <span className="text-xs font-mono text-slate-400">
                    {plan.days} Days Access
                  </span>
                </div>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                    ৳{plan.price}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">/ billing cycle</span>
                </div>

                {plan.bonusCredits > 0 && (
                  <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-mono font-semibold">
                    <Sparkles className="w-3 h-3" />
                    <span>+{plan.bonusCredits} Welcome Bonus Credits</span>
                  </div>
                )}

                {/* Quota Specs */}
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs font-mono space-y-1.5 text-slate-600 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span>Link Slot Limit:</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{plan.linkLimit} links</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Daily Burst Cap:</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{plan.dailyBurstLimit} visits</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Visits / Link / Day:</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{plan.visitsPerLink}</span>
                  </div>
                </div>

                {/* Feature checklist */}
                <ul className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                  {plan.features.map((feat, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => handleSelectPlan(plan)}
                  disabled={!!busyPlanId}
                  className={`w-full py-2.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-60 disabled:cursor-wait ${
                    isCurrent
                      ? 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                      : 'bg-teal-600 hover:bg-teal-700 text-white'
                  }`}
                >
                  {busyPlanId === plan.id && <span className="w-3 h-3 rounded-full border-2 border-current/40 border-t-current animate-spin" />}
                  <span>{busyPlanId === plan.id ? 'Processing…' : isCurrent ? 'Extend Subscription' : 'Upgrade to Plan'}</span>
                  {busyPlanId !== plan.id && <ArrowRight className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Membership Purchase Confirmation Modal */}
      {pendingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto overscroll-contain">
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-sm w-full p-6 space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-500" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Confirm Membership Purchase
              </h3>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              You are about to activate <span className="font-semibold text-slate-700 dark:text-slate-200">{pendingPlan.label}</span> for {pendingPlan.days} days. This amount will be deducted from your wallet balance.
            </p>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 font-mono text-xs space-y-2">
              <div className="flex justify-between">
                <span>Plan:</span>
                <span>{pendingPlan.label}</span>
              </div>
              <div className="flex justify-between">
                <span>Duration:</span>
                <span>{pendingPlan.days} days</span>
              </div>
              <div className="flex justify-between">
                <span>Link Slots:</span>
                <span>{pendingPlan.linkLimit} links</span>
              </div>
              {pendingPlan.bonusCredits > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Bonus Credits:</span>
                  <span>+{pendingPlan.bonusCredits.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1.5">
                <span>Wallet Balance:</span>
                <span>৳{wallet.balance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 dark:text-slate-100">
                <span>Total Charge:</span>
                <span>-৳{pendingPlan.price.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-teal-600 dark:text-teal-400 font-bold border-t border-slate-200 dark:border-slate-700 pt-1.5">
                <span>Remaining After:</span>
                <span>৳{Math.max(0, wallet.balance - pendingPlan.price).toFixed(2)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setPendingPlan(null)}
                disabled={!!busyPlanId}
                className="px-4 py-2 text-xs font-medium rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPurchase}
                disabled={!!busyPlanId}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer shadow-xs disabled:opacity-70 disabled:cursor-wait inline-flex items-center gap-2"
              >
                {busyPlanId && <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                {busyPlanId ? 'Processing\u2026' : 'Confirm & Pay from Wallet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
