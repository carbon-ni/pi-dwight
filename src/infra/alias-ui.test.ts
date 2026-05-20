import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setConfigDir } from "./config.js";
import { listAliases } from "./alias.js";
import {
  addAliasWithPicker,
  type AliasPickerUi,
  type PickerModel,
} from "./alias-ui.js";

describe("alias ui", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "multi-account-alias-ui-test-"));
    setConfigDir(tmpDir);
  });

  afterEach(() => {
    setConfigDir(undefined);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("adds alias via picker flow", async () => {
    const selectChoices = ["openrouter", "anthropic/claude-opus-4.1"];
    const ui: AliasPickerUi = {
      async select(_title: string, _options: string[]) {
        return selectChoices.shift();
      },
      async input(_title: string, _placeholder?: string) {
        if (_placeholder?.includes("filter")) return undefined; // skip search filter
        return "my-fav";
      },
      notify() {},
    };
    const models: PickerModel[] = [
      { provider: "openrouter", id: "anthropic/claude-opus-4.1" },
      { provider: "openrouter", id: "anthropic/claude-sonnet-4.5" },
      { provider: "anthropic", id: "claude-opus-4-1" },
    ];

    const result = await addAliasWithPicker(ui, models);

    expect(result).toEqual({ name: "my-fav", provider: "openrouter", model: "anthropic/claude-opus-4.1" });
    expect(listAliases()).toEqual([
      { name: "my-fav", provider: "openrouter", model: "anthropic/claude-opus-4.1" },
    ]);
  });

  it("returns undefined when picker is cancelled at provider", async () => {
    const ui: AliasPickerUi = {
      async select() {
        return undefined;
      },
      async input() {
        return undefined;
      },
      notify() {},
    };

    const result = await addAliasWithPicker(ui, [
      { provider: "openrouter", id: "model-a" },
    ]);

    expect(result).toBeUndefined();
    expect(listAliases()).toEqual([]);
  });

  it("returns undefined when picker is cancelled at model", async () => {
    const choices = ["openrouter"];
    const ui: AliasPickerUi = {
      async select() {
        return choices.shift();
      },
      async input() {
        return undefined;
      },
      notify() {},
    };

    const result = await addAliasWithPicker(ui, [
      { provider: "openrouter", id: "model-a" },
    ]);

    expect(result).toBeUndefined();
    expect(listAliases()).toEqual([]);
  });

  it("returns undefined when picker is cancelled at alias name", async () => {
    const choices = ["openrouter", "model-a"];
    const ui: AliasPickerUi = {
      async select() {
        return choices.shift();
      },
      async input() {
        return undefined;
      },
      notify() {},
    };

    const result = await addAliasWithPicker(ui, [
      { provider: "openrouter", id: "model-a" },
    ]);

    expect(result).toBeUndefined();
    expect(listAliases()).toEqual([]);
  });

  it("rejects duplicate alias name", async () => {
    const selectChoices = ["openrouter", "model-a"];
    const notified: string[] = [];
    const ui: AliasPickerUi = {
      async select() {
        return selectChoices.shift();
      },
      async input(_title: string, _placeholder?: string) {
        if (_placeholder?.includes("filter")) return undefined;
        return "my-fav";
      },
      notify(message: string, _level?: string) {
        notified.push(message);
      },
    };

    // Pre-add the alias
    const { addAlias } = await import("./alias.js");
    addAlias({ name: "my-fav", provider: "openrouter", model: "model-a" });

    const result = await addAliasWithPicker(ui, [
      { provider: "openrouter", id: "model-a" },
    ]);

    expect(result).toBeUndefined();
  });

  it("shows nothing when no models available", async () => {
    let notified = false;
    const ui: AliasPickerUi = {
      async select() {
        return undefined;
      },
      async input() {
        return undefined;
      },
      notify() {
        notified = true;
      },
    };

    const result = await addAliasWithPicker(ui, []);

    expect(result).toBeUndefined();
    expect(notified).toBe(true);
  });

  it("filters models by search text", async () => {
    const selectedOptions: string[][] = [];
    const selectChoices = ["openrouter", "anthropic/claude-opus-4.1"];
    const ui: AliasPickerUi = {
      async select(_title: string, options: string[]) {
        selectedOptions.push(options);
        return selectChoices.shift();
      },
      async input(_title: string, _placeholder?: string) {
        if (_placeholder?.includes("filter")) return "opus";
        return "my-fav";
      },
      notify() {},
    };
    const models: PickerModel[] = [
      { provider: "openrouter", id: "anthropic/claude-opus-4.1" },
      { provider: "openrouter", id: "anthropic/claude-sonnet-4.5" },
      { provider: "openrouter", id: "openai/gpt-5.5" },
    ];

    await addAliasWithPicker(ui, models);

    // Second select (model picker) should only show opus match
    expect(selectedOptions[1]).toEqual(["anthropic/claude-opus-4.1"]);
  });
});
