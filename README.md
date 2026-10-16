# claude-mods

Claude Code mods (plugins with hooks), published as one marketplace.

| Plugin | What it does |
| --- | --- |
| `agent-gate` | Sends every Agent (subagent) call to the permission decider. |
| `bash-tidy` | Drops redundant `cd`; asks before `cat`/`grep`/`sed -i` that Read, Grep or Edit would do. |
| `check-nudge` | Warns when a turn edited `apps/web` but never ran `bun run check`. Specific to one repo layout. |
| `headroom-hud` | Band above the prompt: context gauge, session cost, headroom proxy savings and version. Reads `ANTHROPIC_BASE_URL`, default `http://127.0.0.1:8787`. |
| `ste100` | Asks for ASD-STE100 Simplified Technical English and lints each answer. |

## Install

```
/plugin marketplace add alanrsoares/claude-mods
/plugin install headroom-hud@alan-mods
```

Or pre-seed `settings.json`:

```json
{
  "extraKnownMarketplaces": { "alan-mods": { "source": { "source": "github", "repo": "alanrsoares/claude-mods" } } },
  "enabledPlugins": { "headroom-hud@alan-mods": true }
}
```

## Develop

Load a mod from its folder with `CLAUDE_CODE_PLUGIN_DIRS` (colon-separated) in `settings.json`
`env`; do not also install it from the marketplace. Check a change with
`claude plugin validate <mod>` and `/reload-plugins`.

`tsconfig.json` extends `.claude-plugin/types/tsconfig.json`, which Claude Code generates (git-ignored).
The `*.test.ts` files import `claude-code/testing` from those generated types and do not run
without them.

Bump `version` in the mod's `plugin.json` and in `.claude-plugin/marketplace.json` for each release.
