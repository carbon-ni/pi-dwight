import type { Account } from "../infra/config.js";
import type { ProviderUsageResult, UsageItem } from "../domain/usage-types.js";
import { formatUsageItem } from "../domain/usage-views.js";

function meaningfulItems(items: UsageItem[]): UsageItem[] {
  return items.filter((item) => item.kind !== "quota" || item.usedPercent > 0);
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
  const items = meaningfulItems(result.items);
  if (items.length === 0) return undefined;
  const windows = items.map((item) => formatUsageItem(item)).join(" · ");
  return `${accountId}: ${windows}`;
}
