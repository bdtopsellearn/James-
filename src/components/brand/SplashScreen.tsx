import React, { useEffect, useMemo, useState } from 'react';
import { BrandLogo } from './BrandLogo';

interface SplashScreenProps {
  onComplete: () => void;
}

// Snappy intro: the ring fills, the screen fades, we're in. Whole thing ≈ 1.7 s.
const FILL_MS = 1300;
const LEAVE_MS = 1450;
const DONE_MS = 1700;

const PHASES = [
  { from: 0, text: 'Booting the traffic engine' },
  { from: 22, text: 'Warming up CPM boosters' },
  { from: 46, text: 'Syncing your SmartLinks' },
  { from: 70, text: 'Calibrating human behaviour' },
  { from: 92, text: 'Ready' },
];

const TITLE = 'X AD MARKETING';
const SUBTITLE = 'PREMIUM TRAFFIC & MONETIZATION';

/** Bangladesh time (UTC+6), 12-hour clock, and a greeting for that hour. */
function dhakaNow() {
  const now = new Date();
  const hour24 = (now.getUTCHours() + 6) % 24;
  const greeting = hour24 < 5 ? 'Good night' : hour24 < 12 ? 'Good morning' : hour24 < 17 ? 'Good afternoon' : hour24 < 21 ? 'Good evening' : 'Good night';
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Dhaka' });
  return { greeting, time };
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [risen, setRisen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [clock] = useState(dhakaNow);

  useEffect(() => {
    const start = performance.now();
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setRisen(true)));

    const tick = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / FILL_MS);
      // ease-out: the number always climbs, never stalls.
      setProgress(Math.round((1 - Math.pow(1 - t, 2.6)) * 100));
    }, 30);
    const leave = window.setTimeout(() => setLeaving(true), LEAVE_MS);
    const done = window.setTimeout(() => { setProgress(100); onComplete(); }, DONE_MS);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(tick);
      window.clearTimeout(leave);
      window.clearTimeout(done);
    };
  }, [onComplete]);

  const phase = [...PHASES].reverse().find((p) => progress >= p.from) || PHASES[0];

  // deterministic pseudo-random particles (stable across renders) — kept few so
  // the intro stays smooth even on low-end phones.
  const particles = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const seed = (i * 9301 + 49297) % 233280;
    const rnd = seed / 233280;
    const rnd2 = ((i * 4523 + 7919) % 10000) / 10000;
    return {
      left: `${(rnd * 100).toFixed(1)}%`,
      size: 2 + Math.round(rnd2 * 3),
      delay: `${(rnd * 2.0).toFixed(2)}s`,
      dur: `${3.4 + rnd2 * 2.6}s`,
      hue: i % 3 === 0 ? '#34d399' : i % 3 === 1 ? '#22d3ee' : '#a78bfa',
    };
  }), []);

  // progress ring geometry
  const R = 92;
  const CIRC = 2 * Math.PI * R;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col text-white select-none overflow-hidden bg-[#04070f] transition-opacity duration-300 ${leaving ? 'opacity-0' : 'opacity-100'}`}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <style>{`
        @keyframes spAurora { 0% { transform: translate3d(-8%, -4%, 0) scale(1); } 50% { transform: translate3d(6%, 5%, 0) scale(1.15); } 100% { transform: translate3d(-8%, -4%, 0) scale(1); } }
        @keyframes spAurora2 { 0% { transform: translate3d(6%, 6%, 0) scale(1.1); } 50% { transform: translate3d(-6%, -5%, 0) scale(1); } 100% { transform: translate3d(6%, 6%, 0) scale(1.1); } }
        @keyframes spSpin { to { transform: rotate(360deg); } }
        @keyframes spPop { 0% { opacity: 0; transform: scale(.6); } 60% { opacity: 1; transform: scale(1.06); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes spLetter { 0% { opacity: 0; transform: translateY(20px) rotateX(-60deg); } 100% { opacity: 1; transform: none; } }
        @keyframes spRise { 0% { opacity: 0; transform: translateY(40px); } 12% { opacity: .85; } 100% { opacity: 0; transform: translateY(-130px); } }
        @keyframes spShimmer { 0% { transform: translateX(-120%); } 100% { transform: translateX(320%); } }
        @keyframes spGlow { 0%,100% { opacity: .4; } 50% { opacity: .9; } }
        @keyframes spFadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        @keyframes spFloatY { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
        @keyframes spSheen { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
        @keyframes spGlassIn { 0% { opacity: 0; transform: translateY(24px) scale(.94); } 100% { opacity: 1; transform: none; } }
        .sp-letter { display: inline-block; animation: spLetter .55s cubic-bezier(.22,1,.36,1) both; }
        .sp-particle { position: absolute; bottom: -20px; border-radius: 9999px; animation-name: spRise; animation-iteration-count: infinite; animation-timing-function: ease-in; }
        .sp-fadeup { animation: spFadeUp .55s ease-out both; }
        .sp-glass-in { animation: spGlassIn .7s cubic-bezier(.22,1,.36,1) both; }
        .sp-title {
          background: linear-gradient(100deg,#ffffff 0%,#a7f3d0 25%,#ffffff 50%,#bae6fd 75%,#ffffff 100%);
          background-size: 200% auto;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: spSheen 3.4s linear infinite;
        }
        .sp-glass {
          background: linear-gradient(160deg, rgba(255,255,255,.10), rgba(255,255,255,.02));
          -webkit-backdrop-filter: blur(14px) saturate(170%);
          backdrop-filter: blur(14px) saturate(170%);
          border: 1px solid rgba(255,255,255,.14);
          box-shadow: 0 30px 80px -30px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.22);
        }
        .sp-glass-pill {
          background: linear-gradient(160deg, rgba(255,255,255,.10), rgba(255,255,255,.03));
          -webkit-backdrop-filter: blur(12px) saturate(160%);
          backdrop-filter: blur(12px) saturate(160%);
          border: 1px solid rgba(255,255,255,.12);
          box-shadow: 0 18px 50px -24px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.18);
        }
        @media (prefers-reduced-motion: reduce) {
          .sp-letter, .sp-particle, .sp-fadeup, .sp-title, .sp-glass-in { animation: none !important; }
        }
      `}</style>

      {/* ── animated aurora background (lighter blur = smoother) ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-32 w-[70vmax] h-[70vmax] max-w-[820px] max-h-[820px] rounded-full bg-emerald-500/20 blur-[90px]" style={{ animation: 'spAurora 11s ease-in-out infinite' }} />
        <div className="absolute -bottom-48 -right-24 w-[66vmax] h-[66vmax] max-w-[760px] max-h-[760px] rounded-full bg-violet-600/20 blur-[100px]" style={{ animation: 'spAurora2 13s ease-in-out infinite' }} />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[48vmax] h-[48vmax] max-w-[560px] max-h-[560px] rounded-full bg-cyan-500/10 blur-[80px]" style={{ animation: 'spAurora 15s ease-in-out infinite' }} />
      </div>

      {/* ── grid ── */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.13]"
        style={{
          backgroundImage: 'linear-gradient(rgba(148,163,184,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.25) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 78%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 78%)',
        }}
      />

      {/* ── rising particles ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {particles.map((p, i) => (
          <span
            key={i}
            className="sp-particle"
            style={{ left: p.left, width: p.size, height: p.size, background: p.hue, boxShadow: `0 0 8px ${p.hue}`, animationDelay: p.delay, animationDuration: p.dur }}
          />
        ))}
      </div>

      {/* ── top bar: greeting + Dhaka clock ── */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-4 text-[11px] sm:text-[12px] text-emerald-100/60">
        <span className="inline-flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ animation: 'spGlow 1.6s ease-in-out infinite' }} />
          {clock.greeting}
        </span>
        <span className="tabular-nums">Dhaka · {clock.time}</span>
      </div>

      {/* ── center stage: liquid-glass app tile + progress ring ── */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center min-h-0">
        <div
          className={`sp-glass-in relative transition-all duration-700 ease-out ${risen ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}
          style={{ animation: 'spFloatY 5s ease-in-out infinite' }}
        >
          {/* soft halo */}
          <div className="absolute inset-0 -m-10 rounded-full opacity-70 blur-2xl" style={{ background: 'radial-gradient(circle, rgba(52,211,153,.35), transparent 70%)', animation: 'spGlow 2.6s ease-in-out infinite' }} />

          {/* progress ring (SVG) */}
          <svg width="230" height="230" viewBox="0 0 230 230" className="relative block -rotate-90">
            <defs>
              <linearGradient id="spRing" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="50%" stopColor="#2dd4bf" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
            <circle cx="115" cy="115" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="4" />
            <circle
              cx="115" cy="115" r={R} fill="none"
              stroke="url(#spRing)" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - progress / 100)}
              style={{ transition: 'stroke-dashoffset 120ms linear', filter: 'drop-shadow(0 0 8px rgba(45,212,191,.7))' }}
            />
          </svg>

          {/* the glass app tile with the logo + rotating gradient ring */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative flex items-center justify-center w-[150px] h-[150px]">
              {/* rotating conic ring */}
              <div
                className="absolute -inset-[3px] rounded-[41px] opacity-90"
                style={{ background: 'conic-gradient(from 0deg, #34d399, #22d3ee, #a78bfa, #34d399)', animation: 'spSpin 5s linear infinite', filter: 'blur(0.5px)' }}
              />
              <div className="sp-glass absolute inset-0 rounded-[38px]" style={{ animation: 'spPop .8s cubic-bezier(.22,1,.36,1) both' }}>
                <div className="absolute inset-0 rounded-[38px] pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.35), transparent 42%)', opacity: .5, mixBlendMode: 'overlay' }} />
              </div>
              <BrandLogo size="xl" className="relative" />
            </div>
          </div>
        </div>

        <h1 className="mt-7 text-[clamp(22px,7vw,42px)] leading-none font-extrabold tracking-tight">
          {TITLE.split('').map((ch, i) => (
            <span key={i} className="sp-letter sp-title" style={{ animationDelay: `${140 + i * 34}ms` }}>
              {ch === ' ' ? '\u00A0' : ch}
            </span>
          ))}
        </h1>
        <p className="mt-2 text-[10px] uppercase tracking-[0.34em] text-emerald-200/50 font-semibold sp-fadeup" style={{ animationDelay: '560ms' }}>
          {SUBTITLE}
        </p>

        <p className="mt-3 text-[12.5px] sm:text-sm text-emerald-200/70 max-w-sm sp-fadeup px-2" style={{ animationDelay: '660ms' }}>
          Grow, connect, succeed — your CPM-boosted SmartLink traffic dashboard.
        </p>
      </div>

      {/* ── bottom: glass progress pill ── */}
      <div className="relative z-10 px-6 pb-7">
        <div className="mx-auto w-full max-w-sm sp-glass-pill rounded-2xl px-4 py-3">
          <div className="flex items-center justify-between text-[11px] mb-2">
            <span className="text-emerald-100/70 tabular-nums font-semibold">{progress}%</span>
            <span role="status" aria-live="polite" className="text-emerald-100/70">
              <span key={phase.text} className="inline-block sp-fadeup">{phase.text}</span>
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label="Loading"
            className="relative h-2 w-full rounded-full bg-white/[0.07] overflow-hidden border border-white/5"
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-[width] duration-100 ease-out"
              style={{ width: `${progress}%`, boxShadow: '0 0 18px rgba(45,212,191,.6)' }}
            >
              <span className="absolute inset-0 overflow-hidden rounded-full">
                <span className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent" style={{ animation: 'spShimmer 1.2s linear infinite' }} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
