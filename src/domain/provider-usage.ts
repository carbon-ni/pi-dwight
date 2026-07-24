import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  ProviderQuotaFetchOptions,
  ProviderUsageResult,
  UsageItem,
  UsageQuota,
  UsageBalance,
} from "./usage-types.js";

type Fetcher = typeof globalThis.fetch;

// ── Parsers ───────────────────────────────────────────────────────────

function usedPercent(window: unknown): number {
  if (!window || typeof window !== "object") return 0;
  const value = (window as { used_percent?: unknown }).used_percent;
  const used = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(used)) return 0;
  return Math.max(0, Math.min(100, used));
}

function resetAt(window: unknown): Date {
  if (!window || typeof window !== "object") return new Date(0);
  const value = (window as { reset_at?: unknown }).reset_at;
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date(0) : date;
  }
  const timestamp = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(timestamp)) return new Date(0);
  return new Date(timestamp > 10 ** 11 ? timestamp : timestamp * 1000);
}

export function parseOpenAiCodexQuota(data: unknown): UsageItem[] {
  if (!data || typeof data !== "object") return [];

  const rateLimit = (data as { rate_limit?: Record<string, unknown> }).rate_limit;
  if (!rateLimit) return [];

  const items: UsageQuota[] = [];
  if (rateLimit.primary_window) {
    items.push({
      kind: "quota",
      label: "5h",
      usedPercent: usedPercent(rateLimit.primary_window),
      resetsAt: resetAt(rateLimit.primary_window),
    });
  }
  if (rateLimit.secondary_window) {
    items.push({
      kind: "quota",
      label: "7d",
      usedPercent: usedPercent(rateLimit.secondary_window),
      resetsAt: resetAt(rateLimit.secondary_window),
    });
  }
  return items;
}

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
        kind: "quota",
        label: `${hours}h`,
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
      kind: "quota",
      label: "Web / month",
      usedPercent: Math.max(0, Math.min(100, (used / total) * 100)),
      resetsAt: zaiResetAt(entry.nextResetTime),
    });
  }
  return items;
}

function currencySymbol(currency: string): string {
  if (currency === "USD") return "$";
  if (currency === "CNY") return "¥";
  return `${currency} `;
}

function deepSeekBalanceLabel(currency: string, balance: number): string {
  return `Balance ${currencySymbol(currency)}${balance.toFixed(2)}`;
}

export function parseOpenRouterQuota(data: unknown): UsageItem[] {
  if (!data || typeof data !== "object") return [];

  const d = (data as { data?: { total_credits?: unknown; total_usage?: unknown } }).data;
  if (!d) return [];

  const totalCredits = Number(d.total_credits ?? 0);
  const totalUsage = Number(d.total_usage ?? 0);
  if (!Number.isFinite(totalCredits) || !Number.isFinite(totalUsage)) return [];

  const remaining = Math.max(0, totalCredits - totalUsage);
  return [{
    kind: "balance",
    label: `Credits $${remaining.toFixed(2)}`,
    amount: remaining,
    currency: "USD",
  }];
}

export function parseDeepSeekQuota(data: unknown): UsageItem[] {
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

    const isAvailable = response.is_available === true;
    items.push({
      kind: "balance",
      label: deepSeekBalanceLabel(currency, totalBalance),
      amount: isAvailable ? totalBalance : 0,
      currency,
    });
  }
  return items;
}

function anthropicWindow(data: Record<string, unknown>, key: string, label: string): UsageQuota | undefined {
  const value = data[key];
  if (!value || typeof value !== "object") return undefined;
  const entry = value as Record<string, unknown>;
  const utilization = Number(entry.utilization ?? entry.used_percent ?? 0);
  if (!Number.isFinite(utilization)) return undefined;
  return {
    kind: "quota",
    label,
    usedPercent: Math.max(0, Math.min(100, utilization)),
    resetsAt: resetAt({ reset_at: entry.resets_at ?? entry.reset_at }),
  };
}

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

// ── HTTP fetchers ─────────────────────────────────────────────────────

function errorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const error = (body as { error?: { message?: unknown }; message?: unknown }).error;
  if (typeof error?.message === "string") return error.message;
  const message = (body as { message?: unknown }).message;
  return typeof message === "string" ? message : fallback;
}

interface OpenAiCodexQuotaOptions {
  accessToken?: string;
  accountId?: string;
  fetcher?: Fetcher;
  signal?: AbortSignal;
}

async function fetchOpenAiCodexQuota({
  accessToken,
  accountId,
  fetcher = fetch,
  signal,
}: OpenAiCodexQuotaOptions): Promise<ProviderUsageResult> {
  if (!accessToken) return { success: false, error: "No OpenAI access token found" };
  if (!accountId) return { success: false, error: "No OpenAI account ID found" };

  try {
    const response = await fetcher("https://chatgpt.com/backend-api/wham/usage", {
      signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "ChatGPT-Account-Id": accountId,
        Accept: "application/json",
        Origin: "https://chatgpt.com",
        Referer: "https://chatgpt.com/",
      },
    });
    const data: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      return { success: false, error: errorMessage(data, response.statusText || `HTTP ${response.status}`) };
    }
    return { success: true, items: parseOpenAiCodexQuota(data) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Quota request failed" };
  }
}

function readOpenAiAccountId(provider: string): string | undefined {
  try {
    const auth = JSON.parse(readFileSync(join(homedir(), ".pi", "agent", "auth.json"), "utf8")) as Record<string, unknown>;
    const credential = auth[provider];
    if (!credential || typeof credential !== "object") return undefined;
    const accountId = (credential as { accountId?: unknown }).accountId;
    return typeof accountId === "string" ? accountId : undefined;
  } catch {
    return undefined;
  }
}

interface ZaiQuotaOptions {
  apiKey?: string;
  fetcher?: Fetcher;
  signal?: AbortSignal;
}

async function fetchZaiQuota({
  apiKey,
  fetcher = fetch,
  signal,
}: ZaiQuotaOptions): Promise<ProviderUsageResult> {
  if (!apiKey) return { success: false, error: "No Z.ai API key found" };

  try {
    const response = await fetcher("https://api.z.ai/api/monitor/usage/quota/limit", {
      signal,
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
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

interface DeepSeekQuotaOptions {
  apiKey?: string;
  fetcher?: Fetcher;
  signal?: AbortSignal;
}

interface AnthropicQuotaOptions {
  accessToken?: string;
  fetcher?: Fetcher;
  signal?: AbortSignal;
}

interface OpenRouterQuotaOptions {
  apiKey?: string;
  fetcher?: Fetcher;
  signal?: AbortSignal;
}

async function fetchOpenRouterQuota({
  apiKey,
  fetcher = fetch,
  signal,
}: OpenRouterQuotaOptions): Promise<ProviderUsageResult> {
  if (!apiKey) return { success: false, error: "No OpenRouter API key found" };

  try {
    const response = await fetcher("https://openrouter.ai/api/v1/credits", {
      signal,
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
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

async function fetchDeepSeekQuota({
  apiKey,
  fetcher = fetch,
  signal,
}: DeepSeekQuotaOptions): Promise<ProviderUsageResult> {
  if (!apiKey) return { success: false, error: "No DeepSeek API key found" };

  try {
    const response = await fetcher("https://api.deepseek.com/user/balance", {
      signal,
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
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

async function fetchAnthropicQuota({
  accessToken,
  fetcher = fetch,
  signal,
}: AnthropicQuotaOptions): Promise<ProviderUsageResult> {
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

// ── Plugin registry ───────────────────────────────────────────────────

export function openaiFetch(apiKey: string | undefined, options?: ProviderQuotaFetchOptions): Promise<ProviderUsageResult> {
  return fetchOpenAiCodexQuota({
    accessToken: apiKey,
    accountId: options?.accountId ?? readOpenAiAccountId(options?.credentialProvider ?? "openai-default"),
    fetcher: options?.fetcher,
    signal: options?.signal,
  });
}

export function zaiFetch(apiKey: string | undefined, options?: ProviderQuotaFetchOptions): Promise<ProviderUsageResult> {
  return fetchZaiQuota({ apiKey, fetcher: options?.fetcher, signal: options?.signal });
}

export function deepseekFetch(apiKey: string | undefined, options?: ProviderQuotaFetchOptions): Promise<ProviderUsageResult> {
  return fetchDeepSeekQuota({ apiKey, fetcher: options?.fetcher, signal: options?.signal });
}

export function openrouterFetch(apiKey: string | undefined, options?: ProviderQuotaFetchOptions): Promise<ProviderUsageResult> {
  return fetchOpenRouterQuota({ apiKey, fetcher: options?.fetcher, signal: options?.signal });
}

export function anthropicFetch(apiKey: string | undefined, options?: ProviderQuotaFetchOptions): Promise<ProviderUsageResult> {
  return fetchAnthropicQuota({ accessToken: apiKey, fetcher: options?.fetcher, signal: options?.signal });
}
