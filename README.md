# slab-deck

A control center for [Claude Code](https://claude.com/claude-code), built as a mod on its function-hooks
plugin API (Claude Code 2.1.289 or newer). It replaces the one-line status line with a live band above the
prompt, a docked deck pane, popups and tmux navigation, all in the SLAB design language: dark surfaces,
hue only on glyphs and outcome markers (`› ▸ ✓ ✗ ! · ↳ ▪`), no box drawing, one motion.

## What it shows

**Band above the prompt**
- Statusline row: model, repo and branch, effort, gauges for context and the 5h / 7d rate-limit windows
  (amber from 70 %, red from 90 %), output-per-turn sparkline, session clock, `+N −N`. Hover a fact for details.
- Second row: while a turn runs, a ▪▪▪ working indicator with elapsed time, step, tokens, tok/s and running
  tools; when idle, your tmux windows as links (`1`–`9`) and actions (`d` deck, `n` window, `s` split, `h` keys).

**Deck pane** — `/deck [section]`
| section | contents |
| --- | --- |
| overview | session facts, context, rate limits and resets, output per turn, recent tool calls |
| context | the `/context` grid, categories, autocompact mark, memory files |
| tools | calls by tool, 30-minute timeline, recent calls |
| agents | subagents and their status |
| git | changed files with diff bars, commits, history graph in a new tmux window |
| tmux | all panes of the session: live peek, window minimap, go there, new window, split, zoom |
| usage | rate limits, token totals, cache hit, turn durations |

**Popups** for a tool call, a turn, a tmux pane and the key list (`esc` closes).

Also `/deck-band full|compact|off` and toasts when context or a rate limit crosses 80 %.
The tmux actions only select, open or split; nothing closes, kills or types into another pane.

## Install

```sh
git clone https://github.com/5omeOtherGuy/slab-deck
claude --plugin-dir slab-deck/mod/slab-deck
```

To load it in every session, add to `~/.claude/settings.json`:

```json
"env": { "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/slab-deck/mod/slab-deck" }
```

tmux and git features turn on by themselves when Claude Code runs inside tmux or a git repository.
`P1_REDUCED_MOTION=1` or `SLAB_REDUCED_MOTION=1` freezes the working indicator.

## Develop

```sh
claude plugin validate mod/slab-deck
claude plugin test mod/slab-deck
```

| file | role |
| --- | --- |
| `hooks/register.tsx` | events, timers, commands, every `$` call (the engine follows `$` only within one file) |
| `hooks/views.tsx` | band, deck sections and popups |
| `hooks/ink.ts` | design tokens and the Raster painters (gauges, charts, minimap, working indicator) |
| `hooks/data.ts` | git and tmux output parsers |
| `types/index.d.ts` | the `$.state` contract |

## Classic status line

`statusline-slab.sh` is the original one-line bash status line, for Claude Code without mods:

```json
"statusLine": { "type": "command", "command": "/path/to/slab-deck/statusline-slab.sh", "padding": 0 }
```

Needs `jq` and `git`.

## License

MIT
