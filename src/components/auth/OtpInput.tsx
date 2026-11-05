import React, { useRef } from 'react';

interface OtpInputProps {
  value: string;
  onChange: (digits: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Called once when the last digit is typed / pasted. */
  onComplete?: (digits: string) => void;
}

/**
 * Six separate boxes that behave like one field: paste, SMS auto-fill, backspace and
 * mobile keyboards all work because a single transparent real <input> sits on top.
 */
export const OtpInput: React.FC<OtpInputProps> = ({ value, onChange, length = 6, disabled, autoFocus, onComplete }) => {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = React.useState(false);

  const set = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, length);
    onChange(digits);
    if (digits.length === length && value.length !== length) onComplete?.(digits);
  };

  const active = Math.min(value.length, length - 1);

  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }} aria-hidden="true">
        {Array.from({ length }).map((_, i) => {
          const filled = i < value.length;
          const isActive = focused && i === active;
          return (
            <div
              key={i}
              className={`h-12 sm:h-14 rounded-xl border-2 flex items-center justify-center text-xl font-bold font-mono transition-all ${
                isActive
                  ? 'border-teal-500 ring-4 ring-teal-500/20 bg-white dark:bg-slate-900'
                  : filled
                  ? 'border-teal-500/60 bg-teal-50 dark:bg-teal-950/40 text-slate-900 dark:text-slate-100'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-400'
              } ${disabled ? 'opacity-60' : ''}`}
            >
              {filled ? value[i] : isActive ? <span className="w-px h-6 bg-teal-500 animate-pulse" /> : ''}
            </div>
          );
        })}
      </div>
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        maxLength={length}
        onChange={(e) => set(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label={`${length}-digit code`}
        className="absolute inset-0 w-full h-full opacity-0 cursor-text"
        style={{ fontSize: 16 }}
      />
    </div>
  );
};
