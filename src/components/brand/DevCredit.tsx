import React from 'react';
import { Code2 } from 'lucide-react';

interface DevCreditProps {
  /** footer: centered line under pages · pill: glowing badge · compact: tiny line for menus */
  variant?: 'footer' | 'pill' | 'compact';
  className?: string;
}

/** "Developer: Alif_H4ck" credit shown across the site. */
export const DevCredit: React.FC<DevCreditProps> = ({ variant = 'footer', className = '' }) => {
  if (variant === 'compact') {
    return (
      <div className={`flex items-center justify-center gap-1.5 text-[10px] tracking-wide ${className}`}>
        <Code2 className="w-3 h-3 text-teal-500" />
        <span className="text-slate-500 dark:text-slate-500 uppercase font-semibold">Developer</span>
        <span className="font-mono font-extrabold animate-gradient bg-gradient-to-r from-teal-400 via-emerald-300 to-cyan-400 bg-clip-text text-transparent">
          Alif_H4ck
        </span>
      </div>
    );
  }

  if (variant === 'pill') {
    return (
      <div className={`flex justify-center ${className}`}>
        <div className="group inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-teal-500/30 bg-teal-500/5 dark:bg-teal-400/5 backdrop-blur shadow-[0_0_18px_rgba(20,184,166,0.18)] hover:shadow-[0_0_26px_rgba(20,184,166,0.38)] transition-shadow">
          <span className="relative flex w-5 h-5 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-white">
            <Code2 className="w-3 h-3" />
          </span>
          <span className="text-[10px] uppercase font-bold tracking-[0.18em] text-slate-500 dark:text-slate-400">Developer</span>
          <span className="text-xs font-mono font-extrabold animate-gradient bg-gradient-to-r from-teal-500 via-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Alif_H4ck
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center gap-2 py-4 text-[11px] text-slate-500 ${className}`}>
      <span className="h-px w-8 bg-gradient-to-r from-transparent to-teal-500/50" />
      <Code2 className="w-3.5 h-3.5 text-teal-500" />
      <span className="uppercase font-semibold tracking-[0.16em]">Developer:</span>
      <span className="font-mono font-extrabold text-xs animate-gradient bg-gradient-to-r from-teal-500 via-emerald-400 to-cyan-400 bg-clip-text text-transparent">
        Alif_H4ck
      </span>
      <span className="h-px w-8 bg-gradient-to-l from-transparent to-teal-500/50" />
    </div>
  );
};
