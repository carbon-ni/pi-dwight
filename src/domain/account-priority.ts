import { accountProviderName, type Account } from "./accounts.js";
import type { ProviderUsageResult, UsageItem } from "./usage-types.js";

export interface AccountUsage {
  account: Account;
  result: ProviderUsageResult;
}

export interface QuotaPriority {
  remaining: number;
  hoursToReset: number;
  pressure: number;
}

/** Explicit exhaustion reported by a provider's usage API; fetch failures are not exhaustion. */
export function isQuotaExhausted(result: ProviderUsageResult): boolean {
  if (!result.success) return false;
  return result.items.some((item) => item.kind === "quota" && item.usedPercent >= 100);
}

/** Remaining percentage points that expire per hour. Higher means use sooner. */
export function quotaPriority(result: ProviderUsageResult, now: Date): QuotaPriority | undefined {
  if (!result.success) return undefined;

  const quotas = result.items.filter(
    (item): item is Extract<UsageItem, { kind: "quota" }> =>
      item.kind === "quota" && item.resetsAt.getTime() > now.getTime(),
  );
  if (quotas.length === 0 || quotas.some((item) => item.usedPercent >= 100)) return undefined;

  let highest: QuotaPriority | undefined;
  for (const item of quotas) {
    const remaining = Math.max(0, 100 - item.usedPercent);
    const hoursToReset = (item.resetsAt.getTime() - now.getTime()) / 3_600_000;
    const priority = { remaining, hoursToReset, pressure: remaining / hoursToReset };
    if (!highest || priority.pressure > highest.pressure) highest = priority;
  }
  return highest;
}

/** Rank usable accounts by quota that will expire fastest, with stable account ordering for ties. */
export function rankQuotaAccounts(
  entries: AccountUsage[],
  now = new Date(),
  preferredProviders: readonly string[] = [],
  options: { includeBalance?: boolean } = {},
): AccountUsage[] {
  const precedence = new Map(preferredProviders.map((provider, index) => [provider, index]));
  return entries
    .map((entry) => {
      const priority = quotaPriority(entry.result, now);
      const hasBalance = entry.result.success && entry.result.items.some(
        (item) => item.kind === "balance" && item.amount > 0,
      );
      return { entry, priority, usableBalance: options.includeBalance === true && hasBalance };
    })
    .filter((candidate) => Boolean(candidate.priority) || candidate.usableBalance)
    .sort((left, right) => {
      if (left.priority && !right.priority) return -1;
      if (!left.priority && right.priority) return 1;
      const pressureOrder = (right.priority?.pressure ?? 0) - (left.priority?.pressure ?? 0);
      if (pressureOrder !== 0) return pressureOrder;
      const leftPrecedence = precedence.get(accountProviderName(left.entry.account)) ?? Number.MAX_SAFE_INTEGER;
      const rightPrecedence = precedence.get(accountProviderName(right.entry.account)) ?? Number.MAX_SAFE_INTEGER;
      if (leftPrecedence !== rightPrecedence) return leftPrecedence - rightPrecedence;
      const providerOrder = left.entry.account.provider.localeCompare(right.entry.account.provider);
      if (providerOrder !== 0) return providerOrder;
      return left.entry.account.id.localeCompare(right.entry.account.id);
    })
    .map(({ entry }) => entry);
}
