import {
  accountProviderName,
  type Account,
  type FallbackGroup,
  type FallbackModel,
} from "../domain/accounts.js";
import { rankQuotaAccounts, type AccountUsage } from "../domain/account-priority.js";
import { findAccountForProvider } from "../lib/quota-status.js";

interface ActiveModel {
  provider: string;
  id: string;
}

export interface ModelFailoverOptions<TModel extends { contextWindow: number }> {
  currentModel: ActiveModel;
  accounts: Account[];
  fallbackGroups?: FallbackGroup[];
  bridgeModels?: FallbackModel[];
  blockedProviders: ReadonlySet<string>;
  currentContextTokens?: number;
  contextReservePercent?: number;
  readQuotas(accounts: Account[]): Promise<AccountUsage[]>;
  findModel(provider: string, model: string): TModel | undefined;
  setModel(model: TModel): boolean | void | Promise<boolean | void>;
  now?: Date;
}

/** Provider exhausted a subscription window, rather than transient request throttling. */
export function isUsageLimitError(message: string | undefined): boolean {
  if (!message) return false;
  if (/\busage limit (?:has been )?reached\b/i.test(message)) return true;
  if (!/\b429\b/.test(message)) return false;
  return /quota (?:has been )?exceeded|weekly limit|hourly limit/i.test(message);
}

export interface ModelFailoverResult {
  from: string;
  to: string;
  model: string;
  /** Preferred smaller-context route to select after bridge compaction. */
  handoffTarget?: FallbackModel;
}

function sameRoute(left: FallbackModel, right: FallbackModel): boolean {
  return left.provider === right.provider && left.model === right.model;
}

function candidateRoutes<TModel extends { contextWindow: number }>(
  options: ModelFailoverOptions<TModel>,
  currentAccount: Account,
): FallbackModel[] {
  const active = options.currentModel;
  const activeRoute = { provider: active.provider, model: active.id };
  const sameModelRoutes = options.accounts
    .filter((account) => account.provider === currentAccount.provider)
    .map((account) => ({ provider: accountProviderName(account), model: active.id }));
  const configuredGroup = options.fallbackGroups?.find((group) =>
    group.models.some((route) => sameRoute(route, activeRoute)),
  );

  const routes = [...sameModelRoutes, ...(configuredGroup?.models ?? [])];
  return routes.filter((route, index) =>
    !sameRoute(route, activeRoute) &&
    !options.blockedProviders.has(route.provider) &&
    routes.findIndex((candidate) => sameRoute(candidate, route)) === index,
  );
}

function contextFits(model: { contextWindow: number }, tokens: number | undefined, reservePercent = 15): boolean {
  if (tokens === undefined) return true;
  return model.contextWindow >= tokens * (1 + reservePercent / 100);
}

/** Select highest-priority usable account, restricted to same or explicitly equivalent models. */
export async function failoverRateLimitedModel<TModel extends { contextWindow: number }>(
  options: ModelFailoverOptions<TModel>,
): Promise<ModelFailoverResult | undefined> {
  const currentAccount = findAccountForProvider(options.accounts, options.currentModel.provider);
  if (!currentAccount) return undefined;

  const preferredRoutes = candidateRoutes(options, currentAccount);
  const bridgeRoutes = (options.bridgeModels ?? []).filter((route) =>
    !options.blockedProviders.has(route.provider) &&
    !preferredRoutes.some((candidate) => sameRoute(candidate, route)),
  );
  const routes = [...preferredRoutes, ...bridgeRoutes];
  if (routes.length === 0) return undefined;

  const candidates = routes
    .map((route) => findAccountForProvider(options.accounts, route.provider))
    .filter((account): account is Account => Boolean(account))
    .filter((account, index, all) =>
      all.findIndex((candidate) => accountProviderName(candidate) === accountProviderName(account)) === index,
    );
  if (candidates.length === 0) return undefined;

  const ranked = rankQuotaAccounts(
    await options.readQuotas(candidates),
    options.now,
    routes.map((route) => route.provider),
    { includeBalance: true },
  );
  const resolved = ranked.flatMap(({ account }) => {
    const provider = accountProviderName(account);
    const route = routes.find((candidate) => candidate.provider === provider);
    if (!route) return [];
    const model = options.findModel(provider, route.model);
    return model ? [{ route, model }] : [];
  });
  const preferred = resolved.find(({ route }) =>
    preferredRoutes.some((candidate) => sameRoute(candidate, route)),
  );

  for (const { route, model } of resolved) {
    if (!contextFits(model, options.currentContextTokens, options.contextReservePercent)) continue;

    try {
      const selected = await options.setModel(model);
      if (selected === false) continue;
      const handoffTarget = preferred && !sameRoute(preferred.route, route) ? preferred.route : undefined;
      return {
        from: options.currentModel.provider,
        to: route.provider,
        model: route.model,
        ...(handoffTarget ? { handoffTarget } : {}),
      };
    } catch {
      continue;
    }
  }

  return undefined;
}
