#!/usr/bin/env bash
# slab-deck statusline — Claude Code's status line slot in the SLAB Harness Statusline grammar:
#
#    Opus 5.5    slab-deck main   effort high        ctx ████▌░░░░░ 35%   5h ██░░░░ 26%   7d █████▋ 94% 3d16h   cache 99%   ▁▃▅█   46m   +2592 −570
#   └ route chip: FG inverted, never amber      └ values INK, labels DIM; gauges amber from 70 %, red from 90 %
#
# One BLOCK+ band (#1c1c1c), pad 1, left group then right group, 3 spaces between facts; lower-priority
# facts drop first when the terminal is narrow. Hue on glyphs and outcome markers only.
# Dollar cost is left out on purpose: on a subscription it is a notional API-price figure.
# The slab-deck mod adds the output-per-turn sparkline via ${XDG_CACHE_HOME:-~/.cache}/slab-deck/<session>.json.
# Cheap enough to re-run every second (statusLine.refreshInterval): no subshell per colour.
#
# Install, in ~/.claude/settings.json:
#   "statusLine": { "type": "command", "command": "/path/to/slab-deck/statusline-slab.sh", "padding": 0, "refreshInterval": 1 }
# Needs jq and git. SLAB_STATUSLINE_CAPTURE=<file> dumps the input JSON.

export LC_ALL=C.UTF-8
in=$(cat)
[ -n "$SLAB_STATUSLINE_CAPTURE" ] && printf '%s' "$in" > "$SLAB_STATUSLINE_CAPTURE"

US=$'\x1f'
IFS=$US read -r sid model effort dir pct ms add del five fiveAt seven sevenAt hit warm < <(jq -r '[
  .session_id // "",
  (.model.display_name // "" | sub(" \\(.*\\)$"; "")),
  .effort.level // "",
  .workspace.current_dir // .cwd // "",
  (.context_window.used_percentage // "" | tostring),
  (.cost.total_duration_ms // "" | tostring),
  (.cost.total_lines_added // 0 | tostring),
  (.cost.total_lines_removed // 0 | tostring),
  (.rate_limits.five_hour.used_percentage // "" | tostring),
  (.rate_limits.five_hour.resets_at // "" | tostring),
  (.rate_limits.seven_day.used_percentage // "" | tostring),
  (.rate_limits.seven_day.resets_at // "" | tostring),
  (.prompt_cache.hit_ratio // null | if . == null then "" else (. * 100 | round | tostring) end),
  (.prompt_cache.warm // "" | tostring)
] | join("\u001f")' <<<"$in" 2>/dev/null)

outs=()
spark="${XDG_CACHE_HOME:-$HOME/.cache}/slab-deck/${sid}.json"
[ -n "$sid" ] && [ -r "$spark" ] && read -r -a outs < <(jq -r '(.outs // [])[-12:] | map(tostring) | join(" ")' "$spark" 2>/dev/null)

# ---- tokens, as escape strings built once
BAND=1c1c1c INK=e8e8e8 DIM=9a9a9a FAINT=6a6a6a RULE=2a2a2a GROUND=0a0a0a ATTN=e2a03f FAIL=e0705f OK=8fb573
esc() { local h=$2; printf -v "$1" '\e[%s;2;%d;%d;%dm' "$3" "0x${h:0:2}" "0x${h:2:2}" "0x${h:4:2}"; }
for n in BAND INK DIM FAINT RULE GROUND ATTN FAIL OK; do esc "F$n" "${!n}" 38; esc "B$n" "${!n}" 48; done

tone() { if (( $1 >= 90 )); then TF=$FFAIL; elif (( $1 >= 70 )); then TF=$FATTN; else TF=$FINK; fi; }

EIGHTHS=(' ' '▏' '▎' '▍' '▌' '▋' '▊' '▉' '█')
gauge() { # width pct -> G: filled in the value's tone, unfilled segments in RULE, to an eighth of a cell
  local w=$1 p=$2 e x n; G=""
  tone "$p"; e=$(( (p * w * 8 + 50) / 100 ))
  for (( x = 0; x < w; x++ )); do
    n=$(( e - x * 8 )); (( n < 0 )) && n=0; (( n > 8 )) && n=8
    if (( n == 8 )); then G+="$TF█"
    elif (( n == 0 )); then G+="$FRULE█"
    else G+="$TF$BRULE${EIGHTHS[n]}$BBAND"; fi
  done
}

clock() { # ms -> CL: 12s / 7m / 1h34
  local s=$(( $1 / 1000 )) m
  if (( s < 60 )); then CL="${s}s"; return; fi
  m=$(( s / 60 ))
  if (( m < 60 )); then CL="${m}m"; else printf -v CL '%dh%02d' $(( m / 60 )) $(( m % 60 )); fi
}

left_in() { # seconds -> LI: 42m / 3h12 / 3d16h
  local s=$1 m h
  (( s < 0 )) && s=0
  m=$(( s / 60 )); h=$(( m / 60 ))
  if (( h >= 24 )); then LI="$(( h / 24 ))d$(( h % 24 ))h"
  elif (( h >= 1 )); then printf -v LI '%dh%02d' $h $(( m % 60 ))
  else LI="${m}m"; fi
}

# ---- facts: text (ANSI), visible width, priority (0 never drops); left group then right group
LT=(); LW=(); LP=(); RT=(); RW=(); RP=()
left()  { LT+=("$1"); LW+=("$2"); LP+=("$3"); }
right() { RT+=("$1"); RW+=("$2"); RP+=("$3"); }

[ -n "$model" ] && left "$BINK$FGROUND ${model} $BBAND" $(( ${#model} + 2 )) 0

if [ -n "$dir" ] && git_out=$(git -C "$dir" rev-parse --show-toplevel --abbrev-ref HEAD 2>/dev/null); then
  root=${git_out%%$'\n'*}; branch=${git_out##*$'\n'}; repo=${root##*/}
  left "$FINK${repo}$FDIM ${branch}" $(( ${#repo} + 1 + ${#branch} )) 1
elif [ -n "$dir" ]; then
  name=${dir##*/}; [ "$dir" = "$HOME" ] && name="~"
  left "$FINK${name}" ${#name} 1
fi

[ -n "$effort" ] && left "${FDIM}effort $FINK${effort}" $(( 7 + ${#effort} )) 4

if [ -n "$pct" ]; then
  p=${pct%.*}; gauge 10 "$p"; tone "$p"
  right "${FDIM}ctx ${G}${TF} ${p}%" $(( 4 + 10 + 2 + ${#p} )) 0
else
  gauge 10 0; right "${FDIM}ctx ${G}${FINK} —" 16 0   # unknown until the first response: —, never 0
fi

printf -v now '%(%s)T' -1
limit() { # label pct resets_at
  local p=${2%.*} txt w
  gauge 6 "$p"; tone "$p"
  txt="${FDIM}$1 ${G}${TF} ${p}%"; w=$(( ${#1} + 1 + 6 + 2 + ${#p} ))
  if (( p >= 70 )) && [ -n "$3" ]; then
    left_in $(( ${3%.*} - now )); txt+="$FFAINT ${LI}"; w=$(( w + 1 + ${#LI} ))
  fi
  # A window at 70 % or more outranks the repo name; under it, it drops after the clock.
  right "$txt" "$w" $(( p >= 70 ? 1 : 2 ))
}
[ -n "$five" ] && limit 5h "$five" "$fiveAt"

# ---- pinned quota windows (SLAB_QUOTA_PINS="account:window[:short] …") from SLAB_QUOTA_COMMAND, whose JSON has the
# providers-tab shape ({accounts:[{label, windows:[{name, pct, resetsAt}]}]}). The command is slow (network), so the
# line reads a shared cache and refreshes it in the background, one refresher at a time, once it is
# SLAB_QUOTA_MAX_AGE seconds old (default 300). The pins replace the session's own 7d gauge, which covers one
# account only; they never drop when the line narrows.
pinned=0
if [ -n "$SLAB_QUOTA_PINS" ] && [ -n "$SLAB_QUOTA_COMMAND" ]; then
  qdir="${XDG_CACHE_HOME:-$HOME/.cache}/slab-deck"; qfile="$qdir/quota.json"
  qage=999999
  [ -r "$qfile" ] && qage=$(( now - $(stat -c %Y "$qfile" 2>/dev/null || echo 0) ))
  if (( qage > ${SLAB_QUOTA_MAX_AGE:-300} )); then
    mkdir -p "$qdir"
    read -r -a qcmd <<<"$SLAB_QUOTA_COMMAND"   # argv split on spaces, no shell, as the deck's providersCommand
    ( umask 077; flock -n 9 || exit 0
      "${qcmd[@]}" >"$qfile.tmp" 2>/dev/null && jq -e .accounts "$qfile.tmp" >/dev/null 2>&1 && mv -f "$qfile.tmp" "$qfile"
      rm -f "$qfile.tmp" ) 9>"$qdir/quota.lock" </dev/null >/dev/null 2>&1 &
    disown 2>/dev/null
  fi
  if [ -r "$qfile" ]; then
    while IFS=$US read -r qshort qpct qat; do
      [ -z "$qpct" ] && continue
      pinned=1
      limit "$qshort" "$qpct" "$qat"
      RP[${#RP[@]}-1]=0
      # A reading over three refresh periods old is shown, marked stale, never passed off as current.
      if (( qage > 3 * ${SLAB_QUOTA_MAX_AGE:-300} )); then RT[${#RT[@]}-1]+="$FFAINT ?"; RW[${#RW[@]}-1]=$(( RW[${#RW[@]}-1] + 2 )); fi
    done < <(jq -r --arg pins "$SLAB_QUOTA_PINS" '
      . as $d | $pins | split(" ")[] | select(length > 0) | split(":") as $p
      | ($d.accounts[]? | select(.label == $p[0]) | .windows[]? | select(.name == $p[1])) as $w
      | [ ($p[2] // $p[0]),
          ($w.pct // "" | tostring),
          ($w.resetsAt // "" | sub("\\.[0-9]+"; "") | sub("\\+00:00$"; "Z") | (try fromdateiso8601 catch "") | tostring) ]
      | join("\u001f")' "$qfile" 2>/dev/null)
  fi
fi
(( pinned )) || { [ -n "$seven" ] && limit 7d "$seven" "$sevenAt"; }

if [ "$warm" = "false" ]; then
  right "${FATTN}! ${FDIM}cache cold" 12 5
elif [ -n "$hit" ]; then
  right "${FDIM}cache $FINK${hit}%" $(( 7 + ${#hit} )) 5
fi

if (( ${#outs[@]} > 1 )); then
  TICKS=('▁' '▂' '▃' '▄' '▅' '▆' '▇' '█')
  max=1; for o in "${outs[@]}"; do (( o > max )) && max=$o; done
  s=""; k=0
  for o in "${outs[@]}"; do
    k=$(( k + 1 )); i=$(( o * 7 / max ))
    if (( k == ${#outs[@]} )); then s+="$FINK${TICKS[i]}"; else s+="$FDIM${TICKS[i]}"; fi
  done
  right "$s" ${#outs[@]} 6
fi

if [ -n "$ms" ]; then clock "${ms%.*}"; right "$FINK${CL}" ${#CL} 3; fi
right "$FOK+${add}$FFAIL −${del}" $(( 3 + ${#add} + ${#del} )) 2

# ---- width: the pane's when inside tmux, else the controlling terminal's; Claude Code indents the line
cols=""
[ -n "$TMUX_PANE" ] && cols=$(tmux display-message -p -t "$TMUX_PANE" '#{pane_width}' 2>/dev/null)
[ -z "$cols" ] && cols=$( { stty size </dev/tty; } 2>/dev/null | cut -d' ' -f2)
[ -z "$cols" ] && cols=${COLUMNS:-0}
W=$(( cols > 4 ? cols - 4 : 0 ))

total() { local x; TOT=2
  for x in "${LW[@]}" "${RW[@]}"; do TOT=$(( TOT + x )); done
  TOT=$(( TOT + 3 * (${#LW[@]} > 0 ? ${#LW[@]} - 1 : 0) + 3 * (${#RW[@]} > 0 ? ${#RW[@]} - 1 : 0) + 3 )); }

# Fit: drop the highest-priority fact (right group first on a tie) until the band holds the rest.
total
while (( W > 0 && TOT > W )); do
  worst=0; side=""; at=-1
  for i in "${!RP[@]}"; do (( RP[i] >= worst && RP[i] > 0 )) && { worst=${RP[i]}; side=R; at=$i; }; done
  for i in "${!LP[@]}"; do (( LP[i] > worst )) && { worst=${LP[i]}; side=L; at=$i; }; done
  (( at < 0 )) && break
  if [ $side = R ]; then unset 'RT[at]' 'RW[at]' 'RP[at]'; RT=("${RT[@]}"); RW=("${RW[@]}"); RP=("${RP[@]}")
  else unset 'LT[at]' 'LW[at]' 'LP[at]'; LT=("${LT[@]}"); LW=("${LW[@]}"); LP=("${LP[@]}"); fi
  total
done

out="$BBAND "
for i in "${!LT[@]}"; do (( i > 0 )) && out+="   "; out+="${LT[i]}"; done
gap=3
(( W > 0 )) && gap=$(( W - TOT + 3 ))
(( gap < 3 )) && gap=3
printf -v pad '%*s' "$gap" ''
out+=$pad
for i in "${!RT[@]}"; do (( i > 0 )) && out+="   "; out+="${RT[i]}"; done
out+=" "$'\e[0m'
printf '%s' "$out"
