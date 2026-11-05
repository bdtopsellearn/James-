import React from 'react';
import { Credits, MembershipPlanItem } from '../../types';
import { ArrowUpRight, Zap, Globe, Clock, ShieldCheck } from 'lucide-react';

interface AllowanceCardProps {
  credits: Credits;
  plan?: MembershipPlanItem;
  onUpgradeClick?: () => void;
}

export const AllowanceCard: React.FC<AllowanceCardProps> = ({
  credits,
  plan,
  onUpgradeClick
}) => {
  const browserPercent = Math.min(100, Math.round((credits.concurrentBrowsers / credits.maxConcurrentBrowsers) * 100));
  const creditPercent = Math.min(100, Math.round((credits.balance / (credits.balance + credits.dailyUsed || 1)) * 100));
  const dailyPercent = Math.min(100, Math.round((credits.dailyUsed / credits.dailyLimit) * 100));

  return (
    <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
              Your Allowance & Limits
            </h2>
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60">
              {plan?.label || 'Pro Plan'}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Real-time capacity allocated across distributed CPM booster nodes.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onUpgradeClick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors cursor-pointer shadow-xs"
          >
            <span>Upgrade Plan</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Track 1: Concurrent Browsers */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              Concurrent Browsers
            </span>
            <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100 font-semibold">
              {credits.concurrentBrowsers} <span className="text-slate-400 font-normal">/ {credits.maxConcurrentBrowsers} max</span>
            </span>
          </div>
          <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5">
            <div
              className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${browserPercent}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[11px] text-slate-400">
            <span>Pool Load: {browserPercent}%</span>
            <span className="text-teal-600 dark:text-teal-400 hover:underline cursor-pointer inline-flex items-center gap-0.5">
              Dedicated IPs <ArrowUpRight className="w-2.5 h-2.5" />
            </span>
          </div>
        </div>

        {/* Track 2: Credits Remaining */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              Credits Balance
            </span>
            <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100 font-semibold">
              {credits.balance.toLocaleString()} <span className="text-slate-400 font-normal">credits</span>
            </span>
          </div>
          <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5">
            <div
              className="h-full bg-gradient-to-r from-teal-600 to-teal-400 rounded-full transition-all duration-500"
              style={{ width: `${creditPercent}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[11px] text-slate-400">
            <span>Lifetime: {credits.lifetimeUsed.toLocaleString()} used</span>
            <span className="text-teal-600 dark:text-teal-400 font-medium">1 credit = 1 visit</span>
          </div>
        </div>

        {/* Track 3: Daily Burst Limit */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              Daily Burst Limit
            </span>
            <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100 font-semibold">
              {credits.dailyUsed} <span className="text-slate-400 font-normal">/ {credits.dailyLimit}</span>
            </span>
          </div>
          <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                dailyPercent > 85 ? 'bg-amber-500' : 'bg-gradient-to-r from-teal-500 to-teal-400'
              }`}
              style={{ width: `${dailyPercent}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[11px] text-slate-400">
            <span>Resets in 22h 14m</span>
            <span className="inline-flex items-center gap-1 text-slate-500">
              <ShieldCheck className="w-3 h-3 text-emerald-500" />
              Cap Protected
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
