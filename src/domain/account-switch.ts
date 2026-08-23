import { accountProviderName, type Account } from "./accounts.js";

/** Minimal model shape needed to plan a provider switch. */
export interface SwitchableModel {
  provider: string;
  id: string;
}

/** A provider we can jump to from the current model, with the model it will use. */
export interface SwitchTarget {
  provider: string;
  model: string;
  /** The target keeps the current model id. */
  sameModel: boolean;
  /** The target is another account of the same provider type (openai-work → openai-personal). */
  sameProviderType: boolean;
}

function providerTypeByProvider(accounts: Account[]): Map<string, string> {
  const types = new Map<string, string>();
  for (const account of accounts) {
    types.set(accountProviderName(account), account.provider);
  }
  return types;
}

function modelsByProvider(models: SwitchableModel[]): Map<string, string[]> {
  const byProvider = new Map<string, string[]>();
  for (const model of models) {
    const ids = byProvider.get(model.provider) ?? [];
    if (!ids.includes(model.id)) ids.push(model.id);
    byProvider.set(model.provider, ids);
  }
  return byProvider;
}

/**
 * Plan the providers available to switch to from the current model.
 *
 * Same provider type with the same model ranks first (the multi-account
 * jump: openai-work/gpt-4o → openai-personal/gpt-4o), then same model on
 * another provider type. Providers that lack the current model fall back
 * to their first available model, flagged so the user knows the model changes.
 */
export function buildSwitchTargets(
  current: SwitchableModel,
  available: SwitchableModel[],
  accounts: Account[],
): SwitchTarget[] {
  const byProvider = modelsByProvider(available);
  const types = providerTypeByProvider(accounts);
  const currentType = types.get(current.provider) ?? current.provider;

  const targets: SwitchTarget[] = [];
  for (const [provider, ids] of byProvider) {
    if (provider === current.provider) continue;
    const model = ids.includes(current.id) ? current.id : ids[0];
    targets.push({
      provider,
      model,
      sameModel: model === current.id,
      sameProviderType: types.get(provider) === currentType,
    });
  }

  const rank = (target: SwitchTarget): number =>
    target.sameModel && target.sameProviderType ? 0 : target.sameModel ? 1 : 2;

  return targets.sort(
    (a, b) => rank(a) - rank(b) || a.provider.localeCompare(b.provider),
  );
}

/** Human label for a switch target shown in the picker. */
export function switchTargetLabel(target: SwitchTarget): string {
  const hint = target.sameModel && target.sameProviderType
    ? "same account type, same model"
    : target.sameModel
      ? "same model"
      : `model changes to ${target.model}`;
  return `${target.provider} · ${target.model} (${hint})`;
}
