import { describe, expect, it } from "vitest";
import { buildSwitchTargets, switchTargetLabel } from "./account-switch.js";
import type { Account } from "./accounts.js";

const accounts: Account[] = [
  { provider: "openai", id: "personal", key: "" },
  { provider: "openai", id: "work", key: "" },
  { provider: "openrouter", id: "main", key: "$KEY" },
  { provider: "zai", id: "default", key: "$ZAI" },
];

describe("buildSwitchTargets", () => {
  it("ranks same provider type with the same model first", () => {
    const targets = buildSwitchTargets(
      { provider: "openai-work", id: "gpt-4o" },
      [
        { provider: "openai-personal", id: "gpt-4o" },
        { provider: "openai-personal", id: "gpt-5.5" },
        { provider: "openai-work", id: "gpt-4o" },
      ],
      accounts,
    );

    expect(targets[0]).toEqual({
      provider: "openai-personal",
      model: "gpt-4o",
      sameModel: true,
      sameProviderType: true,
    });
  });

  it("keeps the same model on another provider type as second choice", () => {
    const targets = buildSwitchTargets(
      { provider: "openai-personal", id: "gpt-4o" },
      [
        { provider: "openai-work", id: "gpt-4o" },
        { provider: "openrouter", id: "gpt-4o" },
      ],
      accounts,
    );

    expect(targets).toEqual([
      { provider: "openai-work", model: "gpt-4o", sameModel: true, sameProviderType: true },
      { provider: "openrouter", model: "gpt-4o", sameModel: true, sameProviderType: false },
    ]);
  });

  it("falls back to the provider's first available model and flags the change", () => {
    const targets = buildSwitchTargets(
      { provider: "openai-personal", id: "gpt-4o" },
      [
        { provider: "openrouter", id: "gpt-4o" },
        { provider: "zai", id: "zai-flash" },
      ],
      accounts,
    );

    expect(targets).toEqual([
      { provider: "openrouter", model: "gpt-4o", sameModel: true, sameProviderType: false },
      { provider: "zai", model: "zai-flash", sameModel: false, sameProviderType: false },
    ]);
  });

  it("never lists the current provider", () => {
    const targets = buildSwitchTargets(
      { provider: "openai-work", id: "gpt-4o" },
      [
        { provider: "openai-work", id: "gpt-4o" },
        { provider: "openai-work", id: "gpt-5.5" },
      ],
      accounts,
    );

    expect(targets).toEqual([]);
  });

  it("deduplicates repeated model ids per provider", () => {
    const targets = buildSwitchTargets(
      { provider: "openai-work", id: "gpt-4o" },
      [
        { provider: "openai-personal", id: "gpt-4o" },
        { provider: "openai-personal", id: "gpt-4o" },
        { provider: "openai-personal", id: "gpt-4o" },
      ],
      accounts,
    );

    expect(targets).toHaveLength(1);
  });

  it("returns empty when there are no other providers", () => {
    const targets = buildSwitchTargets(
      { provider: "openai-work", id: "gpt-4o" },
      [{ provider: "openai-work", id: "gpt-4o" }],
      accounts,
    );

    expect(targets).toEqual([]);
  });

  it("treats a default account as its bare provider name", () => {
    const targets = buildSwitchTargets(
      { provider: "openai-work", id: "gpt-4o" },
      [{ provider: "zai", id: "zai-flash" }],
      accounts,
    );

    expect(targets[0].provider).toBe("zai");
    expect(targets[0].sameModel).toBe(false);
  });

  it("recognizes the same provider type when current provider is not a registered account", () => {
    const targets = buildSwitchTargets(
      { provider: "openai", id: "gpt-4o" },
      [{ provider: "openai-personal", id: "gpt-4o" }],
      accounts,
    );

    expect(targets[0].sameProviderType).toBe(true);
  });

  it("sorts same-model candidates by provider name within a rank", () => {
    const targets = buildSwitchTargets(
      { provider: "openai-work", id: "gpt-4o" },
      [
        { provider: "zai", id: "gpt-4o" },
        { provider: "openrouter", id: "gpt-4o" },
      ],
      accounts,
    );

    expect(targets.map((t) => t.provider)).toEqual(["openrouter", "zai"]);
  });
});

describe("switchTargetLabel", () => {
  it("labels a same-account-type same-model target", () => {
    expect(
      switchTargetLabel({ provider: "openai-personal", model: "gpt-4o", sameModel: true, sameProviderType: true }),
    ).toBe("openai-personal · gpt-4o (same account type, same model)");
  });

  it("labels a same-model target across provider types", () => {
    expect(
      switchTargetLabel({ provider: "openrouter", model: "gpt-4o", sameModel: true, sameProviderType: false }),
    ).toBe("openrouter · gpt-4o (same model)");
  });

  it("labels a target whose model will change", () => {
    expect(
      switchTargetLabel({ provider: "zai", model: "zai-flash", sameModel: false, sameProviderType: false }),
    ).toBe("zai · zai-flash (model changes to zai-flash)");
  });
});
