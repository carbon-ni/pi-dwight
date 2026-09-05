/** Multi-account Pi extension composition root. */

import { type ExtensionAPI, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Key } from "@mariozechner/pi-tui";

import {
  type OAuthCredentials,
  type OAuthLoginCallbacks,
} from "@mariozechner/pi-ai";
import {
  filterVisibleModels,
  getFailoverLogPath,
  listAccounts,
  readConfig,
  setAccountQuotaAccountId,
} from "./src/infra/config.js";
import {
  listAliases,
} from "./src/infra/alias.js";
import { getProviderType, getProviderTypeNames } from "./src/domain/providers.js";
import { applyModelOverrides, modelsForAccountProvider } from "./src/domain/inherited-models.js";
import { readProviderModelOverrides } from "./src/infra/model-overrides.js";
import {
  applyVisibilityRules,
  type ModelRegistryReader,
  type ProviderRegistrar,
  type RegistryModel,
  type VisibilityFilter,
} from "./src/domain/visibility.js";
import { hasExplicitModelArgument } from "./src/infra/cli.js";
import { applyProjectDefaultModel } from "./src/infra/project-default-model.js";
import { readProjectDefaults } from "./src/infra/project-config.js";
import { fetchMultiAccountQuota, fetchMultiAccountQuotas } from "./src/infra/quotas.js";
import { findAccountForProvider, formatQuotaStatus } from "./src/lib/quota-status.js";
import { computeQuotaDelta } from "./src/lib/quota-delta.js";
import { highestUsageSeverity } from "./src/domain/usage-views.js";
import type { ProviderUsageResult } from "./src/domain/usage-types.js";
import { createQuotaOverviewWidget } from "./src/infra/quota-overview-ui.js";
import { registerMultiAccountCommand } from "./src/infra/commands.js";
import { providerAuthConfig } from "./src/infra/provider-auth.js";
import { listDefaultQuotaAccounts } from "./src/infra/default-quota-accounts.js";
import { failoverRateLimitedModel } from "./src/infra/model-failover.js";
import { failoverIfActiveQuotaThresholdReached } from "./src/infra/active-quota-failover.js";
import { createFailoverDiagnostics } from "./src/infra/failover-diagnostics.js";
import { createFailoverPin, createSuppressionRecorder, type SuppressionUi } from "./src/infra/failover-pin.js";

// ── Dynamic import of internal OAuth utilities ──
// Not publicly exported by pi-ai. Resolve absolute path from node_modules.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, statSync } from "node:fs";
import { appendFile } from "node:fs/promises";

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

function getVisibilityFilter(): VisibilityFilter {
  const config = readConfig();
  return {
    disabledProviders: config.disabledProviders,
    disabledModelIds: config.disabledModels,
  };
}

async function refreshVisibility(pi: ExtensionAPI, ctx: { modelRegistry: ModelRegistryReader }): Promise<void> {
  await applyVisibilityRules(pi as unknown as ProviderRegistrar, ctx.modelRegistry, getVisibilityFilter);
}

type QuotaStatusContext = {
  model?: { provider: string };
  modelRegistry: { getApiKeyForProvider(provider: string): Promise<string | undefined> };
  ui: {
    setWidget(key: string, lines: string[] | undefined, opts?: { placement?: "aboveEditor" | "belowEditor" }): void;
    theme: { fg(color: "success" | "warning" | "error", text: string): string };
  };
};

async function refreshQuotaStatus(ctx: QuotaStatusContext): Promise<void> {
  const provider = ctx.model?.provider;
  const credentials = { getApiKey: (provider: string) => ctx.modelRegistry.getApiKeyForProvider(provider) };
  const accounts = [
    ...listAccounts(),
    ...await listDefaultQuotaAccounts(credentials, getProviderTypeNames()),
  ];
  const account = findAccountForProvider(accounts, provider);
  if (!account) {
    ctx.ui.setWidget("quotas", undefined);
    return;
  }

  const result = await fetchMultiAccountQuota(credentials, account);
  const status = formatQuotaStatus(account.id, result);
  if (!status || !result.success) {
    ctx.ui.setWidget("quotas", undefined);
    return;
  }

  const accountKey = providerName(account.provider, account.id);
  const spent = computeQuotaDelta(quotaBaselines, accountKey, result);
  const line = spent ? `${status} · ${spent}` : status;

  const color = highestUsageSeverity(result.items);
  ctx.ui.setWidget("quotas", [ctx.ui.theme.fg(color, `◷ ${line}`)]);
}

/** Quota sample at session start per account; deltas are measured against it. */
const quotaBaselines = new Map<string, ProviderUsageResult>();

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
function registerAllAccounts(pi: ExtensionAPI, registryModels: RegistryModel[] = []): void {
  const config = readConfig();
  for (const account of config.accounts) {
    registerAccountProvider(pi, account.id, account.provider, registryModels);
  }
}

/** Register a single account as a provider, inheriting Pi's built-in model catalog. */
function registerAccountProvider(
  pi: ExtensionAPI,
  accountId: string,
  providerType: string,
  registryModels: RegistryModel[] = [],
): void {
  const typeDef = getProviderType(providerType);
  if (!typeDef) return;

  const name = providerName(providerType, accountId);
  const accountModels = modelsForAccountProvider(
    typeDef.builtInProvider,
    registryModels,
    typeDef.models,
    readProviderModelOverrides(providerType),
  );
  const models = filterVisibleModels(name, accountModels);
  if (models.length === 0) return;

  const account = readConfig().accounts.find((a) => a.id === accountId && a.provider === providerType);
  if (!account) return;

  pi.registerProvider(name, {
    name: `${typeDef.name} — ${accountId}`,
    baseUrl: typeDef.baseUrl,
    api: typeDef.api,
    models,
    ...providerAuthConfig(typeDef, account, createOauthProvider),
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
  const [model] = applyModelOverrides(
    [modelDef],
    readProviderModelOverrides(account.provider),
  );

  pi.registerProvider(`a/${alias.name}`, {
    name: `⭐ ${alias.name}`,
    baseUrl: typeDef.baseUrl,
    api: typeDef.api,
    models: [model],
    ...providerAuthConfig(typeDef, account, createOauthProvider),
  });
}

/** Parse "openai-personal" → { provider: "openai", id: "personal" } */
function findAccountByProviderName(providerName: string) {
  const config = readConfig();
  return config.accounts.find((a) => `${a.provider}-${a.id}` === providerName);
}

export default function (pi: ExtensionAPI) {
  const rateLimitedProviders = new Set<string>();
  const rateLimitResponseProviders = new Set<string>();
  const failoverLogPath = getFailoverLogPath();
  mkdirSync(dirname(failoverLogPath), { recursive: true });
  const diagnostics = createFailoverDiagnostics(failoverLogPath, appendFile);
  const failoverPin = createFailoverPin();
  const suppressionRecorder = createSuppressionRecorder({ diagnostics });
  let pendingHandoff: {
    bridge: { provider: string; model: string };
    target: { provider: string; model: string };
  } | undefined;

  // Load all accounts on startup
  registerAllAccounts(pi);
  registerAllAliases(pi);

  pi.on("session_start", async (_event, ctx) => {
    quotaBaselines.clear();
    failoverPin.reset();
    suppressionRecorder.reset();
    await refreshQuotaStatus(ctx as unknown as QuotaStatusContext);
    const registry = ctx.modelRegistry as unknown as ModelRegistryReader;
    const catalogModels = registry.getAll?.() ?? await registry.getAvailable();
    registerAllAccounts(pi, catalogModels);
    await applyVisibilityRules(
      pi as unknown as ProviderRegistrar,
      registry,
      getVisibilityFilter,
      (provider, error) => {
        console.debug(`[multi-account] visibility: registerProvider failed for ${provider}`, error instanceof Error ? error.message : error);
      },
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
    if (applied) ctx.ui.notify(`Dwight project default model: ${applied.provider}/${applied.model}`, "info");
  });

  const failoverFrom = async (
    failedModel: { provider: string; id: string },
    ctx: ExtensionContext,
  ): Promise<void> => {
    if (rateLimitedProviders.has(failedModel.provider)) {
      void diagnostics.record({ event: "fallback-blocked", provider: failedModel.provider });
      return;
    }
    rateLimitedProviders.add(failedModel.provider);

    const credentials = {
      getApiKey: (provider: string) => ctx.modelRegistry.getApiKeyForProvider(provider),
    };
    const accounts = [
      ...listAccounts(),
      ...await listDefaultQuotaAccounts(credentials, getProviderTypeNames()),
    ];
    const config = readConfig();
    const contextPolicy = config.fallback?.contextPolicy ?? "fit-only";
    const result = await failoverRateLimitedModel<NonNullable<ExtensionContext["model"]>>({
      currentModel: failedModel,
      accounts,
      fallbackGroups: config.fallbackGroups,
      bridgeModels: contextPolicy === "compact" ? config.fallback?.summarizerModels : undefined,
      blockedProviders: rateLimitedProviders,
      currentContextTokens: ctx.getContextUsage()?.tokens ?? undefined,
      contextReservePercent: config.fallback?.contextReservePercent,
      readQuotas: (candidates) => fetchMultiAccountQuotas(credentials, candidates),
      findModel: (provider, model) => ctx.modelRegistry.find(provider, model),
      setModel: (model) => pi.setModel(model),
    });
    if (!result) {
      void diagnostics.record({ event: "fallback-unavailable", provider: failedModel.provider });
      ctx.ui.notify(`No usable fallback for ${failedModel.provider}/${failedModel.id}`, "warning");
      return;
    }
    void diagnostics.record({ event: "fallback-selected", provider: result.from, target: `${result.to}/${result.model}` });
    ctx.ui.notify(
      `Quota threshold reached: ${result.from}/${failedModel.id} → ${result.to}/${result.model}`,
      "warning",
    );
    if (!result.handoffTarget || contextPolicy !== "compact") return;
    pendingHandoff = {
      bridge: { provider: result.to, model: result.model },
      target: result.handoffTarget,
    };
    ctx.ui.notify(
      `Bridge selected; will compact then switch to ${result.handoffTarget.provider}/${result.handoffTarget.model}`,
      "info",
    );
  };

  const failoverFromQuotaThreshold = async (
    model: NonNullable<ExtensionContext["model"]>,
    ctx: ExtensionContext,
  ): Promise<void> => {
    const credentials = { getApiKey: (provider: string) => ctx.modelRegistry.getApiKeyForProvider(provider) };
    const configuredThreshold = readConfig().fallback?.usageThresholdPercent;
    const thresholdPercent = typeof configuredThreshold === "number" &&
      Number.isFinite(configuredThreshold) && configuredThreshold >= 1 && configuredThreshold <= 100
      ? configuredThreshold
      : 100;
    await failoverIfActiveQuotaThresholdReached({
      currentProvider: model.provider,
      thresholdPercent,
      listAccounts: async () => [...listAccounts(), ...await listDefaultQuotaAccounts(credentials, getProviderTypeNames())],
      readQuota: (account) => fetchMultiAccountQuota(credentials, account),
      failover: () => failoverFrom({ provider: model.provider, id: model.id }, ctx),
      onDecision: (outcome) => diagnostics.record({ event: "quota-check", provider: model.provider, outcome }),
    });
  };

  pi.on("before_agent_start", async (_event, ctx) => {
    rateLimitedProviders.clear();
    rateLimitResponseProviders.clear();
    if (!ctx.model) return;
    if (failoverPin.isDisabled()) {
      suppressionRecorder.recordSuppressed(ctx.ui as unknown as SuppressionUi, ctx.model.provider, "quota-threshold");
      return;
    }
    await failoverFromQuotaThreshold(ctx.model, ctx);
  });

  pi.on("after_provider_response", (event, ctx) => {
    if (event.status !== 429 || !ctx.model) return;
    rateLimitResponseProviders.add(ctx.model.provider);
    void diagnostics.record({ event: "http-429", provider: ctx.model.provider });
  });

  const compactAndHandoff = (
    ctx: ExtensionContext,
    handoff: NonNullable<typeof pendingHandoff>,
  ): void => {
    ctx.ui.notify(`Compacting with ${handoff.bridge.provider}/${handoff.bridge.model} before handoff`, "info");
    ctx.compact({
      customInstructions: `Prepare a concise continuation summary for ${handoff.target.provider}/${handoff.target.model}. Preserve active task, decisions, modified files, commands, failures, and next steps.`,
      onComplete: () => {
        void (async () => {
          const target = ctx.modelRegistry.find(handoff.target.provider, handoff.target.model);
          if (!target) {
            ctx.ui.notify(`Handoff target unavailable: ${handoff.target.provider}/${handoff.target.model}`, "warning");
            return;
          }

          const reserve = readConfig().fallback?.contextReservePercent ?? 15;
          const tokens = ctx.getContextUsage()?.tokens;
          if (tokens != null && target.contextWindow < tokens * (1 + reserve / 100)) {
            ctx.ui.notify(`Compacted context still does not fit ${handoff.target.provider}/${handoff.target.model}`, "warning");
            return;
          }

          if (!await pi.setModel(target)) {
            ctx.ui.notify(`No credentials for handoff target ${handoff.target.provider}/${handoff.target.model}`, "warning");
            return;
          }
          ctx.ui.notify(`Handoff complete: ${handoff.target.provider}/${handoff.target.model}`, "info");
        })();
      },
      onError: (error: Error) => {
        ctx.ui.notify(`Handoff compaction failed: ${error.message}`, "warning");
      },
    });
  };

  pi.on("agent_end", async (event, ctx) => {
    const assistant = [...event.messages].reverse().find((message) => message.role === "assistant");
    if (!assistant || assistant.role !== "assistant") return;

    if (pendingHandoff &&
      assistant.provider === pendingHandoff.bridge.provider &&
      assistant.model === pendingHandoff.bridge.model &&
      assistant.stopReason !== "error") {
      const handoff = pendingHandoff;
      pendingHandoff = undefined;
      compactAndHandoff(ctx, handoff);
      return;
    }
    if (assistant.stopReason !== "error" || !rateLimitResponseProviders.has(assistant.provider)) return;
    const model = ctx.model;
    if (!model || model.provider !== assistant.provider) return;
    if (failoverPin.isDisabled()) {
      suppressionRecorder.recordSuppressed(ctx.ui as unknown as SuppressionUi, model.provider, "rate-limit");
      return;
    }
    await failoverFromQuotaThreshold(model, ctx);
  });

  pi.on("model_select", async (_event, ctx) => {
    await refreshQuotaStatus(ctx as unknown as QuotaStatusContext);
  });

  pi.on("turn_end", async (_event, ctx) => {
    await refreshQuotaStatus(ctx as unknown as QuotaStatusContext);
  });

  const showQuotaOverview = async (ctx: ExtensionContext) => {
    const credentials = {
      getApiKey: (provider: string) => ctx.modelRegistry.getApiKeyForProvider(provider),
    };
    const accounts = [
      ...listAccounts(),
      ...await listDefaultQuotaAccounts(credentials, getProviderTypeNames()),
    ];
    if (accounts.length === 0) {
      ctx.ui.notify("No quota-capable accounts configured.", "info");
      return;
    }

    const { fetchMultiAccountQuotas } = await import("./src/infra/quotas.js");
    const { buildQuotaOverview } = await import("./src/lib/quota-overview.js");

    await ctx.ui.custom<void>(createQuotaOverviewWidget(
      () => fetchMultiAccountQuotas(credentials, accounts),
      buildQuotaOverview,
    ), {
      overlay: true,
      overlayOptions: { anchor: "top-right", width: "45%", minWidth: 42, maxHeight: "70%", margin: 1 },
    });
  };

  for (const shortcut of [Key.f6] as const) {
    pi.registerShortcut(shortcut, {
      description: "Open or close the multi-account quota overview",
      handler: showQuotaOverview,
    });
  }

  // ── /multi-account <subcommand> ──
  registerMultiAccountCommand(pi, {
    registerAccountProvider,
    registerAliasProvider,
    refreshVisibility,
    showQuotaOverview,
    catalogModels: [],
    failover: {
      // Disabling also cancels an armed bridge handoff: the session is pinned,
      // so no automatic model change may happen after `failover off`.
      disable: () => {
        failoverPin.disable();
        pendingHandoff = undefined;
      },
      enable: () => failoverPin.enable(),
      isDisabled: () => failoverPin.isDisabled(),
    },
  });
}
