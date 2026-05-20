import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { disableModel, disableProvider, setConfigDir } from "../config.js";
import { formatVisibilityRules } from "../visibility-format.js";

describe("visibility format", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "multi-account-visibility-format-test-"));
    setConfigDir(tmpDir);
  });

  afterEach(() => {
    setConfigDir(undefined);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("shows no disabled providers or models", () => {
    expect(formatVisibilityRules()).toBe("No disabled providers or models.");
  });

  it("shows disabled providers and models", () => {
    disableProvider("openrouter");
    disableModel("anthropic", "claude-opus-4-1");

    expect(formatVisibilityRules()).toBe([
      "Disabled providers:",
      "  - openrouter",
      "Disabled models:",
      "  - anthropic / claude-opus-4-1",
    ].join("\n"));
  });
});
