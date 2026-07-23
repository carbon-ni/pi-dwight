import type { Account } from "../infra/config.js";
import type { OpenAiCodexQuotaResult } from "../infra/quotas.js";

export interface QuotaOverviewItem {
  account: string;
  status: string;
  severity: "success" | "warning" | "error";
}

interface QuotaOverviewInput {
  account: Account;
  result: OpenAiCodexQuotaResult;
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

function severity(usedPercent: number): QuotaOverviewItem["severity"] {
  if (usedPercent >= 90) return "error";
  if (usedPercent >= 70) return "warning";
  return "success";
}

export function buildQuotaOverview(
  entries: QuotaOverviewInput[],
  now = new Date(),
): QuotaOverviewItem[] {
  return entries.map(({ account, result }) => {
    const name = `${account.provider}-${account.id}`;
    if (!result.success) {
      return { account: name, status: result.error, severity: "error" };
    }

    if (result.windows.length === 0) {
      return { account: name, status: "No quota limits returned", severity: "warning" };
    }

    const highestUsage = Math.max(...result.windows.map((window) => window.usedPercent));
    const status = result.windows.map((window) => {
      const reset = timeUntil(window.resetsAt, now);
      return `${window.label} ${Math.round(window.usedPercent)}%${reset ? ` (${reset})` : ""}`;
    }).join(" · ");

    return { account: name, status, severity: severity(highestUsage) };
  });
}
