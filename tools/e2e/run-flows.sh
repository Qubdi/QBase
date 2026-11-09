#!/bin/sh
# Real-browser flows of the built app (see flows.mjs). Same Docker approach as
# run-smoke.sh. Screenshots go to /tmp/qbase-flows (or the first argument).
#   tools/e2e/run-flows.sh [shots-dir]      ONLY=F1,F3 SKIP_BUILD=1 tools/e2e/run-flows.sh
set -e
cd "$(dirname "$0")/../.."
SHOTS="${1:-/tmp/qbase-flows}"
mkdir -p "$SHOTS"
docker run --rm --ipc=host -u "$(id -u)" -e HOME=/tmp -e SHOTS=/shots \
    -e ONLY="$ONLY" -e DEBUG_EVENTS="$DEBUG_EVENTS" -e SKIP_BUILD="$SKIP_BUILD" \
    -v "$PWD":/w -v "$SHOTS":/shots -w /w \
    mcr.microsoft.com/playwright:v1.49.1-noble@sha256:70e367e0cbf60340a5b5fd562f6247a34eb3196efab9f88a3dd56482d9fe09d2 \
    sh -c 'mkdir -p /tmp/pw && cd /tmp/pw && npm i --no-save --no-audit --no-fund playwright@1.49.1 >/dev/null && cd /w && node tools/e2e/flows.mjs'
