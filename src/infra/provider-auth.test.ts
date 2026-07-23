import { describe, expect, it, vi } from "vitest";
import { providerAuthConfig } from "./provider-auth.js";
import type { Account } from "./config.js";
import type { ProviderTypeDef } from "../domain/providers.js";

function provider(auth: ProviderTypeDef["auth"]): ProviderTypeDef {
  return {
    name: "Provider",
    baseUrl: "https://example.com",
    api: "openai-completions",
    auth,
    models: [],
  };
}

describe("providerAuthConfig", () => {
  it("uses configured API key for API-key providers", () => {
    const oauthFactory = vi.fn();
    const account: Account = { provider: "deepseek", id: "personal", key: "$DEEPSEEK_API_KEY" };

    expect(providerAuthConfig(provider("apikey"), account, oauthFactory)).toEqual({
      apiKey: "$DEEPSEEK_API_KEY",
    });
    expect(oauthFactory).not.toHaveBeenCalled();
  });

  it("uses OAuth for OAuth providers", () => {
    const oauth = {
      name: "OAuth",
      login: vi.fn(),
      refreshToken: vi.fn(),
      getApiKey: vi.fn(),
    };
    const oauthFactory = vi.fn().mockReturnValue(oauth);
    const account: Account = { provider: "openai", id: "personal", key: "" };

    expect(providerAuthConfig(provider("oauth"), account, oauthFactory)).toEqual({ oauth });
    expect(oauthFactory).toHaveBeenCalledWith("personal");
  });
});
