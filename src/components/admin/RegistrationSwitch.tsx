import React, { useEffect, useState } from 'react';
import { Loader2, UserPlus, UserX } from 'lucide-react';
import { apiAdminSetRegistration } from '../../services/api';
import { askConfirm } from '../../lib/dialog';
import { useToast } from '../ui/Toast';

const DEFAULT_MSG = 'New account creation is paused right now. Existing members can still sign in. Please check back soon!';

/** Admin switch: when OFF nobody can create a new account (email, Google or phone) — sign-in keeps working. */
export const RegistrationSwitch: React.FC = () => {
  const { showToast } = useToast();
  const [open, setOpen] = useState<boolean | null>(null);
  const [message, setMessage] = useState(DEFAULT_MSG);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/auth/registration', { cache: 'no-store' });
        const j = await r.json();
        if (!alive) return;
        setOpen(!!j.open);
        if (j.message) setMessage(j.message);
      } catch { if (alive) setOpen(true); }
    })();
    return () => { alive = false; };
  }, []);

  const toggle = async () => {
    if (busy || open === null) return;
    const next = !open;
    const ok = await askConfirm(
      next
        ? 'Anyone will be able to create a new account again.'
        : 'Nobody will be able to create a new account (email, Google or phone). Existing members can still sign in. Visitors see an "account creation is off" message.',
      { title: next ? '🟢 Turn account creation ON?' : '🔒 Turn account creation OFF?', confirmLabel: next ? 'Yes, turn on' : 'Yes, turn off', danger: !next }
    );
    if (!ok) return;
    setBusy(true);
    try {
      const r = await apiAdminSetRegistration(next, message.trim() || DEFAULT_MSG);
      setOpen(r.open);
      setMessage(r.message);
      showToast(r.open ? '🟢 Sign-ups are ON' : '🔒 Sign-ups are OFF', r.open ? 'New users can register again.' : 'Visitors now see the "account creation is off" notice.', r.open ? 'success' : 'warning');
    } catch (e: any) {
      showToast('Could not change the setting', e?.message || 'Server error', 'error');
    } finally {
      setBusy(false);
    }
  };

  const on = open !== false;
  return (
    <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 overflow-hidden relative">
      <div className={`absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-25 transition-colors duration-500 ${on ? 'bg-emerald-500' : 'bg-rose-500'}`} aria-hidden="true" />
      <div className="relative flex items-start gap-3">
        <span className={`shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-lg transition-all duration-500 ${on ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/30' : 'bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-500/30'}`}>
          {on ? <UserPlus className="w-5 h-5" /> : <UserX className="w-5 h-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Account Creation</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {open === null ? 'Checking…' : on ? 'Open — anyone can register.' : 'OFF — new sign-ups are blocked. Existing members can still sign in.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Account creation"
          disabled={busy || open === null}
          onClick={toggle}
          className={`relative shrink-0 w-14 h-8 rounded-full transition-colors duration-300 cursor-pointer disabled:opacity-60 ${on ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}
        >
          <span className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center transition-transform duration-300 ${on ? 'translate-x-6' : ''}`}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />}
          </span>
        </button>
      </div>
      <div className="relative space-y-1.5">
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Message visitors see when it is OFF</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          maxLength={300}
          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
        />
        <p className="text-[11px] text-slate-400">The message is saved the next time you flip the switch.</p>
      </div>
    </div>
  );
};
