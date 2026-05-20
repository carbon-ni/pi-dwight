import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { disableModel, disableProvider, enableProvider, setConfigDir } from "../config.js";
import { applyVisibilityRules, clearVisibilityBaseline, type RegistryModel } from "../visibility.js";

describe("visibility", () => {
  let tmpDir: string;

  beforeEach(() => {
    clearVisibilityBaseline();
    tmpDir = mkdtempSync(join(tmpdir(), "multi-account-visibility-test-"));
    setConfigDir(tmpDir);
  });

  afterEach(() => {
    setConfigDir(undefined);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("overrides providers with visible models only", async () => {
    disableModel("openrouter", "anthropic/claude-opus-4.1");

    const registrations: Array<{ provider: string; models: RegistryModel[] }> = [];
    const pi = {
      registerProvider(provider: string, config: { models?: RegistryModel[] }) {
        registrations.push({ provider, models: config.models ?? [] });
      },
    };
    const modelRegistry = {
      async getAvailable() {
        return [
          { provider: "openrouter", id: "anthropic/claude-opus-4.1" },
          { provider: "openrouter", id: "anthropic/claude-sonnet-4.5" },
          { provider: "anthropic", id: "claude-opus-4-1" },
        ];
      },
    };

    await applyVisibilityRules(pi, modelRegistry);

    expect(registrations).toEqual([
      {
        provider: "openrouter",
        models: [{ provider: "openrouter", id: "anthropic/claude-sonnet-4.5" }],
      },
      {
        provider: "anthropic",
        models: [{ provider: "anthropic", id: "claude-opus-4-1" }],
      },
    ]);
  });

  it("overrides disabled providers with an empty model list", async () => {
    disableProvider("openrouter");

    const registrations: Array<{ provider: string; models: RegistryModel[] }> = [];
    const pi = {
      registerProvider(provider: string, config: { models?: RegistryModel[] }) {
        registrations.push({ provider, models: config.models ?? [] });
      },
    };
    const modelRegistry = {
      async getAvailable() {
        return [
          { provider: "openrouter", id: "anthropic/claude-opus-4.1" },
          { provider: "anthropic", id: "claude-opus-4-1" },
        ];
      },
    };

    await applyVisibilityRules(pi, modelRegistry);

    expect(registrations).toEqual([
      { provider: "openrouter", models: [] },
      { provider: "anthropic", models: [{ provider: "anthropic", id: "claude-opus-4-1" }] },
    ]);
  });

  it("does not throw when a provider cannot be overridden", async () => {
    disableProvider("github-copilot");
    const pi = {
      registerProvider(provider: string, _config: { models?: RegistryModel[] }) {
        if (provider === "github-copilot") {
          throw new Error('Provider github-copilot: "baseUrl" is required when defining models.');
        }
      },
    };
    const modelRegistry = {
      async getAvailable() {
        return [{ provider: "github-copilot", id: "claude-sonnet" }];
      },
    };

    await expect(applyVisibilityRules(pi, modelRegistry)).resolves.toBeUndefined();
  });

  it("restores a provider from cached baseline models after enabling", async () => {
    disableProvider("openrouter");

    const registrations: Array<{ provider: string; models: RegistryModel[] }> = [];
    const pi = {
      registerProvider(provider: string, config: { models?: RegistryModel[] }) {
        registrations.push({ provider, models: config.models ?? [] });
      },
    };
    const baselineRegistry = {
      async getAvailable() {
        return [
          { provider: "openrouter", id: "anthropic/claude-opus-4.1" },
          { provider: "anthropic", id: "claude-opus-4-1" },
        ];
      },
    };

    await applyVisibilityRules(pi, baselineRegistry);
    enableProvider("openrouter");

    const filteredRegistry = {
      async getAvailable() {
        return [{ provider: "anthropic", id: "claude-opus-4-1" }];
      },
    };
    await applyVisibilityRules(pi, filteredRegistry);

    expect(registrations.at(-1)).toEqual({
      provider: "openrouter",
      models: [{ provider: "openrouter", id: "anthropic/claude-opus-4.1" }],
    });
  });
});
