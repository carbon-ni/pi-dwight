import { describe, expect, it } from "vitest";
import { modelsForAccountProvider } from "./inherited-models.js";

describe("modelsForAccountProvider", () => {
  const fallback = [{ id: "stale-model", name: "Stale" }];

  it("inherits current models from the configured built-in provider", () => {
    const models = [
      { provider: "openai-codex", id: "gpt-5.6-sol", name: "GPT-5.6 Sol" },
      { provider: "openrouter", id: "openai/gpt-5.6-sol", name: "GPT-5.6 Sol" },
    ];

    expect(modelsForAccountProvider("openai-codex", models, fallback)).toEqual([
      { id: "gpt-5.6-sol", name: "GPT-5.6 Sol" },
    ]);
  });

  it("applies account provider model overrides to inherited models", () => {
    const models = [{
      provider: "openai-codex",
      id: "gpt-5.6-sol",
      contextWindow: 272_000,
      maxTokens: 128_000,
      cost: { input: 5, output: 30 },
    }];

    expect(modelsForAccountProvider("openai-codex", models, fallback, {
      "gpt-5.6-sol": { contextWindow: 580_000, cost: { input: 6 } },
    })).toEqual([{
      id: "gpt-5.6-sol",
      contextWindow: 580_000,
      maxTokens: 128_000,
      cost: { input: 6, output: 30 },
    }]);
  });

  it("ignores overrides for models outside inherited catalog", () => {
    expect(modelsForAccountProvider("anthropic", [], fallback, {
      "unknown-model": { contextWindow: 1 },
    })).toBe(fallback);
  });

  it("uses fallback models when the built-in provider is unavailable", () => {
    expect(modelsForAccountProvider("anthropic", [], fallback)).toBe(fallback);
  });
});
