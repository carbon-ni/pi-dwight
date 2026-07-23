import type { Account } from "../infra/config.js";
import type { ProviderUsageResult, UsageItem } from "../domain/usage-types.js";

export function findAccountForProvider(
  accounts: Account[],
  providerName: string | undefined,
): Account | undefined {
  if (!providerName) return undefined;
  return accounts.find((account) => `${account.provider}-${account.id}` === providerName);
}

function timeUntil(date: Date): string | undefined {
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return undefined;

  const minutes = Math.round(diff / (60 * 1000));
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.round(diff / (60 * 60 * 1000));
  if (hours < 24) return `${hours}h`;

  const days = Math.round(diff / (24 * 60 * 60 * 1000));
  return `${days}d`;
}

function formatItem(item: UsageItem): string {
  if (item.kind === "quota") {
    const reset = timeUntil(item.resetsAt);
    const suffix = reset ? ` (${reset})` : "";
    return `${item.label} ${Math.round(item.usedPercent)}%${suffix}`;
  }
  return item.label;
}

export function formatQuotaStatus(
  accountId: string,
  result: ProviderUsageResult,
): string | undefined {
  if (!result.success || result.items.length === 0) return undefined;
  const windows = result.items.map((item) => formatItem(item)).join(" · ");
  return `${accountId}: ${windows}`;
}
