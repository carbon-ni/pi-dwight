import { describe, expect, it, vi } from "vitest";
import { createFailoverPin, createSuppressionRecorder } from "./failover-pin.js";

describe("createFailoverPin", () => {
  it("starts with auto-failover enabled", () => {
    expect(createFailoverPin().isDisabled()).toBe(false);
  });

  it("disables auto-failover for the session", () => {
    const pin = createFailoverPin();
    pin.disable();
    expect(pin.isDisabled()).toBe(true);
  });

  it("re-enables auto-failover in the same session", () => {
    const pin = createFailoverPin();
    pin.disable();
    pin.enable();
    expect(pin.isDisabled()).toBe(false);
  });

  it("resets to enabled on a new session", () => {
    const pin = createFailoverPin();
    pin.disable();
    pin.reset();
    expect(pin.isDisabled()).toBe(false);
  });
});

describe("createSuppressionRecorder", () => {
  const makeDeps = () => ({ diagnostics: { record: vi.fn().mockResolvedValue(undefined) } });
  const makeUi = () => ({ notify: vi.fn() });

  it("records a fallback-suppressed diagnostics event for every suppressed trigger", () => {
    const { diagnostics } = makeDeps();
    const recorder = createSuppressionRecorder({ diagnostics });
    const ui = makeUi();

    recorder.recordSuppressed(ui, "openai-personal", "quota-threshold");
    recorder.recordSuppressed(ui, "openai-personal", "quota-threshold");

    expect(diagnostics.record).toHaveBeenCalledTimes(2);
    expect(diagnostics.record).toHaveBeenCalledWith({
      event: "fallback-suppressed",
      provider: "openai-personal",
      trigger: "quota-threshold",
    });
  });

  it("notifies the user only once per provider", () => {
    const recorder = createSuppressionRecorder(makeDeps());
    const ui = makeUi();

    recorder.recordSuppressed(ui, "zai", "rate-limit");
    recorder.recordSuppressed(ui, "zai", "rate-limit");

    expect(ui.notify).toHaveBeenCalledTimes(1);
    expect(ui.notify.mock.calls[0][0]).toContain("/multi-account failover on");
  });

  it("notifies each suppressed provider independently", () => {
    const recorder = createSuppressionRecorder(makeDeps());
    const ui = makeUi();

    recorder.recordSuppressed(ui, "zai", "rate-limit");
    recorder.recordSuppressed(ui, "openai-personal", "quota-threshold");

    expect(ui.notify).toHaveBeenCalledTimes(2);
  });

  it("notifies again after a session reset", () => {
    const recorder = createSuppressionRecorder(makeDeps());
    const ui = makeUi();

    recorder.recordSuppressed(ui, "zai", "rate-limit");
    recorder.reset();
    recorder.recordSuppressed(ui, "zai", "rate-limit");

    expect(ui.notify).toHaveBeenCalledTimes(2);
  });
});
