import { accountProviderName, type Account } from "../domain/accounts.js";
import { getProviderType } from "../domain/providers.js";

/** Shape accepted by pi's argument autocomplete. */
export interface CompletionItem {
  value: string;
  label: string;
  description?: string;
}

const SUBCOMMANDS = [
  "add", "list", "remove", "show", "quotas", "switch",
  "disable-provider", "enable-provider", "disable-model", "enable-model",
  "visibility",
  "alias-add", "alias-remove", "alias-list",
];

function providerCompletions(accounts: Account[], query: string): CompletionItem[] | null {
  const providers = accounts
    .map((account) => {
      const name = accountProviderName(account);
      return { name, typeName: getProviderType(account.provider)?.name ?? account.provider };
    })
    .filter(({ name }) => !query || name.startsWith(query))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (providers.length === 0) return null;

  return providers.map(({ name, typeName }) => ({
    value: `switch ${name}`,
    label: name,
    description: typeName,
  }));
}

/**
 * Argument completions for /multi-account.
 *
 * Completes the subcommand while no argument has been typed yet, then
 * switches to completing account providers once the `switch` keyword is
 * present (e.g. `/multi-account switch openai-w` → openai-work).
 */
export function multiAccountCompletions(
  prefix: string,
  accounts: Account[],
): CompletionItem[] | null {
  if (!/\s/.test(prefix)) {
    const matching = SUBCOMMANDS.filter((sub) => sub.startsWith(prefix.trim()));
    return matching.length > 0
      ? matching.map((sub) => ({ value: sub, label: sub }))
      : null;
  }

  const [sub, ...rest] = prefix.trim().split(/\s+/);
  if (sub !== "switch") return null;

  return providerCompletions(accounts, rest.join(" "));
}
