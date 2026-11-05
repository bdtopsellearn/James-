import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Database,
  RefreshCw,
  HardDrive,
  Flame,
  Server,
  Layers,
  Activity,
  ArrowRight,
  ShieldCheck,
  Gauge,
  Boxes,
  FileJson,
  Radio,
  Clock,
  Sparkles,
} from 'lucide-react';
import { apiAdminGetBotDb, type BotDbSnapshot } from '../../services/api';

/* ──────────────────────────────────────────────────────────────────────────────
   BOT EMBEDDED DATABASE — observability surface
   Shows the bot's own atomic, journaled store (local telemetry) and the
   data-routing split: what lives in Firebase vs the bot's database.
   ────────────────────────────────────────────────────────────────────────────── */

function fmtBytes(n: number): string {
  if (!n || n < 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1048576).toFixed(2)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}> = ({ icon, label, value, sub, tone = 'text-teal-600 dark:text-teal-400' }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-4 shadow-xs">
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 ${tone}`}>{icon}</span>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
    </div>
    <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{value}</div>
    {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
  </div>
);

export const AdminBotDbView: React.FC = () => {
  const [data, setData] = useState<BotDbSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [lastSync, setLastSync] = useState<number>(0);

  const load = useCallback(async (spin = false) => {
    if (spin) setRefreshing(true);
    try {
      const res = await apiAdminGetBotDb();
      setData(res);
      setLastSync(Date.now());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load bot database');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => void load(), 15000);
    return () => clearInterval(id);
  }, [live, load]);

  const maxBytes = useMemo(() => {
    if (!data?.collections?.length) return 1;
    return Math.max(1, ...data.collections.map((c) => c.file_bytes));
  }, [data]);

  const heartbeat = data?.heartbeat || null;
  const routing = data?.routing;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
          <span className="text-xs font-semibold text-slate-500">Loading embedded database…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-xs">
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 15% 20%, #10b981 0, transparent 45%), radial-gradient(circle at 85% 60%, #6366f1 0, transparent 45%)' }} />
        <div className="relative">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <Database className="w-4 h-4" />
            </span>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Bot Embedded Database</h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            The traffic worker keeps high-frequency telemetry in its own atomic, journaled store and only pushes
            essential data to Firebase — cutting Firestore writes and cost while keeping the web dashboards live.
          </p>
        </div>
        <div className="relative flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setLive((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${live ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
            title="Toggle live polling"
          >
            <span className={`w-2 h-2 rounded-full ${live ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            {live ? 'Live' : 'Paused'}
          </button>
          <button
            type="button"
            onClick={() => void load(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-xs font-semibold">
          <Activity className="w-4 h-4" /> {error}
        </div>
      )}

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Boxes className="w-4 h-4" />} label="Local Collections" value={String(data?.collections_count ?? 0)} sub="stored in the bot DB" />
        <StatCard icon={<Layers className="w-4 h-4" />} label="Total Records" value={(data?.total_entries ?? 0).toLocaleString()} sub="entries across collections" tone="text-indigo-600 dark:text-indigo-400" />
        <StatCard icon={<HardDrive className="w-4 h-4" />} label="Store Size" value={fmtBytes(data?.total_file_bytes ?? 0)} sub={data?.store_dir ? data.store_dir.split('/').slice(-2).join('/') : '—'} tone="text-sky-600 dark:text-sky-400" />
        <StatCard icon={<Radio className="w-4 h-4" />} label="Mirror Interval" value={`${Math.round((routing?.mirror_interval_ms ?? 45000) / 1000)}s`} sub="throttled Firebase sync" tone="text-fuchsia-600 dark:text-fuchsia-400" />
      </div>

      {/* ── Data routing diagram ── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-xs overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Smart Data Routing</h2>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
            <Clock className="w-3 h-3" /> {lastSync ? `Synced ${new Date(lastSync).toLocaleTimeString()}` : '—'}
          </span>
        </div>
        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Firebase side */}
          <div className="rounded-xl border border-amber-200/70 dark:border-amber-900/50 bg-gradient-to-br from-amber-50/70 to-orange-50/40 dark:from-amber-950/20 dark:to-orange-950/10 p-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400"><Flame className="w-4 h-4" /></span>
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Firebase Firestore</div>
                <div className="text-[11px] text-slate-500">Critical · real-time · shared with the web app</div>
              </div>
              <span className="ml-auto text-[11px] font-bold text-amber-700 dark:text-amber-300 tabular-nums">{routing?.critical?.length ?? 0}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(routing?.critical || []).map((c) => (
                <span key={c} className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/70 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 border border-amber-200/60 dark:border-amber-900/40">{c}</span>
              ))}
            </div>
          </div>

          {/* Bot DB side */}
          <div className="rounded-xl border border-emerald-200/70 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50/70 to-teal-50/40 dark:from-emerald-950/20 dark:to-teal-950/10 p-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400"><Server className="w-4 h-4" /></span>
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Bot Embedded Database</div>
                <div className="text-[11px] text-slate-500">High-frequency telemetry · atomic · journaled</div>
              </div>
              <span className="ml-auto text-[11px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{routing?.local?.length ?? 0}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(routing?.local || []).map((c) => (
                <span key={c} className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/70 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 border border-emerald-200/60 dark:border-emerald-900/40">
                  {c}
                  {routing?.mirrored?.includes(c) && <span className="ml-1 text-emerald-500">↻</span>}
                </span>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400">
              <ArrowRight className="w-3 h-3" /> Collections marked <span className="font-bold text-emerald-500">↻</span> are mirrored to Firebase on a throttle.
            </div>
          </div>
        </div>
      </div>

      {/* ── Worker heartbeat ── */}
      {heartbeat && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-xs overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
            <Gauge className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Worker Heartbeat</h2>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> live from worker
            </span>
          </div>
          <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Writes', value: (heartbeat.writes ?? 0).toLocaleString() },
              { label: 'Flushes', value: (heartbeat.flushes ?? 0).toLocaleString() },
              { label: 'Compactions', value: (heartbeat.compactions ?? 0).toLocaleString() },
              { label: 'Journal', value: fmtBytes(heartbeat.journal_bytes ?? 0) },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">{s.value}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Collections table ── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-xs overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <FileJson className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Local Collections</h2>
          <span className="ml-auto text-[10px] font-semibold text-slate-400">{data?.collections_count ?? 0} files</span>
        </div>
        {!data?.collections?.length ? (
          <div className="px-5 py-12 text-center">
            <div className="text-xs text-slate-400">No local collections yet. The bot will create them as telemetry flows in.</div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.collections.map((c) => (
              <div key={c.name} className="flex items-center gap-3 px-5 py-3">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                  <Database className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{c.name}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-500">{c.type}</span>
                    {routing?.mirrored?.includes(c.name) && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">↻ mirrored</span>
                    )}
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500" style={{ width: `${Math.max(3, Math.round((c.file_bytes / maxBytes) * 100))}%` }} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100 tabular-nums">{c.entries.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-400 tabular-nums">{fmtBytes(c.file_bytes)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            Atomic writes (temp → fsync → rename) + write-ahead journal for crash recovery.
          </span>
          <span className="inline-flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-sky-500" /> {fmtBytes(data?.total_file_bytes ?? 0)} on disk
          </span>
        </div>
      </div>
    </div>
  );
};
