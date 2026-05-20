import { addAlias, findAlias } from "./alias.js";

export interface PickerModel {
  provider: string;
  id: string;
}

export interface AliasPickerUi {
  select(title: string, options: string[]): Promise<string | undefined>;
  input?(title: string, placeholder?: string): Promise<string | undefined>;
  notify(message: string, level?: "info" | "warning" | "error" | string): void;
}

function uniqueProviders(models: PickerModel[]): string[] {
  return [...new Set(models.map((m) => m.provider))].sort();
}

function providerModels(models: PickerModel[], provider: string): string[] {
  return models
    .filter((m) => m.provider === provider)
    .map((m) => m.id)
    .sort();
}

async function searchableOptions(
  ui: AliasPickerUi,
  title: string,
  options: string[],
): Promise<string[]> {
  if (!ui.input || options.length <= 1) return options;

  const query = (await ui.input(title, "Type to filter, or leave empty for all"))?.trim().toLowerCase();
  if (!query) return options;

  const terms = query.split(/\s+/);
  const matching = options.filter((o) => {
    const candidate = o.toLowerCase();
    return terms.every((term) => candidate.includes(term));
  });

  if (matching.length === 0) {
    ui.notify(`No matches for "${query}". Showing all options.`, "warning");
    return options;
  }

  return matching;
}

export async function addAliasWithPicker(
  ui: AliasPickerUi,
  models: PickerModel[],
): Promise<{ name: string; provider: string; model: string } | undefined> {
  const providers = uniqueProviders(models);
  if (providers.length === 0) {
    ui.notify("No models available to alias.", "warning");
    return undefined;
  }

  const provider = await ui.select("Pick provider:", providers);
  if (!provider) return undefined;

  const modelIds = providerModels(models, provider);
  if (modelIds.length === 0) {
    ui.notify(`No models for provider "${provider}".`, "warning");
    return undefined;
  }

  const searchableModelIds = await searchableOptions(ui, "Search model:", modelIds);
  const model = await ui.select("Pick model:", searchableModelIds);
  if (!model) return undefined;

  const name = await ui.input?.("Alias name:", "e.g. my-fav");
  if (!name?.trim()) return undefined;

  const trimmed = name.trim();
  if (findAlias(trimmed)) {
    ui.notify(`Alias "a/${trimmed}" already exists.`, "error");
    return undefined;
  }

  addAlias({ name: trimmed, provider, model });
  ui.notify(`Alias "a/${trimmed}" → ${provider}/${model} registered.`, "info");
  return { name: trimmed, provider, model };
}
