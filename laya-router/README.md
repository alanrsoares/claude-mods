<img src=".claude-plugin/icon.png" alt="laya-router icon" width="64" />

# laya-router

Rates each prompt via a local [laya](https://huggingface.co/convaiinnovations/laya) server (`laya-serve`) for difficulty, domain, and sensitivity (money, legal, medical, or safety moves up one tier).

## What it does

- **Status line**: shows difficulty, domain, main-turn model/effort, and `Agent` tier. Adds nothing to the prompt.
- **Agent fills**: sets model and effort (`sonnet high`, `opus medium`, or `opus high`) on generic `Agent` calls (`unset`, `general-purpose`, or `claude`) that omit a model.
- **Logging & `/laya`**: logs rated main turns with cost (steps, output tokens, duration, aborts, agent fills) and latency. `/laya` reports difficulty/cost correlation, applied vs. holdout arms, and sample-size estimates.
- **Fallback**: passes prompts through unchanged if `laya-serve` is unreachable.

## Config (`/config`)

| Key | Default | Effect |
| --- | --- | --- |
| `route` | `false` | Routes easy Opus turns to Sonnet (requires Claude Code `>= 2.1.309`). Rewrites prompt cache on switch. |
| `routeMaxMessages` | `40` | Stops routing past this message count to avoid rewriting a large cache. |
| `lowerEffort` | `false` | Lowers main-loop effort (down only) to `medium` (`difficulty < 1.5`) or `low` (`< 1.0` / easy chitchat). Requires `per_turn_effort` capability (no cache rewrite). |
| `holdout` | `0` | Fraction (`0`–`1`) of prompts run untouched for A/B testing (e.g. `0.5`). Mid-turn prompts keep the running turn's arm. |

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `LAYA_URL` | `http://127.0.0.1:8765` | Local `laya-serve` base URL. |
| `LAYA_TIMEOUT_MS` | `2500` | Request timeout (ms). |
| `CLAUDE_CODE_MODEL_CAPABILITIES` | — | Must include `per_turn_effort` for `lowerEffort`. |

## Prerequisites (`laya-serve`)

Install with [uv](https://docs.astral.sh/uv/) and run (set `LAYA_DEVICE` to `mps`, `cuda`, or `cpu` if needed):

```sh
uv tool install 'laya[mcp]' --with fastapi --with uvicorn
LAYA_HOST=127.0.0.1 LAYA_PORT=8765 LAYA_MODELS=english laya-serve
```

## Install

```
/plugin marketplace add alanrsoares/claude-mods
/plugin install laya-router@alan-mods
```
