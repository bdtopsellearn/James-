import React from 'react';

export function passwordScore(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (/^(.)\1+$/.test(pw) || /^(password|12345678|qwertyui|11111111)/i.test(pw)) s = Math.min(s, 1);
  return Math.min(4, Math.max(pw.length >= 8 ? 1 : 0, s));
}

const LABELS = ['Too short', 'Weak', 'Okay', 'Good', 'Strong'];
const COLORS = ['bg-slate-300 dark:bg-slate-700', 'bg-rose-500', 'bg-amber-500', 'bg-teal-500', 'bg-emerald-500'];

export const PasswordStrength: React.FC<{ password: string }> = ({ password }) => {
  if (!password) return null;
  const score = passwordScore(password);
  return (
    <div className="mt-2 space-y-1" aria-live="polite">
      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`h-1.5 flex-1 rounded-full transition-colors ${n <= score ? COLORS[score] : 'bg-slate-200 dark:bg-slate-800'}`} />
        ))}
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Strength: <span className="font-semibold">{LABELS[score]}</span>
        {score < 3 && ' — add capitals, numbers or a symbol'}
      </p>
    </div>
  );
};
