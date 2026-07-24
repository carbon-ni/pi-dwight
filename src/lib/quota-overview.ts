import type { Account } from "../infra/config.js";
import type { ProviderUsageResult, UsageItem } from "../domain/usage-types.js";
import {
  formatUsageItem,
  highestUsageSeverity,
} from "../domain/usage-views.js";

/** Drop quota items that are 0% with no real reset time — stale API windows. */
function meaningful(items: UsageItem[]): UsageItem[] {
  return items.filter((item) => {
    if (item.kind !== "quota") return true;
    if (item.usedPercent > 0) return true;
    return item.resetsAt.getTime() > 0 && item.resetsAt.getTime() > Date.now();
  });
}

export interface QuotaOverviewItem {
  account: string;
  status: string;
  severity: "success" | "warning" | "error";
}

interface QuotaOverviewInput {
  account: Account;
  result: ProviderUsageResult;
}

function compareAccounts(left: QuotaOverviewInput, right: QuotaOverviewInput): number {
  const providerOrder = left.account.provider.localeCompare(right.account.provider);
  if (providerOrder !== 0) return providerOrder;
  return left.account.id.localeCompare(right.account.id);
}

export function buildQuotaOverview(
  entries: QuotaOverviewInput[],
  now = new Date(),
): QuotaOverviewItem[] {
  return [...entries]
    .sort(compareAccounts)
    .filter(({ result }) => !result.success || meaningful(result.items).length > 0)
    .map(({ account, result }) => {
      const name = `${account.provider}-${account.id}`;

      if (!result.success) {
        return { account: name, status: result.error, severity: "error" };
      }

      const items = meaningful(result.items);
      const status = items.map((item) => formatUsageItem(item, now)).join(" · ");
      return { account: name, status, severity: highestUsageSeverity(items) };
    });
}
