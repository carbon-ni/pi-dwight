import { describe, expect, it, vi } from "vitest";
import type { Account } from "../domain/accounts.js";
import { failoverRateLimitedModel } from "./model-failover.js";

const accounts: Account[] = [
  { provider: "openai", id: "personal", key: "" },
  { provider: "openai", id: "daily", key: "" },
  { provider: "openai", id: "weekly", key: "" },
  { provider: "anthropic", id: "work", key: "" },
];

const quotaResults = {
  daily: {
    success: true as const,
    items: [{ kind: "quota" as const, label: "Daily", usedPercent: 50, resetsAt: new Date("2026-04-15T12:00:00Z") }],
  },
  weekly: {
    success: true as const,
    items: [{ kind: "quota" as const, label: "Weekly", usedPercent: 20, resetsAt: new Date("2026-04-21T12:00:00Z") }],
  },
};

describe("failoverRateLimitedModel", () => {
  it("switches the same model to the best available account", async () => {
    const dailyModel = { provider: "openai-daily", id: "gpt-5.4" };
    const setModel = vi.fn().mockResolvedValue(true);

    const result = await failoverRateLimitedModel({
      currentModel: { provider: "openai-personal", id: "gpt-5.4" },
      accounts,
      blockedProviders: new Set(["openai-personal"]),
      readQuotas: vi.fn().mockResolvedValue([
        { account: accounts[1], result: quotaResults.daily },
        { account: accounts[2], result: quotaResults.weekly },
      ]),
      findModel: (provider) => provider === "openai-daily" ? dailyModel : undefined,
      setModel,
      now: new Date("2026-04-14T12:00:00Z"),
    });

    expect(setModel).toHaveBeenCalledWith(dailyModel);
    expect(result).toEqual({ from: "openai-personal", to: "openai-daily", model: "gpt-5.4" });
  });

  it("tries the next ranked account when the best model cannot be selected", async () => {
    const dailyModel = { provider: "openai-daily", id: "gpt-5.4" };
    const weeklyModel = { provider: "openai-weekly", id: "gpt-5.4" };
    const setModel = vi.fn()
      .mockRejectedValueOnce(new Error("No auth"))
      .mockResolvedValueOnce(true);

    const result = await failoverRateLimitedModel({
      currentModel: { provider: "openai-personal", id: "gpt-5.4" },
      accounts,
      blockedProviders: new Set(["openai-personal"]),
      readQuotas: vi.fn().mockResolvedValue([
        { account: accounts[1], result: quotaResults.daily },
        { account: accounts[2], result: quotaResults.weekly },
      ]),
      findModel: (provider) => provider === "openai-daily" ? dailyModel : weeklyModel,
      setModel,
      now: new Date("2026-04-14T12:00:00Z"),
    });

    expect(setModel).toHaveBeenNthCalledWith(1, dailyModel);
    expect(setModel).toHaveBeenNthCalledWith(2, weeklyModel);
    expect(result?.to).toBe("openai-weekly");
  });

  it("uses only explicitly equivalent cross-provider models", async () => {
    const opus = { provider: "anthropic-work", id: "claude-opus-4-6" };
    const setModel = vi.fn().mockResolvedValue(true);

    const result = await failoverRateLimitedModel({
      currentModel: { provider: "openai-personal", id: "gpt-5.4" },
      accounts,
      fallbackGroups: [{
        name: "coding-high",
        models: [
          { provider: "openai-personal", model: "gpt-5.4" },
          { provider: "anthropic-work", model: "claude-opus-4-6" },
        ],
      }],
      blockedProviders: new Set(["openai-personal"]),
      readQuotas: vi.fn().mockResolvedValue([{
        account: accounts[3],
        result: {
          success: true,
          items: [{ kind: "quota", label: "Weekly", usedPercent: 10, resetsAt: new Date("2026-04-15T12:00:00Z") }],
        },
      }]),
      findModel: (provider, model) => provider === opus.provider && model === opus.id ? opus : undefined,
      setModel,
      now: new Date("2026-04-14T12:00:00Z"),
    });

    expect(setModel).toHaveBeenCalledWith(opus);
    expect(result).toEqual({ from: "openai-personal", to: "anthropic-work", model: "claude-opus-4-6" });
  });

  it("does not switch to an unconfigured lower-level model", async () => {
    const setModel = vi.fn();

    const result = await failoverRateLimitedModel({
      currentModel: { provider: "openai-personal", id: "gpt-5.4" },
      accounts: [accounts[0], accounts[3]],
      blockedProviders: new Set(["openai-personal"]),
      readQuotas: vi.fn(),
      findModel: vi.fn(),
      setModel,
    });

    expect(result).toBeUndefined();
    expect(setModel).not.toHaveBeenCalled();
  });

  it("does not switch when every other account is exhausted", async () => {
    const setModel = vi.fn();

    const result = await failoverRateLimitedModel({
      currentModel: { provider: "openai-personal", id: "gpt-5.4" },
      accounts,
      blockedProviders: new Set(["openai-personal"]),
      readQuotas: vi.fn().mockResolvedValue([
        {
          account: accounts[1],
          result: {
            success: true,
            items: [{ kind: "quota", label: "Daily", usedPercent: 100, resetsAt: new Date("2026-04-15T12:00:00Z") }],
          },
        },
      ]),
      findModel: vi.fn(),
      setModel,
      now: new Date("2026-04-14T12:00:00Z"),
    });

    expect(result).toBeUndefined();
    expect(setModel).not.toHaveBeenCalled();
  });
});
