import type { Account } from "../infra/config.js";
import type { OpenAiCodexQuotaResult } from "../infra/quotas.js";

export function findAccountForProvider(
  accounts: Account[],
  providerName: string | undefined,
): Account | undefined {
  if (!providerName) return undefined;
  return accounts.find((account) => `${account.provider}-${account.id}` === providerName);
}

export function formatQuotaStatus(
  accountId: string,
  result: OpenAiCodexQuotaResult,
): string | undefined {
  if (!result.success || result.windows.length === 0) return undefined;
  const windows = result.windows
    .map((window) => `${window.label} ${Math.round(window.usedPercent)}%`)
    .join(" · ");
  return `${accountId}: ${windows}`;
}
