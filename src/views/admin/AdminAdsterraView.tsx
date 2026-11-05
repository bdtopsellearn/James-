import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DollarSign,
  Eye,
  MousePointerClick,
  Activity,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Gauge,
  Clock,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { apiGetAdsterraReport, type AdsterraReportRow } from '../../services/api';
import { usdToBdt } from '../../lib/currency';

// ── Animated count-up ──────────────────────────────────────────────────────
function useCountUp(target: number, duration = 950) {
  const [val, setVal] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration]);
  return val;
}

const fmtMoney = (n: number) => `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
const fmtInt = (n: number) => Math.round(Number.isFinite(n) ? n : 0).toLocaleString('en-US');
const fmtPct = (n: number) => `${(Number.isFinite(n) ? n : 0).toFixed(2)}%`;

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── KPI card ───────────────────────────────────────────────────────────────
interface KpiProps {
  label: string;
  value: number;
  format: (n: number) => string;
  icon: React.ReactNode;
  accent: string;      // tailwind gradient classes
  glow: string;        // shadow color
  delta?: number | null;
  delay?: number;
}
const KpiCard: React.FC<KpiProps> = ({ label, value, format, icon, accent, glow, delta, delay = 0 }) => {
  const animated = useCountUp(value);
  const up = (delta ?? 0) >= 0;
  return (
    <div
      className="adsterra-rise relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-sm"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-20 blur-2xl ${glow}`} />
      <div className="flex items-start justify-between relative">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</span>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-50">
            {format(animated)}
          </div>
          {delta != null && (
            <div className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
              {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>{up ? '+' : ''}{delta.toFixed(1)}% vs prev</span>
            </div>
          )}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg bg-gradient-to-br ${accent}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

export const AdminAdsterraView: React.FC = () => {
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState<AdsterraReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const load = useCallback(async (range: number) => {
    setLoading(true);
    setError(null);
    try {
      const finish = new Date();
      const start = new Date();
      start.setDate(finish.getDate() - (range - 1));
      const res = await apiGetAdsterraReport(ymd(start), ymd(finish));
      const items = Array.isArray(res?.data?.items) ? res.data!.items : [];
      // Ensure the window is exactly `range` days (fill missing days with zeros).
      const byDate = new Map(items.map((r) => [String(r.date).slice(0, 10), r]));
      const filled: AdsterraReportRow[] = [];
      for (let i = range - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = ymd(d);
        const r = byDate.get(key);
        filled.push(r ? { ...r, date: key } : { date: key, impression: 0, clicks: 0, ctr: 0, cpm: 0, revenue: 0 });
      }
      setRows(filled);
      setUpdatedAt(res?.data?.dbDateTime || res?.data?.dbLastUpdateTime || new Date().toISOString());
    } catch (e: any) {
      setError(e?.message || 'Could not load Adsterra data. Check the API key in SmartLinks.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(days); }, [days, load]);

  // ── Aggregates ──
  const totals = useMemo(() => {
    const revenue = rows.reduce((a, r) => a + Number(r.revenue || 0), 0);
    const impression = rows.reduce((a, r) => a + Number(r.impression || 0), 0);
    const clicks = rows.reduce((a, r) => a + Number(r.clicks || 0), 0);
    const cpm = impression > 0 ? (revenue / impression) * 1000 : 0;
    const ctr = impression > 0 ? (clicks / impression) * 100 : 0;
    return { revenue, impression, clicks, cpm, ctr };
  }, [rows]);

  // Trend: second half vs first half of the window.
  const delta = useMemo(() => {
    if (rows.length < 4) return null;
    const half = Math.floor(rows.length / 2);
    const first = rows.slice(0, half).reduce((a, r) => a + Number(r.revenue || 0), 0);
    const second = rows.slice(half).reduce((a, r) => a + Number(r.revenue || 0), 0);
    if (first <= 0) return second > 0 ? 100 : null;
    return ((second - first) / first) * 100;
  }, [rows]);

  // ── Chart geometry ──
  const W = 760, H = 240, PAD = 28;
  const maxImp = Math.max(1, ...rows.map((r) => Number(r.impression || 0)));
  const maxRev = Math.max(0.0001, ...rows.map((r) => Number(r.revenue || 0)));
  const n = rows.length || 1;
  const slot = (W - PAD * 2) / n;
  const barW = Math.max(4, slot * 0.5);
  const xAt = (i: number) => PAD + slot * i + slot / 2;
  const yImp = (v: number) => H - PAD - (v / maxImp) * (H - PAD * 2);
  const yRev = (v: number) => H - PAD - (v / maxRev) * (H - PAD * 2);
  const revPath = rows.map((r, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yRev(Number(r.revenue || 0)).toFixed(1)}`).join(' ');
  const revArea = rows.length
    ? `${revPath} L ${xAt(rows.length - 1).toFixed(1)} ${H - PAD} L ${xAt(0).toFixed(1)} ${H - PAD} Z`
    : '';

  const rangeLabel = (d: string) => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-6">
      <style>{`
        @keyframes adsterraRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes adsterraBar { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        @keyframes adsterraDraw { from { stroke-dashoffset: 1400; } to { stroke-dashoffset: 0; } }
        @keyframes adsterraPulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
        @keyframes adsterraShimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
        .adsterra-rise { animation: adsterraRise .55s cubic-bezier(.22,1,.36,1) both; }
        .adsterra-bar { transform-box: fill-box; transform-origin: bottom; animation: adsterraBar .7s cubic-bezier(.22,1,.36,1) both; }
        .adsterra-draw { stroke-dasharray: 1400; animation: adsterraDraw 1.4s ease-out both; }
        .adsterra-live { animation: adsterraPulse 1.6s ease-in-out infinite; }
        .adsterra-skel { background: linear-gradient(90deg, rgba(148,163,184,.12) 25%, rgba(148,163,184,.28) 37%, rgba(148,163,184,.12) 63%); background-size: 400px 100%; animation: adsterraShimmer 1.3s linear infinite; }
      `}</style>

      {/* Header */}
      <div className="adsterra-rise relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-lg">
        <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute right-24 -bottom-16 w-40 h-40 rounded-full bg-cyan-300/20 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              <h1 className="text-lg font-bold tracking-tight">Adsterra Publisher Performance</h1>
            </div>
            <p className="text-xs text-white/80 mt-1 flex items-center gap-2">
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 adsterra-live" /> Live from Adsterra API
              </span>
              {updatedAt && <span className="text-white/60">• updated {new Date(updatedAt).toLocaleTimeString()}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-white/15 p-0.5 backdrop-blur">
              {[7, 14, 30].map((r) => (
                <button
                  key={r}
                  onClick={() => setDays(r)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${days === r ? 'bg-white text-indigo-700 shadow' : 'text-white/85 hover:bg-white/10'}`}
                >
                  {r}D
                </button>
              ))}
            </div>
            <button
              onClick={() => load(days)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold block">Adsterra data unavailable</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Revenue" value={totals.revenue} format={fmtMoney} icon={<DollarSign className="w-5 h-5" />} accent="from-emerald-500 to-teal-600" glow="bg-emerald-400" delta={delta} delay={0} />
        <KpiCard label="Impressions" value={totals.impression} format={fmtInt} icon={<Eye className="w-5 h-5" />} accent="from-indigo-500 to-violet-600" glow="bg-indigo-400" delay={60} />
        <KpiCard label="Avg CPM" value={totals.cpm} format={fmtMoney} icon={<Gauge className="w-5 h-5" />} accent="from-fuchsia-500 to-pink-600" glow="bg-fuchsia-400" delay={120} />
        <KpiCard label="Clicks" value={totals.clicks} format={fmtInt} icon={<MousePointerClick className="w-5 h-5" />} accent="from-sky-500 to-cyan-600" glow="bg-sky-400" delay={180} />
        <KpiCard label="CTR" value={totals.ctr} format={fmtPct} icon={<Activity className="w-5 h-5" />} accent="from-amber-500 to-orange-600" glow="bg-amber-400" delay={240} />
      </div>

      {/* Chart */}
      <div className="adsterra-rise rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-sm" style={{ animationDelay: '120ms' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Daily Impressions & Revenue</h3>
            <p className="text-[11px] text-slate-400">Bars = impressions · Line = revenue ($)</p>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="inline-flex items-center gap-1.5 text-slate-500"><span className="w-3 h-2 rounded-sm bg-gradient-to-t from-indigo-500 to-violet-400" /> Impressions</span>
            <span className="inline-flex items-center gap-1.5 text-slate-500"><span className="w-4 h-0.5 rounded bg-emerald-500" /> Revenue</span>
          </div>
        </div>

        {loading ? (
          <div className="h-[240px] rounded-xl adsterra-skel" />
        ) : (
          <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="adBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
                <linearGradient id="adArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(16,185,129,.35)" />
                  <stop offset="100%" stopColor="rgba(16,185,129,0)" />
                </linearGradient>
              </defs>
              {/* gridlines */}
              {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
                <line key={i} x1={PAD} x2={W - PAD} y1={PAD + t * (H - PAD * 2)} y2={PAD + t * (H - PAD * 2)} stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth={1} strokeDasharray="3 5" />
              ))}
              {/* bars */}
              {rows.map((r, i) => {
                const y = yImp(Number(r.impression || 0));
                const h = H - PAD - y;
                const active = hover === i;
                return (
                  <rect
                    key={i}
                    x={xAt(i) - barW / 2}
                    y={y}
                    width={barW}
                    height={Math.max(0, h)}
                    rx={3}
                    fill="url(#adBar)"
                    className="adsterra-bar"
                    style={{ animationDelay: `${i * 45}ms`, opacity: hover == null || active ? 1 : 0.45, transition: 'opacity .2s' }}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  />
                );
              })}
              {/* revenue area + line */}
              {revArea && <path d={revArea} fill="url(#adArea)" className="adsterra-draw" />}
              {revPath && <path d={revPath} fill="none" stroke="#10b981" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="adsterra-draw" />}
              {rows.map((r, i) => (
                <circle key={i} cx={xAt(i)} cy={yRev(Number(r.revenue || 0))} r={hover === i ? 4.5 : 2.5} fill="#10b981" style={{ transition: 'r .15s' }} />
              ))}
              {/* x labels */}
              {rows.map((r, i) => (
                (n <= 10 || i % Math.ceil(n / 10) === 0) && (
                  <text key={i} x={xAt(i)} y={H - 8} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 10 }}>{rangeLabel(r.date)}</text>
                )
              ))}
            </svg>

            {/* tooltip */}
            {hover != null && rows[hover] && (
              <div
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-[11px] px-3 py-2 shadow-xl border border-white/10"
                style={{ left: `${(xAt(hover) / W) * 100}%`, top: `${(yImp(Number(rows[hover].impression || 0)) / H) * 100}%` }}
              >
                <div className="font-semibold mb-0.5">{rangeLabel(rows[hover].date)}</div>
                <div className="flex items-center gap-1.5"><Eye className="w-3 h-3 text-violet-300" /> {fmtInt(rows[hover].impression)} imp</div>
                <div className="flex items-center gap-1.5"><DollarSign className="w-3 h-3 text-emerald-300" /> {fmtMoney(rows[hover].revenue)}</div>
                <div className="flex items-center gap-1.5"><Gauge className="w-3 h-3 text-fuchsia-300" /> CPM {fmtMoney(rows[hover].cpm)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Daily table */}
      <div className="adsterra-rise rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-sm overflow-hidden" style={{ animationDelay: '200ms' }}>
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Daily Breakdown</h3>
          <span className="text-[11px] text-slate-400 inline-flex items-center gap-1"><Clock className="w-3 h-3" /> last {days} days</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-4 text-right">Impressions</th>
                <th className="py-2.5 px-4 text-right">Clicks</th>
                <th className="py-2.5 px-4 text-right">CTR</th>
                <th className="py-2.5 px-4 text-right">CPM</th>
                <th className="py-2.5 px-4 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {loading ? (
                Array.from({ length: Math.min(days, 7) }).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 rounded adsterra-skel" /></td></tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No data for this range.</td></tr>
              ) : (
                [...rows].reverse().map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-300">{rangeLabel(r.date)}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">{fmtInt(r.impression)}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">{fmtInt(r.clicks)}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">{fmtPct(r.ctr)}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-fuchsia-600 dark:text-fuchsia-400">{fmtMoney(r.cpm)}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{fmtMoney(r.revenue)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {!loading && rows.length > 0 && (
              <tfoot className="bg-slate-50 dark:bg-slate-800/40 font-semibold text-slate-700 dark:text-slate-200 border-t border-slate-200 dark:border-slate-800">
                <tr>
                  <td className="py-2.5 px-4">Total</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">{fmtInt(totals.impression)}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">{fmtInt(totals.clicks)}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">{fmtPct(totals.ctr)}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">{fmtMoney(totals.cpm)}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{fmtMoney(totals.revenue)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
