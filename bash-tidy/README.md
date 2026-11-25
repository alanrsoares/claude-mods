# bash-tidy

Cleans up `Bash` tool calls:

- Strips leading `cd <cwd> &&` or `cd <cwd>;` chains matching the session's working directory.
- Asks for permission before a lone `cat`, `grep`/`egrep`/`fgrep`, or `sed -i` / `sed --in-place` (no pipes, chains, or redirects) that `Read`, `Grep`, or `Edit` can do.

## Install

```
/plugin marketplace add alanrsoares/claude-mods
/plugin install bash-tidy@alan-mods
```
