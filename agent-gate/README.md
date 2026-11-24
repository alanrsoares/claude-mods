# agent-gate

Sends every `Agent` (subagent) tool call to the permission decider (`decision: 'ask'`) instead of running it unasked.

## What it does

- Intercepts `tool.check` for the `Agent` tool and requires explicit approval before a subagent spawns, prompting the model to state what each subagent would do first.
- Fails closed: if the hook encounters an error, it still returns `decision: 'ask'` rather than allowing the call through.

## Install

```
/plugin marketplace add alanrsoares/claude-mods
/plugin install agent-gate@alan-mods
```
