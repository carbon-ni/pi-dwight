/**
 * Account key helpers.
 *
 * Keys in config follow the convention:
 * - \"$VAR_NAME\" — pi resolves from environment at request time
 * - \"literal-key\" — passed directly (discouraged, keys should be env vars)
 * - \"\" — OAuth-based providers, no key needed
 *
 * Pi's ProviderConfig.apiKey handles `$`-prefixed env var resolution natively.
 * These helpers validate and display key state without resolving sensitive values.
 */

/**
 * Check whether a configured key is usable (not empty, and if env var, exists).
 */
export function isKeyConfigured(key: string): boolean {
  if (!key) return false;
  if (key.startsWith("$")) {
    const varName = key.slice(1);
    return process.env[varName] !== undefined;
  }
  return true;
}

/**
 * Human-readable key status for display. Never leaks the actual key value.
 */
export function keyDisplayStatus(key: string): string {
  if (!key) return "no key configured";
  if (key.startsWith("$")) {
    const varName = key.slice(1);
    return process.env[varName] !== undefined ? `${key} (set)` : `${key} (missing)`;
  }
  return "API key configured";
}
