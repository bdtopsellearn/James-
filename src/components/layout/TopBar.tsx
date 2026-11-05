import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../../theme';
import { createPortal } from 'react-dom';
import {
  Sun,
  Moon,
  Bell,
  BellRing,
  CheckCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Shield,
  User as UserIcon,
  ChevronDown,
  ChevronRight,
  Activity,
  LogOut,
  Menu,
  Settings,
  CreditCard,
  PlayCircle,
  FileText,
  Camera,
  Lock,
  X,
  Coins,
  Trophy,
  Search,
  DollarSign,
  Eye,
  RefreshCw,
  Radio
} from 'lucide-react';
import { User, Wallet, Credits } from '../../types';
import { apiAdsterraSummary, type AdsterraNetworkSummary } from '../../services/api';
import { BrandLogo } from '../brand/BrandLogo';
import { UserAvatar } from '../ui/UserAvatar';
import { MembershipBadge } from '../ui/MembershipBadge';
import {
  AppNotification,
  getLastSeen,
  markAllSeen,
  notifTime,
  timeAgo
} from '../../lib/notifications';

interface TopBarProps {
  user: User;
  wallet: Wallet;
  credits: Credits;
  activeView: string;
  theme?: 'light' | 'dark';
  notifications?: AppNotification[];
  onToggleTheme?: () => void;
  onNavigate: (view: string) => void;
  onToggleMobileMenu?: () => void;
  onLogout?: () => void;
  onReplaySplash?: () => void;
}

/* ───────────────────────── Popover / bottom-sheet ─────────────────────────
   Rendered through a portal into <body>, so it can never be clipped or
   re-positioned by the sticky/blurred header. Phones get a bottom sheet,
   larger screens get a popover anchored under the button. */
function useIsDesktop() {
  const q = '(min-width: 640px)';
  const [d, setD] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(q).matches : true));
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setD(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return d;
}

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  label: string;
  widthClass?: string;
  children: React.ReactNode;
}

const Popover: React.FC<PopoverProps> = ({ open, onClose, anchorRef, label, widthClass = 'w-96', children }) => {
  const desktop = useIsDesktop();
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 64, right: 12 });

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 8, right: Math.max(12, window.innerWidth - r.right) });
    };
    place();
    window.addEventListener('resize', place);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, anchorRef, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={label}>
      <div
        onClick={onClose}
        className={`absolute inset-0 animate-fade-in ${desktop ? 'bg-transparent' : 'bg-black/55 backdrop-blur-[2px]'}`}
      />
      {desktop ? (
        <div
          style={{ top: pos.top, right: pos.right }}
          className={`absolute ${widthClass} max-w-[calc(100vw-1.5rem)] max-h-[calc(100dvh-6rem)] flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700/80 shadow-2xl shadow-slate-900/20 dark:shadow-black/60 animate-pop origin-top-right`}
        >
          {children}
        </div>
      ) : (
        <div className="absolute left-0 right-0 bottom-0 max-h-[88dvh] flex flex-col overflow-hidden rounded-t-3xl bg-white dark:bg-[#0f172a] border-t border-slate-200 dark:border-slate-700/80 shadow-2xl animate-sheet-up pb-[env(safe-area-inset-bottom,0px)]">
          <div className="pt-2 pb-1 flex justify-center shrink-0" onClick={onClose}>
            <span className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>
          {children}
        </div>
      )}
    </div>,
    document.body
  );
};

const TONE = {
  success: { Icon: CheckCircle2, cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  info: { Icon: Info, cls: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  warning: { Icon: AlertTriangle, cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  danger: { Icon: XCircle, cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' }
} as const;

const iconBtn =
  'relative p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0';

/* ─────────────────────────────────────────────────────────────────────────
   Adsterra LIVE stats — today's REAL revenue + impressions pulled straight
   from the Adsterra publisher API (cached server-side, 5 min). Sits in the
   top bar right next to the notification bell and the profile avatar.
   ───────────────────────────────────────────────────────────────────────── */
const compactNum = (n: number): string => {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1) + 'M';
  if (abs >= 1_000) return (v / 1_000).toFixed(abs >= 10_000 ? 0 : 1) + 'K';
  return String(Math.round(v));
};

const AdsterraLiveStats: React.FC = () => {
  const [data, setData] = useState<AdsterraNetworkSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const s = await apiAdsterraSummary(7, force);
      setData(s);
      setFailed(!(s && s.ok));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
    const t = setInterval(() => { void load(false); }, 60000);
    return () => clearInterval(t);
  }, [load]);

  const today = data?.today;
  const revenue = today?.revenue ?? 0;
  const impressions = today?.impressions ?? 0;
  const cpm = today?.cpm ?? 0;
  const clicks = today?.clicks ?? 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const days = data?.days ?? [];
  const maxRev = Math.max(1, ...days.map((d) => d.revenue));

  const tile = (label: string, value: string, tone: string) => (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-3 py-2.5">
      <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <span className={`mt-0.5 block text-base font-bold font-mono tabular-nums ${tone}`}>{value}</span>
    </div>
  );

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Today's live Adsterra performance — click for details"
        aria-label="Live Adsterra performance"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="hidden md:flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-xl border border-emerald-200/70 dark:border-emerald-900/60 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/50 dark:to-teal-950/40 hover:shadow-md hover:shadow-emerald-500/10 transition-all cursor-pointer shrink-0"
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="flex items-center gap-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
          <DollarSign className="w-3.5 h-3.5" />
          {revenue.toFixed(2)}
        </span>
        <span className="text-slate-300 dark:text-slate-700">|</span>
        <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
          <Eye className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
          {compactNum(impressions)}
        </span>
        {loading && <RefreshCw className="w-3 h-3 text-slate-400 animate-spin" />}
      </button>

      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} label="Live Adsterra performance" widthClass="w-80">
        <div className="px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
              <Radio className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Live Network Stats</h3>
              <p className="text-[10px] text-slate-400">Adsterra publisher API • today</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            aria-label="Refresh live stats"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          {failed && !data ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-6">
              Live stats are unavailable right now. Tap refresh to try again.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                {tile('Revenue today', `$${revenue.toFixed(2)}`, 'text-emerald-600 dark:text-emerald-400')}
                {tile('Impressions', compactNum(impressions), 'text-teal-600 dark:text-teal-400')}
                {tile('CPM', `$${cpm.toFixed(2)}`, 'text-sky-600 dark:text-sky-400')}
                {tile('Clicks / CTR', `${compactNum(clicks)} · ${ctr.toFixed(2)}%`, 'text-amber-600 dark:text-amber-400')}
              </div>

              {days.length > 0 && (
                <div className="pt-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Last 7 days</span>
                    <span className="text-[10px] font-mono text-slate-400">${(data?.revenue ?? 0).toFixed(2)} total</span>
                  </div>
                  <div className="flex items-end gap-1 h-16">
                    {days.map((d) => (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group" title={`${d.date}: $${d.revenue.toFixed(2)}`}>
                        <div
                          className="w-full rounded-t bg-gradient-to-t from-emerald-500/70 to-teal-400/70 group-hover:from-emerald-500 group-hover:to-teal-400 transition-all"
                          style={{ height: `${Math.max(3, (d.revenue / maxRev) * 100)}%` }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-slate-400 text-center pt-1">
                {data?.updatedAt ? `Updated ${new Date(data.updatedAt).toLocaleTimeString()}` : 'Auto-refreshes every minute'}
              </p>
            </>
          )}
        </div>
      </Popover>
    </>
  );
};

export const TopBar: React.FC<TopBarProps> = ({
  user,
  wallet,
  credits,
  activeView,
  theme: themeProp,
  notifications = [],
  onToggleTheme: onToggleThemeProp,
  onNavigate,
  onToggleMobileMenu,
  onLogout,
  onReplaySplash
}) => {
  const [storeTheme, storeToggleTheme] = useTheme();
  const theme = themeProp ?? storeTheme;
  const onToggleTheme = onToggleThemeProp ?? storeToggleTheme;
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [lastSeen, setLastSeen] = useState<number>(() => getLastSeen(user.id));
  const bellRef = useRef<HTMLButtonElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setLastSeen(getLastSeen(user.id)), [user.id]);

  const isAdmin = user.role === 'admin';
  const isSuperAdmin = isAdmin && (user.adminRole === 'super_admin' || user.email === 'alif.yasin@pnnetwork.io');
  const homeView = isAdmin ? 'admin_overview' : 'overview';

  const unread = useMemo(
    () => notifications.filter((n) => notifTime(n.at) > lastSeen).length,
    [notifications, lastSeen]
  );

  // Profile completeness (users): name, photo, bio, phone, country
  const completeness = useMemo(() => {
    const parts = [!!user.name, !!user.avatar, !!user.bio, !!user.phone, !!user.country];
    return Math.round((parts.filter(Boolean).length / parts.length) * 100);
  }, [user.name, user.avatar, user.bio, user.phone, user.country]);

  const closeAll = () => {
    setShowNotifications(false);
    setShowUserMenu(false);
  };

  const go = (view: string) => {
    closeAll();
    onNavigate(view);
  };

  const markRead = () => setLastSeen(markAllSeen(user.id));

  const formatViewName = (view: string) => {
    switch (view) {
      case 'overview': return 'Overview';
      case 'links': return 'Normal Links';
      case 'smartlinks': return 'SmartLinks';
      case 'traffic': return 'Traffic Control';
      case 'monitor': return 'Live Monitor';
      case 'stats': return 'Analytics';
      case 'history': return 'Logs';
      case 'wallet': return 'Wallet & Billing';
      case 'shop': return 'Credits Shop';
      case 'membership': return 'Plans';
      case 'referrals': return 'Referrals';
      case 'support': return 'Support Desk';
      case 'profile': return 'Profile';
      case 'settings': return 'Preferences';
      case 'admin_overview': return 'Operations Center';
      case 'admin_users': return 'User Directory';
      case 'admin_appeals': return 'Ban Appeals';
      case 'admin_user_detail': return 'User Inspector';
      case 'admin_admins': return 'Admin Governance';
      case 'admin_roles': return 'Roles & RBAC';
      case 'admin_database': return 'Database Tables';
      case 'admin_botdb': return 'Bot Embedded DB';
      case 'admin_recovery': return 'Data Recovery';
      case 'admin_proxies': return 'Proxy Pools';
      case 'admin_engine': return 'Engine Controls';
      case 'admin_worker': return 'Worker Supervisor';
      case 'admin_approvals': return 'Deposit Approvals';
      case 'admin_payments': return 'Payments & Checkout';
      case 'admin_webhook': return 'Payment Webhook';
      case 'admin_adsterra': return 'Adsterra Analytics';
      case 'admin_cms': return 'CMS Configuration';
      case 'admin_broadcast': return 'Broadcast Alerts';
      case 'admin_security': return 'Security Health';
      case 'admin_growth': return 'Growth & Data';
      case 'admin_audit': return 'Audit Logs';
      default: return 'Dashboard';
    }
  };

  const menuItem =
    'w-full min-h-11 text-left px-4 py-2.5 text-[13px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 active:bg-slate-200 dark:active:bg-slate-800 flex items-center gap-3 cursor-pointer transition-colors';

  return (
    <header className="lg-topbar min-h-16 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#0a0f1d]/90 backdrop-blur-xl sticky top-0 z-30 px-3 sm:px-6 flex items-center justify-between gap-2 transition-colors w-full max-w-full pt-[env(safe-area-inset-top,0px)] select-none">
      {/* Left: Mobile Menu, BrandLogo & Breadcrumbs */}
      <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
        {onToggleMobileMenu && (
          <button type="button" onClick={onToggleMobileMenu} aria-label="Open navigation menu" className={`lg:hidden ${iconBtn}`}>
            <Menu className="w-5 h-5" />
          </button>
        )}

        {/* Logo is now a real button: tap to go home */}
        <button
          type="button"
          onClick={() => go(homeView)}
          aria-label="Go to dashboard"
          className="lg:hidden shrink-0 rounded-xl active:scale-95 transition-transform cursor-pointer"
        >
          <BrandLogo size="sm" />
        </button>

        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 min-w-0">
          <span className="font-bold text-slate-900 dark:text-slate-200 font-mono tracking-tight hidden md:inline truncate">
            {isAdmin ? 'ADMIN COMMAND' : 'AD MARKETING'}
          </span>
          <span className="hidden md:inline text-slate-400 dark:text-slate-600">/</span>
          <span className="text-slate-800 dark:text-slate-200 font-semibold capitalize truncate max-w-[110px] xs:max-w-[150px] sm:max-w-none">
            {formatViewName(activeView)}
          </span>

          {isAdmin && (
            <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              {isSuperAdmin ? 'ROOT SUPER ADMIN' : 'ADMIN OFFICER'}
            </span>
          )}
        </div>
      </div>

      {/* Right Action Cluster */}
      <div className="flex items-center gap-0.5 sm:gap-2 shrink-0">
        {!isAdmin && (
          <div className="hidden xl:flex items-center gap-2.5 px-3 py-1 rounded-full bg-slate-100/80 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 text-[11px]">
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>CPM Boosters 99.4%</span>
            </div>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300 font-mono tabular-nums">
              <Activity className="w-3 h-3 text-teal-600 dark:text-teal-400" />
              <span>Engine Ready</span>
            </div>
          </div>
        )}

        {!isAdmin && (
          <button
            type="button"
            onClick={() => go('wallet')}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-950/60 dark:to-emerald-950/40 border border-teal-200/70 dark:border-teal-900/60 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:shadow-md hover:shadow-teal-500/10 transition-all cursor-pointer"
            title="Current Wallet Cash & Credits"
          >
            <span>৳{wallet.balance.toFixed(2)}</span>
            <span className="text-[10px] text-teal-600/80 dark:text-teal-400/80 font-normal">| {credits.balance} cr</span>
          </button>
        )}

        {/* Command palette trigger */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))}
          aria-label="Open quick navigation (Ctrl+K)"
          title="Quick navigation (Ctrl+K)"
          className="hidden md:flex items-center gap-2 pl-2.5 pr-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="text-[11px] font-medium">Search</span>
          <kbd className="text-[10px] font-mono px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">⌘K</kbd>
        </button>

{/* Theme Toggle */}
        <button type="button" onClick={onToggleTheme} aria-label="Toggle color theme" className={iconBtn} title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}>
          {theme === 'dark' ? <Sun className="w-[18px] h-[18px] text-amber-400" /> : <Moon className="w-[18px] h-[18px] text-slate-700" />}
        </button>

        {/* Adsterra live stats (today's real revenue + impressions) */}
        <AdsterraLiveStats />

        {/* Notification bell */}
        <button
          ref={bellRef}
          type="button"
          onClick={() => {
            setShowUserMenu(false);
            setShowNotifications((v) => !v);
          }}
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          aria-haspopup="dialog"
          aria-expanded={showNotifications}
          className={iconBtn}
        >
          {unread > 0 ? <BellRing className="w-[18px] h-[18px] text-teal-600 dark:text-teal-400 animate-wiggle" /> : <Bell className="w-[18px] h-[18px]" />}
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-[#0a0f1d]">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>

        {/* Profile avatar */}
        <button
          ref={avatarRef}
          type="button"
          onClick={() => {
            setShowNotifications(false);
            setShowUserMenu((v) => !v);
          }}
          aria-label="Open account menu"
          aria-haspopup="dialog"
          aria-expanded={showUserMenu}
          className="flex items-center gap-2 pl-1 pr-1 sm:pr-2 py-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0 ml-0.5"
        >
          <UserAvatar name={user.name} src={user.avatar} size="sm" tone={isAdmin ? 'amber' : 'teal'} online />
          <div className="hidden lg:flex flex-col text-left max-w-[130px]">
            <span className="flex items-center gap-1 text-xs font-semibold text-slate-900 dark:text-slate-200 leading-tight min-w-0">
              <span className="truncate">{user.name}</span>
              <MembershipBadge plan={user.membershipPlanId} expiresAt={user.membershipExpiresAt} size="xs" adminRole={isAdmin ? (isSuperAdmin ? 'super_admin' : 'admin') : undefined} />
            </span>
            <span className="text-[10px] font-mono text-slate-400 truncate">
              {isAdmin ? (isSuperAdmin ? 'Super Admin' : 'Admin Officer') : 'Publisher Pro'}
            </span>
          </div>
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 hidden sm:block shrink-0 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* ───── Notification center ───── */}
      <Popover open={showNotifications} onClose={() => setShowNotifications(false)} anchorRef={bellRef} label="Notifications" widthClass="w-[26rem]">
        <div className="px-4 pt-2 sm:pt-4 pb-3 flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              {isAdmin ? 'Operational Alerts' : 'Notifications'}
              {unread > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[10px] font-bold">{unread} new</span>
              )}
            </h3>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {unread > 0 && (
              <button type="button" onClick={markRead} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40 cursor-pointer">
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
            <button type="button" onClick={() => setShowNotifications(false)} aria-label="Close notifications" className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {notifications.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500/15 to-emerald-500/10 flex items-center justify-center mb-3">
                <Bell className="w-6 h-6 text-teal-600 dark:text-teal-400" />
              </div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">You're all caught up</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Deposits, support replies and announcements will show up here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {notifications.map((n) => {
                const t = TONE[n.tone];
                const isNew = notifTime(n.at) > lastSeen;
                const Tag: any = n.view ? 'button' : 'div';
                return (
                  <li key={n.id}>
                    <Tag
                      {...(n.view ? { type: 'button', onClick: () => go(n.view as string) } : {})}
                      className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors ${n.view ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 active:bg-slate-100 dark:active:bg-slate-800' : ''} ${isNew ? 'bg-teal-50/60 dark:bg-teal-950/20' : ''}`}
                    >
                      <span className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${t.cls}`}>
                        <t.Icon className="w-[18px] h-[18px]" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 leading-snug">{n.title}</span>
                          <span className="text-[10px] text-slate-400 shrink-0 mt-0.5">{timeAgo(n.at)}</span>
                        </span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed line-clamp-3">{n.desc}</span>
                      </span>
                      {isNew && <span className="mt-2 w-2 h-2 rounded-full bg-teal-500 shrink-0" />}
                    </Tag>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Popover>

      {/* ───── Account menu ───── */}
      <Popover open={showUserMenu} onClose={() => setShowUserMenu(false)} anchorRef={avatarRef} label="Account menu" widthClass="w-80">
        <div className="shrink-0 relative">
          <div className={`h-16 bg-gradient-to-r ${isAdmin ? 'from-amber-500 via-orange-500 to-rose-500' : 'from-teal-500 via-emerald-500 to-cyan-500'} animate-gradient`} />
          <button type="button" onClick={() => setShowUserMenu(false)} aria-label="Close menu" className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/20 hover:bg-black/30 text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
          <div className="px-4 pb-4 -mt-8">
            <button type="button" onClick={() => go('profile')} aria-label="Open profile" className="relative rounded-full cursor-pointer group">
              <UserAvatar name={user.name} src={user.avatar} size="lg" tone={isAdmin ? 'amber' : 'teal'} />
              <span className="absolute -bottom-0.5 -right-0.5 p-1.5 rounded-full bg-teal-600 text-white ring-2 ring-white dark:ring-[#0f172a] group-hover:scale-110 transition-transform">
                <Camera className="w-3 h-3" />
              </span>
            </button>
            <p className="mt-2 text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center justify-center gap-1 min-w-0">
              <span className="truncate">{user.name}</span>
              <MembershipBadge plan={user.membershipPlanId} expiresAt={user.membershipExpiresAt} size="sm" adminRole={isAdmin ? (isSuperAdmin ? 'super_admin' : 'admin') : undefined} />
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono flex items-center gap-1">
              <Lock className="w-3 h-3 shrink-0 text-emerald-500" /> {user.email}
            </p>
            <span className={`inline-block mt-2 px-2 py-0.5 text-[9px] font-bold rounded-full uppercase ${isAdmin ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'}`}>
              {isAdmin ? (isSuperAdmin ? 'Root Super Admin' : 'Delegated Admin') : 'Publisher Account'}
            </span>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {completeness < 100 && (
            <button type="button" onClick={() => go('profile')} className="mx-4 mb-3 w-[calc(100%-2rem)] text-left rounded-xl border border-teal-200/70 dark:border-teal-900/60 bg-teal-50/70 dark:bg-teal-950/30 p-3 cursor-pointer hover:shadow-md hover:shadow-teal-500/10 transition-shadow">
              <span className="flex items-center justify-between text-[11px] font-semibold text-teal-800 dark:text-teal-200">
                <span>{user.avatar ? 'Complete your profile' : 'Add a profile photo'}</span>
                <span>{completeness}%</span>
              </span>
              <span className="block mt-1.5 h-1.5 rounded-full bg-teal-200/70 dark:bg-teal-900/60 overflow-hidden">
                <span style={{ width: `${completeness}%` }} className="block h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-700" />
              </span>
            </button>
          )}

          {!isAdmin && (
            <div className="mx-4 mb-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => go('wallet')} className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 p-3 text-left cursor-pointer hover:border-teal-400/60 transition-colors">
                <CreditCard className="w-4 h-4 text-emerald-500" />
                <span className="block text-[10px] uppercase tracking-wider text-slate-400 mt-1.5">Wallet</span>
                <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">৳{wallet.balance.toFixed(2)}</span>
              </button>
              <button type="button" onClick={() => go('shop')} className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 p-3 text-left cursor-pointer hover:border-teal-400/60 transition-colors">
                <Coins className="w-4 h-4 text-amber-500" />
                <span className="block text-[10px] uppercase tracking-wider text-slate-400 mt-1.5">Credits</span>
                <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">{credits.balance.toLocaleString()}</span>
              </button>
            </div>
          )}

          <div className="border-t border-slate-100 dark:border-slate-800 py-1">
            <button type="button" onClick={() => go('profile')} className={menuItem}>
              <UserIcon className="w-4 h-4 text-teal-500" /> <span className="flex-1">My Profile & Photo</span> <ChevronRight className="w-4 h-4 text-slate-300" />
            </button>
            {!isAdmin ? (
              <>
                <button type="button" onClick={() => go('wallet')} className={menuItem}>
                  <CreditCard className="w-4 h-4 text-slate-400" /> <span className="flex-1">Wallet & Deposits</span> <ChevronRight className="w-4 h-4 text-slate-300" />
                </button>
                <button type="button" onClick={() => go('settings')} className={menuItem}>
                  <Settings className="w-4 h-4 text-slate-400" /> <span className="flex-1">Preferences</span> <ChevronRight className="w-4 h-4 text-slate-300" />
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => go('admin_security')} className={menuItem}>
                  <Shield className="w-4 h-4 text-amber-500" /> <span className="flex-1">Security & Health</span> <ChevronRight className="w-4 h-4 text-slate-300" />
                </button>
                <button type="button" onClick={() => go('admin_growth')} className={menuItem}>
                  <Trophy className="w-4 h-4 text-amber-500" /> <span className="flex-1">Growth &amp; Data</span> <ChevronRight className="w-4 h-4 text-slate-300" />
                </button>
                <button type="button" onClick={() => go('admin_audit')} className={menuItem}>
                  <FileText className="w-4 h-4 text-slate-400" /> <span className="flex-1">Security Audit Trail</span> <ChevronRight className="w-4 h-4 text-slate-300" />
                </button>
              </>
            )}
            <button type="button" onClick={() => { onToggleTheme(); }} className={menuItem}>
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-500" />}
              <span className="flex-1">{theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}</span>
            </button>
            {onReplaySplash && (
              <button type="button" onClick={() => { closeAll(); onReplaySplash(); }} className={menuItem}>
                <PlayCircle className="w-4 h-4 text-emerald-500" /> <span className="flex-1">Replay Intro Screen</span>
              </button>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-100 dark:border-slate-800 p-2">
          <button
            type="button"
            onClick={() => { closeAll(); onLogout?.(); }}
            className="w-full min-h-11 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-3 cursor-pointer transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </Popover>
    </header>
  );
};
