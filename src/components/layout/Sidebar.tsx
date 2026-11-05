import React from 'react';
import { UserAvatar } from '../ui/UserAvatar';
import { MembershipBadge } from '../ui/MembershipBadge';
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
  ChevronLeft,
  ChevronRight,
  Flame,
  Lock,
  Archive,
  TrendingUp,
  Trophy,
  CreditCard,
  Webhook,
  Info,
  PlayCircle,
  LogOut
} from 'lucide-react';
import { User, Credits } from '../../types';
import { BrandLogo } from '../brand/BrandLogo';
import { BrandCredit } from '../brand/BrandCredit';

interface SidebarProps {
  activeView: string;
  onSelectView: (view: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  user: User;
  credits: Credits;
  isTrafficActive: boolean;
  onLogout?: () => void;
  /** Real counts per menu id. When given, they replace the old hard-coded demo numbers. */
  badgeCounts?: Record<string, number>;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onSelectView,
  isCollapsed,
  onToggleCollapse,
  user,
  credits,
  isTrafficActive,
  onLogout,
  badgeCounts,
}) => {
  const isAdmin = user.role === 'admin';
  const isSuperAdmin = isAdmin && (user.adminRole === 'super_admin' || user.email === 'alif.yasin@pnnetwork.io');

  // User Panel Navigation Sections
  const userSections = [
    {
      title: 'Traffic & Links',
      items: [
        { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'links', label: 'Normal Link', icon: LinkIcon, count: 3 },
        { id: 'smartlinks', label: 'SmartLinks (Adsterra)', icon: Zap, badge: 'SYNC' },
        { id: 'traffic', label: 'Traffic Control', icon: Sliders },
        {
          id: 'monitor',
          label: 'Smart Link',
          icon: Radio,
          isLive: isTrafficActive
        },
        { id: 'stats', label: 'Analytics', icon: BarChart3 },
        { id: 'history', label: 'History & Logs', icon: History }
      ]
    },
    {
      title: 'Monetization & Shop',
      items: [
        { id: 'wallet', label: 'Wallet', icon: Wallet },
        { id: 'shop', label: 'Impression Shop', icon: ShoppingBag, badge: 'BONUS' },
        { id: 'membership', label: 'Membership Plans', icon: Crown },
        { id: 'referrals', label: 'Referral Program', icon: Users },
        { id: 'leaderboard', label: 'Daily Leaderboard', icon: Trophy, badge: 'HOT' }
      ]
    },
    {
      title: 'Support & Settings',
      items: [
        { id: 'howto', label: 'How to Work', icon: PlayCircle, badge: 'VIDEO' },
        { id: 'support', label: 'Support Tickets', icon: LifeBuoy, count: 1 },
        { id: 'profile', label: 'Profile & Security', icon: UserCheck },
        { id: 'settings', label: 'Preferences', icon: Settings },
        { id: 'about', label: 'About', icon: Info }
      ]
    }
  ];

  // Admin Panel Navigation Sections
  const adminSections = [
    {
      title: 'Command & Operations',
      items: [
        { id: 'admin_overview', label: 'Operations Center', icon: Shield },
        { id: 'admin_users', label: 'User Directory', icon: Users },
        { id: 'admin_appeals', label: 'Ban Appeals', icon: Shield },
        { id: 'admin_approvals', label: 'Deposit Queue', icon: CheckSquare, count: 2 },
        { id: 'admin_payments', label: 'Payments', icon: CreditCard },
        { id: 'admin_webhook', label: 'Webhook', icon: Webhook },
        { id: 'admin_adsterra', label: 'Adsterra Analytics', icon: TrendingUp }
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
        { id: 'admin_worker', label: 'Worker Supervisor', icon: Cpu }
      ]
    },
    {
      title: 'Configuration & Audits',
      items: [
        { id: 'admin_cms', label: 'CMS & Pricing', icon: FileSpreadsheet },
        { id: 'admin_broadcast', label: 'Broadcast Alerts', icon: Send },
        { id: 'admin_support', label: 'Support Desk', icon: LifeBuoy },
        { id: 'admin_security', label: 'Security & Health', icon: Shield },
        { id: 'admin_growth', label: 'Growth & Data', icon: Trophy },
        { id: 'admin_audit', label: 'Activity Logs', icon: FileText }
      ]
    }
  ];

  const sectionsToRender = isAdmin ? adminSections : userSections;

  return (
    <aside
      className={`bg-white dark:bg-[#0a0f1d] border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between transition-all duration-200 z-40 select-none ${
        isCollapsed ? 'w-18' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div>
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800">
          <BrandLogo size="md" showText={!isCollapsed} />

          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden lg:flex p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Live Running Indicator Banner (User only) */}
        {!isAdmin && isTrafficActive && !isCollapsed && (
          <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200/60 dark:border-teal-900/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
              </span>
              <span className="text-[11px] font-semibold text-teal-800 dark:text-teal-300">
                Engine Dispatched
              </span>
            </div>
            <span className="font-mono text-[10px] text-teal-600 dark:text-teal-400 font-bold">
              45/hr
            </span>
          </div>
        )}

        {/* Admin Gateway Status Pill */}
        {isAdmin && !isCollapsed && (
          <div className="mx-3 mt-3 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                {isSuperAdmin ? 'SUPER ADMIN ACCESS' : 'OPERATIONS OFFICER'}
              </span>
            </div>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          </div>
        )}

        {/* Main Navigation Item List */}
        <div className="p-3 space-y-5 overflow-y-auto max-h-[calc(100vh-14rem)]">
          {sectionsToRender.map((section, idx) => (
            <div key={idx} className="space-y-1">
              {!isCollapsed && (
                <span className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  {section.title}
                </span>
              )}
              {section.items.map((item: any) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectView(item.id)}
                    title={isCollapsed ? item.label : undefined}
                    className={`group w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer ${
                      isActive ? 'lg-nav-active relative ' : ''
                    }${
                      isActive
                        ? isAdmin
                          ? 'bg-amber-500/15 text-amber-500 font-semibold border border-amber-500/30'
                          : 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-semibold border border-teal-200/70 dark:border-teal-900/60 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:translate-x-0.5'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive
                          ? isAdmin
                            ? 'text-amber-500'
                            : 'text-teal-600 dark:text-teal-400'
                          : 'text-slate-400'
                      }`}
                    />
                    {!isCollapsed && (
                      <span className="flex-1 text-left truncate">{item.label}</span>
                    )}

                    {(() => {
                      const shown = badgeCounts ? (badgeCounts[item.id] || 0) : (item.count || 0);
                      return !isCollapsed && shown > 0 ? (
                        <span className="px-1.5 py-0.2 text-[10px] font-mono rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                          {shown}
                        </span>
                      ) : null;
                    })()}

                    {!isCollapsed && item.badge && (
                      <span
                        className={`px-1.5 py-0.2 text-[9px] font-mono font-bold rounded ${
                          item.badge === 'ROOT'
                            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                            : 'bg-teal-500/20 text-teal-600 dark:text-teal-400'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}

                    {!isCollapsed && item.isLive && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Sidebar Footer Card */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#070b14]/50">
        <button
          type="button"
          onClick={() => onSelectView('profile')}
          title="Open your profile"
          className={`w-full mb-2 flex items-center gap-3 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-teal-400/60 hover:shadow-md hover:shadow-teal-500/10 transition-all cursor-pointer ${isCollapsed ? 'justify-center' : 'text-left'}`}
        >
          <UserAvatar name={user.name} src={user.avatar} size="sm" tone={isAdmin ? 'amber' : 'teal'} online />
          {!isCollapsed && (
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-xs font-bold text-slate-900 dark:text-slate-100 min-w-0">
                <span className="truncate">{user.name}</span>
                <MembershipBadge plan={user.membershipPlanId} expiresAt={user.membershipExpiresAt} size="xs" adminRole={isAdmin ? (isSuperAdmin ? 'super_admin' : 'admin') : undefined} />
              </span>
              <span className="block text-[10px] text-slate-500 dark:text-slate-400 truncate font-mono">
                {isAdmin ? (isSuperAdmin ? 'Super Admin' : 'Admin Officer') : 'View profile'}
              </span>
            </span>
          )}
        </button>
        {!isCollapsed && <BrandCredit variant="compact" className="mb-2" />}
        {!isCollapsed && !isAdmin && (
          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs mb-2">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span>Remaining Credits:</span>
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {credits.balance.toLocaleString()}
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-teal-600 h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, (credits.balance / 2000) * 100)}%`
                }}
              />
            </div>
          </div>
        )}

        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 cursor-pointer transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            {!isCollapsed && <span>Sign Out</span>}
          </button>
        )}
      </div>
    </aside>
  );
};
