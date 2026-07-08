import type { ProjectDefaultModel } from "./project-config.js";

export interface ModelRegistryFinder<TModel = unknown> {
  find(provider: string, model: string): TModel | undefined;
}

export interface ModelSelector<TModel = unknown> {
  setModel(model: TModel): boolean | Promise<boolean>;
}

export async function applyProjectDefaultModel<TModel>(
  selector: ModelSelector<TModel>,
  registry: ModelRegistryFinder<TModel>,
  defaults: ProjectDefaultModel[],
): Promise<ProjectDefaultModel | undefined> {
  for (const candidate of defaults) {
    const model = registry.find(candidate.provider, candidate.model);
    if (!model) continue;

    if (await selector.setModel(model)) {
      return candidate;
    }
  }

  return undefined;
}
