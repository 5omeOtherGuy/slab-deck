# claude-statusline

SLAB/MONO status line for Claude Code; mirrors the slab-dark tmux status bar.

Install:

    ln -s ~/projects/claude-statusline/statusline-slab.sh ~/.claude/statusline-slab.sh

then in `~/.claude/settings.json`:

    "statusLine": { "type": "command", "command": "~/.claude/statusline-slab.sh", "padding": 0 }

Needs `jq` and `git`. Set `SLAB_STATUSLINE_CAPTURE=<file>` to dump the input JSON for debugging.
