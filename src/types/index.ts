export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'banned';

export type AdminRole = 'super_admin' | 'admin';

export type AdminPermission =
  | 'users.view'
  | 'users.edit'
  | 'users.delete'
  | 'users.ban'
  | 'admins.view'
  | 'admins.create'
  | 'admins.edit'
  | 'admins.delete'
  | 'database.view'
  | 'database.edit'
  | 'database.delete'
  | 'database.recovery'
  | 'settings.view'
  | 'settings.edit'
  | 'analytics.view'
  | 'logs.view'
  | 'broadcasts.manage'
  | 'content.manage';

export interface AdminAccount {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  status: 'active' | 'disabled';
  permissions: AdminPermission[];
  createdAt: string;
  lastLoginAt: string;
  isRootSuperAdmin?: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  bio?: string;
  phone?: string;
  country?: string;
  firstName?: string;
  lastName?: string;
  telegram?: string;
  publicId?: string;
  /** Free-form profile banner colour (hex or CSS gradient). */
  bannerColor?: string;
  /** Social profile links shown on the public profile. */
  socials?: { facebook?: string; tiktok?: string; whatsapp?: string };
  googleLinked?: boolean;
  /** Only present in the admin users list */
  balance?: number;
  impressionBalance?: number;
  role: UserRole;
  adminRole?: AdminRole;
  status: UserStatus;
  banReason?: string;
  emailVerified: boolean;
  membershipPlanId: string;
  membershipExpiresAt: string;
  createdAt: string;
  lastLoginAt: string;
  trialClaimed?: boolean;
  referralCode?: string;
  referredBy?: string;
  dailyBurstUsed?: number;
  dailyBurstLimit?: number;
  lastBurstResetDate?: string;
  settings: {
    notifications: boolean;
    promoAlerts: boolean;
    theme: 'light' | 'dark' | 'system';
  };
}

export interface Wallet {
  userId: string;
  balance: number; // in USD / BDT
  currency: string;
  updatedAt: string;
}

export interface Credits {
  userId: string;
  balance: number;
  lifetimeUsed: number;
  totalImpressions: number;
  hourlyUsed: number;
  dailyUsed: number;
  hourlyLimit: number;
  dailyLimit: number;
  concurrentBrowsers: number;
  maxConcurrentBrowsers: number;
}

export interface NormalLink {
  id: string;
  userId: string;
  url: string;
  name: string;
  status: 'active' | 'paused' | 'error';
  lastChecked: string;
  lastCheckStatus: number;
  lastVisitAt: string;
  stats: {
    visits: number;
    ok: number;
    failed: number;
  };
  addedAt: string;
}

export interface SmartLink {
  id: string;
  userId: string;
  url: string;
  name: string;
  adsterraId?: string;
  status: 'active' | 'paused' | 'disabled';
  lastVisitAt: string;
  stats: {
    visits: number;
    ok: number;
    failed: number;
  };
  cpm: number;
  revenue: number;
  addedAt: string;
}

export interface ProxyItem {
  id: string;
  name: string;
  server: string;
  type: 'socks5' | 'http';
  country: string;
  residential: boolean;
  quotaMb: number;
  mbUsed: number;
  enabled: boolean;
  latencyMs: number;
  stats: {
    total: number;
    ok: number;
    failed: number;
    consecutiveFails: number;
    lastHealthCheck: string;
  };
  addedAt: string;
}

export interface LiveImpression {
  id: string;
  userId: string;
  linkId: string;
  linkType: 'normal' | 'smartlink';
  url: string;
  proxyUsed: string;
  proxyRegion: string;
  /** Real delivery country name (e.g. "Bangladesh") — optional for older logs. */
  proxyCountry?: string;
  /** Flag emoji for the delivery country. */
  proxyFlag?: string;
  status: 'success' | 'failed';
  dwellMs: number;
  creditsDeducted: number;
  phaseCompleted: string;
  timestamp: string;
  details?: string;
}

export type TrafficMode =
  | 'organic'
  | 'hybrid'
  | 'direct'
  | 'h4ck_organic'
  | 'hybrid_smart'
  | 'pure_search'
  | 'pure_direct';

export interface TrafficTarget {
  userId: string;
  targetAmount: number;
  currentProgress: number;
  isActive: boolean;
  mode: TrafficMode;
  hourlySpeed: number;
}

export interface Transaction {
  id: string;
  userId: string;
  type: 'deposit' | 'purchase' | 'referral' | 'admin_adjustment';
  amount: number;
  balanceAfter: number;
  description: string;
  refId?: string;
  status: 'completed' | 'pending' | 'rejected';
  createdAt: string;
}

export interface BalanceRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: number;
  method: 'bkash' | 'nagad' | 'rocket' | 'binance' | 'usdt';
  txnId: string;
  txnHash?: string;
  senderNumber?: string;
  status: 'pending' | 'approved' | 'rejected';
  adminNote?: string;
  createdAt: string;
  processedAt?: string;
}

export interface PaymentMethodItem {
  id: string;
  key: string;
  name: string;
  number: string;
  type: string;
  instructions: string;
  accountType?: string;
  note?: string;
  enabled: boolean;
  order: number;
}

export interface ShopPackageItem {
  id: string;
  credits: number;
  price: number;
  bonus: number;
  badge?: string;
  enabled: boolean;
}

export interface MembershipPlanItem {
  id: string;
  key: string;
  label: string;
  days: number;
  price: number;
  linkLimit: number;
  visitsPerLink: number;
  dailyBurstLimit: number;
  bonusCredits: number;
  features: string[];
  enabled: boolean;
}

export interface PromoCodeItem {
  id: string;
  code: string;
  discountPercent: number;
  bonusCredits: number;
  maxUses: number;
  usedCount: number;
  expiresAt: string;
  enabled: boolean;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  status: 'open' | 'in_progress' | 'pending' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'urgent';
  createdAt: string;
  updatedAt: string;
  replies: {
    id: string;
    from: 'user' | 'admin';
    authorName: string;
    message: string;
    attachments?: string[];
    createdAt: string;
  }[];
}

export interface UserSession {
  id: string;
  userId: string;
  device: string;
  browser: string;
  ip: string;
  lastActive: string;
  isCurrent: boolean;
}

export interface AuditLog {
  id: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetId?: string;
  targetType?: string;
  details: string;
  timestamp: string;
  status?: 'success' | 'warning' | 'error' | 'denied';
}

export interface DataRecoveryItem {
  id: string;
  collectionName: string;
  recordId: string;
  recordData: any;
  deletedBy: string;
  deletedByRole: string;
  deletedAt: string;
  restored: boolean;
  restoredAt?: string;
  restoredBy?: string;
}

export interface EngineSettings {
  mode: 'h4ck_organic' | 'hybrid_smart' | 'pure_search' | 'pure_direct';
  typingCpmMin: number;
  typingCpmMax: number;
  readingPauseChance: number;
  bezierMouseMovement: boolean;
  zoomEvents: boolean;
  keyboardNav: boolean;
  videoPauseEvents: boolean;
  competitorVisitChance: number;
  dataSaver: {
    blockImages: boolean;
    blockMedia: boolean;
    blockFonts: boolean;
    blockAnalytics: boolean;
    blockOtherAds: boolean;
    adsterraWhitelisted: boolean;
    blockWebSockets?: boolean;
  };
  usOnlyStrict: boolean;
  highCpmMode: boolean;
  safariRatio: number;
  dwellMinSeconds: number;
  dwellMaxSeconds: number;
  tickIntervalSeconds: number;
  smartLinkEngineActive: boolean;
  normalEngineActive: boolean;
  // ── V36: Ad click / CTR safety (mirrors the bot's auto_impression_settings) ──
  clickProbability: number;   // target CTR as a fraction (0.015 = 1.5%)
  ctrSafetyCap: number;       // hard ceiling the CTR can never exceed (0.02 = 2%)
  maxClicksPerSession: number;
  minClickDelayMs: number;
  whitelistDomains: string[];
}

export interface MaintenanceSettings {
  enabled: boolean;
  message: string;
  whitelist: string[]; // user IDs or emails
}

export interface SystemMetrics {
  cpuLoad: number;
  ramUsagePercent: number;
  freeMemMb: number;
  totalMemMb: number;
  activeBrowsers: number;
  adaptiveConcurrencyLimit: number;
  isHealthy: boolean;
}

export interface AuthSession {
  token: string;
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  adminRole?: AdminRole;
  permissions?: AdminPermission[];
  loginAt: string;
  expiresAt: string;
}

export interface InvoiceData {
  invoiceNumber: string;
  date: string;
  userName: string;
  userEmail: string;
  paymentMethod: string;
  transactionId: string;
  amountUSD: number;
  amountBDT: number;
  type: string;
  description: string;
  status: 'completed' | 'approved' | 'pending' | 'rejected';
}

// ══════════════════════════════════════════════════════════════════════════
//  SuperChat BD payments
// ══════════════════════════════════════════════════════════════════════════
export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED';

export interface PaymentRecord {
  payment_id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  checkout_url: string | null;
  description: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  created_at: string | null;
  updated_at: string | null;
  expires_at: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  environment: string;
  provider: string;
  fulfilled: boolean;
  flagged?: string | null;
}

export interface AdminPaymentRecord extends PaymentRecord {
  provider_payment_id: string | null;
  provider_status: string | null;
  provider_raw_status: string | null;
  user_id: string | null;
  customer_email: string;
  customer_phone: string;
  idempotency_key: string | null;
  paid_source: string | null;
  fulfilled_at: string | null;
  balance_after: number | null;
  credited_transaction_id: string | null;
  last_fulfillment_error: string | null;
  metadata: Record<string, string>;
  is_live: boolean;
  ip: string | null;
}

export interface PaymentEvent {
  id: string;
  paymentId: string;
  eventId: string | null;
  eventType: string;
  oldStatus: string | null;
  newStatus: string | null;
  provider: string;
  providerTransactionId: string | null;
  payloadHash: string | null;
  note: string | null;
  createdAt: string;
}

export interface PaymentStats {
  total: number;
  paid: number;
  pending: number;
  processing: number;
  failed: number;
  cancelled: number;
  expired: number;
  refunded: number;
  totalAmount: number;
  paidAmount: number;
}

export interface PaymentConfigInfo {
  provider: string;
  environment: string;
  is_live: boolean;
  base_url: string;
  api_key_set: boolean;
  api_key_hint: string;
  webhook_secret_set: boolean;
  webhook_url: string;
  app_url: string | null;
  currency: string;
  min_amount: number;
  max_amount: number;
  expiration_minutes: number;
  webhook_tolerance_sec: number;
  events: string[];
  configured: boolean;
}

export interface CreatePaymentResult {
  success: boolean;
  reused?: boolean;
  payment: PaymentRecord;
  checkout_url: string | null;
  status: PaymentStatus;
}

/* ------------------------------------------------------------------ *
 * "How to Work" tutorial videos (admin-managed)
 * ------------------------------------------------------------------ */
export interface HowToVideo {
  id: string;
  title: string;
  description?: string;
  /** YouTube or Telegram link (may be empty while awaiting a link). */
  url: string;
  /** Grouping label, e.g. "Getting Started" or "Adsterra Setup". */
  category?: string;
  enabled: boolean;
  order?: number;
}
