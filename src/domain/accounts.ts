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
