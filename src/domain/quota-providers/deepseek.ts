import type { ProviderQuotaFetchOptions, ProviderUsageResult, UsageBalance } from "../usage-types.js";
import { errorMessage, currencySymbol } from "./shared.js";

type Fetcher = typeof globalThis.fetch;

// ── Helpers ──

function deepSeekBalanceLabel(currency: string, balance: number): string {
  return `Balance ${currencySymbol(currency)}${balance.toFixed(2)}`;
}

// ── Parser ──

export function parseDeepSeekQuota(data: unknown): UsageBalance[] {
  if (!data || typeof data !== "object") return [];
  const response = data as { is_available?: unknown; balance_infos?: unknown };
  if (!Array.isArray(response.balance_infos)) return [];

  const items: UsageBalance[] = [];
  for (const balanceInfo of response.balance_infos) {
    if (!balanceInfo || typeof balanceInfo !== "object") continue;
    const entry = balanceInfo as Record<string, unknown>;
    const currency = typeof entry.currency === "string" ? entry.currency.toUpperCase() : "";
    const totalBalance = Number(entry.total_balance ?? 0);
    if (!currency || !Number.isFinite(totalBalance)) continue;

    items.push({
      kind: "balance",
      label: deepSeekBalanceLabel(currency, totalBalance),
      amount: response.is_available === true ? totalBalance : 0,
      currency,
    });
  }
  return items;
}

// ── Fetcher ──

interface DeepSeekQuotaOptions {
  apiKey?: string;
  fetcher?: Fetcher;
  signal?: AbortSignal;
}

async function fetchDeepSeekQuota({ apiKey, fetcher = fetch, signal }: DeepSeekQuotaOptions): Promise<ProviderUsageResult> {
  if (!apiKey) return { success: false, error: "No DeepSeek API key found" };
  try {
    const response = await fetcher("https://api.deepseek.com/user/balance", {
      signal, headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    const data: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      return { success: false, error: errorMessage(data, response.statusText || `HTTP ${response.status}`) };
    }
    return { success: true, items: parseDeepSeekQuota(data) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Quota request failed" };
  }
}

// ── Plugin ──

export function deepseekFetch(apiKey: string | undefined, options?: ProviderQuotaFetchOptions): Promise<ProviderUsageResult> {
  return fetchDeepSeekQuota({ apiKey, fetcher: options?.fetcher, signal: options?.signal });
}
