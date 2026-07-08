import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ProjectDefaultModel {
  provider: string;
  model: string;
}

export interface ProjectDefaults {
  defaultModels: ProjectDefaultModel[];
}

interface ProjectConfigFile {
  defaultModel?: unknown;
  defaultModels?: unknown;
}

const PROJECT_CONFIG_DIR = ".pi";
const PROJECT_CONFIG_FILE = "dwight.json";

function isDefaultModel(value: unknown): value is ProjectDefaultModel {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<ProjectDefaultModel>;
  return typeof candidate.provider === "string" && typeof candidate.model === "string";
}

function normalizeDefaultModels(config: ProjectConfigFile): ProjectDefaultModel[] {
  const candidates = Array.isArray(config.defaultModels)
    ? config.defaultModels
    : [config.defaultModel];

  return candidates.filter(isDefaultModel);
}

export function getProjectConfigPath(cwd: string): string {
  return join(cwd, PROJECT_CONFIG_DIR, PROJECT_CONFIG_FILE);
}

export function readProjectDefaults(cwd: string, isProjectTrusted: boolean): ProjectDefaults {
  if (!isProjectTrusted) return { defaultModels: [] };

  const path = getProjectConfigPath(cwd);
  if (!existsSync(path)) return { defaultModels: [] };

  try {
    const config = JSON.parse(readFileSync(path, "utf-8")) as ProjectConfigFile;
    return { defaultModels: normalizeDefaultModels(config) };
  } catch {
    return { defaultModels: [] };
  }
}
