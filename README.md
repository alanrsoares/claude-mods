# claude-mods

Claude Code mods (plugins with hooks), published as one marketplace.

| Plugin | What it does |
| --- | --- |
| `agent-gate` | Sends every Agent (subagent) call to the permission decider. |
| `bash-tidy` | Drops redundant `cd`; asks before `cat`/`grep`/`sed -i` that Read, Grep or Edit would do. |
| `headroom-hud` | Band above the prompt: context gauge, session cost, headroom proxy savings and version. `Δ` is all proxy traffic since this session started, other sessions' too; `Σ` is the proxy's lifetime total. In a fullscreen terminal with room (144 columns), it docks as a side pane, only as wide as its lines, and the band hides; `/hud` shows or hides the pane at any width. `/compact` asks which topics to keep. Past 75% context the model is told once to queue a compaction at the next seam (`mcp__headroom-hud__compact`); you confirm it after the turn. Needs the [headroom](https://github.com/chopratejas/headroom) proxy; reads its address from `ANTHROPIC_BASE_URL` (default `http://127.0.0.1:8787`), and leaves the proxy out of the band when that address is not headroom. |
| `laya-router` | Rates each prompt with a local [laya](https://huggingface.co/convaiinnovations/laya) server and adds one advisory line for the model: difficulty, domain and a suggested model tier. Needs `laya-serve`; reads `LAYA_URL` (default `http://127.0.0.1:8765`) and `LAYA_TIMEOUT_MS` (default `2500`). Without the server, the prompt goes through unchanged. |
| `ste100` | Asks for ASD-STE100 Simplified Technical English and lints each answer. |
| `verify-gate` | Asks before `git commit` or `gh pr create` while an edited file has not passed a check command since its last edit, and warns at the end of a turn that left code unverified. Set the watched paths, check commands and ship commands as regexes in `/config`. |

## Install

```
/plugin marketplace add alanrsoares/claude-mods
/plugin install headroom-hud@alan-mods
```

### Self-setup prompt

Paste this into a Claude Code session to let it set up the mods for you:

```text
Set up the claude-mods marketplace (github.com/alanrsoares/claude-mods) for me.

1. Read its README.md to learn what each plugin does and what it needs.
2. Ask me which plugins I want: agent-gate, bash-tidy, headroom-hud, laya-router, ste100.
3. Add the marketplace to ~/.claude/settings.json under extraKnownMarketplaces as
   "alan-mods" (source github, repo alanrsoares/claude-mods), and set each chosen
   plugin to true in enabledPlugins as "<name>@alan-mods". Keep all other settings.
4. For headroom-hud: check that the headroom proxy answers at ANTHROPIC_BASE_URL
   (default http://127.0.0.1:8787). If it does not, tell me how to install it.
5. For laya-router: check that `curl -s http://127.0.0.1:8765/health` reports "ok".
   If it does not, show me the laya-serve steps from the README and ask before you
   install anything.
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

### laya-serve

`laya-router` needs a warm `laya-serve`. Install it with [uv](https://docs.astral.sh/uv/), then run it:

```sh
uv tool install 'laya[mcp]' --with fastapi --with uvicorn
LAYA_HOST=127.0.0.1 LAYA_PORT=8765 LAYA_MODELS=english laya-serve
```

The first start downloads the checkpoint from Hugging Face. Set `LAYA_DEVICE` (`mps`, `cuda` or `cpu`)
to choose the device. To keep it running, start it from launchd or systemd.

## Develop

Load a mod from its folder with `CLAUDE_CODE_PLUGIN_DIRS` (colon-separated) in `settings.json`
`env`; do not also install it from the marketplace. Check a change with
`claude plugin validate <mod>` and `/reload-plugins`.

`tsconfig.json` extends `.claude-plugin/types/tsconfig.json`, which Claude Code generates (git-ignored).
The `*.test.ts` files import `claude-code/testing` from those generated types and do not run
without them.

`bun run check` typechecks and validates every mod. Run it before each commit automatically with
`git config core.hooksPath .githooks`. A new mod must be added to the list in `package.json`.

Do not bump versions by hand. Release-please opens a release PR from Conventional Commits; merging it bumps
the mod's `plugin.json` and its `marketplace.json` entry, writes `CHANGELOG.md` and tags `<mod>-v<version>`.

## Licence

[MIT](LICENSE)
