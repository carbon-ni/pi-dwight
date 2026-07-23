import { describe, expect, it } from "vitest";
import { buildQuotaOverview } from "./quota-overview.js";

describe("buildQuotaOverview", () => {
  it("formats each account and its quota windows", () => {
    expect(buildQuotaOverview([
      { account: { provider: "openai", id: "personal", key: "" }, result: {
        success: true,
        windows: [{ label: "5h", usedPercent: 25, resetsAt: new Date("2026-04-15T12:00:00Z") }],
      } },
      { account: { provider: "zai", id: "work", key: "" }, result: {
        success: true,
        windows: [{ label: "5h", usedPercent: 90, resetsAt: new Date("2026-04-14T13:00:00Z") }],
      } },
    ], new Date("2026-04-14T12:00:00Z"))).toEqual([
      { account: "openai-personal", status: "5h 25% (1d)", severity: "success" },
      { account: "zai-work", status: "5h 90% (1h)", severity: "error" },
    ]);
  });

  it("keeps unsupported or failed accounts visible with their error", () => {
    expect(buildQuotaOverview([
      { account: { provider: "anthropic", id: "team", key: "" }, result: {
        success: false,
        error: "Quota fetching is not supported for anthropic",
      } },
    ], new Date("2026-04-14T12:00:00Z"))).toEqual([
      {
        account: "anthropic-team",
        status: "Quota fetching is not supported for anthropic",
        severity: "error",
      },
    ]);
  });
});
