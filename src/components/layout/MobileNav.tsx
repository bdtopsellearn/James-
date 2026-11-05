import React from 'react';
import { useTheme } from '../../theme';
import {
  LayoutDashboard,
  Link as LinkIcon,
  Zap,
  Sliders,
  Radio,
  BarChart3,
  History,
  Wallet,
  ShoppingBag,
  Crown,
  Users,
  LifeBuoy,
  UserCheck,
  Settings,
  Shield,
  Server,
  Terminal,
  Cpu,
  Target,
  CheckSquare,
  FileSpreadsheet,
  Database,
  Send,
  FileText,
  X,
  LogOut,
  Sun,
  Moon,
  Lock,
  Archive,
  Trophy,
  CreditCard,
  Webhook,
  Info,
  PlayCircle,
  Menu
} from 'lucide-react';
import { User, Credits } from '../../types';
import { BrandLogo } from '../brand/BrandLogo';
import { BrandCredit } from '../brand/BrandCredit';
import { UserAvatar } from '../ui/UserAvatar';
import { MembershipBadge } from '../ui/MembershipBadge';

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: string;
  onSelectView: (view: string) => void;
  user: User;
  credits: Credits;
  isTrafficActive: boolean;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onLogout: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  isOpen,
  onClose,
  activeView,
  onSelectView,
  user,
  credits,
  isTrafficActive,
  theme: themeProp,
  onToggleTheme: onToggleThemeProp,
  onLogout
}) => {
  const [storeTheme, storeToggleTheme] = useTheme();
  const theme = themeProp ?? storeTheme;
  const onToggleTheme = onToggleThemeProp ?? storeToggleTheme;
  const isAdmin = user.role === 'admin';
  const isSuperAdmin = isAdmin && (user.adminRole === 'super_admin' || user.email === 'alif.yasin@pnnetwork.io');

  // Lock the page behind the drawer while it is open (reliable, always released).
  React.useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add('pn-scroll-lock');
    return () => document.body.classList.remove('pn-scroll-lock');
  }, [isOpen]);

  // User Panel Sections
  const userSections = [
    {
      title: 'Traffic & Placements',
      items: [
        { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'links', label: 'Normal Link', icon: LinkIcon, count: 3 },
        { id: 'smartlinks', label: 'SmartLinks (Adsterra)', icon: Zap, badge: 'SYNC' },
        { id: 'traffic', label: 'Traffic Control', icon: Sliders },
        { id: 'monitor', label: 'Smart Link', icon: Radio, isLive: isTrafficActive },
        { id: 'stats', label: 'Analytics', icon: BarChart3 },
        { id: 'history', label: 'History Logs', icon: History }
      ]
    },
    {
      title: 'Monetization & Billing',
      items: [
        { id: 'wallet', label: 'Wallet & Deposits', icon: Wallet },
        { id: 'shop', label: 'Credits Shop', icon: ShoppingBag, badge: 'BONUS' },
        { id: 'membership', label: 'Membership Plans', icon: Crown },
        { id: 'referrals', label: 'Referral Partner', icon: Users },
        { id: 'leaderboard', label: 'Daily Leaderboard', icon: Trophy, badge: 'HOT' }
      ]
    },
    {
      title: 'Support & Profile',
      items: [
        { id: 'howto', label: 'How to Work', icon: PlayCircle, badge: 'VIDEO' },
        { id: 'support', label: 'Support Desk', icon: LifeBuoy, count: 1 },
        { id: 'profile', label: 'Profile & Security', icon: UserCheck },
        { id: 'settings', label: 'Preferences', icon: Settings },
        { id: 'about', label: 'About', icon: Info }
      ]
    }
  ];

  // Admin Panel Sections
  const adminSections = [
    {
      title: 'Operations & Management',
      items: [
        { id: 'admin_overview', label: 'Operations Center', icon: Shield },
        { id: 'admin_users', label: 'User Directory', icon: Users },
        { id: 'admin_appeals', label: 'Ban Appeals', icon: Shield },
        { id: 'admin_approvals', label: 'Deposit Queue', icon: CheckSquare, count: 2 },
        { id: 'admin_payments', label: 'Payments', icon: CreditCard },
        { id: 'admin_webhook', label: 'Webhook', icon: Webhook }
      ]
    },
    ...(isSuperAdmin
      ? [
          {
            title: 'Root Governance',
            items: [
              { id: 'admin_admins', label: 'Admin Accounts', icon: Lock, badge: 'ROOT' },
              { id: 'admin_roles', label: 'Roles & RBAC', icon: Terminal }
            ]
          }
        ]
      : []),
    {
      title: 'Data & Infrastructure',
      items: [
        { id: 'admin_database', label: 'Database Tables', icon: FileSpreadsheet },
        { id: 'admin_botdb', label: 'Bot Embedded DB', icon: Database },
        { id: 'admin_recovery', label: 'Data Recovery', icon: Archive },
        { id: 'admin_proxies', label: 'CPM Booster Manager', icon: Server },
        { id: 'admin_engine', label: 'Traffic Engine', icon: Terminal },
        { id: 'admin_targeting', label: 'Targeting Engine', icon: Target },
        { id: 'admin_worker', label: 'Worker Fleet', icon: Cpu }
      ]
    },
    {
      title: 'CMS & Security Audits',
      items: [
        { id: 'admin_cms', label: 'CMS Configuration', icon: FileSpreadsheet },
        { id: 'admin_broadcast', label: 'Broadcast Alerts', icon: Send },
        { id: 'admin_support', label: 'Support Desk', icon: LifeBuoy },
        { id: 'admin_security', label: 'Security Health', icon: Shield },
        { id: 'admin_growth', label: 'Growth & Data', icon: Trophy },
        { id: 'admin_audit', label: 'Activity Logs', icon: FileText }
      ]
    }
  ];

  const sectionsToRender = isAdmin ? adminSections : userSections;

  // Bottom tab bar items (5 most-used screens)
  const bottomItems: { id: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = isAdmin
    ? [
        { id: 'admin_overview', label: 'Command', icon: Shield },
        { id: 'admin_users', label: 'Users', icon: Users },
        { id: 'admin_approvals', label: 'Approvals', icon: CheckSquare },
        { id: 'admin_proxies', label: 'CPM Boosters', icon: Server },
        { id: 'admin_engine', label: 'Engine', icon: Terminal }
      ]
    : [
        { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'links', label: 'Normal Link', icon: LinkIcon },
        { id: 'monitor', label: 'Smart Link', icon: Radio },
        { id: 'wallet', label: 'Wallet', icon: Wallet },
        { id: 'shop', label: 'Shop', icon: ShoppingBag }
      ];

  return (
    <>
      {/* Mobile Slide-Out Drawer Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex" role="dialog" aria-modal="true" aria-label="Navigation menu">
          {/* Backdrop */}
          <div
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-fade-in"
          />

          {/* Drawer Canvas */}
          <div className="relative w-80 max-w-[85vw] h-dvh bg-white dark:bg-[#0a0e1a] text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200 overflow-hidden pt-[env(safe-area-inset-top,0px)]">
            {/* Drawer Top Header */}
            <div className="h-16 shrink-0 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <BrandLogo size="md" showText={true} />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className="p-2.5 -mr-1 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User Quick Status */}
            <div className="shrink-0 p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 flex items-center gap-3">
              <UserAvatar name={user.name} src={user.avatar} size="md" tone={isAdmin ? 'amber' : 'teal'} />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1 min-w-0">
                  <span className="truncate">{user.name}</span>
                  <MembershipBadge plan={user.membershipPlanId} expiresAt={user.membershipExpiresAt} size="xs" adminRole={isAdmin ? (isSuperAdmin ? 'super_admin' : 'admin') : undefined} />
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate block">{user.email}</span>
              </div>
              <span
                className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${
                  isAdmin
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                    : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {isAdmin ? (isSuperAdmin ? 'Super Admin' : 'Admin') : 'Publisher'}
              </span>
            </div>

            {/* Navigation Items List — takes all remaining height and scrolls */}
            <div className="flex-1 min-h-0 p-3 space-y-4 overflow-y-auto overscroll-contain">
              {sectionsToRender.map((section, idx) => (
                <div key={idx} className="space-y-1">
                  <span className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    {section.title}
                  </span>
                  {section.items.map((item: any) => {
                    const Icon = item.icon;
                    const isActive = activeView === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          onSelectView(item.id);
                          onClose();
                        }}
                        className={`w-full min-h-11 flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
                          isActive
                            ? isAdmin
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold border border-amber-500/30'
                              : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-500/30'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <Icon
                          className={`w-4.5 h-4.5 shrink-0 ${
                            isActive
                              ? isAdmin
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        />
                        <span className="flex-1 text-left truncate">{item.label}</span>

                        {item.badge && (
                          <span
                            className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded ${
                              item.badge === 'ROOT'
                                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                                : 'bg-teal-500/20 text-teal-700 dark:text-teal-400'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}

                        {item.isLive && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <BrandCredit variant="compact" className="shrink-0 py-2 border-t border-slate-200/60 dark:border-slate-800/60" />

            {/* Bottom Actions — always visible */}
            <div className="shrink-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#070b14] flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={onToggleTheme}
                className="flex items-center gap-2 min-h-10 px-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-600 dark:text-amber-400" /> : <Moon className="w-4 h-4" />}
                <span>{theme === 'dark' ? 'Light Theme' : 'Dark Theme'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                className="flex items-center gap-1.5 min-h-10 px-1 text-rose-600 dark:text-rose-400 hover:text-rose-500 font-semibold cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Floating Bottom Bar for Mobile Phones — rounded "pill" dock */}
      <nav
        aria-label="Primary"
        className="lg-bottomnav lg:hidden fixed bottom-0 left-2.5 right-2.5 z-30 mb-[max(0.5rem,env(safe-area-inset-bottom,0px))] rounded-[22px] border border-slate-200/80 dark:border-white/10 shadow-[0_14px_34px_-14px_rgba(2,6,23,0.55)] select-none"
      >
        <div className="h-[58px] flex items-stretch justify-around px-1.5 gap-0.5">
          {bottomItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            const accent = isAdmin
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-emerald-600 dark:text-emerald-400';
            const activeBg = isAdmin ? 'bg-amber-500/15' : 'bg-emerald-500/15';
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex-1 min-w-0 my-1.5 flex flex-col items-center justify-center gap-1 rounded-2xl cursor-pointer transition-all ${
                  active ? `${accent} ${activeBg} font-bold` : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <span className="relative">
                  <Icon className={`w-5 h-5 transition-transform ${active ? 'scale-110' : ''}`} />
                  {item.id === 'monitor' && isTrafficActive && (
                    <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  )}
                </span>
                <span className="text-[10px] leading-none truncate max-w-full px-0.5">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
