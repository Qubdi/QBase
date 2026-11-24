#!/usr/bin/env bash
# Live check of QBase in QAuth mode (AUTH_PROVIDER=qauth): a real QAuth server (with its own
# Postgres) and a real QBase server (with its own), driven over HTTP: sign-in, two-step at QAuth,
# QBase's roles, password change, QAuth ending a sign-in, sign-out. Needs only Docker and curl.
#   QAUTH_REPO=/path/to/qauth bash tools/qauth-integration/run.sh
set -uo pipefail
NET=live-net; QDB=live-qauth-db; QA=live-qauth; BDB=live-qbase-db; QB=live-qbase
cleanup() { docker rm -f $QA $QDB $QB $BDB >/dev/null 2>&1 || true; docker network rm $NET >/dev/null 2>&1 || true; }
trap cleanup EXIT; cleanup
HERE="$(cd "$(dirname "$0")" && pwd)"; QBASE_ROOT="$(cd "$HERE/../.." && pwd)"
cd "${QAUTH_REPO:?set QAUTH_REPO to a checkout of QAuth}"
docker build -q -f server/Dockerfile -t qauth-server:live . >/dev/null
docker network create $NET >/dev/null
docker run -d --name $QDB --network $NET -e POSTGRES_USER=qauth -e POSTGRES_PASSWORD=live -e POSTGRES_DB=qauth postgres:19@sha256:766ddae4967301b9802b341bb596905f11dd5c558149690a7a4d80c2f61bbcf9 >/dev/null
docker run -d --name $BDB --network $NET -e POSTGRES_USER=qbase -e POSTGRES_PASSWORD=live -e POSTGRES_DB=qbase postgres:18-alpine >/dev/null
for _ in $(seq 1 40); do docker exec $QDB pg_isready -U qauth -d qauth >/dev/null 2>&1 && docker exec $BDB pg_isready -U qbase -d qbase >/dev/null 2>&1 && break; sleep 1; done; sleep 2
docker run -d --name $QA --network $NET -p 127.0.0.1:18080:8080 \
  -e QAUTH_DATABASE_URL=postgresql+asyncpg://qauth:live@$QDB:5432/qauth -e QAUTH_SECRET_KEY=live-secret-key-0123456789abcdef0123 \
  -e QAUTH_SETUP_TOKEN=live-setup-token-123456 -e QAUTH_AUTO_MIGRATE=true -e QAUTH_COOKIE_SECURE=false -e QAUTH_PUBLIC_URL=http://localhost:18080 \
  -e QAUTH_BACKGROUND=false -e QAUTH_OIDC_PROVIDER_ENABLED=true -e QAUTH_REFRESH_IN_BODY=true \
  -e QAUTH_TRUSTED_PROXIES=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16 qauth-server:live >/dev/null
for _ in $(seq 1 40); do curl -sf http://127.0.0.1:18080/auth/health >/dev/null 2>&1 && break; sleep 1; done
# set QAuth up: an administrator, QBase registered as an app, its first administrator invited
export IDS_ENV="$(mktemp)"; python3 "$HERE/setup_qauth.py" > "$IDS_ENV" || { echo "QAuth setup failed"; docker logs $QA 2>&1 | tail -20; exit 1; }
source "$IDS_ENV"
cd "$QBASE_ROOT/server"
docker run -d --name $QB --network $NET -p 127.0.0.1:13001:3001 -v "$PWD/..":/app -w /app/server \
  -e DATABASE_URL=postgres://qbase:live@$BDB:5432/qbase -e HOST=0.0.0.0 -e PORT=3001 -e TRUST_PROXY=0 -e COOKIE_SECURE=false \
  -e AUTH_PROVIDER=qauth -e QAUTH_URL=http://$QA:8080 -e QAUTH_CLIENT_ID=$CLIENT_ID -e SECRETS_KEY=live-secrets-key-0123456789abcdef -e LOG_LEVEL=warn \
  node:24-slim npx tsx src/server.ts >/dev/null
for _ in $(seq 1 60); do curl -sf http://127.0.0.1:13001/health >/dev/null 2>&1 && break; sleep 1; done
python3 "$HERE/drive.py"; rc=$?
if [ $rc -ne 0 ]; then echo "--- qbase log"; docker logs $QB 2>&1 | tail -30; echo "--- qauth log"; docker logs $QA 2>&1 | tail -15; fi
exit $rc
