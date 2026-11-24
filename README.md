# claude-mods

Claude Code mods (plugins with hooks), published as one marketplace.

| Plugin | What it does |
| --- | --- |
| [`agent-gate`](agent-gate/README.md) | Sends every `Agent` (subagent) call to the permission decider. |
| [`bash-tidy`](bash-tidy/README.md) | Drops redundant `cd`; asks before lone `cat`, `grep` or `sed -i` that Read, Grep or Edit would do. |
| [`headroom-hud`](headroom-hud/README.md) | Band above the prompt (and docked side pane) with model/effort, animated context gauge, session cost, headroom proxy savings, `/hud`, and guided `/compact`. |
| [`laya-router`](laya-router/README.md) | Rates prompts with local `laya-serve`, shows the tier in the status line, fills `Agent` calls, optionally lowers effort or routes Opus turns to Sonnet, and logs outcomes in `/laya`. |
| [`ste100`](ste100/README.md) | Asks for ASD-STE100 Simplified Technical English, lints each answer in the status line, and toggles with `/ste`. |
| [`verify-gate`](verify-gate/README.md) | Asks before `git commit` or `gh pr create` while edited files have not passed a check command, and warns at turn end. |

## Install

```
/plugin marketplace add alanrsoares/claude-mods
/plugin install headroom-hud@alan-mods
```

### Self-setup prompt

Paste this into a Claude Code session to let it set up the mods for you:

```text
Set up the claude-mods marketplace (github.com/alanrsoares/claude-mods) for me.

1. Read its README.md and each chosen plugin's README.md to learn what it does and what it needs.
2. Ask me which plugins I want: agent-gate, bash-tidy, headroom-hud, laya-router, ste100, verify-gate.
3. Add the marketplace to ~/.claude/settings.json under extraKnownMarketplaces as
   "alan-mods" (source github, repo alanrsoares/claude-mods), and set each chosen
   plugin to true in enabledPlugins as "<name>@alan-mods". Keep all other settings.
4. For headroom-hud: check that the headroom proxy answers at ANTHROPIC_BASE_URL
   (default http://127.0.0.1:8787). If it does not, tell me how to install it.
5. For laya-router: check that `curl -s http://127.0.0.1:8765/health` reports "ok".
   If it does not, show me the laya-serve steps from laya-router/README.md and ask
   before you install anything.
6. Remove any settings hook that does the same job as a chosen plugin, so the work
   does not run twice. Show me each change before you make it.
7. Tell me to run /reload-plugins, or to restart Claude Code if you changed env.
```

### Pre-seed settings

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
The `*.test.ts` files import `claude-code/testing` from those generated types and run with `bun test`
once generated.

`bun run check` typechecks and validates every mod. Run it before each commit automatically with
`git config core.hooksPath .githooks`. Adding a new mod requires updating:

- `package.json` (`typecheck` and `validate` loops)
- `.claude-plugin/marketplace.json`
- `release-please-config.json` and `.release-please-manifest.json`
- `README.md` (table and self-setup prompt) and `<mod>/README.md`

Do not bump versions by hand. Release-please opens a release PR from Conventional Commits; merging it bumps
the mod's `plugin.json` and its `marketplace.json` entry, writes `CHANGELOG.md` and tags `<mod>-v<version>`.

## Licence

[MIT](LICENSE)
