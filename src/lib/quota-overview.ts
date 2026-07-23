import type { Account } from "../infra/config.js";
import type { ProviderUsageResult, UsageItem } from "../domain/usage-types.js";

export interface QuotaOverviewItem {
  account: string;
  status: string;
  severity: "success" | "warning" | "error";
}

interface QuotaOverviewInput {
  account: Account;
  result: ProviderUsageResult;
}

function timeUntil(date: Date, now: Date): string | undefined {
  const milliseconds = date.getTime() - now.getTime();
  if (milliseconds <= 0) return undefined;

  const minutes = Math.round(milliseconds / (60 * 1000));
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.round(milliseconds / (60 * 60 * 1000));
  if (hours < 24) return `${hours}h`;

  return `${Math.round(milliseconds / (24 * 60 * 60 * 1000))}d`;
}

function formatItem(item: UsageItem, now: Date): string {
  if (item.kind === "quota") {
    const reset = timeUntil(item.resetsAt, now);
    return `${item.label} ${Math.round(item.usedPercent)}%${reset ? ` (${reset})` : ""}`;
  }
  return `${item.label}`;
}

function itemSeverity(item: UsageItem): QuotaOverviewItem["severity"] {
  if (item.kind === "quota") {
    if (item.usedPercent >= 90) return "error";
    if (item.usedPercent >= 70) return "warning";
    return "success";
  }
  // balance: error if empty, warning if nearly empty, success otherwise
  if (item.amount <= 0) return "error";
  if (item.amount < 1) return "warning";
  return "success";
}

function highestSeverity(items: UsageItem[]): QuotaOverviewItem["severity"] {
  let sev: QuotaOverviewItem["severity"] = "success";
  for (const item of items) {
    const s = itemSeverity(item);
    if (s === "error") return "error";
    if (s === "warning") sev = "warning";
  }
  return sev;
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
  return [...entries].sort(compareAccounts).map(({ account, result }) => {
    const name = `${account.provider}-${account.id}`;
    if (!result.success) {
      return { account: name, status: result.error, severity: "error" };
    }

    if (result.items.length === 0) {
      return { account: name, status: "No usage data returned", severity: "warning" };
    }

    const status = result.items.map((item) => formatItem(item, now)).join(" · ");
    return { account: name, status, severity: highestSeverity(result.items) };
  });
}
