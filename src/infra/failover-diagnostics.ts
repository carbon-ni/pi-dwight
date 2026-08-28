type FailoverDiagnostic = {
  event: "quota-check" | "http-429" | "fallback-selected" | "fallback-unavailable" | "fallback-blocked";
  provider: string;
  outcome?: "available" | "exhausted" | "unavailable" | "unmanaged";
  target?: string;
};

type Append = (path: string, data: string, encoding: "utf8") => Promise<void>;

export function createFailoverDiagnostics(path: string, append: Append) {
  return {
    async record(event: FailoverDiagnostic): Promise<void> {
      const line = JSON.stringify({ timestamp: new Date().toISOString(), ...event }) + "\n";
      await append(path, line, "utf8").catch(() => undefined);
    },
  };
}

export type { FailoverDiagnostic };
