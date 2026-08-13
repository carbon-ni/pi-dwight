import { describe, expect, it } from "vitest";
import { rankQuotaAccounts } from "./account-priority.js";

describe("rankQuotaAccounts", () => {
  const now = new Date("2026-04-14T12:00:00Z");

  it("ranks first the account whose remaining quota expires fastest", () => {
    const ranked = rankQuotaAccounts([
      {
        account: { provider: "openai", id: "weekly", key: "" },
        result: {
          success: true as const,
          items: [{ kind: "quota" as const, label: "Weekly", usedPercent: 20, resetsAt: new Date("2026-04-21T12:00:00Z") }],
        },
      },
      {
        account: { provider: "openai", id: "daily", key: "" },
        result: {
          success: true as const,
          items: [{ kind: "quota" as const, label: "Daily", usedPercent: 50, resetsAt: new Date("2026-04-15T12:00:00Z") }],
        },
      },
    ], now);

    expect(ranked.map(({ account }) => account.id)).toEqual(["daily", "weekly"]);
  });

  it("uses configured provider order when quota pressure ties", () => {
    const sameQuota = (id: string) => ({
      account: { provider: "openai", id, key: "" },
      result: {
        success: true as const,
        items: [{ kind: "quota" as const, label: "Daily", usedPercent: 50, resetsAt: new Date("2026-04-15T12:00:00Z") }],
      },
    });

    const ranked = rankQuotaAccounts(
      [sameQuota("personal"), sameQuota("work")],
      now,
      ["openai-work", "openai-personal"],
    );

    expect(ranked.map(({ account }) => account.id)).toEqual(["work", "personal"]);
  });

  it("uses positive balance accounts after quota accounts when enabled", () => {
    const ranked = rankQuotaAccounts([
      {
        account: { provider: "deepseek", id: "default", key: "" },
        result: {
          success: true as const,
          items: [{ kind: "balance" as const, label: "Balance $10", amount: 10, currency: "USD" }],
        },
      },
      {
        account: { provider: "openrouter", id: "default", key: "" },
        result: {
          success: true as const,
          items: [{ kind: "balance" as const, label: "Balance $20", amount: 20, currency: "USD" }],
        },
      },
    ], now, ["deepseek", "openrouter"], { includeBalance: true });

    expect(ranked.map(({ account }) => account.provider)).toEqual(["deepseek", "openrouter"]);
  });

  it("excludes empty balance accounts when balance fallback is enabled", () => {
    const ranked = rankQuotaAccounts([{
      account: { provider: "openrouter", id: "default", key: "" },
      result: {
        success: true as const,
        items: [{ kind: "balance" as const, label: "Balance $0", amount: 0, currency: "USD" }],
      },
    }], now, ["openrouter"], { includeBalance: true });

    expect(ranked).toEqual([]);
  });

  it("excludes exhausted and failed accounts", () => {
    const ranked = rankQuotaAccounts([
      {
        account: { provider: "openai", id: "exhausted", key: "" },
        result: {
          success: true as const,
          items: [{ kind: "quota" as const, label: "Daily", usedPercent: 100, resetsAt: new Date("2026-04-15T12:00:00Z") }],
        },
      },
      {
        account: { provider: "openai", id: "failed", key: "" },
        result: { success: false as const, error: "Unavailable" },
      },
    ], now);

    expect(ranked).toEqual([]);
  });
});
