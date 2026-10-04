#!/usr/bin/env bash
# SLAB/MONO — Claude Code status line. Mirrors the tmux status bar (terminal/tmux.conf):
#
#   ▌Opus 5▐ ▎slab-dark main*  high │ ctx 27% │ 5h 7% │ 1h34 │ +425 −67
#   └ model: ACCENT fill      └ cwd: BG3 + left rule, like tmux's current window
#
# DIM labels, FG values, RULE+ separators. ctx / 5h ≥ 80 % turn into an ALERT fill block.
# Dollar cost is left out on purpose: on a subscription it is a notional API-price figure.
# Install: ~/.claude/statusline-slab.sh, then in ~/.claude/settings.json:
#   "statusLine": { "type": "command", "command": "~/.claude/statusline-slab.sh", "padding": 0 }

export LC_ALL=C   # printf %.2f must not follow a de_DE decimal comma
in=$(cat)
[ -n "$SLAB_STATUSLINE_CAPTURE" ] && printf '%s' "$in" > "$SLAB_STATUSLINE_CAPTURE"

j() { jq -r "$1 // empty" <<<"$in" 2>/dev/null; }

model=$(j '.model.display_name'); model=${model% (*}        # "Opus 5 (1M context)" -> "Opus 5"
effort=$(j '.effort.level')
five=$(j '.rate_limits.five_hour.used_percentage')
dir=$(j '.workspace.current_dir // .cwd')
pct=$(j '.context_window.used_percentage')
dur=$(j '.cost.total_duration_ms')
add=$(j '.cost.total_lines_added')
del=$(j '.cost.total_lines_removed')

# palette (truecolor)
fg() { printf '\e[38;2;%d;%d;%dm' "0x${1:0:2}" "0x${1:2:2}" "0x${1:4:2}"; }
bg() { printf '\e[48;2;%d;%d;%dm' "0x${1:0:2}" "0x${1:2:2}" "0x${1:4:2}"; }
R=$'\e[0m'; B=$'\e[1m'
BG0=0a0a0a BG3=202020 RULE2=3d3d3d DIM=9a9a9a FG=e8e8e8 ACC=e8e8e8 ALERT=8f8f8f
SEP="$(fg $RULE2)│$R"

out=""
# model block: accent fill, like the tmux session block
[ -n "$model" ] && out+="$(bg $ACC)$(fg $BG0)$B ${model} $R "

# cwd block: BG3 + left rule, like the current tmux window
if [ -n "$dir" ]; then
  name=${dir##*/}; [ "$dir" = "$HOME" ] && name="~"
  branch=$(git -C "$dir" symbolic-ref --short -q HEAD 2>/dev/null || git -C "$dir" rev-parse --short HEAD 2>/dev/null)
  dirty=""; [ -n "$branch" ] && [ -n "$(git -C "$dir" status --porcelain -uno 2>/dev/null | head -1)" ] && dirty="*"
  out+="$(bg $BG3)$(fg $ACC)▎$(fg $FG)$B${name}$R$(bg $BG3)"
  [ -n "$branch" ] && out+=" $(fg $DIM)${branch}${dirty}"
  out+=" $R "
fi

segs=()
pctseg() {  # label value: DIM label + FG value, or ALERT fill block from 80 %
  local p=${2%.*}
  if [ "${p:-0}" -ge 80 ]; then segs+=("$(bg $ALERT)$(fg $BG0)$B $1 ${p}% $R")
  else segs+=("$(fg $DIM)$1 $(fg $FG)${p}%$R"); fi
}
[ -n "$effort" ] && segs+=("$(fg $DIM)${effort}$R")
[ -n "$pct" ]  && pctseg ctx "$pct"
[ -n "$five" ] && pctseg 5h "$five"
if [ -n "$dur" ]; then
  m=$(( ${dur%.*} / 60000 ))
  if [ $m -ge 60 ]; then t="$((m/60))h$(printf '%02d' $((m%60)))"; else t="${m}m"; fi
  segs+=("$(fg $DIM)${t}$R")
fi
if [ "${add:-0}" != 0 ] || [ "${del:-0}" != 0 ]; then
  segs+=("$(fg $FG)+${add:-0} $(fg $DIM)−${del:-0}$R")
fi

for i in "${!segs[@]}"; do
  [ "$i" -gt 0 ] && out+=" $SEP "
  out+="${segs[$i]}"
done
printf '%s' "$out"
