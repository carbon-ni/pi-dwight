import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { disableModel, disableProvider, enableProvider, readConfig, setConfigDir } from "./config.js";
import { installVisibilityFilter, type RegistryModel } from "../domain/visibility.js";

function getFilter() {
  const config = readConfig();
  return {
    disabledProviders: config.disabledProviders,
    disabledModelIds: config.disabledModels,
  };
}

describe("visibility registry filter", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "multi-account-registry-test-"));
    setConfigDir(tmpDir);
  });

  afterEach(() => {
    setConfigDir(undefined);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("hides disabled providers from model registry availability", async () => {
    disableProvider("github-copilot");
    const registry = {
      async getAvailable(): Promise<RegistryModel[]> {
        return [
          { provider: "github-copilot", id: "claude-sonnet" },
          { provider: "anthropic", id: "claude-opus" },
        ];
      },
    };

    installVisibilityFilter(registry, getFilter);

    await expect(registry.getAvailable()).resolves.toEqual([
      { provider: "anthropic", id: "claude-opus" },
    ]);
  });

  it("hides disabled provider models from model registry availability", async () => {
    disableModel("openrouter", "anthropic/claude-opus-4.1");
    const registry = {
      getAvailable(): RegistryModel[] {
        return [
          { provider: "openrouter", id: "anthropic/claude-opus-4.1" },
          { provider: "openrouter", id: "anthropic/claude-sonnet-4.5" },
        ];
      },
    };

    installVisibilityFilter(registry, getFilter);

    expect(registry.getAvailable()).toEqual([
      { provider: "openrouter", id: "anthropic/claude-sonnet-4.5" },
    ]);
  });

  it("reflects enable changes without reinstalling filter", async () => {
    disableProvider("github-copilot");
    const registry = {
      async getAvailable(): Promise<RegistryModel[]> {
        return [{ provider: "github-copilot", id: "claude-sonnet" }];
      },
    };

    installVisibilityFilter(registry, getFilter);
    await expect(registry.getAvailable()).resolves.toEqual([]);

    enableProvider("github-copilot");
    await expect(registry.getAvailable()).resolves.toEqual([
      { provider: "github-copilot", id: "claude-sonnet" },
    ]);
  });
});
