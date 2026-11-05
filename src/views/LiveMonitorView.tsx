import React, { useState, useEffect, useMemo } from 'react';
import {
  Radio,
  Play,
  Square,
  Filter,
  ArrowDown,
  Pause,
  Clock,
  ShieldCheck,
  CheckCircle,
  XCircle,
  ExternalLink,
  Layers,
  Sparkles
} from 'lucide-react';
import { LiveImpression, TrafficTarget } from '../types';
import { InfoCallout } from '../components/rayobyte/InfoCallout';
import { CountryFlag } from '../components/ui/CountryFlag';
import { StartLimitModal } from '../components/ui/StartLimitModal';

interface LiveMonitorViewProps {
  impressions: LiveImpression[];
  target: TrafficTarget;
  totalImpressions?: number;
  onStartTraffic: () => void;
  onStopTraffic: () => void;
  /** When provided, "Resume Stream" first opens the target-setting modal. */
  onStartWithLimit?: (amount: number) => void | Promise<void>;
  /** Available impression balance, used to validate the chosen limit. */
  balance?: number;
}

export const LiveMonitorView: React.FC<LiveMonitorViewProps> = ({
  impressions,
  target,
  totalImpressions = 0,
  onStartTraffic,
  onStopTraffic,
  onStartWithLimit,
  balance = 0
}) => {
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [startModalOpen, setStartModalOpen] = useState(false);

  // Real lifetime impressions delivered (server aggregate) — the single source
  // of truth. The rolling feed only holds the latest rows, so it must never be
  // used to inflate this figure.
  const lifetimeImpressions = Math.max(0, Math.floor(Number(totalImpressions) || 0));

  // Real 1-second clock (only ticks while the stream is active). This drives the
  // live timers below so they always reflect the actual traffic, never a fake loop.
  useEffect(() => {
    if (!target.isActive) return;
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [target.isActive]);

  // Timestamp (ms) of the most recently delivered impression.
  const lastImpressionTs = useMemo(() => {
    let max = 0;
    for (const imp of impressions) {
      const t = new Date(imp.timestamp).getTime();
      if (Number.isFinite(t) && t > max) max = t;
    }
    return max;
  }, [impressions]);

  // Observed cadence between delivered impressions (median of the MOST RECENT
  // gaps, clamped). Falls back to the engine's ~30s batch-dispatch cadence until
  // enough data accrues. Only the newest rows are used so an old, slow stretch
  // can't drag the estimate out of range.
  const cadenceSec = useMemo(() => {
    const ts = impressions
      .map((i) => new Date(i.timestamp).getTime())
      .filter((t) => Number.isFinite(t) && t > 0)
      .sort((a, b) => a - b)
      .slice(-16);
    if (ts.length < 3) return 30;
    const gaps: number[] = [];
    for (let i = 1; i < ts.length; i++) {
      const g = (ts[i] - ts[i - 1]) / 1000;
      if (g > 0 && g < 900) gaps.push(g);
    }
    if (!gaps.length) return 30;
    gaps.sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];
    return Math.max(8, Math.min(180, Math.round(median)));
  }, [impressions]);

  const secondsSinceLast = lastImpressionTs
    ? Math.max(0, Math.floor((nowTick - lastImpressionTs) / 1000))
    : null;

  // The engine dispatches in batches, so arrivals are bursty and the observed
  // cadence is only an estimate. Previously the timer was clamped with
  // `max(0, cadence - elapsed)`, so once the window elapsed it froze on a dead
  // "0" until the next visit landed. We now ROLL the window over (modulo the
  // cadence) so the countdown keeps ticking and never sticks at 0, and we flag a
  // genuinely quiet stream separately instead of pretending a visit is imminent.
  const stalled = secondsSinceLast !== null && secondsSinceLast > cadenceSec * 3;
  const nextIn = secondsSinceLast === null
    ? cadenceSec
    : Math.max(1, cadenceSec - (secondsSinceLast % Math.max(1, cadenceSec)));

  // Ring fills from 0 → 1 across the current cadence window, then resets, so the
  // operator can literally watch the next visit approach instead of a static number.
  const cadenceProgress = secondsSinceLast === null
    ? 0
    : Math.max(0, Math.min(1, 1 - nextIn / Math.max(1, cadenceSec)));
  const RING_R = 16;
  const RING_C = 2 * Math.PI * RING_R;

  // Always render newest-first: the freshest impression sits at the top and older
  // rows flow downward. Sorting here guarantees the order even if a parent passes
  // the raw server list (which may be oldest-first).
  const filtered = useMemo(() => {
    const rows = impressions.filter((imp) => {
      if (filter === 'success') return imp.status === 'success';
      if (filter === 'failed') return imp.status === 'failed';
      return true;
    });
    return [...rows].sort((a, b) => {
      const ta = new Date(a.timestamp).getTime() || 0;
      const tb = new Date(b.timestamp).getTime() || 0;
      return tb - ta;
    });
  }, [impressions, filter]);

  return (
    <div className="space-y-6">
      {/* Top Banner with Ticker & Engine Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <Radio className="w-5 h-5 text-teal-600 dark:text-teal-400 animate-pulse" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Live Real-Time Impression Stream
            </h1>
            <span
              className={`px-2.5 py-0.5 text-xs font-semibold rounded-full uppercase tracking-wider ${
                target.isActive
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {target.isActive ? 'Socket Streaming' : 'Stream Paused'}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 border border-violet-200 dark:border-violet-900">
              <Layers className="w-3 h-3" />
              {lifetimeImpressions.toLocaleString()} total impressions
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Displaying live headless browser execution across SOCKS5 exit nodes with human engagement simulation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {target.isActive && (
            <div className="flex items-center gap-3 px-3.5 py-2 rounded-xl bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-950/40 dark:to-emerald-950/25 border border-teal-200 dark:border-teal-900/80 shadow-xs">
              <div className="relative w-11 h-11 shrink-0">
                <svg className="w-11 h-11 -rotate-90" viewBox="0 0 40 40" aria-hidden="true">
                  <circle
                    cx="20" cy="20" r={RING_R} fill="none"
                    stroke="currentColor" strokeWidth="3"
                    className="text-teal-200/70 dark:text-teal-900"
                  />
                  <circle
                    cx="20" cy="20" r={RING_R} fill="none"
                    stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                    className="text-teal-500 dark:text-teal-400 transition-[stroke-dashoffset] duration-1000 ease-linear"
                    strokeDasharray={RING_C}
                    strokeDashoffset={RING_C * (1 - cadenceProgress)}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold font-mono tabular-nums text-teal-700 dark:text-teal-300">
                  {secondsSinceLast === null ? '–' : nextIn}
                </span>
              </div>
              <div className="leading-tight">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-teal-800 dark:text-teal-200">
                  <Clock className="w-3 h-3" />
                  {secondsSinceLast === null
                    ? 'Waiting for first visit'
                    : stalled
                      ? 'Waiting for next batch…'
                      : `Next impression in ${nextIn}s`}
                </div>
                <div className="text-[10px] font-mono text-teal-600/90 dark:text-teal-400/80 mt-0.5">
                  {secondsSinceLast === null
                    ? `~${cadenceSec}s cadence`
                    : `last ${secondsSinceLast}s ago · ~${cadenceSec}s cadence`}
                </div>
              </div>
            </div>
          )}

          {target.isActive ? (
            <button
              onClick={onStopTraffic}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer transition-colors shadow-xs"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Pause Stream</span>
            </button>
          ) : (
            <button
              onClick={() => (onStartWithLimit ? setStartModalOpen(true) : onStartTraffic())}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer transition-colors shadow-xs"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Resume Stream</span>
            </button>
          )}
        </div>
      </div>

      <InfoCallout
        type="info"
        title="How long does each visit take?"
        message="Every delivered visit stays on the page for a randomised, human-like dwell: about 45–90s for ad / smartlink placements, 60–90s for normal links, and 45–90s for organic / H4CK traffic (the search step before the click adds another 5–12s). The engine dispatches a fresh batch roughly every 30s, so new rows keep appearing in this stream while it is running — the timer above is estimated from the real cadence you are seeing."
      />

      {/* Filter and Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              filter === 'all'
                ? 'bg-white dark:bg-[#0f172a] text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            All Stream ({impressions.length})
          </button>
          <button
            onClick={() => setFilter('success')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              filter === 'success'
                ? 'bg-white dark:bg-[#0f172a] text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Success Only
          </button>
          <button
            onClick={() => setFilter('failed')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              filter === 'failed'
                ? 'bg-white dark:bg-[#0f172a] text-rose-600 dark:text-rose-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Failed Only
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500"
            />
            <span>Auto-scroll (Pauses on hover)</span>
          </label>
        </div>
      </div>

      {/* Impression Feed Container */}
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[620px] overflow-y-auto"
      >
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 space-y-2">
            <Radio className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700 animate-pulse" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">
              No live impressions logged yet
            </p>
            <p>Click "Resume Stream" or dispatch the traffic runner to monitor live visits.</p>
          </div>
        ) : (
          filtered.map((imp) => {
            const isOk = imp.status === 'success';
            return (
              <div
                key={imp.id}
                className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {isOk ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-500" />
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-xs sm:max-w-md">
                        {imp.url}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded uppercase font-semibold ${
                          imp.linkType === 'smartlink'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                            : 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300'
                        }`}
                      >
                        {imp.linkType}
                      </span>
                      <span
                        className="text-[10px] text-slate-400 font-mono inline-flex items-center gap-1"
                        title={imp.proxyCountry ? `CPM-boosted in ${imp.proxyCountry}` : 'Delivery country'}
                      >
                        <CountryFlag code={imp.proxyRegion} flag={imp.proxyFlag} name={imp.proxyCountry} size="sm" />
                        {imp.proxyRegion}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-mono">{imp.phaseCompleted}</span>
                      <span>·</span>
                      <span className="font-mono tabular-nums">Dwell: {Math.round(imp.dwellMs / 1000)}s</span>
                      <span>·</span>
                      <span className="text-slate-400 truncate max-w-xs">{imp.details}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center sm:flex-col sm:items-end justify-between shrink-0 text-slate-400 text-[11px] font-mono">
                  <span className="tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                    {new Date(imp.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className={`text-[10px] ${isOk ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400 dark:text-slate-500'}`}>
                    {isOk ? '-1 credit' : 'no charge'}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {onStartWithLimit && (
        <StartLimitModal
          open={startModalOpen}
          type="smartlink"
          scopeLabel="Resume live SmartLink stream"
          balance={balance}
          onClose={() => setStartModalOpen(false)}
          onConfirm={async (amount) => {
            await onStartWithLimit(amount);
            setStartModalOpen(false);
          }}
        />
      )}
    </div>
  );
};
