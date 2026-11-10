#!/usr/bin/env bash
# Load tests against a throwaway QBase + PostgreSQL in Docker.
#
#   npm run load                 all scenarios, in turn
#   npm run load -- mixed        one of: login-storm | mixed | share-read | sse
#   npm run load -- sizes        share-read and sse at 5, 35 and 100 tables per diagram
#   npm run load -- down         remove the stack
#
# Knobs (environment): VUS, DURATION, RATE, LOAD_USERS (accounts, keep >= VUS),
# LOAD_TABLES (default 35), VIEWERS, PUBLISHES, LOAD_APP_CPUS, LOAD_APP_MEM, DB_POOL_MAX.
# Results go to server/load/results/.
set -euo pipefail
cd "$(dirname "$0")"

dc() { docker compose -f docker-compose.yml "$@"; }

# Secrets for this run only: the database password, the key that encrypts saved
# connections, and the passwords of the accounts the seed creates. Nothing in
# the repository is a credential, and the stack is thrown away at the end. A
# password needs a capital, a digit and a symbol, so each has "Ld-" and "-1".
secret() { od -An -N"$1" -tx1 /dev/urandom | tr -d ' \n'; }
export LOAD_DB_PASSWORD="${LOAD_DB_PASSWORD:-$(secret 16)}"
export LOAD_CONNECTION_KEY="${LOAD_CONNECTION_KEY:-$(secret 24)}"
# the first sign-up, which the seed makes, needs this token
export LOAD_SETUP_TOKEN="${LOAD_SETUP_TOKEN:-$(secret 16)}"
export LOAD_PASSWORD="${LOAD_PASSWORD:-Ld-$(secret 12)-1}"
export LOAD_TEMP_PASSWORD="${LOAD_TEMP_PASSWORD:-Ld-$(secret 12)-2}"
# helpers write into this folder: as the caller, not as root
as_me=(--user "$(id -u):$(id -g)")
what="${1:-all}"

if [ "$what" = down ]; then dc down -v; exit 0; fi
case "$what" in all|sizes|login-storm|mixed|share-read|sse) ;; *)
    echo "unknown scenario: $what (login-storm | mixed | share-read | sse | all | sizes | down)" >&2; exit 2 ;;
esac

# editors and sign-ins need an account per virtual user; viewers need none
vus="${VUS:-50}"
case "$what" in
    share-read|sse|sizes) export LOAD_USERS="${LOAD_USERS:-10}" ;;
    *)
        export LOAD_USERS="${LOAD_USERS:-$(( vus > 200 ? vus : 200 ))}"
        if [ "$LOAD_USERS" -lt "$vus" ]; then echo "LOAD_USERS ($LOAD_USERS) must be at least VUS ($vus)" >&2; exit 2; fi ;;
esac

mkdir -p results
# every scenario starts from a fresh database: the data they leave behind (snapshots,
# audit rows) would make the next one slower for reasons that are not its own
fresh() {
    dc down >/dev/null 2>&1 || true
    dc up -d --wait app || { dc logs app | tail -30; return 1; }
    dc exec -T db psql -U qbase -qc "create extension if not exists pg_stat_statements" >/dev/null
    dc run --rm "${as_me[@]}" seed node seed.mjs
}

k6run() {
    local name="$1"
    dc run --rm "${as_me[@]}" k6 run --summary-export "/load/results/$name.json" "/load/$name.js" \
        | tee "results/$name.txt"
}

run_one() {
    fresh || return 1
    case "$1" in
        sse) dc run --rm "${as_me[@]}" seed node sse-fanout.mjs | tee results/sse.txt ;;
        *)   k6run "$1" ;;
    esac
    echo
    echo "--- server and database after $1 ---"
    dc exec -T db psql -U qbase -c "select left(query, 60) as query, calls, round(mean_exec_time::numeric, 2) as mean_ms, round(total_exec_time::numeric) as total_ms from pg_stat_statements order by total_exec_time desc limit 5" 2>/dev/null || true
}

# the same read-heavy load against diagrams of different sizes: a model of 30-40
# tables is the common case, an empty one flatters the server, a huge one is the worst
sizes() {
    local out=results/sizes.txt
    : > "$out"
    for t in 5 35 100; do
        export LOAD_TABLES=$t
        for s in share-read sse; do
            run_one "$s" || status=1
            cp "results/$s.txt" "results/$s-${t}tables.txt"
        done
        {
            echo "== $t tables per diagram"
            grep -E "^ *http_reqs|http_req_duration\.\.\." "results/share-read-${t}tables.txt" | head -2
            grep -E "all events|snapshot re-read|RESULT" "results/sse-${t}tables.txt"
        } | tee -a "$out"
    done
}

status=0
if [ "$what" = sizes ]; then
    sizes
elif [ "$what" = all ]; then
    for s in login-storm mixed share-read sse; do run_one "$s" || status=1; done
else
    run_one "$what" || status=1
fi
dc down >/dev/null 2>&1 || true
exit $status
