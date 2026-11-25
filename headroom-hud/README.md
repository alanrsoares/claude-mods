<img src=".claude-plugin/icon.png" alt="headroom-hud icon" width="64" />

# headroom-hud

HUD band above the prompt (and docked side pane) showing model/effort, context usage, session cost, and [headroom](https://github.com/chopratejas/headroom) proxy savings.

## What it shows

- **Band / side pane**: model, effort, context gauge (respecting `autoCompactWindow`, `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, and `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`), session cost, running subagents, proxy savings/version, and a `[compact]` button. Auto-docks as a side pane in fullscreen terminals `≥144` cols (adding top context categories, turns-left estimate, session age, prompt-cache warmth countdown, turn-cost sparkline, and 5h/7d rate-limit windows) and hides the band.
- **Proxy metrics**: `Δ` is proxy traffic since session start (across concurrent sessions); `Σ` is lifetime total and cache discount.
- **Update check**: toasts once per PyPI release when `headroom-ai` is newer than the running proxy.

## Commands & compaction

- `/hud`: toggle the side pane at any width.
- `/compact` (no args) or `[compact]`: asks Haiku for main session topics so you can pick what to keep before compacting.
- **Context nudge**: past 75% context, toasts once and nudges the model to queue compaction at the next clean seam via `mcp__headroom-hud__compact`; you confirm after the turn (rearms below 50%).

## Configuration

Toggle sections live in `/config` (under `headroom-hud.*`, all enabled by default):

| Option | Controls |
| --- | --- |
| `autoDock` | Auto-open side pane in fullscreen terminals `≥144` cols |
| `showCost` | Session USD cost and per-turn cost sparkline |
| `showCategories` | Top used context categories in the side pane |
| `showTurnsLeft` | Estimated turns remaining before compaction |
| `showElapsed` | Session duration (`⏱`) |
| `showCache` | Prompt-cache warmth countdown (`⛁ warm/cold`) |
| `showAgents` | Running subagents badge (`⚡`) |
| `showRateLimits` | 5h / 7d / spend rate-limit windows |
| `showProxy` | Headroom proxy savings and version |

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_BASE_URL` | `http://127.0.0.1:8787` | Headroom proxy URL. Proxy stats are omitted if the endpoint is not headroom. |

## Install

```
/plugin marketplace add alanrsoares/claude-mods
/plugin install headroom-hud@alan-mods
```
