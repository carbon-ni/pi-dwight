import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readProviderModelOverrides } from "./model-overrides.js";

describe("readProviderModelOverrides", () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories) {
      rmSync(directory, { recursive: true, force: true });
    }
    directories.length = 0;
  });

  function configDir(): string {
    const directory = mkdtempSync(join(tmpdir(), "multi-account-models-"));
    directories.push(directory);
    return directory;
  }

  it("reads overrides keyed by multi-account provider type", () => {
    const directory = configDir();
    writeFileSync(join(directory, "models.json"), JSON.stringify({
      providers: {
        openai: {
          modelOverrides: {
            "gpt-5.6-sol": { contextWindow: 580_000 },
          },
        },
      },
    }));

    expect(readProviderModelOverrides("openai", directory)).toEqual({
      "gpt-5.6-sol": { contextWindow: 580_000 },
    });
  });

  it("returns no overrides for missing or malformed config", () => {
    const missingDirectory = configDir();
    const malformedDirectory = configDir();
    writeFileSync(join(malformedDirectory, "models.json"), "not json");

    expect(readProviderModelOverrides("openai", missingDirectory)).toEqual({});
    expect(readProviderModelOverrides("openai", malformedDirectory)).toEqual({});
  });
});
