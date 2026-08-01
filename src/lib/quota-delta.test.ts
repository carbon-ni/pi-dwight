import { describe, expect, it } from "vitest";
import { computeQuotaDelta, formatQuotaDelta } from "./quota-delta.js";
import type { ProviderUsageResult } from "../domain/usage-types.js";

const quota = (usedPercent: number): ProviderUsageResult => ({
  success: true,
  items: [{ kind: "quota", label: "5h", usedPercent, resetsAt: new Date(0) }],
});

const balance = (amount: number, currency = "USD"): ProviderUsageResult => ({
  success: true,
  items: [{ kind: "balance", label: `Credits $${amount}`, amount, currency }],
});

describe("formatQuotaDelta", () => {
  it("shows the balance decrease between baseline and now", () => {
    expect(formatQuotaDelta(balance(8.42), balance(8.39))).toBe("-$0.03");
  });

  it("shows the balance decrease in the item currency", () => {
    expect(formatQuotaDelta(balance(20, "CNY"), balance(19.5, "CNY"))).toBe("-¥0.50");
  });

  it("hides a balance increase (top-up or refund)", () => {
    expect(formatQuotaDelta(balance(8.39), balance(8.42))).toBeUndefined();
  });

  it("hides an unchanged balance", () => {
    expect(formatQuotaDelta(balance(8.42), balance(8.42))).toBeUndefined();
  });

  it("shows the percentage-point increase for quota windows", () => {
    expect(formatQuotaDelta(quota(42), quota(45))).toBe("+3%");
  });

  it("hides a negative quota delta (window reset)", () => {
    expect(formatQuotaDelta(quota(61), quota(5))).toBeUndefined();
  });

  it("hides an unchanged quota window", () => {
    expect(formatQuotaDelta(quota(42), quota(42))).toBeUndefined();
  });

  it("returns undefined when either fetch failed", () => {
    expect(
      formatQuotaDelta({ success: false, error: "boom" }, balance(8.39)),
    ).toBeUndefined();
    expect(
      formatQuotaDelta(balance(8.42), { success: false, error: "boom" }),
    ).toBeUndefined();
  });

  it("returns undefined when there is no baseline", () => {
    expect(formatQuotaDelta(undefined, balance(8.39))).toBeUndefined();
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
    expect(formatQuotaDelta(previous, current)).toBe("-$0.70");
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
    expect(formatQuotaDelta(previous, current)).toBeUndefined();
  });
});

describe("computeQuotaDelta", () => {
  it("stores the first successful sample as the session baseline", () => {
    const baseline = new Map();
    expect(computeQuotaDelta(baseline, "openrouter", balance(8.42))).toBeUndefined();
    expect(baseline.get("openrouter")).toEqual(balance(8.42));
  });

  it("measures later samples against the stored baseline", () => {
    const baseline = new Map([["openrouter", balance(8.42)]]);
    expect(computeQuotaDelta(baseline, "openrouter", balance(8.39))).toBe("-$0.03");
    expect(baseline.get("openrouter")).toEqual(balance(8.42));
  });

  it("keeps the baseline across many refreshes (start of session vs now)", () => {
    const baseline = new Map([["openrouter", balance(8.42)]]);
    computeQuotaDelta(baseline, "openrouter", balance(8.40));
    expect(computeQuotaDelta(baseline, "openrouter", balance(8.38))).toBe("-$0.04");
  });

  it("does not store a failed sample as baseline", () => {
    const baseline = new Map();
    expect(
      computeQuotaDelta(baseline, "openrouter", { success: false, error: "boom" }),
    ).toBeUndefined();
    expect(baseline.has("openrouter")).toBe(false);
  });

  it("keeps separate baselines per account", () => {
    const baseline = new Map([["openrouter", balance(8.42)]]);
    expect(computeQuotaDelta(baseline, "deepseek", balance(20))).toBeUndefined();
    expect(baseline.get("deepseek")).toEqual(balance(20));
    expect(baseline.get("openrouter")).toEqual(balance(8.42));
  });
});
