import { describe, expect, it, vi } from "vitest";
import { failoverIfActiveQuotaExhausted } from "./active-quota-failover.js";

describe("failoverIfActiveQuotaExhausted", () => {
  it("fails over when the active account has a fully consumed quota window", async () => {
    const account = { provider: "openai", id: "second", key: "" };
    const failover = vi.fn().mockResolvedValue(undefined);

    const failedOver = await failoverIfActiveQuotaExhausted({
      currentProvider: "openai-second",
      listAccounts: vi.fn().mockResolvedValue([account]),
      readQuota: vi.fn().mockResolvedValue({
        success: true,
        items: [{ kind: "quota", label: "5 hour", usedPercent: 100, resetsAt: new Date("2026-04-14T12:41:00Z") }],
      }),
      failover,
    });

    expect(failedOver).toBe(true);
    expect(failover).toHaveBeenCalledOnce();
  });

  it("does not fail over when usage is unavailable or not exhausted", async () => {
    const failover = vi.fn();

    const failedOver = await failoverIfActiveQuotaExhausted({
      currentProvider: "openai-second",
      listAccounts: vi.fn().mockResolvedValue([{ provider: "openai", id: "second", key: "" }]),
      readQuota: vi.fn().mockResolvedValue({ success: false, error: "Unavailable" }),
      failover,
    });

    expect(failedOver).toBe(false);
    expect(failover).not.toHaveBeenCalled();
  });
});
