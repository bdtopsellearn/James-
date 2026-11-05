import React from 'react';
import { BrandLogo } from './BrandLogo';

interface BrandLoaderProps {
  /** Small caption shown under the spinner (e.g. "Preparing your dashboard…"). */
  label?: string;
  /** Full-screen (boot) vs. inline (view fallback). */
  fullscreen?: boolean;
}

/**
 * Premium branded loader — replaces the bare spinners that used to flash during
 * boot and while lazy view chunks load. Pure CSS, no heavy filters, so it stays
 * smooth on low-end phones.
 */
export const BrandLoader: React.FC<BrandLoaderProps> = ({ label = 'Loading…', fullscreen = false }) => {
  return (
    <div
      className={`flex items-center justify-center ${fullscreen ? 'min-h-dvh' : 'min-h-[60vh]'} bg-[#04070f] text-white`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <style>{`
        @keyframes blSpin { to { transform: rotate(360deg); } }
        @keyframes blPulse { 0%,100% { opacity:.45; transform: scale(.96); } 50% { opacity:.9; transform: scale(1.04); } }
        @keyframes blDot { 0%,80%,100% { opacity:.25; transform: translateY(0); } 40% { opacity:1; transform: translateY(-3px); } }
      `}</style>
      <div className="flex flex-col items-center gap-5">
        <div className="relative flex items-center justify-center w-24 h-24">
          {/* soft glow */}
          <div className="absolute inset-0 rounded-full blur-xl" style={{ background: 'radial-gradient(circle, rgba(52,211,153,.4), transparent 70%)', animation: 'blPulse 2.4s ease-in-out infinite' }} />
          {/* rotating gradient ring */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'conic-gradient(from 0deg, transparent 0deg, #34d399 120deg, #22d3ee 240deg, transparent 360deg)',
              WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))',
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))',
              animation: 'blSpin 1.1s linear infinite',
            }}
          />
          <BrandLogo size="md" />
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                style={{ animation: `blDot 1.2s ease-in-out ${i * 0.16}s infinite` }}
              />
            ))}
          </div>
          <span className="text-[11px] uppercase tracking-[0.28em] text-emerald-200/60 font-semibold">{label}</span>
        </div>
      </div>
    </div>
  );
};
