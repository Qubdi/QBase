#!/bin/sh
# Accessibility audit (axe-core + keyboard checks) of the built app.
#   tools/e2e/run-a11y.sh [out-dir]       (SKIP_BUILD=1 reuses dist)
# axe-core is installed into /tmp/pw with playwright by `npm ci` from tools/e2e/package-lock.json.
set -e
cd "$(dirname "$0")/../.."
SHOTS="${1:-/tmp/qbase-a11y}"
mkdir -p "$SHOTS"
docker run --rm --ipc=host -u "$(id -u)" -e HOME=/tmp -e SHOTS=/shots \
    -e SKIP_BUILD="$SKIP_BUILD" \
    -v "$PWD":/w -v "$SHOTS":/shots -w /w \
    mcr.microsoft.com/playwright:v1.49.1-noble@sha256:70e367e0cbf60340a5b5fd562f6247a34eb3196efab9f88a3dd56482d9fe09d2 \
    sh -c 'mkdir -p /tmp/pw && cp /w/tools/e2e/package.json /w/tools/e2e/package-lock.json /tmp/pw/ && cd /tmp/pw && npm ci --no-audit --no-fund >/dev/null && cd /w && node tools/e2e/a11y.mjs'
