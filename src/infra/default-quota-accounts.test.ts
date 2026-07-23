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

  it("skips OAuth providers because their quota needs account-specific metadata", async () => {
    const credentials = { getApiKey: vi.fn().mockResolvedValue("token") };

    await expect(listDefaultQuotaAccounts(credentials, ["openai"])).resolves.toEqual([]);
    expect(credentials.getApiKey).not.toHaveBeenCalled();
  });
});
