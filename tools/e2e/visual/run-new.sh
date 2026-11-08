#!/bin/sh
# Builds the NEW editor (this repo, empty backend URL), serves it with vite preview inside the
# Playwright container and runs the scene harness against it.
#   tools/e2e/visual/run-new.sh [scene-filter]      (output in /home/qubdi/ui-reference/new)
#   tools/e2e/visual/run-new.sh --script my.mjs     (serve the new editor, run any node script against BASE_URL)
# Then compare:  tools/e2e/visual/run-run.sh --compare /home/qubdi/ui-reference/old /home/qubdi/ui-reference/new
set -e
cd "$(dirname "$0")/../../.."
CACHE="${PW_CACHE:-$HOME/.cache/qbase-pw}"
OUT="${OUT:-/home/qubdi/ui-reference/new}"
REF="$(dirname "$OUT")"
mkdir -p "$CACHE" "$OUT"
docker run --rm --network host --ipc=host -u "$(id -u)" -e HOME=/tmp -e OUT="$OUT" \
    -e PORT="${PORT:-4199}" -e BASE_URL=http://127.0.0.1:${PORT:-4199} \
    -v "$PWD":/w -v "$REF":"$REF" -v "$CACHE":/tmp/pw -w /w \
    mcr.microsoft.com/playwright:v1.49.1-noble \
    sh -c 'cd /tmp/pw && [ -d node_modules/pixelmatch ] || npm i --no-save --no-audit --no-fund playwright@1.49.1 pixelmatch@5.3.0 pngjs@7.0.0 >/dev/null; cd /w && VITE_QUBDI_BACKEND_URL= npx vite build --outDir /tmp/newdist >/tmp/build.log 2>&1 || { tail -20 /tmp/build.log; exit 1; }; (npx vite preview --outDir /tmp/newdist --port ${PORT:-4199} --strictPort >/tmp/preview.log 2>&1 &); sleep 4; if [ "$1" = --script ]; then shift; node "$@"; else node tools/e2e/visual/run.mjs "$@"; fi' sh "$@"
