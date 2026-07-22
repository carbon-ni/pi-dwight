import { describe, it, expect } from "vitest";
import { getProviderType, getProviderTypeNames, PROVIDER_TYPES } from "./providers.js";

describe("providers", () => {
  describe("PROVIDER_TYPES", () => {
    it("contains openai", () => {
      expect(PROVIDER_TYPES.openai).toBeDefined();
    });

    it("openai uses codex-responses API", () => {
      const oai = PROVIDER_TYPES.openai;
      expect(oai.name).toBe("OpenAI");
      expect(oai.baseUrl).toContain("chatgpt.com");
      expect(oai.api).toBe("openai-codex-responses");
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

  describe("getProviderType", () => {
    it("returns definition for known provider", () => {
      expect(getProviderType("openai")).toBe(PROVIDER_TYPES.openai);
    });

    it("returns definition for zai", () => {
      expect(getProviderType("zai")).toBe(PROVIDER_TYPES.zai);
    });

    it("returns undefined for unknown provider", () => {
      expect(getProviderType("nonexistent")).toBeUndefined();
    });
  });

  describe("getProviderTypeNames", () => {
    it("returns list of known provider names", () => {
      const names = getProviderTypeNames();
      expect(names).toContain("openai");
      expect(names).toContain("zai");
    });
  });
});
