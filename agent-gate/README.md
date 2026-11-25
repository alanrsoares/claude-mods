<img src=".claude-plugin/icon.png" alt="agent-gate icon" width="64" />

# agent-gate

Gates every `Agent` (subagent) tool call behind explicit permission.

- Intercepts `tool.check` on `Agent` with `decision: 'ask'`, prompting the model to state what each subagent will do first.
- Fails closed: hook errors still return `decision: 'ask'`.

## Install

```
/plugin marketplace add alanrsoares/claude-mods
/plugin install agent-gate@alan-mods
```
