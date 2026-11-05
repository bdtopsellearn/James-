import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mail, Lock, User as UserIcon, Loader2, AlertCircle, ArrowRight, Gift, Shield, Sun, Moon, Eye, EyeOff, Zap, Send, KeyRound, ArrowLeft, AtSign, MailCheck, Sparkles, Inbox } from 'lucide-react';
import {
  apiLogin, apiRegister, ApiError, apiAuthConfig, apiGoogleLogin, apiVerifyEmail,
  apiResendCode, apiForgotPassword, apiResetPassword,
  apiFirebaseConfig, apiFirebaseGoogle, apiFirebaseResetPrepare, apiFirebaseResetComplete,
  apiCheckVerified, apiGetTerms, FALLBACK_TERMS,
} from '../../services/api';
import type { TermsData } from '../../services/api';
import {
  initFirebaseClient, firebaseGoogleIdToken, firebaseSendResetEmail, firebaseCheckResetCode,
  firebaseFinishReset, firebaseErrorMessage, initialResetAction, clearResetActionFromUrl,
  firebaseConsumeRedirectIdToken,
} from '../../services/firebaseAuth';
import type { AuthConfig } from '../../services/api';
import { BrandLogo } from '../../components/brand/BrandLogo';
import { BrandCredit } from '../../components/brand/BrandCredit';
import { CaptchaBox } from '../../components/auth/CaptchaBox';
import { OtpInput } from '../../components/auth/OtpInput';
import { PasswordStrength } from '../../components/auth/PasswordStrength';
import { BannedScreen } from '../../components/auth/BannedScreen';
import { RegistrationClosed } from '../../components/auth/RegistrationClosed';
import { TermsModal } from '../../components/legal/TermsModal';
import { User } from '../../types';
import { useTheme } from '../../theme';

interface UserLoginViewProps {
  onLoginSuccess: (user: User) => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

type Tab = 'login' | 'register';

export const UserLoginView: React.FC<UserLoginViewProps> = ({
  onLoginSuccess,
  theme: themeProp,
  onToggleTheme: onToggleThemeProp,
}) => {
  const [storeTheme, storeToggleTheme] = useTheme();
  const theme = themeProp ?? storeTheme;
  const onToggleTheme = onToggleThemeProp ?? storeToggleTheme;
  const [tab, setTab] = useState<Tab>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [showReferral, setShowReferral] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // new: extra sign-up fields, email-code verification, forgot password, Google
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [telegram, setTelegram] = useState('');
  const [mode, setMode] = useState<'form' | 'verify' | 'forgot' | 'reset' | 'fbreset' | 'banned'>('form');
  const [banInfo, setBanInfo] = useState<{ email: string; reason: string }>({ email: '', reason: '' });
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [cfg, setCfg] = useState<AuthConfig>({ googleClientId: '', emailVerification: false, passwordReset: false });
  const regClosed = tab === 'register' && cfg.registrationOpen === false;

  /** Shows an auth error. A BANNED answer switches to the animated "you have been banned" screen instead. */
  const showAuthError = (err: unknown, fallback: string, emailHint?: string) => {
    if (err instanceof ApiError && err.code === 'BANNED') {
      const d = (err as any).data || {};
      setBanInfo({ email: String(d.email || emailHint || ''), reason: String(d.banReason || '') });
      setError(null);
      setInfo(null);
      setMode('banned');
      return;
    }
    if (err instanceof ApiError && err.code === 'REGISTRATION_CLOSED') {
      setCfg((c) => ({ ...c, registrationOpen: false, registrationMessage: err.message }));
      setError(null);
      return;
    }
    setError(err instanceof ApiError ? err.message : fallback);
  };
  // Firebase (Google sign-in + reset link)
  const [fbEnabled, setFbEnabled] = useState(true);
  const [fbResetEmail, setFbResetEmail] = useState('');
  const [fbReady, setFbReady] = useState(true);
  // bot protection: built-in CAPTCHA, hidden honeypot field, and a "time on form" check
  const [captcha, setCaptcha] = useState<{ token: string; answer: string }>({ token: '', answer: '' });
  const [captchaReset, setCaptchaReset] = useState(0);
  const [honeypot, setHoneypot] = useState('');
  // Terms & Conditions: must be ticked before an account can be created
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [terms, setTerms] = useState<TermsData>(FALLBACK_TERMS);
  const [termsOpen, setTermsOpen] = useState(false);
  const startedAt = useRef(Date.now());
  const resetCodeRef = useRef<string | null>(initialResetAction ? initialResetAction.oobCode : null);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const referralRef = useRef('');
  referralRef.current = referralCode.trim();
  const acceptedTermsRef = useRef(false);
  acceptedTermsRef.current = acceptedTerms;
  const tabRef = useRef<Tab>('login');
  tabRef.current = tab;

  const resetForm = () => {
    setError(null);
    setInfo(null);
    startedAt.current = Date.now();
  };

  useEffect(() => {
    let alive = true;
    apiAuthConfig().then((c) => { if (alive) setCfg(c); });
    apiGetTerms().then((t) => { if (alive && t) setTerms(t); });
    return () => { alive = false; };
  }, []);

  // Capture an incoming referral code from the URL (?ref=CODE, #/?ref=CODE or
  // ?referral=CODE). Without this, referral links silently do nothing.
  useEffect(() => {
    try {
      const hash = window.location.hash || '';
      const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?')) : '';
      const pick = (q: string) => {
        try {
          const p = new URLSearchParams(q);
          return (p.get('ref') || p.get('refcode') || p.get('referral') || p.get('code') || '').trim();
        } catch { return ''; }
      };
      const ref = (pick(window.location.search) || pick(hashQuery)).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
      if (ref) {
        setReferralCode(ref);
        setShowReferral(true);
        setTab('register');
        try { localStorage.setItem('pn_pending_ref', ref); } catch { /* ignore */ }
      } else {
        // Recover a code captured earlier (e.g. the user reloaded the page).
        try {
          const saved = (localStorage.getItem('pn_pending_ref') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
          if (saved) { setReferralCode(saved); setShowReferral(true); }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }, []);

  // Firebase: load config from the server, then handle an opened reset link.
  useEffect(() => {
    let alive = true;
    (async () => {
      const fc = await apiFirebaseConfig();
      if (!alive || !fc.enabled || !fc.config) return;
      try { initFirebaseClient(fc.config); } catch { return; }
      setFbEnabled(true);
      setFbReady(true);
      // Came back from a Google full-page redirect (used when pop-ups are blocked)?
      try {
        const redirected = await firebaseConsumeRedirectIdToken();
        if (redirected && alive) {
          setLoading(true);
          try {
            const res = await apiFirebaseGoogle(redirected, referralRef.current || undefined);
            onLoginSuccess(res.user as User);
            return;
          } catch (err) {
            if (alive) showAuthError(err, 'Google sign-in failed. Please try again.');
          } finally {
            if (alive) setLoading(false);
          }
        }
      } catch (err) {
        const m = firebaseErrorMessage(err);
        if (alive && m) setError(m);
      }
      const oobCode = resetCodeRef.current;
      if (!oobCode) return;
      try {
        const mail = await firebaseCheckResetCode(oobCode);
        if (!alive) return;
        setFbResetEmail(mail);
        setEmail(mail);
        setMode('fbreset');
        setNewPassword('');
      } catch (err) {
        if (!alive) return;
        resetCodeRef.current = null;
        clearResetActionFromUrl();
        setError(firebaseErrorMessage(err) || 'This reset link is invalid or has expired. Please request a new one.');
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Google Identity Services button
  useEffect(() => {
    if (!cfg.googleClientId || mode !== 'form') return;
    let cancelled = false;
    const init = () => {
      const g = (window as any).google?.accounts?.id;
      const host = googleBtnRef.current;
      if (cancelled || !g || !host) return;
      g.initialize({
        client_id: cfg.googleClientId,
        callback: async (resp: { credential?: string }) => {
          if (!resp?.credential) return;
          if (tabRef.current === 'register' && !acceptedTermsRef.current) {
            setError('Please accept the Terms and Conditions to create an account.');
            return;
          }
          setError(null);
          setLoading(true);
          try {
            const res = await apiGoogleLogin(resp.credential, referralRef.current || undefined);
            onLoginSuccess(res.user as User);
          } catch (err) {
            showAuthError(err, 'Google sign-in failed. Try again.');
          } finally {
            setLoading(false);
          }
        },
      });
      host.innerHTML = '';
      g.renderButton(host, {
        theme: theme === 'dark' ? 'filled_black' : 'outline',
        size: 'large',
        shape: 'pill',
        text: tab === 'register' ? 'signup_with' : 'signin_with',
        width: Math.min(360, host.offsetWidth || 320),
      });
    };
    if ((window as any).google?.accounts?.id) {
      init();
      return () => { cancelled = true; };
    }
    let script = document.getElementById('gsi-client') as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = 'gsi-client';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', init);
    return () => { cancelled = true; script?.removeEventListener('load', init); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.googleClientId, mode, theme, tab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return setError('Please enter your email.');
    if (!password) return setError('Please enter your password.');

    if (tab === 'register') {
      if (!firstName.trim() && !name.trim()) return setError('Please enter your first name.');
      if (password.length < 8) return setError('Password must be at least 8 characters.');
      const tg = telegram.trim().replace(/^@/, '');
      if (tg && !/^[A-Za-z0-9_]{5,32}$/.test(tg)) return setError('Telegram username must be 5-32 letters, numbers or underscores.');
      if (cfg.captcha !== false && captcha.answer.length < 5) return setError('Please type the 5 letters from the security picture.');
      if (!acceptedTerms) return setError('Please accept the Terms and Conditions to create an account.');
    }

    setLoading(true);
    try {
      let res;
      if (tab === 'login') {
        res = await apiLogin(cleanEmail, password);
      } else {
        const fullName = `${firstName.trim()} ${lastName.trim()}`.trim() || name.trim();
        res = await apiRegister(cleanEmail, password, fullName, referralCode.trim() || undefined, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          telegram: telegram.trim().replace(/^@/, ''),
          captchaToken: captcha.token,
          captchaAnswer: captcha.answer,
          hp: honeypot,
          elapsedMs: Date.now() - startedAt.current,
          acceptedTerms: true,
          termsVersion: terms.version,
        });
        if (res.needsVerification) {
          const vm = res.verifyMode;
          if (vm) setCfg((c) => ({ ...c, verifyMode: vm }));
          setMode('verify');
          setCode('');
          setCooldown(30);
          setInfo(
            res.sendFailed
              ? 'Your account is created, but the email could not be sent yet. Tap "Resend" in a moment.'
              : res.verifyMode === 'link'
              ? `We sent a verification link to ${cleanEmail}. Open it (check Spam too), then come back and tap the button below.`
              : `We sent a 6-digit code to ${cleanEmail}. Enter it below to activate your account.`
          );
          setLoading(false);
          return;
        }
      }

      if (!res.user) {
        setError('Unexpected server response. Please try again.');
        setLoading(false);
        return;
      }

      onLoginSuccess(res.user as User);
    } catch (err) {
      if (tab === 'register') setCaptchaReset((n) => n + 1); // a used / wrong picture can never be reused
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
        setMode('verify');
        setCode('');
        setCooldown(30);
        setInfo(cfg.verifyMode === 'link'
          ? 'Your email is not verified yet. Open the link we emailed you, then tap the button below.'
          : 'Your email is not verified yet. Enter the 6-digit code we sent you (or request a new one).');
        void apiResendCode(cleanEmail).catch(() => {});
        return;
      }
      showAuthError(err, 'Unable to reach the server. Try again.', cleanEmail);
    } finally {
      setLoading(false);
    }
  };

  const cleanMail = () => email.trim().toLowerCase();

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (code.trim().length < 6) return setError('Enter the 6-digit code from your email.');
    setLoading(true);
    try {
      const res = await apiVerifyEmail(cleanMail(), code.trim());
      onLoginSuccess(res.user as User);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to reach the server. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const verifyLinkMode = cfg.verifyMode === 'link';

  // Link mode: the user clicked the e-mail link and now continues (the password proves it is really them).
  const handleCheckVerified = async (silent = false) => {
    if (!silent) setError(null);
    if (!password) { if (!silent) setError('Enter your password on the sign-in tab first, then try again.'); return; }
    if (!silent) setLoading(true);
    try {
      const res = await apiCheckVerified(cleanMail(), password);
      onLoginSuccess(res.user as User);
    } catch (err) {
      if (!silent) setError(err instanceof ApiError ? err.message : 'Unable to reach the server. Try again.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // When the person comes back from their mail app, check automatically.
  useEffect(() => {
    if (mode !== 'verify' || !verifyLinkMode) return;
    const onVisible = () => { if (document.visibilityState === 'visible') void handleCheckVerified(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, verifyLinkMode, password, email]);

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError(null);
    try {
      await apiResendCode(cleanMail());
      setCooldown(30);
      setInfo(verifyLinkMode
        ? 'A new verification link was sent. Check your inbox (and spam folder).'
        : 'A new code was sent. Check your inbox (and spam folder).');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resend the code.');
    }
  };

  const handleFirebaseGoogle = async () => {
    if (loading) return;
    if (tabRef.current === 'register' && !acceptedTermsRef.current) {
      setError('Please accept the Terms and Conditions to create an account.');
      return;
    }
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const idToken = await firebaseGoogleIdToken();
      if (!idToken) return; // the page is being redirected to Google; we finish after it comes back
      const res = await apiFirebaseGoogle(idToken, referralRef.current || undefined);
      onLoginSuccess(res.user as User);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else {
        const msg = firebaseErrorMessage(err);
        if (msg) setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };


  const sendFirebaseResetLink = async () => {
    const mail = cleanMail();
    await apiFirebaseResetPrepare(mail);
    try { await firebaseSendResetEmail(mail); } catch (err) {
      // Same answer whether or not the account exists; only surface real problems.
      const code = (err as { code?: string })?.code || '';
      if (code !== 'auth/user-not-found' && code !== 'auth/invalid-email') throw err;
    }
    setCooldown(30);
    setInfo('If an account exists for this email, a password reset link is on its way. Check your inbox (and spam folder).');
  };

  const handleFirebaseReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const oobCode = resetCodeRef.current;
    if (!oobCode) return setError('This reset link is invalid or has expired. Please request a new one.');
    if (newPassword.length < 8) return setError('Password must be at least 8 characters.');
    setLoading(true);
    try {
      const idToken = await firebaseFinishReset(oobCode, fbResetEmail, newPassword);
      await apiFirebaseResetComplete(idToken, newPassword);
      resetCodeRef.current = null;
      clearResetActionFromUrl();
      setMode('form');
      setTab('login');
      setEmail(fbResetEmail);
      setPassword('');
      setNewPassword('');
      setInfo('Password updated. Sign in with your new password.');
    } catch (err) {
      if (err instanceof ApiError) showAuthError(err, 'Unable to reach the server. Try again.'); else { const m = firebaseErrorMessage(err); if (m) setError(m); }
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!cleanMail()) return setError('Please enter your email.');
    setLoading(true);
    if (fbEnabled) {
      try {
        await sendFirebaseResetLink();
      } catch (err) {
        if (err instanceof ApiError) showAuthError(err, 'Unable to reach the server. Try again.'); else { const m = firebaseErrorMessage(err); if (m) setError(m); }
      } finally {
        setLoading(false);
      }
      return;
    }
    try {
      await apiForgotPassword(cleanMail());
      setMode('reset');
      setCode('');
      setNewPassword('');
      setCooldown(30);
      setInfo('If an account exists for this email, a 6-digit reset code is on its way.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to reach the server. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (code.trim().length < 6) return setError('Enter the 6-digit code from your email.');
    if (newPassword.length < 8) return setError('Password must be at least 8 characters.');
    setLoading(true);
    try {
      await apiResetPassword(cleanMail(), code.trim(), newPassword);
      setMode('form');
      setTab('login');
      setPassword('');
      setCode('');
      setNewPassword('');
      setInfo('Password updated. Sign in with your new password.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to reach the server. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const backToForm = () => {
    setMode('form');
    setError(null);
    setInfo(null);
    setCode('');
  };
  const switchTab = (next: Tab) => {
    setTab(next);
    resetForm();
    setPassword('');
  };

  return (
    <div className="pn-login-outer min-h-dvh flex flex-col lg:flex-row bg-slate-50 dark:bg-[#05080f] text-slate-900 dark:text-slate-100 transition-colors relative">
      {/* ambient background — clipped here (NOT on the page wrapper) so the page
          itself never becomes a nested scroll container. A nested
          `overflow-x: hidden` wrapper used to force `overflow-y: auto`, which on
          iOS Safari swallowed the scroll gesture and made the taller "Create
          account" form feel stuck / unscrollable. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="pn-ambient-blob absolute -top-32 -left-24 w-[42rem] h-[42rem] rounded-full bg-teal-400/20 dark:bg-teal-500/10 blur-3xl animate-float" />
        <div className="pn-ambient-blob absolute -bottom-40 -right-24 w-[40rem] h-[40rem] rounded-full bg-cyan-400/20 dark:bg-cyan-500/10 blur-3xl animate-float [animation-delay:1.5s]" />
        <div className="pn-ambient-blob absolute top-1/3 left-1/2 w-[32rem] h-[32rem] -translate-x-1/2 rounded-full bg-emerald-400/10 blur-3xl animate-glow" />
      </div>

      {/* Theme toggle */}
      {onToggleTheme && (
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label="Toggle light / dark mode"
          className="fixed top-4 right-4 z-50 p-2.5 rounded-full bg-white/80 dark:bg-white/5 backdrop-blur-xl border border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-amber-300 shadow-lg hover:scale-110 active:scale-95 transition-transform cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      )}

      {/* Left panel — premium branding */}
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden bg-gradient-to-br from-teal-950 via-slate-950 to-emerald-950 items-center justify-center p-12 text-white">
        <div className="absolute inset-0 pn-grid-bg pointer-events-none opacity-60" />
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-[28rem] h-[28rem] bg-teal-400/30 rounded-full blur-3xl -translate-x-32 -translate-y-32 animate-float" />
          <div className="absolute bottom-0 right-0 w-[28rem] h-[28rem] bg-cyan-400/25 rounded-full blur-3xl translate-x-32 translate-y-32 animate-float [animation-delay:1.5s]" />
          <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-emerald-400/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 animate-glow" />
        </div>
        <div className="relative z-10 max-w-lg space-y-8 animate-fade-up">
          <div className="flex items-center gap-4">
            <div className="relative inline-flex items-center justify-center w-20 h-20">
              <span className="absolute inset-0 rounded-full border border-teal-300/40 pn-pulse-ring" />
              <span className="absolute inset-1 rounded-full border border-dashed border-teal-300/40 pn-orbit" />
              <BrandLogo size="lg" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-teal-200 to-emerald-300 bg-clip-text text-transparent">
                X AD MARKETING
              </h1>
              <p className="text-[11px] uppercase tracking-[0.3em] text-teal-300/70 font-semibold">AD MARKETING · H4CK EDITION</p>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-3xl xl:text-4xl font-black leading-tight tracking-tight">
              CPM-boosted traffic that <span className="bg-gradient-to-r from-teal-300 to-emerald-300 bg-clip-text text-transparent">actually converts.</span>
            </h2>
            <p className="text-sm text-slate-300/90 leading-relaxed max-w-md">
              US-grade CPM boosters, a 5-phase human-behaviour engine and Adsterra-safe dwell — all tuned for the highest CPM your links can earn.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { k: '99.9%', v: 'Uptime' },
              { k: '30–45s', v: 'Human dwell' },
              { k: 'US · EU', v: 'CPM-boosted geo' },
            ].map((s, idx) => (
              <div key={s.v} style={{ animationDelay: `${idx * 0.12}s` }} className="rounded-2xl bg-white/[0.06] backdrop-blur border border-white/10 p-3.5 animate-fade-up">
                <div className="text-lg font-extrabold text-white tabular-nums">{s.k}</div>
                <div className="text-[11px] text-teal-200/70 mt-0.5">{s.v}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {['H4CK v30 Engine', 'Stealth Playwright', 'Smart Data Saver', 'Real-time CPM feed'].map((t) => (
              <span key={t} className="px-3 py-1.5 rounded-full text-[11px] font-medium border border-teal-300/20 bg-teal-400/5 text-teal-100/80 backdrop-blur">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form. NOTE: no `overflow-hidden` here — it used to clip the
          taller "Create account" form on phones so the submit button could never be
          reached and the page refused to scroll. The panel now grows with its content
          and the page scrolls. `my-auto` (instead of `justify-center`) is the key: it
          centres the card when there is spare room but NEVER clips the top/bottom when
          the form is taller than the screen — so "Create Account" is always reachable. */}
      <div className="w-full lg:flex-1 flex flex-col items-center px-4 py-8 sm:p-8 lg:p-12 relative">
        <div className="w-full max-w-md space-y-5 relative z-10 animate-fade-up my-auto">
          {/* Mobile brand — compact so the whole form fits without scrolling on most phones */}
          <div className="lg:hidden text-center space-y-1.5">
            <div className="relative inline-flex items-center justify-center w-16 h-16 animate-float">
              <span className="absolute inset-0 rounded-full border border-teal-400/40 pn-pulse-ring" />
              <span className="absolute inset-1 rounded-full border border-dashed border-teal-400/40 pn-orbit" />
              <BrandLogo size="lg" />
            </div>
            <h1 className="text-base font-extrabold bg-gradient-to-r from-teal-600 to-emerald-500 dark:from-teal-300 dark:to-emerald-300 bg-clip-text text-transparent tracking-tight">
              X AD MARKETING
            </h1>
            <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-semibold">AD MARKETING</p>
          </div>

          {/* Card — iOS 27 liquid glass */}
          <div className="relative rounded-[28px] lg-glass-strong bg-white/80 dark:bg-[#0a0f1c]/70 backdrop-blur-2xl border border-white/60 dark:border-white/10 p-5 sm:p-8 shadow-2xl shadow-teal-900/10 dark:shadow-black/60 overflow-hidden">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-400/70 to-transparent" />
            <div className="pointer-events-none absolute -top-24 -right-16 w-56 h-56 rounded-full bg-teal-400/10 blur-3xl" />
            <div className="relative">
            {mode !== 'banned' && !regClosed && (
            <div className="space-y-1.5 mb-6">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 text-[10px] font-bold uppercase tracking-wider border border-teal-200/70 dark:border-teal-900/60">
                <Sparkles className="w-3 h-3" /> Secure access
              </div>
              <h2 className="text-2xl font-black tracking-tight">
                {mode === 'verify' ? 'Verify your email'
                  : mode === 'forgot' ? 'Forgot password?'
                  : mode === 'reset' || mode === 'fbreset' ? 'Set a new password'
                  : tab === 'login' ? 'Welcome back' : 'Create your account'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {mode === 'verify' ? (verifyLinkMode ? 'One last step — open the link we emailed you.' : 'One last step — confirm this email belongs to you.')
                  : mode === 'forgot' ? (fbEnabled ? 'Enter your email and we will send you a password reset link.' : 'Enter your email and we will send you a reset code.')
                  : mode === 'fbreset' ? `Choose a new password for ${fbResetEmail}.`
                  : mode === 'reset' ? 'Enter the code from your email and choose a new password.'
                  : tab === 'login'
                  ? 'Sign in to manage your traffic campaigns.'
                  : 'Get instant access to the traffic engine.'}
              </p>
            </div>
            )}

            {/* Tabs */}
            {mode === 'form' && (
            <div className="relative flex gap-1 p-1 bg-slate-100 dark:bg-white/[0.04] rounded-2xl mb-6">
              {(['login', 'register'] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchTab(t)}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    tab === t
                      ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-lg shadow-teal-500/30'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {t === 'login' ? 'Sign In' : 'Register'}
                </button>
              ))}
            </div>
            )}

            {/* Info */}
            {info && (
              <div className="flex items-start gap-2 p-3 mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-200 text-xs animate-fade-up">
                <MailCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{info}</span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 mb-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-200 text-xs animate-shake">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}


            {/* Form */}
            {mode === 'form' && regClosed && (
              <RegistrationClosed message={cfg.registrationMessage} onSignIn={() => switchTab('login')} />
            )}
            {mode === 'form' && !regClosed && (<>
            <form onSubmit={handleSubmit} className="space-y-4">
              {tab === 'register' && (
                <div className="space-y-4 animate-fade-up">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">First Name</label>
                      <div className="relative">
                        <UserIcon className="pn-field-icon absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="First name"
                          autoComplete="given-name"
                          className="w-full pl-10 pr-3 py-3 text-sm rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 transition-all"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Last Name</label>
                      <div className="relative">
                        <UserIcon className="pn-field-icon absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Last name"
                          autoComplete="family-name"
                          className="w-full pl-10 pr-3 py-3 text-sm rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Telegram Username (optional)</label>
                    <div className="relative">
                      <AtSign className="pn-field-icon absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={telegram}
                        onChange={(e) => setTelegram(e.target.value)}
                        placeholder="username"
                        autoComplete="off"
                        autoCapitalize="none"
                        className="w-full pl-10 pr-3 py-3 text-sm rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 transition-all"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="pn-field-icon absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="w-full pl-10 pr-3 py-3 text-sm rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pn-field-icon absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={tab === 'register' ? 'Min 8 characters' : '••••••••'}
                    autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                    className="w-full pl-10 pr-3 py-3 text-sm rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 transition-all pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-500 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {tab === 'register' && <PasswordStrength password={password} />}
              </div>

              {tab === 'login' && (
                <div className="flex justify-end -mt-1">
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(null); setInfo(null); }}
                    className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-500 cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {tab === 'register' && (
                <>
                  {!showReferral ? (
                    <button
                      type="button"
                      onClick={() => setShowReferral(true)}
                      className="text-xs text-teal-600 dark:text-teal-400 hover:text-teal-500 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Gift className="w-3.5 h-3.5" />
                      Have a referral code?
                    </button>
                  ) : (
                    <div className="animate-fade-up">
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                        Referral Code (optional)
                      </label>
                      <div className="relative">
                        <Gift className="pn-field-icon absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={referralCode}
                          onChange={(e) => setReferralCode(e.target.value)}
                          placeholder="Enter code"
                          className="w-full pl-10 pr-3 py-3 text-sm rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 transition-all"
                        />
                      </div>
                    </div>
                  )}

                  {/* Honeypot: invisible to people, bots fill it in */}
                  <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
                    <label>Website
                      <input type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
                    </label>
                  </div>

                  {cfg.captcha !== false && (
                    <CaptchaBox onChange={setCaptcha} resetSignal={captchaReset} disabled={loading} />
                  )}

                  {/* Terms & Conditions acceptance (required) */}
                  <label className="flex items-start gap-2.5 cursor-pointer select-none group">
                    <span className="relative flex items-center justify-center mt-0.5">
                      <input
                        type="checkbox"
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                        className="peer sr-only"
                        aria-label="I accept the Terms and Conditions"
                      />
                      <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                        acceptedTerms
                          ? 'bg-gradient-to-br from-teal-500 to-emerald-600 border-teal-500'
                          : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 group-hover:border-teal-400'
                      }`}>
                        {acceptedTerms && (
                          <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        )}
                      </span>
                    </span>
                    <span className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      I accept the{' '}
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTermsOpen(true); }}
                        className="font-semibold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                      >
                        Terms and Conditions
                      </button>
                    </span>
                  </label>
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-600 bg-[length:200%_100%] hover:bg-right disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-sm shadow-lg shadow-teal-500/30 transition-all duration-500 active:scale-[0.98] cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{tab === 'login' ? 'Signing in…' : 'Creating account…'}</span>
                  </>
                ) : (
                  <>
                    <span>{tab === 'login' ? 'Sign In' : 'Create Account'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
            {(fbEnabled || Boolean(cfg.googleClientId)) && (
              <>
                <div className="flex items-center gap-3 mt-6 mb-4 text-[11px] uppercase tracking-widest text-slate-400">
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                  or continue with
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                </div>
                {fbEnabled ? (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={handleFirebaseGoogle}
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-sm font-semibold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-900 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition-all cursor-pointer"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true">
                        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/>
                        <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.1 5.5c4.3-4 6.8-9.9 6.8-16.9z"/>
                        <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"/>
                        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.4-4.9 2.3-8.8 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
                      </svg>
                      <span>{tab === 'register' ? 'Sign up with Google' : 'Continue with Google'}</span>
                    </button>
                  </div>
                ) : (
                  <div>
                    <div ref={googleBtnRef} className="flex justify-center min-h-[44px]" />
                  </div>
                )}
              </>
            )}
            </>)}

            {mode === 'banned' && (
              <BannedScreen
                email={banInfo.email}
                reason={banInfo.reason}
                onBack={() => { setMode('form'); setTab('login'); setPassword(''); setError(null); setInfo(null); }}
              />
            )}

            {mode === 'verify' && (
              verifyLinkMode ? (
              <div className="space-y-4 animate-fade-up">
                <div className="flex flex-col items-center text-center gap-2 py-2">
                  <span className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500/20 to-emerald-500/20 border border-teal-500/30 text-teal-500 animate-float">
                    <Inbox className="w-8 h-8" />
                  </span>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 break-all">{cleanMail() || 'your email'}</p>
                  <ol className="text-xs text-slate-500 dark:text-slate-400 text-left space-y-1.5 list-decimal pl-5 max-w-xs">
                    <li>Open the email we just sent (check Spam / Promotions).</li>
                    <li>Tap the verification link inside it.</li>
                    <li>Come back here and tap the button below.</li>
                  </ol>
                </div>
                <button type="button" onClick={() => handleCheckVerified(false)} disabled={loading} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-600 text-white text-sm font-bold shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40 active:scale-[0.98] transition-all disabled:opacity-60 cursor-pointer">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailCheck className="w-4 h-4" />}
                  <span>{loading ? 'Checking…' : "I've verified — Continue"}</span>
                </button>
                <div className="flex items-center justify-between text-xs">
                  <button type="button" onClick={backToForm} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer">
                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                  </button>
                  <button type="button" onClick={handleResend} disabled={cooldown > 0} className="font-semibold text-teal-600 dark:text-teal-400 disabled:opacity-50 cursor-pointer">
                    {cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend email'}
                  </button>
                </div>
              </div>
              ) : (
              <form onSubmit={handleVerify} className="space-y-4 animate-fade-up">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">6-digit code</label>
                  <OtpInput value={code} onChange={setCode} disabled={loading} autoFocus />
                </div>
                <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:brightness-110 disabled:opacity-60 text-white text-sm font-bold shadow-lg shadow-teal-500/30 cursor-pointer">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  <span>{loading ? 'Verifying…' : 'Verify & Continue'}</span>
                </button>
                <div className="flex items-center justify-between text-xs">
                  <button type="button" onClick={backToForm} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer">
                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                  </button>
                  <button type="button" onClick={handleResend} disabled={cooldown > 0} className="font-semibold text-teal-600 dark:text-teal-400 disabled:opacity-50 cursor-pointer">
                    {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                  </button>
                </div>
              </form>
              )
            )}

            {mode === 'forgot' && (
              <form onSubmit={handleForgot} className="space-y-4 animate-fade-up">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Email Address</label>
                  <div className="relative">
                    <Mail className="pn-field-icon absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className="w-full pl-10 pr-3 py-3 text-sm rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 transition-all" />
                  </div>
                </div>
                <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:brightness-110 disabled:opacity-60 text-white text-sm font-bold shadow-lg shadow-teal-500/30 cursor-pointer">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>{loading ? 'Sending…' : (fbEnabled ? 'Send Reset Link' : 'Send Reset Code')}</span>
                </button>
                <div className="flex items-center justify-between text-xs">
                  <button type="button" onClick={backToForm} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer">
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
                  </button>
                  {fbEnabled && cooldown > 0 && (
                    <span className="text-slate-400">Send again in {cooldown}s</span>
                  )}
                </div>
              </form>
            )}

            {mode === 'fbreset' && (
              <form onSubmit={handleFirebaseReset} className="space-y-4 animate-fade-up">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">New Password</label>
                  <div className="relative">
                    <Lock className="pn-field-icon absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" autoComplete="new-password" className="w-full pl-10 pr-10 py-3 text-sm rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 transition-all" />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-500 cursor-pointer">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:brightness-110 disabled:opacity-60 text-white text-sm font-bold shadow-lg shadow-teal-500/30 cursor-pointer">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  <span>{loading ? 'Updating…' : 'Update Password'}</span>
                </button>
                <button type="button" onClick={() => { resetCodeRef.current = null; clearResetActionFromUrl(); backToForm(); }} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
                </button>
              </form>
            )}


            {mode === 'reset' && (
              <form onSubmit={handleReset} className="space-y-4 animate-fade-up">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">6-digit code</label>
                  <OtpInput value={code} onChange={setCode} disabled={loading} autoFocus />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">New Password</label>
                  <div className="relative">
                    <Lock className="pn-field-icon absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" autoComplete="new-password" className="w-full pl-10 pr-3 py-3 text-sm rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 transition-all" />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-500 cursor-pointer">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:brightness-110 disabled:opacity-60 text-white text-sm font-bold shadow-lg shadow-teal-500/30 cursor-pointer">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  <span>{loading ? 'Updating…' : 'Update Password'}</span>
                </button>
                <div className="flex items-center justify-between text-xs">
                  <button type="button" onClick={backToForm} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer">
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
                  </button>
                  <button type="button" onClick={async () => { if (cooldown > 0) return; try { await apiForgotPassword(cleanMail()); setCooldown(30); setInfo('A new reset code was sent.'); } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not resend.'); } }} disabled={cooldown > 0} className="font-semibold text-teal-600 dark:text-teal-400 disabled:opacity-50 cursor-pointer">
                    {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                  </button>
                </div>
              </form>
            )}

          </div>
          </div>

          <p className="text-center text-[11px] text-slate-500 dark:text-slate-600">
            By continuing, you agree to our{' '}
            <button
              type="button"
              onClick={() => setTermsOpen(true)}
              className="font-semibold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
            >
              Terms &amp; Conditions
            </button>
            .
          </p>
          <BrandCredit variant="pill" />
        </div>
      </div>

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} terms={terms} />
    </div>
  );
};
