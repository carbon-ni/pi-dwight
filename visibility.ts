import { filterVisibleModels } from "./config.js";

export interface RegistryModel {
  provider: string;
  id: string;
  [key: string]: unknown;
}

export interface ProviderRegistrar {
  registerProvider(provider: string, config: { models: RegistryModel[] }): void;
}

export interface ModelRegistryReader {
  getAvailable(): RegistryModel[] | Promise<RegistryModel[]>;
  __multiAccountVisibilityOriginalGetAvailable?: () => RegistryModel[] | Promise<RegistryModel[]>;
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

function filterAvailableModels(models: RegistryModel[]): RegistryModel[] {
  const providers = groupByProvider(models);
  rememberBaseline(providers);

  return models.filter((model) => filterVisibleModels(model.provider, [model]).length > 0);
}

export function installVisibilityFilter(modelRegistry: ModelRegistryReader): void {
  if (modelRegistry.__multiAccountVisibilityOriginalGetAvailable) return;

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
): Promise<void> {
  installVisibilityFilter(modelRegistry);
  const models = await modelRegistry.__multiAccountVisibilityOriginalGetAvailable?.() ?? await modelRegistry.getAvailable();
  const providers = groupByProvider(models);
  rememberBaseline(providers);

  for (const provider of allKnownProviders(providers)) {
    const providerModels = baselineModels.get(provider) ?? providers.get(provider) ?? [];
    try {
      pi.registerProvider(provider, {
        models: filterVisibleModels(provider, providerModels),
      });
    } catch {
      // Some built-in providers require provider metadata (e.g. baseUrl) when
      // overriding models. Keep command flow alive; unsupported providers can
      // be reported by runtime verification instead of crashing the extension.
    }
  }
}
