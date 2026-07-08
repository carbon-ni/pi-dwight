import { describe, expect, it } from "vitest";
import { hasExplicitModelArgument } from "./cli.js";

describe("cli", () => {
  it("detects explicit model flags", () => {
    expect(hasExplicitModelArgument(["pi", "--model", "anthropic/claude"])).toBe(true);
    expect(hasExplicitModelArgument(["pi", "--model=anthropic/claude"])).toBe(true);
    expect(hasExplicitModelArgument(["pi", "-m", "anthropic/claude"])).toBe(true);
  });

  it("returns false when pi starts without model arguments", () => {
    expect(hasExplicitModelArgument(["pi"])).toBe(false);
    expect(hasExplicitModelArgument(["pi", "--approve"])).toBe(false);
  });
});
