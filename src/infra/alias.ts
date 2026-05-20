/**
 * Alias config: short names that map to a specific account+model combo.
 * Stored alongside accounts in ~/.pi/agent/multi-account.json
 *
 * An alias "my-fav" pointing to openai-personal/gpt-5.5 registers as
 * provider name "a/my-fav" in pi, so you can do:
 *   pi --model a/my-fav
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
