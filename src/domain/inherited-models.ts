export interface ProviderModel {
  provider: string;
  id: string;
  [key: string]: unknown;
}

export type ModelOverrides = Record<string, Record<string, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeModel(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const baseValue = merged[key];
    merged[key] = isRecord(baseValue) && isRecord(value)
      ? mergeModel(baseValue, value)
      : value;
  }

  return merged;
}

/** Apply overrides only to matching catalog models; unknown model ids stay ignored. */
export function applyModelOverrides<T extends { id: string }>(
  models: T[],
  overrides: ModelOverrides,
): T[] {
  if (Object.keys(overrides).length === 0) return models;

  let changed = false;
  const mergedModels = models.map((model) => {
    const override = overrides[model.id];
    if (!override) return model;
    changed = true;
    return mergeModel(model, override) as T;
  });

  return changed ? mergedModels : models;
}

/** Resolve account models from Pi's current built-in catalog, without copying provider identity. */
export function modelsForAccountProvider<T extends { id: string }>(
  builtInProvider: string,
  registryModels: ProviderModel[],
  fallbackModels: T[],
  overrides: ModelOverrides = {},
): T[] {
  const inheritedModels = registryModels
    .filter((model) => model.provider === builtInProvider)
    .map(({ provider: _provider, ...model }) => model as T);

  const models = inheritedModels.length === 0 ? fallbackModels : inheritedModels;
  return applyModelOverrides(models, overrides);
}
