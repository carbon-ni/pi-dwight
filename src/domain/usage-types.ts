/**
 * Usage item kinds for provider quota/balance display.
 *
 * - quota: a limit that resets (e.g. rate-limit window, monthly token cap)
 * - balance: remaining prepaid credit (e.g. wallet balance)
 */
export interface UsageQuota {
  kind: "quota";
  label: string;
  usedPercent: number;
  resetsAt: Date;
}

export interface UsageBalance {
  kind: "balance";
  label: string;
  amount: number;
  currency: string;
}

export type UsageItem = UsageQuota | UsageBalance;

export type ProviderUsageResult =
  | { success: true; items: UsageItem[] }
  | { success: false; error: string };

export interface ProviderQuotaFetchOptions {
  /** Provider-specific metadata (e.g. accountId for OpenAI Codex) */
  accountId?: string;
  /** Credential provider name for auth.json fallback (e.g. "openai-personal") */
  credentialProvider?: string;
  fetcher?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

export interface ProviderQuotaPlugin {
  fetch(
    apiKey: string | undefined,
    options?: ProviderQuotaFetchOptions,
  ): Promise<ProviderUsageResult>;
}
