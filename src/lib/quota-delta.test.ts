import { describe, expect, it } from "vitest";
import { formatSpentBetweenUpdates } from "./quota-delta.js";
import type { ProviderUsageResult } from "../domain/usage-types.js";

const quota = (usedPercent: number): ProviderUsageResult => ({
  success: true,
  items: [{ kind: "quota", label: "5h", usedPercent, resetsAt: new Date(0) }],
});

const balance = (amount: number, currency = "USD"): ProviderUsageResult => ({
  success: true,
  items: [{ kind: "balance", label: `Credits $${amount}`, amount, currency }],
});

describe("formatSpentBetweenUpdates", () => {
  it("shows spent balance between two updates", () => {
    expect(formatSpentBetweenUpdates(balance(8.42), balance(8.39))).toBe("spent $0.03");
  });

  it("shows spent balance in the item currency", () => {
    expect(formatSpentBetweenUpdates(balance(20, "CNY"), balance(19.5, "CNY"))).toBe("spent ¥0.50");
  });

  it("hides a balance increase (top-up or refund)", () => {
    expect(formatSpentBetweenUpdates(balance(8.39), balance(8.42))).toBeUndefined();
  });

  it("hides an unchanged balance", () => {
    expect(formatSpentBetweenUpdates(balance(8.42), balance(8.42))).toBeUndefined();
  });

  it("shows the percentage-point increase for quota windows", () => {
    expect(formatSpentBetweenUpdates(quota(42), quota(45))).toBe("+3%");
  });

  it("hides a negative quota delta (window reset)", () => {
    expect(formatSpentBetweenUpdates(quota(61), quota(5))).toBeUndefined();
  });

  it("hides an unchanged quota window", () => {
    expect(formatSpentBetweenUpdates(quota(42), quota(42))).toBeUndefined();
  });

  it("returns undefined when either fetch failed", () => {
    expect(
      formatSpentBetweenUpdates({ success: false, error: "boom" }, balance(8.39)),
    ).toBeUndefined();
    expect(
      formatSpentBetweenUpdates(balance(8.42), { success: false, error: "boom" }),
    ).toBeUndefined();
  });

  it("returns undefined when there is no previous result", () => {
    expect(formatSpentBetweenUpdates(undefined, balance(8.39))).toBeUndefined();
  });

  it("sums spent across multiple balance items of the same currency", () => {
    const previous: ProviderUsageResult = {
      success: true,
      items: [
        { kind: "balance", label: "USD", amount: 10, currency: "USD" },
        { kind: "balance", label: "USD2", amount: 5, currency: "USD" },
      ],
    };
    const current: ProviderUsageResult = {
      success: true,
      items: [
        { kind: "balance", label: "USD", amount: 9.5, currency: "USD" },
        { kind: "balance", label: "USD2", amount: 4.8, currency: "USD" },
      ],
    };
    expect(formatSpentBetweenUpdates(previous, current)).toBe("spent $0.70");
  });

  it("hides spent when balance items use mixed currencies", () => {
    const previous: ProviderUsageResult = {
      success: true,
      items: [
        { kind: "balance", label: "USD", amount: 10, currency: "USD" },
        { kind: "balance", label: "CNY", amount: 20, currency: "CNY" },
      ],
    };
    const current: ProviderUsageResult = {
      success: true,
      items: [
        { kind: "balance", label: "USD", amount: 9.5, currency: "USD" },
        { kind: "balance", label: "CNY", amount: 19, currency: "CNY" },
      ],
    };
    expect(formatSpentBetweenUpdates(previous, current)).toBeUndefined();
  });
});
