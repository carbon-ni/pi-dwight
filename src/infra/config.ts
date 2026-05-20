/**
 * Config file read/write for multi-account data.
 * Stores accounts in ~/.pi/agent/multi-account.json
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface Account {
  /** Unique account identifier (used in provider name: {provider}-{id}) */
  id: string;
  /** Provider type key (e.g., "openai") */
  provider: string;
  /** API key (unused for OAuth-based providers; stores empty string) */
  key: string;
}

export interface DisabledModel {
  provider: string;
  model: string;
}

export interface Alias {
  /** Unique short name (used as provider: a/<name>) */
  name: string;
  /** Existing account provider name (e.g., "openai-personal") */
  account: string;
  /** Model id from that provider (e.g., "gpt-5.5") */
  model: string;
}

export interface AccountsConfig {
  accounts: Account[];
  disabledProviders: string[];
  disabledModels: DisabledModel[];
  aliases?: Alias[];
}

export interface ModelLike {
  id: string;
}

let _configDir: string | undefined;

/** Override the config directory (for testing). Call with undefined to reset. */
export function setConfigDir(dir: string | undefined): void {
  _configDir = dir;
}

export function getConfigPath(): string {
  const dir = _configDir ?? join(homedir(), ".pi", "agent");
  return join(dir, "multi-account.json");
}

function configPath(): string {
  return getConfigPath();
}

function emptyConfig(): AccountsConfig {
  return { accounts: [], disabledProviders: [], disabledModels: [] };
}

function normalizeConfig(config: Partial<AccountsConfig>): AccountsConfig {
  return {
    accounts: config.accounts ?? [],
    disabledProviders: config.disabledProviders ?? [],
    disabledModels: config.disabledModels ?? [],
    aliases: config.aliases ?? [],
  };
}

export function readConfig(): AccountsConfig {
  const path = configPath();
  if (!existsSync(path)) {
    return emptyConfig();
  }
  const raw = readFileSync(path, "utf-8");
  try {
    return normalizeConfig(JSON.parse(raw) as Partial<AccountsConfig>);
  } catch {
    return emptyConfig();
  }
}

export function writeConfig(config: AccountsConfig): void {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function addAccount(account: Account): void {
  const config = readConfig();
  const existing = config.accounts.findIndex(
    (a) => a.id === account.id && a.provider === account.provider,
  );
  if (existing >= 0) {
    config.accounts[existing] = account;
  } else {
    config.accounts.push(account);
  }
  writeConfig(config);
}

export function removeAccount(provider: string, id: string): boolean {
  const config = readConfig();
  const idx = config.accounts.findIndex(
    (a) => a.id === id && a.provider === provider,
  );
  if (idx < 0) return false;
  config.accounts.splice(idx, 1);
  writeConfig(config);
  return true;
}

export function findAccount(
  provider: string,
  id: string,
): Account | undefined {
  return readConfig().accounts.find(
    (a) => a.id === id && a.provider === provider,
  );
}

export function listAccounts(): Account[] {
  return readConfig().accounts;
}

export function isProviderDisabled(provider: string): boolean {
  return readConfig().disabledProviders.includes(provider);
}

export function disableProvider(provider: string): boolean {
  const config = readConfig();
  if (config.disabledProviders.includes(provider)) return false;

  config.disabledProviders.push(provider);
  writeConfig(config);
  return true;
}

export function enableProvider(provider: string): boolean {
  const config = readConfig();
  const disabledProviders = config.disabledProviders.filter((p) => p !== provider);
  if (disabledProviders.length === config.disabledProviders.length) return false;

  config.disabledProviders = disabledProviders;
  writeConfig(config);
  return true;
}

export function isModelDisabled(provider: string, model: string): boolean {
  return readConfig().disabledModels.some(
    (entry) => entry.provider === provider && entry.model === model,
  );
}

export function disableModel(provider: string, model: string): boolean {
  const config = readConfig();
  const exists = config.disabledModels.some(
    (entry) => entry.provider === provider && entry.model === model,
  );
  if (exists) return false;

  config.disabledModels.push({ provider, model });
  writeConfig(config);
  return true;
}

export function enableModel(provider: string, model: string): boolean {
  const config = readConfig();
  const disabledModels = config.disabledModels.filter(
    (entry) => entry.provider !== provider || entry.model !== model,
  );
  if (disabledModels.length === config.disabledModels.length) return false;

  config.disabledModels = disabledModels;
  writeConfig(config);
  return true;
}

export function filterVisibleModels<T extends ModelLike>(provider: string, models: T[]): T[] {
  const config = readConfig();
  if (config.disabledProviders.includes(provider)) return [];

  const disabledModels = new Set(
    config.disabledModels
      .filter((entry) => entry.provider === provider)
      .map((entry) => entry.model),
  );

  return models.filter((model) => !disabledModels.has(model.id));
}
