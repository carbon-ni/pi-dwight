import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const libDirectory = new URL("./lib/", import.meta.url);

describe("module boundaries", () => {
  it("keeps display helpers independent from infrastructure", () => {
    const infrastructureImports = readdirSync(libDirectory)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .flatMap((file) => {
        const source = readFileSync(new URL(file, libDirectory), "utf8");
        return source.includes("../infra/") ? [file] : [];
      });

    expect(infrastructureImports).toEqual([]);
  });
});
