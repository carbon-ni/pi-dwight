# Architecture — pi-dwight (multi-account)

## Overview

Pi extension that manages multiple OAuth and API-key provider accounts.
Each account registers as a separate Pi provider with its own credentials.

## Module Boundaries

```
index.ts (entry)
  ├── src/domain/                     Account and provider concepts, visibility, usage parsing
  ├── src/lib/                        Pure display formatting and quota calculations
  │     └── src/domain/
  └── src/infra/                      Persistence, provider wiring, commands, and picker flows
        ├── src/domain/
        └── src/lib/
```

**Dependency direction**: `index → infra → lib → domain` and `index → domain`.
Support modules are acyclic: domain does not import infra or lib, and lib does not import infra.
External SDK interaction stays in `index.ts` and infrastructure modules.

## Key Design Decisions

### Config as single source of truth
All account, alias, and visibility state lives in `~/.pi/agent/multi-account.json`.
Every read/write goes through `src/infra/config.ts` and `src/infra/alias.ts`. No in-memory caching.

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
  → src/infra/commands.ts handler
    → src/infra/visibility-ui.ts disableModelWithPicker() — shows picker
      → src/infra/config.ts disableModel() — persists to JSON
    → index.ts refreshVisibility() reads config and passes visibility state
      → src/domain/visibility.ts applyVisibilityRules() — patches registry
```
