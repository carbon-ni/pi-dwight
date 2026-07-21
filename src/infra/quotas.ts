import type { Account } from "./config.js";

export interface QuotaWindow {
  label: string;
  usedPercent: number;
  resetsAt: Date;
}

export type OpenAiCodexQuotaResult =
  | { success: true; windows: QuotaWindow[] }
  | { success: false; error: string };

type Fetcher = typeof globalThis.fetch;

interface AccountCredentialSource {
  getApiKey(provider: string): Promise<string | undefined>;
}


interface OpenAiCodexQuotaOptions {
  accessToken?: string;
  accountId?: string;
  fetcher?: Fetcher;
  signal?: AbortSignal;
}

function usedPercent(window: unknown): number {
  if (!window || typeof window !== "object") return 0;
  const value = (window as { percent_left?: unknown }).percent_left;
  const percentLeft = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(percentLeft)) return 0;
  return Math.max(0, Math.min(100, 100 - percentLeft));
}

function resetAt(window: unknown): Date {
  if (!window || typeof window !== "object") return new Date(0);
  const value = (window as { reset_at?: unknown }).reset_at;
  const timestamp = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(timestamp)) return new Date(0);
  return new Date(timestamp > 10 ** 11 ? timestamp : timestamp * 1000);
}

export function parseOpenAiCodexQuota(data: unknown): QuotaWindow[] {
  if (!data || typeof data !== "object") return [];

  const rateLimit = (data as { rate_limit?: Record<string, unknown> }).rate_limit;
  if (!rateLimit) return [];

  const windows: QuotaWindow[] = [];
  if (rateLimit.primary_window) {
    windows.push({
      label: "5h",
      usedPercent: usedPercent(rateLimit.primary_window),
      resetsAt: resetAt(rateLimit.primary_window),
    });
  }
  if (rateLimit.secondary_window) {
    windows.push({
      label: "7d",
      usedPercent: usedPercent(rateLimit.secondary_window),
      resetsAt: resetAt(rateLimit.secondary_window),
    });
  }
  return windows;
}

export async function fetchMultiAccountQuota(
  authStorage: AccountCredentialSource,
  account: Account,
  fetcher?: Fetcher,
): Promise<OpenAiCodexQuotaResult> {
  const apiKey = await authStorage.getApiKey(`${account.provider}-${account.id}`);
  if (account.provider === "openai") {
    return fetchOpenAiCodexQuota({
      accessToken: apiKey,
      accountId: account.accountId,
      fetcher,
    });
  }
  if (account.provider === "zai") return fetchZaiQuota({ apiKey, fetcher });

  return { success: false, error: `Quota fetching is not supported for ${account.provider}` };
}

function zaiResetAt(value: unknown): Date {
  const timestamp = typeof value === "number" ? value : Number(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : new Date(0);
}

export function parseZaiQuota(data: unknown): QuotaWindow[] {
  const limits = (data as { data?: { limits?: unknown } })?.data?.limits;
  if (!Array.isArray(limits)) return [];

  const windows: QuotaWindow[] = [];
  for (const limit of limits) {
    if (!limit || typeof limit !== "object") continue;
    const entry = limit as Record<string, unknown>;
    if (entry.type === "TOKENS_LIMIT") {
      const hours = Number(entry.number ?? 1);
      const percentage = Number(entry.percentage ?? 0);
      if (!Number.isFinite(hours) || !Number.isFinite(percentage)) continue;
      windows.push({
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
    windows.push({
      label: "Web / month",
      usedPercent: Math.max(0, Math.min(100, (used / total) * 100)),
      resetsAt: zaiResetAt(entry.nextResetTime),
    });
  }
  return windows;
}

interface ZaiQuotaOptions {
  apiKey?: string;
  fetcher?: Fetcher;
  signal?: AbortSignal;
}

export async function fetchZaiQuota({
  apiKey,
  fetcher = fetch,
  signal,
}: ZaiQuotaOptions): Promise<OpenAiCodexQuotaResult> {
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
    return { success: true, windows: parseZaiQuota(data) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Quota request failed" };
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const error = (body as { error?: { message?: unknown }; message?: unknown }).error;
  if (typeof error?.message === "string") return error.message;
  const message = (body as { message?: unknown }).message;
  return typeof message === "string" ? message : fallback;
}

export async function fetchOpenAiCodexQuota({
  accessToken,
  accountId,
  fetcher = fetch,
  signal,
}: OpenAiCodexQuotaOptions): Promise<OpenAiCodexQuotaResult> {
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
    return { success: true, windows: parseOpenAiCodexQuota(data) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Quota request failed" };
  }
}
