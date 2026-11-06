#!/usr/bin/env bash
# Builds a checkout for a CLEAN AUTHOR (see rewrite/provenance.md and
# rewrite/clean-author-brief-phase*.md): this branch only, shallow, no `main`, no ChartDB, no remote,
# and with the files that name ChartDB's layout or old code removed.
#
# Usage: tools/make-clean-checkout.sh <phase: 4|5|6> <destination-dir>
#   phase 4: domain model and storage (brief: rewrite/clean-author-brief-phase4.md)
#   phase 6: the canvas (brief: rewrite/clean-author-brief-phase6.md); keeps core, persistence,
#            store, platform, i18n and globals.css from earlier phases
#   phase 5: dialects and formats (brief: rewrite/clean-author-brief-phase5.md); needs the
#            accepted src/core from phase 4 to be committed on this branch already
#
# Put the destination OUTSIDE the QBase folders (for example ~/clean-room/qbase-phase4) and,
# while the clean session runs, move the `main` worktree and any ChartDB clone out of reach
# (see "Residual risk" in rewrite/clean-author-brief.md hand-off notes printed at the end).
set -euo pipefail

phase="${1:-}"; dest="${2:-}"
case "$phase" in 4|5|6) ;; *) echo "usage: $0 <phase: 4|5|6> <destination-dir>" >&2; exit 2;; esac
[ -n "$dest" ] || { echo "usage: $0 <phase: 4|5|6> <destination-dir>" >&2; exit 2; }
src="$(git rev-parse --show-toplevel)"
branch="$(git -C "$src" rev-parse --abbrev-ref HEAD)"
[ "$branch" = "rewrite/clean-room" ] || { echo "run this on rewrite/clean-room (on: $branch)" >&2; exit 1; }
[ -z "$(git -C "$src" status --porcelain)" ] || { echo "commit your changes first: the checkout is built from HEAD" >&2; exit 1; }
[ ! -e "$dest" ] || { echo "$dest already exists" >&2; exit 1; }
case "$(realpath -m "$dest")/" in "$src"/*) echo "destination must be outside $src" >&2; exit 1;; esac

git clone --quiet --depth 1 --single-branch --branch rewrite/clean-room "file://$src" "$dest"
cd "$dest"
git remote remove origin
git reflog expire --expire=now --all
git gc --quiet --prune=now

# Everything under src/ except the test setup and the accepted clean modules: the remaining
# files use the old naming.
keep=( -name test -o -name core -o -name persistence )
if [ "$phase" = 6 ]; then keep+=( -o -name store -o -name platform -o -name i18n -o -name globals.css -o -name lib ); fi
find src -mindepth 1 -maxdepth 1 ! \( "${keep[@]}" \) -exec rm -rf {} +
if [ "$phase" = 6 ]; then
  find src/lib -mindepth 1 -maxdepth 1 ! -name utils ! -name colors.ts -exec rm -rf {} +
  rm -rf src/platform/router src/platform/config
fi
if [ "$phase" = 5 ]; then
  [ -d src/core/model ] || { echo "phase 5 needs the accepted src/core on this branch" >&2; exit 1; }
fi
# Inventories name ChartDB's files; plans and logs of the process are not the author's business.
rm -rf rewrite/lawyer-brief.md rewrite/inventory rewrite/PLAN.md rewrite/TODO.md rewrite/README.md Audit tools/similarity.mjs \
       tools/licences.mjs tools/spec-check.mjs tools/make-clean-checkout.sh .github/workflows/similarity.yaml
# Specs and parity rows outside this phase's scope.
rm -f rewrite/spec/app-shell.md rewrite/spec/manual-test-script.md
if [ "$phase" = 4 ]; then
  rm -f rewrite/spec/import-export.md
  drop='SHL|QBS|IMP|EXP'
elif [ "$phase" = 5 ]; then
  rm -f rewrite/spec/editor.md
  drop='SHL|QBS|EDT'
else
  rm -f rewrite/spec/import-export.md
  drop='SHL|QBS|IMP|EXP|DAT'
fi
grep -v -E "^\\| ($drop)-" rewrite/parity-checklist.md > rewrite/parity-checklist.tmp
mv rewrite/parity-checklist.tmp rewrite/parity-checklist.md
cp "$src/rewrite/clean-author-brief-phase$phase.md" CLAUDE.md
git config user.name "Clean author session"
git config user.email "clean-author@invalid"
rm -f rewrite/clean-author-brief-phase*.md

# Check what is left for anything that names the other project or the old layout.
echo "--- scan for forbidden terms in the checkout (should print nothing) ---"
grep -r -n -i -E 'chartdb|\.\./QBase-main|git show main' --exclude-dir=.git --exclude-dir=node_modules . \
  | grep -v -E '^\./(CLAUDE\.md|rewrite/(provenance|log|architecture|similarity-allow)\.|rewrite/rewritten\.txt)' || true
echo "--- remaining refs/branches (should be one) ---"
git branch -a
echo "--- remaining src/ ---"
find src -type f | head
cat <<EOF

Clean checkout ready: $dest
Residual risk: the session can still read any path the OS lets it. Before starting it:
  1. git worktree remove ../QBase-main   (re-add it after the session)
  2. delete or move the ChartDB clone and any /tmp scratch copy of it
  3. start the session with the working directory set to $dest, and no extra directories
EOF
