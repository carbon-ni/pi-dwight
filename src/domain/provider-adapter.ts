import type { ProviderTypeDef } from "./providers.js";

export interface ProviderAdapter extends ProviderTypeDef {
  id: string;
}

export function buildProviderTypes(adapters: ProviderAdapter[]): Record<string, ProviderTypeDef> {
  const providerTypes: Record<string, ProviderTypeDef> = {};

  for (const adapter of adapters) {
    if (providerTypes[adapter.id]) {
      throw new Error(`Duplicate provider adapter id "${adapter.id}"`);
    }
    providerTypes[adapter.id] = adapter;
  }

  return providerTypes;
}
