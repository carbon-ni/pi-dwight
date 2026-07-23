import { describe, expect, it } from "vitest";
import { formatQuotaStatus, findAccountForProvider } from "./quota-status.js";

describe("findAccountForProvider", () => {
  it("finds an account by its registered provider name", () => {
    expect(
      findAccountForProvider(
        [
          { provider: "openai", id: "personal", key: "" },
          { provider: "zai", id: "work", key: "" },
        ],
        "openai-personal",
      ),
    ).toMatchObject({ provider: "openai", id: "personal" });
  });

  it("finds the default account by its base provider name", () => {
    expect(
      findAccountForProvider(
        [{ provider: "deepseek", id: "default", key: "" }],
        "deepseek",
      ),
    ).toMatchObject({ provider: "deepseek", id: "default" });
  });

  it("returns undefined when the active provider is not a managed account", () => {
    expect(findAccountForProvider([], "openai-codex")).toBeUndefined();
  });
});

const now = Date.now();
const in5days = new Date(now + 5 * 24 * 60 * 60 * 1000);
const in12hours = new Date(now + 12 * 60 * 60 * 1000);
const in45mins = new Date(now + 45 * 60 * 1000);
const epoch = new Date(0);

describe("formatQuotaStatus", () => {
  it("shows usage and days until reset for multi-day quota items", () => {
    expect(
      formatQuotaStatus("personal", {
        success: true,
        items: [
          { kind: "quota", label: "5h", usedPercent: 25, resetsAt: in5days },
          { kind: "quota", label: "7d", usedPercent: 60, resetsAt: in5days },
        ],
      }),
    ).toBe("personal: 5h 25% (5d) · 7d 60% (5d)");
  });

  it("shows hours when less than a day remains", () => {
    expect(
      formatQuotaStatus("personal", {
        success: true,
        items: [{ kind: "quota", label: "1h", usedPercent: 80, resetsAt: in12hours }],
      }),
    ).toBe("personal: 1h 80% (12h)");
  });

  it("shows minutes when less than an hour remains", () => {
    expect(
      formatQuotaStatus("personal", {
        success: true,
        items: [{ kind: "quota", label: "5h", usedPercent: 90, resetsAt: in45mins }],
      }),
    ).toBe("personal: 5h 90% (45m)");
  });

  it("omits reset info for quota items already past reset", () => {
    expect(
      formatQuotaStatus("personal", {
        success: true,
        items: [
          { kind: "quota", label: "5h", usedPercent: 0, resetsAt: epoch },
          { kind: "quota", label: "7d", usedPercent: 50, resetsAt: in5days },
        ],
      }),
    ).toBe("personal: 5h 0% · 7d 50% (5d)");
  });

  it("shows balance items directly without percentage or reset", () => {
    expect(
      formatQuotaStatus("deepseek", {
        success: true,
        items: [{ kind: "balance", label: "Balance $10.50", amount: 10.50, currency: "USD" }],
      }),
    ).toBe("deepseek: Balance $10.50");
  });

  it("does not show a status when quota fetching fails", () => {
    expect(formatQuotaStatus("personal", { success: false, error: "Unauthorized" })).toBeUndefined();
  });
});
