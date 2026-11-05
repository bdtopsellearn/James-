import React from 'react';
import { BadgeCheck } from 'lucide-react';
import { AdminBadge } from './AdminBadge';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  MembershipBadge — animated "verified" badge shown next to a user's name.
 * ─────────────────────────────────────────────────────────────────────────────
 *  The colour encodes how long the member has subscribed:
 *      • 1 month  → White  (silver seal)
 *      • 2 months → Red
 *      • 3 months → Black  (also any longer plan)
 *  Free users get a subtle animated "free" chip instead.
 *
 *  The seal gently bobs + a light sweeps across it (see `.pn-verified*` in
 *  index.css) so it reads as an animated verified emoji everywhere it appears.
 */

export type BadgeSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZES: Record<BadgeSize, { box: string; icon: string; text: string }> = {
  xs: { box: 'w-3.5 h-3.5', icon: 'w-2.5 h-2.5', text: 'text-[8px]' },
  sm: { box: 'w-4 h-4', icon: 'w-3 h-3', text: 'text-[9px]' },
  md: { box: 'w-5 h-5', icon: 'w-3.5 h-3.5', text: 'text-[10px]' },
  lg: { box: 'w-6 h-6', icon: 'w-4 h-4', text: 'text-[11px]' },
};

type Tier = 'white' | 'red' | 'black';

/** Map a plan id (e.g. "monthly", "plan_twomonth", "free") to a badge tier. */
export function planToTier(plan?: string | null): Tier | null {
  const key = String(plan || '').trim().toLowerCase().replace(/^plan_/, '');
  if (!key || key === 'free' || key === 'none' || key === 'trial') return null;
  if (key === 'monthly' || key === '1' || key === '1month' || key === 'onemonth') return 'white';
  if (key === 'twomonth' || key === '2' || key === '2months' || key === 'twomonths' || key === 'bimonthly') return 'red';
  return 'black'; // threemonth / 3 / anything longer
}

/** Human label for a plan id. */
export function planToLabel(plan?: string | null): string {
  const key = String(plan || '').trim().toLowerCase().replace(/^plan_/, '');
  if (key === 'monthly') return '1 Month';
  if (key === 'twomonth') return '2 Months';
  if (key === 'threemonth') return '3 Months';
  if (!key || key === 'free' || key === 'none' || key === 'trial') return 'Free';
  return key.replace(/^\w/, (c) => c.toUpperCase());
}

const TIER_STYLES: Record<Tier, { seal: string; icon: string; ring: string; name: string }> = {
  white: {
    seal: 'bg-gradient-to-br from-white to-slate-200',
    icon: 'text-slate-900',
    ring: 'ring-slate-300/90',
    name: 'White',
  },
  red: {
    seal: 'bg-gradient-to-br from-rose-500 to-red-600',
    icon: 'text-white',
    ring: 'ring-red-300/70',
    name: 'Red',
  },
  black: {
    seal: 'bg-gradient-to-br from-slate-800 to-black',
    icon: 'text-white',
    ring: 'ring-slate-500/60',
    name: 'Black',
  },
};

export interface MembershipBadgeProps {
  /** Plan id: "monthly" | "twomonth" | "threemonth" | "free" (or null). */
  plan?: string | null;
  /** Optional expiry; an expired paid plan renders as free. */
  expiresAt?: string | null;
  size?: BadgeSize;
  /** Show the tier label ("1 Month", "2 Months"…) next to the seal. */
  showLabel?: boolean;
  className?: string;
  /**
   * When set, the account is an administrator → render the animated AdminBadge
   * (👑 Super Admin / 🛡️ Admin) instead of the free/verified membership chip.
   */
  adminRole?: 'super_admin' | 'admin' | null;
  /** Explicit override for the Super Admin badge. */
  isSuperAdmin?: boolean;
}

export const MembershipBadge: React.FC<MembershipBadgeProps> = ({
  plan,
  expiresAt,
  size = 'sm',
  showLabel = false,
  className = '',
  adminRole,
  isSuperAdmin,
}) => {
  // Admins get their own animated role badge instead of the membership chip.
  if (adminRole || isSuperAdmin) {
    return (
      <AdminBadge
        role={adminRole}
        isSuperAdmin={isSuperAdmin}
        size={size}
        showLabel={showLabel}
        className={className}
      />
    );
  }

  const tier = planToTier(plan);
  const s = SIZES[size];

  // An expired paid membership should read as free again.
  const expired = (() => {
    if (!tier || !expiresAt) return false;
    const t = new Date(expiresAt).getTime();
    return Number.isFinite(t) && t > 0 && t < Date.now();
  })();

  if (!tier || expired) {
    return (
      <span
        className={`pn-badge-free inline-flex items-center gap-0.5 rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-[1px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 align-middle ${s.text} ${className}`}
        title="Free member — upgrade to get a verified badge"
      >
        <span className="pn-badge-free-emoji">🆓</span>
        free
      </span>
    );
  }

  const st = TIER_STYLES[tier];
  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className}`}>
      <span
        className={`pn-verified relative inline-flex items-center justify-center rounded-full ring-1 ${st.seal} ${st.ring} ${s.box} shadow-sm`}
        title={`Verified ${st.name} member`}
        aria-label={`Verified ${st.name} member`}
      >
        <BadgeCheck className={`${s.icon} ${st.icon} relative z-10`} strokeWidth={2.6} />
        <span className="pn-verified-shine pointer-events-none absolute inset-0 rounded-full" />
      </span>
      {showLabel && (
        <span className={`font-bold text-slate-600 dark:text-slate-300 ${s.text}`}>
          {planToLabel(plan)}
        </span>
      )}
    </span>
  );
};

export default MembershipBadge;
