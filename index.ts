/**
 * Multi-Account Extension
 *
 * Manage multiple OpenAI subscription accounts (ChatGPT Plus/Pro/Codex).
 * Each account uses its own OAuth login via pi's built-in /login command.
 *
 * Accounts stored in ~/.pi/agent/multi-account.json
 *
 * Commands:
 *   /multi-account add <provider> <id>    — Register a new account
 *   /multi-account list                   — List all accounts
 *   /multi-account remove <provider> <id> — Remove an account
 *   /multi-account show <provider> <id>   — Show account details
 *
 * Flow:
 *   1. /multi-account add openai personal
 *   2. /login openai-personal
 *   3. /model → sees openai-personal/gpt-4o etc.
 *
 * Provider names: {provider}-{id} (e.g., openai-personal, openai-work)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  type OAuthCredentials,
  type OAuthLoginCallbacks,
} from "@mariozechner/pi-ai";
import {
  addAccount,
  filterVisibleModels,
  findAccount,
  getConfigPath,
  listAccounts,
  readConfig,
  removeAccount,
  setAccountQuotaAccountId,
} from "./src/infra/config.js";
import {
  addAlias,
  listAliases,
  removeAlias,
} from "./src/infra/alias.js";
import { getProviderType, getProviderTypeNames } from "./src/domain/providers.js";
import {
  applyVisibilityRules,
  type ModelRegistryReader,
  type ProviderRegistrar,
  type RegistryModel,
} from "./src/domain/visibility.js";
import {
  disableModelWithPicker,
  disableProviderWithPicker,
  enableModelWithPicker,
  enableProviderWithPicker,
} from "./src/infra/visibility-ui.js";
import { addAliasWithPicker, type AliasPickerUi } from "./src/infra/alias-ui.js";
import { hasExplicitModelArgument } from "./src/infra/cli.js";
import { applyProjectDefaultModel } from "./src/infra/project-default-model.js";
import { readProjectDefaults } from "./src/infra/project-config.js";
import { formatVisibilityRules } from "./src/lib/visibility-format.js";
import { fetchMultiAccountQuota } from "./src/infra/quotas.js";
import { findAccountForProvider, formatQuotaStatus } from "./src/lib/quota-status.js";

// ── Dynamic import of internal OAuth utilities ──
// Not publicly exported by pi-ai. Resolve absolute path from node_modules.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

function findPiAiDist(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, "node_modules", "@mariozechner", "pi-ai", "dist");
    try {
      statSync(candidate);
      return candidate;
    } catch {
      dir = join(dir, "..");
    }
  }
  throw new Error("Cannot find @mariozechner/pi-ai in node_modules");
}

const piAiDist = findPiAiDist();
const piAiOauthPath = join(piAiDist, "utils", "oauth", "openai-codex.js");

interface OpenAICodexLoginResult {
  access: string;
  refresh: string;
  expires: number;
  accountId: string;
}

interface OpenAICodexLoginOptions {
  onAuth: (params: { url: string; instructions?: string }) => void;
  onPrompt: (params: { message: string; placeholder?: string }) => Promise<string>;
  onProgress?: (message: string) => void;
  onManualCodeInput?: () => Promise<string>;
  originator?: string;
}

let _openaiOauth: {
  loginOpenAICodex: (opts: OpenAICodexLoginOptions) => Promise<OpenAICodexLoginResult>;
  refreshOpenAICodexToken: (refreshToken: string) => Promise<OpenAICodexLoginResult>;
} | null = null;

async function loadOpenaiOauth() {
  if (!_openaiOauth) {
    _openaiOauth = await import(piAiOauthPath) as NonNullable<typeof _openaiOauth>;
  }
  return _openaiOauth;
}

function providerName(provider: string, id: string): string {
  return `${provider}-${id}`;
}

async function getAvailableModels(ctx: { modelRegistry: ModelRegistryReader }): Promise<RegistryModel[]> {
  return await ctx.modelRegistry.getAvailable();
}

async function refreshVisibility(pi: ExtensionAPI, ctx: { modelRegistry: ModelRegistryReader }): Promise<void> {
  await applyVisibilityRules(pi as unknown as ProviderRegistrar, ctx.modelRegistry);
}

type QuotaStatusContext = {
  model?: { provider: string };
  modelRegistry: { getApiKeyForProvider(provider: string): Promise<string | undefined> };
  ui: {
    setStatus(key: string, value: string | undefined): void;
    theme: { fg(color: "success" | "warning" | "error", text: string): string };
  };
};

async function refreshQuotaStatus(ctx: QuotaStatusContext): Promise<void> {
  const provider = ctx.model?.provider;
  const account = findAccountForProvider(listAccounts(), provider);
  if (!account) {
    ctx.ui.setStatus("quotas", undefined);
    return;
  }

  const credentials = { getApiKey: (provider: string) => ctx.modelRegistry.getApiKeyForProvider(provider) };
  const result = await fetchMultiAccountQuota(credentials, account);
  const status = formatQuotaStatus(account.id, result);
  if (!status || !result.success) {
    ctx.ui.setStatus("quotas", undefined);
    return;
  }

  const highestUsage = Math.max(...result.windows.map((window) => window.usedPercent));
  const color = highestUsage >= 90 ? "error" : highestUsage >= 70 ? "warning" : "success";
  ctx.ui.setStatus("quotas", ctx.ui.theme.fg(color, `◷ ${status}`));
}

/** Create an OAuth provider config for a specific account. */
function createOauthProvider(accountId: string) {
  return {
    name: `ChatGPT Plus/Pro — ${accountId}`,
    usesCallbackServer: true,
    async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
      const { loginOpenAICodex } = await loadOpenaiOauth();
      const result = await loginOpenAICodex({
        onAuth: callbacks.onAuth,
        onPrompt: callbacks.onPrompt,
        onProgress: callbacks.onProgress,
        onManualCodeInput: callbacks.onManualCodeInput,
        originator: `pi-multi-account-${accountId}`,
      });
      setAccountQuotaAccountId("openai", accountId, result.accountId);
      return {
        access: result.access,
        refresh: result.refresh,
        expires: result.expires,
      };
    },
    async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
      const { refreshOpenAICodexToken } = await loadOpenaiOauth();
      const result = await refreshOpenAICodexToken(credentials.refresh);
      setAccountQuotaAccountId("openai", accountId, result.accountId);
      return {
        access: result.access,
        refresh: result.refresh,
        expires: result.expires,
      };
    },
    getApiKey(credentials: OAuthCredentials): string {
      return credentials.access;
    },
  };
}

/** Register all accounts from config as pi providers. */
function registerAllAccounts(pi: ExtensionAPI): void {
  const config = readConfig();
  for (const account of config.accounts) {
    registerAccountProvider(pi, account.id, account.provider);
  }
}

/** Register a single account as a pi provider with OAuth. */
function registerAccountProvider(
  pi: ExtensionAPI,
  accountId: string,
  providerType: string,
): void {
  const typeDef = getProviderType(providerType);
  if (!typeDef) return;

  const name = providerName(providerType, accountId);

  const models = filterVisibleModels(name, typeDef.models);
  if (models.length === 0) return;

  pi.registerProvider(name, {
    name: `${typeDef.name} — ${accountId}`,
    baseUrl: typeDef.baseUrl,
    api: typeDef.api,
    models,
    oauth: createOauthProvider(accountId),
  });
}

/** Register all aliases as pi providers (a/<name> → provider+model). */
function registerAllAliases(pi: ExtensionAPI): void {
  for (const alias of listAliases()) {
    registerAliasProvider(pi, alias);
  }
}

function registerAliasProvider(pi: ExtensionAPI, alias: { name: string; provider: string; model: string }): void {
  // Multi-account provider like "openai-personal" → find account + typeDef
  const account = findAccountByProviderName(alias.provider);
  if (!account) return;

  const typeDef = getProviderType(account.provider);
  if (!typeDef) return;

  const modelDef = typeDef.models.find((m) => m.id === alias.model);
  if (!modelDef) return;

  pi.registerProvider(`a/${alias.name}`, {
    name: `⭐ ${alias.name}`,
    baseUrl: typeDef.baseUrl,
    api: typeDef.api,
    models: [modelDef],
    oauth: createOauthProvider(account.id),
  });
}

/** Parse "openai-personal" → { provider: "openai", id: "personal" } */
function findAccountByProviderName(providerName: string) {
  const config = readConfig();
  return config.accounts.find((a) => `${a.provider}-${a.id}` === providerName);
}

export default function (pi: ExtensionAPI) {
  // Load all accounts on startup
  registerAllAccounts(pi);
  registerAllAliases(pi);

  pi.on("session_start", async (_event, ctx) => {
    await refreshQuotaStatus(ctx as unknown as QuotaStatusContext);
    await applyVisibilityRules(
      pi as unknown as ProviderRegistrar,
      ctx.modelRegistry as unknown as ModelRegistryReader,
    );

    if (hasExplicitModelArgument(process.argv)) return;

    const trustContext = ctx as unknown as { isProjectTrusted?: () => boolean | Promise<boolean> };
    const isTrusted = trustContext.isProjectTrusted ? await trustContext.isProjectTrusted() : false;
    const projectDefaults = readProjectDefaults(ctx.cwd, isTrusted);
    const applied = await applyProjectDefaultModel(
      pi,
      ctx.modelRegistry as unknown as { find(provider: string, model: string): unknown | undefined },
      projectDefaults.defaultModels,
    );
    if (applied) {
      ctx.ui.notify(`Dwight project default model: ${applied.provider}/${applied.model}`, "info");
    }
  });

  pi.on("model_select", async (_event, ctx) => {
    await refreshQuotaStatus(ctx as unknown as QuotaStatusContext);
  });

  pi.on("turn_end", async (_event, ctx) => {
    await refreshQuotaStatus(ctx as unknown as QuotaStatusContext);
  });

  // ── /multi-account <subcommand> ──
  pi.registerCommand("multi-account", {
    description: "Manage multi-account providers (OpenAI subscriptions)",
    getArgumentCompletions: (prefix) => {
      const subcommands = [
        "add",
        "list",
        "remove",
        "show",
        "disable-provider",
        "enable-provider",
        "disable-model",
        "enable-model",
        "visibility",
        "alias-add",
        "alias-remove",
        "alias-list",
      ];
      const matching = subcommands.filter((s) => s.startsWith(prefix));
      if (matching.length > 0) {
        return matching.map((s) => ({ value: s, label: s }));
      }
      return null;
    },
    handler: async (args, ctx) => {
      const parts = (args ?? "").trim().split(/\s+/);
      const sub = parts[0];

      if (!sub) {
        ctx.ui.notify(
          "Usage: /multi-account <add|list|remove|show> [...]",
          "warning",
        );
        return;
      }

      switch (sub) {
        case "add": {
          const provider = parts[1];
          const id = parts[2];

          if (!provider || !id) {
            ctx.ui.notify(
              "Usage: /multi-account add <provider> <id>\n" +
                "Example: /multi-account add openai personal\n\n" +
                "After adding, run /login to authenticate.",
              "warning",
            );
            return;
          }

          const typeDef = getProviderType(provider);
          if (!typeDef) {
            ctx.ui.notify(
              `Unknown provider "${provider}". Available: ${getProviderTypeNames().join(", ")}`,
              "error",
            );
            return;
          }

          // Save account config (no API key needed — OAuth handles it)
          addAccount({ id, provider, key: "" });
          registerAccountProvider(pi, id, provider);

          const name = providerName(provider, id);
          ctx.ui.notify(
            `Account "${name}" registered.\nRun /login to authenticate.`,
            "info",
          );
          break;
        }

        case "list": {
          const accounts = listAccounts();
          if (accounts.length === 0) {
            ctx.ui.notify("No accounts configured.", "info");
            return;
          }

          const lines = accounts.map((a) => {
            const name = providerName(a.provider, a.id);
            const typeDef = getProviderType(a.provider);
            return `  ${name} (${typeDef?.name ?? a.provider})`;
          });

          ctx.ui.notify(
            `Accounts (${getConfigPath()}):\n${lines.join("\n")}`,
            "info",
          );
          break;
        }

        case "remove": {
          const provider = parts[1];
          const id = parts[2];

          if (!provider || !id) {
            ctx.ui.notify(
              "Usage: /multi-account remove <provider> <id>",
              "warning",
            );
            return;
          }

          const existing = findAccount(provider, id);
          if (!existing) {
            ctx.ui.notify(
              `Account "${providerName(provider, id)}" not found.`,
              "error",
            );
            return;
          }

          const name = providerName(provider, id);
          const ok = await ctx.ui.confirm(
            "Remove account?",
            `Remove "${name}"? OAuth credentials will remain in auth storage.`,
          );
          if (!ok) {
            ctx.ui.notify("Cancelled.", "info");
            return;
          }

          removeAccount(provider, id);
          pi.unregisterProvider(name);

          ctx.ui.notify(
            `Account "${name}" removed. OAuth tokens remain in ~/.pi/agent/auth.json`,
            "info",
          );
          break;
        }

        case "disable-provider": {
          const modelCtx = ctx as unknown as { modelRegistry: ModelRegistryReader };
          const changed = await disableProviderWithPicker(ctx.ui, await getAvailableModels(modelCtx));
          if (changed) await refreshVisibility(pi, modelCtx);
          break;
        }

        case "enable-provider": {
          const modelCtx = ctx as unknown as { modelRegistry: ModelRegistryReader };
          const changed = await enableProviderWithPicker(ctx.ui);
          if (changed) await refreshVisibility(pi, modelCtx);
          break;
        }

        case "disable-model": {
          const modelCtx = ctx as unknown as { modelRegistry: ModelRegistryReader };
          const changed = await disableModelWithPicker(ctx.ui, await getAvailableModels(modelCtx));
          if (changed) await refreshVisibility(pi, modelCtx);
          break;
        }

        case "enable-model": {
          const modelCtx = ctx as unknown as { modelRegistry: ModelRegistryReader };
          const changed = await enableModelWithPicker(ctx.ui);
          if (changed) await refreshVisibility(pi, modelCtx);
          break;
        }

        case "visibility": {
          ctx.ui.notify(formatVisibilityRules(), "info");
          break;
        }

        case "show": {
          const provider = parts[1];
          const id = parts[2];

          if (!provider || !id) {
            ctx.ui.notify(
              "Usage: /multi-account show <provider> <id>",
              "warning",
            );
            return;
          }

          const account = findAccount(provider, id);
          if (!account) {
            ctx.ui.notify(
              `Account "${providerName(provider, id)}" not found.`,
              "error",
            );
            return;
          }

          const typeDef = getProviderType(account.provider);
          ctx.ui.notify(
            [
              `Account: ${providerName(account.provider, account.id)}`,
              `Provider: ${typeDef?.name ?? account.provider}`,
              `Auth: /login to authenticate`,
            ].join("\n"),
            "info",
          );
          break;
        }

        case "alias-add": {
          const name = parts[1];
          const provider = parts[2];
          const model = parts[3];

          // No args → picker flow
          if (!name) {
            const modelCtx = ctx as unknown as { modelRegistry: ModelRegistryReader };
            const models = await getAvailableModels(modelCtx);
            const result = await addAliasWithPicker(
              ctx.ui as unknown as AliasPickerUi,
              models.map((m: RegistryModel) => ({ provider: m.provider, id: m.id })),
            );
            if (result) {
              registerAliasProvider(pi, result);
            }
            return;
          }

          // CLI flow with args
          if (!provider || !model) {
            ctx.ui.notify(
              "Usage: /multi-account alias-add <name> <provider> <model>\n" +
                "Or: /multi-account alias-add (interactive picker)\n" +
                "Example: /multi-account alias-add my-fav openai-personal gpt-5.5\n" +
                "Then use: pi --model a/my-fav",
              "warning",
            );
            return;
          }

          addAlias({ name, provider, model });
          registerAliasProvider(pi, { name, provider, model });
          ctx.ui.notify(
            `Alias "a/${name}" → ${provider}/${model} registered.\nUse: pi --model a/${name}`,
            "info",
          );
          break;
        }

        case "alias-remove": {
          const name = parts[1];
          if (!name) {
            ctx.ui.notify(
              "Usage: /multi-account alias-remove <name>",
              "warning",
            );
            return;
          }

          if (removeAlias(name)) {
            pi.unregisterProvider(`a/${name}`);
            ctx.ui.notify(`Alias "a/${name}" removed.`, "info");
          } else {
            ctx.ui.notify(`Alias "${name}" not found.`, "error");
          }
          break;
        }

        case "alias-list": {
          const aliases = listAliases();
          if (aliases.length === 0) {
            ctx.ui.notify("No aliases configured. Use /multi-account alias-add ...", "info");
            return;
          }
          const lines = aliases.map((a) => `  a/${a.name} → ${a.provider}/${a.model}`);
          ctx.ui.notify(`Aliases:\n${lines.join("\n")}`, "info");
          break;
        }

        default:
          ctx.ui.notify(
            `Unknown subcommand "${sub}". Use: add, list, remove, show, alias-add, alias-remove, alias-list, disable-provider, enable-provider, disable-model, enable-model, visibility`,
            "error",
          );
      }
    },
  });
}
