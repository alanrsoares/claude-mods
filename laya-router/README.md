# laya-router

Rates each prompt with a local [laya](https://huggingface.co/convaiinnovations/laya) server (`laya-serve`) for difficulty, domain, and sensitivity (money, legal, medical or safety prompts move up one tier).

## What it does

- **Status line**: shows difficulty, domain, the model and effort the main turn runs at, and the tier `Agent` calls get. Adds nothing to the prompt.
- **Agent fills**: an `Agent` call that names no model (generic types only: unset, `general-purpose`, or `claude`; never a fork or typed agent) gets the tier's model and effort (`sonnet high`, `opus medium`, or `opus high`).
- **Logging & `/laya`**: logs each rated main turn with cost (steps, output tokens, duration, aborts, agent fills) and laya latency. `/laya` reports the spread, correlation between difficulty and cost, applied vs. holdout arms, easy turns (`difficulty < 1.5`) in each, and estimated easy turns per arm needed to detect a 50% or 30% cut.
- **Fallback**: without a reachable `laya-serve`, prompts pass through unchanged.

## Config (`/config`)

| Option | Key | Default | What it does |
| --- | --- | --- | --- |
| Route the main loop | `route` | `false` | Sends an easy turn of an Opus session to Sonnet (requires Claude Code `>= 2.1.309`). Each switch rewrites the other model's prompt cache. |
| Route only up to this many messages | `routeMaxMessages` | `40` | Stops routing past this message count to avoid rewriting a large cache. |
| Lower effort on easy turns | `lowerEffort` | `false` | Lowers main-loop effort (down only) to `medium` on easy turns (`difficulty < 1.5`) and `low` on trivial turns (`difficulty < 1.0`) or easy chitchat. Acts only when `CLAUDE_CODE_MODEL_CAPABILITIES` contains `per_turn_effort`, so no prompt cache is rewritten. |
| Holdout share | `holdout` | `0` | Share of rated prompts (`0`–`1`) run as if laya were off (no Agent fill, route, or lower effort). Set `0.5` to A/B test. Exception: a prompt submitted mid-turn does not change the running turn's holdout decision, though a later `Agent` fill in an applied turn uses the latest prompt's rating. |

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `LAYA_URL` | `http://127.0.0.1:8765` | Local `laya-serve` base URL. |
| `LAYA_TIMEOUT_MS` | `2500` | Request timeout in milliseconds. |
| `CLAUDE_CODE_MODEL_CAPABILITIES` | — | Must include `per_turn_effort` for `lowerEffort` to act. |

## Prerequisites (`laya-serve`)

Install with [uv](https://docs.astral.sh/uv/) and run:

```sh
uv tool install 'laya[mcp]' --with fastapi --with uvicorn
LAYA_HOST=127.0.0.1 LAYA_PORT=8765 LAYA_MODELS=english laya-serve
```

Set `LAYA_DEVICE` (`mps`, `cuda` or `cpu`) to pick the device.

## Install

```
/plugin marketplace add alanrsoares/claude-mods
/plugin install laya-router@alan-mods
```
