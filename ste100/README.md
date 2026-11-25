# ste100

Enforces ASD-STE100 Simplified Technical English and lints answers in the status line.

- Injects STE100 rules into the session prompt and prepends a short STE100 note to spawned subagents.
- Lints each main answer (code exempt) for `long` (>25 words), `passive`, and `dense` (>6 sentences), showing `STE ✓` or `STE ⚠ ...` in the status line.

## Commands

- `/ste`: show current state (default: on).
- `/ste on` / `/ste off`: toggle STE100 mode.

## Install

```
/plugin marketplace add alanrsoares/claude-mods
/plugin install ste100@alan-mods
```
