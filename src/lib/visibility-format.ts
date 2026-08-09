interface VisibilityRules {
  disabledProviders: string[];
  disabledModels: Array<{ provider: string; model: string }>;
}

export function formatVisibilityRules(config: VisibilityRules): string {
  const lines: string[] = [];

  if (config.disabledProviders.length > 0) {
    lines.push("Disabled providers:");
    for (const provider of [...config.disabledProviders].sort()) {
      lines.push(`  - ${provider}`);
    }
  }

  if (config.disabledModels.length > 0) {
    lines.push("Disabled models:");
    for (const entry of [...config.disabledModels].sort((a, b) => {
      const left = `${a.provider} / ${a.model}`;
      const right = `${b.provider} / ${b.model}`;
      return left.localeCompare(right);
    })) {
      lines.push(`  - ${entry.provider} / ${entry.model}`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : "No disabled providers or models.";
}
