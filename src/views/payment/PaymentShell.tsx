import React from 'react';
import { ShieldCheck, Lock, Sparkles } from 'lucide-react';
import { BrandLogo } from '../../components/brand/BrandLogo';
import { BrandCredit } from '../../components/brand/BrandCredit';

interface PaymentShellProps {
  /** Small label shown in the top pill, e.g. "Secure Checkout" / "Payment Result". */
  badge?: string;
  /** TEST / LIVE environment chip (from the payment record). */
  environment?: string | null;
  children: React.ReactNode;
}

/**
 * Full-screen, mobile-first shell for the standalone payment surfaces
 * (/checkout/:id and /payment/*). It is intentionally independent of the
 * dashboard chrome — no sidebar, no top bar — so a customer who is redirected
 * back from the hosted gateway lands on a clean, trustworthy, dark page.
 */
export const PaymentShell: React.FC<PaymentShellProps> = ({ badge = 'Secure Checkout', environment, children }) => {
  const isLive = String(environment || '').toLowerCase() === 'live';
  return (
    <div className="relative min-h-dvh w-full overflow-x-hidden bg-[#070b14] text-slate-100 antialiased">
      {/* Ambient brand glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-24 h-80 w-80 rounded-full bg-emerald-500/20 blur-[110px]" />
        <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-cyan-500/15 blur-[120px]" />
        <div className="absolute -bottom-32 left-1/4 h-80 w-80 rounded-full bg-teal-500/10 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(148,163,184,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.5) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse at 50% 0%, black 30%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse at 50% 0%, black 30%, transparent 75%)',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-10 pt-6 sm:px-6 sm:pt-10">
        {/* Header */}
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandLogo size="sm" />
            <div className="leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-extrabold tracking-tight text-white">AD MARKETING</span>
                <span className="rounded bg-emerald-500/15 px-1.5 py-px text-[9px] font-bold font-mono text-emerald-300 ring-1 ring-emerald-500/25">X</span>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400/80">X AD MARKETING</span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-slate-300 backdrop-blur">
              <Lock className="h-3 w-3 text-emerald-400" />
              {badge}
            </span>
            {environment && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ring-1 ${
                  isLive
                    ? 'bg-rose-500/10 text-rose-300 ring-rose-500/30'
                    : 'bg-amber-500/10 text-amber-300 ring-amber-500/30'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isLive ? 'bg-rose-400' : 'bg-amber-400'} animate-pulse`} />
                {isLive ? 'Live' : 'Test Mode'}
              </span>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="mt-6 flex flex-1 flex-col justify-center">{children}</main>

        {/* Footer */}
        <footer className="mt-8 space-y-3">
          <div className="flex items-center justify-center gap-2 text-[10px] font-medium text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500/70" />
            <span>Payments processed securely by SuperChat BD</span>
          </div>
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-600">
            <Sparkles className="h-3 w-3 text-teal-500/60" />
            <span>bKash · Nagad · Rocket · Card · Bank</span>
          </div>
          <BrandCredit variant="compact" />
        </footer>
      </div>
    </div>
  );
};

export default PaymentShell;
