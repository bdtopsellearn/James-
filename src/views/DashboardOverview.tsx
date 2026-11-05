import React from 'react';
import {
  Wallet,
  Zap,
  TrendingUp,
  Link2,
  Play,
  Square,
  Radio,
  ShoppingCart,
  UserPlus,
  Crown,
  Gift,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  Sparkles,
  Package,
  Server,
  Target,
  BellRing,
  Trophy,
  Coins,
  Eye,
  Loader2,
  BarChart3,
  MousePointerClick,
  Globe2,
  RefreshCw,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import {
  User,
  Wallet as WalletType,
  Credits,
  MembershipPlanItem,
  TrafficTarget,
  LiveImpression,
} from '../types';
import { apiLeaderboard, apiAdsterraSummary, apiTrafficStatus, LeaderboardData, AdsterraNetworkSummary, TrafficStatus } from '../services/api';
import { UserAvatar } from '../components/ui/UserAvatar';
import { AnimatedNumber } from '../components/ui/AnimatedNumber';
import { MembershipBadge } from '../components/ui/MembershipBadge';
import { CountryFlag } from '../components/ui/CountryFlag';
import { AllowanceCard } from '../components/rayobyte/AllowanceCard';
import { formatUSD } from '../lib/currency';

interface DashboardOverviewProps {
  user: User;
  wallet: WalletType;
  credits: Credits;
  plan?: MembershipPlanItem;
  target: TrafficTarget;
  impressions: LiveImpression[];
  onStartTraffic: () => void;
  onStopTraffic: () => void;
  onNavigate: (view: string) => void;
}

// ─── Helpers ───
function formatNumber(n: number): string {
  return Number(n || 0).toLocaleString('en-US');
}

function formatBDT(n: number): string {
  return `৳${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  if (!d || isNaN(d)) return '—';
  const diff = Math.max(0, Date.now() - d);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

// ═══════════════════════════════════════════════════════════════════════
const LeaderboardWidget: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  const [data, setData] = React.useState<LeaderboardData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    apiLeaderboard()
      .then((d) => { if (alive) setData(d); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const top = data?.topImpressions || [];

  return (
    <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs pn-card-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
            <Trophy className="w-4 h-4 text-white" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Today's Top Publishers</h3>
            <p className="text-[10px] text-slate-400">Resets at midnight · Asia/Dhaka</p>
          </div>
        </div>
        <button
          onClick={() => onNavigate('leaderboard')}
          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 dark:text-teal-400 hover:gap-1.5 transition-all cursor-pointer"
        >
          View all <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="py-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
        </div>
      ) : top.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400">
          No impressions recorded yet today. Start traffic to climb the board!
        </div>
      ) : (
        <div className="space-y-2">
          {top.map((e) => (
            <button
              key={e.userId}
              onClick={() => onNavigate(`profile_public:${e.publicId || e.userId}`)}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left cursor-pointer"
            >
              <span className={`w-6 text-center text-xs font-extrabold ${
                e.rank === 1 ? 'text-amber-500' : e.rank === 2 ? 'text-slate-400' : 'text-orange-500'
              }`}>#{e.rank}</span>
              <UserAvatar name={e.name} src={e.avatar} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                  <span className="truncate">{e.name}</span>
                  <MembershipBadge plan={e.plan} expiresAt={e.membershipExpiresAt} size="xs" />
                </span>
                <span className="block text-[10px] text-slate-400 truncate">@{e.username}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-bold tabular-nums text-teal-600 dark:text-teal-400">
                <Eye className="w-3 h-3" /> {e.impressions.toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Live Adsterra network performance (last 7 days) ──
const NetworkStatsWidget: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  const [net, setNet] = React.useState<AdsterraNetworkSummary | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    apiAdsterraSummary(7)
      .then((s) => { if (alive) setNet(s); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const days = net?.days || [];
  const maxRev = Math.max(0.0001, ...days.map((d) => Number(d.revenue) || 0));
  const items = [
    { label: 'Revenue · 7d', value: formatUSD(net?.revenue || 0), sub: net?.today ? `${formatUSD(net.today.revenue)} today` : 'network total', icon: <Coins className="w-4 h-4" />, accent: 'from-emerald-500 to-teal-600' },
    { label: 'Avg CPM', value: `$${(Number(net?.cpm) || 0).toFixed(2)}`, sub: 'per 1,000 impressions', icon: <TrendingUp className="w-4 h-4" />, accent: 'from-amber-500 to-orange-600' },
    { label: 'Your Impressions · 7d', value: formatNumber(net?.impressions || 0), sub: net?.today ? `${formatNumber(net.today.impressions)} today` : 'your Adsterra account', icon: <Eye className="w-4 h-4" />, accent: 'from-sky-500 to-indigo-600' },
    { label: 'Clicks · 7d', value: formatNumber(net?.clicks || 0), sub: `${(Number(net?.ctr) || 0).toFixed(2)}% CTR`, icon: <MousePointerClick className="w-4 h-4" />, accent: 'from-fuchsia-500 to-pink-600' },
  ];

  return (
    <div className="relative overflow-hidden p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs pn-card-in">
      <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
      <div className="relative flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
            <BarChart3 className="w-4 h-4 text-white" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              Your Adsterra Account
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                net && !net.ok
                  ? 'bg-slate-400/15 text-slate-500 dark:text-slate-400'
                  : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
              }`}>{net && !net.ok ? 'Not connected' : 'Live'}</span>
            </h3>
            <p className="text-[10px] text-slate-400">Your Adsterra publisher account · last 7 days</p>
          </div>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-slate-400">
          <Globe2 className="w-3 h-3" /> Your Adsterra API
        </span>
      </div>

      {loading ? (
        <div className="py-8 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-teal-500" /></div>
      ) : net && !net.ok ? (
        net.needsKey ? (
          <div className="relative overflow-hidden rounded-lg border border-teal-200 dark:border-teal-900/50 bg-gradient-to-br from-teal-50 to-emerald-50 dark:from-teal-950/30 dark:to-emerald-950/20 p-4">
            <div className="pointer-events-none absolute -right-6 -top-6 w-24 h-24 rounded-full bg-teal-500/10 blur-2xl" />
            <div className="relative flex flex-wrap items-center gap-3">
              <span className="inline-flex w-9 h-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg shadow-teal-500/30">
                <ShieldCheck className="w-4 h-4" />
              </span>
              <div className="min-w-[160px] flex-1">
                <p className="text-[12px] font-bold text-slate-900 dark:text-slate-50">Connect your Adsterra account</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Add your publisher API key in SmartLinks to see live revenue, CPM & impressions.</p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('smartlinks')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-teal-600 to-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg shadow-teal-500/25 hover:-translate-y-0.5 transition-all cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" /> Connect
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-3 text-[11px] text-amber-700 dark:text-amber-300">
            Live Adsterra data is unavailable right now{net.error ? ` — ${net.error}` : ''}.
          </div>
        )
      ) : (
        <>
          <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-3">
            {items.map((c) => (
              <div key={c.label} className="relative overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800 bg-gradient-to-b from-white to-slate-50/70 dark:from-[#0f172a] dark:to-[#0b1220] p-3">
                <span className={`inline-flex w-7 h-7 items-center justify-center rounded-lg bg-gradient-to-br ${c.accent} text-white shadow`}>{c.icon}</span>
                <div className="mt-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400">{c.label}</div>
                <div className="text-lg font-extrabold tabular-nums text-slate-900 dark:text-slate-50">{c.value}</div>
                <div className="text-[9px] text-slate-400 truncate">{c.sub}</div>
              </div>
            ))}
          </div>
          <div className="relative mt-4 flex items-end justify-between gap-1.5 h-16">
            {days.length === 0 ? (
              <div className="w-full text-center text-[10px] text-slate-400 py-3">No revenue data yet.</div>
            ) : days.map((d) => {
              const h = Math.max(3, Math.round(((Number(d.revenue) || 0) / maxRev) * 56));
              return (
                <div key={d.date} className="group/bar flex-1 flex flex-col items-center justify-end gap-1">
                  <div className="w-full rounded-t bg-gradient-to-t from-emerald-500/70 to-teal-400 group-hover/bar:from-emerald-500 transition-all" style={{ height: `${h}px` }} title={`${d.date} · ${formatUSD(d.revenue)}`} />
                  <span className="text-[8px] text-slate-400">{new Date(`${d.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

// ── Per-user delivery status: is MY OWN Adsterra account ready? ──
const DeliveryStatusCard: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  const [status, setStatus] = React.useState<TrafficStatus | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(() => {
    setLoading(true);
    apiTrafficStatus('smartlink')
      .then((s) => setStatus(s))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const checks = [
    { key: 'key', label: 'Your Adsterra API key', ok: !!status?.hasApiKey, detail: status?.apiKeyMasked || 'Not saved yet', icon: <KeyRound className="w-3.5 h-3.5" />, view: 'smartlinks' },
    { key: 'links', label: 'SmartLinks on your account', ok: (status?.linkCount || 0) > 0, detail: `${status?.linkCount || 0} link(s)`, icon: <Link2 className="w-3.5 h-3.5" />, view: 'smartlinks' },
    { key: 'credits', label: 'Impression credits', ok: (status?.impressionBalance || 0) > 0, detail: `${formatNumber(status?.impressionBalance || 0)} available`, icon: <Zap className="w-3.5 h-3.5" />, view: 'shop' },
    { key: 'booster', label: 'Booster / proxy network', ok: !!status?.proxyReady, detail: status?.proxyReady ? 'Ready' : (status?.proxyReason || 'Not ready'), icon: <Server className="w-3.5 h-3.5" />, view: 'traffic' },
  ];

  const ready = !!status?.ready;

  return (
    <div className="relative overflow-hidden p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs pn-card-in">
      <div className={`absolute -right-16 -top-16 w-56 h-56 rounded-full blur-3xl pointer-events-none ${ready ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`} />
      <div className="relative flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-sm bg-gradient-to-br ${ready ? 'from-emerald-500 to-teal-600' : 'from-amber-500 to-orange-600'}`}>
            {ready ? <ShieldCheck className="w-4 h-4 text-white" /> : <ShieldAlert className="w-4 h-4 text-white" />}
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              Delivery Status
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${ready ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'}`}>
                {ready ? 'Ready' : 'Action needed'}
              </span>
            </h3>
            <p className="text-[10px] text-slate-400">Your own Adsterra account · live readiness check</p>
          </div>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-50 cursor-pointer">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {loading && !status ? (
        <div className="py-8 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-teal-500" /></div>
      ) : (
        <>
          <div className={`relative rounded-lg border p-3 text-[11px] mb-4 ${ready ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300' : 'border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300'}`}>
            <span className="font-semibold">{ready ? '✓ ' : '⚠ '}</span>{status?.reason || 'Checking…'}
          </div>
          <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {checks.map((c) => (
              <button
                key={c.key}
                onClick={() => onNavigate(c.view)}
                className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 hover:border-slate-300 dark:hover:border-slate-700 text-left transition-colors cursor-pointer"
              >
                <span className={`shrink-0 inline-flex w-7 h-7 items-center justify-center rounded-lg ${c.ok ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400'}`}>
                  {c.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">{c.label}</span>
                  <span className="block text-[10px] text-slate-400 truncate">{c.detail}</span>
                </span>
                {c.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <XCircle className="w-4 h-4 text-rose-500 shrink-0" />}
              </button>
            ))}
          </div>
          {!ready && (
            <div className="relative mt-4 flex flex-wrap gap-2">
              <button onClick={() => onNavigate('smartlinks')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors cursor-pointer">
                <Link2 className="w-3.5 h-3.5" /> Open SmartLinks
              </button>
              <button onClick={() => onNavigate('shop')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer">
                <ShoppingCart className="w-3.5 h-3.5" /> Get Credits
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  user,
  wallet,
  credits,
  plan,
  target,
  impressions,
  onStartTraffic,
  onStopTraffic,
  onNavigate,
}) => {
  const isRunning = !!target?.isActive;
  const recentImpressions = impressions.slice(0, 6);

  const successCount = impressions.filter((i) => i.status === 'success').length;
  const failedCount = impressions.filter((i) => i.status === 'failed').length;
  const totalAttempts = impressions.length;
  // Real lifetime impressions come from the server (bot `stats.total_impressions`).
  // This is the single source of truth — never inflate it with the rolling feed
  // length, which only holds the most recent ~500 log rows.
  const lifetimeImpressions = Math.max(0, Math.floor(Number(credits.totalImpressions) || 0));
  const successRate = totalAttempts > 0
    ? Math.round((successCount / totalAttempts) * 100)
    : 0;

  const planLabel = plan?.label || (user.membershipPlanId === 'free' ? 'Free' : user.membershipPlanId);
  const planDaysLeft = (() => {
    if (!user.membershipExpiresAt) return 0;
    const exp = new Date(user.membershipExpiresAt).getTime();
    if (!exp || isNaN(exp)) return 0;
    return Math.max(0, Math.ceil((exp - Date.now()) / 86400000));
  })();

  return (
    <div className="space-y-6">
      {/* ─── Welcome header ─── */}
      <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs pn-card-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Sparkles className="w-3.5 h-3.5 text-teal-500" />
              <span>Dashboard Overview</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2 flex-wrap">
              Welcome back, {user.name?.split(' ')[0] || 'Publisher'}
              <MembershipBadge plan={user.membershipPlanId} expiresAt={user.membershipExpiresAt} size="md" showLabel adminRole={user.role === 'admin' ? (user.adminRole === 'super_admin' ? 'super_admin' : 'admin') : undefined} />
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isRunning
                ? 'Your traffic engine is streaming. Watch live impressions below.'
                : 'Your engine is idle. Start traffic to begin generating impressions.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-wider text-slate-400">Current Plan</span>
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{planLabel}</span>
              {planDaysLeft > 0 && (
                <span className="text-[10px] text-teal-600 dark:text-teal-400">
                  {planDaysLeft} days remaining
                </span>
              )}
            </div>
            <button
              onClick={() => onNavigate('membership')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            >
              <Crown className="w-3.5 h-3.5" />
              <span>Manage Plan</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── Stat cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 pn-stagger">
        <StatCard
          icon={<Wallet className="w-4 h-4" />}
          label="Wallet Balance"
          value={<AnimatedNumber value={wallet.balance} format={(n) => formatBDT(n)} />}
          sub="Available for purchases"
          accent="teal"
          onClick={() => onNavigate('wallet')}
        />
        <StatCard
          icon={<Zap className="w-4 h-4" />}
          label="Impression Credits"
          value={<AnimatedNumber value={credits.balance} />}
          sub={`${formatNumber(credits.lifetimeUsed)} lifetime used`}
          accent="amber"
          onClick={() => onNavigate('shop')}
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Total Impressions"
          value={<AnimatedNumber value={lifetimeImpressions} />}
          sub={`${successRate}% success rate`}
          accent="violet"
          onClick={() => onNavigate('history')}
        />
        <StatCard
          icon={<Link2 className="w-4 h-4" />}
          label="Active Links"
          value="—"
          sub="Manage from Links page"
          accent="sky"
          onClick={() => onNavigate('links')}
        />
      </div>

      {/* ─── Live Adsterra network performance ─── */}
      <NetworkStatsWidget onNavigate={onNavigate} />

      {/* ─── Per-user delivery readiness (my own Adsterra account) ─── */}
      <DeliveryStatusCard onNavigate={onNavigate} />

      {/* ─── Allowance & limits ─── */}
      <AllowanceCard credits={credits} plan={plan} onUpgradeClick={() => onNavigate('membership')} />

      {/* ─── Daily leaderboard widget ─── */}
      <LeaderboardWidget onNavigate={onNavigate} />

      {/* ─── Traffic control + Live feed ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Traffic control card */}
        <div className="lg:col-span-1 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5 flex flex-col">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className={`w-4 h-4 ${isRunning ? 'text-teal-500 animate-pulse' : 'text-slate-400'}`} />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Traffic Engine
              </h3>
            </div>
            <span
              className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${
                isRunning
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {isRunning ? 'Streaming' : 'Idle'}
            </span>
          </div>

          {/* Progress ring */}
          <div className="flex items-center justify-center py-2">
            <ProgressRing
              value={target?.currentProgress || 0}
              max={target?.targetAmount || 0}
            />
          </div>

          {/* Stats under ring */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-wider">
                Progress
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1 font-mono">
                {formatNumber(target?.currentProgress || 0)}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-wider">
                Target
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1 font-mono">
                {target?.targetAmount ? formatNumber(target.targetAmount) : '∞'}
              </div>
            </div>
          </div>

          {/* Auto-stop detail */}
          {target?.targetAmount > 0 && (
            <div className="flex items-start gap-1.5 p-2.5 rounded-lg bg-teal-50 dark:bg-teal-950/30 border border-teal-200/60 dark:border-teal-900/50">
              <BellRing className="w-3 h-3 text-teal-600 shrink-0 mt-0.5" />
              <p className="text-[10px] leading-relaxed text-teal-700 dark:text-teal-300">
                Auto-stops and notifies you once <b className="font-mono">{formatNumber(target.targetAmount)}</b>{' '}
                successful visits are delivered.
              </p>
            </div>
          )}

          {/* Action button */}
          <div className="mt-auto pt-2">
            {isRunning ? (
              <button
                onClick={onStopTraffic}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer transition-colors shadow-xs"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop Traffic</span>
              </button>
            ) : (
              <button
                onClick={onStartTraffic}
                disabled={credits.balance <= 0}
                className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg text-white transition-colors shadow-xs ${
                  credits.balance <= 0
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-teal-600 hover:bg-teal-700 cursor-pointer'
                }`}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  {credits.balance <= 0 ? 'No Credits — Buy First' : 'Start Traffic'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Live activity feed */}
        <div className="lg:col-span-2 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Recent Activity
              </h3>
              {totalAttempts > 0 && (
                <span className="text-[10px] text-slate-400 font-mono">
                  {successCount}✓ · {failedCount}✗
                </span>
              )}
            </div>
            <button
              onClick={() => onNavigate('monitor')}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 cursor-pointer"
            >
              <span>Live Monitor</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          {recentImpressions.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
              <Radio className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-3 animate-pulse" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                No impressions yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                {isRunning
                  ? 'Waiting for the bot to pick up your traffic flag on its next tick.'
                  : 'Start the traffic engine to see live visits from your links.'}
              </p>
              {!isRunning && credits.balance > 0 && (
                <button
                  onClick={onStartTraffic}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Start Now
                </button>
              )}
            </div>
          ) : (
            <div className="flex-1 space-y-2">
              {recentImpressions.map((imp) => (
                <ActivityRow key={imp.id} impression={imp} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Quick actions ─── */}
      <div>
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
          Quick Actions
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <QuickAction
            icon={<Link2 className="w-4 h-4" />}
            label="Add Link"
            onClick={() => onNavigate('links')}
          />
          <QuickAction
            icon={<Package className="w-4 h-4" />}
            label="SmartLinks"
            onClick={() => onNavigate('smartlinks')}
          />
          <QuickAction
            icon={<ShoppingCart className="w-4 h-4" />}
            label="Buy Credits"
            onClick={() => onNavigate('shop')}
          />
          <QuickAction
            icon={<Wallet className="w-4 h-4" />}
            label="Wallet"
            onClick={() => onNavigate('wallet')}
          />
          <QuickAction
            icon={<Gift className="w-4 h-4" />}
            label="Referrals"
            onClick={() => onNavigate('referrals')}
          />
          <QuickAction
            icon={<UserPlus className="w-4 h-4" />}
            label="Profile"
            onClick={() => onNavigate('profile')}
          />
        </div>
      </div>

      {/* ─── Performance summary ─── */}
      {totalAttempts > 0 && (
        <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <Server className="w-4 h-4 text-teal-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Performance Snapshot
            </h3>
            <span className="text-[10px] text-slate-400 ml-1">(last {totalAttempts} impressions)</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <MetricBlock
              label="Success Rate"
              value={`${successRate}%`}
              color={successRate >= 80 ? 'emerald' : successRate >= 50 ? 'amber' : 'rose'}
            />
            <MetricBlock
              label="Successful"
              value={formatNumber(successCount)}
              color="emerald"
            />
            <MetricBlock
              label="Failed"
              value={formatNumber(failedCount)}
              color="rose"
            />
            <MetricBlock
              label="Data Used"
              value={`${formatNumber(Math.round(recentImpressions.reduce((s, i) => s + i.dwellMs, 0) / 1000))}s dwell`}
              color="slate"
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
//  Sub-components
// ═══════════════════════════════════════════════════════════════════════

const ACCENT_MAP: Record<string, { bg: string; text: string; ring: string }> = {
  teal:   { bg: 'bg-teal-50 dark:bg-teal-950/40',     text: 'text-teal-600 dark:text-teal-400',     ring: 'ring-teal-500/10' },
  amber:  { bg: 'bg-amber-50 dark:bg-amber-950/40',   text: 'text-amber-600 dark:text-amber-400',   ring: 'ring-amber-500/10' },
  violet: { bg: 'bg-violet-50 dark:bg-violet-950/40', text: 'text-violet-600 dark:text-violet-400', ring: 'ring-violet-500/10' },
  sky:    { bg: 'bg-sky-50 dark:bg-sky-950/40',       text: 'text-sky-600 dark:text-sky-400',       ring: 'ring-sky-500/10' },
};

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  accent: keyof typeof ACCENT_MAP;
  onClick?: () => void;
}> = ({ icon, label, value, sub, accent, onClick }) => {
  const a = ACCENT_MAP[accent] || ACCENT_MAP.teal;
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`group relative overflow-hidden text-left p-5 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 shadow-xs transition-all pn-card-in pn-lift ${
        onClick ? 'hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer pn-shine' : 'cursor-default'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${a.bg} ${a.text} ring-4 ${a.ring} transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3`}>
          {icon}
        </div>
        {onClick && (
          <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700 group-hover:text-slate-500 transition-colors" />
        )}
      </div>
      <div className="space-y-0.5">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
          {label}
        </div>
        <div className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
          {value}
        </div>
        <div className="text-[11px] text-slate-400 dark:text-slate-500">
          {sub}
        </div>
      </div>
    </button>
  );
};

const ProgressRing: React.FC<{ value: number; max: number }> = ({ value, max }) => {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const r = 42;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50" cy="50" r={r}
          className="stroke-slate-100 dark:stroke-slate-800"
          strokeWidth="8" fill="transparent"
        />
        <circle
          cx="50" cy="50" r={r}
          className="stroke-teal-500 transition-all duration-700 ease-out"
          strokeWidth="8"
          strokeDasharray={circ}
          strokeDashoffset={circ - dash}
          strokeLinecap="round"
          fill="transparent"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
          {pct}%
        </span>
        <span className="text-[9px] text-slate-400 uppercase tracking-wider mt-0.5">
          Complete
        </span>
      </div>
    </div>
  );
};

const ActivityRow: React.FC<{ impression: LiveImpression }> = ({ impression }) => {
  const ok = impression.status === 'success';
  const shortUrl = (() => {
    try {
      const u = new URL(impression.url);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return impression.url.slice(0, 40);
    }
  })();

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <div className="shrink-0">
        {ok ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        ) : (
          <XCircle className="w-4 h-4 text-rose-500" />
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
            {shortUrl}
          </span>
          <span
            className={`shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-bold ${
              impression.linkType === 'smartlink'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                : 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300'
            }`}
          >
            {impression.linkType}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
          <Clock className="w-2.5 h-2.5" />
          <span>{relativeTime(impression.timestamp)}</span>
          {impression.proxyRegion && (
            <>
              <span>·</span>
              <span className="font-mono inline-flex items-center gap-1" title={impression.proxyCountry ? `CPM-boosted in ${impression.proxyCountry}` : undefined}>
                <CountryFlag code={impression.proxyRegion} flag={impression.proxyFlag} name={impression.proxyCountry} size="sm" /> {impression.proxyRegion}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[10px] font-mono text-slate-400">
          {ok ? '-1 credit' : 'no charge'}
        </div>
      </div>
    </div>
  );
};

const QuickAction: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}> = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 hover:border-teal-500 dark:hover:border-teal-500 hover:bg-teal-50/30 dark:hover:bg-teal-950/20 transition-all cursor-pointer group"
  >
    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 group-hover:bg-teal-100 dark:group-hover:bg-teal-950 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
      {icon}
    </div>
    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100">
      {label}
    </span>
  </button>
);

const MetricBlock: React.FC<{
  label: string;
  value: string;
  color: 'emerald' | 'amber' | 'rose' | 'slate';
}> = ({ label, value, color }) => {
  const colorMap = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    rose: 'text-rose-600 dark:text-rose-400',
    slate: 'text-slate-700 dark:text-slate-300',
  };
  return (
    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mb-1">
        {label}
      </div>
      <div className={`text-lg font-bold font-mono tabular-nums ${colorMap[color]}`}>
        {value}
      </div>
    </div>
  );
};