## Profile
- Purpose: Claude Code control center: a status line script and a function-hooks mod in the SLAB design language
- Stage: pre-release (repository standard 2026-10-17)
- Gate: `scripts/gate` (CI job `gate`)
- Landing: direct to main after a green gate; agents land: yes
- Release: none; agents release: no
- Outside issues and PRs: agents triage; outside PRs merge: owner approves

No deliberate deviations from the standard.

## Map
- `statusline-slab.sh`: Claude Code's status line slot; `tests/statusline.sh` checks it.
- `mod/slab-deck/`: the mod. `hooks/register.tsx` (events, timers, commands, every `$` call), `hooks/views.tsx`
  (band, deck, popups), `hooks/ink.ts` (design tokens, painters), `hooks/data.ts` (git and tmux parsers),
  `types/index.d.ts` (the `$.state` contract), `tests/deck.test.tsx`.
- `scripts/gate`: the gate. `package.json` and `package-lock.json` only lock its tools (Claude Code, secretlint).
- `.githooks/pre-push` runs the gate; `.agents/setup` prepares an orb; `docs/` holds the README screenshots.

## Landing
1. `git fetch origin && git rebase origin/main`
2. `scripts/gate` (the pre-push hook runs it too; enable once with `git config core.hooksPath .githooks`)
3. `git push origin HEAD:main`; if rejected, repeat from 1.
4. Record user-visible changes under `## [Unreleased]` in `CHANGELOG.md`.

Use a PR instead, squash-merged on a green `gate`, for public-interface changes (settings keys, environment
variables, slash commands, the providers JSON shape, `types/index.d.ts`), CI or release configuration, work
spanning several sessions, and anything another person sends. CI and public-interface PRs get an independent
review before merge. Commit subjects follow Conventional Commits; public commits use the author's GitHub
noreply address.

## Rules
- No live tests. Never start a Claude Code session (`claude`, `claude -p`) to try the mod: it spends the
  owner's quota, and orbs may carry `CLAUDE_CODE_OAUTH_TOKEN`. The gate runs Claude Code only for
  `plugin validate` and `plugin test`, under `env -i` with a throwaway `HOME`.
- The engine follows `$` calls only within one file: keep every `$` call in `hooks/register.tsx`.
- SLAB: hue only on glyphs and outcome markers, and no box-drawing characters in any drawing (a test enforces it).
- The tmux actions only select, open or split; never add one that closes, kills or types into another pane.
- `statusline-slab.sh` runs every refresh: no subshell per colour or per fact, and on Linux keep its quota
  refresher as it is (one subshell for the cache age, `flock`, a 0600 cache, the last reading kept on bad output).
- The gate has no type check: `tsconfig.json` extends `.claude-plugin/types/tsconfig.json`, which Claude Code
  generates when it loads the mod, and neither `plugin validate` nor `plugin test` produces it.

## Focused tests
- Mod: `env -i PATH="$PATH" HOME="$(mktemp -d)" node_modules/.bin/claude plugin test mod/slab-deck`
- Statusline: `tests/statusline.sh`
