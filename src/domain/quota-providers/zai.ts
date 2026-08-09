import type { ProviderQuotaFetchOptions, ProviderUsageResult, UsageItem } from "../usage-types.js";
import { errorMessage } from "./shared.js";

type Fetcher = typeof globalThis.fetch;

// ── Parser ──

function zaiResetAt(value: unknown): Date {
  const timestamp = typeof value === "number" ? value : Number(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : new Date(0);
}

export function parseZaiQuota(data: unknown): UsageItem[] {
  const limits = (data as { data?: { limits?: unknown } })?.data?.limits;
  if (!Array.isArray(limits)) return [];

  const items: UsageItem[] = [];
  for (const limit of limits) {
    if (!limit || typeof limit !== "object") continue;
    const entry = limit as Record<string, unknown>;
    if (entry.type === "TOKENS_LIMIT") {
      const hours = Number(entry.number ?? 1);
      const percentage = Number(entry.percentage ?? 0);
      if (!Number.isFinite(hours) || !Number.isFinite(percentage)) continue;
      items.push({
        kind: "quota", label: `${hours}h`,
        usedPercent: Math.max(0, Math.min(100, percentage)),
        resetsAt: zaiResetAt(entry.nextResetTime),
      });
      continue;
    }
    if (entry.type !== "TIME_LIMIT") continue;
    const used = Number(entry.currentValue ?? 0);
    const total = Number(entry.usage ?? 0);
    if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) continue;
    items.push({
      kind: "quota", label: "Web / month",
      usedPercent: Math.max(0, Math.min(100, (used / total) * 100)),
      resetsAt: zaiResetAt(entry.nextResetTime),
    });
  }
  return items;
}

// ── Fetcher ──

interface ZaiQuotaOptions {
  apiKey?: string;
  fetcher?: Fetcher;
  signal?: AbortSignal;
}

async function fetchZaiQuota({ apiKey, fetcher = fetch, signal }: ZaiQuotaOptions): Promise<ProviderUsageResult> {
  if (!apiKey) return { success: false, error: "No Z.ai API key found" };
  try {
    const response = await fetcher("https://api.z.ai/api/monitor/usage/quota/limit", {
      signal, headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    const data: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      return { success: false, error: errorMessage(data, response.statusText || `HTTP ${response.status}`) };
    }
    return { success: true, items: parseZaiQuota(data) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Quota request failed" };
  }
}

// ── Plugin ──

export function zaiFetch(apiKey: string | undefined, options?: ProviderQuotaFetchOptions): Promise<ProviderUsageResult> {
  return fetchZaiQuota({ apiKey, fetcher: options?.fetcher, signal: options?.signal });
}
