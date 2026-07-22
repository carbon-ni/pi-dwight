import { describe, expect, it, afterEach } from "vitest";
import { isKeyConfigured, keyDisplayStatus } from "./resolve-key.js";

describe("isKeyConfigured", () => {
  it("returns false for an empty key", () => {
    expect(isKeyConfigured("")).toBe(false);
  });

  it("returns true for a literal key", () => {
    expect(isKeyConfigured("sk-abc123")).toBe(true);
  });

  it("returns true for an env-var key when the variable is set", () => {
    process.env.__TEST_KEY = "secret";
    expect(isKeyConfigured("$__TEST_KEY")).toBe(true);
  });

  it("returns false for an env-var key when the variable is missing", () => {
    delete process.env.__TEST_KEY;
    expect(isKeyConfigured("$__TEST_KEY")).toBe(false);
  });

  afterEach(() => {
    delete process.env.__TEST_KEY;
  });
});

describe("keyDisplayStatus", () => {
  it("shows a message when no key is configured", () => {
    expect(keyDisplayStatus("")).toBe("no key configured");
  });

  it("shows generic message for a literal key", () => {
    expect(keyDisplayStatus("sk-abc123")).toBe("API key configured");
  });

  it("shows (set) when the env var exists", () => {
    process.env.__TEST_KEY = "secret";
    expect(keyDisplayStatus("$__TEST_KEY")).toBe("$__TEST_KEY (set)");
  });

  it("shows (missing) when the env var is not set", () => {
    delete process.env.__TEST_KEY;
    expect(keyDisplayStatus("$__TEST_KEY")).toBe("$__TEST_KEY (missing)");
  });

  afterEach(() => {
    delete process.env.__TEST_KEY;
  });
});
