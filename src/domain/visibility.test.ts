import { describe, it, expect } from "vitest";
import {
  applyVisibilityRules,
  clearVisibilityBaseline,
  filterVisibleModels,
  type RegistryModel,
  type VisibilityFilter,
} from "./visibility.js";

const noFilter: VisibilityFilter = { disabledProviders: [], disabledModelIds: [] };

describe("filterVisibleModels", () => {
  it("returns all models when nothing is disabled", () => {
    const models = [
      { id: "claude-opus-4-1", provider: "openrouter" },
      { id: "claude-sonnet-4-5", provider: "openrouter" },
    ];
    expect(filterVisibleModels("openrouter", models, noFilter)).toEqual(models);
  });

  it("returns empty when provider is disabled", () => {
    const models = [{ id: "claude-opus" }, { id: "claude-sonnet" }];
    const filter: VisibilityFilter = {
      disabledProviders: ["openrouter"],
      disabledModelIds: [],
    };
    expect(filterVisibleModels("openrouter", models, filter)).toEqual([]);
  });

  it("filters out disabled models within enabled provider", () => {
    const models = [{ id: "claude-opus" }, { id: "claude-sonnet" }];
    const filter: VisibilityFilter = {
      disabledProviders: [],
      disabledModelIds: [{ provider: "openrouter", model: "claude-opus" }],
    };
    expect(filterVisibleModels("openrouter", models, filter)).toEqual([{ id: "claude-sonnet" }]);
  });

  it("does not affect disabled models from other providers", () => {
    const models = [{ id: "claude-opus" }];
    const filter: VisibilityFilter = {
      disabledProviders: [],
      disabledModelIds: [{ provider: "anthropic", model: "claude-opus" }],
    };
    expect(filterVisibleModels("openrouter", models, filter)).toEqual([{ id: "claude-opus" }]);
  });

  it("returns empty when provider is disabled even for empty model list", () => {
    const filter: VisibilityFilter = {
      disabledProviders: ["openrouter"],
      disabledModelIds: [],
    };
    expect(filterVisibleModels("openrouter", [], filter)).toEqual([]);
  });
});

describe("applyVisibilityRules", () => {
  const sampleModels: RegistryModel[] = [
    { provider: "openrouter", id: "anthropic/claude-opus-4.1" },
    { provider: "openrouter", id: "anthropic/claude-sonnet-4.5" },
    { provider: "anthropic", id: "claude-opus-4-1" },
  ];

  function makeRegistry(models = sampleModels): { getAvailable(): Promise<RegistryModel[]> } {
    return { async getAvailable() { return models; } };
  }

  function makePi(): { registrations: Array<{ provider: string; models: RegistryModel[] }>; registerProvider(p: string, c: { models?: RegistryModel[] }): void } {
    const registrations: Array<{ provider: string; models: RegistryModel[] }> = [];
    return {
      registrations,
      registerProvider(provider: string, config: { models?: RegistryModel[] }) {
        registrations.push({ provider, models: config.models ?? [] });
      },
    };
  }

  it("registers all providers with all models when nothing is disabled", async () => {
    clearVisibilityBaseline();
    const pi = makePi();
    const getFilter = () => noFilter;

    await applyVisibilityRules(pi, makeRegistry(), getFilter);

    expect(pi.registrations).toEqual([
      { provider: "openrouter", models: sampleModels.filter((m) => m.provider === "openrouter") },
      { provider: "anthropic", models: sampleModels.filter((m) => m.provider === "anthropic") },
    ]);
  });

  it("registers only visible models when some are disabled", async () => {
    clearVisibilityBaseline();
    const pi = makePi();
    const getFilter = (): VisibilityFilter => ({
      disabledProviders: [],
      disabledModelIds: [{ provider: "openrouter", model: "anthropic/claude-opus-4.1" }],
    });

    await applyVisibilityRules(pi, makeRegistry(), getFilter);

    expect(pi.registrations).toEqual([
      { provider: "openrouter", models: [{ provider: "openrouter", id: "anthropic/claude-sonnet-4.5" }] },
      { provider: "anthropic", models: [{ provider: "anthropic", id: "claude-opus-4-1" }] },
    ]);
  });

  it("registers disabled providers with empty model list", async () => {
    clearVisibilityBaseline();
    const pi = makePi();
    const getFilter = (): VisibilityFilter => ({
      disabledProviders: ["openrouter"],
      disabledModelIds: [],
    });

    await applyVisibilityRules(pi, makeRegistry(), getFilter);

    expect(pi.registrations).toEqual([
      { provider: "openrouter", models: [] },
      { provider: "anthropic", models: [{ provider: "anthropic", id: "claude-opus-4-1" }] },
    ]);
  });

  it("does not throw when a provider cannot be overridden", async () => {
    clearVisibilityBaseline();
    const pi = {
      registerProvider(provider: string, _config: { models?: RegistryModel[] }) {
        if (provider === "github-copilot") {
          throw new Error('Provider github-copilot: "baseUrl" is required when defining models.');
        }
      },
    };
    const getFilter = (): VisibilityFilter => ({
      disabledProviders: ["github-copilot"],
      disabledModelIds: [],
    });

    await expect(
      applyVisibilityRules(pi, makeRegistry([{ provider: "github-copilot", id: "claude-sonnet" }]), getFilter),
    ).resolves.toBeUndefined();
  });

  it("restores a provider from cached baseline after re-enabling", async () => {
    clearVisibilityBaseline();
    const pi = makePi();

    // First pass: disable openrouter, capture baseline
    const disabledFilter = (): VisibilityFilter => ({
      disabledProviders: ["openrouter"],
      disabledModelIds: [],
    });
    await applyVisibilityRules(pi, makeRegistry(), disabledFilter);

    // Second pass: enable openrouter with models that don't include it
    // Baseline should restore from the first pass
    const enabledFilter = (): VisibilityFilter => ({
      disabledProviders: [],
      disabledModelIds: [],
    });
    const filteredRegistry = makeRegistry([
      { provider: "anthropic", id: "claude-opus-4-1" },
    ]);
    await applyVisibilityRules(pi, filteredRegistry, enabledFilter);

    expect(pi.registrations.at(-1)).toEqual({
      provider: "openrouter",
      models: [
        { provider: "openrouter", id: "anthropic/claude-opus-4.1" },
        { provider: "openrouter", id: "anthropic/claude-sonnet-4.5" },
      ],
    });
  });
});
