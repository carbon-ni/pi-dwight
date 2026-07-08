export function hasExplicitModelArgument(argv: string[]): boolean {
  return argv.some((arg) => arg === "--model" || arg === "-m" || arg.startsWith("--model="));
}
