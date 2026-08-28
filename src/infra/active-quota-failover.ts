import { accountProviderName, type Account } from "../domain/accounts.js";
import { isQuotaExhausted } from "../domain/account-priority.js";
import type { ProviderUsageResult } from "../domain/usage-types.js";

interface ActiveQuotaFailoverOptions {
  currentProvider: string;
  listAccounts(): Promise<Account[]>;
  readQuota(account: Account): Promise<ProviderUsageResult>;
  failover(): Promise<void>;
  onDecision?(outcome: "available" | "exhausted" | "unavailable" | "unmanaged"): void | Promise<void>;
}

/** Runs failover only when the usage API explicitly reports the active account exhausted. */
export async function failoverIfActiveQuotaExhausted(options: ActiveQuotaFailoverOptions): Promise<boolean> {
  const account = (await options.listAccounts())
    .find((candidate) => accountProviderName(candidate) === options.currentProvider);
  if (!account) {
    await options.onDecision?.("unmanaged");
    return false;
  }
  const usage = await options.readQuota(account);
  if (!usage.success) {
    await options.onDecision?.("unavailable");
    return false;
  }
  if (!isQuotaExhausted(usage)) {
    await options.onDecision?.("available");
    return false;
  }

  await options.onDecision?.("exhausted");
  await options.failover();
  return true;
}
