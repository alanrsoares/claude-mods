# bash-tidy

Cleans up `Bash` tool calls:

- Strips leading `cd <cwd> &&` or `cd <cwd>;` chains that already match the session's working directory.
- Asks for permission before a lone `cat`, `grep`/`egrep`/`fgrep`, or `sed -i` / `sed --in-place` (no pipes, chains, redirects or substitutions) that `Read`, `Grep`, or `Edit` would do instead.

## Install

```
/plugin marketplace add alanrsoares/claude-mods
/plugin install bash-tidy@alan-mods
```
