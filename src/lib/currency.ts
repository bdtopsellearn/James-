/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  X AD MARKETING — Currency helpers
 * ─────────────────────────────────────────────────────────────────────────────
 *  Display policy (v2):
 *    • The platform shows the DOLLAR sign ($) everywhere by default.
 *    • The ONLY place that keeps the Taka sign (৳ / BDT) is the wallet BALANCE
 *      (and the wallet money area: balance, deposits, transactions).
 *
 *  Crypto gateways (Binance Pay / USDT) settle in USD, so we keep a single
 *  fixed reference rate the user configured:  1 USD = 128 BDT.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Fixed reference rate used across the whole app (user configured). */
export const USD_TO_BDT = 128;

/** Convert a USD amount into BDT. */
export function usdToBdt(usd: number): number {
  return (Number(usd) || 0) * USD_TO_BDT;
}

/** Convert a BDT amount into USD. */
export function bdtToUsd(bdt: number): number {
  return (Number(bdt) || 0) / USD_TO_BDT;
}

/** Round to 2 decimals without floating point noise. */
function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Format a BDT amount with the Taka sign (৳).
 * Reserved for the WALLET BALANCE / wallet money area only.
 * e.g. formatBDT(1250) → "৳1,250.00"
 */
export function formatBDT(amountBdt: number, opts?: { decimals?: number; compact?: boolean }): string {
  const decimals = opts?.decimals ?? 2;
  const value = Number(amountBdt) || 0;
  const body = value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `৳${body}`;
}

/** Format a BDT amount from a USD value (multiplies by the reference rate). */
export function formatBDTFromUsd(usd: number, opts?: { decimals?: number }): string {
  return formatBDT(usdToBdt(usd), opts);
}

/** Compact BDT, e.g. ৳12.5K / ৳1.2M — handy for wallet stat tiles. */
export function formatBDTCompact(amountBdt: number): string {
  const v = Number(amountBdt) || 0;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `৳${round2(v / 1_000_000)}M`;
  if (abs >= 1_000) return `৳${round2(v / 1_000)}K`;
  return `৳${round2(v)}`;
}

/**
 * Format a USD amount with the dollar sign ($) — the platform-wide default.
 * e.g. formatUSD(3.5) → "$3.50"
 */
export function formatUSD(usd: number, decimals = 2): string {
  const value = Number(usd) || 0;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/**
 * Platform-wide money formatter — shows the DOLLAR sign.
 * Use this everywhere EXCEPT the wallet balance (which uses formatBDT).
 */
export function formatMoney(amount: number, decimals = 2): string {
  return formatUSD(amount, decimals);
}

/** Compact USD, e.g. $12.5K / $1.2M — handy for stat tiles. */
export function formatMoneyCompact(amount: number): string {
  const v = Number(amount) || 0;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${round2(v / 1_000_000)}M`;
  if (abs >= 1_000) return `$${round2(v / 1_000)}K`;
  return `$${round2(v)}`;
}

/** A short human label describing the fixed crypto rate, e.g. "1 USD = ৳128". */
export const RATE_LABEL = `1 USD = ৳${USD_TO_BDT}`;
