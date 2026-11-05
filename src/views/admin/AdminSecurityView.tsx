import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Cpu,
  Activity,
  Server,
  Lock,
  Wifi,
  Smartphone,
  Laptop,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { UserSession, User } from '../../types';
import { AppStorage } from '../../services/storage';
import { apiAdminSystem, apiAdminFetchWorkerStatus, SystemStats } from '../../services/api';
import { AdminTwoFactorCard } from './AdminTwoFactorCard';

interface AdminSecurityViewProps {
  sessions: UserSession[];
  onRevokeSession: (sessionId: string) => void;
  currentUser?: User | null;
}

export const AdminSecurityView: React.FC<AdminSecurityViewProps> = ({
  sessions,
  onRevokeSession,
  currentUser
}) => {
  const isSuperAdmin = !!currentUser && (
    (currentUser as any).adminRole === 'super_admin' ||
    currentUser.email === 'alif.yasin@pnnetwork.io'
  );
  // Live server numbers (these four cards used to show fixed demo values)
  const [sys, setSys] = useState<SystemStats | null>(null);
  const [worker, setWorker] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try { const d = await apiAdminSystem(); if (alive) setSys(d); } catch { /* keep last */ }
      try { const w = await apiAdminFetchWorkerStatus(); if (alive) setWorker(w?.status || w); } catch { /* keep last */ }
    };
    void load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const gb = (mb: number) => (mb / 1024).toFixed(1);
  const workerState = String(worker?.state || '—').toUpperCase();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            System Security, Hardware Telemetry & Sessions
          </h1>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Real-time VPS host metrics, adaptive concurrency throttles, active device sessions, and zero-trust policies.
        </p>
      </div>

      {/* Authenticator (2FA) */}
      <AdminTwoFactorCard currentUser={currentUser} isSuperAdmin={isSuperAdmin} />

      {/* Cluster Hardware Health (from bot.js specs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span>VPS Host CPU Load</span>
            <Cpu className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
            {sys ? `${sys.cpuLoadPercent}%` : '—'}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            {sys ? `${sys.cores} CPU core${sys.cores > 1 ? 's' : ''} · load from the last minute` : 'Loading…'}
          </span>
        </div>

        <div className="p-5 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span>RAM Memory Usage</span>
            <Activity className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-teal-600 dark:text-teal-400 mt-1 tabular-nums">
            {sys ? `${Math.round(sys.memPercent)}%` : '—'}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            {sys ? `${gb(sys.memTotalMb - sys.memUsedMb)} GB free of ${gb(sys.memTotalMb)} GB` : 'Loading…'}
          </span>
        </div>

        <div className="p-5 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span>Traffic Worker</span>
            <Server className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
            {workerState}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            {worker?.workerId ? `Worker ${String(worker.workerId).slice(0, 14)}` : 'Waiting for the worker to report'}
          </span>
        </div>

        <div className="p-5 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span>Database & API</span>
            <Wifi className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
            {sys ? (sys.firebaseReady ? 'CONNECTED' : 'OFFLINE') : '—'}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            {sys ? `API up ${Math.floor(sys.apiUptimeSec / 3600)}h ${Math.floor((sys.apiUptimeSec % 3600) / 60)}m · Node ${sys.node}` : 'Loading…'}
          </span>
        </div>
      </div>

      {/* Security Policies */}
      <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Active Security Protections & Threat Defense</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="font-bold text-emerald-600 dark:text-emerald-400 block">Strict Two-Tier Admin Access (RBAC)</span>
            <p className="text-slate-400 text-[11px]">
              No public admin signup endpoint exists. Exactly one root Super Admin is permitted, and normal admin privileges are checked server-side.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="font-bold text-teal-600 dark:text-teal-400 block">Transaction Hash SHA-256 Deduplication</span>
            <p className="text-slate-400 text-[11px]">
              Payment proofs (bKash/Nagad/Binance) are cryptographically hashed on submission. Duplicate TXN IDs are rejected immediately.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="font-bold text-amber-600 dark:text-amber-400 block">CPM Booster Exit Verification</span>
            <p className="text-slate-400 text-[11px]">
              Direct local IP leakage is strictly prevented. Every outbound browser context verifies an authentic clean US exit IP before loading client URLs.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="font-bold text-cyan-600 dark:text-cyan-400 block">Soft-Delete Data Recovery Isolation</span>
            <p className="text-slate-400 text-[11px]">
              Destructive database actions do not purge data silently; snapshots are archived in the recovery ledger for instant restoration.
            </p>
          </div>
        </div>
      </div>

      {/* Active Administrative Sessions */}
      <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
            Active Administrative Device Sessions
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            {sessions.length} Authorized Hardware Tokens
          </span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {sessions.map((sess) => (
            <div key={sess.id} className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                  {sess.device.toLowerCase().includes('mobile') ? (
                    <Smartphone className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  ) : (
                    <Laptop className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-800 dark:text-slate-200 break-words">{sess.device}</span>
                    {sess.isCurrent && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/30">
                        THIS SESSION
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 block break-words">
                    {sess.browser} · IP: {sess.ip} · Last seen {sess.lastActive}
                  </span>
                </div>
              </div>

              {!sess.isCurrent && (
                <button
                  type="button"
                  onClick={() => onRevokeSession(sess.id)}
                  className="shrink-0 px-2.5 py-1 text-xs font-semibold rounded bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:text-rose-200 cursor-pointer"
                >
                  Revoke Device
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
