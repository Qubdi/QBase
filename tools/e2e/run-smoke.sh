#!/bin/sh
# Headless-browser smoke test of the built app (local-only mode, no backend).
# Node is not needed on the host: everything runs in the Playwright image.
#   tools/e2e/run-smoke.sh [shots-dir]
# Pull once:  docker pull mcr.microsoft.com/playwright:v1.49.1-noble@sha256:70e367e0cbf60340a5b5fd562f6247a34eb3196efab9f88a3dd56482d9fe09d2
# The image is pinned by digest. The container installs the same exact Playwright
# version (1.49.1) into /tmp (not into package.json), builds the app, serves dist
# on port 4173 and runs smoke.mjs.
# Screenshots go to SHOTS (default /tmp/qbase-e2e), outside the repo.
set -e
cd "$(dirname "$0")/../.."
SHOTS="${1:-/tmp/qbase-e2e}"
mkdir -p "$SHOTS"
docker run --rm --ipc=host -u "$(id -u)" -e HOME=/tmp -e SHOTS=/shots \
    -e SCRIPT="${SCRIPT:-tools/e2e/smoke.mjs}" \
    -v "$PWD":/w -v "$SHOTS":/shots -w /w \
    mcr.microsoft.com/playwright:v1.49.1-noble@sha256:70e367e0cbf60340a5b5fd562f6247a34eb3196efab9f88a3dd56482d9fe09d2 \
    sh -c 'mkdir -p /tmp/pw && cd /tmp/pw && npm i --no-save --no-audit --no-fund playwright@1.49.1 >/dev/null && cd /w && node "$SCRIPT"'
