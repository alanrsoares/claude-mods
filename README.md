# claude-mods

Claude Code mods (plugins with hooks), published as one marketplace.

| | Plugin | What it does |
| --- | --- | --- |
| <img src="agent-gate/.claude-plugin/icon.png" alt="" width="28" /> | [`agent-gate`](agent-gate/README.md) | Prompts for permission before every `Agent` (subagent) call. |
| <img src="bash-tidy/.claude-plugin/icon.png" alt="" width="28" /> | [`bash-tidy`](bash-tidy/README.md) | Strips redundant `cd`; asks before lone `cat`/`grep`/`sed -i`. |
| <img src="headroom-hud/.claude-plugin/icon.png" alt="" width="28" /> | [`headroom-hud`](headroom-hud/README.md) | Context gauge, cost, headroom proxy savings, `/hud`, and guided `/compact`. |
| <img src="laya-router/.claude-plugin/icon.png" alt="" width="28" /> | [`laya-router`](laya-router/README.md) | Rates prompts via `laya-serve` to fill `Agent` tiers, lower effort, or route Opus turns. |
| <img src="verify-gate/.claude-plugin/icon.png" alt="" width="28" /> | [`verify-gate`](verify-gate/README.md) | Asks before shipping unverified edits and warns at turn end. |

## Install

```
/plugin marketplace add alanrsoares/claude-mods
/plugin install headroom-hud@alan-mods
```

Or pre-seed `~/.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": { "alan-mods": { "source": { "source": "github", "repo": "alanrsoares/claude-mods" } } },
  "enabledPlugins": { "headroom-hud@alan-mods": true }
}
```

<details>
<summary>Self-setup prompt (paste into Claude Code)</summary>

```text
Set up github.com/alanrsoares/claude-mods for me:
1. Read README.md and ask which plugins from the table I want.
2. Read each chosen plugin's README.md for prerequisites and env vars.
3. Add marketplace "alan-mods" (github: alanrsoares/claude-mods) to extraKnownMarketplaces and enable each "<name>@alan-mods" in enabledPlugins in ~/.claude/settings.json.
4. Check external services required by chosen plugins (e.g. headroom proxy, laya-serve); ask before installing anything.
5. Show proposed changes (including removing duplicate settings hooks) before editing, then tell me to run /reload-plugins or restart if env changed.
```

</details>

## Develop

- Load local mods via `CLAUDE_CODE_PLUGIN_DIRS` (colon-separated) in `settings.json` `env`; don't also install them from the marketplace.
- Reload in-session with `/reload-plugins`.
- Check: `bun run check` (typechecks and validates all mods; requires Claude Code-generated `.claude-plugin/types/tsconfig.json` per mod) · `claude plugin validate <mod>` · `claude plugin test <mod>`.
- Enable pre-commit check: `git config core.hooksPath .githooks`.
- Adding a mod updates: `package.json`, `.claude-plugin/marketplace.json`, `release-please-config.json`, `.release-please-manifest.json`, `README.md`, and `<mod>/README.md`.
- Versioning is automated by release-please from Conventional Commits (bumps `plugin.json`, `marketplace.json`, `CHANGELOG.md`, and tags `<mod>-v<version>`).

## Licence

[MIT](LICENSE)
