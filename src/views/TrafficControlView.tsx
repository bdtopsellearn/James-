import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Play,
  Square,
  Zap,
  Clock,
  Globe,
  ShieldCheck,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { TrafficTarget, Credits, MembershipPlanItem, TrafficMode } from '../types';
import { InfoCallout } from '../components/rayobyte/InfoCallout';

interface TrafficControlViewProps {
  target: TrafficTarget;
  credits: Credits;
  plan?: MembershipPlanItem;
  onUpdateTarget: (amount: number, mode?: TrafficMode) => void;
  onClearTarget?: () => void;
  onStartTraffic: () => void;
  onStopTraffic: () => void;
}

export const TrafficControlView: React.FC<TrafficControlViewProps> = ({
  target,
  credits,
  plan,
  onUpdateTarget,
  onClearTarget,
  onStartTraffic,
  onStopTraffic
}) => {
  const [selectedTarget, setSelectedTarget] = useState<number>(target.targetAmount);
  const [customTarget, setCustomTarget] = useState<string>('');
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const presets = [50, 100, 250, 500, 1000];
  const percentComplete =
    target.targetAmount > 0
      ? Math.min(100, Math.max(0, Math.round((target.currentProgress / target.targetAmount) * 100)))
      : 0;

  // Keep the picker in sync with the authoritative server value so the UI never
  // shows a stale goal after the engine updates the target (e.g. auto-stop).
  useEffect(() => {
    setSelectedTarget(target.targetAmount);
    setCustomTarget('');
  }, [target.targetAmount]);

  // Lifetime impressions actually delivered (server aggregate) — the single
  // source of truth for "how many impressions have I received in total".
  const lifetimeDelivered = Math.max(0, Math.floor(Number(credits.totalImpressions) || 0));

  const handleApply = () => {
    const amount = customTarget ? parseInt(customTarget, 10) : selectedTarget;
    if (isNaN(amount) || amount <= 0) return;
    // The delivery algorithm is chosen by the platform — users only set the goal.
    onUpdateTarget(amount);
    setSaveSuccessMsg(`Target updated to ${amount.toLocaleString()} visits.`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Traffic Control & Engine Dispatcher
            </h1>
            <span
              className={`px-2.5 py-0.5 text-xs font-semibold rounded-full uppercase tracking-wider ${
                target.isActive
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {target.isActive ? 'Engine Running' : 'Engine Idle'}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Configure delivery targets, organic funnels, and burst speed limits across your active links.
          </p>
        </div>

        <div>
          {target.isActive ? (
            <button
              onClick={() => setShowConfirmModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-xs transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop Traffic Runner</span>
            </button>
          ) : (
            <button
              onClick={onStartTraffic}
              disabled={credits.balance <= 0}
              className={`inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-lg text-white transition-colors shadow-xs ${
                credits.balance <= 0
                  ? 'bg-slate-400 cursor-not-allowed'
                  : 'bg-teal-600 hover:bg-teal-700 cursor-pointer'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Dispatch Traffic Engine</span>
            </button>
          )}
        </div>
      </div>

      <InfoCallout
        title="Automated Credit Safety Guard"
        message="The traffic engine stops automatically when your target amount is reached or when your credit balance hits 0. No unexpected overdraft charges."
      />

      {/* Progress & Target Visualization */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Target Selector and Mode */}
        <div className="lg:col-span-2 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Select Target Volume (Visits)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {presets.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setSelectedTarget(p);
                    setCustomTarget('');
                  }}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer font-mono ${
                    selectedTarget === p && !customTarget
                      ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-teal-400'
                  }`}
                >
                  {p.toLocaleString()} Visits
                </button>
              ))}

              <div className="flex items-center gap-1.5 ml-2">
                <input
                  type="number"
                  placeholder="Custom"
                  value={customTarget}
                  onChange={(e) => setCustomTarget(e.target.value)}
                  className="w-24 px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>
          </div>

          {/* Engine Mode — managed by the platform (not user-selectable) */}
          <div className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40">
            <span className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400">
              <ShieldCheck className="w-4 h-4" />
            </span>
            <div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100">Smart delivery algorithm — auto-managed</div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                The engine automatically picks the safest, highest-CPM delivery strategy for your links. No configuration needed — just set your visit goal and dispatch.
              </p>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between gap-3">
            {saveSuccessMsg ? (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5 animate-in fade-in duration-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {saveSuccessMsg}
              </span>
            ) : <span />}
            <div className="flex items-center gap-2">
              {onClearTarget && (target.targetAmount > 0 || target.currentProgress > 0) && (
                <button
                  onClick={() => {
                    onClearTarget();
                    setSelectedTarget(0);
                    setCustomTarget('');
                    setSaveSuccessMsg('Target cleared.');
                    setTimeout(() => setSaveSuccessMsg(null), 3000);
                  }}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                >
                  Clear Target
                </button>
              )}
              <button
                onClick={handleApply}
                className="px-5 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
              >
                Update Target Settings
              </button>
            </div>
          </div>
        </div>

        {/* Right Col: Live Progress Ring & Burst Gauge */}
        <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col items-center justify-between text-center">
          <div className="w-full">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-4">
              Current Campaign Progress
            </span>

            {/* Circular Gauge */}
            <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  className="stroke-slate-100 dark:stroke-slate-800"
                  strokeWidth="8"
                  fill="transparent"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  className="stroke-teal-500 transition-all duration-500 ease-out"
                  strokeWidth="8"
                  strokeDasharray={264}
                  strokeDashoffset={264 - (264 * percentComplete) / 100}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                  {percentComplete}%
                </span>
                <span className="text-[10px] text-slate-400 uppercase font-medium">Delivered</span>
              </div>
            </div>

            <div className="mt-4 font-mono text-xs text-slate-700 dark:text-slate-300">
              <span className="font-bold text-teal-600 dark:text-teal-400">{target.currentProgress.toLocaleString()}</span>
              <span className="text-slate-400"> / {target.targetAmount.toLocaleString()} visits</span>
            </div>
          </div>

          <div className="w-full pt-4 border-t border-slate-100 dark:border-slate-800 mt-4 text-xs space-y-1.5 text-left">
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>Lifetime Delivered:</span>
              <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold">{lifetimeDelivered.toLocaleString()} impressions</span>
            </div>
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>Hourly Speed:</span>
              <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold">{target.hourlySpeed} visits/hr</span>
            </div>
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>Worker Concurrency:</span>
              <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold">{credits.concurrentBrowsers} Browsers</span>
            </div>
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>Exit Network:</span>
              <span className="font-mono text-teal-600 dark:text-teal-400 font-semibold">US CPM Booster</span>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto overscroll-contain">
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-sm w-full p-6 space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Confirm Engine Pause
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Pausing will safely complete any in-flight browser sessions and preserve your remaining target credits.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-xs font-medium rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onStopTraffic();
                  setShowConfirmModal(false);
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
              >
                Confirm Pause
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
