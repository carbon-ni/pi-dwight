/**
 * Shared helpers for provider quota parsers.
 * Deterministic, no HTTP, no side effects.
 */

/** Clamps a window's used_percent to 0–100, defaulting missing/invalid to 0. */
export function usedPercent(window: unknown): number {
  if (!window || typeof window !== "object") return 0;
  const value = (window as { used_percent?: unknown }).used_percent;
  const used = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(used)) return 0;
  return Math.max(0, Math.min(100, used));
}

/** Parses a reset_at field from a quota window, defaulting to epoch on missing/invalid. */
export function resetAt(window: unknown): Date {
  if (!window || typeof window !== "object") return new Date(0);
  const value = (window as { reset_at?: unknown }).reset_at;
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date(0) : date;
  }
  const timestamp = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(timestamp)) return new Date(0);
  return new Date(timestamp > 10 ** 11 ? timestamp : timestamp * 1000);
}

/**
 * Readable error string from a possibly-JSON response body.
 * Falls back to `fallback` when the body is not a parseable object or lacks
 * an error/message field.
 */
export function errorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const error = (body as { error?: { message?: unknown }; message?: unknown }).error;
  if (typeof error?.message === "string") return error.message;
  const message = (body as { message?: unknown }).message;
  return typeof message === "string" ? message : fallback;
}

export function currencySymbol(currency: string): string {
  if (currency === "USD") return "$";
  if (currency === "CNY") return "¥";
  return `${currency} `;
}
