import { describe, it, expect, vi } from "vitest";
import { applyProjectDefaultModel, type ModelSelector } from "./project-default-model.js";

describe("project default model", () => {
  it("sets the first configured model that exists and has credentials", async () => {
    const first = { provider: "openrouter", id: "missing-key" };
    const second = { provider: "anthropic", id: "claude" };
    const registry = {
      find: vi.fn((provider: string, model: string) => {
        if (provider === "openrouter" && model === "missing-key") return first;
        if (provider === "anthropic" && model === "claude") return second;
        return undefined;
      }),
    };
    const selector: ModelSelector = { setModel: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true) };

    const applied = await applyProjectDefaultModel(selector, registry, [
      { provider: "openrouter", model: "missing-key" },
      { provider: "anthropic", model: "claude" },
    ]);

    expect(applied).toEqual({ provider: "anthropic", model: "claude" });
    expect(selector.setModel).toHaveBeenCalledWith(first);
    expect(selector.setModel).toHaveBeenCalledWith(second);
  });

  it("returns undefined when no configured model can be selected", async () => {
    const registry = { find: vi.fn().mockReturnValue(undefined) };
    const selector: ModelSelector = { setModel: vi.fn() };

    await expect(applyProjectDefaultModel(selector, registry, [
      { provider: "openrouter", model: "missing" },
    ])).resolves.toBeUndefined();
    expect(selector.setModel).not.toHaveBeenCalled();
  });
});
