import type { Account } from "../domain/accounts.js";
import type { ProviderUsageResult, UsageItem } from "../domain/usage-types.js";
import {
  quotaPriority,
  rankQuotaAccounts,
  type QuotaPriority,
} from "../domain/account-priority.js";
import {
  formatUsageItem,
  highestUsageSeverity,
} from "../domain/usage-views.js";

/** Drop quota items that are 0% with no real reset time — stale API windows. */
function meaningful(items: UsageItem[], now: Date): UsageItem[] {
  return items.filter((item) => {
    if (item.kind !== "quota") return true;
    if (item.usedPercent > 0) return true;
    return item.resetsAt.getTime() > 0 && item.resetsAt.getTime() > now.getTime();
  });
}

function formatOverviewItem(item: UsageItem, now: Date): string {
  if (item.kind !== "quota") return formatUsageItem(item, now);

  const width = 10;
  const used = Math.round(Math.min(100, Math.max(0, item.usedPercent)) / 100 * width);
  const bar = `${"█".repeat(used)}${"░".repeat(width - used)}`;
  return `${item.label} [${bar}] ${formatUsageItem(item, now)}`;
}

export interface QuotaOverviewItem {
  account: string;
  status: string;
  severity: "success" | "warning" | "error";
  priority?: string;
  recommended?: true;
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

function formatPriority(priority: QuotaPriority): string {
  const remaining = Number(priority.remaining.toFixed(2));
  const hours = Number(priority.hoursToReset.toFixed(2));
  const pressure = Number(priority.pressure.toFixed(2));
  return `${remaining}% left / ${hours}h = ${pressure}%/h`;
}

export function buildQuotaOverview(
  entries: QuotaOverviewInput[],
  now = new Date(),
): QuotaOverviewItem[] {
  const visibleEntries = [...entries]
    .sort(compareAccounts)
    .filter(({ result }) => !result.success || meaningful(result.items, now).length > 0);

  const priorities = new Map<QuotaOverviewInput, QuotaPriority>();
  for (const entry of visibleEntries) {
    const priority = quotaPriority(entry.result, now);
    if (priority) priorities.set(entry, priority);
  }
  const recommended = rankQuotaAccounts(visibleEntries, now)[0];

  return visibleEntries.map((entry) => {
    const { account, result } = entry;
    const name = `${account.provider}-${account.id}`;

    if (!result.success) {
      return { account: name, status: result.error, severity: "error" };
    }

    const items = meaningful(result.items, now);
    const status = items.map((item) => formatOverviewItem(item, now)).join(" · ");
    const overview: QuotaOverviewItem = {
      account: name,
      status,
      severity: highestUsageSeverity(items),
    };
    const priority = priorities.get(entry);
    if (priority) overview.priority = formatPriority(priority);
    if (entry === recommended) overview.recommended = true;
    return overview;
  });
}
