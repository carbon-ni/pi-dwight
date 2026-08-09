import type { ProviderQuotaFetchOptions, ProviderUsageResult, UsageItem, UsageQuota } from "../usage-types.js";
import { resetAt, errorMessage } from "./shared.js";

type Fetcher = typeof globalThis.fetch;

// ── Parser helpers ──

function anthropicWindow(data: Record<string, unknown>, key: string, label: string): UsageQuota | undefined {
  const value = data[key];
  if (!value || typeof value !== "object") return undefined;
  const entry = value as Record<string, unknown>;
  const utilization = Number(entry.utilization ?? entry.used_percent ?? 0);
  if (!Number.isFinite(utilization)) return undefined;
  return {
    kind: "quota", label,
    usedPercent: Math.max(0, Math.min(100, utilization)),
    resetsAt: resetAt({ reset_at: entry.resets_at ?? entry.reset_at }),
  };
}

// ── Parser ──

export function parseAnthropicQuota(data: unknown): UsageItem[] {
  if (!data || typeof data !== "object") return [];
  const response = data as Record<string, unknown>;
  const items: UsageItem[] = [];

  const fiveHour = anthropicWindow(response, "five_hour", "5h");
  if (fiveHour) items.push(fiveHour);

  const sevenDay = anthropicWindow(response, "seven_day", "7d");
  if (sevenDay) items.push(sevenDay);

  for (const [key, label] of [
    ["seven_day_sonnet", "7d Sonnet"],
    ["seven_day_omelette", "7d Opus"],
    ["seven_day_opus", "7d Opus (legacy)"],
  ] as const) {
    const window = anthropicWindow(response, key, label);
    if (window) items.push(window);
  }

  const extra = response.extra_usage;
  if (extra && typeof extra === "object") {
    const entry = extra as Record<string, unknown>;
    const enabled = entry.is_enabled === true;
    const limit = Number(entry.monthly_limit ?? 0) / 100;
    const used = Number(entry.used_credits ?? 0) / 100;
    if (enabled && Number.isFinite(limit) && limit > 0 && Number.isFinite(used)) {
      items.push({
        kind: "quota",
        label: `Extra (${typeof entry.currency === "string" ? entry.currency : "USD"})`,
        usedPercent: Math.max(0, Math.min(100, Number(entry.utilization ?? (used / limit) * 100))),
        resetsAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
      });
    }
  }
  return items;
}

// ── Fetcher ──

interface AnthropicQuotaOptions {
  accessToken?: string;
  fetcher?: Fetcher;
  signal?: AbortSignal;
}

async function fetchAnthropicQuota({ accessToken, fetcher = fetch, signal }: AnthropicQuotaOptions): Promise<ProviderUsageResult> {
  if (!accessToken) return { success: false, error: "No Anthropic OAuth token found" };
  if (accessToken.startsWith("sk-ant-")) {
    return { success: false, error: "Direct Anthropic API key — no subscription usage to report" };
  }
  try {
    const response = await fetcher("https://api.anthropic.com/api/oauth/usage", {
      signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
        Accept: "application/json",
      },
    });
    const data: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      return { success: false, error: errorMessage(data, response.statusText || `HTTP ${response.status}`) };
    }
    return { success: true, items: parseAnthropicQuota(data) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Quota request failed" };
  }
}

// ── Plugin ──

export function anthropicFetch(apiKey: string | undefined, options?: ProviderQuotaFetchOptions): Promise<ProviderUsageResult> {
  return fetchAnthropicQuota({ accessToken: apiKey, fetcher: options?.fetcher, signal: options?.signal });
}
