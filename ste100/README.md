# ste100

Asks the model (and spawned subagents) to write in ASD-STE100 Simplified Technical English, and lints each main answer in the status line.

## What it does

- Injects STE100 writing rules into the session prompt and prepends a short STE100 instruction to spawned subagents.
- Lints each completed main answer (ignoring code blocks, inline code, URLs, and paths) for sentences over 25 words (`long`), passive voice (`passive`), and paragraphs over 6 sentences (`dense`), showing `STE ✓` or `STE ⚠ ...` in the status line.

## Commands

- `/ste`: show whether STE100 mode is on or off (default: on).
- `/ste on` / `/ste off`: enable or disable STE100 mode.

## Install

```
/plugin marketplace add alanrsoares/claude-mods
/plugin install ste100@alan-mods
```
