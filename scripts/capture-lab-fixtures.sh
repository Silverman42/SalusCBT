#!/usr/bin/env bash
# Capture tests/fixtures/lab/* from a real build-lab.sh run (T-707).
#
#   bash scripts/capture-lab-fixtures.sh [OUT_DIR]   # default: tests/fixtures/lab
#
# Run it on Ubuntu (CI: ubuntu-latest) with GNU coreutils, grep, sed and gawk.
# The `lab-fixtures` CI job runs it into a temp dir and fails if the result
# differs from the committed fixtures; tests/unit/terminal-lab-fixtures.test.ts
# replays the same commands in the in-browser terminal and compares.
#
# Input: OUT_DIR/commands.txt (or tests/fixtures/lab/commands.txt), one lab-step
# command per line, in order, from shared/lab.ts with the Part 6 answers filled
# in (the test checks this list against shared/lab.ts).
#
# Output, per command NN (01, 02, ...): NN.stdout, NN.stderr, NN.status, all
# from one bash session (cd carries over), plus build.stdout for the build.
#
# Made deterministic, to match seedLab() in the test:
# - Lab B: installer k (script order, from 1) is 2 MiB of byte k instead of
#   /dev/urandom, and the victim is $VICTIM instead of `shuf -n1`.
# - Every file's mtime is LAB_MTIME (`touch -d @1793697240`, 2026-11-03 09:14 UTC).
# - LC_ALL=C, TZ=UTC, umask 022, a clean environment (no COLUMNS, no aliases).
# Normalised afterwards: the user's owner/group -> `root root`, the temp
# $HOME -> /root, and GNU's six-month `Nov  3  2026` -> `Nov  3 09:14`.

set -euo pipefail

LAB_MTIME_S=1793697240 # app/lib/terminal/seedLab.ts LAB_MTIME / 1000
VICTIM=backup-tool-1.8.deb

repo=$(cd "$(dirname "$0")/.." && pwd)
committed="$repo/tests/fixtures/lab"
out=${1:-$committed}
src="$repo/content/source/build-lab.sh"

need_gnu() {
  "$1" --version 2>&1 | grep -q "$2" || {
    echo "capture-lab-fixtures: $1 is not $2 (run this on Ubuntu)" >&2
    exit 1
  }
}
need_gnu ls "GNU coreutils"
need_gnu stat "GNU coreutils"
need_gnu sha256sum "GNU coreutils"
need_gnu grep "GNU grep"
need_gnu sed "GNU sed"
need_gnu awk "GNU Awk"

mkdir -p "$out"
if [ "$out" != "$committed" ]; then cp "$committed/commands.txt" "$out/commands.txt"; fi
rm -f "$out"/[0-9][0-9].* "$out/build.stdout"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
home="$work/home"
mkdir -m 700 "$home"
bytes="$work/bytes"
mkdir "$bytes"

# Fixed installer bytes, in the script's loop order.
k=0
for f in $(sed -n 's/^for f in \(.*\); do$/\1/p' "$src"); do
  k=$((k + 1))
  head -c 2097152 /dev/zero | tr '\0' "\\00$k" > "$bytes/$f"
done
[ "$k" = 4 ] || { echo "capture-lab-fixtures: expected 4 installers, found $k" >&2; exit 1; }

# The script with only the two random parts swapped out.
patched="$work/build-lab.sh"
sed -e 's|head -c 2097152 /dev/urandom|head -c 2097152 "$LAB_FIXTURE_BYTES/$f"|' \
  -e 's|shuf -n1|grep -x -F "$LAB_FIXTURE_VICTIM"|' "$src" > "$patched"
changed=$(diff "$src" "$patched" | grep -c '^>' || true)
[ "$changed" = 2 ] || { echo "capture-lab-fixtures: patched $changed lines, expected 2" >&2; exit 1; }

clean_env=(env -i "PATH=$PATH" "HOME=$home" LC_ALL=C TZ=UTC)

# Step 1: bash build-lab.sh
(cd "$home" && "${clean_env[@]}" LAB_FIXTURE_BYTES="$bytes" LAB_FIXTURE_VICTIM="$VICTIM" \
  bash -c 'umask 022 && exec bash "$0"' "$patched") > "$out/build.stdout" 2> "$work/build.stderr"
if [ -s "$work/build.stderr" ]; then cat "$work/build.stderr" >&2; exit 1; fi
[ "$(cat "$home/secplus-lab/.answer-lab-b")" = "$VICTIM" ]

find "$home" -exec touch -h -d "@$LAB_MTIME_S" {} +

# Steps 2-4: every command in one session.
cat > "$work/session.sh" <<'EOF'
umask 022
cd "$HOME"
raw=$1
i=0
while IFS= read -r line <&3; do
  i=$((i + 1))
  n=$(printf '%02d' "$i")
  eval "$line" > "$raw/$n.stdout" 2> "$raw/$n.stderr" < /dev/null
  echo "$?" > "$raw/$n.status"
done 3< "$2"
EOF
"${clean_env[@]}" bash --noprofile --norc "$work/session.sh" "$out" "$out/commands.txt"

# Normalise.
sed_escape() { printf '%s' "$1" | sed 's/[][\.*^$]/\\&/g'; }
owner=" $(id -un) $(id -gn) "
for f in "$out"/[0-9][0-9].std* "$out/build.stdout"; do
  sed -i -e "s|$(sed_escape "$owner")| root root |g" \
    -e "s|$(sed_escape "$home")|/root|g" \
    -e 's|Nov  3  2026|Nov  3 09:14|g' "$f"
done

echo "capture-lab-fixtures: $(wc -l < "$out/commands.txt") commands captured in $out"
