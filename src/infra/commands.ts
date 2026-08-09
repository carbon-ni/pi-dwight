/**
 * /multi-account command registration.
 *
 * Each subcommand handler is a case in the switch below. They are kept
 * together because they share the same argument parsing (parts[0] =
 * subcommand context) and many import the same infra/config/domain modules.
 */
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { ModelRegistryReader, RegistryModel } from "../domain/visibility.js";
import { getProviderType, getProviderTypeNames } from "../domain/providers.js";
import {
  addAccount,
  findAccount,
  getConfigPath,
  listAccounts,
  removeAccount,
} from "../infra/config.js";
import { addAlias, listAliases, removeAlias } from "../infra/alias.js";
import {
  disableModelWithPicker,
  disableProviderWithPicker,
  enableModelWithPicker,
  enableProviderWithPicker,
} from "../infra/visibility-ui.js";
import { addAliasWithPicker, type AliasPickerUi } from "../infra/alias-ui.js";
import { formatVisibilityRules } from "../lib/visibility-format.js";
import { keyDisplayStatus } from "../lib/resolve-key.js";

/** Build "openai-personal" from "openai" + "personal". */
function providerName(provider: string, id: string): string {
  return `${provider}-${id}`;
}

async function getAvailableModels(ctx: { modelRegistry: ModelRegistryReader }): Promise<RegistryModel[]> {
  return await ctx.modelRegistry.getAvailable();
}

/** Parse "openai-personal" → { provider: "openai", id: "personal" } */
export interface MultiAccountCommandDeps {
  /** Register a single account as a Pi provider. */
  registerAccountProvider: (pi: ExtensionAPI, accountId: string, providerType: string, registryModels?: RegistryModel[]) => void;
  /** Register a single alias as a Pi provider. */
  registerAliasProvider: (pi: ExtensionAPI, alias: { name: string; provider: string; model: string }) => void;
  /** Re-apply visibility rules after enable/disable changes. */
  refreshVisibility: (pi: ExtensionAPI, ctx: { modelRegistry: ModelRegistryReader }) => Promise<void>;
  /** Show the quota overview overlay. */
  showQuotaOverview: (ctx: ExtensionContext) => Promise<void>;
  /** Already-resolved provider catalog models (pre-fetched). */
  catalogModels: RegistryModel[];
}

export function registerMultiAccountCommand(pi: ExtensionAPI, deps: MultiAccountCommandDeps): void {
  pi.registerCommand("multi-account", {
    description: "Manage multi-account providers (OpenAI subscriptions)",
    getArgumentCompletions: (prefix) => {
      const subcommands = [
        "add", "list", "remove", "show", "quotas",
        "disable-provider", "enable-provider", "disable-model", "enable-model",
        "visibility",
        "alias-add", "alias-remove", "alias-list",
      ];
      const matching = subcommands.filter((s) => s.startsWith(prefix));
      if (matching.length > 0) return matching.map((s) => ({ value: s, label: s }));
      return null;
    },
    handler: async (args, ctx) => {
      const parts = (args ?? "").trim().split(/\s+/);
      const sub = parts[0];

      if (!sub) {
        ctx.ui.notify("Usage: /multi-account <add|list|remove|show> [...]", "warning");
        return;
      }

      switch (sub) {
        // ── account add ──
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

          if (typeDef.auth === "apikey") {
            const key = parts[3];
            if (!key) {
              ctx.ui.notify(
                `Usage: /multi-account add ${provider} <id> <$ENV_VAR|api-key>\n` +
                  `Examples:\n` +
                  `  /multi-account add zai personal $ZAI_API_KEY\n` +
                  `  /multi-account add zai work $ZAI_WORK_KEY`,
                "warning",
              );
              return;
            }
            addAccount({ id, provider, key });
            deps.registerAccountProvider(pi, id, provider);
            ctx.ui.notify(`Account "${providerName(provider, id)}" registered.`, "info");
            break;
          }

          addAccount({ id, provider, key: "" });
          deps.registerAccountProvider(pi, id, provider);
          ctx.ui.notify(
            `Account "${providerName(provider, id)}" registered.\nRun /login to authenticate.`,
            "info",
          );
          break;
        }

        // ── account list ──
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
          ctx.ui.notify(`Accounts (${getConfigPath()}):\n${lines.join("\n")}`, "info");
          break;
        }

        // ── account remove ──
        case "remove": {
          const provider = parts[1];
          const id = parts[2];
          if (!provider || !id) {
            ctx.ui.notify("Usage: /multi-account remove <provider> <id>", "warning");
            return;
          }
          const existing = findAccount(provider, id);
          if (!existing) {
            ctx.ui.notify(`Account "${providerName(provider, id)}" not found.`, "error");
            return;
          }
          const name = providerName(provider, id);
          const ok = await ctx.ui.confirm(
            "Remove account?",
            `Remove "${name}"? OAuth credentials will remain in auth storage.`,
          );
          if (!ok) { ctx.ui.notify("Cancelled.", "info"); return; }
          removeAccount(provider, id);
          pi.unregisterProvider(name);
          ctx.ui.notify(
            `Account "${name}" removed. OAuth tokens remain in ~/.pi/agent/auth.json`,
            "info",
          );
          break;
        }

        // ── account show ──
        case "show": {
          const provider = parts[1];
          const id = parts[2];
          if (!provider || !id) {
            ctx.ui.notify("Usage: /multi-account show <provider> <id>", "warning");
            return;
          }
          const account = findAccount(provider, id);
          if (!account) {
            ctx.ui.notify(`Account "${providerName(provider, id)}" not found.`, "error");
            return;
          }
          const typeDef = getProviderType(account.provider);
          const authLine = typeDef?.auth === "apikey"
            ? `Auth: ${keyDisplayStatus(account.key)}`
            : "Auth: /login to authenticate";
          ctx.ui.notify(
            [
              `Account: ${providerName(account.provider, account.id)}`,
              `Provider: ${typeDef?.name ?? account.provider}`,
              authLine,
            ].join("\n"),
            "info",
          );
          break;
        }

        // ── visibility toggle commands ──
        case "disable-provider": {
          const modelCtx = ctx as unknown as { modelRegistry: ModelRegistryReader };
          const changed = await disableProviderWithPicker(ctx.ui, await getAvailableModels(modelCtx));
          if (changed) await deps.refreshVisibility(pi, modelCtx);
          break;
        }
        case "enable-provider": {
          const modelCtx = ctx as unknown as { modelRegistry: ModelRegistryReader };
          const changed = await enableProviderWithPicker(ctx.ui);
          if (changed) await deps.refreshVisibility(pi, modelCtx);
          break;
        }
        case "disable-model": {
          const modelCtx = ctx as unknown as { modelRegistry: ModelRegistryReader };
          const changed = await disableModelWithPicker(ctx.ui, await getAvailableModels(modelCtx));
          if (changed) await deps.refreshVisibility(pi, modelCtx);
          break;
        }
        case "enable-model": {
          const modelCtx = ctx as unknown as { modelRegistry: ModelRegistryReader };
          const changed = await enableModelWithPicker(ctx.ui);
          if (changed) await deps.refreshVisibility(pi, modelCtx);
          break;
        }
        case "visibility": {
          ctx.ui.notify(formatVisibilityRules(), "info");
          break;
        }

        // ── quotas ──
        case "quotas": {
          await deps.showQuotaOverview(ctx);
          return;
        }

        // ── alias commands ──
        case "alias-add": {
          const name = parts[1];
          const provider = parts[2];
          const model = parts[3];

          if (!name) {
            const modelCtx = ctx as unknown as { modelRegistry: ModelRegistryReader };
            const models = await getAvailableModels(modelCtx);
            const result = await addAliasWithPicker(
              ctx.ui as unknown as AliasPickerUi,
              models.map((m) => ({ provider: m.provider, id: m.id })),
            );
            if (result) deps.registerAliasProvider(pi, result);
            return;
          }

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
          deps.registerAliasProvider(pi, { name, provider, model });
          ctx.ui.notify(
            `Alias "a/${name}" → ${provider}/${model} registered.\nUse: pi --model a/${name}`,
            "info",
          );
          break;
        }
        case "alias-remove": {
          const name = parts[1];
          if (!name) {
            ctx.ui.notify("Usage: /multi-account alias-remove <name>", "warning");
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
