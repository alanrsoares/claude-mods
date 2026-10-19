# claude-mods

Claude Code mods (plugins with hooks), published as one marketplace.

| Plugin | What it does |
| --- | --- |
| `agent-gate` | Sends every Agent (subagent) call to the permission decider. |
| `bash-tidy` | Drops redundant `cd`; asks before `cat`/`grep`/`sed -i` that Read, Grep or Edit would do. |
| `headroom-hud` | Band above the prompt: context gauge, session cost, headroom proxy savings and version. `/compact` asks which topics to keep. Needs the [headroom](https://github.com/chopratejas/headroom) proxy; reads its address from `ANTHROPIC_BASE_URL` (default `http://127.0.0.1:8787`). |
| `ste100` | Asks for ASD-STE100 Simplified Technical English and lints each answer. |

## Custom mods

`custom/` holds mods tied to one workflow or repo layout. They are not in `marketplace.json`; load them
from a folder (see Develop).

| Mod | What it does |
| --- | --- |
| `custom/check-nudge` | Warns, and asks before `git commit` or `gh pr create`, when a turn edited `apps/web` and `bun run check` has not run. |

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

`bun run check` typechecks and validates every mod. Run it before each commit automatically with
`git config core.hooksPath .githooks`. A new mod must be added to the list in `package.json`.

Bump `version` in the mod's `plugin.json` and in `.claude-plugin/marketplace.json` for each release.

## Licence

[MIT](LICENSE)
