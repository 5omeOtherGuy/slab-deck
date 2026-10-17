#!/usr/bin/env bash
# Hermetic checks of statusline-slab.sh: the facts it draws and the pinned-quota cache with its refresher.
# Quiet on success; names each failed check and exits 1. Needs jq.
set -u
cd "$(dirname "$0")/.." || exit 1
SL=$PWD/statusline-slab.sh
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
failed=0

fail() { printf 'FAIL statusline: %s\n' "$1"; [ -n "${2:-}" ] && printf '  line: %s\n' "$2"; failed=1; }

# run [VAR=value …]: one statusline run in a clean environment, visible text (ANSI stripped) in $line.
# The script's fd 3 is this command substitution's pipe and the background refresher inherits it, so the
# substitution returns only once the refresher has finished: no sleeps.
PATH_RUN=$PATH
run() {
  local _
  _=$(env -i PATH="$PATH_RUN" HOME="$tmp/home" XDG_CACHE_HOME="$tmp/cache" COLUMNS=200 "$@" \
    bash "$SL" <"$tmp/in.json" 3>&1 >"$tmp/out" 2>"$tmp/err")
  line=$(sed $'s/\e\\[[0-9;]*m//g' "$tmp/out")
  [ -s "$tmp/err" ] && fail "stderr is not empty: $(head -c 200 "$tmp/err")"
}
has()  { case $line in *"$1"*) ;; *) fail "$2: expected '$1'" "$line" ;; esac; }
lacks() { case $line in *"$1"*) fail "$2: unexpected '$1'" "$line" ;; esac; }

mkdir -p "$tmp/home"
cat >"$tmp/in.json" <<'EOF'
{"session_id":"t1","model":{"display_name":"Opus 5.5 (1M context)"},"effort":{"level":"high"},
 "workspace":{"current_dir":"/nonexistent/slab"},"context_window":{"used_percentage":35},
 "cost":{"total_duration_ms":2760000,"total_lines_added":12,"total_lines_removed":3},
 "rate_limits":{"five_hour":{"used_percentage":26},"seven_day":{"used_percentage":64}}}
EOF
quota() { # file pct: a stub quota command that prints a providers document, or junk when pct is "junk"
  if [ "$2" = junk ]; then printf '#!/bin/sh\necho "upstream timeout"\n' >"$1"
  else printf '#!/bin/sh\necho %s\n' "'{\"accounts\":[{\"label\":\"work\",\"windows\":[{\"name\":\"weekly_all\",\"pct\":$2,\"resetsAt\":null}]}]}'" >"$1"
  fi
  chmod +x "$1"
}
quota "$tmp/q42" 42; quota "$tmp/q77" 77; quota "$tmp/qbad" junk
PINS='work:weekly_all:w'
qfile=$tmp/cache/slab-deck/quota.json

# Facts from the session JSON
run
has 'Opus 5.5 ' 'model without its parenthesis'
has 'ctx ' 'context gauge'; has ' 35%' 'context percent'
has '5h ' '5h gauge'; has '7d ' '7d gauge'; has ' 64%' '7d percent'
has '+12 −3' 'lines added and removed'; has '46m' 'session clock'

# Pinned quota with flock(1): the first run refreshes the cache in the background, the next one draws it
if command -v flock >/dev/null; then
  run SLAB_QUOTA_COMMAND="$tmp/q42" SLAB_QUOTA_PINS="$PINS"
  [ -f "$qfile" ] || fail 'flock: the refresher did not write the cache'
  [ -n "$(find "$qfile" -perm 0600 2>/dev/null)" ] || fail 'flock: the cache is not mode 0600'
  run SLAB_QUOTA_COMMAND="$tmp/q42" SLAB_QUOTA_PINS="$PINS"
  has 'w ' 'flock: pinned gauge'; has ' 42%' 'flock: pinned percent'; lacks '7d ' 'flock: pins replace the 7d gauge'

  cp "$qfile" "$tmp/kept.json"
  run SLAB_QUOTA_COMMAND="$tmp/qbad" SLAB_QUOTA_PINS="$PINS" SLAB_QUOTA_MAX_AGE=-1
  cmp -s "$qfile" "$tmp/kept.json" || fail 'flock: bad command output replaced the last reading'
  has ' 42%' 'flock: last reading after bad output'

  # A refresher holding the lock keeps a second one out
  exec 7>"$tmp/cache/slab-deck/quota.lock"; flock -n 7 || fail 'flock: could not take the lock for the test'
  run SLAB_QUOTA_COMMAND="$tmp/q77" SLAB_QUOTA_PINS="$PINS" SLAB_QUOTA_MAX_AGE=-1
  exec 7>&-
  cmp -s "$qfile" "$tmp/kept.json" || fail 'flock: a second refresher ran while the lock was held'
fi

# Pinned quota without flock(1), as on macOS: the mkdir lock
rm -rf "$tmp/cache"
mkdir -p "$tmp/bin"
for c in bash jq git stat mkdir mv rm rmdir cat cut stty sh; do
  p=$(command -v "$c") && ln -s "$p" "$tmp/bin/$c"
done
PATH_RUN=$tmp/bin
run SLAB_QUOTA_COMMAND="$tmp/q42" SLAB_QUOTA_PINS="$PINS"
[ -f "$qfile" ] || fail 'mkdir lock: the refresher did not write the cache'
[ -n "$(find "$qfile" -perm 0600 2>/dev/null)" ] || fail 'mkdir lock: the cache is not mode 0600'
[ ! -e "$tmp/cache/slab-deck/quota.lock.d" ] || fail 'mkdir lock: the lock was not released'
run SLAB_QUOTA_COMMAND="$tmp/q42" SLAB_QUOTA_PINS="$PINS"
has ' 42%' 'mkdir lock: pinned percent'; lacks '7d ' 'mkdir lock: pins replace the 7d gauge'

mkdir "$tmp/cache/slab-deck/quota.lock.d"
run SLAB_QUOTA_COMMAND="$tmp/q77" SLAB_QUOTA_PINS="$PINS" SLAB_QUOTA_MAX_AGE=-1
has ' 42%' 'mkdir lock: a second refresher ran while the lock was held'
touch -t 202001010000 "$tmp/cache/slab-deck/quota.lock.d"
run SLAB_QUOTA_COMMAND="$tmp/q77" SLAB_QUOTA_PINS="$PINS" SLAB_QUOTA_MAX_AGE=-1
run SLAB_QUOTA_COMMAND="$tmp/q77" SLAB_QUOTA_PINS="$PINS"
has ' 77%' 'mkdir lock: a lock left by a killed refresher did not expire'

exit "$failed"
