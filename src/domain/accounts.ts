export interface FallbackModel {
  /** Exact Pi provider name, such as openai-personal. */
  provider: string;
  model: string;
}

export interface FallbackGroup {
  name: string;
  /** Equivalent models only. Order breaks equal quota-priority ties. */
  models: FallbackModel[];
}

/** Account registered as a distinct Pi provider. */
export interface Account {
  /** Unique account identifier used in provider name: {provider}-{id}. */
  id: string;
  /** Provider type key, such as "openai". */
  provider: string;
  /** API key or $ENV_VAR reference. Empty for OAuth providers. */
  key: string;
  /** Provider account ID required by its quota endpoint, when applicable. */
  accountId?: string;
  /** Pi provider name that owns credentials when it differs from `provider`. */
  credentialProvider?: string;
}

/** Pi provider name that owns this account's models and credentials. */
export function accountProviderName(account: Account): string {
  if (account.credentialProvider) return account.credentialProvider;
  if (account.id === "default") return account.provider;
  return `${account.provider}-${account.id}`;
}
