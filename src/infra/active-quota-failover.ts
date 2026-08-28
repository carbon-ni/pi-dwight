import { accountProviderName, type Account } from "../domain/accounts.js";
import { isQuotaThresholdReached } from "../domain/account-priority.js";
import type { ProviderUsageResult } from "../domain/usage-types.js";

interface ActiveQuotaFailoverOptions {
  currentProvider: string;
  thresholdPercent: number;
  listAccounts(): Promise<Account[]>;
  readQuota(account: Account): Promise<ProviderUsageResult>;
  failover(): Promise<void>;
  onDecision?(outcome: "available" | "threshold-reached" | "unavailable" | "unmanaged"): void | Promise<void>;
}

/** Runs failover only when the usage API confirms the active account reached its threshold. */
export async function failoverIfActiveQuotaThresholdReached(options: ActiveQuotaFailoverOptions): Promise<boolean> {
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
  if (!isQuotaThresholdReached(usage, options.thresholdPercent)) {
    await options.onDecision?.("available");
    return false;
  }

  await options.onDecision?.("threshold-reached");
  await options.failover();
  return true;
}
