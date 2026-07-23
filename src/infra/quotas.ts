import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Account } from "./config.js";
import type {
  ProviderQuotaFetchOptions,
  ProviderQuotaPlugin,
  ProviderUsageResult,
  UsageItem,
  UsageQuota,
  UsageBalance,
} from "../domain/usage-types.js";
import { getProviderType } from "../domain/providers.js";

type Fetcher = typeof globalThis.fetch;

interface AccountCredentialSource {
  getApiKey(provider: string): Promise<string | undefined>;
}

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

// ── Plugin registry ───────────────────────────────────────────────────

/** Map of provider id → quota plugin. Add a new entry here when adding a provider. */
function openaiFetch(apiKey: string | undefined, options?: ProviderQuotaFetchOptions): Promise<ProviderUsageResult> {
  return fetchOpenAiCodexQuota({
    accessToken: apiKey,
    accountId: options?.accountId ?? readOpenAiAccountId(options?.credentialProvider ?? "openai-default"),
    fetcher: options?.fetcher,
    signal: options?.signal,
  });
}

function zaiFetch(apiKey: string | undefined, options?: ProviderQuotaFetchOptions): Promise<ProviderUsageResult> {
  return fetchZaiQuota({ apiKey, fetcher: options?.fetcher, signal: options?.signal });
}

function deepseekFetch(apiKey: string | undefined, options?: ProviderQuotaFetchOptions): Promise<ProviderUsageResult> {
  return fetchDeepSeekQuota({ apiKey, fetcher: options?.fetcher, signal: options?.signal });
}

const quotaPlugins: Record<string, ProviderQuotaPlugin> = {
  openai: { fetch: openaiFetch },
  zai: { fetch: zaiFetch },
  deepseek: { fetch: deepseekFetch },
};

// Wire plugins into provider type definitions so domain consumers can read them.
for (const [id, plugin] of Object.entries(quotaPlugins)) {
  const typeDef = getProviderType(id);
  if (typeDef) typeDef.quota = plugin;
}

// ── Public API ────────────────────────────────────────────────────────

function credentialProviderName(account: Account): string {
  if (account.id === "default") return account.provider;
  return `${account.provider}-${account.id}`;
}

export async function fetchMultiAccountQuota(
  authStorage: AccountCredentialSource,
  account: Account,
  fetcher?: Fetcher,
): Promise<ProviderUsageResult> {
  const typeDef = getProviderType(account.provider);
  const plugin = typeDef?.quota;
  if (!plugin) {
    return { success: false, error: `Quota fetching is not supported for ${account.provider}` };
  }
  const apiKey = await authStorage.getApiKey(credentialProviderName(account));
  return plugin.fetch(apiKey, {
    accountId: account.accountId,
    credentialProvider: credentialProviderName(account),
    fetcher,
  });
}

export async function fetchMultiAccountQuotas(
  authStorage: AccountCredentialSource,
  accounts: Account[],
  fetcher?: Fetcher,
): Promise<Array<{ account: Account; result: ProviderUsageResult }>> {
  return Promise.all(accounts.map(async (account) => ({
    account,
    result: await fetchMultiAccountQuota(authStorage, account, fetcher),
  })));
}
