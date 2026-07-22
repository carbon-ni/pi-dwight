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

  it("returns undefined when the active provider is not a managed account", () => {
    expect(findAccountForProvider([], "openai-codex")).toBeUndefined();
  });
});

describe("formatQuotaStatus", () => {
  it("shows current usage for every quota window", () => {
    expect(
      formatQuotaStatus("personal", {
        success: true,
        windows: [
          { label: "5h", usedPercent: 25, resetsAt: new Date() },
          { label: "7d", usedPercent: 60, resetsAt: new Date() },
        ],
      }),
    ).toBe("personal: 5h 25% · 7d 60%");
  });

  it("does not show a status when quota fetching fails", () => {
    expect(formatQuotaStatus("personal", { success: false, error: "Unauthorized" })).toBeUndefined();
  });
});
