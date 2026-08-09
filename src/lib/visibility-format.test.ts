import { describe, it, expect } from "vitest";
import { formatVisibilityRules } from "./visibility-format.js";

describe("visibility format", () => {
  it("shows no disabled providers or models", () => {
    expect(formatVisibilityRules({ disabledProviders: [], disabledModels: [] }))
      .toBe("No disabled providers or models.");
  });

  it("shows disabled providers and models", () => {
    expect(formatVisibilityRules({
      disabledProviders: ["openrouter"],
      disabledModels: [{ provider: "anthropic", model: "claude-opus-4-1" }],
    })).toBe([
      "Disabled providers:",
      "  - openrouter",
      "Disabled models:",
      "  - anthropic / claude-opus-4-1",
    ].join("\n"));
  });
});
