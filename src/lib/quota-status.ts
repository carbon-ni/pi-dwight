import type { Account } from "../infra/config.js";
import type { ProviderUsageResult, UsageItem } from "../domain/usage-types.js";
import { formatUsageItem } from "../domain/usage-views.js";

/** Drop quota items that are 0% with no real reset time — stale API windows. */
function meaningful(items: UsageItem[]): UsageItem[] {
  return items.filter((item) => {
    if (item.kind !== "quota") return true;
    if (item.usedPercent > 0) return true;
    // Keep 0% windows that have a future reset — the window is active.
    return item.resetsAt.getTime() > 0 && item.resetsAt.getTime() > Date.now();
  });
}

export function findAccountForProvider(
  accounts: Account[],
  providerName: string | undefined,
): Account | undefined {
  if (!providerName) return undefined;
  return accounts.find((account) => {
    if (`${account.provider}-${account.id}` === providerName) return true;
    return account.id === "default" && account.provider === providerName;
  });
}

export function formatQuotaStatus(
  accountId: string,
  result: ProviderUsageResult,
): string | undefined {
  if (!result.success) return undefined;
  const items = meaningful(result.items);
  if (items.length === 0) return undefined;
  const windows = items.map((item) => formatUsageItem(item)).join(" · ");
  return `${accountId}: ${windows}`;
}
