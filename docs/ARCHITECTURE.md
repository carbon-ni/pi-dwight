# Architecture — pi-dwight (multi-account)

## Overview

Pi extension that manages multiple OpenAI subscription accounts (ChatGPT Plus/Pro/Codex).
Each account registers as a separate pi provider with its own OAuth credentials.

## Module Boundaries

```
index.ts (entry)
  ├── src/domain/providers.ts        Provider type definitions (pure data)
  ├── src/domain/visibility.ts       Visibility filtering engine
  │     └── src/infra/config.ts      Reads disabled models/providers
  ├── src/lib/visibility-format.ts   Display formatting
  │     └── src/infra/config.ts      Reads visibility state
  └── src/infra/config.ts            Config file persistence
      src/infra/visibility-ui.ts     Interactive picker UI
          └── src/infra/config.ts    Writes disabled models/providers
```

**Dependency direction**: `index → domain/lib/infra`. Domain depends on infra (config reads).
No cross-dependencies between domain modules. No external deps in domain.

**Dependency rule**: External SDK interaction isolated in `index.ts` (entry/infra layer).
Business modules (`domain/*`, `lib/*`) have zero external deps.

## Key Design Decisions

### Config as single source of truth
All account and visibility state lives in `~/.pi/agent/multi-account.json`.
Every read/write goes through `src/infra/config.ts`. No in-memory caching.

### Registry patching for visibility
`src/domain/visibility.ts` patches `modelRegistry.getAvailable()` at runtime to filter
disabled providers/models. Baseline models are cached to allow re-enabling without
re-fetching from pi core.

### Dynamic OAuth import
`index.ts` dynamically imports OpenAI OAuth utilities from `@mariozechner/pi-ai/dist`
since they're not publicly exported. Uses path traversal to locate `node_modules`.

## External Dependencies

| Dep                          | Used in     | Purpose                     |
|------------------------------|-------------|-----------------------------|
| `@mariozechner/pi-coding-agent` | `index.ts` | Extension API, types        |
| `@mariozechner/pi-ai`        | `index.ts`  | OAuth types, internal utils |

Dev deps: `vitest`, `eslint`, `@typescript-eslint/*`, `@eslint/js`, `globals`

## Data Flow

```
User runs /multi-account add openai personal
  → index.ts handler
    → src/infra/config.ts addAccount() — persists to JSON
    → index.ts registerAccountProvider() — registers with pi

User runs /multi-account disable-model
  → index.ts handler
    → src/infra/visibility-ui.ts disableModelWithPicker() — shows picker
      → src/infra/config.ts disableModel() — persists to JSON
    → src/domain/visibility.ts applyVisibilityRules() — patches registry
      → src/infra/config.ts filterVisibleModels() — reads disabled list
```
