import { describe, expect, it, vi } from "vitest";
import {
  fetchMultiAccountQuota,
  fetchMultiAccountQuotas,
  parseAnthropicQuota,
  parseDeepSeekQuota,
  parseOpenAiCodexQuota,
  parseOpenRouterQuota,
  parseZaiQuota,
} from "./quotas.js";

describe("parseOpenAiCodexQuota", () => {
  it("maps primary and weekly limits into quota items", () => {
    expect(
      parseOpenAiCodexQuota({
        rate_limit: {
          primary_window: { used_percent: 25, reset_at: 1_700_000_000 },
          secondary_window: { used_percent: 60, reset_at: 1_700_100_000 },
        },
      }),
    ).toEqual([
      { kind: "quota", label: "5h", usedPercent: 25, resetsAt: new Date(1_700_000_000_000) },
      { kind: "quota", label: "7d", usedPercent: 60, resetsAt: new Date(1_700_100_000_000) },
    ]);
  });

  it("returns no items for an unrecognised response", () => {
    expect(parseOpenAiCodexQuota({})).toEqual([]);
  });
});

describe("parseZaiQuota", () => {
  it("maps token and web-search limits", () => {
    expect(parseZaiQuota({ data: { limits: [
      { type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 20, nextResetTime: 1_700_000_000_000 },
      { type: "TIME_LIMIT", usage: 100, currentValue: 25, nextResetTime: 1_700_100_000_000 },
    ] } })).toEqual([
      { kind: "quota", label: "5h", usedPercent: 20, resetsAt: new Date(1_700_000_000_000) },
      { kind: "quota", label: "Web / month", usedPercent: 25, resetsAt: new Date(1_700_100_000_000) },
    ]);
  });

  it("ignores unknown or invalid limits", () => {
    expect(parseZaiQuota({ data: { limits: [{ type: "TIME_LIMIT", usage: 0 }] } })).toEqual([]);
  });
});

describe("parseDeepSeekQuota", () => {
  it("maps a positive account balance into a balance item", () => {
    expect(parseDeepSeekQuota({
      is_available: true,
      balance_infos: [
        { currency: "USD", total_balance: "10.50", granted_balance: "0.00", topped_up_balance: "10.50" },
      ],
    })).toEqual([
      { kind: "balance", label: "Balance $10.50", amount: 10.50, currency: "USD" },
    ]);
  });

  it("maps unavailable or empty balances into a zero-amount balance item", () => {
    expect(parseDeepSeekQuota({
      is_available: false,
      balance_infos: [
        { currency: "CNY", total_balance: "0.00", granted_balance: "0.00", topped_up_balance: "0.00" },
      ],
    })).toEqual([
      { kind: "balance", label: "Balance ¥0.00", amount: 0, currency: "CNY" },
    ]);
  });

  it("returns no items for an unrecognised response", () => {
    expect(parseDeepSeekQuota({})).toEqual([]);
  });
});

describe("parseAnthropicQuota", () => {
  it("maps balance and monthly limits into mixed usage items", () => {
    expect(parseAnthropicQuota({
      five_hour: { utilization: 23.4, resets_at: "2026-04-22T18:30:00Z" },
      seven_day: { utilization: 14.1, resets_at: "2026-04-25T08:30:00Z" },
      seven_day_sonnet: { utilization: 8, resets_at: "2026-04-23T23:00:00Z" },
      extra_usage: {
        is_enabled: true,
        monthly_limit: 30000,
        used_credits: 21548,
        utilization: 71.83,
        currency: "AUD",
      },
    })).toEqual([
      { kind: "quota", label: "5h", usedPercent: 23.4, resetsAt: new Date("2026-04-22T18:30:00Z") },
      { kind: "quota", label: "7d", usedPercent: 14.1, resetsAt: new Date("2026-04-25T08:30:00Z") },
      { kind: "quota", label: "7d Sonnet", usedPercent: 8, resetsAt: new Date("2026-04-23T23:00:00Z") },
      expect.objectContaining({ kind: "quota", label: "Extra (AUD)", usedPercent: 71.83 }),
    ]);
  });

  it("returns no items for an unrecognised response", () => {
    expect(parseAnthropicQuota({})).toEqual([]);
  });
});

describe("parseOpenRouterQuota", () => {
  it("calculates remaining credits from total and usage", () => {
    expect(parseOpenRouterQuota({ data: { total_credits: 100.5, total_usage: 25.75 } })).toEqual([
      { kind: "balance", label: "Credits $74.75", amount: 74.75, currency: "USD" },
    ]);
  });

  it("returns no items for an unrecognised response", () => {
    expect(parseOpenRouterQuota({})).toEqual([]);
  });
});

describe("fetchMultiAccountQuotas", () => {
  it("fetches quota data for every configured account via plugin", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ rate_limit: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { limits: [] } }), { status: 200 }));
    const authStorage = { getApiKey: vi.fn().mockResolvedValue("access-token") };

    await expect(fetchMultiAccountQuotas(authStorage, [
      { provider: "openai", id: "personal", key: "", accountId: "account-id" },
      { provider: "zai", id: "work", key: "" },
    ], fetcher)).resolves.toEqual([
      {
        account: { provider: "openai", id: "personal", key: "", accountId: "account-id" },
        result: { success: true, items: [] },
      },
      {
        account: { provider: "zai", id: "work", key: "" },
        result: { success: true, items: [] },
      },
    ]);

    expect(authStorage.getApiKey).toHaveBeenCalledWith("openai-personal");
    expect(authStorage.getApiKey).toHaveBeenCalledWith("zai-work");
  });
});

describe("fetchMultiAccountQuota", () => {
  it("uses a multi-account provider credential for openai", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ rate_limit: {} }), { status: 200 }),
    );
    const authStorage = { getApiKey: vi.fn().mockResolvedValue("access-token") };

    await fetchMultiAccountQuota(
      authStorage,
      { provider: "openai", id: "personal", key: "", accountId: "account-id" },
      fetcher,
    );

    expect(authStorage.getApiKey).toHaveBeenCalledWith("openai-personal");
    expect(fetcher).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer access-token" }),
      }),
    );
  });

  it("uses the canonical provider credential for default deepseek", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ is_available: true, balance_infos: [] }), { status: 200 }),
    );
    const authStorage = { getApiKey: vi.fn().mockResolvedValue("deepseek-key") };

    await fetchMultiAccountQuota(authStorage, { provider: "deepseek", id: "default", key: "" }, fetcher);

    expect(authStorage.getApiKey).toHaveBeenCalledWith("deepseek");
  });

  it("uses a Z.ai multi-account provider credential", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { limits: [] } }), { status: 200 }),
    );
    const authStorage = { getApiKey: vi.fn().mockResolvedValue("zai-key") };

    await fetchMultiAccountQuota(authStorage, { provider: "zai", id: "work", key: "" }, fetcher);

    expect(authStorage.getApiKey).toHaveBeenCalledWith("zai-work");
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.z.ai/api/monitor/usage/quota/limit",
      expect.any(Object),
    );
  });

  it("uses a DeepSeek multi-account provider credential", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ is_available: true, balance_infos: [] }), { status: 200 }),
    );
    const authStorage = { getApiKey: vi.fn().mockResolvedValue("deepseek-key") };

    await fetchMultiAccountQuota(authStorage, { provider: "deepseek", id: "work", key: "" }, fetcher);

    expect(authStorage.getApiKey).toHaveBeenCalledWith("deepseek-work");
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.deepseek.com/user/balance",
      expect.any(Object),
    );
  });

  it("uses an OpenRouter multi-account provider credential", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { total_credits: 100.5, total_usage: 25.75 } }), { status: 200 }),
    );
    const authStorage = { getApiKey: vi.fn().mockResolvedValue("or-key") };

    const result = await fetchMultiAccountQuota(authStorage, { provider: "openrouter", id: "work", key: "" }, fetcher);

    expect(authStorage.getApiKey).toHaveBeenCalledWith("openrouter-work");
    expect(fetcher).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/credits",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer or-key" }),
      }),
    );
    expect(result).toEqual({
      success: true,
      items: [{
        kind: "balance",
        label: "Credits $74.75",
        amount: 74.75,
        currency: "USD",
      }],
    });
  });

  it("uses an Anthropic multi-account provider credential", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ five_hour: { utilization: 23.4, resets_at: "2026-04-22T18:30:00Z" } }), { status: 200 }),
    );
    const authStorage = { getApiKey: vi.fn().mockResolvedValue("oauth-token") };

    const result = await fetchMultiAccountQuota(authStorage, { provider: "anthropic", id: "work", key: "" }, fetcher);

    expect(authStorage.getApiKey).toHaveBeenCalledWith("anthropic-work");
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.anthropic.com/api/oauth/usage",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer oauth-token",
          "anthropic-beta": "oauth-2025-04-20",
        }),
      }),
    );
    expect(result).toEqual({
      success: true,
      items: [{ kind: "quota", label: "5h", usedPercent: 23.4, resetsAt: new Date("2026-04-22T18:30:00Z") }],
    });
  });

  it("returns a readable error for an unsupported provider", async () => {
    const authStorage = { getApiKey: vi.fn() };

    await expect(
      fetchMultiAccountQuota(authStorage, { provider: "unknown", id: "team", key: "" }),
    ).resolves.toEqual({ success: false, error: "Quota fetching is not supported for unknown" });
  });
});
