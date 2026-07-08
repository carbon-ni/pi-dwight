import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readProjectDefaults } from "./project-config.js";

describe("project config", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "dwight-project-config-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns no defaults when project is not trusted", () => {
    mkdirSync(join(tmpDir, ".pi"));
    writeFileSync(
      join(tmpDir, ".pi", "dwight.json"),
      JSON.stringify({ defaultModels: [{ provider: "openrouter", model: "anthropic/claude-sonnet" }] }),
    );

    expect(readProjectDefaults(tmpDir, false)).toEqual({ defaultModels: [] });
  });

  it("reads default model candidates from .pi/dwight.json", () => {
    mkdirSync(join(tmpDir, ".pi"));
    writeFileSync(
      join(tmpDir, ".pi", "dwight.json"),
      JSON.stringify({ defaultModels: [{ provider: "openrouter", model: "anthropic/claude-sonnet" }] }),
    );

    expect(readProjectDefaults(tmpDir, true)).toEqual({
      defaultModels: [{ provider: "openrouter", model: "anthropic/claude-sonnet" }],
    });
  });

  it("supports single defaultModel shape", () => {
    mkdirSync(join(tmpDir, ".pi"));
    writeFileSync(
      join(tmpDir, ".pi", "dwight.json"),
      JSON.stringify({ defaultModel: { provider: "openai-personal", model: "gpt-5.5" } }),
    );

    expect(readProjectDefaults(tmpDir, true)).toEqual({
      defaultModels: [{ provider: "openai-personal", model: "gpt-5.5" }],
    });
  });

  it("ignores malformed entries", () => {
    mkdirSync(join(tmpDir, ".pi"));
    writeFileSync(
      join(tmpDir, ".pi", "dwight.json"),
      JSON.stringify({ defaultModels: [{ provider: "openrouter" }, null, { provider: "anthropic", model: "claude" }] }),
    );

    expect(readProjectDefaults(tmpDir, true)).toEqual({
      defaultModels: [{ provider: "anthropic", model: "claude" }],
    });
  });
});
