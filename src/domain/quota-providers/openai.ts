/**
 * OpenAI Codex quota — parser, fetcher, and plugin entry point.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderQuotaFetchOptions, ProviderUsageResult, UsageQuota } from "../usage-types.js";
import { usedPercent, resetAt, errorMessage } from "./shared.js";

type Fetcher = typeof globalThis.fetch;

export function parseOpenAiCodexQuota(data: unknown): UsageQuota[] {
  if (!data || typeof data !== "object") return [];

  const rateLimit = (data as { rate_limit?: Record<string, unknown> }).rate_limit;
  if (!rateLimit) return [];

  const items: UsageQuota[] = [];
  if (rateLimit.primary_window) {
    items.push({
      kind: "quota", label: "5h",
      usedPercent: usedPercent(rateLimit.primary_window),
      resetsAt: resetAt(rateLimit.primary_window),
    });
  }
  if (rateLimit.secondary_window) {
    items.push({
      kind: "quota", label: "7d",
      usedPercent: usedPercent(rateLimit.secondary_window),
      resetsAt: resetAt(rateLimit.secondary_window),
    });
  }
  return items;
}

interface OpenAiCodexQuotaOptions {
  accessToken?: string;
  accountId?: string;
  fetcher?: Fetcher;
  signal?: AbortSignal;
}

async function fetchOpenAiCodexQuota({
  accessToken, accountId, fetcher = fetch, signal,
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

export function openaiFetch(apiKey: string | undefined, options?: ProviderQuotaFetchOptions): Promise<ProviderUsageResult> {
  return fetchOpenAiCodexQuota({
    accessToken: apiKey,
    accountId: options?.accountId ?? readOpenAiAccountId(options?.credentialProvider ?? "openai-default"),
    fetcher: options?.fetcher,
    signal: options?.signal,
  });
}
