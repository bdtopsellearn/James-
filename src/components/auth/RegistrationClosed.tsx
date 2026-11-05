import React from 'react';
import { LogIn, Lock } from 'lucide-react';

const STYLE = `
@keyframes rc-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes rc-ring{0%{transform:scale(.7);opacity:.7}100%{transform:scale(1.9);opacity:0}}
@keyframes rc-in{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:none}}
@keyframes rc-bar{0%{background-position:0 0}100%{background-position:200% 0}}
.rc-in{animation:rc-in .55s cubic-bezier(.22,1,.36,1) both}
.rc-float{animation:rc-float 3.2s ease-in-out infinite}
.rc-ring{animation:rc-ring 2.4s ease-out infinite}
.rc-ring2{animation:rc-ring 2.4s ease-out 1.2s infinite}
.rc-bar{background:linear-gradient(90deg,#f59e0b,#fb7185,#a78bfa,#f59e0b);background-size:200% 100%;animation:rc-bar 3s linear infinite}
@media (prefers-reduced-motion:reduce){.rc-in,.rc-float,.rc-ring,.rc-ring2,.rc-bar{animation:none}}
`;

export const RegistrationClosed: React.FC<{ message?: string; onSignIn: () => void }> = ({ message, onSignIn }) => (
  <div className="rc-in text-center space-y-5 py-2" role="status" aria-live="polite">
    <style>{STYLE}</style>
    <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
      <span className="absolute inset-0 rounded-full border-2 border-amber-400/60 rc-ring" />
      <span className="absolute inset-0 rounded-full border-2 border-rose-400/50 rc-ring2" />
      <span className="rc-float relative w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-400 to-rose-500 text-white flex items-center justify-center shadow-xl shadow-rose-500/30">
        <Lock className="w-9 h-9" />
      </span>
    </div>
    <div className="space-y-2">
      <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">Account creation is now off <span className="emoji" aria-hidden="true">🔒</span></h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto break-words">
        {message || 'New account creation is paused right now. Existing members can still sign in. Please check back soon!'}
      </p>
    </div>
    <div className="h-1.5 w-40 mx-auto rounded-full rc-bar" aria-hidden="true" />
    <button
      type="button"
      onClick={onSignIn}
      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white text-sm font-bold shadow-lg shadow-teal-500/25 active:scale-[0.98] transition-all cursor-pointer"
    >
      <LogIn className="w-4 h-4" /> I already have an account
    </button>
  </div>
);
