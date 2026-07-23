import type {
  OAuthCredentials,
  OAuthLoginCallbacks,
} from "@mariozechner/pi-ai";
import type { ProviderTypeDef } from "../domain/providers.js";
import type { Account } from "./config.js";

export interface ProviderOAuthConfig {
  name: string;
  login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials>;
  refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials>;
  getApiKey(credentials: OAuthCredentials): string;
}

export type ProviderAuthConfig =
  | { apiKey: string | undefined }
  | { oauth: ProviderOAuthConfig };

export function providerAuthConfig(
  typeDef: Pick<ProviderTypeDef, "auth">,
  account: Account,
  oauthFactory: (accountId: string) => ProviderOAuthConfig,
): ProviderAuthConfig {
  if (typeDef.auth === "apikey") {
    return { apiKey: account.key || undefined };
  }

  return { oauth: oauthFactory(account.id) };
}
