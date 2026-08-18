import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type ModelOverrides = Record<string, Record<string, unknown>>;

interface ModelsConfig {
  providers?: Record<string, { modelOverrides?: ModelOverrides }>;
}

/** Read Pi model overrides for a multi-account provider type. */
export function readProviderModelOverrides(
  provider: string,
  configDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"),
): ModelOverrides {
  const path = join(configDir, "models.json");
  if (!existsSync(path)) return {};

  try {
    const config = JSON.parse(readFileSync(path, "utf-8")) as ModelsConfig;
    return config.providers?.[provider]?.modelOverrides ?? {};
  } catch {
    return {};
  }
}
