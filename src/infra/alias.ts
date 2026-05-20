/**
 * Alias config: short names that map to a provider+model combo.
 * Stored in ~/.pi/agent/multi-account.json
 *
 * "foobar" → { provider: "openai-personal", model: "gpt-5.5" }
 * registers as provider "a/foobar" in pi:
 *   pi --model a/foobar
 */
import { type Alias, readConfig, writeConfig } from "./config.js";

export type { Alias } from "./config.js";

function aliases(): Alias[] {
  return readConfig().aliases ?? [];
}

export function addAlias(alias: Alias): void {
  const config = readConfig();
  const list = config.aliases ?? [];
  const existing = list.findIndex((a) => a.name === alias.name);
  if (existing >= 0) {
    list[existing] = alias;
  } else {
    list.push(alias);
  }
  config.aliases = list;
  writeConfig(config);
}

export function removeAlias(name: string): boolean {
  const config = readConfig();
  const list = config.aliases ?? [];
  const idx = list.findIndex((a) => a.name === name);
  if (idx < 0) return false;
  list.splice(idx, 1);
  config.aliases = list;
  writeConfig(config);
  return true;
}

export function findAlias(name: string): Alias | undefined {
  return aliases().find((a) => a.name === name);
}

export function listAliases(): Alias[] {
  return aliases();
}
