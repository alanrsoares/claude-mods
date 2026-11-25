# verify-gate

Gates shipping commands while edited code is unverified, and warns at turn end.

- Marks the session unverified on `Edit`, `Write`, or `NotebookEdit` matching `watch`.
- Clears unverified when a `Bash` command matching `check` exits `0`.
- Asks (`decision: 'ask'`) before a `Bash` command matching `ship` while unverified, unless the command matches `<check> && <ship>` (regex match, not shell-parsed).
- Appends a one-time warning when a turn ends with unverified edits.

## Config (`/config`)

Exact default regexes live in [plugin.json](.claude-plugin/plugin.json).

| Key | Matches |
| --- | --- |
| `watch` | Common source and config file extensions. |
| `check` | `bun`/`npm`/`pnpm`/`yarn` check/test/lint/typecheck/verify, `cargo`, `go`, `pytest`, `make`. |
| `ship` | `git commit`, `gh pr create`. |

## Install

```
/plugin marketplace add alanrsoares/claude-mods
/plugin install verify-gate@alan-mods
```
