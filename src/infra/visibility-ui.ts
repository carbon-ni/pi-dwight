import {
  disableModel,
  disableProvider,
  enableModel,
  enableProvider,
  readConfig,
} from "./config.js";

export interface PickerModel {
  provider: string;
  id: string;
}

export interface VisibilityPickerUi {
  select(title: string, options: string[]): Promise<string | undefined>;
  input?(title: string, placeholder?: string): Promise<string | undefined>;
  notify(message: string, level?: "info" | "warning" | "error" | string): void;
}

function uniqueProviders(models: PickerModel[]): string[] {
  return [...new Set(models.map((model) => model.provider))].sort();
}

function providerModels(models: PickerModel[], provider: string): string[] {
  return models
    .filter((model) => model.provider === provider)
    .map((model) => model.id)
    .sort();
}

async function searchableOptions(
  ui: VisibilityPickerUi,
  title: string,
  options: string[],
): Promise<string[]> {
  if (!ui.input || options.length <= 1) return options;

  const query = (await ui.input(title, "Type to filter, or leave empty for all"))?.trim().toLowerCase();
  if (!query) return options;

  const terms = query.split(/\s+/);
  const matching = options.filter((option) => {
    const candidate = option.toLowerCase();
    return terms.every((term) => candidate.includes(term));
  });

  if (matching.length === 0) {
    ui.notify(`No matches for "${query}". Showing all options.`, "warning");
    return options;
  }

  return matching;
}

export async function disableProviderWithPicker(
  ui: VisibilityPickerUi,
  models: PickerModel[],
): Promise<boolean> {
  const providers = uniqueProviders(models);
  if (providers.length === 0) {
    ui.notify("No providers available.", "warning");
    return false;
  }

  const provider = await ui.select("Pick provider to disable:", providers);
  if (!provider) return false;

  const changed = disableProvider(provider);
  ui.notify(
    changed ? `Provider "${provider}" disabled.` : `Provider "${provider}" was already disabled.`,
    "info",
  );
  return changed;
}

export async function disableModelWithPicker(
  ui: VisibilityPickerUi,
  models: PickerModel[],
): Promise<boolean> {
  const providers = uniqueProviders(models);
  if (providers.length === 0) {
    ui.notify("No providers available.", "warning");
    return false;
  }

  const provider = await ui.select("Pick provider:", providers);
  if (!provider) return false;

  const modelIds = providerModels(models, provider);
  if (modelIds.length === 0) {
    ui.notify(`No models available for provider "${provider}".`, "warning");
    return false;
  }

  const searchableModelIds = await searchableOptions(ui, "Search model:", modelIds);
  const model = await ui.select("Pick model to disable:", searchableModelIds);
  if (!model) return false;

  const changed = disableModel(provider, model);
  ui.notify(
    changed
      ? `Model "${provider}/${model}" disabled.`
      : `Model "${provider}/${model}" was already disabled.`,
    "info",
  );
  return changed;
}

export async function enableProviderWithPicker(ui: VisibilityPickerUi): Promise<boolean> {
  const providers = [...readConfig().disabledProviders].sort();
  if (providers.length === 0) {
    ui.notify("No disabled providers.", "info");
    return false;
  }

  const provider = await ui.select("Pick provider to enable:", providers);
  if (!provider) return false;

  const changed = enableProvider(provider);
  ui.notify(
    changed ? `Provider "${provider}" enabled.` : `Provider "${provider}" was not disabled.`,
    "info",
  );
  return changed;
}

function disabledModelLabels(): string[] {
  return readConfig()
    .disabledModels.map((entry) => `${entry.provider} / ${entry.model}`)
    .sort();
}

export async function enableModelWithPicker(ui: VisibilityPickerUi): Promise<boolean> {
  const labels = disabledModelLabels();
  if (labels.length === 0) {
    ui.notify("No disabled models.", "info");
    return false;
  }

  const searchableLabels = await searchableOptions(ui, "Search disabled model:", labels);
  const label = await ui.select("Pick model to enable:", searchableLabels);
  if (!label) return false;

  const [provider, model] = label.split(" / ");
  const changed = enableModel(provider, model);
  ui.notify(
    changed ? `Model "${provider}/${model}" enabled.` : `Model "${provider}/${model}" was not disabled.`,
    "info",
  );
  return changed;
}
