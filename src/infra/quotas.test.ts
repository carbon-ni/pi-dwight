import { describe, expect, it, vi } from "vitest";
import {
  fetchMultiAccountQuota,
  fetchMultiAccountQuotas,
  fetchDeepSeekQuota,
  fetchOpenAiCodexQuota,
  fetchZaiQuota,
  parseDeepSeekQuota,
  parseOpenAiCodexQuota,
  parseZaiQuota,
} from "./quotas.js";

describe("parseOpenAiCodexQuota", () => {
  it("maps primary and weekly limits into quota windows", () => {
    expect(
      parseOpenAiCodexQuota({
        rate_limit: {
          primary_window: { used_percent: 25, reset_at: 1_700_000_000 },
          secondary_window: { used_percent: 60, reset_at: 1_700_100_000 },
        },
      }),
    ).toEqual([
      { label: "5h", usedPercent: 25, resetsAt: new Date(1_700_000_000_000) },
      { label: "7d", usedPercent: 60, resetsAt: new Date(1_700_100_000_000) },
    ]);
  });

  it("returns no windows for an unrecognised response", () => {
    expect(parseOpenAiCodexQuota({})).toEqual([]);
  });
});

describe("parseZaiQuota", () => {
  it("maps token and web-search limits", () => {
    expect(parseZaiQuota({ data: { limits: [
      { type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 20, nextResetTime: 1_700_000_000_000 },
      { type: "TIME_LIMIT", usage: 100, currentValue: 25, nextResetTime: 1_700_100_000_000 },
    ] } })).toEqual([
      { label: "5h", usedPercent: 20, resetsAt: new Date(1_700_000_000_000) },
      { label: "Web / month", usedPercent: 25, resetsAt: new Date(1_700_100_000_000) },
    ]);
  });

  it("ignores unknown or invalid limits", () => {
    expect(parseZaiQuota({ data: { limits: [{ type: "TIME_LIMIT", usage: 0 }] } })).toEqual([]);
  });
});

describe("parseDeepSeekQuota", () => {
  it("maps a positive account balance into an available quota window", () => {
    expect(parseDeepSeekQuota({
      is_available: true,
      balance_infos: [
        { currency: "USD", total_balance: "10.50", granted_balance: "0.00", topped_up_balance: "10.50" },
      ],
    })).toEqual([
      { label: "Balance $10.50", usedPercent: 0, resetsAt: new Date(0) },
    ]);
  });

  it("maps unavailable or empty balances into an exhausted quota window", () => {
    expect(parseDeepSeekQuota({
      is_available: false,
      balance_infos: [
        { currency: "CNY", total_balance: "0.00", granted_balance: "0.00", topped_up_balance: "0.00" },
      ],
    })).toEqual([
      { label: "Balance ¥0.00", usedPercent: 100, resetsAt: new Date(0) },
    ]);
  });

  it("returns no windows for an unrecognised response", () => {
    expect(parseDeepSeekQuota({})).toEqual([]);
  });
});

describe("fetchOpenAiCodexQuota", () => {
  it("requests the Codex usage endpoint with account credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ rate_limit: {} }), { status: 200 }),
    );

    await expect(
      fetchOpenAiCodexQuota({
        accessToken: "access-token",
        accountId: "account-id",
        fetcher,
      }),
    ).resolves.toEqual({ success: true, windows: [] });

    expect(fetcher).toHaveBeenCalledWith(
      "https://chatgpt.com/backend-api/wham/usage",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "ChatGPT-Account-Id": "account-id",
        }),
      }),
    );
  });

  it("does not make a request when credentials are incomplete", async () => {
    const fetcher = vi.fn();

    await expect(
      fetchOpenAiCodexQuota({ accessToken: "access-token", fetcher }),
    ).resolves.toEqual({ success: false, error: "No OpenAI account ID found" });

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses a multi-account provider credential", async () => {
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

  it("uses the canonical provider credential for default accounts", async () => {
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

  it("returns a readable error for a failed request", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Unauthorized" } }), { status: 401 }),
    );

    await expect(
      fetchOpenAiCodexQuota({
        accessToken: "access-token",
        accountId: "account-id",
        fetcher,
      }),
    ).resolves.toEqual({ success: false, error: "Unauthorized" });
  });
});

describe("fetchMultiAccountQuotas", () => {
  it("fetches quota data for every configured account", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ rate_limit: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { limits: [] } }), { status: 200 }));
    const authStorage = { getApiKey: vi.fn().mockResolvedValue("access-token") };

    await expect(fetchMultiAccountQuotas(authStorage, [
      { provider: "openai", id: "personal", key: "", accountId: "account-id" },
      { provider: "zai", id: "work", key: "" },
    ], fetcher)).resolves.toEqual([
      { account: { provider: "openai", id: "personal", key: "", accountId: "account-id" }, result: { success: true, windows: [] } },
      { account: { provider: "zai", id: "work", key: "" }, result: { success: true, windows: [] } },
    ]);

    expect(authStorage.getApiKey).toHaveBeenCalledWith("openai-personal");
    expect(authStorage.getApiKey).toHaveBeenCalledWith("zai-work");
  });
});

describe("fetchDeepSeekQuota", () => {
  it("requests the DeepSeek balance endpoint with the API key", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ is_available: true, balance_infos: [
        { currency: "USD", total_balance: "1.25" },
      ] }), { status: 200 }),
    );

    await expect(fetchDeepSeekQuota({ apiKey: "deepseek-key", fetcher })).resolves.toEqual({
      success: true,
      windows: [{ label: "Balance $1.25", usedPercent: 0, resetsAt: new Date(0) }],
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.deepseek.com/user/balance",
      expect.objectContaining({ headers: { Authorization: "Bearer deepseek-key", Accept: "application/json" } }),
    );
  });

  it("does not make a request without an API key", async () => {
    const fetcher = vi.fn();

    await expect(fetchDeepSeekQuota({ fetcher })).resolves.toEqual({ success: false, error: "No DeepSeek API key found" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("fetchZaiQuota", () => {
  it("requests the Z.ai quota endpoint with the API key", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { limits: [] } }), { status: 200 }),
    );

    await expect(fetchZaiQuota({ apiKey: "zai-key", fetcher })).resolves.toEqual({ success: true, windows: [] });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.z.ai/api/monitor/usage/quota/limit",
      expect.objectContaining({ headers: { Authorization: "Bearer zai-key", Accept: "application/json" } }),
    );
  });

  it("does not make a request without an API key", async () => {
    const fetcher = vi.fn();

    await expect(fetchZaiQuota({ fetcher })).resolves.toEqual({ success: false, error: "No Z.ai API key found" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
