import { describe, expect, it, vi } from "vitest";
import { createFailoverDiagnostics } from "./failover-diagnostics.js";

describe("createFailoverDiagnostics", () => {
  it("appends a timestamped, JSONL-safe event without exposing credentials", async () => {
    const append = vi.fn().mockResolvedValue(undefined);
    const diagnostics = createFailoverDiagnostics("/tmp/failover.jsonl", append);

    await diagnostics.record({ event: "quota-check", provider: "zai", outcome: "exhausted" });

    expect(append).toHaveBeenCalledWith(
      "/tmp/failover.jsonl",
      expect.stringMatching(/^\{"timestamp":".+","event":"quota-check","provider":"zai","outcome":"exhausted"\}\n$/),
      "utf8",
    );
  });

  it("does not let a diagnostic write failure interrupt failover", async () => {
    const diagnostics = createFailoverDiagnostics("/tmp/failover.jsonl", vi.fn().mockRejectedValue(new Error("disk full")));

    await expect(diagnostics.record({ event: "http-429", provider: "zai" })).resolves.toBeUndefined();
  });
});
