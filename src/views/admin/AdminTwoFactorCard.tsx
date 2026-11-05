import React, { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  ShieldCheck,
  ShieldOff,
  Loader2,
  AlertCircle,
  KeyRound,
  Copy,
  Check,
  Smartphone,
  RefreshCw,
  Download,
  Crown,
  Lock,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import {
  apiAdmin2FAStatus,
  apiAdmin2FASetup,
  apiAdmin2FAEnable,
  apiAdmin2FADisable,
  apiAdmin2FARegenerateRecovery,
  apiAdminSave2FAPolicy,
  ApiError,
  TwoFactorStatus,
  TwoFactorSetup,
} from '../../services/api';
import { User } from '../../types';
import { OtpInput } from '../../components/ui/OtpInput';

interface AdminTwoFactorCardProps {
  currentUser?: User | null;
  isSuperAdmin?: boolean;
}

type Mode = 'idle' | 'setup' | 'recovery' | 'disable' | 'regen';

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

export const AdminTwoFactorCard: React.FC<AdminTwoFactorCardProps> = ({ currentUser, isSuperAdmin }) => {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [mode, setMode] = useState<Mode>('idle');
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [policy, setPolicy] = useState(false);
  const [policyBusy, setPolicyBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const s = await apiAdmin2FAStatus();
      setStatus(s);
      setPolicy(s.policyRequired);
    } catch {
      /* keep whatever we had */
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  const resetFlow = () => {
    setMode('idle');
    setSetup(null);
    setCode('');
    setRecoveryCodes([]);
    setError(null);
  };

  const startSetup = async () => {
    setError(null);
    setBusy(true);
    try {
      const s = await apiAdmin2FASetup();
      setSetup(s);
      setCode('');
      setMode('setup');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start the setup.');
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async (value?: string) => {
    const c = value ?? code;
    if (c.length !== 6) return setError('Enter the 6-digit code from your app.');
    setError(null);
    setBusy(true);
    try {
      const res = await apiAdmin2FAEnable(c);
      setRecoveryCodes(res.recoveryCodes || []);
      setMode('recovery');
      setCode('');
      await loadStatus();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not enable 2FA.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const confirmDisable = async (value?: string) => {
    const c = value ?? code;
    if (!c.trim()) return setError('Enter a code to disable 2FA.');
    setError(null);
    setBusy(true);
    try {
      await apiAdmin2FADisable(c);
      resetFlow();
      await loadStatus();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not disable 2FA.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const confirmRegen = async (value?: string) => {
    const c = value ?? code;
    if (c.length !== 6) return setError('Enter the 6-digit code from your app.');
    setError(null);
    setBusy(true);
    try {
      const res = await apiAdmin2FARegenerateRecovery(c);
      setRecoveryCodes(res.recoveryCodes || []);
      setMode('recovery');
      setCode('');
      await loadStatus();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not regenerate recovery codes.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const togglePolicy = async () => {
    const next = !policy;
    setPolicyBusy(true);
    setError(null);
    try {
      const res = await apiAdminSave2FAPolicy(next);
      setPolicy(res.required);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update the policy.');
    } finally {
      setPolicyBusy(false);
    }
  };

  const downloadRecovery = () => {
    const body = [
      'PROFIT NEXA — Authenticator Recovery Codes',
      `Account: ${currentUser?.email || status?.issuer || ''}`,
      `Generated: ${new Date().toLocaleString()}`,
      '',
      ...recoveryCodes.map((c, i) => `${i + 1}. ${c}`),
      '',
      'Each code can be used once. Keep them somewhere safe.',
    ].join('\n');
    const blob = new Blob([body], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'profit-nexa-recovery-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const enabled = !!status?.enabled;
  const codeReady = code.length === 6;

  return (
    <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/15 to-teal-500/15 border border-emerald-300/40 dark:border-emerald-500/30 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              Authenticator (Two-Factor Security)
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Protect admin sign-in with a time-based 6-digit code from Google Authenticator, Authy, 1Password &amp; more.
            </p>
          </div>
        </div>
        {loadingStatus ? (
          <span className="text-[11px] font-mono text-slate-400 inline-flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> checking…
          </span>
        ) : (
          <span
            className={`text-[10px] font-bold px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 ${
              enabled
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                : 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-400/30'
            }`}
          >
            {enabled ? <ShieldCheck className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
            {enabled ? 'ENABLED' : 'DISABLED'}
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-200 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}

      {policy && !enabled && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-300 text-xs">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            Two-factor authentication is <strong>required</strong> for all administrators. Please enable it now.
          </span>
        </div>
      )}

      {/* ── IDLE ── */}
      {mode === 'idle' && (
        <div className="space-y-4">
          {enabled ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Enabled since</span>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mt-1">{fmtDate(status?.enabledAt || null)}</p>
                </div>
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Recovery codes left</span>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mt-1">
                    {status?.recoveryCodesLeft ?? 0} <span className="text-slate-400 font-normal">of 8</span>
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setMode('regen'); setCode(''); setError(null); }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Regenerate recovery codes
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('disable'); setCode(''); setError(null); }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-100 dark:hover:bg-rose-950/70 transition-colors cursor-pointer"
                >
                  <ShieldOff className="w-3.5 h-3.5" /> Turn off 2FA
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <Smartphone className="w-5 h-5 text-slate-400" />
                <p className="text-xs text-slate-500 dark:text-slate-400 flex-1 min-w-[12rem]">
                  Add a second layer of security. After enabling, a 6-digit code from your authenticator app will be required at every admin sign-in.
                </p>
              </div>
              <button
                type="button"
                onClick={startSetup}
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-500/25 hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Enable Authenticator
              </button>
            </>
          )}
        </div>
      )}

      {/* ── SETUP ── */}
      {mode === 'setup' && setup && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="flex flex-col items-center gap-3">
              <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-sm">
                <QRCodeSVG value={setup.otpauthUri} size={168} level="M" marginSize={2} bgColor="#ffffff" fgColor="#0f172a" />
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 text-center">
                Scan with your authenticator app
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <span className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Or enter this key manually</span>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-black border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-700 dark:text-slate-200 break-all">
                    {setup.secret}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(setup.secret, 'secret')}
                    className="shrink-0 p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    aria-label="Copy secret"
                  >
                    {copied === 'secret' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                <span>Account: <span className="font-semibold text-slate-600 dark:text-slate-300">{setup.account}</span> · Issuer: {setup.issuer}</span>
              </div>
            </div>
          </div>

          <div className="pt-1 space-y-3">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 text-center">
              Enter the 6-digit code shown in your app to confirm
            </p>
            <OtpInput value={code} onChange={setCode} onComplete={(c) => confirmEnable(c)} disabled={busy} autoFocus />
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => confirmEnable()}
                disabled={busy || !codeReady}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-500/25 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Verify &amp; Enable
              </button>
              <button
                type="button"
                onClick={resetFlow}
                disabled={busy}
                className="px-4 py-2.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RECOVERY CODES ── */}
      {mode === 'recovery' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              Two-factor authentication is now active. Save these <strong>one-time recovery codes</strong> somewhere safe — they let you sign in if you lose your device.
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {recoveryCodes.map((c) => (
              <code key={c} className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-black border border-slate-200 dark:border-slate-800 text-xs font-mono text-center text-slate-700 dark:text-slate-200 tracking-wider">
                {c}
              </code>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copy(recoveryCodes.join('\n'), 'all')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              {copied === 'all' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              Copy all
            </button>
            <button
              type="button"
              onClick={downloadRecovery}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </button>
            <button
              type="button"
              onClick={resetFlow}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-500/25 hover:brightness-110 transition-all cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" /> I&apos;ve saved them
            </button>
          </div>
        </div>
      )}

      {/* ── DISABLE ── */}
      {mode === 'disable' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Enter a current authenticator code (or a recovery code) to <strong>turn off</strong> two-factor authentication.
          </p>
          <OtpInput value={code} onChange={setCode} onComplete={(c) => confirmDisable(c)} disabled={busy} autoFocus />
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => confirmDisable()}
              disabled={busy || !codeReady}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg bg-rose-600 text-white shadow-md shadow-rose-500/25 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
              Turn off 2FA
            </button>
            <button
              type="button"
              onClick={resetFlow}
              disabled={busy}
              className="px-4 py-2.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── REGEN ── */}
      {mode === 'regen' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Enter a current authenticator code to generate a fresh set of recovery codes. Your old codes will stop working.
          </p>
          <OtpInput value={code} onChange={setCode} onComplete={(c) => confirmRegen(c)} disabled={busy} autoFocus />
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => confirmRegen()}
              disabled={busy || !codeReady}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-500/25 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Regenerate
            </button>
            <button
              type="button"
              onClick={resetFlow}
              disabled={busy}
              className="px-4 py-2.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Super-admin global policy ── */}
      {isSuperAdmin && (
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-500" />
            <div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Require authenticator for all admins</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Super Admin policy — admins without 2FA will see a warning.</p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={policy}
            onClick={togglePolicy}
            disabled={policyBusy}
            className={`relative w-12 h-6.5 rounded-full transition-colors shrink-0 cursor-pointer disabled:opacity-60 ${
              policy ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5.5 h-5.5 rounded-full bg-white shadow transition-transform ${
                policy ? 'translate-x-5.5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      )}
    </div>
  );
};
