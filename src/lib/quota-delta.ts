import type { ProviderUsageResult, UsageItem } from "../domain/usage-types.js";

function currencySymbol(currency: string): string {
  if (currency === "USD") return "$";
  if (currency === "CNY") return "¥";
  return `${currency} `;
}

/**
 * Difference between the session-start baseline and the current sample.
 * Balance decreases show as "-$0.03"; quota windows as "+3%". Top-ups,
 * resets, and non-comparable samples return undefined.
 */
export function formatQuotaDelta(
  baseline: ProviderUsageResult | undefined,
  current: ProviderUsageResult | undefined,
): string | undefined {
  if (!baseline?.success || !current?.success) return undefined;

  const spent = balanceSpentBetween(baseline.items, current.items);
  if (spent !== undefined) {
    if (spent.amount <= 0) return undefined;
    return `-${currencySymbol(spent.currency)}${spent.amount.toFixed(2)}`;
  }

  const primary = current.items[0];
  const before = baseline.items[0];
  if (primary?.kind !== "quota" || before?.kind !== "quota") return undefined;

  const delta = primary.usedPercent - before.usedPercent;
  if (delta <= 0) return undefined;
  return `+${Math.round(delta)}%`;
}

/**
 * Record a quota sample and return its delta against the session baseline.
 * The first successful sample per account becomes the baseline; later
 * samples are measured against it and never replace it.
 */
export function computeQuotaDelta(
  baseline: Map<string, ProviderUsageResult>,
  accountKey: string,
  result: ProviderUsageResult,
): string | undefined {
  const delta = formatQuotaDelta(baseline.get(accountKey), result);
  if (result.success && !baseline.has(accountKey)) {
    baseline.set(accountKey, result);
  }
  return delta;
}

/**
 * Sum of balance decreases between two samples. Returns undefined when the
 * item shapes are not comparable (kind mismatch) or currencies are mixed.
 */
function balanceSpentBetween(
  baseline: UsageItem[],
  current: UsageItem[],
): { amount: number; currency: string } | undefined {
  const baselineBalances = baseline.filter((item): item is Extract<UsageItem, { kind: "balance" }> => item.kind === "balance");
  const currentBalances = current.filter((item): item is Extract<UsageItem, { kind: "balance" }> => item.kind === "balance");
  if (currentBalances.length === 0) return undefined;

  const currencies = new Set(currentBalances.map((item) => item.currency));
  if (currencies.size !== 1) return undefined;
  const currency = currentBalances[0].currency;

  let spent = 0;
  for (let index = 0; index < currentBalances.length; index += 1) {
    const currentItem = currentBalances[index];
    const baselineItem = baselineBalances[index];
    if (!baselineItem || baselineItem.currency !== currentItem.currency) return undefined;
    spent += baselineItem.amount - currentItem.amount;
  }
  return { amount: spent, currency };
}
