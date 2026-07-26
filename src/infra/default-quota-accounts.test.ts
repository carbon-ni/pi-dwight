import { describe, expect, it, vi } from "vitest";
import { listDefaultQuotaAccounts } from "./default-quota-accounts.js";

describe("listDefaultQuotaAccounts", () => {
  it("returns default accounts for API-key providers with available credentials", async () => {
    const credentials = {
      getApiKey: vi.fn(async (provider: string) => provider === "deepseek" ? "deepseek-key" : undefined),
    };

    await expect(listDefaultQuotaAccounts(credentials, ["deepseek", "zai"])).resolves.toEqual([
      { provider: "deepseek", id: "default", key: "" },
    ]);
    expect(credentials.getApiKey).toHaveBeenCalledWith("deepseek");
    expect(credentials.getApiKey).toHaveBeenCalledWith("zai");
  });

  it("maps an OAuth adapter to its built-in Pi provider", async () => {
    const credentials = { getApiKey: vi.fn().mockResolvedValue("token") };

    await expect(listDefaultQuotaAccounts(credentials, ["openai"])).resolves.toEqual([
      { provider: "openai", id: "default", key: "", credentialProvider: "openai-codex" },
    ]);
    expect(credentials.getApiKey).toHaveBeenCalledWith("openai-codex");
  });
});
