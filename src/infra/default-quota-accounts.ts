import { getProviderType } from "../domain/providers.js";
import type { Account } from "./config.js";

interface AccountCredentialSource {
  getApiKey(provider: string): Promise<string | undefined>;
}

export async function listDefaultQuotaAccounts(
  credentials: AccountCredentialSource,
  providerNames: string[],
): Promise<Account[]> {
  const accounts: Account[] = [];

  for (const provider of providerNames) {
    const typeDef = getProviderType(provider);
    if (typeDef?.auth !== "apikey") continue;

    const apiKey = await credentials.getApiKey(provider);
    if (!apiKey) continue;

    accounts.push({ provider, id: "default", key: "" });
  }

  return accounts;
}
