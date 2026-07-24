import { describe, it, expect } from "vitest";
import { getProviderType, getProviderTypeNames, PROVIDER_TYPES } from "./providers.js";

describe("providers", () => {
  describe("PROVIDER_TYPES", () => {
    it("contains openai", () => {
      expect(PROVIDER_TYPES.openai).toBeDefined();
    });

    it("openai uses codex-responses API with quota usage view", () => {
      const oai = PROVIDER_TYPES.openai;
      expect(oai.name).toBe("OpenAI");
      expect(oai.baseUrl).toContain("chatgpt.com");
      expect(oai.api).toBe("openai-codex-responses");
      expect(oai.usage?.viewType).toBe("quota");
      expect(oai.usage?.quota).toBeDefined();
      expect(oai.models.length).toBeGreaterThan(0);
    });

    it("all models have required fields", () => {
      for (const model of PROVIDER_TYPES.openai.models) {
        expect(model.id).toBeTruthy();
        expect(model.name).toBeTruthy();
        expect(typeof model.reasoning).toBe("boolean");
        expect(model.input.length).toBeGreaterThan(0);
        expect(model.cost).toBeDefined();
        expect(model.contextWindow).toBeGreaterThan(0);
        expect(model.maxTokens).toBeGreaterThan(0);
      }
    });
  });

  describe("getProviderType", () => {
    it("returns definition for known provider", () => {
      expect(getProviderType("openai")).toBe(PROVIDER_TYPES.openai);
    });

    it("returns undefined for unknown provider", () => {
      expect(getProviderType("nonexistent")).toBeUndefined();
    });
  });

  describe("zai", () => {
    it("uses openai-completions API with standard base url", () => {
      const zai = PROVIDER_TYPES.zai;
      expect(zai).toBeDefined();
      expect(zai.name).toBe("Z.AI");
      expect(zai.baseUrl).toBe("https://api.z.ai/api/paas/v4");
      expect(zai.api).toBe("openai-completions");
      expect(zai.auth).toBe("apikey");
      expect(zai.usage?.viewType).toBe("quota");
      expect(zai.usage?.quota).toBeDefined();
      expect(zai.models.length).toBeGreaterThan(0);
    });

    it("all models have required fields", () => {
      for (const model of PROVIDER_TYPES.zai.models) {
        expect(model.id).toBeTruthy();
        expect(model.name).toBeTruthy();
        expect(typeof model.reasoning).toBe("boolean");
        expect(model.input.length).toBeGreaterThan(0);
        expect(model.cost).toBeDefined();
        expect(model.contextWindow).toBeGreaterThan(0);
        expect(model.maxTokens).toBeGreaterThan(0);
      }
    });

    it("includes GLM-5.2 as flagship model", () => {
      const model = PROVIDER_TYPES.zai.models.find((m) => m.id === "glm-5.2");
      expect(model).toBeDefined();
      expect(model?.reasoning).toBe(true);
      expect(model?.contextWindow).toBeGreaterThanOrEqual(200_000);
    });
  });

  describe("deepseek", () => {
    it("uses openai-completions API with standard base url", () => {
      const deepseek = PROVIDER_TYPES.deepseek;
      expect(deepseek).toBeDefined();
      expect(deepseek.name).toBe("DeepSeek");
      expect(deepseek.baseUrl).toBe("https://api.deepseek.com");
      expect(deepseek.api).toBe("openai-completions");
      expect(deepseek.auth).toBe("apikey");
      expect(deepseek.usage?.viewType).toBe("balance");
      expect(deepseek.usage?.quota).toBeDefined();
      expect(deepseek.models.length).toBeGreaterThan(0);
    });

    it("includes chat and reasoner models", () => {
      expect(PROVIDER_TYPES.deepseek.models.map((model) => model.id)).toEqual([
        "deepseek-chat",
        "deepseek-reasoner",
      ]);
    });
  });

  describe("getProviderType", () => {
    it("returns definition for known provider", () => {
      expect(getProviderType("openai")).toBe(PROVIDER_TYPES.openai);
    });

    it("returns definition for zai", () => {
      expect(getProviderType("zai")).toBe(PROVIDER_TYPES.zai);
    });

    it("returns definition for deepseek", () => {
      expect(getProviderType("deepseek")).toBe(PROVIDER_TYPES.deepseek);
    });

    it("returns undefined for unknown provider", () => {
      expect(getProviderType("nonexistent")).toBeUndefined();
    });
  });

  describe("openrouter", () => {
    it("uses openai-completions API with OpenRouter base URL", () => {
      const or = PROVIDER_TYPES.openrouter;
      expect(or).toBeDefined();
      expect(or.name).toBe("OpenRouter");
      expect(or.baseUrl).toBe("https://openrouter.ai/api/v1");
      expect(or.api).toBe("openai-completions");
      expect(or.auth).toBe("apikey");
      expect(or.usage?.viewType).toBe("balance");
      expect(or.usage?.quota).toBeDefined();
      expect(or.models.length).toBeGreaterThan(0);
    });

    it("includes auto-router and popular gateway models", () => {
      const ids = PROVIDER_TYPES.openrouter.models.map((m) => m.id);
      expect(ids).toContain("openrouter/auto");
      expect(ids).toContain("openai/gpt-4o");
    });

    it("all models have required fields", () => {
      for (const model of PROVIDER_TYPES.openrouter.models) {
        expect(model.id).toBeTruthy();
        expect(model.name).toBeTruthy();
        expect(typeof model.reasoning).toBe("boolean");
        expect(model.input.length).toBeGreaterThan(0);
        expect(model.cost).toBeDefined();
        expect(model.contextWindow).toBeGreaterThan(0);
        expect(model.maxTokens).toBeGreaterThan(0);
      }
    });
  });

  describe("getProviderTypeNames", () => {
    it("returns list of known provider names", () => {
      const names = getProviderTypeNames();
      expect(names).toContain("openai");
      expect(names).toContain("zai");
      expect(names).toContain("deepseek");
      expect(names).toContain("openrouter");
    });
  });
});
