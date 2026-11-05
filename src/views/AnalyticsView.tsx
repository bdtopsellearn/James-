import React from 'react';
import {
  BarChart3,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Eye,
  Activity,
  Layers,
  Gauge,
} from 'lucide-react';
import { NormalLink, SmartLink, Credits, LiveImpression } from '../types';
import { AnimatedNumber } from '../components/ui/AnimatedNumber';

interface AnalyticsViewProps {
  links: NormalLink[];
  smartlinks: SmartLink[];
  credits: Credits;
  impressions?: LiveImpression[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  links,
  smartlinks,
  credits,
  impressions = [],
}) => {
  // ────────────────────────────────────────────────────────────────────────────
  // SINGLE SOURCE OF TRUTH
  // The server's bot writes `stats[uid].total_impressions` for every confirmed
  // delivery and exposes it here as `credits.totalImpressions`. This is the SAME
  // value shown on the Dashboard, Traffic Control, Live Monitor and History, so
  // the analytics page must use it too — never the per-link rolling counters,
  // which only hold a recent window and can lag behind the real total.
  // ────────────────────────────────────────────────────────────────────────────
  const lifetimeImpressions = Math.max(0, Math.floor(Number(credits.totalImpressions) || 0));

  // Recent telemetry (last ~500 log rows) — used ONLY for the delivery-health
  // breakdown, never for the lifetime impression total.
  const totalAttempts = impressions.length;
  const successCount = impressions.filter((i) => i.status === 'success').length;
  const failedCount = impressions.filter((i) => i.status === 'failed').length;
  const recentSuccessRate =
    totalAttempts > 0 ? ((successCount / totalAttempts) * 100).toFixed(1) : '0.0';

  // Configured targets.
  const smartTargets = smartlinks.length;
  const normalTargets = links.length;
  const totalTargets = smartTargets + normalTargets;

  // Traffic share — prefer real per-link telemetry, fall back to the configured
  // target mix when the bot has not yet written per-link counters.
  const smartTracked = smartlinks.reduce((a, s) => a + (Number(s.stats?.visits) || 0), 0);
  const normalTracked = links.reduce((a, l) => a + (Number(l.stats?.visits) || 0), 0);
  const trackedTotal = smartTracked + normalTracked;

  let smartShare = 0;
  let normalShare = 0;
  if (trackedTotal > 0) {
    smartShare = Math.round((smartTracked / trackedTotal) * 100);
    normalShare = 100 - smartShare;
  } else if (totalTargets > 0) {
    smartShare = Math.round((smartTargets / totalTargets) * 100);
    normalShare = 100 - smartShare;
  }

  const smartImpressions =
    trackedTotal > 0 ? smartTracked : Math.round((smartShare / 100) * lifetimeImpressions);
  const normalImpressions =
    trackedTotal > 0 ? normalTracked : Math.max(0, lifetimeImpressions - smartImpressions);

  const perSmartShare = smartTargets > 0 ? Math.round(smartShare / smartTargets) : 0;
  const perNormalShare = normalTargets > 0 ? Math.round(normalShare / normalTargets) : 0;

  const rows = [
    ...smartlinks.map((s) => ({ item: s, type: 'SmartLink' as const, share: perSmartShare })),
    ...links.map((l) => ({ item: l, type: 'Normal Link' as const, share: perNormalShare })),
  ].sort((a, b) => b.share - a.share);

  const cards = [
    {
      label: 'Total Impressions',
      value: <AnimatedNumber value={lifetimeImpressions} />,
      sub: 'Lifetime delivered · synced with Dashboard',
      icon: <Eye className="w-4 h-4" />,
      accent: 'from-violet-500 to-indigo-600',
    },
    {
      label: 'SmartLink Impressions',
      value: <AnimatedNumber value={smartImpressions} />,
      sub: `${smartShare}% of delivered traffic`,
      icon: <Layers className="w-4 h-4" />,
      accent: 'from-amber-500 to-orange-600',
    },
    {
      label: 'Normal Link Impressions',
      value: <AnimatedNumber value={normalImpressions} />,
      sub: `${normalShare}% of delivered traffic`,
      icon: <TrendingUp className="w-4 h-4" />,
      accent: 'from-teal-500 to-emerald-600',
    },
    {
      label: 'Recent Success Rate',
      value: `${recentSuccessRate}%`,
      sub: totalAttempts > 0 ? `Last ${totalAttempts} deliveries` : 'No recent telemetry',
      icon: <Gauge className="w-4 h-4" />,
      accent: 'from-sky-500 to-cyan-600',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          Network Analytics &amp; Performance
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Comprehensive telemetry across organic visitor funnels, conversion signals, and CPM booster performance.
        </p>
      </div>

      {/* Top 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="p-5 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">{c.label}</span>
              <span className={`inline-flex w-7 h-7 items-center justify-center rounded-lg bg-gradient-to-br ${c.accent} text-white shadow-sm`}>
                {c.icon}
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {c.value}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">{c.sub}</span>
          </div>
        ))}
      </div>

      {/* 2-Column: Breakdown Donut & Dwell Time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Breakdown Card */}
        <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Traffic Share: SmartLinks vs Normal
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Proportion of your delivered impressions distributed between Adsterra SmartLinks and direct normal targets.
          </p>

          <div className="space-y-4 pt-2">
            <div>
              <div className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                <span>Adsterra SmartLinks</span>
                <span className="font-mono tabular-nums">{smartShare}% ({smartImpressions.toLocaleString()} impressions)</span>
              </div>
              <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${smartShare}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                <span>Normal Target Links</span>
                <span className="font-mono tabular-nums">{normalShare}% ({normalImpressions.toLocaleString()} impressions)</span>
              </div>
              <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-teal-500 rounded-full" style={{ width: `${normalShare}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Delivery Health Card */}
        <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Recent Delivery Health
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Derived from the most recent recorded deliveries in your live stream.
            </p>
            <div className="mt-4 flex items-baseline gap-3">
              <span className="text-4xl font-bold font-mono text-teal-600 dark:text-teal-400 tabular-nums">
                {recentSuccessRate}%
              </span>
              <span className="text-xs text-slate-500">
                {totalAttempts > 0 ? `across last ${totalAttempts} deliveries` : 'no recent telemetry'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 mt-4 text-xs">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
              <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Delivered (OK)
              </span>
              <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm mt-1">
                {successCount.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
              <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                <XCircle className="w-3 h-3 text-rose-500" /> Failed / Retried
              </span>
              <p className="font-mono font-bold text-rose-500 text-sm mt-1">
                {failedCount.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Target Breakdown Table */}
      <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Configured Targets &amp; Traffic Share
          </h3>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <Activity className="w-3 h-3" /> {totalTargets} target{totalTargets === 1 ? '' : 's'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Campaign Name</th>
                <th className="py-3 px-4">Target Type</th>
                <th className="py-3 px-4">Traffic Share</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 px-4 text-center text-slate-400">
                    No targets configured yet. Add a SmartLink or normal link to start tracking.
                  </td>
                </tr>
              ) : (
                rows.map(({ item, type, share }, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                      {item.name || (type === 'SmartLink' ? 'SmartLink' : 'Normal Link')}
                    </td>
                    <td className="py-3 px-4 font-mono text-[10px] uppercase font-semibold text-teal-600 dark:text-teal-400">
                      {type}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {share}%
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-wider ${
                          item.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
