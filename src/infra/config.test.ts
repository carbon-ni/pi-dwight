import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Account } from "../domain/accounts.js";
import {
  addAccount,
  findAccount,
  listAccounts,
  setAccountQuotaAccountId,
  removeAccount,
  setConfigDir,
  getConfigPath,
} from "./config.js";

describe("config", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "multi-account-test-"));
    setConfigDir(tmpDir);
  });

  afterEach(() => {
    setConfigDir(undefined);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("getConfigPath", () => {
    it("returns path inside the configured directory", () => {
      expect(getConfigPath()).toBe(join(tmpDir, "multi-account.json"));
    });
  });

  describe("empty config", () => {
    it("returns empty list when no config file exists", () => {
      expect(listAccounts()).toEqual([]);
    });

    it("findAccount returns undefined", () => {
      expect(findAccount("openai", "nonexistent")).toBeUndefined();
    });

    it("removeAccount returns false", () => {
      expect(removeAccount("openai", "nonexistent")).toBe(false);
    });
  });

  describe("addAccount", () => {
    it("adds a new account", () => {
      const account: Account = {
        id: "personal",
        provider: "openai",
        key: "sk-test123",
      };
      addAccount(account);
      expect(listAccounts()).toEqual([account]);
    });

    it("updates existing account with same provider+id", () => {
      addAccount({ id: "personal", provider: "openai", key: "sk-old" });
      addAccount({ id: "personal", provider: "openai", key: "sk-new" });
      const accounts = listAccounts();
      expect(accounts).toHaveLength(1);
      expect(accounts[0].key).toBe("sk-new");
    });

    it("allows same id on different providers", () => {
      addAccount({ id: "work", provider: "openai", key: "sk-oai" });
      addAccount({ id: "work", provider: "anthropic", key: "sk-ant" });
      expect(listAccounts()).toHaveLength(2);
    });
  });

  describe("quota account ID", () => {
    it("persists the OpenAI account ID discovered during login", () => {
      addAccount({ id: "personal", provider: "openai", key: "" });

      expect(setAccountQuotaAccountId("openai", "personal", "acct_123")).toBe(true);
      expect(findAccount("openai", "personal")).toMatchObject({ accountId: "acct_123" });
    });

    it("does not create an account while saving an account ID", () => {
      expect(setAccountQuotaAccountId("openai", "missing", "acct_123")).toBe(false);
    });
  });

  describe("removeAccount", () => {
    it("removes an existing account and returns true", () => {
      addAccount({ id: "personal", provider: "openai", key: "sk-test" });
      expect(removeAccount("openai", "personal")).toBe(true);
      expect(listAccounts()).toEqual([]);
    });

    it("returns false for nonexistent account", () => {
      expect(removeAccount("openai", "nope")).toBe(false);
    });

    it("does not remove account with different provider", () => {
      addAccount({ id: "x", provider: "openai", key: "sk-oai" });
      addAccount({ id: "x", provider: "anthropic", key: "sk-ant" });
      removeAccount("openai", "x");
      expect(listAccounts()).toHaveLength(1);
      expect(listAccounts()[0].provider).toBe("anthropic");
    });
  });

  describe("findAccount", () => {
    it("finds existing account", () => {
      const account: Account = {
        id: "personal",
        provider: "openai",
        key: "sk-test",
      };
      addAccount(account);
      expect(findAccount("openai", "personal")).toEqual(account);
    });

    it("returns undefined for nonexistent account", () => {
      expect(findAccount("openai", "nope")).toBeUndefined();
    });
  });

  describe("provider visibility", () => {
    it("disables and enables a provider globally", async () => {
      const config = await import("./config.js");

      expect(config.disableProvider("openrouter")).toBe(true);
      expect(config.isProviderDisabled("openrouter")).toBe(true);
      expect(config.readConfig().disabledProviders).toEqual(["openrouter"]);

      expect(config.enableProvider("openrouter")).toBe(true);
      expect(config.isProviderDisabled("openrouter")).toBe(false);
      expect(config.readConfig().disabledProviders).toEqual([]);
    });

    it("is idempotent when disabling or enabling providers", async () => {
      const config = await import("./config.js");

      expect(config.disableProvider("openrouter")).toBe(true);
      expect(config.disableProvider("openrouter")).toBe(false);
      expect(config.readConfig().disabledProviders).toEqual(["openrouter"]);

      expect(config.enableProvider("anthropic")).toBe(false);
    });
  });

  describe("model visibility", () => {
    it("disables and enables a provider model globally", async () => {
      const config = await import("./config.js");

      expect(config.disableModel("openrouter", "anthropic/claude-opus-4.1")).toBe(true);
      expect(config.isModelDisabled("openrouter", "anthropic/claude-opus-4.1")).toBe(true);
      expect(config.readConfig().disabledModels).toEqual([
        { provider: "openrouter", model: "anthropic/claude-opus-4.1" },
      ]);

      expect(config.enableModel("openrouter", "anthropic/claude-opus-4.1")).toBe(true);
      expect(config.isModelDisabled("openrouter", "anthropic/claude-opus-4.1")).toBe(false);
      expect(config.readConfig().disabledModels).toEqual([]);
    });

    it("keeps same model id independent per provider", async () => {
      const config = await import("./config.js");

      config.disableModel("openrouter", "claude-opus");

      expect(config.isModelDisabled("openrouter", "claude-opus")).toBe(true);
      expect(config.isModelDisabled("anthropic", "claude-opus")).toBe(false);
    });

    it("filters hidden providers and models", async () => {
      const config = await import("./config.js");
      const models = [{ id: "claude-opus" }, { id: "claude-sonnet" }];

      config.disableModel("openrouter", "claude-opus");
      expect(config.filterVisibleModels("openrouter", models)).toEqual([{ id: "claude-sonnet" }]);

      config.disableProvider("openrouter");
      expect(config.filterVisibleModels("openrouter", models)).toEqual([]);
    });
  });
});
