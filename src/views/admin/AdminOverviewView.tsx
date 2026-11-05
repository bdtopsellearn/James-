import React, { useEffect, useState } from 'react';
import { apiAdminSystem, SystemStats } from '../../services/api';
import {
  Shield,
  Users,
  Server,
  Zap,
  DollarSign,
  Activity,
  Cpu,
  Clock,
  Radio,
  CheckSquare,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { User, ProxyItem, BalanceRequest, SupportTicket, Credits } from '../../types';
import { AnimatedNumber } from '../../components/ui/AnimatedNumber';

interface AdminOverviewProps {
  users: User[];
  proxies: ProxyItem[];
  requests: BalanceRequest[];
  tickets: SupportTicket[];
  credits: Credits;
  onNavigate: (view: string) => void;
  onResetTicks: () => void;
}

function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export const AdminOverviewView: React.FC<AdminOverviewProps> = ({
  users,
  proxies,
  requests,
  tickets,
  credits,
  onNavigate,
  onResetTicks
}) => {
  const [sys, setSys] = useState<SystemStats | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => { try { const d = await apiAdminSystem(); if (alive) setSys(d); } catch { /* keep last value */ } };
    void load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const openTickets = tickets.filter(t => t.status !== 'closed');
  const activeProxies = proxies.filter(p => p.enabled);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-500" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Master Admin Command Operations
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Global monitoring, worker health, booster uptime, and user financial ledger governance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onResetTicks}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Force Reset Ticks</span>
          </button>
        </div>
      </div>

      {/* Top Stat Cards (Platform Totals) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => onNavigate('admin_users')}
          className="p-5 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs cursor-pointer hover:border-amber-500/50 transition-all"
        >
          <div className="flex justify-between items-center text-xs text-slate-500">
            <span>Total Publishers</span>
            <Users className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
            {users.length}
          </div>
          <span className="text-[11px] text-emerald-600 mt-1 block">
            {users.filter(u => u.status === 'active').length} Active · {users.filter(u => u.status === 'banned').length} Banned
          </span>
        </div>

        <div
          onClick={() => onNavigate('admin_proxies')}
          className="p-5 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs cursor-pointer hover:border-amber-500/50 transition-all"
        >
          <div className="flex justify-between items-center text-xs text-slate-500">
            <span>CPM Booster Pool</span>
            <Server className="w-4 h-4 text-teal-600" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
            <AnimatedNumber value={activeProxies.length} /> / <AnimatedNumber value={proxies.length} />
          </div>
          <span className="text-[11px] text-teal-600 mt-1 block">
            Average Latency: 165ms
          </span>
        </div>

        <div
          onClick={() => onNavigate('admin_approvals')}
          className="p-5 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs cursor-pointer hover:border-amber-500/50 transition-all"
        >
          <div className="flex justify-between items-center text-xs text-slate-500">
            <span>Pending Deposits</span>
            <CheckSquare className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-rose-500 tabular-nums">
            <AnimatedNumber value={pendingRequests.length} /> Pending
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Click to audit & approve TXNs
          </span>
        </div>

        <div className="p-5 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex justify-between items-center text-xs text-slate-500">
            <span>Active Worker Threads</span>
            <Cpu className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
            {credits.concurrentBrowsers} Browsers
          </div>
          <span className="text-[11px] text-emerald-500 mt-1 block">
            Live worker concurrency
          </span>
        </div>
      </div>

      {/* System health — live numbers from the server */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Server RAM</span>
            <span className="font-mono text-slate-900 dark:text-slate-100 font-bold">
              {sys ? `${(sys.memUsedMb / 1024).toFixed(1)} GB / ${(sys.memTotalMb / 1024).toFixed(1)} GB (${Math.round(sys.memPercent)}%)` : '—'}
            </span>
          </div>
          <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-teal-500 rounded-full transition-all duration-500" style={{ width: `${sys ? Math.min(100, sys.memPercent) : 0}%` }} />
          </div>
          <span className="text-[11px] text-slate-400 block">{sys ? `API process uses ${sys.processRssMb} MB` : 'Loading…'}</span>
        </div>

        <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300">CPU Load</span>
            <span className="font-mono text-slate-900 dark:text-slate-100 font-bold">{sys ? `${sys.cpuLoadPercent}%` : '—'}</span>
          </div>
          <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${sys ? Math.min(100, sys.cpuLoadPercent) : 0}%` }} />
          </div>
          <span className="text-[11px] text-slate-400 block">{sys ? `${sys.cores} CPU core${sys.cores > 1 ? 's' : ''} · Node ${sys.node}` : 'Loading…'}</span>
        </div>

        <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300">API Uptime</span>
            <span className="font-mono text-emerald-600 font-bold">{sys ? fmtUptime(sys.apiUptimeSec) : '—'}</span>
          </div>
          <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${sys?.firebaseReady === false ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: sys ? '100%' : '0%' }} />
          </div>
          <span className="text-[11px] text-slate-400 block">{sys ? `Server up ${fmtUptime(sys.serverUptimeSec)} · Database ${sys.firebaseReady ? 'connected' : 'NOT connected'}` : 'Loading…'}</span>
        </div>
      </div>
    </div>
  );
};
