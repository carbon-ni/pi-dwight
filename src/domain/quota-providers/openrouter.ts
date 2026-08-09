import type { ProviderQuotaFetchOptions, ProviderUsageResult, UsageBalance } from "../usage-types.js";
import { errorMessage } from "./shared.js";

type Fetcher = typeof globalThis.fetch;

// ── Parser ──

export function parseOpenRouterQuota(data: unknown): UsageBalance[] {
  if (!data || typeof data !== "object") return [];
  const d = (data as { data?: { total_credits?: unknown; total_usage?: unknown } }).data;
  if (!d) return [];
  const totalCredits = Number(d.total_credits ?? 0);
  const totalUsage = Number(d.total_usage ?? 0);
  if (!Number.isFinite(totalCredits) || !Number.isFinite(totalUsage)) return [];
  return [{
    kind: "balance",
    label: `Credits $${Math.max(0, totalCredits - totalUsage).toFixed(2)}`,
    amount: Math.max(0, totalCredits - totalUsage),
    currency: "USD",
  }];
}

// ── Fetcher ──

interface OpenRouterQuotaOptions {
  apiKey?: string;
  fetcher?: Fetcher;
  signal?: AbortSignal;
}

async function fetchOpenRouterQuota({ apiKey, fetcher = fetch, signal }: OpenRouterQuotaOptions): Promise<ProviderUsageResult> {
  if (!apiKey) return { success: false, error: "No OpenRouter API key found" };
  try {
    const response = await fetcher("https://openrouter.ai/api/v1/credits", {
      signal, headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    const data: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      return { success: false, error: errorMessage(data, response.statusText || `HTTP ${response.status}`) };
    }
    return { success: true, items: parseOpenRouterQuota(data) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Quota request failed" };
  }
}

// ── Plugin ──

export function openrouterFetch(apiKey: string | undefined, options?: ProviderQuotaFetchOptions): Promise<ProviderUsageResult> {
  return fetchOpenRouterQuota({ apiKey, fetcher: options?.fetcher, signal: options?.signal });
}
