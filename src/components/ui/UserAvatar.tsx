import React from 'react';

interface UserAvatarProps {
  name?: string;
  src?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  tone?: 'teal' | 'amber';
  online?: boolean;
  className?: string;
}

const SIZES: Record<NonNullable<UserAvatarProps['size']>, string> = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-xl',
  xl: 'w-24 h-24 text-4xl',
};

/** One avatar used everywhere: shows the uploaded photo, or a gradient initial. */
export const UserAvatar: React.FC<UserAvatarProps> = ({
  name = '?',
  src,
  size = 'sm',
  tone = 'teal',
  online,
  className = '',
}) => {
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => setBroken(false), [src]);

  const initial = (name.trim().charAt(0) || '?').toUpperCase();
  const grad =
    tone === 'amber'
      ? 'from-amber-500 to-rose-500'
      : 'from-teal-500 to-emerald-600';

  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      {src && !broken ? (
        <img
          src={src}
          alt={name}
          onError={() => setBroken(true)}
          className={`${SIZES[size]} rounded-full object-cover ring-2 ring-white dark:ring-slate-900 shadow-sm`}
        />
      ) : (
        <span
          className={`${SIZES[size]} rounded-full bg-gradient-to-br ${grad} text-white font-bold flex items-center justify-center ring-2 ring-white dark:ring-slate-900 shadow-sm`}
        >
          {initial}
        </span>
      )}
      {online && (
        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
      )}
    </span>
  );
};
