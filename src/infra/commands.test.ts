import { describe, expect, it, vi } from "vitest";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { registerMultiAccountCommand, type MultiAccountCommandDeps } from "./commands.js";
import { createFailoverPin, type FailoverPin } from "./failover-pin.js";

type Pi = Parameters<typeof registerMultiAccountCommand>[0];
type Handler = NonNullable<Parameters<Pi["registerCommand"]>[1]["handler"]>;

function createHarness(failover: MultiAccountCommandDeps["failover"]) {
  let handler: Handler | undefined;
  const pi = {
    registerCommand: (_name: string, command: { handler: Handler }) => {
      handler = command.handler;
    },
  } as unknown as Pi;

  const deps: MultiAccountCommandDeps = {
    registerAccountProvider: vi.fn(),
    registerAliasProvider: vi.fn(),
    refreshVisibility: vi.fn(),
    showQuotaOverview: vi.fn(),
    catalogModels: [],
    failover,
  };
  registerMultiAccountCommand(pi, deps);

  const notifications: Array<{ message: string; level?: string }> = [];
  const ctx = {
    ui: { notify: (message: string, level?: string) => notifications.push({ message, level }) },
  } as unknown as ExtensionCommandContext;
  return {
    run: (args: string) => handler!(args, ctx),
    notifications,
  };
}

function failoverFrom(pin: FailoverPin): MultiAccountCommandDeps["failover"] {
  return {
    disable: () => pin.disable(),
    enable: () => pin.enable(),
    isDisabled: () => pin.isDisabled(),
  };
}

describe("/multi-account failover", () => {
  it("disables auto-failover for the session and says how to re-enable", async () => {
    const pin = createFailoverPin();
    const { run, notifications } = createHarness(failoverFrom(pin));

    await run("failover off");

    expect(pin.isDisabled()).toBe(true);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain("disabled");
    expect(notifications[0].message).toContain("/multi-account failover on");
  });

  it("re-enables auto-failover in the same session", async () => {
    const pin = createFailoverPin();
    const { run, notifications } = createHarness(failoverFrom(pin));
    await run("failover off");
    notifications.length = 0;

    await run("failover on");

    expect(pin.isDisabled()).toBe(false);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain("enabled");
  });

  it("reports the current state for status", async () => {
    const pin = createFailoverPin();
    const { run, notifications } = createHarness(failoverFrom(pin));

    await run("failover status");
    expect(notifications.at(-1)?.message).toContain("enabled");

    await run("failover off");
    await run("failover status");
    expect(notifications.at(-1)?.message).toContain("disabled");
  });

  it("rejects a repeated off with no state change", async () => {
    const pin = createFailoverPin();
    const { run, notifications } = createHarness(failoverFrom(pin));
    await run("failover off");
    notifications.length = 0;

    await run("failover off");

    expect(pin.isDisabled()).toBe(true);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain("already disabled");
  });

  it("rejects a repeated on with no state change", async () => {
    const pin = createFailoverPin();
    const { run, notifications } = createHarness(failoverFrom(pin));
    notifications.length = 0;

    await run("failover on");

    expect(pin.isDisabled()).toBe(false);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain("already enabled");
  });

  it("shows usage when no argument is given", async () => {
    const pin = createFailoverPin();
    const { run, notifications } = createHarness(failoverFrom(pin));

    await run("failover");

    expect(pin.isDisabled()).toBe(false);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain("off|on|status");
  });

  it("rejects an unknown argument", async () => {
    const pin = createFailoverPin();
    const { run, notifications } = createHarness(failoverFrom(pin));

    await run("failover maybe");

    expect(pin.isDisabled()).toBe(false);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain("maybe");
  });
});
