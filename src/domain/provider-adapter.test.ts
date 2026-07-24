import { describe, expect, it } from "vitest";
import { buildProviderTypes, type ProviderAdapter } from "./provider-adapter.js";

function adapter(id: string): ProviderAdapter {
  return {
    id,
    name: id,
    baseUrl: `https://${id}.example.com`,
    api: "openai-completions",
    models: [],
    auth: "apikey",
  };
}

describe("buildProviderTypes", () => {
  it("indexes adapters by id", () => {
    const one = adapter("one");
    const two = adapter("two");

    expect(buildProviderTypes([one, two])).toEqual({ one, two });
  });

  it("rejects duplicate provider ids", () => {
    expect(() => buildProviderTypes([adapter("same"), adapter("same")])).toThrow(
      'Duplicate provider adapter id "same"',
    );
  });
});
