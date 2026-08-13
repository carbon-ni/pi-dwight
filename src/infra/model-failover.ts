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

export interface ModelFailoverOptions<TModel> {
  currentModel: ActiveModel;
  accounts: Account[];
  fallbackGroups?: FallbackGroup[];
  blockedProviders: ReadonlySet<string>;
  readQuotas(accounts: Account[]): Promise<AccountUsage[]>;
  findModel(provider: string, model: string): TModel | undefined;
  setModel(model: TModel): boolean | void | Promise<boolean | void>;
  now?: Date;
}

export interface ModelFailoverResult {
  from: string;
  to: string;
  model: string;
}

function sameRoute(left: FallbackModel, right: FallbackModel): boolean {
  return left.provider === right.provider && left.model === right.model;
}

function candidateRoutes(options: ModelFailoverOptions<unknown>, currentAccount: Account): FallbackModel[] {
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

/** Select highest-priority usable account, restricted to same or explicitly equivalent models. */
export async function failoverRateLimitedModel<TModel>(
  options: ModelFailoverOptions<TModel>,
): Promise<ModelFailoverResult | undefined> {
  const currentAccount = findAccountForProvider(options.accounts, options.currentModel.provider);
  if (!currentAccount) return undefined;

  const routes = candidateRoutes(options, currentAccount);
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
  for (const { account } of ranked) {
    const provider = accountProviderName(account);
    const route = routes.find((candidate) => candidate.provider === provider);
    if (!route) continue;

    const model = options.findModel(provider, route.model);
    if (!model) continue;

    try {
      const selected = await options.setModel(model);
      if (selected === false) continue;
      return { from: options.currentModel.provider, to: provider, model: route.model };
    } catch {
      continue;
    }
  }

  return undefined;
}
