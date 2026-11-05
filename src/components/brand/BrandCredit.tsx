import React from 'react';
import { Sparkles } from 'lucide-react';

interface BrandCreditProps {
  /** footer: centered line under pages · pill: glowing badge · compact: tiny line for menus */
  variant?: 'footer' | 'pill' | 'compact';
  className?: string;
}

/**
 * Brand credit shown across the site (replaces the old developer credit).
 * The developer name now lives only inside the About page.
 *
 * Layout note: the "Grow · Connect · Succeed" tagline is kept on ONE line
 * (whitespace-nowrap + shrink-0) so the middle dot never dangles onto its own
 * line. The row itself is allowed to wrap (flex-wrap) so on very narrow
 * screens the whole tagline drops below the brand name cleanly instead of
 * breaking mid-phrase.
 */
export const BrandCredit: React.FC<BrandCreditProps> = ({ variant = 'footer', className = '' }) => {
  if (variant === 'compact') {
    return (
      <div className={`flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-[10px] tracking-wide text-center ${className}`}>
        <span className="inline-flex items-center gap-1.5 shrink-0">
          <Sparkles className="w-3 h-3 text-teal-500 shrink-0" />
          <span className="font-mono font-extrabold whitespace-nowrap animate-gradient bg-gradient-to-r from-teal-400 via-emerald-300 to-cyan-400 bg-clip-text text-transparent">
            X AD MARKETING
          </span>
        </span>
        <span className="text-slate-500 dark:text-slate-500 uppercase font-semibold whitespace-nowrap shrink-0">
          Grow · Connect · Succeed
        </span>
      </div>
    );
  }

  if (variant === 'pill') {
    return (
      <div className={`flex justify-center ${className}`}>
        <div className="group inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-3.5 py-1.5 rounded-full border border-teal-500/30 bg-teal-500/5 dark:bg-teal-400/5 backdrop-blur shadow-[0_0_18px_rgba(20,184,166,0.18)] hover:shadow-[0_0_26px_rgba(20,184,166,0.38)] transition-shadow text-center">
          <span className="relative flex w-5 h-5 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-white shrink-0">
            <Sparkles className="w-3 h-3" />
          </span>
          <span className="text-xs font-mono font-extrabold whitespace-nowrap shrink-0 animate-gradient bg-gradient-to-r from-teal-500 via-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            X AD MARKETING
          </span>
          <span className="text-[10px] uppercase font-bold tracking-[0.18em] text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
            Grow · Connect · Succeed
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-2 py-4 text-[11px] text-slate-500 text-center ${className}`}>
      <span className="hidden sm:block h-px w-8 shrink-0 bg-gradient-to-r from-transparent to-teal-500/50" />
      <span className="inline-flex items-center gap-2 shrink-0">
        <Sparkles className="w-3.5 h-3.5 text-teal-500 shrink-0" />
        <span className="font-mono font-extrabold text-xs whitespace-nowrap animate-gradient bg-gradient-to-r from-teal-500 via-emerald-400 to-cyan-400 bg-clip-text text-transparent">
          X AD MARKETING
        </span>
      </span>
      <span className="uppercase font-semibold tracking-[0.16em] whitespace-nowrap shrink-0">
        Grow · Connect · Succeed
      </span>
      <span className="hidden sm:block h-px w-8 shrink-0 bg-gradient-to-l from-transparent to-teal-500/50" />
    </div>
  );
};

export default BrandCredit;
