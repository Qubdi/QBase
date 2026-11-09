#!/bin/sh
# Wrapper for the visual scene harness (Playwright image, no Node on the host).
#   BASE_URL=http://127.0.0.1:18090 OUT=$HOME/ui-reference/old tools/e2e/visual/run-run.sh [scene-filter]
#   tools/e2e/visual/run-run.sh --compare $HOME/ui-reference/old $HOME/ui-reference/new
#   tools/e2e/visual/run-run.sh --script some.mjs    (run any node script with playwright available)
# Playwright, pixelmatch and pngjs are installed into a cache folder (PW_CACHE, default
# ~/.cache/qbase-pw) mounted at /tmp/pw, never into package.json.
set -e
cd "$(dirname "$0")/../../.."
CACHE="${PW_CACHE:-$HOME/.cache/qbase-pw}"
OUT="${OUT:-$HOME/ui-reference/new}"
REF="$(dirname "$OUT")"
mkdir -p "$CACHE" "$OUT" "$REF/diff"
MODE=run
if [ "$1" = "--compare" ]; then MODE=compare; shift; fi
if [ "$1" = "--script" ]; then MODE=script; shift; fi
case "$MODE" in
    compare) CMD='node tools/e2e/visual/compare.mjs "$@"' ;;
    script) CMD='node "$@"' ;;
    *) CMD='node tools/e2e/visual/run.mjs "$@"' ;;
esac
docker run --rm --network host --ipc=host -u "$(id -u)" -e HOME=/tmp \
    -e BASE_URL="${BASE_URL:-http://127.0.0.1:18090}" -e OUT="$OUT" \
    -v "$PWD":/w -v "$REF":"$REF" -v "$CACHE":/tmp/pw -w /w \
    mcr.microsoft.com/playwright:v1.49.1-noble@sha256:70e367e0cbf60340a5b5fd562f6247a34eb3196efab9f88a3dd56482d9fe09d2 \
    sh -c 'cd /tmp/pw && [ -d node_modules/pixelmatch ] || npm i --no-save --no-audit --no-fund playwright@1.49.1 pixelmatch@5.3.0 pngjs@7.0.0 >/dev/null; cd /w && '"$CMD" sh "$@"
