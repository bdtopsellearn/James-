/**
 * Pure route helpers for the standalone payment surfaces.
 * Kept dependency-free so App.tsx can import them without pulling in React views.
 */

export type ResultKind = 'success' | 'cancel' | 'failed' | 'expired' | 'already-paid';

const RESULT_KINDS: Record<string, ResultKind> = {
  success: 'success',
  cancel: 'cancel',
  cancelled: 'cancel',
  failed: 'failed',
  failure: 'failed',
  expired: 'expired',
  'already-paid': 'already-paid',
  paid: 'already-paid',
};

export interface ParsedPaymentRoute {
  view: 'checkout' | 'result' | 'unknown';
  paymentId?: string;
  kind?: ResultKind;
}

/** Parse a pathname into a payment route. */
export function parsePaymentPath(pathname: string): ParsedPaymentRoute {
  const clean = String(pathname || '').replace(/\/+$/, '');
  let m = clean.match(/^\/checkout\/([^/]+)$/);
  if (m) return { view: 'checkout', paymentId: decodeURIComponent(m[1]) };
  m = clean.match(/^\/payment\/([^/]+)\/([^/]+)$/);
  if (m) {
    const kind = RESULT_KINDS[m[1].toLowerCase()];
    if (kind) return { view: 'result', kind, paymentId: decodeURIComponent(m[2]) };
  }
  return { view: 'unknown' };
}

/** True when the current URL is one of the standalone payment surfaces. */
export function isPaymentPath(pathname: string): boolean {
  const r = parsePaymentPath(pathname);
  return r.view === 'checkout' || r.view === 'result';
}
