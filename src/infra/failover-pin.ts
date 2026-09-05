import type { FailoverDiagnostic, SuppressionTrigger } from "./failover-diagnostics.js";

/**
 * Session-scoped auto-failover switch.
 *
 * In-memory only: a new/switched session (`session_start`) resets it to the
 * default (enabled). Manual switching is unaffected — this only gates the
 * automatic triggers (quota-threshold, 429 reactive failover).
 */
export interface FailoverPin {
  disable(): void;
  enable(): void;
  isDisabled(): boolean;
  /** Back to default (enabled); called on `session_start`. */
  reset(): void;
}

export function createFailoverPin(): FailoverPin {
  let disabled = false;
  return {
    disable: () => {
      disabled = true;
    },
    enable: () => {
      disabled = false;
    },
    isDisabled: () => disabled,
    reset: () => {
      disabled = false;
    },
  };
}

export interface SuppressionRecorderDeps {
  diagnostics: { record(event: FailoverDiagnostic): Promise<void> };
}

export interface SuppressionUi {
  notify(message: string, level?: "info" | "warning" | "error"): void;
}

export interface SuppressionRecorder {
  /**
   * Record a diagnostics event for every suppressed trigger (AC3) and notify
   * the user once per provider per session (dedupe mirrors
   * `rateLimitedProviders` in index.ts).
   */
  recordSuppressed(ui: SuppressionUi, provider: string, trigger: SuppressionTrigger): void;
  /** Session reset: allow notifications again. */
  reset(): void;
}

export function createSuppressionRecorder(deps: SuppressionRecorderDeps): SuppressionRecorder {
  const notifiedProviders = new Set<string>();
  return {
    recordSuppressed(ui, provider, trigger) {
      void deps.diagnostics.record({ event: "fallback-suppressed", provider, trigger });
      if (notifiedProviders.has(provider)) return;
      notifiedProviders.add(provider);
      ui.notify(
        `Auto-failover is off: suppressed ${trigger === "rate-limit" ? "429" : "quota-threshold"} failover for ${provider}.\n` +
          "Re-enable with /multi-account failover on",
        "warning",
      );
    },
    reset: () => {
      notifiedProviders.clear();
    },
  };
}
