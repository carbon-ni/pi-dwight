# pi-dwight — Multi-Account manager

<img width="154" height="129" alt="dwight" src="https://github.com/user-attachments/assets/7dc5edf1-4bc5-443d-8dd5-467e119fc0be" align="left" />

Manage multiple provider accounts and model aliases for [pi](https://pi.dev).

Each account gets its own OAuth login. Aliases let you start sessions with a short name instead of picking provider + model every time.

</br>

## Setup

No config needed — just start using the commands. State is persisted to `~/.pi/agent/multi-account.json`.

## Commands

### Account Management

```
/multi-account add <provider> <id>       Register a new account
/multi-account list                      List all accounts
/multi-account remove <provider> <id>    Remove an account
/multi-account show <provider> <id>      Show account details
/multi-account quotas                    Open a quota overview popup
```

**Quick start:**
```
/multi-account add openai personal
/login openai-personal
/model → openai-personal/gpt-5.5, etc.
```

Provider names follow the pattern `{provider}-{id}` (e.g., `openai-personal`, `openai-work`).

### Quota overview

Run `/multi-account quotas` or press `F6` to open a compact popup immediately while it fetches every configured account concurrently. Press `F6`, `Esc`, or `Enter` to close it. Failed or unsupported quota lookups remain visible with the returned error.

### Automatic rate-limit fallback

When active account returns HTTP `429`, Dwight keeps same model and switches to account whose remaining quota expires fastest. Accounts already rate-limited during current agent run are skipped, preventing loops.

Cross-model or cross-provider switching only happens inside explicit equivalence groups in `~/.pi/agent/multi-account.json`:

```json
{
  "fallbackGroups": [
    {
      "name": "coding-high",
      "models": [
        { "provider": "openai-personal", "model": "gpt-5.4" },
        { "provider": "openai-work", "model": "gpt-5.4" },
        { "provider": "anthropic-personal", "model": "claude-opus-4-6" }
      ]
    }
  ]
}
```

Only put equivalent quality levels in same group. Quota pressure chooses best usable account; listed order breaks ties. Exhausted, unavailable, unauthenticated, and already rate-limited routes are skipped. Without matching group, Dwight never changes model family automatically.

For sessions larger than preferred fallback model, configure context-aware handoff:

```json
{
  "fallback": {
    "contextPolicy": "compact",
    "contextReservePercent": 15,
    "summarizerModels": [
      { "provider": "deepseek", "model": "deepseek-v4-pro" },
      { "provider": "openrouter", "model": "deepseek/deepseek-v4-pro" }
    ]
  }
}
```

- `fit-only` skips candidates that cannot hold current context plus configured reserve.
- `compact` first retries on fitting large-context equivalent or summarizer route. After successful turn, bridge model compacts session and switches to preferred smaller model.
- Summarizer routes are tried only as context bridges; unavailable routes are skipped.

### Aliases

Short names that point to any provider + model. No validation — just name it and use it.

```
/multi-account alias-add <name> <provider> <model>    Create an alias
/multi-account alias-list                              List all aliases
/multi-account alias-remove <name>                     Remove an alias
```

**Example:**
```
/multi-account alias-add my-fav openai-personal gpt-5.5
/multi-account alias-add fast openai-work gpt-5.4
/multi-account alias-list
  a/my-fav → openai-personal/gpt-5.5
  a/fast → openai-work/gpt-5.4
```

**Then use it:**
```
pi --model a/my-fav
# or inside a session:
/model a/my-fav
```

Aliases register as providers named `a/<name>`. If the underlying provider + model exists at load time, the alias activates. If not, it's silently skipped.

### Project default models

Set project-local model candidates in `.pi/dwight.json`. When you run `pi` without `--model`/`-m`, Dwight applies the first available model with credentials on session start. Project config is only read when the project is trusted.

```json
{
  "defaultModels": [
    { "provider": "openrouter", "model": "anthropic/claude-sonnet-4.5" },
    { "provider": "anthropic", "model": "claude-sonnet-4-5" }
  ]
}
```

Single-model shorthand is also supported:

```json
{
  "defaultModel": { "provider": "openai-personal", "model": "gpt-5.5" }
}
```

### Visibility

Control which providers and models appear in your model list.

```
/multi-account disable-provider     Hide all models from a provider
/multi-account enable-provider      Re-enable a hidden provider
/multi-account disable-model        Hide a specific model
/multi-account enable-model         Re-enable a hidden model
/multi-account visibility           Show current visibility rules
```

## Supported Providers

| Provider | API | Auth |
|----------|-----|------|
| OpenAI (Codex) | `openai-codex-responses` | OAuth |

Add new providers in `src/domain/providers.ts`.

## Architecture

```
index.ts                    Entry — commands, provider registration
src/
  domain/
    providers.ts            Provider type definitions + models
    visibility.ts           Visibility filtering engine
  lib/
    visibility-format.ts    Display formatting
    quota-overview.ts       Quota overview formatting
  infra/
    config.ts               Config persistence (accounts, visibility, aliases)
    alias.ts                Alias CRUD
    visibility-ui.ts        Interactive picker UI
    quotas.ts               Provider quota fetching
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed module boundaries and data flow.

## Development

```sh
make check    # lint + typecheck + test (run before every commit)
make test     # vitest
make lint     # eslint
make typecheck
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for conventions and contribution guidelines.
