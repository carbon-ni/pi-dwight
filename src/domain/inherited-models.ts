export interface ProviderModel {
  provider: string;
  id: string;
  [key: string]: unknown;
}

/** Resolve account models from Pi's current built-in catalog, without copying provider identity. */
export function modelsForAccountProvider<T extends { id: string }>(
  builtInProvider: string,
  registryModels: ProviderModel[],
  fallbackModels: T[],
): T[] {
  const inheritedModels = registryModels
    .filter((model) => model.provider === builtInProvider)
    .map(({ provider: _provider, ...model }) => model as T);

  if (inheritedModels.length === 0) return fallbackModels;
  return inheritedModels;
}
