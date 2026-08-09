import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQuotaOverviewWidget } from "./quota-overview-ui.js";
import type { Account } from "../domain/accounts.js";
import type { ProviderUsageResult } from "../domain/usage-types.js";

const mockAccount: Account = {
  id: "personal",
  provider: "openrouter",
  key: "$OR_KEY",
};

const successResult: ProviderUsageResult = {
  success: true,
  items: [
    {
      kind: "balance",
      label: "Credits",
      amount: 50,
      currency: "USD",
    },
  ],
};

describe("createQuotaOverviewWidget", () => {
  let widget: ReturnType<typeof createQuotaOverviewWidget>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an object with render, invalidate, and handleInput", () => {
    widget = createQuotaOverviewWidget(      
      () => Promise.resolve([{ account: mockAccount, result: successResult }]),
      () => [{ account: "openrouter-personal", status: "Credits: $50.00", severity: "success" }],
    );

    const tui = { requestRender: vi.fn() };
    const theme = { fg: (c: string, t: string) => t, bold: (t: string) => t, dim: (t: string) => t };
    const done = vi.fn();

    const result = widget(tui as never, theme, vi.fn(), done);

    expect(result).toHaveProperty("render");
    expect(result).toHaveProperty("invalidate");
    expect(result).toHaveProperty("handleInput");
    expect(typeof result.render).toBe("function");
    expect(typeof result.invalidate).toBe("function");
    expect(typeof result.handleInput).toBe("function");
  });

  it("shows overview when fetch succeeds before closure", async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve([{ account: mockAccount, result: successResult }]),
    );
    const buildFn = vi.fn(() => [
      { account: "openrouter-personal", status: "Credits: $50.00", severity: "success" as const },
    ]);

    widget = createQuotaOverviewWidget(fetchFn, buildFn);

    const tui = { requestRender: vi.fn() };
    const theme = {
      fg: vi.fn((_c: string, t: string) => t),
      bold: vi.fn((t: string) => t),
      dim: vi.fn((t: string) => t),
    };
    const done = vi.fn();

    widget(tui as never, theme, vi.fn(), done);

    await vi.waitFor(() => {
      expect(buildFn).toHaveBeenCalled();
    });

    expect(tui.requestRender).toHaveBeenCalled();
  });

  it("adds a use-first marker without changing quota details", async () => {
    const buildFn = vi.fn(() => [
      {
        account: "openai-personal",
        status: "5h [█████░░░░░] 50% (1d)",
        severity: "warning" as const,
        priority: "50% left / 24h = 2.08%/h",
        recommended: true as const,
      },
    ]);
    widget = createQuotaOverviewWidget(
      () => Promise.resolve([{ account: mockAccount, result: successResult }]),
      buildFn,
    );
    const tui = { requestRender: vi.fn() };
    const theme = {
      fg: vi.fn((_c: string, text: string) => text),
      bold: vi.fn((text: string) => text),
      dim: vi.fn((text: string) => text),
    };

    widget(tui as never, theme, vi.fn(), vi.fn());

    await vi.waitFor(() => {
      expect(theme.fg).toHaveBeenCalledWith("accent", "★ use first");
      expect(theme.fg).toHaveBeenCalledWith("dim", "50% left / 24h = 2.08%/h");
      expect(theme.fg).toHaveBeenCalledWith("warning", "5h [█████░░░░░] 50% (1d)");
    });
  });

  it("shows error when fetch fails", async () => {
    const fetchFn = vi.fn(() =>
      Promise.reject(new Error("boom")),
    );
    const buildFn = vi.fn();

    widget = createQuotaOverviewWidget(fetchFn, buildFn);

    const tui = { requestRender: vi.fn() };
    const theme = {
      fg: vi.fn((_c: string, t: string) => t),
      bold: vi.fn((t: string) => t),
      dim: vi.fn((t: string) => t),
    };
    const done = vi.fn();

    widget(tui as never, theme, vi.fn(), done);

    await vi.waitFor(() => {
      expect(tui.requestRender).toHaveBeenCalled();
    });

    // Widget should be closed after error render
    expect(done).not.toHaveBeenCalled();
  });

  it("closes on escape key", () => {
    widget = createQuotaOverviewWidget(      
      () => new Promise(() => {}),
      () => [],
    );

    const tui = { requestRender: vi.fn() };
    const theme = { fg: (c: string, t: string) => t, bold: (t: string) => t, dim: (t: string) => t };
    const done = vi.fn();

    const result = widget(tui as never, theme, vi.fn(), done);

    // Simulate escape key
    result.handleInput("\x1b");
    expect(done).toHaveBeenCalled();
  });

  it("closes on enter key", () => {
    widget = createQuotaOverviewWidget(      
      () => new Promise(() => {}),
      () => [],
    );

    const tui = { requestRender: vi.fn() };
    const theme = { fg: (c: string, t: string) => t, bold: (t: string) => t, dim: (t: string) => t };
    const done = vi.fn();

    const result = widget(tui as never, theme, vi.fn(), done);

    // Simulate enter key
    result.handleInput("\r");
    expect(done).toHaveBeenCalled();
  });
});
