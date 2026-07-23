import type { UsageItem } from "./usage-types.js";

export type UsageSeverity = "success" | "warning" | "error";

function timeUntil(date: Date, now: Date): string | undefined {
  const milliseconds = date.getTime() - now.getTime();
  if (milliseconds <= 0) return undefined;

  const minutes = Math.round(milliseconds / (60 * 1000));
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.round(milliseconds / (60 * 60 * 1000));
  if (hours < 24) return `${hours}h`;

  return `${Math.round(milliseconds / (24 * 60 * 60 * 1000))}d`;
}

/** Format a single usage item for display. */
export function formatUsageItem(item: UsageItem, now = new Date()): string {
  if (item.kind === "quota") {
    const reset = timeUntil(item.resetsAt, now);
    const suffix = reset ? ` (${reset})` : "";
    return `${item.label} ${Math.round(item.usedPercent)}%${suffix}`;
  }
  return item.label;
}

/** Severity of a single usage item. */
export function usageItemSeverity(item: UsageItem): UsageSeverity {
  if (item.kind === "quota") {
    if (item.usedPercent >= 90) return "error";
    if (item.usedPercent >= 70) return "warning";
    return "success";
  }
  if (item.amount <= 0) return "error";
  if (item.amount < 1) return "warning";
  return "success";
}

/** Highest severity across a set of items. */
export function highestUsageSeverity(items: UsageItem[]): UsageSeverity {
  let sev: UsageSeverity = "success";
  for (const item of items) {
    const s = usageItemSeverity(item);
    if (s === "error") return "error";
    if (s === "warning") sev = "warning";
  }
  return sev;
}
