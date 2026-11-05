import React, { useState } from 'react';

interface ServerNotReadyScreenProps {
  /** Human-readable reason the server is not ready. */
  reason?: string;
  /** Raw technical detail (error message / status). */
  detail?: string;
  /** Re-check the server status. Should resolve once the check finishes. */
  onRetry?: () => Promise<void> | void;
  /** Open the first-run installer (/setup). */
  onOpenInstaller?: () => void;
  /** Force-continue to the admin sign-in (escape hatch when the check glitched). */
  onBypass?: () => void;
}

/**
 * Shown ONLY on the admin surface when the API reports the server is not ready
 * (Firebase not configured) or unreachable. Unlike the visitor maintenance page,
 * this gives the owner a clear diagnosis and a way forward — the installer, a
 * retry, and an escape hatch — so the admin is never locked out.
 */
export const ServerNotReadyScreen: React.FC<ServerNotReadyScreenProps> = ({
  reason,
  detail,
  onRetry,
  onOpenInstaller,
  onBypass,
}) => {
  const [checking, setChecking] = useState(false);
  const [justChecked, setJustChecked] = useState(false);

  const handleRetry = async () => {
    if (checking) return;
    setChecking(true);
    setJustChecked(false);
    try { await onRetry?.(); } catch { /* ignore */ }
    setTimeout(() => { setChecking(false); setJustChecked(true); }, 700);
  };

  return (
    <div className="snr-root" role="alert">
      <style>{CSS}</style>
      <div className="snr-bg" aria-hidden="true">
        <span className="snr-orb snr-orb-a" />
        <span className="snr-orb snr-orb-b" />
      </div>

      <div className="snr-card">
        <div className="snr-icon" aria-hidden="true">🛠️</div>
        <div className="snr-badge">Admin · Server Not Ready</div>
        <h1 className="snr-title">The server isn’t ready yet</h1>
        <p className="snr-msg">
          {reason || 'The API server could not confirm that it is fully configured.'}
        </p>

        {detail ? (
          <pre className="snr-detail">{detail}</pre>
        ) : null}

        <div className="snr-checks">
          <p className="snr-checks-title">What to check on the server</p>
          <ul>
            <li><code>pm2 list</code> — is <code>pnweb-api</code> online?</li>
            <li><code>pm2 logs pnweb-api --lines 60</code> — any startup errors?</li>
            <li>Is <code>firebase-service-account.json</code> present and valid?</li>
            <li>Open <code>/api/setup/status</code> — does it return <code>"ready": true</code>?</li>
          </ul>
        </div>

        <div className="snr-actions">
          <button type="button" className="snr-btn snr-btn-primary" onClick={handleRetry} disabled={checking}>
            <span className={checking ? 'snr-spin' : ''} aria-hidden="true">🔄</span>
            <span>{checking ? 'Checking…' : 'Retry connection'}</span>
          </button>
          <button type="button" className="snr-btn" onClick={onOpenInstaller}>
            ⚙️ Open installer
          </button>
          {onBypass ? (
            <button type="button" className="snr-btn snr-btn-ghost" onClick={onBypass}>
              Continue to admin sign-in →
            </button>
          ) : null}
        </div>

        <p className="snr-hint">
          {justChecked
            ? '😴 Still not ready — fix the server, then tap Retry again.'
            : 'This page does not block the admin: use the installer or continue to sign-in.'}
        </p>
        <p className="snr-foot">X AD MARKETING — Admin Diagnostics</p>
      </div>
    </div>
  );
};

const CSS = `
.snr-root{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;overflow-y:auto;
  padding:max(16px,env(safe-area-inset-top,0px)) 16px max(16px,env(safe-area-inset-bottom,0px));
  background:radial-gradient(1200px 700px at 15% 0%,#0f2a2e 0%,transparent 60%),radial-gradient(900px 600px at 100% 100%,#1b1a3a 0%,transparent 55%),#070b14;
  color:#e2e8f0;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-text-size-adjust:100%}
.snr-bg{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.snr-orb{position:absolute;border-radius:9999px;filter:blur(70px);opacity:.32;animation:snr-drift 14s ease-in-out infinite}
.snr-orb-a{width:320px;height:320px;background:#f59e0b;top:-80px;left:-80px}
.snr-orb-b{width:360px;height:360px;background:#6366f1;bottom:-120px;right:-100px;animation-delay:-6s}
.snr-card{position:relative;width:100%;max-width:520px;margin:auto;text-align:center;padding:28px 20px 22px;border-radius:28px;
  background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.18);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
  box-shadow:0 30px 80px -20px rgba(0,0,0,.7);animation:snr-in .6s cubic-bezier(.22,1,.36,1) both}
@media(min-width:480px){.snr-card{padding:34px 30px 26px}}
.snr-icon{font-size:46px;line-height:1;filter:drop-shadow(0 0 16px rgba(245,158,11,.4))}
.snr-badge{display:inline-block;margin-top:12px;padding:5px 12px;border-radius:9999px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  color:#fcd34d;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.35)}
.snr-title{margin:14px 0 0;font-size:22px;line-height:1.25;font-weight:800;letter-spacing:-.02em;color:#f8fafc;overflow-wrap:anywhere}
@media(min-width:480px){.snr-title{font-size:25px}}
.snr-msg{margin:12px 0 0;font-size:14px;line-height:1.6;color:#cbd5e1;overflow-wrap:anywhere}
.snr-detail{margin:14px 0 0;padding:10px 12px;border-radius:12px;text-align:left;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:11.5px;line-height:1.55;color:#fca5a5;background:rgba(244,63,94,.08);border:1px solid rgba(244,63,94,.28);
  white-space:pre-wrap;overflow-wrap:anywhere;max-height:150px;overflow:auto}
.snr-checks{margin:16px 0 0;padding:14px 16px;border-radius:14px;text-align:left;background:rgba(148,163,184,.07);border:1px solid rgba(148,163,184,.16)}
.snr-checks-title{margin:0 0 8px;font-size:12px;font-weight:700;color:#e2e8f0;text-transform:uppercase;letter-spacing:.05em}
.snr-checks ul{margin:0;padding-left:18px}
.snr-checks li{font-size:12.5px;line-height:1.75;color:#cbd5e1}
.snr-checks code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:#5eead4;background:rgba(45,212,191,.1);padding:1px 5px;border-radius:5px}
.snr-actions{display:flex;flex-direction:column;gap:10px;margin-top:18px}
@media(min-width:480px){.snr-actions{flex-direction:row;flex-wrap:wrap;justify-content:center}}
.snr-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 18px;border:1px solid rgba(148,163,184,.28);border-radius:14px;cursor:pointer;
  font-size:13.5px;font-weight:700;color:#e2e8f0;background:rgba(148,163,184,.08);transition:transform .15s,opacity .15s,background .15s}
.snr-btn:hover{background:rgba(148,163,184,.16)}
.snr-btn:active{transform:scale(.97)}.snr-btn:disabled{opacity:.7;cursor:wait}
.snr-btn-primary{color:#04201c;border:0;background:linear-gradient(135deg,#2dd4bf,#34d399);box-shadow:0 10px 30px -10px rgba(45,212,191,.7)}
.snr-btn-ghost{background:transparent;border-color:rgba(148,163,184,.2);color:#94a3b8}
.snr-spin{display:inline-block;animation:snr-spin 0.9s linear infinite}
.snr-hint{margin:14px 0 0;font-size:12px;line-height:1.5;color:#94a3b8;overflow-wrap:anywhere}
.snr-foot{margin:16px 0 0;padding-top:12px;border-top:1px solid rgba(148,163,184,.14);font-size:11.5px;color:#64748b}
@keyframes snr-in{from{opacity:0;transform:translateY(20px) scale(.98)}to{opacity:1;transform:none}}
@keyframes snr-spin{to{transform:rotate(360deg)}}
@keyframes snr-drift{0%,100%{transform:translate(0,0)}50%{transform:translate(30px,24px)}}
@media(prefers-reduced-motion:reduce){.snr-root *,.snr-card{animation-duration:.01ms!important;animation-iteration-count:1!important}}
`;
