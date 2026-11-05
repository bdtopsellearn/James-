import React from 'react';

/**
 * ────────────────────────────────────────────────────────────────────────────
 *  AdminBadge — animated role badge shown next to an administrator's name.
 * ────────────────────────────────────────────────────────────────────────────
 *  Admins no longer show the "free 🆓" membership chip. Instead they get a
 *  dedicated, animated role badge so they stand out at a glance:
 *
 *      • Root Super Admin → animated 👑 crown  (gold / amber, glowing)
 *      • Normal Admin     → animated 🛡️ shield (emerald / blue, pulsing)
 *
 *  The emoji gently bobs + glows and a light sweeps across the chip (see the
 *  `.pn-admin-*` rules in index.css), so it reads as a live, animated badge
 *  everywhere an admin name appears (top bar, sidebar, mobile drawer, admin
 *  roster, user details…).
 */

export type AdminBadgeSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZES: Record<AdminBadgeSize, { chip: string; emoji: string; text: string }> = {
  xs: { chip: 'px-1.5 py-[1px] gap-0.5', emoji: 'text-[9px]', text: 'text-[8px]' },
  sm: { chip: 'px-2 py-[2px] gap-1', emoji: 'text-[11px]', text: 'text-[9px]' },
  md: { chip: 'px-2.5 py-1 gap-1', emoji: 'text-[13px]', text: 'text-[10px]' },
  lg: { chip: 'px-3 py-1.5 gap-1.5', emoji: 'text-base', text: 'text-[11px]' },
};

export interface AdminBadgeProps {
  /** Admin role id. Anything other than "super_admin" renders the normal-admin badge. */
  role?: 'super_admin' | 'admin' | string | null;
  /** Explicit override — when true, always render the Super Admin badge. */
  isSuperAdmin?: boolean;
  size?: AdminBadgeSize;
  /** Show the text label ("Super Admin" / "Admin") next to the emoji. */
  showLabel?: boolean;
  className?: string;
}

export const AdminBadge: React.FC<AdminBadgeProps> = ({
  role,
  isSuperAdmin,
  size = 'sm',
  showLabel = true,
  className = '',
}) => {
  const superAdmin = isSuperAdmin ?? (String(role || '').toLowerCase() === 'super_admin');
  const s = SIZES[size];

  if (superAdmin) {
    return (
      <span
        className={`pn-admin-badge pn-admin-badge--super inline-flex items-center rounded-full font-bold uppercase tracking-wide align-middle ${s.chip} ${className}`}
        title="Root Super Admin — full platform authority"
        aria-label="Super Admin"
      >
        <span className={`pn-admin-emoji pn-admin-crown ${s.emoji}`} aria-hidden="true">👑</span>
        {showLabel && <span className={`${s.text} whitespace-nowrap`}>Super Admin</span>}
      </span>
    );
  }

  return (
    <span
      className={`pn-admin-badge pn-admin-badge--admin inline-flex items-center rounded-full font-bold uppercase tracking-wide align-middle ${s.chip} ${className}`}
      title="Administrator — delegated privileges"
      aria-label="Administrator"
    >
      <span className={`pn-admin-emoji pn-admin-shield ${s.emoji}`} aria-hidden="true">🛡️</span>
      {showLabel && <span className={`${s.text} whitespace-nowrap`}>Admin</span>}
    </span>
  );
};

export default AdminBadge;
