import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { AppStorage, subscribeToStorage } from './services/storage';
import { buildNotifications } from './lib/notifications';
import {
  apiLogin,
  apiAdminLogin,
  apiLogout,
  apiFetchState,
  apiFetchBroadcasts,
  apiFetchUserNotifications,
  apiSetupStatus,
  apiSetupInitialize,
  apiAdminSaveCms,
  apiAdminSaveHowToVideos,
  onAuthExpired,
  apiGetMaintenance,
  onMaintenance,
  onBanned,
  setServerToken,
  getToken,
} from './services/api';
import type { ProfileExtraInput } from './services/api';
import { DialogHost } from './lib/dialog';
import { BrandCredit } from './components/brand/BrandCredit';
import {
  User,
  Wallet,
  Credits,
  NormalLink,
  SmartLink,
  ProxyItem,
  LiveImpression,
  TrafficTarget,
  TrafficMode,
  Transaction,
  BalanceRequest,
  PaymentMethodItem,
  ShopPackageItem,
  MembershipPlanItem,
  PromoCodeItem,
  SupportTicket,
  UserSession,
  AuditLog,
  EngineSettings,
  AdminAccount,
  MaintenanceSettings,
  HowToVideo,
} from './types';

// Layout & Brand
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { MobileNav } from './components/layout/MobileNav';
import { SplashScreen } from './components/brand/SplashScreen';
import { BrandLoader } from './components/brand/BrandLoader';
import { MaintenanceScreen } from './components/brand/MaintenanceScreen';
import { ServerNotReadyScreen } from './components/brand/ServerNotReadyScreen';
import { BannedScreen } from './components/auth/BannedScreen';
import { ToastProvider, useToast } from './components/ui/Toast';
import { CommandPalette, type CommandItem } from './components/ui/CommandPalette';
import { isPaymentPath } from './views/payment/paymentRoutes';
import {
  AUTH_VIEWS,
  DEFAULT_VIEW,
  pathToView,
  viewToPath,
  pushView,
  replaceView,
  replacePath,
  isAdminPath,
} from './lib/router';

// Auth Views
const UserLoginView = lazy(() => import('./views/auth/UserLoginView').then((m) => ({ default: m.UserLoginView })));
const AdminLoginView = lazy(() => import('./views/auth/AdminLoginView').then((m) => ({ default: m.AdminLoginView })));

// User Views
const DashboardOverview = lazy(() => import('./views/DashboardOverview').then((m) => ({ default: m.DashboardOverview })));
const NormalLinksView = lazy(() => import('./views/NormalLinksView').then((m) => ({ default: m.NormalLinksView })));
const SmartLinksView = lazy(() => import('./views/SmartLinksView').then((m) => ({ default: m.SmartLinksView })));
const TrafficControlView = lazy(() => import('./views/TrafficControlView').then((m) => ({ default: m.TrafficControlView })));
const LiveMonitorView = lazy(() => import('./views/LiveMonitorView').then((m) => ({ default: m.LiveMonitorView })));
const AnalyticsView = lazy(() => import('./views/AnalyticsView').then((m) => ({ default: m.AnalyticsView })));
const HistoryView = lazy(() => import('./views/HistoryView').then((m) => ({ default: m.HistoryView })));
const WalletView = lazy(() => import('./views/WalletView').then((m) => ({ default: m.WalletView })));
const ShopView = lazy(() => import('./views/ShopView').then((m) => ({ default: m.ShopView })));
const MembershipView = lazy(() => import('./views/MembershipView').then((m) => ({ default: m.MembershipView })));
const ReferralView = lazy(() => import('./views/ReferralView').then((m) => ({ default: m.ReferralView })));
const LeaderboardView = lazy(() => import('./views/LeaderboardView').then((m) => ({ default: m.LeaderboardView })));
const PublicProfileView = lazy(() => import('./views/PublicProfileView').then((m) => ({ default: m.PublicProfileView })));
const SupportView = lazy(() => import('./views/SupportView').then((m) => ({ default: m.SupportView })));
const ProfileView = lazy(() => import('./views/ProfileView').then((m) => ({ default: m.ProfileView })));
const SettingsView = lazy(() => import('./views/SettingsView').then((m) => ({ default: m.SettingsView })));
const AboutView = lazy(() => import('./views/AboutView').then((m) => ({ default: m.AboutView })));
const HowToWorkView = lazy(() => import('./views/HowToWorkView').then((m) => ({ default: m.HowToWorkView })));

// Admin Views
const AdminOverviewView = lazy(() => import('./views/admin/AdminOverviewView').then((m) => ({ default: m.AdminOverviewView })));
const AdminAppealsView = lazy(() => import('./views/admin/AdminAppealsView').then((m) => ({ default: m.AdminAppealsView })));
const AdminUsersView = lazy(() => import('./views/admin/AdminUsersView').then((m) => ({ default: m.AdminUsersView })));
const AdminProxiesView = lazy(() => import('./views/admin/AdminProxiesView').then((m) => ({ default: m.AdminProxiesView })));
const AdminEngineView = lazy(() => import('./views/admin/AdminEngineView').then((m) => ({ default: m.AdminEngineView })));
const AdminWorkerControlView = lazy(() => import('./views/admin/AdminWorkerControlView').then((m) => ({ default: m.AdminWorkerControlView })));
const AdminTargetingView = lazy(() => import('./views/admin/AdminTargetingView').then((m) => ({ default: m.AdminTargetingView })));
const AdminApprovalsView = lazy(() => import('./views/admin/AdminApprovalsView').then((m) => ({ default: m.AdminApprovalsView })));
const AdminCmsView = lazy(() => import('./views/admin/AdminCmsView').then((m) => ({ default: m.AdminCmsView })));
const AdminAdsterraView = lazy(() => import('./views/admin/AdminAdsterraView').then((m) => ({ default: m.AdminAdsterraView })));
const AdminBroadcastView = lazy(() => import('./views/admin/AdminBroadcastView').then((m) => ({ default: m.AdminBroadcastView })));
const AdminSupportView = lazy(() => import('./views/admin/AdminSupportView').then((m) => ({ default: m.AdminSupportView })));
const AdminAuditView = lazy(() => import('./views/admin/AdminAuditView').then((m) => ({ default: m.AdminAuditView })));
const AdminGrowthView = lazy(() => import('./views/admin/AdminGrowthView').then((m) => ({ default: m.AdminGrowthView })));
const AdminAdminsView = lazy(() => import('./views/admin/AdminAdminsView').then((m) => ({ default: m.AdminAdminsView })));
const AdminRolesView = lazy(() => import('./views/admin/AdminRolesView').then((m) => ({ default: m.AdminRolesView })));
const AdminSecurityView = lazy(() => import('./views/admin/AdminSecurityView').then((m) => ({ default: m.AdminSecurityView })));
const AdminDatabaseView = lazy(() => import('./views/admin/AdminDatabaseView').then((m) => ({ default: m.AdminDatabaseView })));
const AdminDataRecoveryView = lazy(() => import('./views/admin/AdminDataRecoveryView').then((m) => ({ default: m.AdminDataRecoveryView })));
const AdminBotDbView = lazy(() => import('./views/admin/AdminBotDbView').then((m) => ({ default: m.AdminBotDbView })));
const AdminPaymentsView = lazy(() => import('./views/admin/AdminPaymentsView').then((m) => ({ default: m.AdminPaymentsView })));
const AdminWebhookView = lazy(() => import('./views/admin/AdminWebhookView').then((m) => ({ default: m.AdminWebhookView })));

// Standalone payment surfaces (full-screen, outside the dashboard shell)
const PaymentRouter = lazy(() => import('./views/payment/PaymentRouter').then((m) => ({ default: m.PaymentRouter })));

import { Shield, AlertCircle, ServerCrash } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════
//  SETUP MODE VIEW  (Firebase not configured yet)
// ═══════════════════════════════════════════════════════════════════════
const SetupModeView: React.FC<{ onRetry: () => void }> = ({ onRetry }) => {
  const [file, setFile] = useState<File | null>(null);
  const [adminName, setAdminName] = useState('Root Admin');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [bkashNumber, setBkashNumber] = useState('');
  const [nagadNumber, setNagadNumber] = useState('');
  const [rocketNumber, setRocketNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const install = async () => {
    setError('');
    if (!file) return setError('Select the Firebase service-account JSON file.');
    if (!adminEmail.trim()) return setError('Enter the Root Super Admin email.');
    if (adminPassword.length < 8) return setError('Admin password must be at least 8 characters.');
    setBusy(true);
    try {
      const text = await file.text();
      const serviceAccount = JSON.parse(text);
      await apiSetupInitialize({
        serviceAccount, adminName, adminEmail, adminPassword,
        paymentMethods: [
          { id: 'bkash', key: 'bkash', name: 'bKash (Send Money)', number: bkashNumber, type: 'mobile_banking', accountType: 'Personal', instructions: 'Send Money and submit the TXN ID.', enabled: true, order: 1 },
          { id: 'nagad', key: 'nagad', name: 'Nagad (Send Money)', number: nagadNumber, type: 'mobile_banking', accountType: 'Personal', instructions: 'Send Money and submit the TXN ID.', enabled: true, order: 2 },
          { id: 'rocket', key: 'rocket', name: 'Rocket (Send Money)', number: rocketNumber, type: 'mobile_banking', accountType: 'Personal', instructions: 'Send Money and submit the TXN ID.', enabled: true, order: 3 },
          { id: 'binance', key: 'binance', name: 'Binance Pay ID', number: 'Not set', type: 'crypto_id', instructions: 'Send payment and submit the order/TXN ID.', enabled: true, order: 4 },
          { id: 'usdt_trc20', key: 'usdt_trc20', name: 'USDT (TRC20)', number: 'Not set', type: 'crypto_wallet', instructions: 'Send exact USDT TRC20 and submit the blockchain TXID.', enabled: true, order: 5 }
        ]
      });
      setDone(true);
      setTimeout(() => window.location.reload(), 700);
    } catch (e: any) {
      setError(e?.message || 'Setup failed. Check the Firebase JSON and try again.');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-950 text-slate-100 p-5">
      <div className="w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-8 shadow-2xl">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 text-xl">⚙️</div>
          <div><h1 className="text-xl font-extrabold">X AD MARKETING — First Setup</h1><p className="text-xs text-slate-400 mt-1">Configure Firebase and create the single Root Super Admin.</p></div>
        </div>
        {error && <div className="mb-4 p-3 rounded-xl bg-rose-950/40 border border-rose-900/60 text-rose-200 text-xs">{error}</div>}
        {done && <div className="mb-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-900/60 text-emerald-200 text-xs">Setup completed. Opening the Admin area…</div>}
        <div className="space-y-4">
          <div><label className="text-xs text-slate-400">Firebase service-account JSON</label><input type="file" accept=".json,application/json" onChange={e => setFile(e.target.files?.[0] || null)} className="mt-1 w-full text-xs p-3 rounded-xl bg-slate-950 border border-slate-800" /></div>
          <div><label className="text-xs text-slate-400">Root Super Admin name</label><input value={adminName} onChange={e=>setAdminName(e.target.value)} className="mt-1 w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm" /></div>
          <div><label className="text-xs text-slate-400">Root Super Admin email</label><input type="email" value={adminEmail} onChange={e=>setAdminEmail(e.target.value)} className="mt-1 w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm" /></div>
          <div><label className="text-xs text-slate-400">Root Super Admin password</label><input type="password" value={adminPassword} onChange={e=>setAdminPassword(e.target.value)} className="mt-1 w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm" /></div>
          <div className="pt-2 border-t border-slate-800"><p className="text-xs font-semibold text-slate-200 mb-2">Manual payment setup (optional)</p><div className="grid grid-cols-1 md:grid-cols-3 gap-3"><input value={bkashNumber} onChange={e=>setBkashNumber(e.target.value)} placeholder="bKash number" className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm" /><input value={nagadNumber} onChange={e=>setNagadNumber(e.target.value)} placeholder="Nagad number" className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm" /><input value={rocketNumber} onChange={e=>setRocketNumber(e.target.value)} placeholder="Rocket number" className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm" /></div><p className="text-[10px] text-slate-500 mt-2">You can change all payment details later from Admin → CMS / Payment Numbers.</p></div>
          <button type="button" disabled={busy || done} onClick={install} className="w-full py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 font-bold text-sm disabled:opacity-50">{busy ? 'Installing…' : 'Install & Create Root Admin'}</button>
          <button type="button" onClick={onRetry} className="w-full py-2.5 rounded-xl border border-slate-700 text-slate-300 text-sm">Retry Existing Setup</button>
        </div>
        <p className="mt-5 text-[11px] text-slate-500">The service-account file is stored server-side with restricted permissions. Setup is locked after the first Root Super Admin is created.</p>
      </div>
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════
//  VIEW ERROR BOUNDARY — a crash inside one screen must never freeze the whole app
// ═══════════════════════════════════════════════════════════════════════
class ViewErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('[View crashed]', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-6 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-center space-y-3">
        <AlertCircle className="w-8 h-8 mx-auto text-rose-500" />
        <h2 className="text-base font-bold text-rose-700 dark:text-rose-200">This screen hit an error</h2>
        <p className="text-xs text-rose-600/80 dark:text-rose-300/80 break-words">{this.state.error.message}</p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold cursor-pointer"
        >
          Try again
        </button>
      </div>
    );
  }
}

// Lightweight skeleton shown while a lazy-loaded view chunk is being fetched.
const ViewLoadingFallback: React.FC = () => (
  <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading view">
    <div className="h-24 rounded-xl bg-slate-100 dark:bg-slate-800/60" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="h-28 rounded-xl bg-slate-100 dark:bg-slate-800/60" />
      <div className="h-28 rounded-xl bg-slate-100 dark:bg-slate-800/60" />
      <div className="h-28 rounded-xl bg-slate-100 dark:bg-slate-800/60" />
    </div>
    <div className="h-64 rounded-xl bg-slate-100 dark:bg-slate-800/60" />
  </div>
);

// ═══════════════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════════════
function AppContent() {
  const { showToast } = useToast();

  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [setupRequired, setSetupRequired] = useState<boolean>(false);
  const [setupInstaller, setSetupInstaller] = useState<boolean>(() => window.location.pathname.replace(/\/+$/, '') === '/setup');
  const [booting, setBooting] = useState<boolean>(true);

  // Theme now lives in a tiny external store (src/theme.ts) so toggling it does
  // NOT re-render the whole app tree — this is what removed the day↔dark lag.
  // The DOM class is applied before first paint via the inline script in index.html.

  // Auth routing
  const [authStatus, setAuthStatus] = useState<'authenticated' | 'user_login' | 'admin_login'>(() => {
    const host = window.location.hostname.toLowerCase();
    const configuredAdminHost = String(import.meta.env?.VITE_ADMIN_DOMAIN || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const adminHost = configuredAdminHost && (host === configuredAdminHost || host.endsWith('.' + configuredAdminHost));
    const p = window.location.pathname;
    // Admin is selected by the dedicated hostname only. The public domain never
    // exposes the admin login/panel, even if /admin is appended to the URL.
    if (adminHost) return 'admin_login';
    if (isAdminPath(p) && !getToken()) return 'admin_login';
    return 'user_login';
  });

  // Active view
  const [activeView, setActiveView] = useState<string>(() => {
    const view = pathToView(window.location.pathname);
    if (view && !AUTH_VIEWS.has(view)) return view;
    return DEFAULT_VIEW;
  });

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [impersonatingUser, setImpersonatingUser] = useState<User | null>(null);

  const [setupError, setSetupError] = useState<string>('');
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState('');
  const [maintenanceEta, setMaintenanceEta] = useState('');
  const [bannedInfo, setBannedInfo] = useState<{ reason: string } | null>(null);

  // ─── Reactive states (read from AppStorage cache) ───
  const [user, setUser] = useState<User>(AppStorage.getUser());
  const [allUsers, setAllUsers] = useState<User[]>(AppStorage.getAllUsers());
  const [wallet, setWallet] = useState<Wallet>(AppStorage.getWallet());
  const [credits, setCredits] = useState<Credits>(AppStorage.getCredits());
  const [normalLinks, setNormalLinks] = useState<NormalLink[]>(AppStorage.getNormalLinks());
  const [smartlinks, setSmartLinks] = useState<SmartLink[]>(AppStorage.getSmartLinks());
  const [proxies, setProxies] = useState<ProxyItem[]>(AppStorage.getProxies());
  const [impressions, setImpressions] = useState<LiveImpression[]>(AppStorage.getImpressions());
  const [target, setTarget] = useState<TrafficTarget>(AppStorage.getTarget());
  const [transactions, setTransactions] = useState<Transaction[]>(AppStorage.getTransactions());
  const [balanceRequests, setBalanceRequests] = useState<BalanceRequest[]>(AppStorage.getBalanceRequests());
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>(AppStorage.getPaymentMethods());
  const [shopPackages, setShopPackages] = useState<ShopPackageItem[]>(AppStorage.getShopPackages());
  const [membershipPlans, setMembershipPlans] = useState<MembershipPlanItem[]>(AppStorage.getMembershipPlans());
  const [promoCodes, setPromoCodes] = useState<PromoCodeItem[]>(AppStorage.getPromoCodes());
  const [howtoVideos, setHowtoVideos] = useState<HowToVideo[]>(AppStorage.getHowToVideos());
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>(AppStorage.getSupportTickets());
  const [sessions, setSessions] = useState<UserSession[]>(AppStorage.getSessions());
  const [engineSettings, setEngineSettings] = useState<EngineSettings>(AppStorage.getEngineSettings());
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(AppStorage.getAuditLogs());
  const [admins, setAdmins] = useState<AdminAccount[]>(AppStorage.getAdmins());

  // Sync all state from cache whenever storage notifies
  const syncAllState = useCallback(() => {
    setUser(AppStorage.getUser());
    setAllUsers(AppStorage.getAllUsers());
    setWallet(AppStorage.getWallet());
    setCredits(AppStorage.getCredits());
    setNormalLinks(AppStorage.getNormalLinks());
    setSmartLinks(AppStorage.getSmartLinks());
    setProxies(AppStorage.getProxies());
    setImpressions(AppStorage.getImpressions());
    setTarget(AppStorage.getTarget());
    setTransactions(AppStorage.getTransactions());
    setBalanceRequests(AppStorage.getBalanceRequests());
    setPaymentMethods(AppStorage.getPaymentMethods());
    setShopPackages(AppStorage.getShopPackages());
    setMembershipPlans(AppStorage.getMembershipPlans());
    setPromoCodes(AppStorage.getPromoCodes());
    setHowtoVideos(AppStorage.getHowToVideos());
    setSupportTickets(AppStorage.getSupportTickets());
    setSessions(AppStorage.getSessions());
    setEngineSettings(AppStorage.getEngineSettings());
    setAuditLogs(AppStorage.getAuditLogs());
    setAdmins(AppStorage.getAdmins());
  }, []);

  useEffect(() => {
    const unsub = subscribeToStorage(syncAllState);
    return unsub;
  }, [syncAllState]);

  // ═══════════════════════════════════════════════════════════════════════
  //  BOOT — check setup status, restore session, hydrate state
  // ═══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      // 1) Health check — is Firebase configured?
      try {
        const status = await apiSetupStatus();
        if (cancelled) return;
        if (!status.ready) {
          setSetupError(
            status.error ||
              'Firebase is not configured on the server yet. Upload the service-account JSON to finish setup.',
          );
          setSetupRequired(true);
          setBooting(false);
          return;
        }
        setSetupError('');
      } catch (e) {
        if (cancelled) return;
        // api-server not reachable
        console.error('[App] Setup status failed:', e);
        setSetupError(
          `Could not reach the API server (${window.location.origin}/api/setup/status). ` +
            `Make sure the API process is running and reachable from the browser.`,
        );
        setSetupRequired(true);
        setBooting(false);
        return;
      }

      // 2) Restore session if we have a token
      const token = getToken();
      if (token) {
        try {
          await AppStorage.refreshFromServer();
          if (cancelled) return;
          const u = AppStorage.getUser();
          if (u && u.id) {
            setAuthStatus('authenticated');
            // Admin reopening /admin → land on the admin overview
            if (u.role === 'admin' && window.location.pathname.replace(/\/+$/, '') === '/admin') {
              setActiveView('admin_overview');
            }
            syncAllState();
          } else {
            setServerToken(null);
            setAuthStatus('user_login');
          }
        } catch (e) {
          console.warn('[App] Session restore failed');
          // Only an explicit 401 means the session is invalid (api.ts already cleared the token).
          // A network blip / 5xx must not sign the user or admin out.
          const status = (e as { status?: number } | null)?.status;
          if (status === 401 || status === 403) {
            setServerToken(null);
            setAuthStatus(isAdminSurface() ? 'admin_login' : 'user_login');
          } else {
            // Keep the token so a reload recovers the session; just show the sign-in screen meanwhile.
            setAuthStatus(isAdminSurface() ? 'admin_login' : 'user_login');
          }
        }
      }

      if (!cancelled) setBooting(false);
    }

    void boot();
    return () => { cancelled = true; };
  }, [syncAllState]);

  // While the server is not ready, keep checking and reload by itself as soon as it is back.
  const checkSetupReady = useCallback(async () => {
    try {
      const status = await apiSetupStatus();
      if (status.ready) window.location.reload();
    } catch { /* still down */ }
  }, []);

  useEffect(() => {
    if (!setupRequired) return;
    const t = setInterval(() => { void checkSetupReady(); }, 8000);
    return () => clearInterval(t);
  }, [setupRequired, checkSetupReady]);

  // A signed-in member was banned while using the site → every API call answers 403 BANNED.
  useEffect(() => onBanned((info) => setBannedInfo({ reason: info.reason })), []);

  // ═══════════════════════════════════════════════════════════════════════
  //  AUTH-EXPIRED LISTENER — force logout on 401
  // ═══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const unsub = onAuthExpired(() => {
      const wasAdmin = isAdminSurface();
      setAuthStatus(wasAdmin ? 'admin_login' : 'user_login');
      replaceView(wasAdmin ? 'admin-login' : 'login');
      showToast('Session Expired', 'Please sign in again.', 'error');
    });
    return unsub;
  }, [showToast]);

  // ═══════════════════════════════════════════════════════════════════════
  //  PERIODIC REFRESH  — pull fresh state from server (live impressions)
  // ═══════════════════════════════════════════════════════════════════════
  const refreshInFlight = useRef(false);
  useEffect(() => {
    if (authStatus !== 'authenticated') return;

    const run = async () => {
      if (refreshInFlight.current) return;
      if (!getToken()) return;
      refreshInFlight.current = true;
      try {
        await AppStorage.refreshFromServer();
      } catch (e) {
        // silent — 401 handled by onAuthExpired
      } finally {
        refreshInFlight.current = false;
      }
    };

    const interval = setInterval(run, 30000); // every 30s (server caches; keeps Firestore quota low)
    return () => clearInterval(interval);
  }, [authStatus]);

  // ═══════════════════════════════════════════════════════════════════════
  //  MAINTENANCE MODE — server-driven. Non-admins see the maintenance page;
  //  it appears/disappears live (poll + any 503 MAINTENANCE API answer).
  // ═══════════════════════════════════════════════════════════════════════
  const applyMaintenance = useCallback((m: { enabled: boolean; message?: string; eta?: string } | null) => {
    if (!m) return; // server unreachable → keep the current state
    setIsMaintenance(!!m.enabled);
    setMaintenanceMsg(m.message || '');
    setMaintenanceEta(m.eta || '');
  }, []);

  const checkMaintenance = useCallback(async () => {
    applyMaintenance(await apiGetMaintenance());
  }, [applyMaintenance]);

  useEffect(() => {
    void checkMaintenance();
    const t = setInterval(() => { void checkMaintenance(); }, 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') void checkMaintenance(); };
    document.addEventListener('visibilitychange', onVisible);
    const unsub = onMaintenance((info) => applyMaintenance(info));
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); unsub(); };
  }, [checkMaintenance, applyMaintenance]);

  // ═══════════════════════════════════════════════════════════════════════
  //  THEME
  // ═══════════════════════════════════════════════════════════════════════
  // Theme is managed by src/theme.ts (external store) — see the import below.

  // ═══════════════════════════════════════════════════════════════════════
  //  CLEAN PATH ROUTING  (History API — no more `#` in the URL)
  // ═══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const handleLocationChange = () => {
      const p = window.location.pathname;
      const view = pathToView(p);
      const onAdminPath = isAdminPath(p);
      // Only show the admin login when NOT signed in — an authenticated admin
      // browsing /admin/* keeps the panel.
      if (view === 'admin-login' || (onAdminPath && !getToken())) {
        setAuthStatus('admin_login');
        return;
      }
      if (view && AUTH_VIEWS.has(view)) {
        setAuthStatus('user_login');
        return;
      }
      if (view) {
        if (getToken()) {
          setActiveView(view);
          setAuthStatus('authenticated');
        } else {
          setAuthStatus('user_login');
        }
      }
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  const navigateTo = useCallback((view: string) => {
    setActiveView(view);
    pushView(view);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════
  //  AUTH HANDLERS
  // ═══════════════════════════════════════════════════════════════════════
  const handleUserLoginSuccess = useCallback(async (authenticatedUser: User) => {
    try { AppStorage.saveUser(authenticatedUser); } catch {}
    setUser(AppStorage.getUser());
    syncAllState();
    setAuthStatus('authenticated');
    if (authenticatedUser.role === 'admin') {
      replacePath('/admin');
      setActiveView('admin_overview');
    } else {
      navigateTo('overview');
    }
    showToast('Signed In Successfully', `Welcome back, ${authenticatedUser.name}!`, 'success');
    AppStorage.refreshFromServer().then(() => syncAllState()).catch(() => {});
  }, [navigateTo, showToast, syncAllState]);

  const handleAdminLoginSuccess = useCallback(async (adminUser: User) => {
    try { AppStorage.saveUser(adminUser); } catch {}
    setUser(AppStorage.getUser());
    // Same as above: enter the panel at once, hydrate the full snapshot in the
    // background. This removes the "stuck after login until reload" 4-5s wait.
    syncAllState();
    setAuthStatus('authenticated');
    replacePath('/admin');
    navigateTo('admin_overview');
    showToast('Admin Clearance Granted', 'Welcome to Master Operations Center.', 'success');
    AppStorage.refreshFromServer().then(() => syncAllState()).catch(() => {});
  }, [navigateTo, showToast, syncAllState]);

  const handleLogout = useCallback(async () => {
    const wasAdmin = isAdminSurface();
    await apiLogout();
    AppStorage.clearCurrentSession();
    setImpersonatingUser(null);
    if (wasAdmin) {
      setAuthStatus('admin_login');
      replaceView('admin-login');
    } else {
      setAuthStatus('user_login');
      replaceView('login');
    }
    showToast('Session Ended', 'You have been safely signed out.', 'info');
  }, [showToast]);

  const activeUser = impersonatingUser || user;

  // ─── Notification center data (real: announcements, deposits, tickets…) ───
  const [broadcasts, setBroadcasts] = useState<{ id: string; title: string; message: string; sentAt: string }[]>([]);
  const [userNotifications, setUserNotifications] = useState<any[]>([]);
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    let alive = true;
    const load = async () => {
      try {
        const list = await apiFetchBroadcasts();
        if (alive && Array.isArray(list)) setBroadcasts(list);
        const un = await apiFetchUserNotifications().catch(() => null);
        if (alive && Array.isArray(un)) setUserNotifications(un);
      } catch {
        /* offline / unauthorised — keep what we have */
      }
    };
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [authStatus]);

  const notifications = useMemo(
    () =>
      buildNotifications({
        user: activeUser,
        isAdmin: activeUser.role === 'admin',
        transactions,
        balanceRequests,
        supportTickets,
        allUsers,
        broadcasts,
        userNotifications,
      }),
    [activeUser, transactions, balanceRequests, supportTickets, allUsers, broadcasts, userNotifications]
  );
  const currentPlan = membershipPlans.find((p) => p.id === activeUser.membershipPlanId);

  // ═══════════════════════════════════════════════════════════════════════
  //  NORMAL LINKS  (server-driven)
  // ═══════════════════════════════════════════════════════════════════════
  const handleAddNormalLink = useCallback(async (name: string, url: string) => {
    try {
      // Call the server directly so real errors (invalid URL, plan link limit) reach the user,
      // and so the refresh below can never race ahead of the save.
      const { apiAddLink } = await import('./services/api');
      await apiAddLink(name, url);
      await AppStorage.refreshFromServer();
      syncAllState();
      showToast('Normal Link Added', `"${name}" validated and queued for visits.`, 'success');
    } catch (e: any) {
      showToast('Failed to Add Link', e?.message || 'Server error', 'error');
      try { await AppStorage.refreshFromServer(); syncAllState(); } catch {}
    }
  }, [showToast, syncAllState]);

  const handleToggleNormalStatus = useCallback(async (id: string) => {
    const current = normalLinks.find((l) => l.id === id);
    if (!current) return;
    const nextStatus = current.status === 'active' ? 'paused' : 'active';
    if (nextStatus === 'active' && credits.balance <= 0) {
      showToast('No Credits', 'Buy credits from the Shop first.', 'error');
      return;
    }
    const updated = normalLinks.map((l) => (l.id === id ? { ...l, status: nextStatus as 'active' | 'paused' } : l));
    AppStorage.saveNormalLinks(updated);
    try {
      const { apiUpdateLink, apiStartTraffic, apiStopTraffic } = await import('./services/api');
      await apiUpdateLink(id, { status: nextStatus });
      if (nextStatus === 'active') {
        await apiStartTraffic('normal');
      } else if (!updated.some((l) => l.status === 'active')) {
        await apiStopTraffic('normal');
      }
    } catch (e) { /* refresh will reconcile */ }
    syncAllState();
    showToast('Link Status Updated', `Link ${nextStatus}.`, 'info');
  }, [normalLinks, credits.balance, showToast, syncAllState]);

  const handleToggleAllNormal = useCallback(async (status: 'active' | 'paused') => {
    if (status === 'active' && credits.balance <= 0) {
      showToast('No Credits', 'Buy credits from the Shop first.', 'error');
      return;
    }
    const updated = normalLinks.map((l) => ({ ...l, status }));
    AppStorage.saveNormalLinks(updated);
    try {
      const { apiUpdateLink, apiStartTraffic, apiStopTraffic } = await import('./services/api');
      await Promise.all(updated.map((l) => apiUpdateLink(l.id, { status })));
      if (status === 'active') {
        await apiStartTraffic('normal');
      } else {
        await apiStopTraffic('normal');
      }
    } catch {}
    syncAllState();
    showToast('Batch Action Completed', `All normal links set to ${status}.`, 'info');
  }, [normalLinks, credits.balance, showToast, syncAllState]);

  const handleDeleteNormalLink = useCallback(async (id: string) => {
    AppStorage.saveNormalLinks(normalLinks.filter((l) => l.id !== id));
    try {
      const { apiDeleteLink } = await import('./services/api');
      await apiDeleteLink(id);
      syncAllState();
      showToast('Link Removed', 'Link deleted from active rotation.', 'info');
    } catch (e: any) {
      showToast('Delete Failed', e?.message || 'Server error', 'error');
      try { await AppStorage.refreshFromServer(); syncAllState(); } catch {}
    }
  }, [normalLinks, showToast, syncAllState]);

  const handleCheckNormalStatus = useCallback(async (id: string) => {
    try {
      const { apiCheckLink } = await import('./services/api');
      const r = await apiCheckLink(id);
      await AppStorage.refreshFromServer();
      syncAllState();
      if (r.ok) showToast('Link Reachable', `Server returned HTTP ${r.status}.`, 'success');
      else showToast('Link Check Failed', r.status ? `Server returned HTTP ${r.status}.` : (r.reason || 'Could not reach the link.'), 'error');
    } catch (e: any) {
      showToast('Check Failed', e?.message || 'Server error', 'error');
    }
  }, [showToast, syncAllState]);

  // ═══════════════════════════════════════════════════════════════════════
  //  SMARTLINKS  (server-driven)
  // ═══════════════════════════════════════════════════════════════════════
  const handleAddSmartLink = useCallback(async (name: string, url: string, adsterraId?: string) => {
    try {
      await AppStorage.addSmartlink(name, url, adsterraId);
      syncAllState();
      showToast('SmartLink Added', 'Link stored in your Adsterra rotation.', 'success');
    } catch (e: any) {
      showToast('Failed', e?.message || 'Server error', 'error');
    }
  }, [showToast, syncAllState]);

  const handleBulkAddSmartLinks = useCallback(async (urls: string[]) => {
    try {
      await AppStorage.bulkAddSmartlinks(urls);
      syncAllState();
      showToast('Bulk Ingestion Complete', `${urls.length} URLs submitted.`, 'success');
    } catch (e: any) {
      showToast('Bulk Add Failed', e?.message || 'Server error', 'error');
    }
  }, [showToast, syncAllState]);

  const handleToggleSmartStatus = useCallback(async (id: string) => {
    const sl = smartlinks.find((s) => s.id === id);
    if (!sl) return;
    const next: 'active' | 'paused' = sl.status === 'active' ? 'paused' : 'active';
    // Optimistic UI, then persist so the periodic refresh no longer reverts it.
    AppStorage.saveSmartLinks(smartlinks.map((s) => (s.id === id ? { ...s, status: next } : s)));
    syncAllState();
    try {
      const { apiSetSmartlinkStatus } = await import('./services/api');
      await apiSetSmartlinkStatus([sl.url], next === 'paused' ? 'Paused' : 'Active');
      showToast(next === 'paused' ? 'SmartLink Paused' : 'SmartLink Resumed', sl.name || sl.url, 'info');
    } catch (e: any) {
      showToast('Status Change Failed', e?.message || 'Server error', 'error');
      try { await AppStorage.refreshFromServer(); syncAllState(); } catch {}
    }
  }, [smartlinks, showToast, syncAllState]);

  const handleDeleteSmartLink = useCallback(async (id: string) => {
    const sl = smartlinks.find((s) => s.id === id);
    if (!sl) return;
    // Delete by URL on the server (the old SHA-1 hash needed crypto.subtle, which does not
    // exist on plain-http pages, so deletes silently failed).
    AppStorage.saveSmartLinks(smartlinks.filter((s) => s.id !== id));
    syncAllState();
    try {
      const { apiRemoveSmartlinks } = await import('./services/api');
      await apiRemoveSmartlinks({ urls: [sl.url] });
      await AppStorage.refreshFromServer();
      syncAllState();
      showToast('SmartLink Removed', 'Placement deleted.', 'info');
    } catch (e: any) {
      showToast('Delete Failed', e?.message || 'Server error', 'error');
      try { await AppStorage.refreshFromServer(); syncAllState(); } catch {}
    }
  }, [smartlinks, showToast, syncAllState]);

  const handleDeleteAllSmartLinks = useCallback(async () => {
    AppStorage.saveSmartLinks([]);
    syncAllState();
    try {
      const { apiRemoveSmartlinks } = await import('./services/api');
      const r = await apiRemoveSmartlinks({ all: true });
      await AppStorage.refreshFromServer();
      syncAllState();
      showToast('SmartLinks Cleared', `${r.removed} placement(s) removed.`, 'info');
    } catch (e: any) {
      showToast('Delete Failed', e?.message || 'Server error', 'error');
      try { await AppStorage.refreshFromServer(); syncAllState(); } catch {}
    }
  }, [showToast, syncAllState]);

  // ═══════════════════════════════════════════════════════════════════════
  //  TRAFFIC CONTROL  (server-driven — bot picks up flag from Firestore)
  // ═══════════════════════════════════════════════════════════════════════
  const handleStartTraffic = useCallback(async () => {
    if (credits.balance <= 0) {
      showToast('No Credits', 'Buy credits from the Shop first.', 'error');
      return;
    }
    try {
      await AppStorage.startTraffic('smartlink');
      syncAllState();
      showToast('Engine Dispatched', 'The bot will pick up the flag on its next tick.', 'success');
    } catch (e: any) {
      showToast('Cannot Start', e?.message || 'Server rejected request', 'error');
    }
  }, [credits.balance, showToast, syncAllState]);

  const handleStopTraffic = useCallback(async () => {
    try {
      await AppStorage.stopTraffic('smartlink');
      syncAllState();
      showToast('Engine Paused', 'Traffic flag cleared.', 'info');
    } catch (e: any) {
      showToast('Stop Failed', e?.message || 'Server error', 'error');
    }
  }, [showToast, syncAllState]);

  const handleUpdateTarget = useCallback(async (amount: number, mode?: TrafficMode) => {
    try {
      await AppStorage.setTarget('smartlink', amount, mode);
      syncAllState();
      showToast('Target Updated', `Goal set to ${amount.toLocaleString()} visits${mode ? ` · ${mode.replace(/_/g, ' ').toUpperCase()}` : ''}.`, 'success');
    } catch (e: any) {
      showToast('Target Failed', e?.message || 'Server error', 'error');
    }
  }, [showToast, syncAllState]);

  const handleClearTarget = useCallback(async () => {
    try {
      await AppStorage.clearTarget('smartlink');
      syncAllState();
      showToast('Target Cleared', 'Your visit goal has been reset to 0.', 'info');
    } catch (e: any) {
      showToast('Clear Failed', e?.message || 'Server error', 'error');
    }
  }, [showToast, syncAllState]);

  // ── Start a campaign WITH a visit limit (auto-stops + notifies on reach) ──
  const handleStartNormalWithLimit = useCallback(async (id: string | 'all', amount: number) => {
    if (credits.balance <= 0) {
      showToast('No Credits', 'Buy credits from the Shop first.', 'error');
      return;
    }
    try {
      const { apiSetTarget, apiUpdateLink, apiStartTraffic } = await import('./services/api');
      await apiSetTarget('normal', amount);
      const target = normalLinks.map((l) => (id === 'all' || l.id === id ? { ...l, status: 'active' as const } : l));
      AppStorage.saveNormalLinks(target);
      const toActivate = target.filter((l) => l.status === 'active');
      await Promise.all(toActivate.map((l) => apiUpdateLink(l.id, { status: 'active' })));
      await apiStartTraffic('normal');
      await AppStorage.refreshFromServer();
      syncAllState();
      showToast(
        'Campaign Started',
        `Delivering up to ${amount.toLocaleString()} visits. Auto-stops when your target is reached.`,
        'success'
      );
    } catch (e: any) {
      showToast('Cannot Start', e?.message || 'Server rejected request', 'error');
    }
  }, [normalLinks, credits.balance, showToast, syncAllState]);

  const handleStartSmartWithLimit = useCallback(async (id: string | 'all', amount: number) => {
    if (credits.balance <= 0) {
      showToast('No Credits', 'Buy credits from the Shop first.', 'error');
      return;
    }
    try {
      const { apiSetTarget, apiSetSmartlinkStatus, apiStartTraffic } = await import('./services/api');
      await apiSetTarget('smartlink', amount);
      const target = smartlinks.map((s) => (id === 'all' || s.id === id ? { ...s, status: 'active' as const } : s));
      AppStorage.saveSmartLinks(target);
      const urls = target.filter((s) => s.status === 'active').map((s) => s.url);
      if (urls.length) await apiSetSmartlinkStatus(urls, 'Active');
      await apiStartTraffic('smartlink');
      await AppStorage.refreshFromServer();
      syncAllState();
      showToast(
        'Campaign Started',
        `Delivering up to ${amount.toLocaleString()} impressions. Auto-stops when your target is reached.`,
        'success'
      );
    } catch (e: any) {
      showToast('Cannot Start', e?.message || 'Server rejected request', 'error');
    }
  }, [smartlinks, credits.balance, showToast, syncAllState]);

  // ── Resume the live SmartLink stream WITH a fresh visit limit ──
  // Mirrors handleStartSmartWithLimit but is used by the Live Monitor's
  // "Resume Stream" button (which first opens the target-setting modal).
  const handleResumeSmartWithLimit = useCallback(async (amount: number) => {
    if (credits.balance <= 0) {
      showToast('No Credits', 'Buy credits from the Shop first.', 'error');
      return;
    }
    try {
      const { apiSetTarget, apiStartTraffic } = await import('./services/api');
      await apiSetTarget('smartlink', amount);
      await apiStartTraffic('smartlink');
      await AppStorage.refreshFromServer();
      syncAllState();
      showToast(
        'Stream Resumed',
        `Delivering up to ${amount.toLocaleString()} impressions. Auto-stops when your target is reached.`,
        'success'
      );
    } catch (e: any) {
      showToast('Cannot Resume', e?.message || 'Server rejected request', 'error');
    }
  }, [credits.balance, showToast, syncAllState]);

  // ═══════════════════════════════════════════════════════════════════════
  //  WALLET
  // ═══════════════════════════════════════════════════════════════════════
  const handleSubmitDeposit = useCallback(async (
    amount: number,
    method: 'bkash' | 'nagad' | 'rocket' | 'binance' | 'usdt',
    txnId: string,
    senderNumber?: string
  ) => {
    try {
      await AppStorage.submitDeposit({ amount, method, txnId, senderNumber });
      syncAllState();
      showToast('Deposit Submitted', 'Admin will review your proof shortly.', 'success');
      return true;
    } catch (e: any) {
      showToast('Submission Failed', e?.message || 'Server error', 'error');
      return false;
    }
  }, [showToast, syncAllState]);

  // ═══════════════════════════════════════════════════════════════════════
  //  SHOP / MEMBERSHIP
  // ═══════════════════════════════════════════════════════════════════════
  const handleBuyPackage = useCallback(async (pkg: ShopPackageItem, promoCode?: string) => {
    try {
      await AppStorage.buyPackage(pkg.id, promoCode);
      syncAllState();
      showToast('Credits Purchased', `+${(pkg.credits + pkg.bonus).toLocaleString()} credits added!`, 'success');
      return true;
    } catch (e: any) {
      showToast('Purchase Failed', e?.message || 'Server error', 'error');
      return false;
    }
  }, [showToast, syncAllState]);

  const handleApplyPromo = useCallback((code: string) => {
    const promo = promoCodes.find(
      (p) => p.code.toUpperCase() === code.toUpperCase() && p.enabled
    );
    if (!promo) return null;
    return { discount: promo.discountPercent, bonus: promo.bonusCredits };
  }, [promoCodes]);

  const handleUpgradePlan = useCallback(async (planId: string) => {
    try {
      await AppStorage.buyMembership(planId);
      syncAllState();
      const plan = membershipPlans.find((p) => p.id === planId);
      showToast('Membership Upgraded', `You are now on ${plan?.label || planId}!`, 'success');
    } catch (e: any) {
      showToast('Upgrade Failed', e?.message || 'Server error', 'error');
    }
  }, [membershipPlans, showToast, syncAllState]);

  // ═══════════════════════════════════════════════════════════════════════
  //  SUPPORT
  // ═══════════════════════════════════════════════════════════════════════
  const handleCreateTicket = useCallback(async (
    subject: string, message: string, priority: 'low' | 'normal' | 'urgent'
  ) => {
    try {
      await AppStorage.createTicket(subject, message, priority);
      syncAllState();
      showToast('Support Ticket Created', 'Assigned to operations queue.', 'success');
      return true;
    } catch (e: any) {
      showToast('Ticket Failed', e?.message || 'Server error', 'error');
      return false;
    }
  }, [showToast, syncAllState]);

  const handleReplyTicket = useCallback(async (ticketId: string, message: string) => {
    try {
      await AppStorage.replyTicket(ticketId, message);
      syncAllState();
      showToast('Reply Sent', 'Response posted.', 'info');
      return true;
    } catch (e: any) {
      showToast('Reply Failed', e?.message || 'Server error', 'error');
      return false;
    }
  }, [showToast, syncAllState]);

  const handleCloseTicket = useCallback(async (ticketId: string) => {
    try {
      await AppStorage.closeTicket(ticketId);
      syncAllState();
      showToast('Ticket Closed', 'Inquiry marked as resolved.', 'info');
    } catch (e: any) {
      showToast('Close Failed', e?.message || 'Server error', 'error');
    }
  }, [showToast, syncAllState]);

  // ═══════════════════════════════════════════════════════════════════════
  //  PROFILE
  // ═══════════════════════════════════════════════════════════════════════
  const handleUpdateProfile = useCallback(async (
    name: string,
    _email: string,
    avatar?: string,
    extra?: ProfileExtraInput
  ) => {
    try {
      const { apiUpdateProfile } = await import('./services/api');
      const updated = await apiUpdateProfile(name, avatar, extra);
      // email is permanent: always keep the original one, whatever came back
      AppStorage.saveUser({ ...activeUser, ...updated, email: activeUser.email });
      syncAllState();
      showToast('Profile Updated', 'Your profile was saved.', 'success');
    } catch (e: any) {
      showToast('Update Failed', e?.message || 'Server error', 'error');
      throw e; // let the Profile page show an inline error too
    }
  }, [activeUser, showToast, syncAllState]);

  const handleChangePassword = useCallback(async (oldPass: string, newPass: string): Promise<boolean> => {
    try {
      const { apiChangePassword } = await import('./services/api');
      await apiChangePassword(oldPass, newPass);
      showToast('Password Changed', 'Your password was updated.', 'success');
      return true;
    } catch (e: any) {
      showToast('Password Change Failed', e?.message || 'Server error', 'error');
      return false;
    }
  }, [showToast]);

  // Real device revoke: every token issued before now stops working; this device receives a fresh one.
  const handleRevokeSession = useCallback(async (sessionId: string) => {
    const target = sessions.find((x) => x.id === sessionId);
    if (target?.isCurrent) {
      showToast('This device', 'You are using this device right now. Use Sign Out to leave it.', 'info');
      return;
    }
    try {
      const { apiLogoutOthers } = await import('./services/api');
      await apiLogoutOthers();
      AppStorage.saveSessions(sessions.filter((x) => x.id !== sessionId));
      syncAllState();
      showToast('Device Revoked', 'All other devices were signed out.', 'success');
    } catch (e: any) {
      showToast('Revoke Failed', e?.message || 'Server error', 'error');
    }
  }, [sessions, showToast, syncAllState]);

  // ═══════════════════════════════════════════════════════════════════════
  //  ADMIN ACTIONS
  // ═══════════════════════════════════════════════════════════════════════
  const handleBanUser = useCallback(async (userId: string, reason: string) => {
    try {
      const { apiAdminUpdateUser } = await import('./services/api');
      await apiAdminUpdateUser(userId, { status: 'banned', banReason: reason });
      const updated = allUsers.map((u) =>
        u.id === userId ? { ...u, status: 'banned' as const, banReason: reason } : u);
      AppStorage.saveAllUsers(updated);
      syncAllState();
      showToast('Publisher Banned', `User ${userId} banned.`, 'error');
    } catch (e: any) {
      showToast('Ban Failed', e?.message || 'Server error', 'error');
    }
  }, [allUsers, showToast, syncAllState]);

  const handleUnbanUser = useCallback(async (userId: string) => {
    try {
      const { apiAdminUpdateUser } = await import('./services/api');
      await apiAdminUpdateUser(userId, { status: 'active' });
      const updated = allUsers.map((u) =>
        u.id === userId ? { ...u, status: 'active' as const, banReason: undefined } : u);
      AppStorage.saveAllUsers(updated);
      syncAllState();
      showToast('Publisher Unbanned', 'Account restored.', 'success');
    } catch (e: any) {
      showToast('Unban Failed', e?.message || 'Server error', 'error');
    }
  }, [allUsers, showToast, syncAllState]);

  const handleAdjustBalance = useCallback(async (userId: string, amount: number, note: string) => {
    try {
      const { apiAdminAdjustWallet } = await import('./services/api');
      const res = await apiAdminAdjustWallet(userId, amount, note);
      if (userId === activeUser.id && res?.wallet) {
        AppStorage.saveWallet({ ...wallet, balance: res.wallet.balance });
      }
      await AppStorage.refreshFromServer();
      syncAllState();
      showToast(amount > 0 ? 'Funds Added' : 'Funds Removed', `${amount > 0 ? '+' : '−'}৳${Math.abs(amount).toFixed(2)} applied to the wallet.`, 'success');
    } catch (e: any) {
      showToast('Adjustment Failed', e?.message || 'Server error', 'error');
      throw e;
    }
  }, [activeUser.id, wallet, showToast, syncAllState]);

  const handleCreateUser = useCallback(async (params: import('./services/api').AdminCreateUserParams) => {
    try {
      const { apiAdminCreateUser } = await import('./services/api');
      const created = await apiAdminCreateUser(params);
      await AppStorage.refreshFromServer();
      syncAllState();
      showToast('User Created', `${created?.name || created?.email || 'Account'} created successfully.`, 'success');
      return created;
    } catch (e: any) {
      showToast('Create Failed', e?.message || 'Server error', 'error');
      throw e;
    }
  }, [showToast, syncAllState]);

  const handleDeleteUser = useCallback(async (userId: string) => {
    try {
      const { apiAdminDeleteUser } = await import('./services/api');
      await apiAdminDeleteUser(userId);
      const updated = allUsers.filter((u) => u.id !== userId);
      AppStorage.saveAllUsers(updated);
      await AppStorage.refreshFromServer();
      syncAllState();
      showToast('User Deleted', 'The account and all its data were removed.', 'success');
    } catch (e: any) {
      showToast('Delete Failed', e?.message || 'Server error', 'error');
      throw e;
    }
  }, [allUsers, showToast, syncAllState]);

  const handleApproveDeposit = useCallback(async (requestId: string, note?: string) => {
    try {
      const { apiAdminDecideDeposit } = await import('./services/api');
      await apiAdminDecideDeposit(requestId, 'approved', note);
      await AppStorage.refreshFromServer();
      syncAllState();
      showToast('Deposit Approved', 'Ledger credited.', 'success');
    } catch (e: any) {
      showToast('Approval Failed', e?.message || 'Server error', 'error');
    }
  }, [showToast, syncAllState]);

  const handleRejectDeposit = useCallback(async (requestId: string, note?: string) => {
    try {
      const { apiAdminDecideDeposit } = await import('./services/api');
      await apiAdminDecideDeposit(requestId, 'rejected', note);
      await AppStorage.refreshFromServer();
      syncAllState();
      showToast('Deposit Rejected', 'Submission marked rejected.', 'info');
    } catch (e: any) {
      showToast('Rejection Failed', e?.message || 'Server error', 'error');
    }
  }, [showToast, syncAllState]);

  const handleCreateAdmin = useCallback(async (adminData: any) => {
    try {
      const { apiAdminCreateAdmin } = await import('./services/api');
      const admin = await apiAdminCreateAdmin(adminData);
      AppStorage.saveAdmins([...admins, admin]);
      syncAllState();
      showToast('Admin Created', `Provisioned: ${adminData.name}`, 'success');
    } catch (e: any) {
      showToast('Admin Creation Failed', e?.message || 'Server error', 'error');
    }
  }, [admins, showToast, syncAllState]);

  const handleUpdateAdmin = useCallback(async (adminId: string, updates: Partial<AdminAccount>) => {
    try {
      const { apiAdminUpdateAdmin } = await import('./services/api');
      const updated = await apiAdminUpdateAdmin(adminId, updates);
      AppStorage.saveAdmins(admins.map((a) => a.id === adminId ? { ...a, ...updated } : a));
      syncAllState();
      showToast('Admin Updated', 'Administrator changes saved.', 'success');
    } catch (e: any) {
      showToast('Update Failed', e?.message || 'Server error', 'error');
    }
  }, [admins, showToast, syncAllState]);

  const handleDeleteAdmin = useCallback(async (adminId: string) => {
    try {
      const { apiAdminDeleteAdmin } = await import('./services/api');
      await apiAdminDeleteAdmin(adminId);
      AppStorage.saveAdmins(admins.filter((a) => a.id !== adminId));
      syncAllState();
      showToast('Admin Removed', 'Administrator decommissioned.', 'warning');
    } catch (e: any) {
      showToast('Delete Failed', e?.message || 'Server error', 'error');
    }
  }, [admins, showToast, syncAllState]);

  const handleClaimTrial = useCallback(async () => {
    try {
      const result = await AppStorage.claimTrial();
      syncAllState();
      showToast('Trial Claimed', `+${result?.creditsAdded || 10} credits added to your balance.`, 'success');
    } catch (e: any) {
      showToast('Trial Claim Failed', e?.message || 'Unable to claim trial.', 'error');
    }
  }, [showToast, syncAllState]);

  // Quick-navigation entries for the Ctrl/Cmd+K command palette.
  const commandItems = useMemo<CommandItem[]>(() => {
    const isAdminSurface = user?.role === 'admin' && !impersonatingUser;
    if (isAdminSurface) {
      return [
        { id: 'admin_overview', label: 'Operations Center', group: 'Command & Operations', keywords: 'dashboard home' },
        { id: 'admin_users', label: 'User Directory', group: 'Command & Operations', keywords: 'users accounts' },
        { id: 'admin_appeals', label: 'Ban Appeals', group: 'Command & Operations' },
        { id: 'admin_approvals', label: 'Deposit Queue', group: 'Command & Operations', keywords: 'approvals balance' },
        { id: 'admin_payments', label: 'Payments', group: 'Command & Operations', keywords: 'superchat transactions refund checkout' },
        { id: 'admin_webhook', label: 'Webhook', group: 'Command & Operations', keywords: 'webhook callback url copy payment superchat endpoint' },
        { id: 'admin_admins', label: 'Admin Accounts', group: 'Root Governance', keywords: 'root' },
        { id: 'admin_roles', label: 'Roles & RBAC', group: 'Root Governance', keywords: 'permissions' },
        { id: 'admin_database', label: 'Database Tables', group: 'Data & Infrastructure' },
        { id: 'admin_botdb', label: 'Bot Embedded DB', group: 'Data & Infrastructure', keywords: 'bot local database journal telemetry routing firebase quota' },
        { id: 'admin_recovery', label: 'Data Recovery', group: 'Data & Infrastructure' },
        { id: 'admin_proxies', label: 'CPM Booster Manager', group: 'Data & Infrastructure' },
        { id: 'admin_engine', label: 'Traffic Engine', group: 'Data & Infrastructure' },
        { id: 'admin_targeting', label: 'Targeting Engine', group: 'Data & Infrastructure', keywords: 'country device browser os pick rate cpm geo' },
        { id: 'admin_worker', label: 'Worker Supervisor', group: 'Data & Infrastructure' },
        { id: 'admin_cms', label: 'CMS & Pricing', group: 'Configuration & Audits' },
        { id: 'admin_broadcast', label: 'Broadcast Alerts', group: 'Configuration & Audits' },
        { id: 'admin_support', label: 'Support Desk', group: 'Configuration & Audits' },
        { id: 'admin_security', label: 'Security & Health', group: 'Configuration & Audits' },
        { id: 'admin_growth', label: 'Growth & Data', group: 'Configuration & Audits', keywords: 'leaderboard prune maintenance firestore' },
        { id: 'admin_audit', label: 'Activity Logs', group: 'Configuration & Audits' },
      ];
    }
    return [
      { id: 'overview', label: 'Overview', group: 'Traffic & Links', keywords: 'dashboard home' },
      { id: 'links', label: 'Normal Links', group: 'Traffic & Links' },
      { id: 'smartlinks', label: 'SmartLinks (Adsterra)', group: 'Traffic & Links', keywords: 'adsterra' },
      { id: 'traffic', label: 'Traffic Control', group: 'Traffic & Links', keywords: 'engine mode target' },
      { id: 'monitor', label: 'Live Monitor', group: 'Traffic & Links', keywords: 'live realtime' },
      { id: 'stats', label: 'Analytics', group: 'Traffic & Links', keywords: 'stats charts' },
      { id: 'history', label: 'History & Logs', group: 'Traffic & Links' },
      { id: 'wallet', label: 'Wallet', group: 'Monetization & Shop', keywords: 'balance deposit' },
      { id: 'shop', label: 'Impression Shop', group: 'Monetization & Shop', keywords: 'buy credits trial' },
      { id: 'membership', label: 'Membership Plans', group: 'Monetization & Shop', keywords: 'upgrade plan' },
      { id: 'referrals', label: 'Referral Program', group: 'Monetization & Shop', keywords: 'affiliate invite' },
      { id: 'support', label: 'Support Tickets', group: 'Support & Settings', keywords: 'help ticket' },
      { id: 'profile', label: 'Profile & Security', group: 'Support & Settings', keywords: 'account password' },
      { id: 'settings', label: 'Preferences', group: 'Support & Settings', keywords: 'theme notifications' },
      { id: 'about', label: 'About', group: 'Support & Settings', keywords: 'about info version cpm booster features' },
    ];
  }, [user?.role, impersonatingUser]);

  // ═══════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════════

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  if (booting) {
    return <BrandLoader fullscreen label="Preparing your dashboard" />;
  }

  // ─── Server not ready (Firebase not configured) OR unreachable ───
  //  • Visitors      → the friendly maintenance page.
  //  • Admin surface → a diagnostic screen (installer + retry + escape hatch),
  //                    so the owner is never locked out by the setup gate.
  if (setupRequired) {
    const wantsInstaller = setupInstaller;
    const adminSurface = isAdminSurface();

    const retrySetup = async () => {
      setBooting(true);
      try {
        const status = await apiSetupStatus();
        if (status.ready) {
          setSetupRequired(false);
          window.location.reload();
        } else {
          setSetupError(status.error || 'Firebase is still not configured on the server.');
        }
      } catch {
        setSetupError('Still could not reach the API server. Check that it is running.');
      }
      setBooting(false);
    };

    if (wantsInstaller) {
      return <SetupModeView onRetry={retrySetup} />;
    }

    if (adminSurface) {
      return (
        <ServerNotReadyScreen
          reason={setupError}
          onRetry={retrySetup}
          onOpenInstaller={() => { setSetupInstaller(true); replacePath('/setup'); }}
          onBypass={() => {
            // Escape hatch: let the owner reach the admin sign-in even if the
            // readiness probe is failing (e.g. a transient API blip).
            setSetupRequired(false);
            setAuthStatus('admin_login');
            replaceView('admin-login');
          }}
        />
      );
    }

    return (
      <UserLoginView
        onLoginSuccess={handleUserLoginSuccess}
      />
    );
  }

  // ─── Banned member: full-screen notice with the appeal form ───
  if (bannedInfo && user?.role !== 'admin') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-2xl">
          <BannedScreen
            email={user?.email || ''}
            reason={bannedInfo.reason}
            backLabel="Sign out"
            onBack={() => { setBannedInfo(null); void handleLogout(); }}
          />
        </div>
      </div>
    );
  }

  // ─── Maintenance gate: everyone except a signed-in admin (and the admin sign-in page) ───
  const isSignedInAdmin = authStatus === 'authenticated' && !!getToken() && user?.role === 'admin';
  if (isMaintenance && !isSignedInAdmin && !isAdminSurface()) {
    return (
      <MaintenanceScreen
        message={maintenanceMsg}
        eta={maintenanceEta}
        onRetry={checkMaintenance}
      />
    );
  }

  if (authStatus === 'user_login') {
    return (
      <UserLoginView
        onLoginSuccess={handleUserLoginSuccess}
      />
    );
  }

  if (authStatus === 'admin_login') {
    return (
      <AdminLoginView
        onAdminLoginSuccess={handleAdminLoginSuccess}
      />
    );
  }

  // ─── Authenticated ───
  const renderCurrentView = () => {
    // Public profile of another user (opened from the leaderboard).
    if (activeView.startsWith('profile_public:')) {
      const targetId = activeView.slice('profile_public:'.length);
      return <PublicProfileView userId={targetId} onNavigate={navigateTo} />;
    }
    switch (activeView) {
      case 'overview':
        return (
          <DashboardOverview
            user={activeUser}
            wallet={wallet}
            credits={credits}
            plan={currentPlan}
            target={target}
            impressions={impressions}
            onStartTraffic={handleStartTraffic}
            onStopTraffic={handleStopTraffic}
            onNavigate={navigateTo}
          />
        );
      case 'links':
        return (
          <NormalLinksView
            links={normalLinks}
            plan={currentPlan}
            onAddLink={handleAddNormalLink}
            onToggleStatus={handleToggleNormalStatus}
            onToggleAll={handleToggleAllNormal}
            onDeleteLink={handleDeleteNormalLink}
            onCheckStatus={handleCheckNormalStatus}
            onStartWithLimit={handleStartNormalWithLimit}
            balance={credits.balance}
            impressions={impressions}
          />
        );
      case 'smartlinks':
        return (
          <SmartLinksView
            smartlinks={smartlinks}
            onAddSmartLink={handleAddSmartLink}
            onBulkAdd={handleBulkAddSmartLinks}
            onToggleStatus={handleToggleSmartStatus}
            onDeleteSmartLink={handleDeleteSmartLink}
            onDeleteAllSmartLinks={handleDeleteAllSmartLinks}
            onStartWithLimit={handleStartSmartWithLimit}
            balance={credits.balance}
            impressions={impressions}
            totalImpressions={credits.totalImpressions}
          />
        );
      case 'traffic':
        return (
          <TrafficControlView
            target={target}
            credits={credits}
            plan={currentPlan}
            onUpdateTarget={(amount, mode) => handleUpdateTarget(amount, mode)}
            onClearTarget={handleClearTarget}
            onStartTraffic={handleStartTraffic}
            onStopTraffic={handleStopTraffic}
          />
        );
      case 'monitor':
        return (
          <LiveMonitorView
            impressions={impressions}
            target={target}
            totalImpressions={credits.totalImpressions}
            onStartTraffic={handleStartTraffic}
            onStopTraffic={handleStopTraffic}
            onStartWithLimit={handleResumeSmartWithLimit}
            balance={credits.balance}
          />
        );
      case 'stats':
        return <AnalyticsView links={normalLinks} smartlinks={smartlinks} credits={credits} impressions={impressions} />;
      case 'history':
        return <HistoryView impressions={impressions} totalImpressions={credits.totalImpressions} />;
      case 'wallet':
        return (
          <WalletView
            wallet={wallet}
            transactions={transactions}
            balanceRequests={balanceRequests}
            paymentMethods={paymentMethods}
            onSubmitDeposit={handleSubmitDeposit}
          />
        );
      case 'shop':
        return (
          <ShopView
            packages={shopPackages}
            wallet={wallet}
            credits={credits}
            onBuyPackage={handleBuyPackage}
            onApplyPromo={handleApplyPromo}
            trialClaimed={!!user.trialClaimed}
            onClaimTrial={handleClaimTrial}
          />
        );
      case 'membership':
        return (
          <MembershipView
            plans={membershipPlans}
            user={activeUser}
            wallet={wallet}
            onUpgradePlan={handleUpgradePlan}
          />
        );
      case 'referrals':
        return <ReferralView user={activeUser} />;
      case 'leaderboard':
        return <LeaderboardView user={activeUser} onNavigate={navigateTo} />;
      case 'support':
        return (
          <SupportView
            tickets={supportTickets}
            user={activeUser}
            onCreateTicket={handleCreateTicket}
            onReplyTicket={handleReplyTicket}
            onCloseTicket={handleCloseTicket}
          />
        );
      case 'profile':
        return (
          <ProfileView
            user={activeUser}
            wallet={wallet}
            credits={credits}
            sessions={sessions}
            onUpdateProfile={handleUpdateProfile}
            onChangePassword={handleChangePassword}
            onRevokeSession={handleRevokeSession}
          />
        );
      case 'settings':
        return (
          <SettingsView
            user={activeUser}
            onUpdateSettings={async (s) => {
              AppStorage.saveUser({ ...activeUser, settings: { ...activeUser.settings, ...s } });
              syncAllState();
              try {
                const { apiUpdateSettings } = await import('./services/api');
                await apiUpdateSettings(s as any);
                showToast('Preferences Saved', 'Settings updated.', 'success');
              } catch (e: any) {
                showToast('Could Not Save Settings', e?.message || 'Server error', 'error');
              }
            }}
            onResetData={() => {
              AppStorage.resetAll();
              setShowSplash(true);
            }}
            onReplaySplash={() => setShowSplash(true)}
          />
        );
      case 'about':
        return <AboutView onNavigate={navigateTo} />;
      case 'howto':
        return <HowToWorkView videos={howtoVideos} onNavigate={navigateTo} />;

      // ─── Admin ───
      case 'admin_overview':
        return (
          <AdminOverviewView
            users={allUsers}
            proxies={proxies}
            requests={balanceRequests}
            tickets={supportTickets}
            credits={credits}
            onNavigate={navigateTo}
            onResetTicks={async () => {
              try {
                const { apiAdminResetWorker } = await import('./services/api');
                await apiAdminResetWorker();
                showToast('Reset Queued', 'Background worker received the reset request.', 'success');
              } catch (e: any) {
                showToast('Reset Failed', e?.message || 'Unable to queue reset.', 'error');
              }
            }}
          />
        );
      case 'admin_appeals':
        return <AdminAppealsView />;
      case 'admin_users':
        return (
          <AdminUsersView
            users={allUsers}
            currentUserId={user.id}
            onBanUser={handleBanUser}
            onUnbanUser={handleUnbanUser}
            onAdjustBalance={handleAdjustBalance}
            onCreateUser={handleCreateUser}
            onDeleteUser={handleDeleteUser}
            onImpersonateUser={(targetUser) => {
              setImpersonatingUser(targetUser);
              showToast('Impersonating User', `Viewing dashboard as ${targetUser.name}`, 'info');
            }}
          />
        );
      case 'admin_proxies':
        return (
          <AdminProxiesView
            proxies={proxies}
            onAddProxy={async (p) => {
              try {
                const { apiAdminAddProxy } = await import('./services/api');
                await apiAdminAddProxy(p.server, p.name);
                await AppStorage.refreshFromServer();
                syncAllState();
                showToast('Booster Added', `${p.name} added.`, 'success');
              } catch (e: any) {
                showToast('Add Failed', e?.message || 'Server error', 'error');
                throw e; // keep the Add-Proxy form open so the admin can fix the input
              }
            }}
            onToggleProxy={async (id) => {
              const p = proxies.find((x) => x.id === id);
              if (!p) return;
              try {
                const { apiAdminToggleProxy } = await import('./services/api');
                await apiAdminToggleProxy(id, !p.enabled);
                await AppStorage.refreshFromServer();
                syncAllState();
              } catch (e: any) {
                showToast('Toggle Failed', e?.message, 'error');
              }
            }}
            onDeleteProxy={async (id) => {
              try {
                const { apiAdminDeleteProxy } = await import('./services/api');
                await apiAdminDeleteProxy(id);
                await AppStorage.refreshFromServer();
                syncAllState();
                showToast('Booster Deleted', 'Node removed.', 'info');
              } catch (e: any) {
                showToast('Delete Failed', e?.message, 'error');
              }
            }}
            onTestProxy={async (id) => {
              try {
                const { apiAdminCheckProxy } = await import('./services/api');
                const h = await apiAdminCheckProxy(id);
                await AppStorage.refreshFromServer();
                syncAllState();
                if (h?.status === 'healthy') showToast('Booster Healthy', `${h.latencyMs}ms${h.country ? ' \u2022 ' + h.country : ''}`, 'success');
                else showToast('Booster Failed', h?.error || 'Health check failed.', 'error');
              } catch (e: any) { showToast('Check Failed', e?.message || 'Unable to check CPM booster.', 'error'); }
            }}
            onTestAll={async () => {
              try {
                const { apiAdminCheckAllProxies } = await import('./services/api');
                await apiAdminCheckAllProxies();
                await AppStorage.refreshFromServer();
                syncAllState();
                showToast('Health Check Complete', 'All proxies were checked.', 'success');
              } catch (e: any) { showToast('Check Failed', e?.message || 'Unable to check proxies.', 'error'); }
            }}
            onRefreshProxies={async () => {
              await AppStorage.refreshFromServer();
              syncAllState();
            }}
          />
        );
      case 'admin_targeting':
        return (
          <AdminTargetingView />
        );
      case 'admin_engine':
        return (
          <AdminEngineView
            settings={engineSettings}
            onSaveSettings={async (s) => {
              try {
                const { apiAdminSaveEngineSettings } = await import('./services/api');
                await apiAdminSaveEngineSettings(s as any);
                AppStorage.saveEngineSettings(s);
                syncAllState();
                showToast('Engine Settings Saved', 'Parameters saved to the server and picked up by the worker.', 'success');
              } catch (e: any) {
                showToast('Save Failed', e?.message || 'Could not save engine settings.', 'error');
              }
            }}
            onResetHourlyCounters={async () => {
              try { const { apiAdminResetWorker } = await import('./services/api'); await apiAdminResetWorker(); showToast('Reset Queued', 'Background worker received the reset request.', 'success'); }
              catch (e:any) { showToast('Reset Failed', e?.message || 'Unable to queue reset.', 'error'); }
            }}
          />
        );
      case 'admin_worker':
        return (
          <AdminWorkerControlView
            settings={engineSettings}
            credits={credits}
            onUpdateSettings={async (s) => {
              const previous = AppStorage.getEngineSettings();
              AppStorage.saveEngineSettings(s); // instant UI feedback
              syncAllState();
              try {
                const { apiAdminSaveEngineSettings } = await import('./services/api');
                await apiAdminSaveEngineSettings(s as any);
              } catch (e: any) {
                AppStorage.saveEngineSettings(previous); // roll back — the server did not accept it
                syncAllState();
                showToast('Update Failed', e?.message || 'Could not update the worker settings.', 'error');
              }
            }}
            onResetTicks={async () => {
              try { const { apiAdminResetWorker } = await import('./services/api'); await apiAdminResetWorker(); showToast('Reset Queued', 'Background worker received the reset request.', 'success'); }
              catch (e:any) { showToast('Reset Failed', e?.message || 'Unable to queue reset.', 'error'); }
            }}
          />
        );
      case 'admin_approvals':
        return (
          <AdminApprovalsView
            requests={balanceRequests}
            onApprove={handleApproveDeposit}
            onReject={handleRejectDeposit}
          />
        );
      case 'admin_adsterra':
        return <AdminAdsterraView />;
      case 'admin_cms':
        return (
          <AdminCmsView
            plans={membershipPlans}
            packages={shopPackages}
            paymentMethods={paymentMethods}
            promoCodes={promoCodes}
            onSavePlans={(p) => { AppStorage.saveMembershipPlans(p); apiAdminSaveCms({ plans: p }).then(syncAllState).then(() => showToast('Plans Updated', '', 'success')).catch((e) => showToast('Save Failed', e?.message || 'Could not save plans.', 'error')); }}
            onSavePackages={(p) => { AppStorage.saveShopPackages(p); apiAdminSaveCms({ packages: p }).then(syncAllState).then(() => showToast('Packages Saved', '', 'success')).catch((e) => showToast('Save Failed', e?.message || 'Could not save packages.', 'error')); }}
            onSavePaymentMethods={(pm) => { AppStorage.savePaymentMethods(pm); apiAdminSaveCms({ paymentMethods: pm }).then(syncAllState).then(() => showToast('Methods Saved', '', 'success')).catch((e) => showToast('Save Failed', e?.message || 'Could not save payment methods.', 'error')); }}
            onSavePromoCodes={(pc) => { AppStorage.savePromoCodes(pc); apiAdminSaveCms({ promoCodes: pc }).then(syncAllState).then(() => showToast('Promos Saved', '', 'success')).catch((e) => showToast('Save Failed', e?.message || 'Could not save promo codes.', 'error')); }}
            howtoVideos={howtoVideos}
            onSaveHowToVideos={(v) => { AppStorage.saveHowToVideos(v); apiAdminSaveHowToVideos(v).then(syncAllState).then(() => showToast('Videos Saved', 'How-to-Work videos updated.', 'success')).catch((e) => showToast('Save Failed', e?.message || 'Could not save videos.', 'error')); }}
          />
        );
      case 'admin_support':
        return <AdminSupportView />;
      case 'admin_broadcast':
        return (
          <AdminBroadcastView
            userCount={allUsers.length}
            onSendBroadcast={async (title, msg, _group) => {
              try {
                const { apiAdminBroadcast } = await import('./services/api');
                await apiAdminBroadcast(title, msg);
                showToast('Broadcast Sent', 'Web inbox updated.', 'success');
              } catch (e: any) {
                showToast('Broadcast Failed', e?.message || 'Server error', 'error');
              }
            }}
            onToggleMaintenance={async (enabled, msg, eta) => {
              try {
                const { apiAdminSetMaintenance } = await import('./services/api');
                await apiAdminSetMaintenance({ enabled, message: msg, eta: eta || '' });
                setIsMaintenance(enabled);
                setMaintenanceMsg(msg);
                setMaintenanceEta(eta || '');
                showToast(
                  enabled ? '🚧 Maintenance ON' : '✅ Maintenance OFF',
                  enabled ? 'Visitors now see the upgrade page. Admins keep full access.' : 'The website is open to everyone again.',
                  enabled ? 'warning' : 'success'
                );
                return true;
              } catch (e: any) {
                showToast('Toggle Failed', e?.message || 'Server error', 'error');
                return false;
              }
            }}
            isMaintenance={isMaintenance}
            maintenanceMessage={maintenanceMsg}
            maintenanceEta={maintenanceEta}
          />
        );
      case 'admin_admins':
        return (
          <AdminAdminsView
            currentUser={user}
            admins={admins}
            onCreateAdmin={handleCreateAdmin}
            onUpdateAdmin={handleUpdateAdmin}
            onDeleteAdmin={handleDeleteAdmin}
          />
        );
      case 'admin_roles':
        return <AdminRolesView currentUser={user} />;
      case 'admin_security':
        return <AdminSecurityView sessions={sessions} onRevokeSession={handleRevokeSession} currentUser={user} />;
      case 'admin_database':
        return (
          <AdminDatabaseView
            currentUser={user}
            onRefresh={() => AppStorage.refreshFromServer().then(syncAllState).catch(() => {})}
          />
        );
      case 'admin_botdb':
        return <AdminBotDbView />;
      case 'admin_recovery':
        return (
          <AdminDataRecoveryView
            currentUser={user as any}
            onRefresh={() => AppStorage.refreshFromServer().then(syncAllState).catch(() => {})}
          />
        );
      case 'admin_audit':
        return <AdminAuditView logs={auditLogs} />;
      case 'admin_growth':
        return <AdminGrowthView />;
      case 'admin_payments':
        return <AdminPaymentsView />;
      case 'admin_webhook':
        return <AdminWebhookView />;

      default:
        return (
          <DashboardOverview
            user={activeUser}
            wallet={wallet}
            credits={credits}
            plan={currentPlan}
            target={target}
            impressions={impressions}
            onStartTraffic={handleStartTraffic}
            onStopTraffic={handleStopTraffic}
            onNavigate={navigateTo}
          />
        );
    }
  };

  return (
    <div className={`pn-app-shell relative isolate flex h-dvh overflow-hidden bg-slate-50 dark:bg-[#070b14] text-slate-900 dark:text-slate-100 transition-colors ${user?.role === 'admin' && !impersonatingUser ? 'pn-admin' : ''}`}>
      {/* Ambient aurora backdrop — soft, GPU-cheap depth layer behind the whole shell */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-32 h-[32rem] w-[32rem] rounded-full bg-teal-500/[0.06] dark:bg-teal-500/[0.10] blur-3xl animate-float" />
        <div className="absolute top-1/3 -right-40 h-[36rem] w-[36rem] rounded-full bg-cyan-500/[0.05] dark:bg-cyan-500/[0.09] blur-3xl animate-float" style={{ animationDelay: '1.5s' }} />
        <div className="absolute -bottom-48 left-1/4 h-[30rem] w-[30rem] rounded-full bg-emerald-500/[0.05] dark:bg-emerald-500/[0.08] blur-3xl animate-float" style={{ animationDelay: '3s' }} />
      </div>
      <CommandPalette items={commandItems} onSelect={navigateTo} />
      <div className="hidden lg:flex shrink-0">
        <Sidebar
          activeView={activeView}
          onSelectView={navigateTo}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          user={activeUser}
          credits={credits}
          isTrafficActive={target.isActive}
          badgeCounts={{
            links: normalLinks.length,
            support: supportTickets.filter((t: any) => t.status !== 'closed').length,
            admin_approvals: balanceRequests.filter((r: any) => r.status === 'pending').length,
          }}
        />
      </div>

      <MobileNav
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        activeView={activeView}
        onSelectView={navigateTo}
        user={activeUser}
        credits={credits}
        isTrafficActive={target.isActive}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        {isMaintenance && user?.role === 'admin' && (
          <div className="bg-amber-500 text-slate-950 px-3 sm:px-4 py-2 text-xs font-semibold flex items-center justify-between gap-2 shadow-xs z-40">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="min-w-0 break-words">
                🚧 Maintenance mode is ON — visitors are blocked, you still have full access.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const { apiAdminSetMaintenance } = await import('./services/api');
                    await apiAdminSetMaintenance({ enabled: false });
                    setIsMaintenance(false);
                    showToast('✅ Maintenance OFF', 'Visitors can access the site again.', 'success');
                  } catch (e) {
                    showToast('Failed', (e as { message?: string })?.message || 'Could not turn off maintenance.', 'error');
                  }
                }}
                className="rounded-md bg-slate-950 text-amber-300 px-2.5 py-1 font-bold uppercase text-[10px] cursor-pointer hover:bg-black"
              >
                Turn OFF
              </button>
              <button
                type="button"
                onClick={() => navigateTo('admin_broadcast')}
                className="text-slate-900 hover:text-black font-bold uppercase text-[10px] cursor-pointer underline"
              >
                Manage
              </button>
            </div>
          </div>
        )}

        {impersonatingUser && (
          <div className="bg-emerald-600 text-white px-3 sm:px-4 py-2 text-xs font-medium flex items-center justify-between gap-2 shadow-xs z-40">
            <div className="flex items-center gap-2 min-w-0">
              <Shield className="w-4 h-4 shrink-0" />
              <span className="truncate">
                Viewing as <strong>{impersonatingUser.name}</strong> ({impersonatingUser.email})
              </span>
            </div>
            <button
              onClick={() => {
                setImpersonatingUser(null);
                showToast('Exited Impersonation', 'Returned to admin profile.', 'info');
              }}
              className="px-2.5 py-0.5 rounded bg-white/20 hover:bg-white/30 text-white font-semibold text-[11px] cursor-pointer shrink-0 ml-2"
            >
              Exit Impersonation
            </button>
          </div>
        )}

        <TopBar
          user={activeUser}
          notifications={notifications}
          wallet={wallet}
          credits={credits}
          activeView={activeView}
          onNavigate={navigateTo}
          onToggleMobileMenu={() => setIsMobileMenuOpen(true)}
          onLogout={handleLogout}
        />

        <main className="flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-8">
          <div key={activeView} className="max-w-7xl mx-auto animate-fade-up">
            <ViewErrorBoundary>
              <Suspense fallback={<ViewLoadingFallback />}>{renderCurrentView()}</Suspense>
            </ViewErrorBoundary>
          </div>
          <BrandCredit variant="footer" className="mt-6" />
        </main>
      </div>
    </div>
  );
}

/** True when the current page is the admin surface: dedicated admin hostname or an /admin path. */
function isAdminSurface(): boolean {
  const host = window.location.hostname.toLowerCase();
  const cfg = String(import.meta.env?.VITE_ADMIN_DOMAIN || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (cfg && (host === cfg || host.endsWith('.' + cfg))) return true;
  return isAdminPath(window.location.pathname);
}

export default function App() {
  // Standalone payment surfaces (/checkout/:id and /payment/*) bypass the
  // dashboard shell entirely so a customer redirected back from the hosted
  // gateway lands on a clean, full-screen page — no sidebar, no top bar.
  if (isPaymentPath(window.location.pathname)) {
    return (
      <ToastProvider>
        <Suspense
          fallback={
            <BrandLoader fullscreen label="Opening secure checkout" />
          }
        >
          <PaymentRouter />
        </Suspense>
      </ToastProvider>
    );
  }
  return (
    <ToastProvider>
      <AppContent />
      <DialogHost />
    </ToastProvider>
  );
}