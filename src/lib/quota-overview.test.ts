import { describe, expect, it } from "vitest";
import { buildQuotaOverview } from "./quota-overview.js";

describe("buildQuotaOverview", () => {
  it("formats each account and its usage items", () => {
    expect(buildQuotaOverview([
      {
        account: { provider: "openai", id: "personal", key: "" },
        result: {
          success: true,
          items: [{ kind: "quota", label: "5h", usedPercent: 25, resetsAt: new Date("2026-04-15T12:00:00Z") }],
        },
      },
      {
        account: { provider: "zai", id: "work", key: "" },
        result: {
          success: true,
          items: [{ kind: "quota", label: "5h", usedPercent: 90, resetsAt: new Date("2026-04-14T13:00:00Z") }],
        },
      },
    ], new Date("2026-04-14T12:00:00Z"))).toEqual([
      { account: "openai-personal", status: "5h 25% (1d)", severity: "success" },
      { account: "zai-work", status: "5h 90% (1h)", severity: "error" },
    ]);
  });

  it("formats balance items without percentage or reset info", () => {
    expect(buildQuotaOverview([
      {
        account: { provider: "deepseek", id: "default", key: "" },
        result: {
          success: true,
          items: [{ kind: "balance", label: "Balance $10.50", amount: 10.50, currency: "USD" }],
        },
      },
    ], new Date("2026-04-14T12:00:00Z"))).toEqual([
      { account: "deepseek-default", status: "Balance $10.50", severity: "success" },
    ]);
  });

  it("flags empty balance as error", () => {
    expect(buildQuotaOverview([
      {
        account: { provider: "deepseek", id: "personal", key: "" },
        result: {
          success: true,
          items: [{ kind: "balance", label: "Balance $0.00", amount: 0, currency: "USD" }],
        },
      },
    ])).toEqual([
      { account: "deepseek-personal", status: "Balance $0.00", severity: "error" },
    ]);
  });

  it("orders accounts by provider and id", () => {
    expect(buildQuotaOverview([
      {
        account: { provider: "zai", id: "work", key: "" },
        result: {
          success: true,
          items: [{ kind: "quota", label: "5h", usedPercent: 10, resetsAt: new Date(0) }],
        },
      },
      {
        account: { provider: "deepseek", id: "default", key: "" },
        result: {
          success: true,
          items: [{ kind: "balance", label: "Balance $1.00", amount: 1, currency: "USD" }],
        },
      },
      {
        account: { provider: "deepseek", id: "personal", key: "" },
        result: {
          success: true,
          items: [{ kind: "balance", label: "Balance $2.00", amount: 2, currency: "USD" }],
        },
      },
    ], new Date("2026-04-14T12:00:00Z")).map((item) => item.account)).toEqual([
      "deepseek-default",
      "deepseek-personal",
      "zai-work",
    ]);
  });

  it("keeps unsupported or failed accounts visible with their error", () => {
    expect(buildQuotaOverview([
      {
        account: { provider: "anthropic", id: "team", key: "" },
        result: {
          success: false,
          error: "Quota fetching is not supported for anthropic",
        },
      },
    ], new Date("2026-04-14T12:00:00Z"))).toEqual([
      {
        account: "anthropic-team",
        status: "Quota fetching is not supported for anthropic",
        severity: "error",
      },
    ]);
  });
});
