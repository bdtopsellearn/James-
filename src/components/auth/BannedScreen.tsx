import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, Send, ShieldBan, Clock, XCircle } from 'lucide-react';
import { ApiError, apiAppealStatus, apiSubmitAppeal } from '../../services/api';
import { CaptchaBox } from './CaptchaBox';

interface BannedScreenProps {
  email: string;
  reason?: string;
  /** Shown when the person is already signed in (full page) vs. inside the login card. */
  onBack?: () => void;
  backLabel?: string;
}

const STYLE = `
@keyframes bn-shake{0%,100%{transform:translateX(0) rotate(0)}15%{transform:translateX(-5px) rotate(-4deg)}30%{transform:translateX(5px) rotate(4deg)}45%{transform:translateX(-4px) rotate(-3deg)}60%{transform:translateX(4px) rotate(3deg)}75%{transform:translateX(-2px)}}
@keyframes bn-ping{0%{transform:scale(.8);opacity:.7}100%{transform:scale(1.8);opacity:0}}
@keyframes bn-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.bn-shake{animation:bn-shake 1.6s ease-in-out .3s 2}
.bn-ping{animation:bn-ping 2s ease-out infinite}
.bn-in{animation:bn-in .5s cubic-bezier(.22,1,.36,1) both}
@media (prefers-reduced-motion:reduce){.bn-shake,.bn-ping,.bn-in{animation:none}}
`;

export const BannedScreen: React.FC<BannedScreenProps> = ({ email, reason, onBack, backLabel = 'Back to sign in' }) => {
  const [status, setStatus] = useState<'loading' | 'none' | 'pending' | 'approved' | 'rejected'>('loading');
  const [reply, setReply] = useState('');
  const [message, setMessage] = useState('');
  const [captcha, setCaptcha] = useState({ token: '', answer: '' });
  const [captchaReset, setCaptchaReset] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    if (!email) { setStatus('none'); return; }
    try {
      const r = await apiAppealStatus(email);
      setStatus((['none', 'pending', 'approved', 'rejected'].includes(r.status) ? r.status : 'none') as any);
      setReply(r.reply || '');
    } catch { setStatus('none'); }
  };

  useEffect(() => {
    void loadStatus();
    const t = setInterval(() => { void loadStatus(); }, 20000); // pick up the admin's decision while this screen is open
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (message.trim().length < 10) return setError('Please write at least 10 characters.');
    if (captcha.answer.length < 5) return setError('Type the 5 letters from the picture.');
    setSending(true);
    try {
      await apiSubmitAppeal(email, message.trim(), captcha.token, captcha.answer);
      setStatus('pending');
      setMessage('');
    } catch (err) {
      setCaptchaReset((n) => n + 1);
      if (err instanceof ApiError && err.code === 'APPEAL_PENDING') { setStatus('pending'); return; }
      setError(err instanceof ApiError ? err.message : 'Could not send your request. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5 bn-in">
      <style>{STYLE}</style>

      <div className="flex flex-col items-center text-center gap-3">
        <div className="relative w-20 h-20 flex items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-rose-500/30 bn-ping" />
          <span className="relative w-20 h-20 rounded-full bg-gradient-to-br from-rose-500 to-red-700 text-white flex items-center justify-center shadow-xl shadow-rose-600/40 bn-shake">
            <ShieldBan className="w-10 h-10" />
          </span>
        </div>
        <h2 className="text-xl sm:text-2xl font-extrabold text-rose-600 dark:text-rose-400 tracking-tight">You have been banned</h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
          Your account <span className="font-semibold break-all text-slate-700 dark:text-slate-200">{email}</span> has been suspended and you cannot use the platform right now.
        </p>
        <div className="w-full text-left rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-500">Reason</p>
          <p className="text-sm text-rose-800 dark:text-rose-200 break-words mt-0.5">{reason || 'Terms of service violation'}</p>
        </div>
      </div>

      {status === 'loading' && (
        <div className="flex justify-center py-3"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      )}

      {status === 'pending' && (
        <div className="rounded-xl border border-amber-300/60 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-950/30 p-4 text-center space-y-1 bn-in">
          <Clock className="w-6 h-6 mx-auto text-amber-500 animate-pulse" />
          <p className="text-sm font-bold text-amber-800 dark:text-amber-200">Your request is with the admin team</p>
          <p className="text-xs text-amber-700/80 dark:text-amber-300/80">We will review it soon. You can close this page — try signing in again later.</p>
        </div>
      )}

      {status === 'approved' && (
        <div className="rounded-xl border border-emerald-300/60 dark:border-emerald-700/50 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-center space-y-1 bn-in">
          <CheckCircle2 className="w-6 h-6 mx-auto text-emerald-500" />
          <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">Your request was approved <span className="emoji" aria-hidden="true">🎉</span></p>
          <p className="text-xs text-emerald-700 dark:text-emerald-300 break-words">{reply || 'Your account is active again. You can sign in now.'}</p>
        </div>
      )}

      {(status === 'none' || status === 'rejected') && (
        <form onSubmit={submit} className="space-y-3 bn-in">
          {status === 'rejected' && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 p-3 flex gap-2 text-xs text-rose-700 dark:text-rose-300">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="break-words">Your last request was declined{reply ? `: ${reply}` : '.'} You can send a new one.</span>
            </div>
          )}
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Think this is a mistake? Send a request to the admin</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="Explain what happened and why your account should be restored…"
            className="w-full px-3 py-2.5 text-sm rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 resize-none"
          />
          <div className="text-right text-[10px] text-slate-400 -mt-2">{message.length}/1000</div>
          <CaptchaBox onChange={setCaptcha} resetSignal={captchaReset} disabled={sending} />
          {error && <p className="text-xs text-rose-500 break-words" role="alert">{error}</p>}
          <button
            type="submit"
            disabled={sending}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-sm font-bold shadow-lg shadow-teal-500/25 active:scale-[0.98] transition-all disabled:opacity-60 cursor-pointer"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>{sending ? 'Sending…' : 'Send request to admin'}</span>
          </button>
        </form>
      )}

      {onBack && (
        <button type="button" onClick={onBack} className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /> {backLabel}
        </button>
      )}
    </div>
  );
};
