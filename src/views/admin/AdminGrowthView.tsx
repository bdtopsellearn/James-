import React, { useEffect, useState } from 'react';
import {
  Trophy, Save, RefreshCw, Power, Database, Sparkles, TrendingUp,
  Coins, Users, ShieldCheck, Trash2, AlertTriangle, CheckCircle2, Info,
} from 'lucide-react';
import {
  apiAdminLeaderboardSettings, apiAdminUpdateLeaderboardSettings, apiAdminPruneData,
} from '../../services/api';
import { useToast } from '../../components/ui/Toast';

interface LeaderboardSettings {
  enabled: boolean;
  earn_rate_smartlink: number;
  earn_rate_normal: number;
  min_impressions: number;
}

const DEFAULTS: LeaderboardSettings = {
  enabled: true,
  earn_rate_smartlink: 60,
  earn_rate_normal: 25,
  min_impressions: 0,
};

export const AdminGrowthView: React.FC = () => {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<LeaderboardSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [limits, setLimits] = useState<Record<string, number> | null>(null);
  const [confirmPrune, setConfirmPrune] = useState(false);

  const load = async () => {
    setLoading(true); setLoadError(null);
    try {
      const s = await apiAdminLeaderboardSettings();
      setSettings({ ...DEFAULTS, ...s });
    } catch (e: any) {
      setLoadError(e?.message || 'Could not load leaderboard settings.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const set = <K extends keyof LeaderboardSettings>(k: K, v: LeaderboardSettings[K]) =>
    setSettings((s) => ({ ...s, [k]: v }));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const next = await apiAdminUpdateLeaderboardSettings({
        enabled: settings.enabled,
        earn_rate_smartlink: Number(settings.earn_rate_smartlink) || 0,
        earn_rate_normal: Number(settings.earn_rate_normal) || 0,
        min_impressions: Math.max(0, Math.floor(Number(settings.min_impressions) || 0)),
      });
      setSettings({ ...DEFAULTS, ...next });
      showToast('Leaderboard Saved', 'Reward rates and rules are now live.', 'success');
    } catch (e: any) {
      showToast('Save Failed', e?.message || 'Could not save settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async () => {
    if (toggling) return;
    setToggling(true);
    const next = !settings.enabled;
    try {
      const s = await apiAdminUpdateLeaderboardSettings({ enabled: next });
      setSettings((prev) => ({ ...prev, ...s }));
      showToast(next ? 'Leaderboard ON' : 'Leaderboard OFF', next ? 'The daily board is visible to all users.' : 'The daily board is hidden.', next ? 'success' : 'warning');
    } catch (e: any) {
      showToast('Could not switch', e?.message || 'Failed.', 'error');
    } finally {
      setToggling(false);
    }
  };

  const prune = async () => {
    if (pruning) return;
    setPruning(true);
    try {
      const res = await apiAdminPruneData();
      setLimits(res.limits || null);
      setConfirmPrune(false);
      showToast('Maintenance Complete', 'Unbounded Firestore arrays were trimmed.', 'success');
    } catch (e: any) {
      showToast('Prune Failed', e?.message || 'Could not run maintenance.', 'error');
    } finally {
      setPruning(false);
    }
  };

  const rateCard = (label: string, hint: string, value: number, key: keyof LeaderboardSettings, accent: string) => (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-4">
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</label>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 mb-2">{hint}</p>
      <div className="flex items-center gap-2">
        <span className={`text-lg font-black ${accent}`}>$</span>
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => set(key, (Number(e.target.value) || 0) as any)}
          className="w-full px-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
        />
        <span className="text-[11px] text-slate-400 whitespace-nowrap">/ 1000</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/20">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Growth &amp; Data Center
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-2xl">
            Tune the daily leaderboard reward economy and keep Firestore lean. The board resets
            automatically every midnight (Asia/Dhaka) and data pruning runs daily at 00:05.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 p-4 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {loadError}
        </div>
      )}

      {/* Leaderboard settings */}
      <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <TrendingUp className="w-4.5 h-4.5 text-teal-600 dark:text-teal-400" />
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Daily Leaderboard Rules</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Top-3 by impressions &amp; top-3 by earnings, refreshed at 00:00 Dhaka.</p>
            </div>
          </div>
          <button
            onClick={toggle}
            disabled={toggling}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition disabled:opacity-50 ${
              settings.enabled
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                : 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/30 hover:bg-slate-500/20'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            {settings.enabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {rateCard('Smartlink payout rate', 'USD credited per 1,000 smartlink impressions', settings.earn_rate_smartlink, 'earn_rate_smartlink', 'text-teal-600 dark:text-teal-400')}
            {rateCard('Normal payout rate', 'USD credited per 1,000 normal-link impressions', settings.earn_rate_normal, 'earn_rate_normal', 'text-indigo-600 dark:text-indigo-400')}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-4">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Minimum impressions to qualify</label>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 mb-2">Users below this daily impression count are hidden from the board. Set 0 to show everyone with any traffic.</p>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" />
              <input
                type="number"
                min={0}
                value={settings.min_impressions}
                onChange={(e) => set('min_impressions', Math.max(0, Math.floor(Number(e.target.value) || 0)) as any)}
                className="w-full max-w-[200px] px-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
              />
              <span className="text-[11px] text-slate-400">impressions / day</span>
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-teal-50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/40">
            <Info className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-teal-700 dark:text-teal-300 leading-relaxed">
              Earnings shown on the board are a display estimate of the publisher revenue share
              for the day's delivered visits. Changing rates here updates the board instantly
              without touching any wallet balance.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={saving || loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-lg bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-lg shadow-teal-500/20 hover:brightness-110 disabled:opacity-50 transition"
            >
              <Save className={`w-3.5 h-3.5 ${saving ? 'animate-pulse' : ''}`} />
              {saving ? 'Saving…' : 'Save Leaderboard Settings'}
            </button>
          </div>
        </div>
      </div>

      {/* Data maintenance */}
      <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="flex items-center gap-2.5 p-5 border-b border-slate-100 dark:border-slate-800/80">
          <Database className="w-4.5 h-4.5 text-violet-600 dark:text-violet-400" />
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Firestore Data Maintenance</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Keeps the database small, fast and cost-efficient by trimming old records.</p>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { key: 'ledger', label: 'Ledger entries', icon: Coins, note: 'per user' },
              { key: 'requests', label: 'Deposit requests', icon: ShieldCheck, note: 'per user' },
              { key: 'tickets', label: 'Support tickets', icon: Users, note: 'per user' },
              { key: 'audit', label: 'Audit logs', icon: Sparkles, note: 'global' },
            ].map(({ key, label, icon: Icon, note }) => (
              <div key={key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-3.5">
                <Icon className="w-4 h-4 text-slate-400 mb-2" />
                <p className="text-lg font-black text-slate-900 dark:text-slate-100 leading-none">
                  {limits?.[key] ?? (key === 'audit' ? 500 : key === 'ledger' ? 200 : 100)}
                </p>
                <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-wide">{label}</p>
                <p className="text-[10px] text-slate-400">{note}</p>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/40">
            <Info className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-violet-700 dark:text-violet-300 leading-relaxed">
              Pruning only removes the <strong>oldest</strong> excess rows beyond the caps above — the most
              recent activity is always preserved. This also runs automatically every day at 00:05 Dhaka.
            </p>
          </div>

          {!confirmPrune ? (
            <div className="flex justify-end">
              <button
                onClick={() => setConfirmPrune(true)}
                disabled={pruning}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-lg border border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-950/50 disabled:opacity-50 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Run Maintenance Now
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-xs font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Trim old rows beyond the caps now?
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmPrune(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={prune}
                  disabled={pruning}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition"
                >
                  {pruning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {pruning ? 'Pruning…' : 'Confirm'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
