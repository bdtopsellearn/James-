/**
 * ──────────────────────────────────────────────────────────────────────────────
 *  X AD MARKETING — Clean path-based router
 * ──────────────────────────────────────────────────────────────────────────────
 *  Historically the app used hash URLs (`https://site.com/#/wallet`). The `#`
 *  looked unprofessional and broke link previews / analytics. This module maps
 *  every internal view id to a clean, real path and back again, so the app can
 *  use the History API instead:
 *
 *      #/overview      →  /overview
 *      #/wallet        →  /wallet
 *      #/admin_users   →  /admin/users
 *      #/admin-login   →  /admin/login
 *      #/profile_public:UID →  /u/UID
 *
 *  The Express server already serves `dist/index.html` for any non-`/api/*`
 *  path (SPA fallback), so deep links keep working on a hard refresh.
 * ──────────────────────────────────────────────────────────────────────────────
 */

/** Views that belong to the auth surface (never shown inside the dashboard). */
export const AUTH_VIEWS: ReadonlySet<string> = new Set([
  'login',
  'register',
  'forgot-password',
  'admin-login',
]);

/** The dashboard view that is shown when the URL points at the bare root. */
export const DEFAULT_VIEW = 'overview';

/** Internal view id → clean URL path. */
export function viewToPath(view: string): string {
  const v = String(view || '').trim();
  if (!v) return '/';
  if (v.startsWith('profile_public:')) {
    return '/u/' + encodeURIComponent(v.slice('profile_public:'.length));
  }
  if (v === 'admin-login') return '/admin/login';
  if (v.startsWith('admin_')) return '/admin/' + v.slice('admin_'.length);
  return '/' + v;
}

/**
 * Clean URL path → internal view id.
 * Returns `null` when the path does not correspond to an app view (e.g. the
 * bare root `/`, a static asset, or a payment surface).
 */
export function pathToView(pathname: string): string | null {
  let p = String(pathname || '/');
  // Defensive: drop any query string / hash that leaked into the pathname.
  p = p.split('?')[0].split('#')[0];
  p = p.replace(/\/+$/, '') || '/';
  if (p === '/') return null;

  // Standalone payment surfaces are handled elsewhere — never treat as a view.
  if (p.startsWith('/checkout/') || p.startsWith('/payment/')) return null;

  if (p === '/admin' || p === '/admin/') return 'admin_overview';
  if (p === '/admin/login' || p === '/admin-login') return 'admin-login';
  if (p.startsWith('/admin/')) return 'admin_' + p.slice('/admin/'.length);

  if (p.startsWith('/u/')) return 'profile_public:' + decodeURIComponent(p.slice(3));

  const seg = p.slice(1);
  if (!seg || seg.includes('/')) return null;
  return seg;
}

/** True when the path belongs to the admin surface (root, login or any admin view). */
export function isAdminPath(pathname: string): boolean {
  const p = String(pathname || '/').replace(/\/+$/, '') || '/';
  return p === '/admin' || p.startsWith('/admin/') || p === '/admin-login';
}

/**
 * Push a new history entry for `view` (no full page reload). Safe to call with
 * the current view — it becomes a no-op so we never spam the history stack.
 */
export function pushView(view: string): void {
  try {
    const path = viewToPath(view);
    if (window.location.pathname !== path) {
      window.history.pushState({ view }, '', path);
    }
  } catch {
    /* history may be unavailable in exotic embeds — ignore */
  }
}

/** Replace the current history entry (used on auth transitions / logout). */
export function replaceView(view: string): void {
  try {
    window.history.replaceState({ view }, '', viewToPath(view));
  } catch {
    /* ignore */
  }
}

/** Replace the current entry with a raw path (e.g. `/admin`). */
export function replacePath(path: string): void {
  try {
    window.history.replaceState(null, '', path);
  } catch {
    /* ignore */
  }
}
