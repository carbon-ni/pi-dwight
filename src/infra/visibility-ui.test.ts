import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { disableModel, disableProvider, readConfig, setConfigDir } from "./config.js";
import {
  disableModelWithPicker,
  disableProviderWithPicker,
  enableModelWithPicker,
  enableProviderWithPicker,
  type PickerModel,
} from "./visibility-ui.js";

describe("visibility ui", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "multi-account-visibility-ui-test-"));
    setConfigDir(tmpDir);
  });

  afterEach(() => {
    setConfigDir(undefined);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("disables provider chosen from UI", async () => {
    const selected: string[] = [];
    const ui = {
      async select(_title: string, options: string[]) {
        selected.push(...options);
        return "openrouter";
      },
      notify(message: string, level?: string) {
        selected.push(`${level}:${message}`);
      },
    };

    await disableProviderWithPicker(ui, [
      { provider: "openrouter", id: "model-a" },
      { provider: "anthropic", id: "model-b" },
    ]);

    expect(selected).toContain("openrouter");
    expect(selected).toContain("anthropic");
    expect(readConfig().disabledProviders).toEqual(["openrouter"]);
  });

  it("filters model picker by search text before selecting", async () => {
    const choices = ["openrouter", "opus"];
    const ui = {
      async select(_title: string, options: string[]) {
        if (options.includes("openrouter")) return choices.shift();
        expect(options).toEqual(["anthropic/claude-opus-4.1"]);
        return "anthropic/claude-opus-4.1";
      },
      async input() {
        return choices.shift();
      },
      notify(_message: string, _level?: string) {},
    };
    const models: PickerModel[] = [
      { provider: "openrouter", id: "anthropic/claude-opus-4.1" },
      { provider: "openrouter", id: "anthropic/claude-sonnet-4.5" },
    ];

    await disableModelWithPicker(ui, models);

    expect(readConfig().disabledModels).toEqual([
      { provider: "openrouter", model: "anthropic/claude-opus-4.1" },
    ]);
  });

  it("disables model chosen from provider-specific UI", async () => {
    const choices = ["openrouter", "anthropic/claude-opus-4.1"];
    const ui = {
      async select(_title: string, _options: string[]) {
        return choices.shift();
      },
      notify(_message: string, _level?: string) {},
    };
    const models: PickerModel[] = [
      { provider: "openrouter", id: "anthropic/claude-opus-4.1" },
      { provider: "openrouter", id: "anthropic/claude-sonnet-4.5" },
      { provider: "anthropic", id: "claude-opus-4-1" },
    ];

    await disableModelWithPicker(ui, models);

    expect(readConfig().disabledModels).toEqual([
      { provider: "openrouter", model: "anthropic/claude-opus-4.1" },
    ]);
  });

  it("enables provider chosen from disabled providers", async () => {
    disableProvider("openrouter");
    const ui = {
      async select(_title: string, options: string[]) {
        expect(options).toEqual(["openrouter"]);
        return "openrouter";
      },
      notify(_message: string, _level?: string) {},
    };

    await enableProviderWithPicker(ui);

    expect(readConfig().disabledProviders).toEqual([]);
  });

  it("enables model chosen from disabled models", async () => {
    disableModel("openrouter", "anthropic/claude-opus-4.1");
    const ui = {
      async select(_title: string, options: string[]) {
        expect(options).toEqual(["openrouter / anthropic/claude-opus-4.1"]);
        return "openrouter / anthropic/claude-opus-4.1";
      },
      notify(_message: string, _level?: string) {},
    };

    await enableModelWithPicker(ui);

    expect(readConfig().disabledModels).toEqual([]);
  });

  it("does nothing when picker is cancelled", async () => {
    const ui = {
      async select() {
        return undefined;
      },
      notify(_message: string, _level?: string) {},
    };

    await disableProviderWithPicker(ui, [{ provider: "openrouter", id: "model-a" }]);

    expect(readConfig().disabledProviders).toEqual([]);
  });
});
