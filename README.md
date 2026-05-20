# pi-dwight — Multi-Account Extension

Manage multiple provider accounts and model aliases for [pi](https://pi.dev).

Each account gets its own OAuth login. Aliases let you start sessions with a short name instead of picking provider + model every time.

## Setup

No config needed — just start using the commands. State is persisted to `~/.pi/agent/multi-account.json`.

## Commands

### Account Management

```
/multi-account add <provider> <id>       Register a new account
/multi-account list                      List all accounts
/multi-account remove <provider> <id>    Remove an account
/multi-account show <provider> <id>      Show account details
```

**Quick start:**
```
/multi-account add openai personal
/login openai-personal
/model → openai-personal/gpt-5.5, etc.
```

Provider names follow the pattern `{provider}-{id}` (e.g., `openai-personal`, `openai-work`).

### Aliases

Short names that resolve to a specific account + model. Registered as provider `a/<name>` so pi picks them up natively.

```
/multi-account alias-add <name> <account> <model>    Create an alias
/multi-account alias-list                             List all aliases
/multi-account alias-remove <name>                    Remove an alias
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
  infra/
    config.ts               Config persistence (accounts, visibility, aliases)
    alias.ts                Alias CRUD
    visibility-ui.ts        Interactive picker UI
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
