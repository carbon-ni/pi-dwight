# Development Guide — pi-dwight (multi-account)

## Quick Start

```sh
make check         # lint + typecheck + test
```

## Lifecycle

| Stage       | Command           | What it does                           |
|-------------|-------------------|----------------------------------------|
| Develop     | `make test`       | Run all tests (vitest)                 |
| Lint        | `make lint`       | ESLint on all `.ts` files              |
| Type check  | `make typecheck`  | `tsc --noEmit`                         |
| Pre-commit  | `make check`      | All of the above                       |
| Clean       | `make clean`      | Remove `dist/`, `coverage/`, `.tmp/`   |

## Project Structure

```
pi-dwight/
  index.ts                  Extension entry — commands, provider registration
  src/
    domain/
      providers.ts          Provider type definitions (OpenAI, models)
      providers.test.ts
      visibility.ts         Visibility filtering engine (registry patching)
      visibility.test.ts
    lib/
      visibility-format.ts  Display formatting for visibility rules
      visibility-format.test.ts
    infra/
      config.ts             Config file CRUD (accounts, disabled models/providers)
      config.test.ts
      visibility-ui.ts      Interactive UI pickers for enable/disable
      visibility-ui.test.ts
      visibility-registry.test.ts
    fixtures/               Test fixtures (empty)
  docs/
    ARCHITECTURE.md         High-level architecture overview
```

## Testing

- **Runner**: vitest
- **Pattern**: co-located `*.test.ts` next to source files
- **All tests deterministic** — use `mkdtempSync` for temp config dirs, mock UI

```sh
make test                          # single run
npx vitest --watch                 # watch mode
npx vitest run src/domain          # specific folder
```

## Quality Gates (non-negotiable)

1. `make lint` must pass — zero errors
2. `make typecheck` must pass — strict mode
3. `make test` must pass — all tests green
4. `make check` runs all three before every commit

## Anti-patterns (DO NOT)

- **DO NOT** skip `make check` before pushing
- **DO NOT** add external deps to domain code (providers, visibility)
- **DO NOT** mock what you own — only mock pi SDK interfaces
- **DO NOT** leave `console.log` in committed code
- **DO NOT** duplicate types — import from source

## Error Recovery

| Problem                  | Fix                                   |
|--------------------------|---------------------------------------|
| Tests fail               | `make test` → read output → fix       |
| Type errors              | `make typecheck` → fix types          |
| Lint errors              | `make lint` → fix or suppress inline  |
| Stale state              | `make clean && make check`            |

## Adding a New Provider

1. Add type def to `PROVIDER_TYPES` in `src/domain/providers.ts`
2. Add tests in `src/domain/providers.test.ts`
3. Run `make check`
4. Commit with message: `feat: add <provider> provider`

## Commit Convention

- `feat:` new feature
- `fix:` bug fix
- `refactor:` structure change, no behavior change
- `test:` test additions/changes
- `chore:` config, tooling, guardrails
