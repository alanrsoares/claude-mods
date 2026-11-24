# headroom-hud

HUD above the prompt (and docked side pane) showing model/effort, context usage, session cost, and [headroom](https://github.com/chopratejas/headroom) proxy savings.

## What it shows

- **Band above the prompt**: active model and effort level, context gauge, session cost, headroom proxy savings and version (wrapping onto two rows before dropping details), and a `[compact]` button tinted to the context gauge's color.
- **Animations**: while a turn runs, `◈` cycles through Claude Code's spinner (`·✢✳✶✻✶✳✢`) and a comet sweeps across the context gauge. At ≥75% context or while a compaction is queued, the `%` and `[compact]` breathe.
- **Proxy metrics**: `Δ` is all proxy traffic since this session started (including concurrent sessions); `Σ` is the proxy's lifetime total and cache discount.
- **Side pane**: in a fullscreen terminal with room (≥144 columns), it docks as a side pane sized to its widest line and hides the band. The pane also shows session age, a sparkline of recent main-turn costs (so context growth, cold caches, and compactions show), and the mod's own version in the bottom-right corner when there is room.
- **Update check**: toasts once per release when PyPI has a newer `headroom-ai` than the proxy runs.

## Commands & compaction

- `/hud`: show or hide the side pane at any terminal width.
- `/compact` (with no arguments) or `[compact]`: asks Haiku for the session's main topics and lets you pick which to keep before compacting.
- **Context nudge**: past 75% context, toasts once and tells the model once to queue a compaction at the next clean seam via `mcp__headroom-hud__compact`; you confirm it after the turn finishes (rearms below 50%).

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_BASE_URL` | `http://127.0.0.1:8787` | Headroom proxy URL. When the endpoint is not headroom, proxy stats are omitted from the HUD. |

## Install

```
/plugin marketplace add alanrsoares/claude-mods
/plugin install headroom-hud@alan-mods
```
