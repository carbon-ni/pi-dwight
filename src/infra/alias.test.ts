import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  addAlias,
  removeAlias,
  findAlias,
  listAliases,
} from "./alias.js";
import { setConfigDir } from "./config.js";
import type { Alias } from "./config.js";

describe("alias", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "multi-account-alias-test-"));
    setConfigDir(tmpDir);
  });

  afterEach(() => {
    setConfigDir(undefined);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("empty config", () => {
    it("returns empty list when no aliases", () => {
      expect(listAliases()).toEqual([]);
    });

    it("findAlias returns undefined", () => {
      expect(findAlias("my-fav")).toBeUndefined();
    });

    it("removeAlias returns false", () => {
      expect(removeAlias("my-fav")).toBe(false);
    });
  });

  describe("addAlias", () => {
    it("adds a new alias", () => {
      const alias: Alias = { name: "my-fav", provider: "openai-personal", model: "gpt-5.5" };
      addAlias(alias);
      expect(listAliases()).toEqual([alias]);
    });

    it("updates existing alias with same name", () => {
      addAlias({ name: "my-fav", provider: "openai-personal", model: "gpt-5.5" });
      addAlias({ name: "my-fav", provider: "openai-work", model: "gpt-5.4" });
      const aliases = listAliases();
      expect(aliases).toHaveLength(1);
      expect(aliases[0]).toEqual({ name: "my-fav", provider: "openai-work", model: "gpt-5.4" });
    });

    it("allows multiple aliases", () => {
      addAlias({ name: "my-fav", provider: "openai-personal", model: "gpt-5.5" });
      addAlias({ name: "fast", provider: "openai-work", model: "gpt-5.4" });
      expect(listAliases()).toHaveLength(2);
    });
  });

  describe("removeAlias", () => {
    it("removes an existing alias and returns true", () => {
      addAlias({ name: "my-fav", provider: "openai-personal", model: "gpt-5.5" });
      expect(removeAlias("my-fav")).toBe(true);
      expect(listAliases()).toEqual([]);
    });

    it("returns false for nonexistent alias", () => {
      expect(removeAlias("nope")).toBe(false);
    });
  });

  describe("findAlias", () => {
    it("finds existing alias", () => {
      const alias: Alias = { name: "my-fav", provider: "openai-personal", model: "gpt-5.5" };
      addAlias(alias);
      expect(findAlias("my-fav")).toEqual(alias);
    });

    it("returns undefined for nonexistent alias", () => {
      expect(findAlias("nope")).toBeUndefined();
    });
  });
});
