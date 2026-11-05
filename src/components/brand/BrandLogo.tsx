import React, { useEffect, useId, useState } from 'react';

// Drop your own logo into  public/logo.png  and it is used everywhere automatically
// (sidebar, top bar, login, splash, invoices). If the file is missing the built-in
// SVG emblem is shown instead.
let customLogoState: boolean | null = null;
function useCustomLogo(): boolean {
  const [ok, setOk] = useState<boolean | null>(customLogoState);
  useEffect(() => {
    if (customLogoState !== null) return;
    const im = new Image();
    im.onload = () => { customLogoState = im.naturalWidth > 0; setOk(customLogoState); };
    im.onerror = () => { customLogoState = false; setOk(false); };
    im.src = '/logo.png?v=14';
  }, []);
  return ok === true;
}

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = '',
  size = 'md',
  showText = false
}) => {
  const sizeMap = {
    sm: 'w-11 h-11',
    md: 'w-14 h-14',
    lg: 'w-[4.5rem] h-[4.5rem]',
    xl: 'w-28 h-28'
  };
  const customLogo = useCustomLogo();

  // Unique gradient/filter IDs per instance (duplicate IDs break fills when
  // the first instance is inside a display:none container, e.g. hidden sidebar)
  const uid = useId().replace(/:/g, '');
  const ids = {
    neonRing: `neonRing-${uid}`,
    silverGrad: `silverGrad-${uid}`,
    emeraldGrad: `emeraldGrad-${uid}`,
    glow: `glow-${uid}`
  };

  // Fine details (tiny text, dots, badge) are unreadable on small logos
  const showDetails = size === 'lg' || size === 'xl';

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <div className={`relative ${sizeMap[size]} shrink-0`}>
        {/* Ambient Neon Glow — multi-layer + animated, and it deliberately extends
            BEYOND the logo bounds so it reads as a true halo on every surface
            (login panel, sidebar, splash, invoices) instead of a faint inner tint. */}
        <div className="pn-logo-glow absolute -inset-3 rounded-[36%] pointer-events-none" aria-hidden="true" />
        <div className="pn-logo-glow-ring absolute -inset-1.5 rounded-[30%] pointer-events-none" aria-hidden="true" />
        <div className="absolute inset-0 rounded-[26%] bg-teal-500/25 blur-[6px] animate-pulse" aria-hidden="true" />

        {customLogo ? (
          <img
            src="/logo.png?v=14"
            alt="X AD MARKETING"
            draggable={false}
            className="relative w-full h-full rounded-[26%] object-cover select-none pn-logo ring-1 ring-teal-400/30"
          />
        ) : (
        /* SVG Circular Emblem reproducing the user's uploaded logo */
        <svg
          viewBox="0 0 200 200"
          className="relative w-full h-full select-none pn-logo"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id={ids.neonRing} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="50%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>

            <linearGradient id={ids.silverGrad} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="40%" stopColor="#e2e8f0" />
              <stop offset="80%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>

            <linearGradient id={ids.emeraldGrad} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="50%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#047857" />
            </linearGradient>

            <filter id={ids.glow} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Outer Black Disc */}
          <circle cx="100" cy="100" r="95" fill="#090d16" stroke="#10b981" strokeWidth="4" />
          <circle cx="100" cy="100" r="88" stroke="#34d399" strokeWidth="1.5" strokeOpacity="0.7" strokeDasharray="5 3" />

          {showDetails && (<g>
          {/* Background World Grid Dots Subtle */}
          <circle cx="70" cy="55" r="1.5" fill="#10b981" fillOpacity="0.4" />
          <circle cx="85" cy="52" r="1.5" fill="#10b981" fillOpacity="0.4" />
          <circle cx="100" cy="50" r="1.5" fill="#10b981" fillOpacity="0.4" />
          <circle cx="115" cy="52" r="1.5" fill="#10b981" fillOpacity="0.4" />
          <circle cx="130" cy="55" r="1.5" fill="#10b981" fillOpacity="0.4" />

          </g>)}

          <g transform={showDetails ? undefined : 'translate(100 100) scale(1.25) translate(-100 -76)'}>
          {/* Crown on Top */}
          <path
            d="M85 38 L92 48 L100 35 L108 48 L115 38 L114 52 L86 52 Z"
            fill={`url(#${ids.emeraldGrad})`}
            filter={`url(#${ids.glow})`}
          />
          <circle cx="85" cy="36" r="2" fill="#ffffff" />
          <circle cx="100" cy="33" r="2.5" fill="#ffffff" />
          <circle cx="115" cy="36" r="2" fill="#ffffff" />

          {/* Megaphone on Left */}
          <g transform="translate(32, 60) rotate(-15) scale(0.65)">
            <path d="M5 12 L15 6 L15 18 Z" fill="#ffffff" />
            <path d="M15 8 L28 4 L28 20 L15 16 Z" fill={`url(#${ids.silverGrad})`} />
            <path d="M28 20 L24 28 L20 28 L24 20 Z" fill="#10b981" />
            <path d="M30 7 C33 9 33 15 30 17" stroke="#34d399" strokeWidth="2" strokeLinecap="round" />
          </g>

          {/* Growth Chart on Right */}
          <g transform="translate(142, 65) scale(0.7)">
            <rect x="0" y="16" width="5" height="12" rx="1" fill="#10b981" />
            <rect x="8" y="10" width="5" height="18" rx="1" fill="#34d399" />
            <rect x="16" y="4" width="5" height="24" rx="1" fill={`url(#${ids.silverGrad})`} />
            <path d="M0 12 L10 5 L20 0" stroke="#34d399" strokeWidth="2" strokeLinecap="round" />
            <path d="M16 0 L21 0 L21 5" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" />
          </g>

          {/* Central 3D Monogram: Glowing Futuristic 'X' */}
          <text
            x="100"
            y="102"
            textAnchor="middle"
            fill={`url(#${ids.emeraldGrad})`}
            filter={`url(#${ids.glow})`}
            fontSize="54"
            fontWeight="900"
            fontFamily="system-ui, -apple-system, sans-serif"
            letterSpacing="2"
          >
            X
          </text>
          <text
            x="100"
            y="102"
            textAnchor="middle"
            fill={`url(#${ids.silverGrad})`}
            fontSize="54"
            fontWeight="900"
            fontFamily="system-ui, -apple-system, sans-serif"
            letterSpacing="2"
            opacity="0.3"
          >
            X
          </text>

          {/* Dynamic Soaring Arrow cutting through X */}
          <path
            d="M62 116 Q100 102 142 68 L149 75 L151 52 L128 56 L134 62 Q95 94 62 116 Z"
            fill={`url(#${ids.neonRing})`}
            filter={`url(#${ids.glow})`}
          />

          </g>

          {showDetails && (<g>
          {/* XX AD MARKETING Wordmark in Metallic Silver & Emerald */}
          <text
            x="100"
            y="142"
            textAnchor="middle"
            fill={`url(#${ids.silverGrad})`}
            fontSize="14"
            fontWeight="900"
            fontFamily="system-ui, -apple-system, sans-serif"
            letterSpacing="2"
          >
            X AD MARKETING
          </text>

          {/* Subtitle Slogan */}
          <text
            x="101.5"
            y="156"
            textAnchor="middle"
            fill="#34d399"
            fontSize="7"
            fontWeight="700"
            fontFamily="system-ui, -apple-system, sans-serif"
            letterSpacing="3"
          >
            GROW · CONNECT · SUCCEED
          </text>

          {/* Community Badge Tag */}
          <rect x="55" y="165" width="90" height="15" rx="3" fill="#0f172a" stroke="#10b981" strokeWidth="0.75" />
          <text
            x="100"
            y="173"
            textAnchor="middle"
            fill="#cbd5e1"
            fontSize="5"
            fontWeight="700"
            fontFamily="system-ui, sans-serif"
            letterSpacing="1.5"
          >
            MORE THAN MARKETING
          </text>
          <text
            x="100"
            y="178"
            textAnchor="middle"
            fill="#34d399"
            fontSize="4.5"
            fontWeight="600"
            fontFamily="system-ui, sans-serif"
            letterSpacing="1"
          >
            A COMMUNITY
          </text>
          </g>)}
        </svg>
        )}
      </div>

      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-none text-base">
              X AD MARKETING
            </span>
          </div>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold tracking-wider uppercase mt-1 whitespace-nowrap">
            Grow · Connect · Succeed
          </span>
        </div>
      )}
    </div>
  );
};
