import { describe, expect, it, vi } from "vitest";
import {
  fetchMultiAccountQuota,
  fetchOpenAiCodexQuota,
  parseOpenAiCodexQuota,
} from "./quotas.js";

describe("parseOpenAiCodexQuota", () => {
  it("maps primary and weekly limits into quota windows", () => {
    expect(
      parseOpenAiCodexQuota({
        rate_limit: {
          primary_window: { percent_left: 75, reset_at: 1_700_000_000 },
          secondary_window: { percent_left: 40, reset_at: 1_700_100_000 },
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
