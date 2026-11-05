import React, { useState } from 'react';

interface CountryFlagProps {
  /** ISO-3166 alpha-2 code, e.g. "BD". */
  code?: string;
  /** Explicit emoji flag (overrides code-derived emoji). */
  flag?: string;
  /** Human-readable country name (used for the tooltip / label). */
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Gentle wave animation — on by default. */
  animated?: boolean;
  /** Show the country name next to the flag. */
  showName?: boolean;
  className?: string;
}

/** Turn a 2-letter country code into its regional-indicator emoji flag. */
function codeToEmoji(code: string): string {
  const cc = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '\uD83C\uDFF3\uFE0F';
  try {
    return String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0)));
  } catch {
    return '\uD83C\uDFF3\uFE0F';
  }
}

// Pixel height per size (the flag keeps its natural aspect ratio).
const H: Record<string, number> = { sm: 12, md: 16, lg: 24 };

/**
 * Animated country flag badge.
 *
 * Emoji flags render inconsistently across platforms (Windows and several
 * Android builds show the two-letter code instead of a flag), so we render a
 * crisp PNG from flagcdn.com and gracefully fall back to the emoji — and then to
 * the country code — if the image can't load (offline / blocked).
 */
export const CountryFlag: React.FC<CountryFlagProps> = ({
  code,
  flag,
  name,
  size = 'md',
  animated = true,
  showName = false,
  className = '',
}) => {
  const cc = String(code || '').toUpperCase();
  const valid = /^[A-Z]{2}$/.test(cc);
  const emoji = flag || codeToEmoji(cc);
  const label = name || cc || 'Unknown';
  const [imgOk, setImgOk] = useState<boolean>(valid);
  const h = H[size] || 16;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {valid && imgOk ? (
        <img
          src={`https://flagcdn.com/w40/${cc.toLowerCase()}.png`}
          srcSet={`https://flagcdn.com/w80/${cc.toLowerCase()}.png 2x`}
          width={Math.round(h * 1.5)}
          height={h}
          alt={label}
          title={label}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImgOk(false)}
          className={`inline-block select-none rounded-[3px] object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.08)] ${animated ? 'pn-flag-wave' : ''}`}
          style={{ height: h, width: Math.round(h * 1.5) }}
        />
      ) : (
        <span
          className={`leading-none inline-block select-none ${animated ? 'pn-flag-wave' : ''} ${size === 'sm' ? 'text-sm' : size === 'md' ? 'text-base' : 'text-2xl'}`}
          role="img"
          aria-label={label}
          title={label}
        >
          {valid ? emoji : cc || '\uD83C\uDFF3\uFE0F'}
        </span>
      )}
      {showName && (
        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
          {label}
        </span>
      )}
    </span>
  );
};

export default CountryFlag;
