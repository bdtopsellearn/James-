import React, { useEffect, useRef } from 'react';

interface OtpInputProps {
  /** Current code value (digits only). */
  value: string;
  onChange: (value: string) => void;
  /** Fired once the full code has been entered (typing or paste). */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

/**
 * Segmented one-time-password input (auto-advance, paste + arrow/backspace
 * handling). Used by the admin login 2FA step and the authenticator setup card.
 */
export const OtpInput: React.FC<OtpInputProps> = ({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  autoFocus,
  className,
}) => {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] || '');

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => refs.current[0]?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  const commit = (arr: string[]) => {
    const joined = arr.join('').replace(/\D/g, '').slice(0, length);
    onChange(joined);
    if (joined.length === length) onComplete?.(joined);
  };

  const handleChange = (i: number, raw: string) => {
    const val = raw.replace(/\D/g, '');
    if (!val) {
      const arr = digits.slice();
      arr[i] = '';
      commit(arr);
      return;
    }
    if (val.length > 1) {
      // paste / OS autofill of the whole code
      const chars = val.slice(0, length).split('');
      const arr = digits.slice();
      for (let k = 0; k < chars.length && i + k < length; k++) arr[i + k] = chars[k];
      commit(arr);
      refs.current[Math.min(i + chars.length, length - 1)]?.focus();
      return;
    }
    const arr = digits.slice();
    arr[i] = val;
    commit(arr);
    if (i < length - 1) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        const arr = digits.slice();
        arr[i] = '';
        commit(arr);
        return;
      }
      if (i > 0) {
        refs.current[i - 1]?.focus();
        const arr = digits.slice();
        arr[i - 1] = '';
        commit(arr);
      }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < length - 1) {
      refs.current[i + 1]?.focus();
    }
  };

  return (
    <div className={`flex justify-center gap-2 sm:gap-2.5 ${className || ''}`}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          className="w-11 h-14 sm:w-12 sm:h-15 text-center text-2xl font-bold rounded-xl bg-slate-50 dark:bg-black border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/30 focus:scale-105 transition-all disabled:opacity-50"
        />
      ))}
    </div>
  );
};
