import type { ProviderUsageResult, UsageItem } from "../domain/usage-types.js";

function currencySymbol(currency: string): string {
  if (currency === "USD") return "$";
  if (currency === "CNY") return "¥";
  return `${currency} `;
}

/**
 * Amount spent (or quota consumed) between two consecutive quota samples.
 * Positive balance deltas are shown as "spent $X.XX"; quota windows as "+N%".
 * Top-ups, resets, and non-comparable samples return undefined.
 */
export function formatSpentBetweenUpdates(
  previous: ProviderUsageResult | undefined,
  current: ProviderUsageResult | undefined,
): string | undefined {
  if (!previous?.success || !current?.success) return undefined;

  const spent = balanceSpentBetween(previous.items, current.items);
  if (spent !== undefined) {
    if (spent.amount <= 0) return undefined;
    return `spent ${currencySymbol(spent.currency)}${spent.amount.toFixed(2)}`;
  }

  const primary = current.items[0];
  const before = previous.items[0];
  if (primary?.kind !== "quota" || before?.kind !== "quota") return undefined;

  const delta = primary.usedPercent - before.usedPercent;
  if (delta <= 0) return undefined;
  return `+${Math.round(delta)}%`;
}

/**
 * Sum of balance decreases between two samples. Returns undefined when the
 * item shapes are not comparable (kind mismatch) or currencies are mixed.
 */
function balanceSpentBetween(
  previous: UsageItem[],
  current: UsageItem[],
): { amount: number; currency: string } | undefined {
  const previousBalances = previous.filter((item): item is Extract<UsageItem, { kind: "balance" }> => item.kind === "balance");
  const currentBalances = current.filter((item): item is Extract<UsageItem, { kind: "balance" }> => item.kind === "balance");
  if (currentBalances.length === 0) return undefined;

  const currencies = new Set(currentBalances.map((item) => item.currency));
  if (currencies.size !== 1) return undefined;
  const currency = currentBalances[0].currency;

  let spent = 0;
  for (let index = 0; index < currentBalances.length; index += 1) {
    const currentItem = currentBalances[index];
    const previousItem = previousBalances[index];
    if (!previousItem || previousItem.currency !== currentItem.currency) return undefined;
    spent += previousItem.amount - currentItem.amount;
  }
  return { amount: spent, currency };
}
