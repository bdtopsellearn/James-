import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, CalendarDays, Gauge, Trophy, Activity } from 'lucide-react';
import { SmartLink } from '../../types';
import { apiGetSmartlinkAnalytics, SmartlinkAnalytics } from '../../services/api';
import { dhakaDayLabel } from '../../lib/timezone';

interface Props {
  smartlinks: SmartLink[];
}

/** Round the top of the chart up to a clean 1 / 2 / 5 × 10ⁿ value so grid lines read well. */
function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

const fmt = (n: number) => Number(n || 0).toLocaleString('en-US');

export const SmartLinkAnalyticsPanel: React.FC<Props> = ({ smartlinks }) => {
  const [data, setData] = useState<SmartlinkAnalytics | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [grown, setGrown] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const alive = useRef(true);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await apiGetSmartlinkAnalytics();
      if (!alive.current) return;
      setData(res);
      setError('');
    } catch (e: any) {
      if (alive.current) setError(e?.message || 'Could not load analytics.');
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    const timer = window.setInterval(() => { if (!document.hidden) load(true); }, 60_000);
    return () => { alive.current = false; window.clearInterval(timer); };
  }, [load]);

  // bars grow in once the numbers arrive
  useEffect(() => {
    if (!data) return;
    setGrown(false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setGrown(true)));
    return () => cancelAnimationFrame(id);
  }, [data]);

  const days = data?.days || [];
  const top = useMemo(() => niceMax(Math.max(0, ...days.map((d) => d.visits))), [days]);
  const ticks = [top, top * 0.75, top * 0.5, top * 0.25, 0];
  const empty = !!data && data.total === 0;

  const trend = useMemo(() => {
    if (!data || data.previousTotal <= 0) return null;
    return Math.round(((data.total - data.previousTotal) / data.previousTotal) * 100);
  }, [data]);

  // overall delivery quality from the SmartLink records themselves
  const okTotal = smartlinks.reduce((a, s) => a + Number(s.stats?.ok || 0), 0);
  const failTotal = smartlinks.reduce((a, s) => a + Number(s.stats?.failed || 0), 0);
  const attempts = okTotal + failTotal;
  const successRate = attempts > 0 ? (okTotal / attempts) * 100 : null;

  const ranked = useMemo(
    () => [...smartlinks].sort((a, b) => Number(b.stats?.visits || 0) - Number(a.stats?.visits || 0)).slice(0, 5),
    [smartlinks]
  );
  const rankedMax = Math.max(1, ...ranked.map((s) => Number(s.stats?.visits || 0)));

  const card = 'bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs';
  const sel = picked !== null ? days[picked] : null;

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={`${card} p-4`}>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><Activity className="w-3.5 h-3.5 text-teal-500" />Today</div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">{data ? fmt(data.today) : '—'}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">delivered visits</div>
        </div>
        <div className={`${card} p-4`}>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><CalendarDays className="w-3.5 h-3.5 text-teal-500" />Last 7 days</div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">{data ? fmt(data.total) : '—'}</div>
          <div className={`text-[11px] mt-0.5 flex items-center gap-1 ${trend === null ? 'text-slate-400' : trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
            {trend === null ? 'no earlier week to compare' : (<>
              {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {trend >= 0 ? '+' : ''}{trend}% vs previous 7 days
            </>)}
          </div>
        </div>
        <div className={`${card} p-4`}>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><Gauge className="w-3.5 h-3.5 text-teal-500" />Daily average</div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">{data ? fmt(data.average) : '—'}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {successRate === null ? 'success rate n/a yet' : `${successRate.toFixed(1)}% overall success`}
          </div>
        </div>
        <div className={`${card} p-4`}>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><Trophy className="w-3.5 h-3.5 text-amber-500" />Best day</div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">{data?.best ? fmt(data.best.visits) : '—'}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {data?.best ? `${dhakaDayLabel(data.best.date).weekday}, ${dhakaDayLabel(data.best.date).short}` : 'no traffic yet'}
          </div>
        </div>
      </div>

      {/* 7-day chart */}
      <div className={`${card} p-4 sm:p-5`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Delivered visits, last 7 days</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Each day runs 12:00 AM to 11:59 PM Bangladesh time. Only visits that really fired the ad pixel are counted.
            </p>
          </div>
          <button
            onClick={() => load()}
            disabled={loading}
            aria-label="Refresh analytics"
            className="shrink-0 p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-teal-600 hover:border-teal-400 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && !data ? (
          <div className="mt-6 p-4 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3">
            <span>{error}</span>
            <button onClick={() => load()} className="px-3 py-1.5 rounded-md bg-rose-600 text-white font-semibold cursor-pointer">Retry</button>
          </div>
        ) : (
          <div className="mt-5 flex gap-2">
            {/* y axis */}
            <div className="flex flex-col justify-between h-[190px] pt-0 text-[10px] font-mono tabular-nums text-slate-400 text-right w-9 shrink-0 -translate-y-1.5">
              {ticks.map((t, i) => <span key={i}>{fmt(Math.round(t))}</span>)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="relative h-[190px]">
                {/* grid */}
                {ticks.map((_, i) => (
                  <div key={i} className="absolute left-0 right-0 border-t border-dashed border-slate-200 dark:border-slate-800" style={{ top: `${(i / 4) * 100}%` }} />
                ))}

                {loading && !data ? (
                  <div className="absolute inset-0 flex items-end gap-2 sm:gap-4 px-1">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className="flex-1 rounded-t-md bg-slate-100 dark:bg-slate-800 animate-pulse" style={{ height: `${25 + ((i * 37) % 55)}%` }} />
                    ))}
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-end gap-2 sm:gap-4 px-1" role="img" aria-label="Bar chart of delivered SmartLink visits for each of the last 7 days">
                    {days.map((d, i) => {
                      const isToday = i === days.length - 1;
                      const pct = top > 0 ? (d.visits / top) * 100 : 0;
                      const active = picked === i;
                      return (
                        <button
                          key={d.date}
                          type="button"
                          onClick={() => setPicked(active ? null : i)}
                          aria-label={`${dhakaDayLabel(d.date).weekday} ${dhakaDayLabel(d.date).short}: ${d.visits} visits`}
                          className="group relative flex-1 h-full flex flex-col justify-end items-center cursor-pointer outline-none"
                        >
                          <span className={`mb-1 text-[10px] sm:text-[11px] font-mono font-semibold tabular-nums transition-opacity ${d.visits > 0 ? 'text-slate-700 dark:text-slate-200' : 'text-slate-300 dark:text-slate-600'} ${active ? 'opacity-100' : ''}`}>
                            {fmt(d.visits)}
                          </span>
                          <span
                            className={`w-full max-w-[44px] rounded-t-md transition-[height] duration-700 ease-out group-focus-visible:ring-2 ring-teal-400 ${
                              isToday
                                ? 'bg-gradient-to-t from-teal-600 to-emerald-400'
                                : 'bg-gradient-to-t from-slate-300 to-slate-200 dark:from-slate-700 dark:to-slate-600 group-hover:from-teal-600/70 group-hover:to-emerald-400/70'
                            } ${active ? 'ring-2 ring-teal-400' : ''}`}
                            style={{ height: grown ? `${Math.max(d.visits > 0 ? 2 : 0, pct)}%` : '0%', minHeight: d.visits > 0 ? 3 : 0 }}
                          />
                        </button>
                      );
                    })}
                  </div>
                )}

                {empty && !loading && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="px-3 py-1.5 rounded-full bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-500">
                      No delivered visits in the last 7 days yet
                    </span>
                  </div>
                )}
              </div>

              {/* x axis */}
              <div className="flex gap-2 sm:gap-4 px-1 mt-2 border-t border-slate-200 dark:border-slate-800 pt-2">
                {(days.length ? days : Array.from({ length: 7 }).map((_, i) => ({ date: `x${i}`, visits: 0 }))).map((d, i, arr) => {
                  const real = !d.date.startsWith('x');
                  const lab = real ? dhakaDayLabel(d.date) : { weekday: '', short: '' };
                  const isToday = real && i === arr.length - 1;
                  return (
                    <div key={d.date} className="flex-1 text-center leading-tight">
                      <div className={`text-[10px] sm:text-[11px] font-semibold ${isToday ? 'text-teal-600 dark:text-teal-400' : 'text-slate-600 dark:text-slate-300'}`}>{isToday ? 'Today' : lab.weekday}</div>
                      <div className="text-[9px] sm:text-[10px] text-slate-400">{lab.short}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {sel && (
          <div className="mt-4 px-3 py-2 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 text-xs text-teal-800 dark:text-teal-200 flex items-center justify-between">
            <span>{dhakaDayLabel(sel.date).weekday}, {dhakaDayLabel(sel.date).short}</span>
            <span className="font-mono font-bold tabular-nums">{fmt(sel.visits)} visits{data && data.total > 0 ? ` · ${((sel.visits / data.total) * 100).toFixed(1)}% of the week` : ''}</span>
          </div>
        )}
      </div>

      {/* Per-link breakdown */}
      <div className={`${card} overflow-hidden`}>
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">Top SmartLinks by delivered visits (all time)</h3>
        </div>
        {ranked.length === 0 ? (
          <p className="p-6 text-xs text-slate-400 text-center">Add a SmartLink to see how each one performs.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {ranked.map((s) => {
              const v = Number(s.stats?.visits || 0);
              const ok = Number(s.stats?.ok || 0);
              const f = Number(s.stats?.failed || 0);
              const rate = ok + f > 0 ? (ok / (ok + f)) * 100 : null;
              return (
                <li key={s.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium text-slate-800 dark:text-slate-100 truncate">{s.name || 'SmartLink'}</span>
                    <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
                      {fmt(v)} <span className="text-slate-400">visits</span>
                      <span className="text-emerald-600 dark:text-emerald-400 ml-2">{fmt(ok)} ok</span>
                      <span className="text-rose-500 ml-2">{fmt(f)} fail</span>
                      {rate !== null && <span className="text-slate-400 ml-2 hidden sm:inline">{rate.toFixed(0)}%</span>}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400" style={{ width: `${(v / rankedMax) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
