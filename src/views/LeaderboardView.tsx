import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Trophy,
  Crown,
  Medal,
  Flame,
  TrendingUp,
  Eye,
  Coins,
  Clock,
  RefreshCw,
  Sparkles,
  ChevronRight,
  Loader2,
  Users,
  Zap,
  BarChart3,
  MousePointerClick,
  Activity,
  Globe2,
  ShieldCheck,
} from 'lucide-react';
import { User } from '../types';
import { UserAvatar } from '../components/ui/UserAvatar';
import { MembershipBadge } from '../components/ui/MembershipBadge';
import {
  apiLeaderboard,
  apiAdsterraSummary,
  LeaderboardData,
  LeaderboardUser,
  AdsterraNetworkSummary,
} from '../services/api';
import { formatUSD } from '../lib/currency';
interface LeaderboardViewProps {
  user: User;
  onNavigate: (view: string) => void;
}

const MEDAL_STYLES: Record<number, { ring: string; glow: string; chip: string; label: string }> = {
  1: { ring: 'from-amber-400 via-yellow-300 to-amber-500', glow: 'shadow-amber-400/40', chip: 'bg-amber-400 text-amber-950', label: 'Champion' },
  2: { ring: 'from-slate-300 via-slate-100 to-slate-400', glow: 'shadow-slate-300/40', chip: 'bg-slate-300 text-slate-900', label: 'Runner-up' },
  3: { ring: 'from-orange-400 via-amber-600 to-orange-700', glow: 'shadow-orange-500/40', chip: 'bg-orange-500 text-orange-50', label: 'Third' },
};

function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function shortDay(date: string): string {
  try {
    return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
  } catch {
    return date.slice(5);
  }
}

/* ── Live Adsterra network performance (real revenue from the publisher API) ── */
const NetworkPanel: React.FC<{ net?: AdsterraNetworkSummary; loading: boolean; onRefresh: () => void; onConnect?: () => void }> = ({
  net,
  loading,
  onRefresh,
  onConnect,
}) => {
  const days = net?.days || [];
  const maxRev = Math.max(0.0001, ...days.map((d) => Number(d.revenue) || 0));
  const cards = [
    {
      label: 'Revenue · 7 days',
      value: formatUSD(net?.revenue || 0),
      sub: net?.today ? `${formatUSD(net.today.revenue)} today` : 'network total',
      icon: <Coins className="w-4 h-4" />,
      accent: 'from-emerald-500 to-teal-600',
      glow: 'shadow-emerald-500/25',
    },
    {
      label: 'Average CPM',
      value: `$${(Number(net?.cpm) || 0).toFixed(2)}`,
      sub: 'per 1,000 impressions',
      icon: <TrendingUp className="w-4 h-4" />,
      accent: 'from-amber-500 to-orange-600',
      glow: 'shadow-amber-500/25',
    },
    {
      label: 'Network Impressions · 7 days',
      value: (Number(net?.impressions) || 0).toLocaleString(),
      sub: net?.today ? `${(Number(net.today.impressions) || 0).toLocaleString()} today` : 'Adsterra network · all placements',
      icon: <Eye className="w-4 h-4" />,
      accent: 'from-sky-500 to-indigo-600',
      glow: 'shadow-sky-500/25',
    },
    {
      label: 'Clicks · 7 days',
      value: (Number(net?.clicks) || 0).toLocaleString(),
      sub: `${(Number(net?.ctr) || 0).toFixed(2)}% CTR`,
      icon: <MousePointerClick className="w-4 h-4" />,
      accent: 'from-fuchsia-500 to-pink-600',
      glow: 'shadow-fuchsia-500/25',
    },
  ];

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1220] shadow-sm">
      <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
      <div className="relative flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 pt-5">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <BarChart3 className="w-5 h-5 text-white" />
          </span>
          <div>
            <h2 className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-slate-50 flex items-center gap-1.5">
              Network Performance
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                <Activity className="w-2.5 h-2.5" /> Live
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">Real Adsterra revenue · last {net?.windowDays || 7} days</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 px-3 py-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:border-emerald-300 hover:text-emerald-600 transition-colors disabled:opacity-60 cursor-pointer"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Sync
        </button>
      </div>

      {net && !net.ok ? (
        <div className="relative px-5 sm:px-6 py-6">
          {net.needsKey ? (
            <div className="relative overflow-hidden rounded-2xl border border-teal-200 dark:border-teal-900/50 bg-gradient-to-br from-teal-50 to-emerald-50 dark:from-teal-950/30 dark:to-emerald-950/20 p-5">
              <div className="pointer-events-none absolute -right-8 -top-8 w-32 h-32 rounded-full bg-teal-500/10 blur-2xl" />
              <div className="relative flex flex-wrap items-center gap-4">
                <span className="inline-flex w-11 h-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg shadow-teal-500/30">
                  <ShieldCheck className="w-5 h-5" />
                </span>
                <div className="min-w-[180px] flex-1">
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-50">Connect your Adsterra account</h3>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Add your Adsterra publisher API key in SmartLinks to unlock live revenue, CPM and impression stats
                    pulled straight from your own account.
                  </p>
                </div>
                {onConnect && (
                  <button
                    type="button"
                    onClick={onConnect}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-teal-600 to-emerald-600 px-4 py-2 text-[12px] font-bold text-white shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40 hover:-translate-y-0.5 transition-all cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5" /> Connect now
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-4 text-[12px] text-amber-700 dark:text-amber-300">
              Live Adsterra data is unavailable right now{net.error ? ` — ${net.error}` : ''}. The board below still
              tracks your delivered impressions and revenue share.
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-3 px-5 sm:px-6 py-5">
            {cards.map((c) => (
              <div
                key={c.label}
                className="group relative overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800 bg-gradient-to-b from-white to-slate-50/70 dark:from-[#0f172a] dark:to-[#0b1220] p-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
              >
                <div className={`absolute -right-6 -top-6 w-16 h-16 rounded-full bg-gradient-to-br ${c.accent} opacity-10 blur-xl`} />
                <span className={`inline-flex w-8 h-8 items-center justify-center rounded-xl bg-gradient-to-br ${c.accent} text-white shadow-lg ${c.glow}`}>
                  {c.icon}
                </span>
                <div className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{c.label}</div>
                <div className="mt-0.5 text-xl font-extrabold tabular-nums text-slate-900 dark:text-slate-50">{c.value}</div>
                <div className="text-[10px] text-slate-400 truncate">{c.sub}</div>
              </div>
            ))}
          </div>

          {/* 7-day revenue spark bars */}
          <div className="relative px-5 sm:px-6 pb-6">
            <div className="flex items-end justify-between gap-1.5 h-24">
              {days.length === 0 ? (
                <div className="w-full text-center text-[11px] text-slate-400 py-6">No revenue data in this window yet.</div>
              ) : (
                days.map((d) => {
                  const h = Math.max(4, Math.round(((Number(d.revenue) || 0) / maxRev) * 88));
                  return (
                    <div key={d.date} className="group/bar flex-1 flex flex-col items-center justify-end gap-1.5">
                      <span className="opacity-0 group-hover/bar:opacity-100 transition-opacity text-[9px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatUSD(d.revenue)}
                      </span>
                      <div
                        className="w-full rounded-t-md bg-gradient-to-t from-emerald-500/70 to-teal-400 group-hover/bar:from-emerald-500 group-hover/bar:to-teal-300 transition-all"
                        style={{ height: `${h}px` }}
                        title={`${d.date} · ${formatUSD(d.revenue)} · ${(Number(d.impressions) || 0).toLocaleString()} imp`}
                      />
                      <span className="text-[9px] font-medium text-slate-400">{shortDay(d.date)}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const PodiumCard: React.FC<{
  entry: LeaderboardUser;
  metric: 'impressions' | 'earnings';
  onOpen: (id: string) => void;
  delay: number;
}> = ({ entry, metric, onOpen, delay }) => {
  const style = MEDAL_STYLES[entry.rank] || MEDAL_STYLES[3];
  const isFirst = entry.rank === 1;
  const value = metric === 'impressions' ? entry.impressions.toLocaleString() : formatUSD(entry.earnings);
  const Icon = metric === 'impressions' ? Eye : Coins;

  return (
    <button
      type="button"
      onClick={() => onOpen(entry.publicId || entry.userId)}
      style={{ animationDelay: `${delay}ms` }}
      className={`group relative flex flex-col items-center text-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-4 pt-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 animate-fade-up cursor-pointer ${
        isFirst ? 'sm:scale-105 z-10 ring-1 ring-amber-300/50' : ''
      }`}
    >
      <span className={`absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${style.chip} shadow`}>
        {entry.rank === 1 ? <Crown className="w-3 h-3" /> : <Medal className="w-3 h-3" />}
        #{entry.rank} {style.label}
      </span>

      <span className={`relative p-[3px] rounded-full bg-gradient-to-br ${style.ring} ${isFirst ? 'animate-pulse-slow' : ''} shadow-lg ${style.glow}`}>
        <UserAvatar name={entry.name} src={entry.avatar} size={isFirst ? 'xl' : 'lg'} />
        {isFirst && <Sparkles className="absolute -right-2 -top-2 w-5 h-5 text-amber-400 animate-spin-slow" />}
      </span>

      <div className="mt-3 min-w-0 w-full">
        <div className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors flex items-center justify-center gap-1">
          <span className="truncate">{entry.name}</span>
          <MembershipBadge plan={entry.plan} expiresAt={entry.membershipExpiresAt} size="xs" />
        </div>
        <div className="text-[11px] text-slate-400 truncate">@{entry.username}</div>
      </div>

      <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
        <Icon className={`w-3.5 h-3.5 ${metric === 'impressions' ? 'text-teal-500' : 'text-emerald-500'}`} />
        <span className="text-sm font-extrabold tabular-nums text-slate-800 dark:text-slate-100">{value}</span>
      </div>

      <span className="mt-2 inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
        View profile <ChevronRight className="w-3 h-3" />
      </span>
    </button>
  );
};

const BoardPanel: React.FC<{
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
  entries: LeaderboardUser[];
  nextEntries?: LeaderboardUser[];
  metric: 'impressions' | 'earnings';
  onOpen: (id: string) => void;
  emptyHint: string;
}> = ({ title, subtitle, icon, accent, entries, nextEntries = [], metric, onOpen, emptyHint }) => {
  const value = (e: LeaderboardUser) =>
    metric === 'impressions' ? e.impressions.toLocaleString() : formatUSD(e.earnings);
  const MetricIcon = metric === 'impressions' ? Eye : Coins;
  const nextStart = nextEntries.length ? nextEntries[0].rank : 4;
  const nextEnd = nextEntries.length ? nextEntries[nextEntries.length - 1].rank : 3;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-b from-white to-slate-50/60 dark:from-[#0f172a] dark:to-[#0b1220] shadow-sm overflow-hidden">
      <div className={`flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r ${accent}`}>
        <span className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center text-white shadow-inner">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white tracking-tight">{title}</h3>
          <p className="text-[11px] text-white/80 truncate">{subtitle}</p>
        </div>
      </div>

      <div className="p-5">
        {entries.length === 0 ? (
          <div className="py-10 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
              <Trophy className="w-5 h-5 text-slate-300 dark:text-slate-600" />
            </div>
            <p className="text-xs text-slate-400">{emptyHint}</p>
          </div>
        ) : (
          <>
            {/* Podium — top 3 */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              {[...entries].sort((a, b) => (a.rank === 1 ? -1 : b.rank === 1 ? 1 : a.rank - b.rank)).map((e, i) => (
                <PodiumCard key={e.userId} entry={e} metric={metric} onOpen={onOpen} delay={i * 90} />
              ))}
            </div>

            {/* Next 20 — single serial (1-column) list, ranks 4-23 */}
            {nextEntries.length > 0 && (
              <div className="mt-5">
                <div className="flex items-center gap-3 mb-2.5">
                  <span className="h-px flex-1 bg-gradient-to-r from-transparent to-slate-200 dark:to-slate-700" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 whitespace-nowrap">
                    Next {nextEntries.length} · Ranks {nextStart}–{nextEnd}
                  </span>
                  <span className="h-px flex-1 bg-gradient-to-l from-transparent to-slate-200 dark:to-slate-700" />
                </div>
                <ol className="flex flex-col gap-1.5">
                  {nextEntries.map((e) => (
                    <li key={e.userId}>
                      <button
                        type="button"
                        onClick={() => onOpen(e.publicId || e.userId)}
                        className="group w-full flex items-center gap-3 px-3 py-2 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900/40 hover:border-teal-300 dark:hover:border-teal-700 hover:bg-teal-50/50 dark:hover:bg-teal-950/20 transition-colors text-left cursor-pointer"
                      >
                        <span className="w-6 shrink-0 text-center text-xs font-extrabold tabular-nums text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400">
                          {e.rank}
                        </span>
                        <UserAvatar name={e.name} src={e.avatar} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1">
                            <span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                              {e.name}
                            </span>
                            <MembershipBadge plan={e.plan} expiresAt={e.membershipExpiresAt} size="xs" />
                          </span>
                          <span className="block truncate text-[10px] text-slate-400">@{e.username}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 shrink-0">
                          <MetricIcon className={`w-3.5 h-3.5 ${metric === 'impressions' ? 'text-teal-500' : 'text-emerald-500'}`} />
                          <span className="text-xs font-extrabold tabular-nums text-slate-800 dark:text-slate-100">{value(e)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({ user, onNavigate }) => {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [netRefreshing, setNetRefreshing] = useState(false);
  const [net, setNet] = useState<AdsterraNetworkSummary | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const targetRef = useRef(0);

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    apiLeaderboard()
      .then((d) => {
        setData(d);
        if (d.network) setNet(d.network);
        targetRef.current = Date.now() + Math.max(0, Number(d.resetsInMs) || 0);
        setCountdown(Math.max(0, Number(d.resetsInMs) || 0));
        setError(null);
      })
      .catch((e) => setError(e?.message || 'Could not load the leaderboard.'))
      .finally(() => { setLoading(false); setRefreshing(false); });
  };

  const refreshNetwork = () => {
    setNetRefreshing(true);
    apiAdsterraSummary(7, true)
      .then((s) => setNet(s))
      .catch(() => {})
      .finally(() => setNetRefreshing(false));
  };

  useEffect(() => {
    load();
    const refresh = setInterval(() => load(true), 30000);
    return () => clearInterval(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(Math.max(0, targetRef.current - Date.now()));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const openProfile = (id: string) => onNavigate(`profile_public:${id}`);

  const me = data?.me;
  const myImpressions = me?.impressions ?? 0;
  const myEarnings = me?.earnings ?? 0;
  const myImpRank = me?.impressionsRank ?? null;
  const myEarnRank = me?.earningsRank ?? null;

  // ⭐ V40: "Your earnings today" now reflects LIVE Adsterra revenue from the
  // user's OWN publisher account (me.live). Falls back to the platform revenue-share
  // estimate only when no Adsterra key is connected / data is unavailable.
  const live = me?.live;
  const liveTodayRevenue = live && live.ok ? Number(live.todayRevenue) || 0 : null;
  const liveWindowRevenue = live && live.ok ? Number(live.revenue) || 0 : null;
  const earningsToday = liveTodayRevenue != null ? liveTodayRevenue : myEarnings;
  const earningsIsLive = liveTodayRevenue != null;
  const liveImpressionsToday = live && live.ok ? Number(live.todayImpressions) || 0 : null;

  const todayLabel = useMemo(() => {
    if (!data?.date) return '';
    try {
      return new Date(`${data.date}T00:00:00+06:00`).toLocaleDateString('en-US', {
        weekday: 'long', month: 'short', day: 'numeric',
      });
    } catch { return data.date; }
  }, [data?.date]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-teal-600 via-emerald-600 to-cyan-700 p-6 shadow-xl">
        <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -left-6 -bottom-12 w-48 h-48 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_120%,rgba(255,255,255,0.14),transparent_45%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shadow-inner ring-1 ring-white/30">
              <Trophy className="w-6 h-6 text-white animate-bounce-slow" />
            </span>
            <div>
              <h1 className="text-xl font-extrabold text-white tracking-tight">Daily Leaderboard</h1>
              <p className="text-xs text-white/80">
                Top publishers of {todayLabel || 'today'} — resets automatically at midnight (Asia/Dhaka).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/15 backdrop-blur px-4 py-2 text-center ring-1 ring-white/20">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/80">
                <Clock className="w-3 h-3" /> Resets in
              </div>
              <div className="text-lg font-extrabold tabular-nums text-white">{fmtCountdown(countdown)}</div>
            </div>
            <button
              type="button"
              onClick={() => load(true)}
              disabled={refreshing}
              className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center text-white hover:bg-white/25 transition-colors disabled:opacity-60 cursor-pointer ring-1 ring-white/20"
              aria-label="Refresh leaderboard"
            >
              {refreshing ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {data && (
          <div className="relative mt-4 flex flex-wrap items-center gap-2 text-[11px] text-white/90">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 ring-1 ring-white/15">
              <Users className="w-3 h-3" /> {data.totalParticipants} publishers competing
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 ring-1 ring-white/15">
              <Zap className="w-3 h-3" /> SmartLink ${data.rates.smartlink}/1k · Normal ${data.rates.normal}/1k
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 ring-1 ring-white/15">
              <ShieldCheck className="w-3 h-3" /> Adsterra-safe delivery
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
          <p className="text-xs text-slate-400">Loading today's standings…</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 p-6 text-center">
          <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>
          <button
            type="button"
            onClick={() => load()}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      ) : (
        <>
          {/* Live Revenue — real earnings straight from the Adsterra publisher API */}
          <div className="relative overflow-hidden rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-950/40 dark:via-[#0f172a] dark:to-cyan-950/30 p-5 shadow-sm">
            <div className="pointer-events-none absolute -top-16 -right-10 w-52 h-52 rounded-full bg-emerald-500/10 blur-3xl" />
            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white items-center justify-center shadow-lg shrink-0">
                  <Coins className="w-5 h-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Live Revenue</h2>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      net && !net.ok
                        ? 'bg-slate-400/15 text-slate-500 dark:text-slate-400'
                        : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${net && !net.ok ? 'bg-slate-400' : 'bg-emerald-500 animate-pulse'}`} />
                      {net && !net.ok ? 'Not connected' : 'Live'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Real earnings pulled live from the Adsterra publisher API
                  </p>
                </div>
              </div>
              {net && !net.ok ? (
                <button
                  type="button"
                  onClick={() => onNavigate('smartlinks')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-teal-600 to-emerald-600 px-4 py-2 text-[12px] font-bold text-white shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40 hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" /> Connect Adsterra
                </button>
              ) : (
                <div className="flex items-center gap-5 sm:gap-7">
                  <div className="text-right">
                    <div className="text-2xl font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatUSD(net?.revenue || 0)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">Last {net?.windowDays || 7} days</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatUSD(net?.today?.revenue || 0)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">Today</div>
                  </div>
                  <div className="text-right hidden sm:block">
                    <div className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-slate-100">
                      {(Number(net?.impressions) || 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">Network Impressions</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Live Adsterra network performance */}
          <NetworkPanel net={net} loading={netRefreshing} onRefresh={refreshNetwork} onConnect={() => onNavigate('smartlinks')} />

          {/* Your standing */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="relative overflow-hidden rounded-2xl border border-teal-200 dark:border-teal-900/60 bg-white dark:bg-[#0f172a] p-5 shadow-sm">
              <div className="absolute right-0 top-0 w-24 h-24 bg-teal-500/10 rounded-full blur-2xl" />
              <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400">
                <Eye className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Your impressions today</span>
              </div>
              <div className="mt-2 flex items-end justify-between">
                <span className="text-3xl font-extrabold tabular-nums text-slate-900 dark:text-slate-50">
                  {myImpressions.toLocaleString()}
                </span>
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                  myImpRank && myImpRank <= 3
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  <Trophy className="w-3 h-3" />
                  {myImpRank ? `Rank #${myImpRank}` : 'Not ranked yet'}
                </span>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-[#0f172a] p-5 shadow-sm">
              <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl" />
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <Coins className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Your earnings today</span>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                  earningsIsLive
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-400/15 text-slate-500 dark:text-slate-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${earningsIsLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                  {earningsIsLive ? 'Live Adsterra' : 'Estimated'}
                </span>
              </div>
              <div className="mt-2 flex items-end justify-between">
                <span className="text-3xl font-extrabold tabular-nums text-slate-900 dark:text-slate-50">
                  {formatUSD(earningsToday)}
                </span>
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                  myEarnRank && myEarnRank <= 3
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  <TrendingUp className="w-3 h-3" />
                  {myEarnRank ? `Rank #${myEarnRank}` : 'Not ranked yet'}
                </span>
              </div>
              <div className="mt-2 text-[10px] text-slate-400">
                {earningsIsLive
                  ? `${formatUSD(liveWindowRevenue || 0)} in the last ${live?.windowDays || 7} days · ${(liveImpressionsToday || 0).toLocaleString()} impressions today`
                  : live?.needsKey
                    ? 'Connect your Adsterra key in SmartLinks to show live revenue'
                    : 'Estimated from your delivered impressions'}
              </div>
            </div>
          </div>

          {/* Two boards */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <BoardPanel
              title="Top Impressions"
              subtitle="Most delivered visits today"
              icon={<Eye className="w-5 h-5" />}
              accent="from-teal-500 to-emerald-600"
              entries={data?.topImpressions || []}
              nextEntries={data?.nextImpressions || []}
              metric="impressions"
              onOpen={openProfile}
              emptyHint="No impressions recorded yet today. Start traffic to climb the board!"
            />
            <BoardPanel
              title="Top Earnings"
              subtitle="Highest revenue share today"
              icon={<Coins className="w-5 h-5" />}
              accent="from-emerald-500 to-cyan-600"
              entries={data?.topEarnings || []}
              nextEntries={data?.nextEarnings || []}
              metric="earnings"
              onOpen={openProfile}
              emptyHint="No earnings recorded yet today. Deliver visits to earn!"
            />
          </div>

          {/* How it works */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="w-4 h-4 text-orange-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">How the daily board works</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Every delivered visit your engine completes today counts toward your impressions. Earnings are the
              publisher revenue share for those visits (SmartLink visits pay more than normal links). The Network
              Performance panel above shows the <span className="font-semibold text-slate-600 dark:text-slate-300">real Adsterra
              revenue, CPM and impressions</span> pulled live from the publisher API for the last seven days. Each board
              shows the top three publishers on the podium, followed by the next twenty in a single serial list
              (ranks 4–23), and rolls over to a clean slate automatically at 00:00 Bangladesh time — so everyone gets a
              fresh chance every day. Tap any profile picture to open that publisher's public profile.
            </p>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
              <Globe2 className="w-3.5 h-3.5" /> Powered by the Adsterra publisher API · refreshed every few minutes
            </div>
          </div>
        </>
      )}
    </div>
  );
};
