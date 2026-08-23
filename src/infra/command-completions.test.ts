import { describe, expect, it } from "vitest";
import { multiAccountCompletions } from "./command-completions.js";
import type { Account } from "../domain/accounts.js";

const accounts: Account[] = [
  { provider: "openai", id: "personal", key: "" },
  { provider: "openai", id: "work", key: "" },
  { provider: "zai", id: "default", key: "$ZAI" },
];

describe("multiAccountCompletions", () => {
  it("completes subcommand names from a partial prefix", () => {
    const items = multiAccountCompletions("sw", accounts);

    expect(items).toEqual([{ value: "switch", label: "switch" }]);
  });

  it("returns null when no subcommand matches", () => {
    expect(multiAccountCompletions("xyz", accounts)).toBeNull();
  });

  it("completes subcommands without arguments", () => {
    const items = multiAccountCompletions("list", accounts);

    expect(items).toEqual([{ value: "list", label: "list" }]);
  });

  it("offers every account provider after the switch keyword", () => {
    const items = multiAccountCompletions("switch ", accounts);

    expect(items).toEqual([
      { value: "switch openai-personal", label: "openai-personal", description: "OpenAI" },
      { value: "switch openai-work", label: "openai-work", description: "OpenAI" },
      { value: "switch zai", label: "zai", description: "Z.AI" },
    ]);
  });

  it("keeps the switch keyword in the completed value", () => {
    const items = multiAccountCompletions("switch openai-", accounts);

    expect(items?.map((item) => item.value)).toEqual([
      "switch openai-personal",
      "switch openai-work",
    ]);
  });

  it("filters providers by the typed prefix", () => {
    const items = multiAccountCompletions("switch openai-w", accounts);

    expect(items?.map((item) => item.label)).toEqual(["openai-work"]);
  });

  it("returns null when no provider matches the typed prefix", () => {
    expect(multiAccountCompletions("switch openrouter", accounts)).toBeNull();
  });

  it("uses the bare provider name for default accounts", () => {
    const items = multiAccountCompletions("switch z", accounts);

    expect(items?.map((item) => item.value)).toEqual(["switch zai"]);
  });
});
