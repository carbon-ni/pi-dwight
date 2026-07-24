import type { Account } from "./config.js";
import type { ProviderUsageResult } from "../domain/usage-types.js";
import { getProviderType } from "../domain/providers.js";

export {
  parseAnthropicQuota,
  parseDeepSeekQuota,
  parseOpenAiCodexQuota,
  parseOpenRouterQuota,
  parseZaiQuota,
} from "../domain/provider-usage.js";

type Fetcher = typeof globalThis.fetch;

interface AccountCredentialSource {
  getApiKey(provider: string): Promise<string | undefined>;
}

function credentialProviderName(account: Account): string {
  if (account.id === "default") return account.provider;
  return `${account.provider}-${account.id}`;
}

export async function fetchMultiAccountQuota(
  authStorage: AccountCredentialSource,
  account: Account,
  fetcher?: Fetcher,
): Promise<ProviderUsageResult> {
  const typeDef = getProviderType(account.provider);
  const plugin = typeDef?.usage?.quota;
  if (!plugin) {
    return { success: false, error: `Quota fetching is not supported for ${account.provider}` };
  }
  const apiKey = await authStorage.getApiKey(credentialProviderName(account));
  return plugin.fetch(apiKey, {
    accountId: account.accountId,
    credentialProvider: credentialProviderName(account),
    fetcher,
  });
}

export async function fetchMultiAccountQuotas(
  authStorage: AccountCredentialSource,
  accounts: Account[],
  fetcher?: Fetcher,
): Promise<Array<{ account: Account; result: ProviderUsageResult }>> {
  return Promise.all(accounts.map(async (account) => ({
    account,
    result: await fetchMultiAccountQuota(authStorage, account, fetcher),
  })));
}
