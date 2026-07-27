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

  it("uses fallback models when the built-in provider is unavailable", () => {
    expect(modelsForAccountProvider("anthropic", [], fallback)).toBe(fallback);
  });
});
