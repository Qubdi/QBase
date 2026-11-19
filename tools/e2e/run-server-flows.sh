#!/bin/sh
# Real-browser flows of SERVER mode (see server-flows.mjs): the Docker image of
# this checkout, a throwaway PostgreSQL as its backend, a second throwaway
# PostgreSQL as the "live source database" and Playwright, all on one private
# network. Everything is named qbtest-*, uses random passwords, publishes no
# port and is removed at the end, also on failure or Ctrl-C.
#   tools/e2e/run-server-flows.sh [shots-dir]
#   ONLY=S3,S5 tools/e2e/run-server-flows.sh     (run some flows only)
# Needs the images postgres:18-alpine and mcr.microsoft.com/playwright:v1.49.1-noble@sha256:70e367e0cbf60340a5b5fd562f6247a34eb3196efab9f88a3dd56482d9fe09d2
# (docker pull once). The app image qbtest-app is built from this checkout on every run and
# removed again at the end (KEEP_IMAGE=1 keeps it; REUSE=<id> reuses the image and the stack).
# SQL Server is not started (its image needs an accepted EULA).
set -u
cd "$(dirname "$0")/../.."
SHOTS="${1:-/tmp/qbase-server-flows}"
mkdir -p "$SHOTS"
ID="${REUSE:-$(openssl rand -hex 3)}"
NET="qbtest-net-$ID"
APPDB="qbtest-appdb-$ID"
SRCDB="qbtest-srcdb-$ID"
APP="qbtest-app-$ID"
PGIMG="postgres:18-alpine"
BUILT=0
SECRETS="/tmp/qbtest-$ID.env"
PW_CACHE="${PW_CACHE:-/tmp/qbase-e2e-pw}"
mkdir -p "$PW_CACHE"

cleanup() {
    if [ -n "${KEEP:-}" ] || [ -n "${REUSE:-}" ]; then echo "left running: id $ID"; return; fi
    rm -f "$SECRETS"
    docker rm -f "$APP" "$APPDB" "$SRCDB" >/dev/null 2>&1
    docker network rm "$NET" >/dev/null 2>&1
    if [ "$BUILT" = 1 ] && [ -z "${KEEP_IMAGE:-}" ]; then
        docker rmi qbtest-app >/dev/null 2>&1
    fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# built from this checkout on every run, so the flows test the code as it is now (Docker's
# layer cache makes an unchanged tree quick); only REUSE of a running stack keeps the image
if [ -z "${REUSE:-}" ] || ! docker image inspect qbtest-app >/dev/null 2>&1; then
    BUILT=1
    docker build -q -t qbtest-app . >/dev/null || exit 1
fi

if [ -z "${REUSE:-}" ]; then
APP_PW="$(openssl rand -hex 12)"
SRC_PW="$(openssl rand -hex 12)"
CONN_KEY="$(openssl rand -hex 16)"
ADMIN_PW="Aa1!$(openssl rand -hex 8)"
# the first admin of an empty server needs this token (the server would otherwise make one and only print it)
SETUP_TOKEN="$(openssl rand -hex 16)"
(umask 077; printf 'SRC_PW=%s\nADMIN_PW=%s\nSETUP_TOKEN=%s\n' "$SRC_PW" "$ADMIN_PW" "$SETUP_TOKEN" > "$SECRETS")
docker network create "$NET" >/dev/null || exit 1
docker run -d --name "$APPDB" --network "$NET" -e POSTGRES_USER=qbase -e POSTGRES_PASSWORD="$APP_PW" -e POSTGRES_DB=qbase "$PGIMG" >/dev/null || exit 1
docker run -d --name "$SRCDB" --network "$NET" -e POSTGRES_USER=src -e POSTGRES_PASSWORD="$SRC_PW" -e POSTGRES_DB=shop "$PGIMG" >/dev/null || exit 1
for c in "$APPDB" "$SRCDB"; do
    i=0
    until docker exec "$c" pg_isready -q -h 127.0.0.1 >/dev/null 2>&1; do
        i=$((i + 1))
        [ "$i" -gt 60 ] && { echo "$c did not start"; exit 1; }
        sleep 1
    done
done
sleep 2
docker run -d --name "$APP" --network "$NET" \
    -e DATABASE_URL="postgres://qbase:$APP_PW@$APPDB:5432/qbase" \
    -e CONNECTION_KEY="$CONN_KEY" -e INTROSPECT_ALLOW_HOSTS="$SRCDB" -e SETUP_TOKEN="$SETUP_TOKEN" \
    -e AUTH_RATE_LIMIT=1000 -e LOG_LEVEL=warn -e PORT=3001 \
    qbtest-app >/dev/null || exit 1
i=0
until docker exec "$APP" node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" >/dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -gt 60 ] && { echo "app did not start"; docker logs "$APP" | tail -20; exit 1; }
    sleep 1
done
else
    . "$SECRETS"
fi
docker run --rm --ipc=host --network "$NET" -u "$(id -u)" -e HOME=/tmp -e SHOTS=/shots \
    -e BASE_URL="http://$APP:3001" -e SRC_HOST="$SRCDB" -e SRC_USER=src \
    -e SRC_PASSWORD="$SRC_PW" -e SRC_DB=shop -e ADMIN_PASSWORD="$ADMIN_PW" -e SETUP_TOKEN="$SETUP_TOKEN" \
    -e ONLY="${ONLY:-}" -e SCRIPT="${SCRIPT:-tools/e2e/server-flows.mjs}" \
    -v "$PWD":/w:ro -v "$SHOTS":/shots -v "$PW_CACHE":/tmp/pw -w /w \
    mcr.microsoft.com/playwright:v1.49.1-noble@sha256:70e367e0cbf60340a5b5fd562f6247a34eb3196efab9f88a3dd56482d9fe09d2 \
    sh -c '[ -d /tmp/pw/node_modules/playwright ] || (mkdir -p /tmp/pw && cp /w/tools/e2e/package.json /w/tools/e2e/package-lock.json /tmp/pw/ && cd /tmp/pw && npm ci --no-audit --no-fund >/dev/null); cd /w && node "$SCRIPT"'
STATUS=$?
echo "app container log (last lines):"
docker logs "$APP" 2>&1 | tail -5
exit $STATUS
