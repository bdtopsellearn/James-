import React, { useEffect, useState } from 'react';
import {
  Cpu,
  RotateCcw,
  Play,
  Pause,
  Terminal,
  Activity,
  CheckCircle,
  Clock,
  Filter
} from 'lucide-react';
import { EngineSettings, Credits } from '../../types';
import { apiAdminMonitor, MonitorSnapshot } from '../../services/api';
import { useToast } from '../../components/ui/Toast';

interface AdminWorkerControlProps {
  settings: EngineSettings;
  credits: Credits;
  onUpdateSettings: (settings: EngineSettings) => void | Promise<void>;
  onResetTicks: () => void | Promise<void>;
}

export const AdminWorkerControlView: React.FC<AdminWorkerControlProps> = ({
  settings,
  credits,
  onUpdateSettings,
  onResetTicks
}) => {
  const { showToast } = useToast();
  const [logFilter, setLogFilter] = useState<'all' | 'info' | 'warn'>('all');
  const [snap, setSnap] = useState<MonitorSnapshot | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [paused, setPaused] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [tick, setTick] = useState(0);

  // Live data every 4 seconds (stops while the tab is hidden or while the person pauses it)
  useEffect(() => {
    if (paused) return;
    let active = true;
    const load = async () => {
      if (document.visibilityState === 'hidden') return;
      try { const d = await apiAdminMonitor(); if (active) { setSnap(d); setLoadError(false); } }
      catch { if (active) setLoadError(true); }
    };
    void load();
    const timer = setInterval(load, 4000);
    const onVis = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
  }, [paused]);

  // 1-second clock so "last event 12s ago" keeps counting between refreshes
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 1000); return () => clearInterval(t); }, []);

  const handleReset = async () => {
    if (resetting) return;
    setResetting(true);
    try { await onResetTicks(); } finally { setResetting(false); }
  };

  const STATE_UI = {
    running: { label: 'LIVE · Worker running', dot: 'bg-emerald-500', ring: 'border-emerald-500/40', glow: 'from-emerald-500/20', text: 'text-emerald-500' },
    idle:    { label: 'IDLE · Nothing requested', dot: 'bg-sky-500', ring: 'border-sky-500/40', glow: 'from-sky-500/15', text: 'text-sky-500' },
    stalled: { label: 'NOT RESPONDING', dot: 'bg-rose-500', ring: 'border-rose-500/50', glow: 'from-rose-500/20', text: 'text-rose-500' },
  } as const;
  const ui = snap ? STATE_UI[snap.state] : null;
  const age = snap?.lastEventAt ? Math.max(0, Math.round((Date.now() - snap.lastEventAt) / 1000)) : null;
  const ageText = age === null ? 'no events yet' : age < 60 ? `${age}s ago` : age < 3600 ? `${Math.floor(age / 60)}m ago` : `${Math.floor(age / 3600)}h ago`;
  void tick;

  // Worker process heartbeat (published by the bot every 30s).
  const workerAlive = !!snap?.worker?.alive;
  const hbAge = snap?.worker?.heartbeatAgeSec;
  const hbText = hbAge === null || hbAge === undefined ? 'no signal' : hbAge < 60 ? `${hbAge}s ago` : hbAge < 3600 ? `${Math.floor(hbAge / 60)}m ago` : `${Math.floor(hbAge / 3600)}h ago`;

  const maxBucket = Math.max(1, ...(snap?.buckets || [0]));
  const spark = (snap?.buckets || []).map((v, i, arr) => `${(i / Math.max(1, arr.length - 1)) * 100},${34 - (v / maxBucket) * 30}`).join(' ');
  const shownLogs = (snap?.recent || []).filter((l) => logFilter === 'all' || (logFilter === 'warn' ? l.level === 'WARN' : l.level === 'INFO'));
  const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour12: true });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Traffic Worker Process Control & Logs
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Supervise distributed Playwright workers, tick schedulers, and queue governors.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={resetting}
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer shadow-xs transition-colors"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
            <span>{resetting ? 'Sending…' : 'Force Reset Ticks'}</span>
          </button>
        </div>
      </div>

      {/* ───── LIVE MONITOR ───── */}
      <div className={`relative overflow-hidden rounded-2xl border bg-white dark:bg-[#0b1220] p-5 sm:p-6 ${ui ? ui.ring : 'border-slate-200 dark:border-slate-800'}`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${ui ? ui.glow : 'from-slate-500/10'} to-transparent pointer-events-none`} aria-hidden="true" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="relative flex h-3.5 w-3.5 shrink-0">
              {snap?.state === 'running' && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 animate-ping" />}
              <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${ui ? ui.dot : 'bg-slate-400'}`} />
            </span>
            <div className="min-w-0">
              <p className={`text-sm font-extrabold tracking-wide ${ui ? ui.text : 'text-slate-400'}`}>{loadError && !snap ? 'MONITOR OFFLINE' : ui ? ui.label : 'Connecting…'}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 break-words">{loadError && !snap ? 'Could not reach the API server.' : snap?.note || 'Reading live data from the server…'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${
                workerAlive
                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
                  : 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400'
              }`}
              title={`Worker heartbeat: ${hbText}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${workerAlive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              Worker {workerAlive ? 'Online' : 'Offline'}{snap?.worker?.version ? ` · ${snap.worker.version}` : ''}
            </span>
            <span>Last event: <strong className="text-slate-700 dark:text-slate-200">{ageText}</strong></span>
            <button type="button" onClick={() => setPaused((p) => !p)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer">
              {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}{paused ? 'Resume' : 'Pause'}
            </button>
          </div>
        </div>

        <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
          {[
            { k: 'Visits / min', v: snap ? snap.eventsLastMinute : '—' },
            { k: 'Visits / hour', v: snap ? snap.eventsLastHour.toLocaleString() : '—' },
            { k: 'Success rate', v: snap ? (snap.successRate === null ? '—' : `${snap.successRate}%`) : '—' },
            { k: 'Users running', v: snap ? snap.runningUsers : '—' },
            { k: 'Active normal links', v: snap ? snap.activeNormalLinks : '—' },
            { k: 'Credits outstanding', v: snap ? snap.creditsOutstanding.toLocaleString() : '—' },
            { k: 'Server CPU', v: snap ? `${snap.system.cpuLoadPercent}%` : '—' },
            { k: 'Server RAM', v: snap ? `${Math.round(snap.system.memPercent)}%` : '—' },
          ].map((m) => (
            <div key={m.k} className="rounded-xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{m.k}</p>
              <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 mt-0.5">{m.v}</p>
            </div>
          ))}
        </div>

        <div className="relative mt-4">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
            <span>Visits per minute · last 30 min</span>
            {snap?.pendingControl && <span className="text-amber-500 normal-case tracking-normal font-semibold animate-pulse">Reset request waiting for the worker…</span>}
          </div>
          <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="w-full h-16" aria-hidden="true">
            <defs>
              <linearGradient id="pnSpark" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.45" /><stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
              </linearGradient>
            </defs>
            {spark && <polygon points={`0,36 ${spark} 100,36`} fill="url(#pnSpark)" />}
            {spark && <polyline points={spark} fill="none" stroke="#14b8a6" strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
          </svg>
        </div>
      </div>

      {/* Engine Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            SmartLink Engine Master
          </span>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {settings.smartLinkEngineActive ? 'Running' : 'Disabled'}
            </span>
            <button
              type="button"
              onClick={() => onUpdateSettings({ ...settings, smartLinkEngineActive: !settings.smartLinkEngineActive })}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                settings.smartLinkEngineActive
                  ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300'
                  : 'bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-950/40 dark:text-teal-300'
              }`}
            >
              {settings.smartLinkEngineActive ? 'Pause Engine' : 'Enable Engine'}
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            Controls execution of all Adsterra and direct monetize URLs.
          </p>
        </div>

        <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Normal Links Engine Master
          </span>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {settings.normalEngineActive ? 'Running' : 'Disabled'}
            </span>
            <button
              type="button"
              onClick={() => onUpdateSettings({ ...settings, normalEngineActive: !settings.normalEngineActive })}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                settings.normalEngineActive
                  ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300'
                  : 'bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-950/40 dark:text-teal-300'
              }`}
            >
              {settings.normalEngineActive ? 'Pause Engine' : 'Enable Engine'}
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            Controls execution of standard organic web links.
          </p>
        </div>

        <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Tick Dispatch Interval
          </span>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
              Every {settings.tickIntervalSeconds} Seconds
            </span>
          </div>
          <div className="flex items-center gap-2">
            {[4, 8, 15, 30].map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => onUpdateSettings({ ...settings, tickIntervalSeconds: sec })}
                className={`flex-1 py-1 text-xs font-mono font-medium rounded border cursor-pointer ${
                  settings.tickIntervalSeconds === sec
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600'
                }`}
              >
                {sec}s
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Real-time Worker Terminal Output */}
      <div className="bg-white dark:bg-[#0b0f19] rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-lg space-y-3 font-mono text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold">
            <Terminal className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span>Live Visit Console</span>
          </div>
          <div className="flex items-center gap-1.5">
            {([['all', 'All'], ['info', 'OK'], ['warn', 'Errors']] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setLogFilter(id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${logFilter === id ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>{label}</button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5 py-2 max-h-72 overflow-y-auto">
          {!snap && !loadError && <p className="text-slate-400 py-6 text-center">Loading live data…</p>}
          {loadError && !snap && <p className="text-rose-400 py-6 text-center">Could not load the monitor. Retrying…</p>}
          {snap && shownLogs.length === 0 && (
            <p className="text-slate-400 py-6 text-center">No visits recorded yet. When the worker processes traffic, every visit appears here instantly.</p>
          )}
          {shownLogs.map((l, i) => (
            <div key={`${l.t}-${i}`} className="flex items-start gap-3 text-slate-400 leading-relaxed">
              <span className="text-slate-500 shrink-0">{clock(l.t)}</span>
              <span className={`font-bold shrink-0 ${l.level === 'WARN' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>[{l.level === 'WARN' ? 'ERR' : 'OK'}]</span>
              <span className="text-teal-600 dark:text-teal-400 shrink-0 hidden sm:inline">&lt;{l.component}&gt;</span>
              <span className="text-slate-700 dark:text-slate-300 break-all min-w-0">{l.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
