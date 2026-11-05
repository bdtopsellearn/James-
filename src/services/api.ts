/**
 * Frontend REST client — talks to api-server.js
 *
 * Every method is async. Auth uses an HMAC-signed token (stored in
 * localStorage as `pn_server_token`). On 401, listeners registered via
 * onAuthExpired() are notified so App.tsx can bounce the user back to login.
 */

import type {
  PaymentRecord,
  PaymentStatus,
  AdminPaymentRecord,
  PaymentEvent,
  PaymentStats,
  PaymentConfigInfo,
  CreatePaymentResult,
  HowToVideo,
} from '../types';

const API_PREFIX = (import.meta.env?.VITE_API_PREFIX as string) || '/api';

export const IS_ADMIN_DOMAIN = (() => {
  const host = window.location.hostname.toLowerCase();
  const configured = String(import.meta.env?.VITE_ADMIN_DOMAIN || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  return !!configured && (host === configured || host.endsWith('.' + configured));
})();

// ─── Token storage ───
const TOKEN_KEY = 'pn_server_token';

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setServerToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

// ─── Auth-expired listeners (App.tsx subscribes to force logout on 401) ───
type Listener = () => void;
const authExpiredListeners = new Set<Listener>();

export function onAuthExpired(fn: Listener): () => void {
  authExpiredListeners.add(fn);
  return () => { authExpiredListeners.delete(fn); };
}

function notifyAuthExpired(): void {
  for (const fn of authExpiredListeners) {
    try { fn(); } catch (e) { console.error('[api] auth-expired listener error:', e); }
  }
}

// ─── Maintenance listeners (server answers 503 + code MAINTENANCE for non-admins) ───
export interface MaintenanceInfo {
  enabled: boolean;
  message: string;
  eta?: string;
  updatedAt?: string | null;
}
export interface BanInfo { reason: string; email?: string; bannedAt?: string | null }
type BanListener = (info: BanInfo) => void;
const banListeners = new Set<BanListener>();
export function onBanned(fn: BanListener): () => void {
  banListeners.add(fn);
  return () => { banListeners.delete(fn); };
}

type MaintenanceListener = (info: MaintenanceInfo) => void;
const maintenanceListeners = new Set<MaintenanceListener>();

export function onMaintenance(fn: MaintenanceListener): () => void {
  maintenanceListeners.add(fn);
  return () => { maintenanceListeners.delete(fn); };
}

function notifyMaintenance(info: MaintenanceInfo): void {
  for (const fn of maintenanceListeners) {
    try { fn(info); } catch (e) { console.error('[api] maintenance listener error:', e); }
  }
}

/** Public endpoint — works without a token. Returns null if the server cannot be reached. */
export async function apiGetMaintenance(): Promise<MaintenanceInfo | null> {
  try {
    const res = await fetch(`${API_PREFIX}/maintenance`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return (data && data.maintenance) || null;
  } catch {
    return null;
  }
}

// ─── Core request ───
export interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Skip 401 → auth-expired broadcast (used by login/register themselves) */
  skipAuthBroadcast?: boolean;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  /** Raw JSON body of the error response (e.g. banReason, email) */
  data?: any;
  constructor(message: string, status: number, code?: string, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export async function apiRequest<T = unknown>(
  path: string,
  opts: ApiOptions = {}
): Promise<T> {
  const headers = new Headers(opts.headers || {});
  headers.set('Content-Type', 'application/json');

  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }

  // A request that never reached the server ("Failed to fetch": flaky mobile data, server restarting) is retried
  // up to twice. POSTs that create things (deposit, register…) are NOT retried, so nothing can be sent twice.
  const method = String(opts.method || 'GET').toUpperCase();
  const SAFE_POSTS = ['/smartlinks/remove', '/smartlinks/bulk', '/traffic/stop', '/auth/login'];
  const canRetry = method !== 'POST' || SAFE_POSTS.includes(path);
  const maxAttempts = canRetry ? 3 : 1;

  let res: Response | undefined;
  let lastNetErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      res = await fetch(`${API_PREFIX}${path}`, { ...opts, headers, body });
      // A "database busy" 503 (Firestore quota / slow query) is transient — retry safe
      // requests so the user never sees a scary quota error; the server recovers on its own.
      if (canRetry && res.status === 503 && attempt < maxAttempts - 1) {
        let code503 = '';
        try { const b = await res.clone().json(); code503 = (b && b.code) || ''; } catch { /* ignore */ }
        if (code503 === 'DB_UNAVAILABLE' || code503 === 'REQUEST_TIMEOUT') {
          await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
          continue;
        }
      }
      break;
    } catch (netErr) {
      lastNetErr = netErr;
      if (attempt < maxAttempts - 1) await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
    }
  }
  if (!res) {
    const msg = lastNetErr instanceof Error ? lastNetErr.message : 'Network error';
    throw new ApiError(`Cannot reach server: ${msg}`, 0, 'NETWORK');
  }

  // Parse JSON (or fall back to text)
  let data: any = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    data = await res.json().catch(() => null);
  } else {
    const text = await res.text().catch(() => '');
    data = text ? { error: text } : null;
  }

  if (!res.ok) {
    const message = (data && (data.error || data.message)) || `Request failed (${res.status})`;
    const code = data && data.code;

    if (res.status === 403 && code === 'BANNED' && !opts.skipAuthBroadcast) {
      for (const fn of banListeners) {
        try { fn({ reason: String(data.banReason || ''), bannedAt: data.bannedAt || null }); } catch (e) { console.error(e); }
      }
    }

    if (res.status === 503 && code === 'MAINTENANCE') {
      notifyMaintenance({
        enabled: true,
        message: (data.maintenance && data.maintenance.message) || message,
        eta: (data.maintenance && data.maintenance.eta) || '',
        updatedAt: data.maintenance ? data.maintenance.updatedAt : null,
      });
    }

    // Only a genuinely invalid/expired token should sign the user out. Any other 401
    // (wrong input, permission problems) must NOT clear the session.
    // Race guard: a slow request that was sent with an OLD token (before a fresh sign-in, e.g. Google/popup
    // login or a login in another tab) must not wipe the NEW session when it finally fails. Only sign out
    // if the token that failed is still the token we currently hold.
    if (res.status === 401 && !opts.skipAuthBroadcast && code === 'TOKEN_INVALID' && token && getToken() === token) {
      setServerToken(null);
      notifyAuthExpired();
    }

    throw new ApiError(message, res.status, code, data);
  }

  return data as T;
}

// ═══════════════════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════════════════
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  adminRole?: 'super_admin' | 'admin';
  status: 'active' | 'banned';
  banReason?: string;
  emailVerified: boolean;
  membershipPlanId: string;
  membershipExpiresAt: string;
  createdAt: string;
  lastLoginAt: string;
  trialClaimed?: boolean;
  referralCode?: string;
  isRootSuperAdmin?: boolean;
  avatar?: string;
  bio?: string;
  phone?: string;
  country?: string;
  firstName?: string;
  lastName?: string;
  telegram?: string;
  publicId?: string;
  /** Free-form profile banner colour (hex or gradient token). */
  bannerColor?: string;
  /** Social profile links shown on the public profile. */
  socials?: { facebook?: string; tiktok?: string; whatsapp?: string };
  googleLinked?: boolean;
  verificationPending?: boolean;
  /** Only present in the admin users list */
  balance?: number;
  impressionBalance?: number;
  permissions?: string[];
  settings?: {
    notifications: boolean;
    promoAlerts: boolean;
    theme: 'light' | 'dark' | 'system';
  };
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export async function apiLogin(email: string, password: string): Promise<AuthResponse> {
  const res = await apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuthBroadcast: true,
  });
  setServerToken(res.token);
  return res;
}

/** Returned by /auth/login when an admin has an authenticator (2FA) enabled. */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
  email?: string;
}

export type AdminLoginResult = AuthResponse | TwoFactorChallenge;

export function isTwoFactorChallenge(r: AdminLoginResult | null | undefined): r is TwoFactorChallenge {
  return !!(r && (r as TwoFactorChallenge).twoFactorRequired);
}

export async function apiAdminLogin(email: string, password: string): Promise<AdminLoginResult> {
  // Same /auth/login endpoint; an admin with an authenticator enabled gets a
  // challenge back instead of a session token (second step at /auth/login/2fa).
  const res = await apiRequest<AdminLoginResult>('/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuthBroadcast: true,
  });
  const token = (res as AuthResponse)?.token;
  if (token) setServerToken(token);
  return res;
}

/** Second step of the admin login — exchange the challenge token + a TOTP code. */
export async function apiAdminVerify2FA(challengeToken: string, code: string): Promise<AuthResponse> {
  const res = await apiRequest<AuthResponse>('/auth/login/2fa', {
    method: 'POST',
    body: { challengeToken, code },
    skipAuthBroadcast: true,
  });
  setServerToken(res.token);
  return res;
}

// ── Authenticator (TOTP 2FA) management ──────────────────────────────────────
export interface TwoFactorStatus {
  enabled: boolean;
  hasPending: boolean;
  enabledAt: string | null;
  recoveryCodesLeft: number;
  policyRequired: boolean;
  issuer: string;
}

export async function apiAdmin2FAStatus(): Promise<TwoFactorStatus> {
  return apiRequest<TwoFactorStatus>('/admin/2fa/status');
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUri: string;
  account: string;
  issuer: string;
}

export async function apiAdmin2FASetup(): Promise<TwoFactorSetup> {
  return apiRequest<TwoFactorSetup>('/admin/2fa/setup', { method: 'POST' });
}

export async function apiAdmin2FAEnable(code: string): Promise<{ ok: boolean; recoveryCodes: string[] }> {
  return apiRequest('/admin/2fa/enable', { method: 'POST', body: { code } });
}

export async function apiAdmin2FADisable(code: string): Promise<{ ok: boolean }> {
  return apiRequest('/admin/2fa/disable', { method: 'POST', body: { code } });
}

export async function apiAdmin2FARegenerateRecovery(code: string): Promise<{ ok: boolean; recoveryCodes: string[] }> {
  return apiRequest('/admin/2fa/recovery/regenerate', { method: 'POST', body: { code } });
}

export async function apiAdminGet2FAPolicy(): Promise<{ required: boolean }> {
  return apiRequest('/admin/settings/2fa');
}

export async function apiAdminSave2FAPolicy(required: boolean): Promise<{ required: boolean }> {
  return apiRequest('/admin/settings/2fa', { method: 'PUT', body: { required } });
}

export interface RegisterExtra {
  firstName?: string;
  lastName?: string;
  telegram?: string;
  /** built-in CAPTCHA */
  captchaToken?: string;
  captchaAnswer?: string;
  /** bot traps: hidden honeypot field + how long the form was open */
  hp?: string;
  elapsedMs?: number;
  /** Terms & Conditions acceptance (required by the server) */
  acceptedTerms?: boolean;
  termsVersion?: string;
}

/** When email verification is enabled the server answers { needsVerification } instead of a token. */
export type RegisterResponse = Partial<AuthResponse> & {
  needsVerification?: boolean;
  email?: string;
  verifyMode?: 'code' | 'link' | 'none';
  sendFailed?: boolean;
  verificationSkipped?: boolean;
};

export async function apiRegister(
  email: string,
  password: string,
  name: string,
  referralCode?: string,
  extra?: RegisterExtra
): Promise<RegisterResponse> {
  const res = await apiRequest<RegisterResponse>('/auth/register', {
    method: 'POST',
    body: { email, password, name, referralCode, ...(extra || {}) },
    skipAuthBroadcast: true,
  });
  if (res.token) setServerToken(res.token);
  return res;
}

/* ------------------------------------------------------------------ *
 * Terms & Conditions
 * ------------------------------------------------------------------ */
export interface TermsData {
  ok?: boolean;
  version: string;
  updatedAt?: string;
  content: string;
}

export const FALLBACK_TERMS: TermsData = {
  version: '1.0',
  updatedAt: '2025-01-01T00:00:00.000Z',
  content: [
    'Welcome to X AD MARKETING. By creating an account you agree to the following terms and conditions.',
    '',
    '1. ACCEPTANCE OF TERMS',
    'By registering an account you confirm that you are at least 18 years old (or have the consent of a legal guardian) and that you accept these Terms and Conditions in full.',
    '',
    '2. ACCOUNT RESPONSIBILITY',
    'You are responsible for keeping your password confidential and for all activity that happens under your account. One account per person is allowed. Sharing, selling or transferring accounts is strictly prohibited.',
    '',
    '3. ACCEPTABLE USE',
    'You agree not to use the platform for any unlawful, abusive, fraudulent or harmful activity, including attempting to manipulate impressions, traffic, balances or the delivery engine.',
    '',
    '4. IMPRESSION CREDITS AND WALLET',
    'Impression credits and wallet balance are virtual and non-transferable. Credits purchased or granted (including the free trial) are used to deliver impressions through the platform engine.',
    '',
    '5. FREE TRIAL',
    'The free welcome trial can be claimed once per account. It grants impression credits only (not withdrawable cash).',
    '',
    '6. DELIVERY AND RESULTS',
    'The platform delivers traffic through an automated engine. We do not guarantee any specific number of impressions, clicks, conversions or revenue.',
    '',
    '7. PROHIBITED CONTENT',
    'You must not submit links that point to illegal, adult, violent, hateful, malware or otherwise prohibited content.',
    '',
    '8. TERMINATION',
    'We may suspend or terminate any account that violates these terms, at any time and without prior notice.',
    '',
    '9. CHANGES TO THESE TERMS',
    'We may update these terms from time to time. Continued use of the platform after an update means you accept the new terms.',
    '',
    '10. LIMITATION OF LIABILITY',
    'The platform is provided as is. We are not liable for any indirect or consequential loss arising from the use of the service.',
  ].join('\n'),
};

export async function apiGetTerms(): Promise<TermsData> {
  try {
    const res = await apiRequest<TermsData>('/terms', { method: 'GET', skipAuthBroadcast: true });
    if (res && typeof res.content === 'string') return res;
  } catch (_) {
    /* fall through to default */
  }
  return FALLBACK_TERMS;
}

export async function apiAdminSaveTerms(content: string, version?: string): Promise<TermsData> {
  return apiRequest<TermsData>('/admin/terms', {
    method: 'PUT',
    body: { content, version },
  });
}

/* ------------------------------------------------------------------ *
 * "How to Work" tutorial videos (admin-managed)
 * ------------------------------------------------------------------ */
export interface HowToVideosPayload {
  ok?: boolean;
  updatedAt?: string;
  videos: HowToVideo[];
}

/** Public: the enabled guide videos (YouTube / Telegram links). */
export async function apiGetHowToVideos(): Promise<HowToVideo[]> {
  try {
    const res = await apiRequest<HowToVideosPayload>('/howto', { method: 'GET', skipAuthBroadcast: true });
    if (res && Array.isArray(res.videos)) return res.videos;
  } catch (_) {
    /* fall through */
  }
  return [];
}

/** Admin: replace the full "How to Work" video list. */
export async function apiAdminSaveHowToVideos(videos: HowToVideo[]): Promise<HowToVideo[]> {
  const res = await apiRequest<HowToVideosPayload>('/admin/howto', {
    method: 'PUT',
    body: { videos },
  });
  return Array.isArray(res?.videos) ? res.videos : [];
}

export interface AuthConfig {
  googleClientId: string;
  emailVerification: boolean;
  passwordReset: boolean;
  verifyMode?: 'code' | 'link' | 'none';
  captcha?: boolean;
  registrationOpen?: boolean;
  registrationMessage?: string;
}

export interface CaptchaChallenge {
  enabled: boolean;
  token: string;
  image: string;
  expiresAt: number;
}

export async function apiCaptcha(): Promise<CaptchaChallenge> {
  return apiRequest<CaptchaChallenge>('/auth/captcha', { skipAuthBroadcast: true });
}

/** Link mode: user clicked the e-mail link, now continue (password proves it is really them). */
export async function apiCheckVerified(email: string, password: string): Promise<AuthResponse> {
  const res = await apiRequest<AuthResponse>('/auth/check-verified', {
    method: 'POST',
    body: { email, password },
    skipAuthBroadcast: true,
  });
  setServerToken(res.token);
  return res;
}

export async function apiAuthConfig(): Promise<AuthConfig> {
  try {
    return await apiRequest<AuthConfig>('/auth/config', { skipAuthBroadcast: true });
  } catch {
    return { googleClientId: '', emailVerification: false, passwordReset: false, verifyMode: 'none', captcha: false };
  }
}

export async function apiVerifyEmail(email: string, code: string): Promise<AuthResponse> {
  const res = await apiRequest<AuthResponse>('/auth/verify-email', {
    method: 'POST',
    body: { email, code },
    skipAuthBroadcast: true,
  });
  setServerToken(res.token);
  return res;
}

export async function apiResendCode(email: string): Promise<void> {
  await apiRequest('/auth/resend-code', { method: 'POST', body: { email }, skipAuthBroadcast: true });
}

export async function apiForgotPassword(email: string): Promise<void> {
  await apiRequest('/auth/forgot-password', { method: 'POST', body: { email }, skipAuthBroadcast: true });
}

export async function apiResetPassword(email: string, code: string, newPassword: string): Promise<void> {
  await apiRequest('/auth/reset-password', { method: 'POST', body: { email, code, newPassword }, skipAuthBroadcast: true });
}

export async function apiGoogleLogin(credential: string, referralCode?: string): Promise<AuthResponse> {
  const res = await apiRequest<AuthResponse>('/auth/google', {
    method: 'POST',
    body: { credential, referralCode },
    skipAuthBroadcast: true,
  });
  setServerToken(res.token);
  return res;
}

// ── Firebase Auth (Google sign-in + password-reset email link) ──
export interface FirebaseClientConfig {
  enabled: boolean;
  config: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId?: string;
    messagingSenderId?: string;
  } | null;
}

export async function apiFirebaseConfig(): Promise<FirebaseClientConfig> {
  try {
    return await apiRequest<FirebaseClientConfig>('/auth/firebase-config', { skipAuthBroadcast: true });
  } catch {
    return { enabled: false, config: null };
  }
}

export async function apiFirebaseGoogle(idToken: string, referralCode?: string): Promise<AuthResponse> {
  const res = await apiRequest<AuthResponse>('/auth/firebase-google', {
    method: 'POST',
    body: { idToken, referralCode },
    skipAuthBroadcast: true,
  });
  setServerToken(res.token);
  return res;
}

export async function apiFirebasePhone(idToken: string, referralCode?: string): Promise<AuthResponse> {
  const res = await apiRequest<AuthResponse>('/auth/firebase-phone', {
    method: 'POST',
    body: { idToken, referralCode },
    skipAuthBroadcast: true,
  });
  setServerToken(res.token);
  return res;
}

export async function apiFirebaseResetPrepare(email: string): Promise<void> {
  await apiRequest('/auth/firebase-reset-prepare', { method: 'POST', body: { email }, skipAuthBroadcast: true });
}

export async function apiFirebaseResetComplete(idToken: string, newPassword: string): Promise<void> {
  await apiRequest('/auth/firebase-reset-complete', { method: 'POST', body: { idToken, newPassword }, skipAuthBroadcast: true });
}

export async function apiLogout(): Promise<void> {
  try {
    await apiRequest('/auth/logout', { method: 'POST', skipAuthBroadcast: true });
  } catch {
    // ignore — we're logging out anyway
  } finally {
    setServerToken(null);
  }
}

export async function apiUpdateSettings(settings: Partial<NonNullable<AuthUser['settings']>>): Promise<void> {
  await apiRequest('/user/profile', { method: 'PUT', body: { settings } });
}

export async function apiFetchMe(): Promise<AuthUser> {
  const res = await apiRequest<{ user: AuthUser }>('/auth/me');
  return res.user;
}

// ═══════════════════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════════════════
export interface StateResponse {
  user: Record<string, any>;
  global: Record<string, any>;
}

export async function apiFetchState(): Promise<StateResponse> {
  return apiRequest<StateResponse>('/state');
}

// ═══════════════════════════════════════════════════════════════════════
//  PROFILE
// ═══════════════════════════════════════════════════════════════════════
export interface ProfileExtraInput {
  bio?: string;
  phone?: string;
  country?: string;
  firstName?: string;
  lastName?: string;
  telegram?: string;
  bannerColor?: string;
  socials?: { facebook?: string; tiktok?: string; whatsapp?: string };
}

export async function apiUpdateProfile(
  name: string,
  avatar?: string,
  extra?: ProfileExtraInput
): Promise<AuthUser> {
  const res = await apiRequest<{ user: AuthUser }>('/user/profile', {
    method: 'PUT',
    body: { name, avatar, ...(extra || {}) },
  });
  return res.user;
}

export async function apiChangePassword(oldPassword: string, newPassword: string): Promise<void> {
  await apiRequest('/user/password', {
    method: 'POST',
    body: { oldPassword, newPassword },
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  NORMAL LINKS
// ═══════════════════════════════════════════════════════════════════════
export interface ServerNormalLink {
  id: string;
  userId: string;
  url: string;
  name: string;
  status: 'active' | 'paused' | 'error';
  lastChecked: string;
  lastCheckStatus: number;
  lastVisitAt: string;
  stats: { visits: number; ok: number; failed: number };
  addedAt: string;
}

export async function apiAddLink(name: string, url: string): Promise<ServerNormalLink> {
  const res = await apiRequest<{ link: ServerNormalLink }>('/links', {
    method: 'POST',
    body: { name, url },
  });
  return res.link;
}

export async function apiCheckLink(linkId: string): Promise<{ ok: boolean; status: number; reason: string; checkedAt: string }> {
  return apiRequest(`/links/${encodeURIComponent(linkId)}/check`, { method: 'POST' });
}

export async function apiDeleteLink(linkId: string): Promise<void> {
  await apiRequest(`/links/${encodeURIComponent(linkId)}`, { method: 'DELETE' });
}

export async function apiUpdateLink(
  linkId: string,
  patch: { name?: string; status?: 'active' | 'paused' | 'error' }
): Promise<void> {
  await apiRequest(`/links/${encodeURIComponent(linkId)}`, {
    method: 'PUT',
    body: patch,
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  SMARTLINKS
// ═══════════════════════════════════════════════════════════════════════
export async function apiAddSmartlink(
  name: string,
  url: string,
  adsterraId?: string
): Promise<{ ok: boolean; added: boolean }> {
  return apiRequest('/smartlinks', {
    method: 'POST',
    body: { name, url, adsterraId },
  });
}

export async function apiBulkAddSmartlinks(
  urls: string[]
): Promise<{ ok: boolean; added: number; dup: number; invalid: number; total: number }> {
  return apiRequest('/smartlinks/bulk', {
    method: 'POST',
    body: { urls },
  });
}

export async function apiDeleteSmartlink(urlHash: string): Promise<void> {
  await apiRequest(`/smartlinks/${encodeURIComponent(urlHash)}`, { method: 'DELETE' });
}

export async function apiRemoveSmartlinks(opts: { urls?: string[]; all?: boolean }): Promise<{ removed: number }> {
  return apiRequest('/smartlinks/remove', { method: 'POST', body: opts });
}

export async function apiSetSmartlinkStatus(urls: string[], status: 'Active' | 'Paused'): Promise<void> {
  await apiRequest('/smartlinks/status', { method: 'PUT', body: { urls, status } });
}

export async function apiGetAdsterraApiKeyStatus(): Promise<{ configured: boolean; masked: string }> {
  return apiRequest('/smartlinks/api-key', { method: 'GET' });
}

export async function apiSetAdsterraApiKey(apiKey: string): Promise<void> {
  await apiRequest('/smartlinks/api-key', {
    method: 'PUT',
    body: { apiKey },
  });
}

export async function apiSyncAdsterra(): Promise<{ ok: boolean; added: number; dup: number; total: number }> {
  return apiRequest('/smartlinks/sync', { method: 'POST' });
}

// ── Adsterra Publisher API: last-N-days performance report (admin only) ──
export interface AdsterraReportRow {
  date: string;
  impression: number;
  clicks: number;
  ctr: number;
  cpm: number;
  revenue: number;
}
export interface AdsterraReport {
  ok: boolean;
  date?: string;
  data?: {
    items: AdsterraReportRow[];
    itemCount?: number;
    dbLastUpdateTime?: string;
    dbDateTime?: string;
  };
}

export async function apiGetAdsterraReport(startDate?: string, finishDate?: string): Promise<AdsterraReport> {
  const q = new URLSearchParams();
  if (startDate) q.set('start_date', startDate);
  if (finishDate) q.set('finish_date', finishDate);
  const qs = q.toString();
  return apiRequest<AdsterraReport>(`/admin/adsterra/report${qs ? '?' + qs : ''}`);
}

export async function apiGetAdsterraSmartlinks(): Promise<any> {
  return apiRequest('/admin/adsterra/smartlinks');
}

export interface SmartlinkAnalytics {
  ok: boolean;
  timezone: string;
  days: { date: string; visits: number }[];
  today: number;
  total: number;
  average: number;
  best: { date: string; visits: number } | null;
  previousTotal: number;
}

export async function apiGetSmartlinkAnalytics(): Promise<SmartlinkAnalytics> {
  return apiRequest('/smartlinks/analytics');
}

export async function apiImportSmartlinksFromJson(url: string): Promise<{ ok: boolean; added: number; dup: number; total: number; source: string }> {
  return apiRequest('/smartlinks/import-json', {
    method: 'POST',
    body: { url },
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  TRAFFIC
// ═══════════════════════════════════════════════════════════════════════
export async function apiStartTraffic(type: 'smartlink' | 'normal'): Promise<void> {
  await apiRequest('/traffic/start', { method: 'POST', body: { type } });
}

export async function apiStopTraffic(type: 'smartlink' | 'normal'): Promise<void> {
  await apiRequest('/traffic/stop', { method: 'POST', body: { type } });
}

export async function apiSetTarget(type: 'smartlink' | 'normal', amount: number, mode?: string): Promise<void> {
  await apiRequest('/traffic/target', { method: 'POST', body: mode ? { type, amount, mode } : { type, amount } });
}

export async function apiSetTrafficMode(mode: string): Promise<void> {
  await apiRequest('/traffic/mode', { method: 'POST', body: { mode } });
}

export async function apiClearTarget(type: 'smartlink' | 'normal'): Promise<void> {
  await apiRequest('/traffic/target/clear', { method: 'POST', body: { type } });
}

// ── Per-user delivery diagnostic (is MY OWN Adsterra account ready?) ──
export interface TrafficStatus {
  ok: boolean;
  type: 'smartlink' | 'normal';
  ready: boolean;
  reason: string;
  blockCode: string | null;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  linkCount: number;
  impressionBalance: number;
  running: boolean;
  proxyReady: boolean;
  proxyReason: string | null;
  hourlyCount: number;
  dailyCount: number;
  remainingBursts: number;
}

export async function apiTrafficStatus(type: 'smartlink' | 'normal' = 'smartlink'): Promise<TrafficStatus> {
  return apiRequest<TrafficStatus>(`/traffic/status?type=${type}`);
}

// ═══════════════════════════════════════════════════════════════════════
//  WALLET
// ═══════════════════════════════════════════════════════════════════════
export async function apiSubmitDeposit(params: {
  amount: number;
  method: string;
  txnId: string;
  senderNumber?: string;
}): Promise<any> {
  return apiRequest('/wallet/deposit', { method: 'POST', body: params });
}

// ═══════════════════════════════════════════════════════════════════════
//  SHOP
// ═══════════════════════════════════════════════════════════════════════
export async function apiBuyPackage(packageId: string, promoCode?: string): Promise<any> {
  return apiRequest('/shop/buy', { method: 'POST', body: { packageId, promoCode } });
}

// ═══════════════════════════════════════════════════════════════════════
//  MEMBERSHIP
// ═══════════════════════════════════════════════════════════════════════
export async function apiClaimTrial(): Promise<any> {
  return apiRequest('/trial/claim', { method: 'POST' });
}

export async function apiBuyMembership(planId: string): Promise<any> {
  return apiRequest('/membership/buy', { method: 'POST', body: { planId } });
}

// ═══════════════════════════════════════════════════════════════════════
//  REFERRAL
// ═══════════════════════════════════════════════════════════════════════
export async function apiFetchReferral(): Promise<any> {
  const res = await apiRequest<{ referral: any }>('/referral');
  return res.referral;
}

/** Attach a referral code once (for users who signed up without one). */
export async function apiApplyReferralCode(code: string): Promise<{ ok: boolean; referrer: { id: string; name: string; code: string } }> {
  return apiRequest('/referral/apply', { method: 'POST', body: { code } });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LEADERBOARD  (daily top-3 by impressions + by earnings, resets at 00:00 Dhaka)
// ═══════════════════════════════════════════════════════════════════════════════
export interface LeaderboardUser {
  rank: number;
  userId: string;
  publicId: string;
  name: string;
  username: string;
  avatar: string;
  country: string;
  bio: string;
  impressions: number;
  earnings: number;
  /** Membership plan id (e.g. "monthly", "twomonth", "threemonth", "free"). */
  plan?: string;
  planLabel?: string;
  membershipExpiresAt?: string | null;
}
export interface AdsterraNetworkDay {
  date: string;
  revenue: number;
  impressions: number;
  clicks: number;
  cpm: number;
  ctr?: number;
}
export interface AdsterraNetworkSummary {
  ok: boolean;
  windowDays: number;
  startDate?: string;
  finishDate?: string;
  revenue: number;
  impressions: number;
  clicks: number;
  cpm: number;
  ctr: number;
  today: { date?: string; revenue: number; impressions: number; clicks: number; cpm: number };
  days: AdsterraNetworkDay[];
  updatedAt?: string | null;
  error?: string | null;
  /** True when no (valid) Adsterra publisher API key is connected for this scope. */
  needsKey?: boolean;
}
/** LIVE Adsterra figures for the signed-in user (their own publisher account). */
export interface LiveInfo {
  ok: boolean;
  error: string | null;
  needsKey: boolean;
  windowDays: number;
  revenue: number;
  impressions: number;
  clicks: number;
  cpm: number;
  todayRevenue: number;
  todayImpressions: number;
  todayCpm: number;
  updatedAt: string | null;
}
export interface LeaderboardData {
  ok: boolean;
  enabled: boolean;
  timezone: string;
  date: string;
  resetsInMs: number;
  rates: { smartlink: number; normal: number };
  totalParticipants: number;
  network?: AdsterraNetworkSummary;
  topImpressions: LeaderboardUser[];
  topEarnings: LeaderboardUser[];
  /** Ranks 4-23 shown as a single serial list below the podium. */
  nextImpressions?: LeaderboardUser[];
  nextEarnings?: LeaderboardUser[];
  me: {
    userId: string;
    impressions: number;
    earnings: number;
    impressionsRank: number | null;
    earningsRank: number | null;
    /** LIVE Adsterra revenue for this user's own publisher account. */
    live?: LiveInfo;
  };
}
export async function apiLeaderboard(): Promise<LeaderboardData> {
  return apiRequest<LeaderboardData>('/leaderboard');
}
/** Live Adsterra network performance (last N days) — real revenue, CPM, impressions. */
export async function apiAdsterraSummary(days = 7, force = false): Promise<AdsterraNetworkSummary> {
  const q = new URLSearchParams({ days: String(days) });
  if (force) q.set('force', '1');
  return apiRequest<AdsterraNetworkSummary>(`/adsterra/summary?${q.toString()}`);
}
export async function apiAdminLeaderboardSettings(): Promise<{ enabled: boolean; earn_rate_smartlink: number; earn_rate_normal: number; min_impressions: number }> {
  const res = await apiRequest<{ settings: any }>('/admin/leaderboard');
  return res.settings;
}
export async function apiAdminUpdateLeaderboardSettings(patch: Record<string, any>): Promise<{ enabled: boolean; earn_rate_smartlink: number; earn_rate_normal: number; min_impressions: number }> {
  const res = await apiRequest<{ settings: any }>('/admin/leaderboard', { method: 'PUT', body: patch });
  return res.settings;
}

/** Manually trigger the server-side data prune (trims unbounded Firestore arrays). */
export async function apiAdminPruneData(): Promise<{ ok: boolean; limits: Record<string, number> }> {
  return apiRequest<{ ok: boolean; limits: Record<string, number> }>('/admin/maintenance/prune', { method: 'POST' });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PUBLIC PROFILE  (another user's safe, shareable card)
// ═══════════════════════════════════════════════════════════════════════════════
export interface PublicProfile {
  userId: string;
  publicId: string;
  name: string;
  username: string;
  avatar: string;
  country: string;
  bio: string;
  createdAt: string | null;
  socials: { facebook?: string; tiktok?: string; whatsapp?: string };
  bannerColor: string;
  plan: string;
  planLabel: string;
  membershipExpiresAt?: string | null;
  totalImpressions: number;
}
export async function apiPublicProfile(id: string): Promise<PublicProfile> {
  const res = await apiRequest<{ profile: PublicProfile }>(`/users/${encodeURIComponent(id)}/public`);
  return res.profile;
}

// ═══════════════════════════════════════════════════════════════════════
//  SUPPORT
// ═══════════════════════════════════════════════════════════════════════
export async function apiCreateTicket(
  subject: string,
  message: string,
  priority: 'low' | 'normal' | 'urgent'
): Promise<any> {
  const res = await apiRequest<{ ticket: any }>('/support/ticket', {
    method: 'POST',
    body: { subject, message, priority },
  });
  return res.ticket;
}

export async function apiReplyTicket(ticketId: string, message: string): Promise<any> {
  const res = await apiRequest<{ ticket: any }>(
    `/support/ticket/${encodeURIComponent(ticketId)}/reply`,
    { method: 'POST', body: { message } }
  );
  return res.ticket;
}

export async function apiCloseTicket(ticketId: string): Promise<void> {
  await apiRequest(`/support/ticket/${encodeURIComponent(ticketId)}/close`, { method: 'POST' });
}

// ═══════════════════════════════════════════════════════════════════════
//  BROADCASTS (web inbox)
// ═══════════════════════════════════════════════════════════════════════
export async function apiFetchBroadcasts(): Promise<any[]> {
  const res = await apiRequest<{ broadcasts: any[] }>('/broadcasts');
  return res.broadcasts;
}

export async function apiFetchUserNotifications(): Promise<any[]> {
  const res = await apiRequest<{ notifications: any[] }>('/notifications');
  return res.notifications || [];
}

// ═══════════════════════════════════════════════════════════════════════
//  ADMIN
// ═══════════════════════════════════════════════════════════════════════
export async function apiAdminFetchUsers(): Promise<AuthUser[]> {
  const res = await apiRequest<{ users: AuthUser[] }>('/admin/users');
  return res.users;
}

export interface AdminCreateUserParams {
  email: string;
  password: string;
  name?: string;
  telegram?: string;
  membershipPlanId?: string;
  walletBalance?: number;
  impressionCredits?: number;
  role?: 'user' | 'admin';
}

export async function apiAdminCreateUser(params: AdminCreateUserParams): Promise<AuthUser> {
  const res = await apiRequest<{ ok: boolean; user: AuthUser }>('/admin/users', {
    method: 'POST',
    body: params,
  });
  return res.user;
}

export async function apiAdminDeleteUser(userId: string): Promise<void> {
  await apiRequest(`/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}

export interface TrialSettings {
  enabled: boolean;
  amount: number;
}

export async function apiAdminGetTrialSettings(): Promise<TrialSettings> {
  const res = await apiRequest<{ ok: boolean; settings: TrialSettings }>('/admin/settings/trial');
  return res.settings;
}

export async function apiAdminSaveTrialSettings(patch: Partial<TrialSettings>): Promise<TrialSettings> {
  const res = await apiRequest<{ ok: boolean; settings: TrialSettings }>('/admin/settings/trial', {
    method: 'PUT',
    body: patch,
  });
  return res.settings;
}

export async function apiAdminUpdateUser(
  userId: string,
  patch: { status?: 'active' | 'banned'; banReason?: string }
): Promise<void> {
  await apiRequest(`/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: patch,
  });
}

export async function apiAdminAdjustWallet(
  userId: string,
  amount: number,
  note: string
): Promise<{ wallet: { balance: number }; transaction: any }> {
  return apiRequest(`/admin/users/${encodeURIComponent(userId)}/wallet-adjust`, {
    method: 'POST',
    body: { amount, note },
  });
}

export interface AdminUserDetails {
  user: AuthUser;
  balance: number;
  impressionBalance: number;
  membership: any;
  normalLinks: any[];
  smartlinks: any[];
  transactions: any[];
  balanceRequests: any[];
}

export async function apiAdminFetchUserDetails(userId: string): Promise<AdminUserDetails> {
  return apiRequest<AdminUserDetails>(`/admin/users/${encodeURIComponent(userId)}/details`);
}

export async function apiAdminFetchDeposits(): Promise<any[]> {
  const res = await apiRequest<{ requests: any[] }>('/admin/deposits');
  return res.requests;
}

export async function apiAdminDecideDeposit(
  requestId: string,
  status: 'approved' | 'rejected',
  note?: string
): Promise<any> {
  return apiRequest(`/admin/deposits/${encodeURIComponent(requestId)}/decision`, {
    method: 'POST',
    body: { status, note },
  });
}

export async function apiAdminFetchProxies(): Promise<{
  proxies: any[];
  stats: Record<string, any>;
  settings: any;
}> {
  return apiRequest('/admin/proxies');
}

export async function apiAdminAddProxy(raw: string, name?: string): Promise<any> {
  const res = await apiRequest<{ proxy: any }>('/admin/proxies', {
    method: 'POST',
    body: { raw, name },
  });
  return res.proxy;
}

export async function apiAdminCheckProxy(id: string): Promise<any> {
  const res = await apiRequest<{ health: any }>(`/admin/proxies/${encodeURIComponent(id)}/check`, { method: 'POST' });
  return res.health;
}
export async function apiAdminCheckAllProxies(): Promise<any> {
  return apiRequest('/admin/proxies/check-all', { method: 'POST' });
}

export async function apiAdminToggleProxy(proxyId: string, enabled: boolean): Promise<void> {
  await apiRequest(`/admin/proxies/${encodeURIComponent(proxyId)}`, {
    method: 'PUT',
    body: { enabled },
  });
}

export async function apiAdminDeleteProxy(proxyId: string): Promise<void> {
  await apiRequest(`/admin/proxies/${encodeURIComponent(proxyId)}`, { method: 'DELETE' });
}

export async function apiAdminUpdateAutoImpressionSettings(patch: Record<string, any>): Promise<any> {
  const res = await apiRequest<{ settings: any }>('/admin/settings/auto-impression', {
    method: 'PUT',
    body: patch,
  });
  return res.settings;
}

export async function apiAdminUpdateProxySettings(patch: Record<string, any>): Promise<any> {
  const res = await apiRequest<{ settings: any }>('/admin/settings/proxy', {
    method: 'PUT',
    body: patch,
  });
  return res.settings;
}

export async function apiAdminUpdateSmartlinkSettings(patch: Record<string, any>): Promise<any> {
  const res = await apiRequest<{ settings: any }>('/admin/settings/smartlink', {
    method: 'PUT',
    body: patch,
  });
  return res.settings;
}

// ⭐ V36: Global targeting engine (country / device / browser / OS pick-rates)
export async function apiAdminGetTargeting(): Promise<{
  settings: any;
  stats: any;
  countries: Record<string, { name: string; flag: string }>;
  dimensions: { device: any[]; browser: any[]; os: any[] };
  highCpmCountries: string[];
}> {
  return apiRequest('/admin/targeting');
}

export async function apiAdminSaveTargeting(patch: Record<string, any>): Promise<any> {
  const res = await apiRequest<{ settings: any }>('/admin/settings/targeting', {
    method: 'PUT',
    body: patch,
  });
  return res.settings;
}

// ⭐ Bot embedded database — local store stats + data-routing table
export interface BotDbCollectionStat {
  name: string;
  type: string;
  entries: number;
  file_bytes: number;
}
export interface BotDbSnapshot {
  store_dir: string;
  exists: boolean;
  collections: BotDbCollectionStat[];
  collections_count: number;
  total_entries: number;
  total_file_bytes: number;
  heartbeat: any | null;
  routing: {
    critical: string[];
    local: string[];
    mirrored: string[];
    mirror_interval_ms: number;
  };
}
export async function apiAdminGetBotDb(): Promise<BotDbSnapshot> {
  return apiRequest('/admin/bot-db');
}

export async function apiAdminSaveCms(payload: { plans?: any[]; packages?: any[]; paymentMethods?: any[]; promoCodes?: any[] }): Promise<void> {
  await apiRequest('/admin/cms', { method: 'PUT', body: payload });
}

export interface SystemStats {
  cores: number; cpuLoadPercent: number;
  memTotalMb: number; memUsedMb: number; memPercent: number; processRssMb: number;
  apiUptimeSec: number; serverUptimeSec: number; node: string; firebaseReady: boolean;
}
export async function apiAdminSystem(): Promise<SystemStats> {
  return apiRequest<SystemStats>('/admin/system');
}

// ─── Ban appeals ───
export interface BanAppeal {
  id: string; userId: string; userName: string; email: string; banReason: string; message: string;
  status: 'pending' | 'approved' | 'rejected'; createdAt: string; reply?: string; decidedBy?: string; decidedAt?: string;
}
export async function apiSubmitAppeal(email: string, message: string, captchaToken: string, captchaAnswer: string): Promise<void> {
  await apiRequest('/auth/appeal', { method: 'POST', body: { email, message, captchaToken, captchaAnswer }, skipAuthBroadcast: true });
}
export async function apiAppealStatus(email: string): Promise<{ status: string; reply?: string; createdAt?: string }> {
  return apiRequest(`/auth/appeal-status?email=${encodeURIComponent(email)}`, { skipAuthBroadcast: true });
}
export async function apiAdminAppeals(): Promise<BanAppeal[]> {
  const r = await apiRequest<{ appeals: BanAppeal[] }>('/admin/appeals');
  return r.appeals || [];
}
export async function apiAdminDecideAppeal(id: string, decision: 'approve' | 'reject', reply: string): Promise<void> {
  await apiRequest(`/admin/appeals/${encodeURIComponent(id)}/decide`, { method: 'POST', body: { decision, reply } });
}

// ─── Account creation switch / sessions ───
export async function apiAdminSetRegistration(open: boolean, message?: string): Promise<{ open: boolean; message: string }> {
  const r = await apiRequest<{ registration: { open: boolean; message: string } }>('/admin/settings/registration', { method: 'PUT', body: { open, message } });
  return r.registration;
}
export async function apiAdminForceLogout(userId: string): Promise<void> {
  await apiRequest(`/admin/users/${encodeURIComponent(userId)}/force-logout`, { method: 'POST' });
}
export async function apiLogoutOthers(): Promise<void> {
  const r = await apiRequest<{ token: string }>('/auth/logout-others', { method: 'POST' });
  if (r.token) setServerToken(r.token);
}

export async function apiAdminDbDelete(collection: string, id: string): Promise<void> {
  await apiRequest('/admin/database/delete', { method: 'POST', body: { collection, id } });
}

export async function apiAdminDbSave(collection: string, id: string, doc: unknown): Promise<void> {
  await apiRequest(`/admin/database/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, { method: 'PUT', body: { doc } });
}

export async function apiAdminDbCreate(collection: string, doc: unknown): Promise<void> {
  await apiRequest(`/admin/database/${encodeURIComponent(collection)}`, { method: 'POST', body: { doc } });
}

export async function apiAdminRecoveryRestore(recoveryId: string): Promise<void> {
  await apiRequest(`/admin/recovery/${encodeURIComponent(recoveryId)}/restore`, { method: 'POST' });
}

export async function apiAdminSaveEngineSettings(settings: Record<string, unknown>): Promise<any> {
  const res = await apiRequest<{ settings: any }>('/admin/settings/engine', { method: 'PUT', body: settings });
  return res.settings;
}

export async function apiAdminSetMode(mode: string): Promise<void> {
  await apiRequest('/admin/settings/mode', { method: 'PUT', body: { mode } });
}

export async function apiAdminSetMaintenance(patch: {
  enabled?: boolean;
  message?: string;
  eta?: string;
  whitelist?: string[];
}): Promise<any> {
  const res = await apiRequest<{ maintenance: any }>('/admin/settings/maintenance', {
    method: 'PUT',
    body: patch,
  });
  return res.maintenance;
}

export async function apiAdminBroadcast(title: string, message: string): Promise<any> {
  const res = await apiRequest<{ broadcast: any }>('/admin/broadcast', {
    method: 'POST',
    body: { title, message },
  });
  return res.broadcast;
}

export async function apiAdminDeleteBroadcast(id: string): Promise<void> {
  await apiRequest(`/admin/broadcast/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export interface DeveloperLinkConfig { enabled: boolean; title: string; url: string; visibility: 'everyone' | 'users' | 'admins'; show?: boolean }
export async function apiGetDeveloperLink(): Promise<DeveloperLinkConfig> {
  const res = await apiRequest<{ link: DeveloperLinkConfig }>('/developer-link');
  return res.link;
}
export async function apiAdminSetDeveloperLink(cfg: DeveloperLinkConfig): Promise<DeveloperLinkConfig> {
  const res = await apiRequest<{ link: DeveloperLinkConfig }>('/admin/developer-link', { method: 'PUT', body: cfg });
  return res.link;
}

export async function apiAdminFetchTickets(): Promise<any[]> {
  const res = await apiRequest<{ tickets: any[] }>('/admin/support');
  return res.tickets || [];
}
export async function apiAdminReplyTicket(userId: string, ticketId: string, message: string): Promise<any> {
  const res = await apiRequest<{ ticket: any }>(`/admin/support/${encodeURIComponent(userId)}/${encodeURIComponent(ticketId)}/reply`, { method: 'POST', body: { message } });
  return res.ticket;
}
export async function apiAdminSetTicketStatus(userId: string, ticketId: string, status: string): Promise<any> {
  const res = await apiRequest<{ ticket: any }>(`/admin/support/${encodeURIComponent(userId)}/${encodeURIComponent(ticketId)}/status`, { method: 'PUT', body: { status } });
  return res.ticket;
}

export async function apiAdminFetchWorkerStatus(): Promise<any> {
  const res = await apiRequest<{ status: any }>('/admin/worker/status');
  return res.status;
}

export async function apiAdminResetWorker(): Promise<void> {
  await apiRequest('/admin/worker/reset', { method: 'POST' });
}

export interface MonitorSnapshot {
  now: number; state: 'running' | 'idle' | 'stalled'; note: string; lastEventAt: number | null; ageSec: number | null;
  eventsLastMinute: number; eventsLastHour: number; failedLastHour: number; successRate: number | null;
  buckets: number[]; runningUsers: number; activeNormalLinks: number; creditsOutstanding: number; pendingControl: boolean;
  worker?: {
    alive: boolean; heartbeatAgeSec: number | null; lastHeartbeat: number | null;
    pid: number | null; version: string | null; uptimeSec: number | null; state: string | null;
    activeSmartlinkUsers: number; activeNormalUsers: number;
  };
  system: { cores: number; cpuLoadPercent: number; memPercent: number; memUsedMb: number; memTotalMb: number; apiUptimeSec: number };
  recent: { t: number; level: 'INFO' | 'WARN'; component: string; msg: string }[];
}
export async function apiAdminMonitor(): Promise<MonitorSnapshot> {
  return apiRequest<MonitorSnapshot>('/admin/monitor');
}

export async function apiAdminFetchWorkerLogs(): Promise<any[]> {
  const res = await apiRequest<{ logs: any[] }>('/admin/worker/logs');
  return res.logs;
}

export async function apiAdminFetchAuditLogs(): Promise<any[]> {
  const res = await apiRequest<{ logs: any[] }>('/admin/audit-logs');
  return res.logs;
}

export async function apiAdminFetchAdmins(): Promise<any[]> {
  const res = await apiRequest<{ admins: any[] }>('/admin/admins');
  return res.admins;
}

export async function apiAdminCreateAdmin(params: {
  email: string;
  password: string;
  name: string;
  permissions?: string[];
}): Promise<any> {
  const res = await apiRequest<{ admin: any }>('/admin/admins', {
    method: 'POST',
    body: params,
  });
  return res.admin;
}

export async function apiAdminUpdateAdmin(adminId: string, updates: Record<string, any>): Promise<any> {
  const res = await apiRequest<{ admin: any }>(`/admin/admins/${encodeURIComponent(adminId)}`, { method: 'PUT', body: updates });
  return res.admin;
}

export async function apiAdminDeleteAdmin(adminId: string): Promise<void> {
  await apiRequest(`/admin/admins/${encodeURIComponent(adminId)}`, { method: 'DELETE' });
}

// ═══════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════
//  SUPERCHAT BD PAYMENTS
// ══════════════════════════════════════════════════════════════════════════
export async function apiCreatePayment(params: {
  amount: number;
  currency?: string;
  customer?: { name?: string; email?: string; phone?: string };
  description?: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}): Promise<CreatePaymentResult> {
  const headers: Record<string, string> = {};
  if (params.idempotencyKey) headers['Idempotency-Key'] = params.idempotencyKey;
  return apiRequest<CreatePaymentResult>('/payments/create', {
    method: 'POST',
    body: {
      amount: params.amount,
      currency: params.currency,
      customer: params.customer,
      description: params.description,
      metadata: params.metadata,
    },
    headers,
  });
}

export async function apiGetPayment(paymentId: string): Promise<PaymentRecord> {
  const res = await apiRequest<{ payment: PaymentRecord }>(`/payments/${encodeURIComponent(paymentId)}`, { skipAuthBroadcast: true });
  return res.payment;
}

export async function apiStartPayment(paymentId: string): Promise<{
  success: boolean;
  status: PaymentStatus;
  checkout_url: string | null;
  already_paid?: boolean;
  reason?: string;
  payment?: PaymentRecord;
}> {
  return apiRequest(`/payments/${encodeURIComponent(paymentId)}/start`, { method: 'POST', skipAuthBroadcast: true });
}

export async function apiPaymentStatus(paymentId: string, verify = true): Promise<PaymentRecord> {
  const res = await apiRequest<{ payment: PaymentRecord }>(
    `/payments/${encodeURIComponent(paymentId)}/status?verify=${verify ? '1' : '0'}`,
    { skipAuthBroadcast: true },
  );
  return res.payment;
}

export async function apiVerifyPayment(paymentId: string): Promise<{
  payment: PaymentRecord;
  status: PaymentStatus;
  changed: boolean;
  verify_error?: string | null;
}> {
  return apiRequest(`/payments/${encodeURIComponent(paymentId)}/verify`, { method: 'POST', skipAuthBroadcast: true });
}

// ── Admin ──
export async function apiAdminPayments(params?: {
  status?: string; q?: string; userId?: string; limit?: number;
}): Promise<{ payments: AdminPaymentRecord[]; stats: PaymentStats; config: PaymentConfigInfo }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.q) qs.set('q', params.q);
  if (params?.userId) qs.set('userId', params.userId);
  if (params?.limit) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiRequest(`/admin/payments${suffix}`);
}

export async function apiAdminPaymentDetail(id: string): Promise<{ payment: AdminPaymentRecord; events: PaymentEvent[] }> {
  return apiRequest(`/admin/payments/${encodeURIComponent(id)}`);
}

export async function apiAdminRefundPayment(id: string, reason: string): Promise<{ ok: boolean; payment: AdminPaymentRecord }> {
  return apiRequest(`/admin/payments/${encodeURIComponent(id)}/refund`, { method: 'POST', body: { reason } });
}

export async function apiAdminSuperchatConfig(): Promise<PaymentConfigInfo> {
  const res = await apiRequest<{ config: PaymentConfigInfo }>('/admin/superchat/config');
  return res.config;
}

export async function apiAdminRegisterSuperchatWebhook(url?: string): Promise<any> {
  return apiRequest('/admin/superchat/webhook', { method: 'POST', body: { url } });
}

export async function apiAdminSuperchatWebhooks(): Promise<any> {
  const res = await apiRequest<{ webhooks: any }>('/admin/superchat/webhooks');
  return res.webhooks;
}

//  SETUP (Firebase config upload — used before admin login exists)
// ═══════════════════════════════════════════════════════════════════════
export async function apiSetupInitialize(params: {
  serviceAccount: object;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  paymentMethods?: any[];
}): Promise<{ ok: boolean; projectId: string; admin: AuthUser }> {
  return apiRequest('/setup/initialize', {
    method: 'POST', body: params, skipAuthBroadcast: true,
  });
}

export async function apiSetupFirebase(serviceAccount: object): Promise<{ ok: boolean; projectId: string }> {
  return apiRequest('/setup/firebase', {
    method: 'POST',
    body: { serviceAccount },
    skipAuthBroadcast: true,
  });
}

export async function apiSetupStatus(): Promise<{
  ready: boolean;
  projectId: string | null;
  error: string | null;
  configPath: string;
  configExists: boolean;
  initAttempts: number;
}> {
  return apiRequest('/setup/status', { skipAuthBroadcast: true });
}

// ═══════════════════════════════════════════════════════════════════════
//  LEGACY COMPAT (used by old storage.ts code paths)
//  These will go away once all views are rewired.
// ═══════════════════════════════════════════════════════════════════════
export async function syncState(key: string, value: unknown): Promise<void> {
  // No-op: real sync happens via dedicated endpoints (addLink etc.).
  // We keep the export so nothing breaks during the migration.
  void key;
  void value;
}