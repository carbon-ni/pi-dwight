import { describe, expect, it } from "vitest";
import { pickSwitchTarget } from "./account-switch-ui.js";

describe("pickSwitchTarget", () => {
  const targets = [
    { provider: "openai-personal", model: "gpt-4o", sameModel: true, sameProviderType: true },
    { provider: "openrouter", model: "gpt-4o", sameModel: true, sameProviderType: false },
    { provider: "zai", model: "zai-flash", sameModel: false, sameProviderType: false },
  ];

  it("returns the target whose label was selected", async () => {
    const ui = {
      async select(_title: string, options: string[]) {
        expect(options).toHaveLength(3);
        expect(options[0]).toContain("same account type, same model");
        return options[0];
      },
    };

    const target = await pickSwitchTarget(ui, targets);
    expect(target?.provider).toBe("openai-personal");
  });

  it("returns undefined when the picker is cancelled", async () => {
    const ui = { async select() { return undefined; } };

    expect(await pickSwitchTarget(ui, targets)).toBeUndefined();
  });
});
