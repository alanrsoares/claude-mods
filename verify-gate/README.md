# verify-gate

Asks before shipping while edited code has not passed a check command since its last edit, and appends a warning at the end of a turn that left code unverified.

## What it does

- Tracks `Edit`, `Write`, and `NotebookEdit` calls matching the watched-paths regex.
- Clears the unverified flag when a `Bash` command matching the check-commands regex exits `0`.
- Prompts for permission (`decision: 'ask'`) before a `Bash` command matching the ship-commands regex while unverified, unless the same command runs `<check> && <ship>` first.
- Appends a one-time warning to the end of a turn that edited watched files without a passing check.

## Config (`/config`)

| Option | Key | Default |
| --- | --- | --- |
| Watched paths | `watch` | `\.(c\|cc\|cpp\|cs\|css\|go\|h\|hpp\|java\|jsx?\|json\|kt\|mjs\|cjs\|py\|rb\|rs\|scss\|sql\|svelte\|swift\|tsx?\|vue\|ya?ml\|toml)$` |
| Check commands | `check` | `\b(bun\|npm\|pnpm\|yarn)\s+(run\s+)?(check\|test\|lint\|typecheck\|verify)\b\|\bcargo\s+(test\|check\|clippy)\b\|\bgo\s+(test\|vet)\b\|\bpytest\b\|\bmake\s+(check\|test)\b` |
| Ship commands | `ship` | `\bgit\s+commit\b\|\bgh\s+pr\s+create\b` |

## Install

```
/plugin marketplace add alanrsoares/claude-mods
/plugin install verify-gate@alan-mods
```
