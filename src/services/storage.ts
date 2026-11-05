/**
 * AppStorage — synchronous facade over localStorage cache
 *
 * The backend (api-server.js) is the source of truth. This module:
 *   • Reads from a localStorage cache → synchronous, fast, view-friendly
 *   • Writes to cache AND fires async API calls (fire-and-forget with toasts)
 *   • refreshFromServer() pulls the full snapshot and populates the cache
 *
 * Views keep calling AppStorage.getX() / AppStorage.saveX() exactly as before.
 * App.tsx calls refreshFromServer() on mount and periodically.
 */

import {
  User, Wallet, Credits, NormalLink, SmartLink, ProxyItem, LiveImpression,
  TrafficTarget, Transaction, BalanceRequest, PaymentMethodItem,
  ShopPackageItem, MembershipPlanItem, PromoCodeItem, SupportTicket,
  UserSession, AuditLog, EngineSettings, AdminAccount, MaintenanceSettings,
  AdminPermission, DataRecoveryItem, HowToVideo,
} from '../types';
import {
  apiFetchState, apiAddLink, apiDeleteLink, apiUpdateLink,
  apiStartTraffic, apiStopTraffic, apiSetTarget, apiSetTrafficMode, apiClearTarget, apiClaimTrial,
  apiAddSmartlink, apiBulkAddSmartlinks,
  apiSubmitDeposit, apiBuyPackage, apiBuyMembership,
  apiCreateTicket, apiReplyTicket, apiCloseTicket,
} from './api';

// ═══════════════════════════════════════════════════════════════════════
//  STORAGE KEYS  (unchanged — keeps backward compat with any old data)
// ═══════════════════════════════════════════════════════════════════════
const STORAGE_KEYS = {
  AUTH_SESSION: 'pn_auth_session',
  USER: 'pn_user',
  ALL_USERS: 'pn_all_users',
  ADMINS: 'pn_admins',
  WALLET: 'pn_wallet',
  CREDITS: 'pn_credits',
  NORMAL_LINKS: 'pn_normal_links',
  SMARTLINKS: 'pn_smartlinks',
  PROXIES: 'pn_proxies',
  IMPRESSIONS: 'pn_impressions',
  TARGET: 'pn_target',
  TRANSACTIONS: 'pn_transactions',
  BALANCE_REQUESTS: 'pn_balance_requests',
  PAYMENT_METHODS: 'pn_payment_methods',
  SHOP_PACKAGES: 'pn_shop_packages',
  MEMBERSHIP_PLANS: 'pn_membership_plans',
  PROMO_CODES: 'pn_promo_codes',
  HOWTO_VIDEOS: 'pn_howto_videos',
  SUPPORT_TICKETS: 'pn_support_tickets',
  SESSIONS: 'pn_sessions',
  AUDIT_LOGS: 'pn_audit_logs',
  DATA_RECOVERY: 'pn_data_recovery',
  ENGINE_SETTINGS: 'pn_engine_settings',
  MAINTENANCE: 'pn_maintenance',
  THEME: 'pn_theme',
} as const;

// ═══════════════════════════════════════════════════════════════════════
//  DEFAULTS  (safe empty shapes — server fills them in on refresh)
// ═══════════════════════════════════════════════════════════════════════
const EMPTY_USER: User = {
  id: '', email: '', name: '', role: 'user', status: 'active',
  emailVerified: false, membershipPlanId: 'free',
  membershipExpiresAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  lastLoginAt: new Date().toISOString(),
  settings: { notifications: true, promoAlerts: true, theme: 'dark' },
};

const EMPTY_WALLET: Wallet = { userId: '', balance: 0, currency: 'BDT', updatedAt: new Date().toISOString() };
const EMPTY_CREDITS: Credits = {
  userId: '', balance: 0, lifetimeUsed: 0, totalImpressions: 0, hourlyUsed: 0, dailyUsed: 0,
  hourlyLimit: 0, dailyLimit: 0, concurrentBrowsers: 0, maxConcurrentBrowsers: 1,
};
const EMPTY_TARGET: TrafficTarget = {
  userId: '', targetAmount: 0, currentProgress: 0, isActive: false,
  mode: 'h4ck_organic', hourlySpeed: 0,
};
const EMPTY_ENGINE_SETTINGS: EngineSettings = {
  mode: 'h4ck_organic', typingCpmMin: 120, typingCpmMax: 280,
  readingPauseChance: 0.30, bezierMouseMovement: true, zoomEvents: true,
  keyboardNav: true, videoPauseEvents: false, competitorVisitChance: 0.08,
  dataSaver: {
    blockImages: false, blockMedia: true, blockFonts: true,
    blockAnalytics: false, blockOtherAds: false, adsterraWhitelisted: true,
    blockWebSockets: true,
  },
  usOnlyStrict: true, highCpmMode: true, safariRatio: 0.90,
  dwellMinSeconds: 30, dwellMaxSeconds: 90, tickIntervalSeconds: 30,
  smartLinkEngineActive: true, normalEngineActive: true,
  clickProbability: 0.015, ctrSafetyCap: 0.02,
  maxClicksPerSession: 1, minClickDelayMs: 30000,
  whitelistDomains: [],
};
const EMPTY_MAINTENANCE: MaintenanceSettings = {
  enabled: false, message: '', whitelist: [],
};

// ═══════════════════════════════════════════════════════════════════════
//  LOW-LEVEL STORAGE HELPERS
// ═══════════════════════════════════════════════════════════════════════
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`[storage] read ${key} failed:`, err);
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`[storage] write ${key} failed:`, err);
  }
}

/** Normalises any impression list to newest-first order (stable), capped at 100 rows.
 *  Every consumer (Live Monitor, History, Dashboard) then renders the freshest
 *  impression at the top regardless of how the server happened to store it. */
export function sortImpressionsNewestFirst(list: LiveImpression[] | undefined | null): LiveImpression[] {
  if (!Array.isArray(list)) return [];
  return [...list]
    .sort((a, b) => {
      const ta = new Date(a?.timestamp || 0).getTime() || 0;
      const tb = new Date(b?.timestamp || 0).getTime() || 0;
      return tb - ta;
    })
    .slice(0, 100);
}

// ═══════════════════════════════════════════════════════════════════════
//  REACTIVE LISTENERS
// ═══════════════════════════════════════════════════════════════════════
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToStorage(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function notify(): void {
  for (const fn of listeners) {
    try { fn(); } catch (e) { console.error('[storage] listener error:', e); }
  }
}

/** Applies the reply of /shop/buy or /membership/buy to the local cache right away (wallet, credits,
 *  ledger entry, active plan) so the UI updates instantly; the background refresh confirms it. */
function applyPurchaseResult(res: any): void {
  if (!res || typeof res !== 'object') return;
  try {
    if (typeof res.newBalance === 'number') {
      const w = read<Wallet>(STORAGE_KEYS.WALLET, EMPTY_WALLET);
      write(STORAGE_KEYS.WALLET, { ...w, balance: res.newBalance, updatedAt: new Date().toISOString() });
    }
    if (typeof res.newCredits === 'number') {
      const c = read<Credits>(STORAGE_KEYS.CREDITS, EMPTY_CREDITS);
      write(STORAGE_KEYS.CREDITS, { ...c, balance: res.newCredits });
    }
    if (res.transaction && res.transaction.id) {
      const list = read<Transaction[]>(STORAGE_KEYS.TRANSACTIONS, []);
      write(STORAGE_KEYS.TRANSACTIONS, [res.transaction, ...list.filter((t) => t.id !== res.transaction.id)]);
    }
    if (res.membershipPlanId && res.membershipExpiresAt) {
      const u = read<User>(STORAGE_KEYS.USER, EMPTY_USER);
      write(STORAGE_KEYS.USER, { ...u, membershipPlanId: res.membershipPlanId, membershipExpiresAt: res.membershipExpiresAt });
    }
  } catch (e) {
    console.warn('[storage] applyPurchaseResult failed:', e);
  }
  notify();
}

// Fire-and-forget API call wrapper with console warning on failure.
// Views don't await these — they just see the cache update immediately,
// then the next refreshFromServer() reconciles with the server.
function fireAndForget<T>(label: string, p: Promise<T>): Promise<T | null> {
  return p.catch((err) => {
    console.warn(`[storage] ${label} failed:`, err?.message || err);
    return null;
  });
}

/** Every permission an admin account can be granted (mirrors AdminPermission type). */
export const ALL_ADMIN_PERMISSIONS: AdminPermission[] = [
  'users.view', 'users.edit', 'users.delete', 'users.ban',
  'admins.view', 'admins.create', 'admins.edit', 'admins.delete',
  'database.view', 'database.edit', 'database.delete', 'database.recovery',
  'settings.view', 'settings.edit',
  'analytics.view', 'logs.view',
  'broadcasts.manage', 'content.manage',
];

// ═══════════════════════════════════════════════════════════════════════
//  PUBLIC API  (synchronous interface preserved)
// ═══════════════════════════════════════════════════════════════════════
/** The server may return {} or a partial object — always fill the gaps so Engine/Worker screens never crash. */
function mergeEngineDefaults(raw: Partial<EngineSettings> | null | undefined): EngineSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<EngineSettings>;
  return {
    ...EMPTY_ENGINE_SETTINGS,
    ...r,
    dataSaver: { ...EMPTY_ENGINE_SETTINGS.dataSaver, ...(r.dataSaver || {}) },
    whitelistDomains: Array.isArray(r.whitelistDomains) ? r.whitelistDomains : [],
  };
}

// Single-flight guard for refreshFromServer(): many views call it at once
// (mount + interval + after every action), which used to fire a burst of
// identical /state requests and make the UI feel stuck. Now concurrent callers
// share ONE in-flight request; if another is requested while it runs, exactly
// one trailing refresh is queued so the very latest data still lands.
let _refreshInFlight: Promise<void> | null = null;
let _refreshQueued = false;

export const AppStorage = {
  // ─── USER ───
  getUser: (): User => {
    const u = read<User>(STORAGE_KEYS.USER, EMPTY_USER);
    // Server records may not carry `settings` — always hand views a complete object.
    return { ...u, settings: { ...EMPTY_USER.settings, ...(u && u.settings ? u.settings : {}) } };
  },
  saveUser: (incoming: User): void => {
    // The sign-up email is permanent — never let the cached copy change it.
    const prev = read<User>(STORAGE_KEYS.USER, EMPTY_USER);
    const user: User = prev.id && prev.id === incoming.id && prev.email
      ? { ...incoming, email: prev.email }
      : incoming;
    write(STORAGE_KEYS.USER, user);
    // Keep all-users list in sync
    const all = AppStorage.getAllUsers();
    const updated = all.some((u) => u.id === user.id)
      ? all.map((u) => (u.id === user.id ? user : u))
      : [...all, user];
    write(STORAGE_KEYS.ALL_USERS, updated);
    notify();
  },

  getAllUsers: (): User[] => read<User[]>(STORAGE_KEYS.ALL_USERS, []),
  saveAllUsers: (users: User[]): void => {
    write(STORAGE_KEYS.ALL_USERS, users);
    notify();
  },

  // ─── ADMINS ───
  getAdmins: (): AdminAccount[] => read<AdminAccount[]>(STORAGE_KEYS.ADMINS, []),
  saveAdmins: (admins: AdminAccount[]): void => {
    write(STORAGE_KEYS.ADMINS, admins);
    notify();
  },

  // ─── WALLET ───
  getWallet: (): Wallet => read<Wallet>(STORAGE_KEYS.WALLET, EMPTY_WALLET),
  saveWallet: (wallet: Wallet): void => {
    write(STORAGE_KEYS.WALLET, wallet);
    notify();
  },

  // ─── CREDITS ───
  getCredits: (): Credits => read<Credits>(STORAGE_KEYS.CREDITS, EMPTY_CREDITS),
  saveCredits: (credits: Credits): void => {
    write(STORAGE_KEYS.CREDITS, credits);
    notify();
  },

  // ─── NORMAL LINKS ───
  getNormalLinks: (): NormalLink[] => read<NormalLink[]>(STORAGE_KEYS.NORMAL_LINKS, []),
  saveNormalLinks: (links: NormalLink[]): void => {
    // Diff against current to know what to send to server
    const prev = AppStorage.getNormalLinks();
    write(STORAGE_KEYS.NORMAL_LINKS, links);
    notify();

    const prevIds = new Set(prev.map((l) => l.id));
    const nextIds = new Set(links.map((l) => l.id));

    // Deleted
    for (const p of prev) {
      if (!nextIds.has(p.id)) {
        fireAndForget('deleteLink', apiDeleteLink(p.id));
      }
    }
    // Added
    for (const n of links) {
      if (!prevIds.has(n.id)) {
        // Newly created locally — send to server, then reconcile id
        fireAndForget('addLink', apiAddLink(n.name, n.url).then((serverLink) => {
          // Replace the local temp id with the server's id
          const current = AppStorage.getNormalLinks();
          const updated = current.map((l) => (l.id === n.id ? { ...serverLink } : l));
          write(STORAGE_KEYS.NORMAL_LINKS, updated);
          notify();
          return serverLink;
        }));
      } else {
        // Possibly an update — send if name/status changed
        const before = prev.find((l) => l.id === n.id);
        if (before && (before.name !== n.name || before.status !== n.status)) {
          fireAndForget('updateLink', apiUpdateLink(n.id, { name: n.name, status: n.status }));
        }
      }
    }
  },

  // ─── SMARTLINKS ───
  getSmartLinks: (): SmartLink[] => read<SmartLink[]>(STORAGE_KEYS.SMARTLINKS, []),
  saveSmartLinks: (links: SmartLink[]): void => {
    write(STORAGE_KEYS.SMARTLINKS, links);
    notify();
  },

  // ─── PROXIES ───
  getProxies: (): ProxyItem[] => read<ProxyItem[]>(STORAGE_KEYS.PROXIES, []),
  saveProxies: (proxies: ProxyItem[]): void => {
    write(STORAGE_KEYS.PROXIES, proxies);
    notify();
  },

  // ─── LIVE IMPRESSIONS ───
  getImpressions: (): LiveImpression[] =>
    sortImpressionsNewestFirst(read<LiveImpression[]>(STORAGE_KEYS.IMPRESSIONS, [])),
  addImpression: (imp: LiveImpression): void => {
    const existing = AppStorage.getImpressions();
    const updated = sortImpressionsNewestFirst([imp, ...existing]);
    write(STORAGE_KEYS.IMPRESSIONS, updated);
    notify();
  },
  setImpressions: (impressions: LiveImpression[]): void => {
    write(STORAGE_KEYS.IMPRESSIONS, sortImpressionsNewestFirst(impressions));
    notify();
  },

  // ─── TARGET ───
  getTarget: (): TrafficTarget => read<TrafficTarget>(STORAGE_KEYS.TARGET, EMPTY_TARGET),
  saveTarget: (target: TrafficTarget): void => {
    write(STORAGE_KEYS.TARGET, target);
    notify();
    // Start/stop happens via dedicated methods (see below) — not here
  },

  // ─── TRANSACTIONS ───
  getTransactions: (): Transaction[] => read<Transaction[]>(STORAGE_KEYS.TRANSACTIONS, []),
  addTransaction: (tx: Transaction): void => {
    const list = AppStorage.getTransactions();
    write(STORAGE_KEYS.TRANSACTIONS, [tx, ...list]);
    notify();
  },

  // ─── BALANCE REQUESTS ───
  getBalanceRequests: (): BalanceRequest[] => read<BalanceRequest[]>(STORAGE_KEYS.BALANCE_REQUESTS, []),
  saveBalanceRequests: (requests: BalanceRequest[]): void => {
    write(STORAGE_KEYS.BALANCE_REQUESTS, requests);
    notify();
  },

  // ─── PAYMENT METHODS ───
  getPaymentMethods: (): PaymentMethodItem[] => read<PaymentMethodItem[]>(STORAGE_KEYS.PAYMENT_METHODS, []),
  savePaymentMethods: (methods: PaymentMethodItem[]): void => {
    write(STORAGE_KEYS.PAYMENT_METHODS, methods);
    notify();
  },

  // ─── SHOP PACKAGES ───
  getShopPackages: (): ShopPackageItem[] => read<ShopPackageItem[]>(STORAGE_KEYS.SHOP_PACKAGES, []),
  saveShopPackages: (packages: ShopPackageItem[]): void => {
    write(STORAGE_KEYS.SHOP_PACKAGES, packages);
    notify();
  },

  // ─── MEMBERSHIP PLANS ───
  getMembershipPlans: (): MembershipPlanItem[] => read<MembershipPlanItem[]>(STORAGE_KEYS.MEMBERSHIP_PLANS, []),
  saveMembershipPlans: (plans: MembershipPlanItem[]): void => {
    write(STORAGE_KEYS.MEMBERSHIP_PLANS, plans);
    notify();
  },

  // ─── PROMO CODES ───
  getPromoCodes: (): PromoCodeItem[] => read<PromoCodeItem[]>(STORAGE_KEYS.PROMO_CODES, []),
  savePromoCodes: (codes: PromoCodeItem[]): void => {
    write(STORAGE_KEYS.PROMO_CODES, codes);
    notify();
  },

  // ─── HOW TO WORK VIDEOS ───
  getHowToVideos: (): HowToVideo[] => read<HowToVideo[]>(STORAGE_KEYS.HOWTO_VIDEOS, []),
  saveHowToVideos: (videos: HowToVideo[]): void => {
    write(STORAGE_KEYS.HOWTO_VIDEOS, videos);
    notify();
  },

  // ─── SUPPORT TICKETS ───
  getSupportTickets: (): SupportTicket[] => read<SupportTicket[]>(STORAGE_KEYS.SUPPORT_TICKETS, []),
  saveSupportTickets: (tickets: SupportTicket[]): void => {
    write(STORAGE_KEYS.SUPPORT_TICKETS, tickets);
    notify();
  },

  // ─── SESSIONS ───
  getSessions: (): UserSession[] => read<UserSession[]>(STORAGE_KEYS.SESSIONS, []),
  saveSessions: (sessions: UserSession[]): void => {
    write(STORAGE_KEYS.SESSIONS, sessions);
    notify();
  },

  // ─── ENGINE SETTINGS ───
  getEngineSettings: (): EngineSettings => mergeEngineDefaults(read<Partial<EngineSettings>>(STORAGE_KEYS.ENGINE_SETTINGS, EMPTY_ENGINE_SETTINGS)),
  saveEngineSettings: (settings: EngineSettings): void => {
    write(STORAGE_KEYS.ENGINE_SETTINGS, settings);
    notify();
  },

  // ─── MAINTENANCE ───
  getMaintenance: (): MaintenanceSettings => read<MaintenanceSettings>(STORAGE_KEYS.MAINTENANCE, EMPTY_MAINTENANCE),
  saveMaintenance: (settings: MaintenanceSettings): void => {
    write(STORAGE_KEYS.MAINTENANCE, settings);
    notify();
  },

  // ─── AUDIT LOGS ───
  getAuditLogs: (): AuditLog[] => read<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, []),
  addAuditLog: (log: AuditLog): void => {
    const list = AppStorage.getAuditLogs();
    write(STORAGE_KEYS.AUDIT_LOGS, [log, ...list]);
    notify();
  },
  setAuditLogs: (logs: AuditLog[]): void => {
    write(STORAGE_KEYS.AUDIT_LOGS, logs);
    notify();
  },

  // ─── DATA RECOVERY (soft-delete ledger) ───
  getRecoveryItems: (): DataRecoveryItem[] =>
    read<DataRecoveryItem[]>(STORAGE_KEYS.DATA_RECOVERY, []),

  /** Stores a copy of a deleted record so it can be restored later. */
  softDeleteRecord: (
    collectionName: string,
    recordId: string,
    recordData: unknown,
    deletedBy: string,
    deletedByRole: string
  ): void => {
    const item: DataRecoveryItem = {
      id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      collectionName,
      recordId,
      recordData,
      deletedBy,
      deletedByRole,
      deletedAt: new Date().toISOString(),
      restored: false,
    };
    write(STORAGE_KEYS.DATA_RECOVERY, [item, ...AppStorage.getRecoveryItems()]);
    notify();
  },

  /** Puts a soft-deleted record back into its collection. Returns true on success. */
  restoreRecord: (recoveryId: string, restoredBy: string): boolean => {
    const items = AppStorage.getRecoveryItems();
    const item = items.find((i) => i.id === recoveryId);
    if (!item || item.restored) return false;

    const restoreInto = <T extends { id?: string; key?: string; code?: string }>(
      list: T[],
      save: (next: T[]) => void
    ): void => {
      const rid = item.recordId;
      const exists = list.some((d) => (d.id || d.key || d.code) === rid);
      if (!exists) save([item.recordData as T, ...list]);
    };

    switch (item.collectionName) {
      case 'users': restoreInto(AppStorage.getAllUsers() as any[], AppStorage.saveAllUsers); break;
      case 'normal_links': restoreInto(AppStorage.getNormalLinks() as any[], AppStorage.saveNormalLinks); break;
      case 'smartlinks': restoreInto(AppStorage.getSmartLinks() as any[], AppStorage.saveSmartLinks); break;
      case 'proxies': restoreInto(AppStorage.getProxies() as any[], AppStorage.saveProxies); break;
      case 'balance_requests': restoreInto(AppStorage.getBalanceRequests() as any[], AppStorage.saveBalanceRequests); break;
      case 'membership_plans': restoreInto(AppStorage.getMembershipPlans() as any[], AppStorage.saveMembershipPlans); break;
      case 'shop_packages': restoreInto(AppStorage.getShopPackages() as any[], AppStorage.saveShopPackages); break;
      case 'payment_methods': restoreInto(AppStorage.getPaymentMethods() as any[], AppStorage.savePaymentMethods); break;
      case 'promo_codes': restoreInto(AppStorage.getPromoCodes() as any[], AppStorage.savePromoCodes); break;
      case 'support_tickets': restoreInto(AppStorage.getSupportTickets() as any[], AppStorage.saveSupportTickets); break;
      case 'admins': restoreInto(AppStorage.getAdmins() as any[], AppStorage.saveAdmins); break;
      case 'audit_logs': restoreInto(AppStorage.getAuditLogs() as any[], AppStorage.setAuditLogs); break;
      default: return false;
    }

    write(
      STORAGE_KEYS.DATA_RECOVERY,
      items.map((i) =>
        i.id === recoveryId
          ? { ...i, restored: true, restoredAt: new Date().toISOString(), restoredBy }
          : i
      )
    );
    notify();
    return true;
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  ACTION METHODS  (async, talk to server, then refresh cache)
  // ═══════════════════════════════════════════════════════════════════════

  /** Start traffic for the given type */
  async startTraffic(type: 'smartlink' | 'normal'): Promise<void> {
    await apiStartTraffic(type);
    await AppStorage.refreshFromServer();
  },

  /** Stop traffic */
  async stopTraffic(type: 'smartlink' | 'normal'): Promise<void> {
    await apiStopTraffic(type);
    await AppStorage.refreshFromServer();
  },

  /** Set a target for the given type (optionally persisting the engine mode) */
  async setTarget(type: 'smartlink' | 'normal', amount: number, mode?: string): Promise<void> {
    await apiSetTarget(type, amount, mode);
    await AppStorage.refreshFromServer();
  },

  /** Persist the traffic engine mode for this user */
  async setTrafficMode(mode: string): Promise<void> {
    await apiSetTrafficMode(mode);
    await AppStorage.refreshFromServer();
  },

  /** Clear the target for the given type */
  async clearTarget(type: 'smartlink' | 'normal'): Promise<void> {
    await apiClearTarget(type);
    await AppStorage.refreshFromServer();
  },

  /** Claim the one-time free trial */
  async claimTrial(): Promise<any> {
    const res = await apiClaimTrial();
    await AppStorage.refreshFromServer();
    return res;
  },

  /** Add a smartlink */
  async addSmartlink(name: string, url: string, adsterraId?: string): Promise<void> {
    await apiAddSmartlink(name, url, adsterraId);
    await AppStorage.refreshFromServer();
  },

  /** Bulk-add smartlinks */
  async bulkAddSmartlinks(urls: string[]): Promise<void> {
    await apiBulkAddSmartlinks(urls);
    await AppStorage.refreshFromServer();
  },

  /** Submit a deposit */
  async submitDeposit(params: {
    amount: number;
    method: string;
    txnId: string;
    senderNumber?: string;
  }): Promise<void> {
    await apiSubmitDeposit(params);
    await AppStorage.refreshFromServer();
  },

  /** Buy a shop package */
  async buyPackage(packageId: string, promoCode?: string): Promise<void> {
    const res = await apiBuyPackage(packageId, promoCode);
    // Speed: show the new balance / credits straight from the purchase reply, then reconcile
    // with the full snapshot in the background instead of making the buyer wait for it.
    applyPurchaseResult(res);
    void AppStorage.refreshFromServer().catch(() => {});
  },

  /** Buy a membership plan */
  async buyMembership(planId: string): Promise<void> {
    const res = await apiBuyMembership(planId);
    applyPurchaseResult(res);
    void AppStorage.refreshFromServer().catch(() => {});
  },

  /** Support ticket actions */
  async createTicket(subject: string, message: string, priority: 'low' | 'normal' | 'urgent'): Promise<void> {
    await apiCreateTicket(subject, message, priority);
    await AppStorage.refreshFromServer();
  },
  async replyTicket(ticketId: string, message: string): Promise<void> {
    await apiReplyTicket(ticketId, message);
    await AppStorage.refreshFromServer();
  },
  async closeTicket(ticketId: string): Promise<void> {
    await apiCloseTicket(ticketId);
    await AppStorage.refreshFromServer();
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  REFRESH FROM SERVER  — populates the local cache with server truth
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * Pulls the full state snapshot from api-server.js and populates
   * every localStorage key this module reads from. After this runs,
   * all synchronous getX() calls return fresh data.
   */
  async refreshFromServer(): Promise<void> {
    // Coalesce concurrent refreshes into a single network round-trip.
    if (_refreshInFlight) {
      _refreshQueued = true;
      await _refreshInFlight;
      if (_refreshInFlight) await _refreshInFlight;
      return;
    }
    _refreshInFlight = (async () => {
    const snapshot = await apiFetchState();
    const u = snapshot.user || {};
    const g = snapshot.global || {};

    // User
    if (u.pn_user) write(STORAGE_KEYS.USER, u.pn_user);
    if (u.pn_wallet) write(STORAGE_KEYS.WALLET, u.pn_wallet);
    if (u.pn_credits) write(STORAGE_KEYS.CREDITS, u.pn_credits);
    if (Array.isArray(u.pn_normal_links)) write(STORAGE_KEYS.NORMAL_LINKS, u.pn_normal_links);
    if (Array.isArray(u.pn_impressions)) write(STORAGE_KEYS.IMPRESSIONS, sortImpressionsNewestFirst(u.pn_impressions));
    if (u.pn_target) write(STORAGE_KEYS.TARGET, u.pn_target);
    if (Array.isArray(u.pn_transactions)) write(STORAGE_KEYS.TRANSACTIONS, u.pn_transactions);
    if (Array.isArray(u.pn_balance_requests)) write(STORAGE_KEYS.BALANCE_REQUESTS, u.pn_balance_requests);
    if (Array.isArray(u.pn_support_tickets)) write(STORAGE_KEYS.SUPPORT_TICKETS, u.pn_support_tickets);
    if (Array.isArray(u.pn_sessions)) write(STORAGE_KEYS.SESSIONS, u.pn_sessions);

    // Smartlinks
    if (u.pn_smartlinks && Array.isArray(u.pn_smartlinks.links)) {
      const mapped: SmartLink[] = u.pn_smartlinks.links.map((l: any, i: number) => ({
        id: `sl_${i}_${l.added_at || Date.now()}`,
        userId: u.pn_user?.id || '',
        url: l.url,
        name: l.name || 'SmartLink',
        adsterraId: l.id || undefined,
        status: String(l.status || '').toLowerCase() === 'paused' ? 'paused' : 'active',
        lastVisitAt: new Date(l.last_visit_at || Date.now()).toISOString(),
        stats: { visits: l.bot_visits || 0, ok: l.ok || 0, failed: l.failed || 0 },
        cpm: 0,
        revenue: 0,
        addedAt: new Date(l.added_at || Date.now()).toISOString(),
      }));
      write(STORAGE_KEYS.SMARTLINKS, mapped);
    }

    // Global — admin-only data
    if (Array.isArray(g.pn_all_users)) write(STORAGE_KEYS.ALL_USERS, g.pn_all_users);
    if (Array.isArray(g.pn_admins)) write(STORAGE_KEYS.ADMINS, g.pn_admins);
    if (g.pn_payment_methods) {
      const methods = Array.isArray(g.pn_payment_methods)
        ? g.pn_payment_methods
        : Object.values(g.pn_payment_methods);
      write(STORAGE_KEYS.PAYMENT_METHODS, (methods as any[]).map((m: any, i: number) => ({ ...m, key: String(m.key || m.id || `method_${i}`) })));
    }
    if (g.pn_shop_packages) {
      const pkgs = Array.isArray(g.pn_shop_packages)
        ? g.pn_shop_packages
        : Object.entries(g.pn_shop_packages).map(([id, v]: [string, any]) => ({
            id,
            credits: v.amount || 0,
            bonus: v.bonus || 0,
            price: v.price || 0,
            enabled: true,
          }));
      write(STORAGE_KEYS.SHOP_PACKAGES, pkgs);
    }
    if (g.pn_membership_plans) {
      const plans = Array.isArray(g.pn_membership_plans)
        ? g.pn_membership_plans
        : Object.entries(g.pn_membership_plans).map(([id, v]: [string, any]) => ({
            id,
            key: id,
            label: v.label || id,
            days: v.days || 30,
            price: v.price || 0,
            linkLimit: v.link_limit || 0,
            visitsPerLink: v.visits_per_link || 0,
            dailyBurstLimit: v.daily_burst_limit || 0,
            bonusCredits: v.bonus_credits || 0,
            features: Array.isArray(v.features) ? v.features : [],
            enabled: v.enabled !== false,
          }));
      write(STORAGE_KEYS.MEMBERSHIP_PLANS, plans);
    }
    if (g.pn_promo_codes) {
      const list = Array.isArray(g.pn_promo_codes)
        ? g.pn_promo_codes
        : Object.entries(g.pn_promo_codes).map(([code, v]: [string, any], i: number) => ({
            id: v.id || `promo_${i}`,
            code: v.code || code,
            // FIX: the admin panel saves camelCase promo fields and the server stores them
            // verbatim, so reading only snake_case here zeroed every promo (0% off / 0 bonus).
            // Accept both shapes.
            discountPercent: Number(v.discountPercent ?? v.discount_percent ?? 0),
            bonusCredits: Number(v.bonusCredits ?? v.bonus_balance ?? 0),
            maxUses: Number(v.maxUses ?? v.max_uses ?? 0),
            usedCount: Number(v.usedCount ?? v.used ?? 0),
            expiresAt: v.expiresAt || new Date(Date.now() + 30 * 864e5).toISOString(),
            enabled: v.enabled !== false,
          }));
      write(STORAGE_KEYS.PROMO_CODES, list);
    }
    // "How to Work" tutorial videos (admin-managed). Mirror the server list so the
    // admin editor and the user-facing screen always stay in sync.
    if (Array.isArray((g.pn_howto_videos as any)?.videos)) {
      write(STORAGE_KEYS.HOWTO_VIDEOS, (g.pn_howto_videos as any).videos);
    } else if (Array.isArray(g.pn_howto_videos)) {
      write(STORAGE_KEYS.HOWTO_VIDEOS, g.pn_howto_videos);
    }
    if (Array.isArray(g.pn_proxies)) write(STORAGE_KEYS.PROXIES, g.pn_proxies);
    if (g.pn_engine_settings && typeof g.pn_engine_settings === 'object') {
      write(STORAGE_KEYS.ENGINE_SETTINGS, mergeEngineDefaults(g.pn_engine_settings));
    }
    // V36: the bot reads `auto_impression_settings` (a different doc than the
    // website's `engine_settings`). Mirror its click / CTR-safety values back
    // into the engine form so the admin always sees the live, effective values.
    if (g.pn_auto_impression_settings && typeof g.pn_auto_impression_settings === 'object') {
      const a = g.pn_auto_impression_settings as Record<string, unknown>;
      const cur = read<Partial<EngineSettings>>(STORAGE_KEYS.ENGINE_SETTINGS, EMPTY_ENGINE_SETTINGS);
      const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
      write(STORAGE_KEYS.ENGINE_SETTINGS, mergeEngineDefaults({
        ...cur,
        clickProbability: num(a.h4ck_click_probability, cur.clickProbability ?? 0.015),
        ctrSafetyCap: num(a.h4ck_ctr_safety_cap, cur.ctrSafetyCap ?? 0.02),
        maxClicksPerSession: num(a.h4ck_max_clicks_per_session, cur.maxClicksPerSession ?? 1),
        minClickDelayMs: num(a.h4ck_min_click_delay_ms, cur.minClickDelayMs ?? 30000),
      }));
    }
    if (g.pn_maintenance) write(STORAGE_KEYS.MAINTENANCE, g.pn_maintenance);
    if (Array.isArray(g.pn_audit_logs)) write(STORAGE_KEYS.AUDIT_LOGS, g.pn_audit_logs);
    // Server is the source of truth for the recovery ledger (admins only)
    if (Array.isArray(g.pn_data_recovery)) write(STORAGE_KEYS.DATA_RECOVERY, g.pn_data_recovery);

    notify();
    })();
    try {
      await _refreshInFlight;
    } finally {
      _refreshInFlight = null;
    }
    // A caller arrived mid-flight → run exactly one trailing refresh so the
    // newest server state still reaches the UI.
    if (_refreshQueued) {
      _refreshQueued = false;
      await AppStorage.refreshFromServer();
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  SESSION (auth — kept from old code, but now nulls out server token)
  // ═══════════════════════════════════════════════════════════════════════
  clearCurrentSession: (): void => {
    try { localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION); } catch {}
    notify();
  },

  /** Wipes ALL local caches. Server data untouched. */
  resetAll: (): void => {
    // Preserve theme preference
    const theme = localStorage.getItem(STORAGE_KEYS.THEME);
    // Keep the login token too — wiping it silently signed the user out.
    let token: string | null = null;
    try { token = localStorage.getItem('pn_server_token'); } catch { /* ignore */ }
    localStorage.clear();
    if (theme) localStorage.setItem(STORAGE_KEYS.THEME, theme);
    if (token) { try { localStorage.setItem('pn_server_token', token); } catch { /* ignore */ } }
    notify();
  },
};