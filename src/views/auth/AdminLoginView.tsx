import React, { useState } from 'react';
import {
  Mail,
  Lock,
  Loader2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Shield,
  ShieldCheck,
  Sun,
  Moon,
  Eye,
  EyeOff,
  KeyRound,
  Smartphone,
  CheckCircle2,
} from 'lucide-react';
import {
  apiAdminLogin,
  apiAdminVerify2FA,
  isTwoFactorChallenge,
  ApiError,
  setServerToken,
} from '../../services/api';
import { User } from '../../types';
import { BrandCredit } from '../../components/brand/BrandCredit';
import { BrandLogo } from '../../components/brand/BrandLogo';
import { OtpInput } from '../../components/ui/OtpInput';
import { useTheme } from '../../theme';

interface AdminLoginViewProps {
  onAdminLoginSuccess: (adminUser: User) => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

const OTP_LENGTH = 6;

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  onAdminLoginSuccess,
  theme: themeProp,
  onToggleTheme: onToggleThemeProp,
}) => {
  const [storeTheme, storeToggleTheme] = useTheme();
  const theme = themeProp ?? storeTheme;
  const onToggleTheme = onToggleThemeProp ?? storeToggleTheme;

  const [step, setStep] = useState<'credentials' | 'totp'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ── 2FA state ──
  const [challengeToken, setChallengeToken] = useState('');
  const [code, setCode] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return setError('Please enter your admin email.');
    if (!password) return setError('Please enter your password.');

    setLoading(true);
    try {
      const res = await apiAdminLogin(cleanEmail, password);

      // Authenticator required → move to the second step.
      if (isTwoFactorChallenge(res)) {
        setChallengeToken(res.challengeToken);
        setCode('');
        setRecoveryCode('');
        setRecoveryMode(false);
        setStep('totp');
        setNotice('Enter the 6-digit code from your authenticator app.');
        setLoading(false);
        return;
      }

      // Reject normal users from the admin login
      if (res.user.role !== 'admin') {
        // apiAdminLogin already stored the token — drop it, or a normal user stays "signed in" on the admin page after a reload.
        setServerToken(null);
        setError('This account does not have administrator privileges.');
        setLoading(false);
        return;
      }

      onAdminLoginSuccess(res.user as User);
    } catch (err) {
      const msg = err instanceof ApiError
        ? err.message
        : 'Unable to reach the server. Try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (rawCode: string) => {
    const value = String(rawCode || '').trim();
    if (!value) return setError('Enter your authenticator code.');
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const res = await apiAdminVerify2FA(challengeToken, value);
      if (res.user.role !== 'admin') {
        setServerToken(null);
        setError('This account does not have administrator privileges.');
        return;
      }
      onAdminLoginSuccess(res.user as User);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Unable to verify the code. Try again.';
      setError(msg);
      setCode('');
      setRecoveryCode('');
      // An expired challenge must send the admin back to step one.
      if (err instanceof ApiError && err.code === 'CHALLENGE_INVALID') {
        setStep('credentials');
        setChallengeToken('');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    submitCode(recoveryMode ? recoveryCode : code);
  };

  const backToCredentials = () => {
    setStep('credentials');
    setChallengeToken('');
    setError(null);
    setNotice(null);
    setCode('');
    setRecoveryCode('');
    setRecoveryMode(false);
  };

  const otpComplete = code.length === OTP_LENGTH;

  return (
    <div className="min-h-dvh flex items-center bg-slate-100 dark:bg-black text-slate-900 dark:text-slate-100 px-6 py-10 relative overflow-x-hidden transition-colors">
      {/* Theme toggle */}
      {onToggleTheme && (
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label="Toggle light / dark mode"
          className="fixed top-4 right-4 z-50 p-2.5 rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-amber-300 shadow-lg hover:scale-110 active:scale-95 transition-transform cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      )}

      {/* Ambient animated glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-rose-400/25 dark:bg-rose-500/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-amber-300/30 dark:bg-amber-500/10 rounded-full blur-3xl animate-float [animation-delay:1.5s]" />
      </div>

      <div className="w-full max-w-md space-y-6 relative z-10 animate-fade-up my-auto">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="relative inline-flex items-center justify-center w-28 h-28">
            <span className="absolute inset-0 rounded-full border border-rose-400/40 pn-pulse-ring" />
            <span className="absolute inset-1 rounded-full border border-dashed border-amber-400/40 pn-orbit" />
            <BrandLogo size="lg" />
            <span className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-rose-600 border-2 border-white dark:border-black flex items-center justify-center shadow-lg">
              {step === 'totp' ? <ShieldCheck className="w-4 h-4 text-white" /> : <Shield className="w-4 h-4 text-white" />}
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-rose-600 to-amber-500 dark:from-rose-300 dark:to-amber-300 bg-clip-text text-transparent">
              {step === 'totp' ? 'Two-Factor Verification' : 'Administrator Access'}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {step === 'totp'
                ? 'Confirm it’s really you to continue'
                : 'Master Operations Center — Restricted Area'}
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="lg-glass-strong lg-spec rounded-3xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-2xl shadow-slate-300/50 dark:shadow-black/60">
          {error && (
            <div className="flex items-start gap-2 p-3 mb-5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-200 text-xs animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}
          {notice && !error && (
            <div className="flex items-start gap-2 p-3 mb-5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{notice}</span>
            </div>
          )}

          {step === 'credentials' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-500 mb-1.5">
                  Admin Email
                </label>
                <div className="relative">
                  <Mail className="pn-field-icon absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@example.com"
                    autoComplete="email"
                    className="w-full pl-10 pr-3 py-3 text-sm rounded-xl bg-slate-50 dark:bg-black border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-700 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/30 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-500 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pn-field-icon absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full pl-10 pr-3 py-3 text-sm rounded-xl bg-slate-50 dark:bg-black border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-700 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/30 transition-all pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 bg-[length:200%_100%] hover:bg-right disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-sm shadow-lg shadow-rose-500/30 transition-all duration-500 active:scale-[0.98] cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Authenticating…</span>
                  </>
                ) : (
                  <>
                    <span>Enter Control Center</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-5">
              {/* Authenticator illustration */}
              <div className="flex flex-col items-center text-center gap-3">
                <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-500/15 to-amber-500/15 border border-rose-300/40 dark:border-rose-500/30 flex items-center justify-center">
                  <Smartphone className="w-7 h-7 text-rose-600 dark:text-rose-300" />
                  <span className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-950 flex items-center justify-center">
                    <KeyRound className="w-3.5 h-3.5 text-white" />
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[19rem] leading-relaxed">
                  Open your authenticator app and enter the current 6-digit code for{' '}
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{email.trim().toLowerCase()}</span>.
                </p>
              </div>

              {!recoveryMode ? (
                <OtpInput
                  value={code}
                  onChange={setCode}
                  onComplete={(c) => submitCode(c)}
                  length={OTP_LENGTH}
                  disabled={loading}
                  autoFocus
                />
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-500 mb-1.5">
                    Recovery code
                  </label>
                  <div className="relative">
                    <KeyRound className="pn-field-icon absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                      placeholder="XXXXX-XXXXX"
                      autoComplete="off"
                      autoFocus
                      className="w-full pl-10 pr-3 py-3 text-sm font-mono tracking-widest rounded-xl bg-slate-50 dark:bg-black border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-700 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/30 transition-all"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || (!recoveryMode && !otpComplete) || (recoveryMode && !recoveryCode.trim())}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 bg-[length:200%_100%] hover:bg-right disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm shadow-lg shadow-rose-500/30 transition-all duration-500 active:scale-[0.98] cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying…</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Verify &amp; Continue</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={backToCredentials}
                  className="inline-flex items-center gap-1 text-slate-500 hover:text-rose-500 dark:hover:text-rose-300 font-semibold cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => { setRecoveryMode((v) => !v); setError(null); setCode(''); setRecoveryCode(''); }}
                  className="text-slate-500 hover:text-rose-500 dark:hover:text-rose-300 font-semibold cursor-pointer"
                >
                  {recoveryMode ? 'Use authenticator code' : 'Use a recovery code'}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-[11px] text-slate-500 dark:text-slate-700">
          <span className="emoji" aria-hidden="true">⚠️</span> All administrative actions are logged and auditable.
        </p>
        <BrandCredit variant="pill" />
      </div>
    </div>
  );
};
