/**
 * Firebase Web SDK helpers — Google sign-in + password-reset email.
 * The config comes from the server (/api/auth/firebase-config), so no rebuild
 * is needed when keys change. The Firebase session is never kept: we only use
 * Firebase to get a verified ID token that our own server exchanges for the
 * normal app session.
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import type { FirebaseOptions } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
  confirmPasswordReset,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from 'firebase/auth';
import type { Auth, ConfirmationResult } from 'firebase/auth';

import appletConfig from '../../firebase-applet-config.json';

let authInstance: Auth | null = null;

export function initFirebaseClient(config?: FirebaseOptions): void {
  if (authInstance) return;
  const cfg = config || (appletConfig as unknown as FirebaseOptions);
  if (!cfg || !cfg.apiKey) return;
  const app = getApps().length ? getApp() : initializeApp(cfg);
  authInstance = getAuth(app);
}

try {
  if (appletConfig && (appletConfig as any).apiKey) {
    initFirebaseClient(appletConfig as unknown as FirebaseOptions);
  }
} catch (_) {}

function requireAuth(): Auth {
  if (!authInstance) {
    if (appletConfig && (appletConfig as any).apiKey) {
      initFirebaseClient(appletConfig as unknown as FirebaseOptions);
    }
  }
  if (!authInstance) throw new Error('Firebase is not ready.');
  return authInstance;
}

/** Password-reset link parameters, captured once at load (before any URL clean-up). */
function readResetAction(): { oobCode: string } | null {
  try {
    const q = new URLSearchParams(window.location.search);
    const oobCode = q.get('oobCode');
    return q.get('mode') === 'resetPassword' && oobCode ? { oobCode } : null;
  } catch {
    return null;
  }
}
export const initialResetAction = readResetAction();

export function clearResetActionFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    ['mode', 'oobCode', 'apiKey', 'lang', 'continueUrl'].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
  } catch { /* ignore */ }
}

/**
 * Firebase only works on a real domain (it refuses a bare IP address) and on https (or localhost).
 * Returns a human message when the current address can never work, otherwise null.
 */
export function insecureAuthOrigin(): string | null {
  try {
    const { hostname, protocol } = window.location;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    if (isLocal) return null;
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
    if (isIp) return 'Google and phone sign-in need a real domain name. They cannot work on a bare IP address like ' + hostname + '. Please sign in with email, or open the site from its domain.';
    if (protocol !== 'https:') return 'Google and phone sign-in need a secure (https) address. Please open the site with https://.';
  } catch { /* ignore */ }
  return null;
}

const REDIRECT_FLAG = 'pn_google_redirect';

/**
 * Opens the Google account chooser and returns a Firebase ID token.
 * Uses a pop-up; if the browser cannot do pop-ups (many phones / in-app browsers) it falls back to a
 * full-page redirect — the result is picked up by firebaseConsumeRedirectIdToken() after the page reloads.
 * Resolves to null when the page is being redirected.
 */
export async function firebaseGoogleIdToken(): Promise<string | null> {
  const auth = requireAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const cred = await signInWithPopup(auth, provider);
    const idToken = await cred.user.getIdToken();
    await signOut(auth).catch(() => {});
    return idToken;
  } catch (err) {
    const code = (err as { code?: string })?.code || '';
    const fallback = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'];
    if (fallback.includes(code)) {
      try { sessionStorage.setItem(REDIRECT_FLAG, '1'); } catch { /* ignore */ }
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw err;
  }
}

/** Call once after the Firebase client is ready. Returns an ID token if we just came back from a Google redirect. */
export async function firebaseConsumeRedirectIdToken(): Promise<string | null> {
  let flagged = false;
  try { flagged = sessionStorage.getItem(REDIRECT_FLAG) === '1'; } catch { /* ignore */ }
  if (!flagged) return null;
  try { sessionStorage.removeItem(REDIRECT_FLAG); } catch { /* ignore */ }
  const auth = requireAuth();
  const result = await getRedirectResult(auth);
  if (!result || !result.user) return null;
  const idToken = await result.user.getIdToken();
  await signOut(auth).catch(() => {});
  return idToken;
}

export async function firebaseSendResetEmail(email: string): Promise<void> {
  await sendPasswordResetEmail(requireAuth(), email);
}

/** Returns the e-mail the reset link belongs to (throws if the link is invalid/expired). */
export async function firebaseCheckResetCode(oobCode: string): Promise<string> {
  return verifyPasswordResetCode(requireAuth(), oobCode);
}

/** Sets the new password in Firebase, signs in with it and returns a fresh ID token. */
export async function firebaseFinishReset(oobCode: string, email: string, newPassword: string): Promise<string> {
  const auth = requireAuth();
  await confirmPasswordReset(auth, oobCode, newPassword);
  const cred = await signInWithEmailAndPassword(auth, email, newPassword);
  const idToken = await cred.user.getIdToken(true);
  await signOut(auth).catch(() => {});
  return idToken;
}

/** Turns a Firebase error into a message that is fine to show to a user. null = stay silent. */
export function firebaseErrorMessage(err: unknown): string | null {
  const code = (err as { code?: string })?.code || '';
  const tag = code ? ` (${code})` : '';
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null;
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google pop-up. Allow pop-ups for this site and try again.';
    case 'auth/unauthorized-domain':
      return 'This address is not authorised for Google sign-in. In Firebase Console → Authentication → Settings → Authorized domains, add your domain (IP addresses cannot be added).' + tag;
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled in Firebase yet (Authentication → Sign-in method).' + tag;
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'auth/expired-action-code':
    case 'auth/invalid-action-code':
      return 'This reset link is invalid or has expired. Please request a new one.';
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 8 characters.';
    case 'auth/operation-not-supported-in-this-environment':
    case 'auth/web-storage-unsupported':
      return 'This browser blocks sign-in storage. Turn off private mode / allow cookies, or open the site in Chrome.' + tag;
    case 'auth/internal-error':
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      return 'Firebase rejected the request. Check FIREBASE_WEB_API_KEY in the server .env.' + tag;
    case 'auth/account-exists-with-different-credential':
      return 'An account with this email already exists. Sign in with your email and password instead.';
    default:
      return 'Something went wrong. Please try again.' + tag;
  }
}


// ─── Phone (SMS OTP) sign-in ───
let recaptcha: RecaptchaVerifier | null = null;
let phoneConfirmation: ConfirmationResult | null = null;

function disposeRecaptcha(): void {
  try { recaptcha?.clear(); } catch { /* ignore */ }
  recaptcha = null;
  document.querySelectorAll('[data-pn-recaptcha]').forEach((n) => n.remove());
}

/** Sends an SMS code. (`_containerId` is kept for compatibility — a fresh hidden host element is created every time.) */
export async function firebaseSendPhoneCode(e164Phone: string, _containerId?: string): Promise<void> {
  const auth = requireAuth();
  disposeRecaptcha();
  const host = document.createElement('div');
  host.setAttribute('data-pn-recaptcha', '1');
  host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden';
  document.body.appendChild(host);
  recaptcha = new RecaptchaVerifier(auth, host, { size: 'invisible' });
  try {
    phoneConfirmation = await signInWithPhoneNumber(auth, e164Phone, recaptcha);
  } catch (err) {
    disposeRecaptcha();
    throw err;
  }
}

/** Confirms the SMS code and returns a Firebase ID token for our server. */
export async function firebaseConfirmPhoneCode(code: string): Promise<string> {
  if (!phoneConfirmation) throw Object.assign(new Error('No pending code'), { code: 'auth/missing-verification-code' });
  const cred = await phoneConfirmation.confirm(code);
  const idToken = await cred.user.getIdToken();
  await signOut(requireAuth()).catch(() => {});
  phoneConfirmation = null;
  disposeRecaptcha();
  return idToken;
}

export function firebasePhoneErrorMessage(err: unknown): string | null {
  const code = (err as { code?: string })?.code || '';
  switch (code) {
    case 'auth/invalid-phone-number': return 'Enter a valid phone number with country code, e.g. +8801XXXXXXXXX.';
    case 'auth/missing-phone-number': return 'Please enter your phone number.';
    case 'auth/invalid-verification-code': return 'That code is incorrect. Please check and try again.';
    case 'auth/code-expired': return 'The code has expired. Please request a new one.';
    case 'auth/missing-verification-code': return 'Please request a code first.';
    case 'auth/quota-exceeded': return 'SMS limit reached. Please try again later.';
    case 'auth/captcha-check-failed':
    case 'auth/invalid-app-credential':
      return 'Security check failed. Refresh the page and try again. (If it keeps failing, the site address is not an authorised domain in Firebase.)';
    case 'auth/operation-not-allowed': return 'Phone sign-in is not enabled in Firebase yet (Authentication → Sign-in method → Phone).';
    case 'auth/billing-not-enabled': return 'SMS sending needs the Firebase Blaze (pay-as-you-go) plan. Enable billing in Firebase, or add test numbers.';
    case 'auth/user-disabled': return 'This phone number has been disabled.';
    case 'auth/missing-client-identifier': return 'Security check could not start. Refresh the page and try again.';
    default: return firebaseErrorMessage(err);
  }
}
