import React, { useEffect, useState } from 'react';

interface MaintenanceScreenProps {
  message?: string;
  eta?: string;
  /** Called when the visitor taps "Check again". Should resolve once the check finishes. */
  onRetry?: () => Promise<void> | void;
}

const STATUS_LINES = [
  '🔧 Tuning the engines…',
  '🚀 Boosting performance…',
  '🛡️ Strengthening security…',
  '✨ Polishing the interface…',
  '📦 Packing new features…',
];

/**
 * Full-screen maintenance page. Pure CSS animations (no extra dependencies),
 * mobile-first, and respects "reduce motion".
 */
export const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({ message, eta, onRetry }) => {
  const [lineIndex, setLineIndex] = useState(0);
  const [checking, setChecking] = useState(false);
  const [justChecked, setJustChecked] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setLineIndex((i) => (i + 1) % STATUS_LINES.length), 2600);
    return () => clearInterval(t);
  }, []);

  const handleRetry = async () => {
    if (checking) return;
    setChecking(true);
    setJustChecked(false);
    try { await onRetry?.(); } catch { /* ignore */ }
    setTimeout(() => { setChecking(false); setJustChecked(true); }, 700);
  };

  return (
    <div className="pnm-root" role="status" aria-live="polite">
      <style>{CSS}</style>

      {/* Background glow + floating emoji */}
      <div className="pnm-bg" aria-hidden="true">
        <span className="pnm-orb pnm-orb-a" />
        <span className="pnm-orb pnm-orb-b" />
        <span className="pnm-float pnm-f1">✨</span>
        <span className="pnm-float pnm-f2">🚀</span>
        <span className="pnm-float pnm-f3">⚡</span>
        <span className="pnm-float pnm-f4">🛠️</span>
        <span className="pnm-float pnm-f5">💫</span>
      </div>

      <div className="pnm-card">
        {/* Animated gears */}
        <div className="pnm-gears" aria-hidden="true">
          <span className="pnm-ring" />
          <span className="pnm-gear pnm-gear-big">⚙️</span>
          <span className="pnm-gear pnm-gear-small">⚙️</span>
          <span className="pnm-wrench">🔧</span>
        </div>

        <div className="pnm-badge">🚧 Scheduled Upgrade</div>

        <h1 className="pnm-title">We&apos;re upgrading! 🚀</h1>

        <p className="pnm-msg">{message || 'We are upgrading to make everything faster and better. Please check back soon!'}</p>

        {eta ? (
          <div className="pnm-eta">
            <span aria-hidden="true">⏰</span>
            <span>Expected back: <strong>{eta}</strong></span>
          </div>
        ) : null}

        {/* Shimmering progress bar */}
        <div className="pnm-bar" aria-hidden="true"><span className="pnm-bar-fill" /></div>
        <p className="pnm-status" key={lineIndex}>{STATUS_LINES[lineIndex]}</p>

        <button type="button" className="pnm-btn" onClick={handleRetry} disabled={checking}>
          <span className={checking ? 'pnm-spin' : ''} aria-hidden="true">🔄</span>
          <span>{checking ? 'Checking…' : 'Check again'}</span>
        </button>
        <p className="pnm-hint">
          {justChecked ? '😴 Still upgrading — we\'ll let you in automatically.' : '🔔 This page refreshes automatically when we\'re back.'}
        </p>

        <p className="pnm-foot">Thank you for your patience 💚 — X AD MARKETING</p>
      </div>
    </div>
  );
};

const CSS = `
.pnm-root{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;overflow-y:auto;
  padding:max(16px,env(safe-area-inset-top,0px)) 16px max(16px,env(safe-area-inset-bottom,0px));
  background:radial-gradient(1200px 700px at 15% 0%,#0f2a2e 0%,transparent 60%),radial-gradient(900px 600px at 100% 100%,#1b1a3a 0%,transparent 55%),#070b14;
  color:#e2e8f0;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-text-size-adjust:100%}
.pnm-bg{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.pnm-orb{position:absolute;border-radius:9999px;filter:blur(70px);opacity:.35;animation:pnm-drift 14s ease-in-out infinite}
.pnm-orb-a{width:320px;height:320px;background:#14b8a6;top:-80px;left:-80px}
.pnm-orb-b{width:360px;height:360px;background:#6366f1;bottom:-120px;right:-100px;animation-delay:-6s}
.pnm-float{position:absolute;font-size:22px;opacity:.55;animation:pnm-floaty 7s ease-in-out infinite}
.pnm-f1{top:12%;left:10%;animation-delay:0s}.pnm-f2{top:20%;right:12%;animation-delay:-2s;font-size:26px}
.pnm-f3{bottom:18%;left:14%;animation-delay:-4s}.pnm-f4{bottom:12%;right:16%;animation-delay:-1s}
.pnm-f5{top:55%;left:5%;animation-delay:-3s;font-size:18px}
.pnm-card{position:relative;width:100%;max-width:440px;margin:auto;text-align:center;padding:28px 20px 22px;border-radius:28px;
  background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.18);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
  box-shadow:0 30px 80px -20px rgba(0,0,0,.7),0 0 0 1px rgba(45,212,191,.06) inset;animation:pnm-in .7s cubic-bezier(.22,1,.36,1) both}
@media(min-width:480px){.pnm-card{padding:36px 32px 26px}}
.pnm-gears{position:relative;width:128px;height:112px;margin:0 auto 14px}
.pnm-ring{position:absolute;left:50%;top:50%;width:92px;height:92px;margin:-46px 0 0 -46px;border-radius:9999px;border:2px solid rgba(45,212,191,.5);animation:pnm-pulse 2.4s ease-out infinite}
.pnm-gear{position:absolute;line-height:1;display:block}
.pnm-gear-big{font-size:64px;left:12px;top:16px;animation:pnm-spin 7s linear infinite;filter:drop-shadow(0 0 14px rgba(45,212,191,.45))}
.pnm-gear-small{font-size:38px;right:6px;bottom:6px;animation:pnm-spin-rev 5s linear infinite;filter:drop-shadow(0 0 10px rgba(129,140,248,.5))}
.pnm-wrench{position:absolute;font-size:28px;right:14px;top:2px;transform-origin:30% 80%;animation:pnm-wiggle 1.6s ease-in-out infinite}
.pnm-badge{display:inline-block;max-width:100%;padding:5px 12px;border-radius:9999px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  color:#fcd34d;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.35)}
.pnm-title{margin:14px 0 0;font-size:24px;line-height:1.2;font-weight:800;letter-spacing:-.02em;overflow-wrap:anywhere;
  background:linear-gradient(90deg,#5eead4,#a5b4fc,#5eead4);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:pnm-shine 6s linear infinite}
@media(min-width:480px){.pnm-title{font-size:28px}}
.pnm-msg{margin:12px 0 0;font-size:14.5px;line-height:1.65;color:#cbd5e1;white-space:pre-line;overflow-wrap:anywhere;word-break:break-word}
.pnm-eta{display:inline-flex;align-items:center;gap:8px;margin-top:14px;padding:8px 14px;border-radius:14px;font-size:13px;color:#a7f3d0;
  background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.28);max-width:100%;overflow-wrap:anywhere;text-align:left}
.pnm-eta strong{color:#ecfdf5}
.pnm-bar{position:relative;height:8px;margin:22px 4px 0;border-radius:9999px;background:rgba(148,163,184,.16);overflow:hidden}
.pnm-bar-fill{position:absolute;inset:0;width:45%;border-radius:9999px;background:linear-gradient(90deg,#14b8a6,#6366f1,#14b8a6);background-size:200% 100%;animation:pnm-bar 1.9s ease-in-out infinite,pnm-shine 2.4s linear infinite}
.pnm-status{margin:12px 0 0;min-height:20px;font-size:13px;font-weight:600;color:#94a3b8;animation:pnm-swap .5s ease both}
.pnm-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;margin-top:20px;min-height:46px;padding:0 22px;border:0;border-radius:14px;cursor:pointer;
  font-size:14px;font-weight:700;color:#04201c;background:linear-gradient(135deg,#2dd4bf,#34d399);box-shadow:0 10px 30px -10px rgba(45,212,191,.7);transition:transform .15s,opacity .15s}
.pnm-btn:active{transform:scale(.97)}.pnm-btn:disabled{opacity:.75;cursor:wait}
.pnm-spin{display:inline-block;animation:pnm-spin 0.9s linear infinite}
.pnm-hint{margin:12px 0 0;font-size:12px;line-height:1.5;color:#94a3b8;overflow-wrap:anywhere}
.pnm-foot{margin:18px 0 0;padding-top:14px;border-top:1px solid rgba(148,163,184,.14);font-size:11.5px;color:#64748b}
@keyframes pnm-in{from{opacity:0;transform:translateY(24px) scale(.97)}to{opacity:1;transform:none}}
@keyframes pnm-spin{to{transform:rotate(360deg)}}
@keyframes pnm-spin-rev{to{transform:rotate(-360deg)}}
@keyframes pnm-wiggle{0%,100%{transform:rotate(-14deg)}50%{transform:rotate(18deg)}}
@keyframes pnm-pulse{0%{transform:scale(.8);opacity:.8}100%{transform:scale(1.5);opacity:0}}
@keyframes pnm-floaty{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-18px) rotate(8deg)}}
@keyframes pnm-drift{0%,100%{transform:translate(0,0)}50%{transform:translate(30px,24px)}}
@keyframes pnm-shine{to{background-position:200% 0}}
@keyframes pnm-bar{0%{transform:translateX(-110%)}100%{transform:translateX(240%)}}
@keyframes pnm-swap{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.pnm-root *,.pnm-card{animation-duration:.01ms!important;animation-iteration-count:1!important}}
`;
