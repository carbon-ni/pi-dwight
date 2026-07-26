import type { ProviderAdapter } from "./provider-adapter.js";
import { buildProviderTypes } from "./provider-adapter.js";
import type { ProviderQuotaPlugin } from "./usage-types.js";
import {
  anthropicFetch,
  deepseekFetch,
  openaiFetch,
  openrouterFetch,
  zaiFetch,
} from "./provider-usage.js";

/**
 * Known provider type definitions.
 * Each defines the base URL, API type, display name, and available models.
 * Add new entries here to support more providers.
 *
 * For OpenAI Codex (subscription), uses:
 *   - api: "openai-codex-responses"
 *   - baseUrl: "https://chatgpt.com/backend-api"
 */
export interface ModelDefinition {
  id: string;
  name: string;
  reasoning: boolean;
  thinkingLevelMap?: Record<string, string | null>;
  input: Array<"text" | "image">;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
}

export type ProviderUsageViewType = "quota" | "balance" | "mixed";

export interface ProviderUsageAdapter {
  viewType: ProviderUsageViewType;
  quota: ProviderQuotaPlugin;
  /** Built-in Pi provider that supplies credentials for the default account. */
  defaultCredentialProvider?: string;
}

export interface ProviderTypeDef {
  /** Display name shown in /login and /model */
  name: string;
  /** API base URL */
  baseUrl: string;
  /** Pi API type */
  api: string;
  /** Available models for this provider */
  models: ModelDefinition[];
  /** Auth mode: "oauth" for /login flow, "apikey" for plain API key */
  auth: "oauth" | "apikey";
  /** Optional quota/balance usage adapter */
  usage?: ProviderUsageAdapter;
}

const OPENROUTER_MODELS: ModelDefinition[] = [
  {
    id: "openrouter/auto",
    name: "Auto Router",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 4_096,
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16_384,
  },
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0.15, output: 0.6, cacheRead: 0.075, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 8_192,
  },
  {
    id: "anthropic/claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    reasoning: true,
    input: ["text"],
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    contextWindow: 200_000,
    maxTokens: 8_192,
  },
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek Chat",
    reasoning: false,
    input: ["text"],
    cost: { input: 0.27, output: 1.1, cacheRead: 0.07, cacheWrite: 0 },
    contextWindow: 64_000,
    maxTokens: 8_000,
  },
  {
    id: "meta-llama/llama-4-maverick",
    name: "Llama 4 Maverick",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0.2, output: 0.2, cacheRead: 0.1, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 8_192,
  },
];

const DEEPSEEK_MODELS: ModelDefinition[] = [
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    reasoning: false,
    input: ["text"],
    cost: { input: 0.27, output: 1.1, cacheRead: 0.07, cacheWrite: 0 },
    contextWindow: 64_000,
    maxTokens: 8_000,
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek Reasoner",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.55, output: 2.19, cacheRead: 0.14, cacheWrite: 0 },
    contextWindow: 64_000,
    maxTokens: 8_000,
  },
];

const ANTHROPIC_MODELS: ModelDefinition[] = [
  {
    id: "claude-opus-4-7",
    name: "Claude Opus 4.7",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
    contextWindow: 1_000_000,
    maxTokens: 128_000,
  },
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
    contextWindow: 1_000_000,
    maxTokens: 128_000,
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    contextWindow: 1_000_000,
    maxTokens: 64_000,
  },
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude Haiku 4.5",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
    contextWindow: 200_000,
    maxTokens: 64_000,
  },
];

const CODEX_MODELS: ModelDefinition[] = [
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    reasoning: true,
    thinkingLevelMap: { xhigh: "xhigh", minimal: "low" },
    input: ["text", "image"],
    cost: { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 0 },
    contextWindow: 272000,
    maxTokens: 128000,
  },
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    reasoning: true,
    thinkingLevelMap: { xhigh: "xhigh", minimal: "low" },
    input: ["text", "image"],
    cost: { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 0 },
    contextWindow: 272000,
    maxTokens: 128000,
  },
  {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    reasoning: true,
    thinkingLevelMap: { xhigh: "xhigh", minimal: "low" },
    input: ["text", "image"],
    cost: { input: 0.75, output: 4.5, cacheRead: 0.075, cacheWrite: 0 },
    contextWindow: 272000,
    maxTokens: 128000,
  },
  {
    id: "gpt-5.2",
    name: "GPT-5.2",
    reasoning: true,
    thinkingLevelMap: { xhigh: "xhigh", minimal: "low" },
    input: ["text", "image"],
    cost: { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
    contextWindow: 272000,
    maxTokens: 128000,
  },
  {
    id: "gpt-5.1",
    name: "GPT-5.1",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
    contextWindow: 272000,
    maxTokens: 128000,
  },
  {
    id: "gpt-5.1-codex-mini",
    name: "GPT-5.1 Codex Mini",
    reasoning: true,
    thinkingLevelMap: { minimal: "medium", low: "medium", medium: "medium", high: "high" },
    input: ["text", "image"],
    cost: { input: 0.25, output: 2, cacheRead: 0.025, cacheWrite: 0 },
    contextWindow: 272000,
    maxTokens: 128000,
  },
];

const openaiProvider: ProviderAdapter = {
  id: "openai",
  name: "OpenAI",
  baseUrl: "https://chatgpt.com/backend-api",
  api: "openai-codex-responses",
  models: CODEX_MODELS,
  auth: "oauth",
  usage: {
    viewType: "quota",
    quota: { fetch: openaiFetch },
    defaultCredentialProvider: "openai-codex",
  },
};

const openrouterProvider: ProviderAdapter = {
  id: "openrouter",
  name: "OpenRouter",
  baseUrl: "https://openrouter.ai/api/v1",
  api: "openai-completions",
  auth: "apikey",
  models: OPENROUTER_MODELS,
  usage: { viewType: "balance", quota: { fetch: openrouterFetch } },
};

const deepseekProvider: ProviderAdapter = {
  id: "deepseek",
  name: "DeepSeek",
  baseUrl: "https://api.deepseek.com",
  api: "openai-completions",
  auth: "apikey",
  models: DEEPSEEK_MODELS,
  usage: { viewType: "balance", quota: { fetch: deepseekFetch } },
};

const anthropicProvider: ProviderAdapter = {
  id: "anthropic",
  name: "Anthropic",
  baseUrl: "https://api.anthropic.com",
  api: "anthropic-messages",
  auth: "apikey",
  models: ANTHROPIC_MODELS,
  usage: { viewType: "mixed", quota: { fetch: anthropicFetch } },
};

const zaiProvider: ProviderAdapter = {
  id: "zai",
  name: "Z.AI",
  baseUrl: "https://api.z.ai/api/paas/v4",
  api: "openai-completions",
  auth: "apikey",
  usage: { viewType: "quota", quota: { fetch: zaiFetch } },
  models: [
      {
        id: "glm-5.2",
        name: "GLM-5.2",
        reasoning: true,
        thinkingLevelMap: { xhigh: "xhigh", minimal: "low" },
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1_000_000,
        maxTokens: 128_000,
      },
      {
        id: "glm-5.1",
        name: "GLM-5.1",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1_000_000,
        maxTokens: 128_000,
      },
      {
        id: "glm-5v-turbo",
        name: "GLM-5V-Turbo",
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128_000,
        maxTokens: 32_768,
      },
  ],
};

export const PROVIDER_ADAPTERS: ProviderAdapter[] = [
  openaiProvider,
  openrouterProvider,
  deepseekProvider,
  zaiProvider,
  anthropicProvider,
];

/** Registry of known provider types. */
export const PROVIDER_TYPES: Record<string, ProviderTypeDef> = buildProviderTypes(PROVIDER_ADAPTERS);

export function getProviderType(type: string): ProviderTypeDef | undefined {
  return PROVIDER_TYPES[type];
}

export function getProviderTypeNames(): string[] {
  return Object.keys(PROVIDER_TYPES);
}
