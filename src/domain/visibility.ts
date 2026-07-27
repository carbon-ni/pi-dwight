export interface RegistryModel {
  provider: string;
  id: string;
  [key: string]: unknown;
}

export interface ProviderRegistrar {
  registerProvider(provider: string, config: { models: RegistryModel[] }): void;
}

export interface ModelRegistryReader {
  getAll?(): RegistryModel[];
  getAvailable(): RegistryModel[] | Promise<RegistryModel[]>;
  __multiAccountVisibilityOriginalGetAvailable?: () => RegistryModel[] | Promise<RegistryModel[]>;
}

export interface DisabledModel {
  provider: string;
  model: string;
}

export interface VisibilityFilter {
  disabledProviders: string[];
  disabledModelIds: DisabledModel[];
}

const baselineModels = new Map<string, RegistryModel[]>();

function groupByProvider(models: RegistryModel[]): Map<string, RegistryModel[]> {
  const providers = new Map<string, RegistryModel[]>();

  for (const model of models) {
    const providerModels = providers.get(model.provider) ?? [];
    providerModels.push(model);
    providers.set(model.provider, providerModels);
  }

  return providers;
}

function rememberBaseline(providers: Map<string, RegistryModel[]>): void {
  for (const [provider, models] of providers) {
    if (models.length > 0) {
      baselineModels.set(provider, models);
    }
  }
}

function allKnownProviders(currentProviders: Map<string, RegistryModel[]>): string[] {
  return [...new Set([...currentProviders.keys(), ...baselineModels.keys()])];
}

export function clearVisibilityBaseline(): void {
  baselineModels.clear();
}

export function filterVisibleModels<T extends { id: string }>(
  provider: string,
  models: T[],
  filter: VisibilityFilter,
): T[] {
  if (filter.disabledProviders.includes(provider)) return [];

  const disabledIds = new Set(
    filter.disabledModelIds
      .filter((entry) => entry.provider === provider)
      .map((entry) => entry.model),
  );

  return models.filter((model) => !disabledIds.has(model.id));
}

export function installVisibilityFilter(
  modelRegistry: ModelRegistryReader,
  getFilter: () => VisibilityFilter,
): void {
  if (modelRegistry.__multiAccountVisibilityOriginalGetAvailable) return;

  function filterAvailableModels(models: RegistryModel[]): RegistryModel[] {
    const currentFilter = getFilter();
    const providers = groupByProvider(models);
    rememberBaseline(providers);

    return models.filter(
      (model) => filterVisibleModels(model.provider, [model], currentFilter).length > 0,
    );
  }

  const originalGetAvailable = modelRegistry.getAvailable.bind(modelRegistry);
  modelRegistry.__multiAccountVisibilityOriginalGetAvailable = originalGetAvailable;
  modelRegistry.getAvailable = function getVisibleAvailable() {
    const result = originalGetAvailable();
    if (result instanceof Promise) {
      return result.then(filterAvailableModels);
    }
    return filterAvailableModels(result);
  };
}

export async function applyVisibilityRules(
  pi: ProviderRegistrar,
  modelRegistry: ModelRegistryReader,
  getFilter: () => VisibilityFilter,
): Promise<void> {
  installVisibilityFilter(modelRegistry, getFilter);
  const models =
    (await modelRegistry.__multiAccountVisibilityOriginalGetAvailable?.()) ??
    (await modelRegistry.getAvailable());
  const providers = groupByProvider(models);
  rememberBaseline(providers);

  const currentFilter = getFilter();

  for (const provider of allKnownProviders(providers)) {
    const providerModels = baselineModels.get(provider) ?? providers.get(provider) ?? [];
    try {
      pi.registerProvider(provider, {
        models: filterVisibleModels(provider, providerModels, currentFilter),
      });
    } catch {
      // Some built-in providers require provider metadata (e.g. baseUrl) when
      // overriding models. Keep command flow alive; unsupported providers can
      // be reported by runtime verification instead of crashing the extension.
    }
  }
}
