#!/bin/sh
# Performance measurements of the built app on large diagrams (see perf.mjs).
# Same Docker approach as run-smoke.sh.
#   tools/e2e/run-perf.sh [out-dir]    SIZES=50,200 PROFILE=1 TRACE=1 LOADONLY=1 SKIP_BUILD=1 tools/e2e/run-perf.sh
# Results: a table on stdout, out-dir/perf-results.json, and (PROFILE=1) CPU
# profile summaries per slow phase in out-dir/profile-*.txt.
set -e
cd "$(dirname "$0")/../.."
OUT="${1:-/tmp/qbase-perf}"
mkdir -p "$OUT"
docker run --rm --ipc=host -u "$(id -u)" -e HOME=/tmp -e OUT=/out \
    -e SIZES="$SIZES" -e TRACE="$TRACE" -e STEPS="$STEPS" -e EXPERIMENT_CSS="$EXPERIMENT_CSS" -e LOADONLY="$LOADONLY" -e PROFILE="$PROFILE" -e SKIP_BUILD="$SKIP_BUILD" -e SOURCES="$SOURCES" \
    -v "$PWD":/w -v "$OUT":/out -w /w \
    mcr.microsoft.com/playwright:v1.49.1-noble@sha256:70e367e0cbf60340a5b5fd562f6247a34eb3196efab9f88a3dd56482d9fe09d2 \
    sh -c 'mkdir -p /tmp/pw && cp /w/tools/e2e/package.json /w/tools/e2e/package-lock.json /tmp/pw/ && cd /tmp/pw && npm ci --no-audit --no-fund >/dev/null && cd /w && node tools/e2e/perf.mjs'
