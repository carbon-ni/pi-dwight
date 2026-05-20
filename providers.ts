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

export interface ProviderTypeDef {
  /** Display name shown in /login and /model */
  name: string;
  /** API base URL */
  baseUrl: string;
  /** Pi API type */
  api: "openai-codex-responses" | "openai-completions" | "anthropic-messages" | "google-generative-language";
  /** Available models for this provider */
  models: ModelDefinition[];
}

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

/** Registry of known provider types. */
export const PROVIDER_TYPES: Record<string, ProviderTypeDef> = {
  openai: {
    name: "OpenAI",
    baseUrl: "https://chatgpt.com/backend-api",
    api: "openai-codex-responses",
    models: CODEX_MODELS,
  },
};

export function getProviderType(type: string): ProviderTypeDef | undefined {
  return PROVIDER_TYPES[type];
}

export function getProviderTypeNames(): string[] {
  return Object.keys(PROVIDER_TYPES);
}
