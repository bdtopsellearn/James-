/**
 * Themed dialogs — replaces the browser's native "98.159.110.93 says ..."
 * alert()/confirm() boxes with in-app modals that match the site theme.
 *
 *   • window.alert is overridden (see installDialogs) so every existing
 *     alert('...') call in the code base now opens a styled modal.
 *   • askConfirm('...') is the async/styled replacement for confirm('...').
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X, Wallet, Trash2 } from 'lucide-react';

type Kind = 'success' | 'error' | 'warning' | 'info';

interface DialogReq {
  id: number;
  kind: Kind;
  title: string;
  message: string;
  isConfirm: boolean;
  danger?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  action?: { label: string; path: string };
  resolve?: (v: boolean) => void;
}

let seq = 0;
let listener: ((d: DialogReq) => void) | null = null;
const pending: DialogReq[] = [];
const push = (d: DialogReq) => { if (listener) listener(d); else pending.push(d); };

function inferKind(msg: string): Kind {
  const m = msg.toLowerCase();
  if (/insufficient|fail|invalid|error|cannot|can't|not found|expired|do not match|denied|unable|too large|protected/.test(m)) return 'error';
  if (/enter your|no impressions|please|required/.test(m)) return 'warning';
  if (/success|saved|applied|upgraded|complete|added|dispatched|updated|reset to|enabled|disabled|submitted|rotated/.test(m)) return 'success';
  return 'info';
}

function inferTitle(kind: Kind, msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('insufficient')) return 'Insufficient Balance';
  if (m.includes('password')) return 'Password';
  if (m.includes('promo')) return 'Promo Code';
  if (kind === 'error') return 'Something Went Wrong';
  if (kind === 'warning') return 'Heads Up';
  if (kind === 'success') return 'Success';
  return 'Notice';
}

export function showAlert(message: unknown, opts: { title?: string; kind?: Kind } = {}): void {
  const msg = String(message ?? '');
  const kind = opts.kind || inferKind(msg);
  const action = msg.toLowerCase().includes('insufficient') && msg.toLowerCase().includes('wallet')
    ? { label: 'Top Up Wallet', path: '/wallet' }
    : undefined;
  push({ id: ++seq, kind, title: opts.title || inferTitle(kind, msg), message: msg, isConfirm: false, action });
}

export function askConfirm(
  message: string,
  opts: { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean } = {}
): Promise<boolean> {
  return new Promise((resolve) => {
    push({
      id: ++seq,
      kind: opts.danger === false ? 'info' : 'warning',
      title: opts.title || 'Please Confirm',
      message,
      isConfirm: true,
      danger: opts.danger !== false,
      confirmLabel: opts.confirmLabel || 'Yes, Continue',
      cancelLabel: opts.cancelLabel || 'Cancel',
      resolve,
    });
  });
}

/** Call once at startup: every alert('...') in the app becomes a themed modal. */
export function installDialogs(): void {
  window.alert = (msg?: unknown) => showAlert(msg);
}

const TONES: Record<Kind, { ring: string; icon: string; btn: string; glow: string }> = {
  success: { ring: 'bg-emerald-500/15 ring-emerald-500/40', icon: 'text-emerald-500', btn: 'from-emerald-500 to-teal-500', glow: 'shadow-emerald-500/25' },
  error:   { ring: 'bg-rose-500/15 ring-rose-500/40',       icon: 'text-rose-500',    btn: 'from-rose-500 to-pink-500',    glow: 'shadow-rose-500/25' },
  warning: { ring: 'bg-amber-500/15 ring-amber-500/40',     icon: 'text-amber-500',   btn: 'from-amber-500 to-orange-500', glow: 'shadow-amber-500/25' },
  info:    { ring: 'bg-sky-500/15 ring-sky-500/40',         icon: 'text-sky-500',     btn: 'from-sky-500 to-cyan-500',     glow: 'shadow-sky-500/25' },
};

export const DialogHost: React.FC = () => {
  const [queue, setQueue] = useState<DialogReq[]>([]);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    listener = (d) => setQueue((q) => [...q, d]);
    if (pending.length) { const items = pending.splice(0); setQueue((q) => [...q, ...items]); }
    return () => { listener = null; };
  }, []);

  const current = queue[0];

  const close = useCallback((result: boolean) => {
    setQueue((q) => {
      const [head, ...rest] = q;
      head?.resolve?.(result);
      return rest;
    });
  }, []);

  useEffect(() => {
    if (!current) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, close]);

  if (!current) return null;
  const tone = TONES[current.kind];
  const Icon = current.isConfirm && current.danger ? Trash2
    : current.kind === 'success' ? CheckCircle2
    : current.kind === 'error' ? AlertCircle
    : current.kind === 'warning' ? AlertTriangle : Info;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !current.isConfirm) close(false); }}
      role="dialog"
      aria-modal="true"
    >
      <div className={`relative w-full max-w-sm rounded-3xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-[#0b1220] shadow-2xl ${tone.glow} p-6 animate-pop overflow-hidden`}>
        <div className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 w-56 h-56 rounded-full bg-gradient-to-b from-teal-400/15 to-transparent blur-2xl" />
        <button
          onClick={() => close(false)}
          aria-label="Close"
          className="absolute top-3 right-3 p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="relative flex flex-col items-center text-center">
          <div className={`w-14 h-14 rounded-2xl ring-2 flex items-center justify-center ${tone.ring} animate-pop`}>
            <Icon className={`w-7 h-7 ${tone.icon}`} />
          </div>
          <h3 className="mt-4 text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">{current.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300 break-words">{current.message}</p>
        </div>

        <div className={`relative mt-6 flex gap-2 ${current.isConfirm || current.action ? 'flex-col-reverse sm:flex-row' : ''}`}>
          {current.isConfirm && (
            <button
              onClick={() => close(false)}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              {current.cancelLabel}
            </button>
          )}
          {!current.isConfirm && current.action && (
            <button
              onClick={() => close(false)}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              Close
            </button>
          )}
          <button
            ref={okRef}
            onClick={() => {
              const act = current.action;
              close(true);
              if (act) {
                // Clean-path navigation (no `#`): push the new path and let the
                // app's popstate listener switch the view.
                try {
                  window.history.pushState(null, '', act.path);
                  window.dispatchEvent(new PopStateEvent('popstate'));
                } catch { /* ignore */ }
              }
            }}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r ${current.isConfirm && current.danger ? 'from-rose-500 to-pink-500' : tone.btn} shadow-lg hover:brightness-110 cursor-pointer`}
          >
            {current.action && <Wallet className="w-4 h-4" />}
            {current.isConfirm ? current.confirmLabel : (current.action ? current.action.label : 'OK')}
          </button>
        </div>
      </div>
    </div>
  );
};
