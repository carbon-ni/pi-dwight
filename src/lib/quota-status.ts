import type { Account } from "../infra/config.js";
import type { OpenAiCodexQuotaResult } from "../infra/quotas.js";

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

export function formatQuotaStatus(
  accountId: string,
  result: OpenAiCodexQuotaResult,
): string | undefined {
  if (!result.success || result.windows.length === 0) return undefined;
  const windows = result.windows
    .map((window) => {
      const reset = timeUntil(window.resetsAt);
      const suffix = reset ? ` (${reset})` : "";
      return `${window.label} ${Math.round(window.usedPercent)}%${suffix}`;
    })
    .join(" · ");
  return `${accountId}: ${windows}`;
}
