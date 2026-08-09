import { getProviderType } from "../domain/providers.js";
import type { Account } from "../domain/accounts.js";

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
    if (!typeDef?.usage?.quota) continue;

    const credentialProvider = typeDef.usage.defaultCredentialProvider ?? provider;
    if (typeDef.auth === "oauth" && !typeDef.usage.defaultCredentialProvider) continue;

    const apiKey = await credentials.getApiKey(credentialProvider);
    if (!apiKey) continue;

    accounts.push({
      provider,
      id: "default",
      key: "",
      ...(credentialProvider === provider ? {} : { credentialProvider }),
    });
  }

  return accounts;
}
