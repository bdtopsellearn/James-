import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, ShieldCheck, Loader2 } from 'lucide-react';
import { apiCaptcha } from '../../services/api';

interface CaptchaBoxProps {
  /** Called whenever the picture or the typed answer changes. */
  onChange: (value: { token: string; answer: string }) => void;
  /** Bump this number to load a fresh picture (e.g. after a failed submit). */
  resetSignal?: number;
  disabled?: boolean;
}

/** Built-in "I am not a robot" check: a distorted picture + a text box. No Google keys needed, works on any address. */
export const CaptchaBox: React.FC<CaptchaBoxProps> = ({ onChange, resetSignal = 0, disabled }) => {
  const [image, setImage] = useState('');
  const [token, setToken] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [spin, setSpin] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    setAnswer('');
    try {
      const c = await apiCaptcha();
      setImage(c.image);
      setToken(c.token);
      onChangeRef.current({ token: c.token, answer: '' });
      if (timer.current) clearTimeout(timer.current);
      // picture expires after 5 minutes — quietly replace it a little earlier
      timer.current = setTimeout(() => { void load(); }, Math.max(30000, c.expiresAt - Date.now() - 15000));
    } catch {
      setFailed(true);
      setImage('');
      setToken('');
      onChangeRef.current({ token: '', answer: '' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [load, resetSignal]);

  const refresh = () => {
    setSpin(true);
    setTimeout(() => setSpin(false), 600);
    void load();
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-2.5">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
        <ShieldCheck className="w-4 h-4 text-teal-500" />
        <span>Security check — type the letters you see</span>
      </div>

      <div className="flex items-stretch gap-2">
        <div className="flex-1 min-w-0 h-16 rounded-lg overflow-hidden bg-[#0b1220] border border-slate-200/10 flex items-center justify-center">
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-teal-400" />
          ) : failed ? (
            <button type="button" onClick={refresh} className="text-[11px] text-rose-300 px-2 text-center cursor-pointer">
              Could not load. Tap to retry
            </button>
          ) : (
            <img src={image} alt="Security check letters" draggable={false} className="h-full w-auto max-w-full select-none" />
          )}
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={disabled}
          aria-label="New picture"
          className="shrink-0 w-12 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:text-teal-500 flex items-center justify-center cursor-pointer active:scale-95 transition-transform disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${spin ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <input
        type="text"
        value={answer}
        disabled={disabled || failed}
        onChange={(e) => {
          const v = e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase();
          setAnswer(v);
          onChangeRef.current({ token, answer: v });
        }}
        placeholder="Type the 5 letters"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={5}
        inputMode="text"
        className="w-full px-3 py-2.5 text-sm font-mono tracking-[0.4em] text-center uppercase rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:tracking-normal placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
      />
    </div>
  );
};
