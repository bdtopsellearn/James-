import React, { useEffect, useRef, useState } from 'react';

/* ──────────────────────────────────────────────────────────────────────────────
   AnimatedNumber — premium count-up micro-interaction.
   Smoothly tweens from the previous value to the new one (cubic ease-out) and
   respects `prefers-reduced-motion`. Used across stat cards & dashboards.
   ────────────────────────────────────────────────────────────────────────────── */

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  /** Formatter for the animated value (defaults to rounded thousands-separated). */
  format?: (n: number) => string;
  className?: string;
  /** Optional prefix/suffix rendered as static text. */
  prefix?: string;
  suffix?: string;
}

const defaultFormat = (n: number) => Math.round(n).toLocaleString('en-US');

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  duration = 900,
  format = defaultFormat,
  className,
  prefix,
  suffix,
}) => {
  const target = Number.isFinite(value) ? value : 0;
  const [display, setDisplay] = useState<number>(target);
  const fromRef = useRef<number>(target);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }

    const from = fromRef.current;
    if (from === target) {
      setDisplay(target);
      return;
    }

    startRef.current = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(from + (target - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        setDisplay(target);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = target;
    };
  }, [target, duration]);

  return (
    <span className={className}>
      {prefix}
      {format(display)}
      {suffix}
    </span>
  );
};
