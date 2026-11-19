#!/usr/bin/env bash
# Run QBase's tests by hand, from this checkout.
#
#   bash test.sh                 a menu: pick what to run
#
# or name the suite directly:
#
#   bash test.sh unit [paths]     editor unit and component tests (vitest)
#   bash test.sh server [paths]   server tests, against a throwaway PostgreSQL
#   bash test.sh coverage         editor and server tests with a coverage report
#   bash test.sh lint             eslint and tsc, editor and server
#   bash test.sh bench            performance budgets of the core code (vitest;
#                                 PERF_BUDGET_SCALE=2 on a slow machine)
#   bash test.sh bench-table      timings at 50/200/500/1000 tables (vitest bench)
#   bash test.sh smoke | flows | server-flows | a11y     real-browser tests (Playwright)
#   bash test.sh perf             browser performance on 50/200/500-table diagrams
#   bash test.sh load [scenario]  server load test with k6 (see server/load/README.md)
#   bash test.sh quick            lint + unit + server: what to run before a commit
#   bash test.sh all              everything above except load, then a summary
#
# Node is used from the host when it is installed, otherwise from the node:24-slim
# image, so only Docker is needed. Reports and screenshots go to OUT
# (default /tmp/qbase-tests). Set NO_COLOR=1 for plain output. The browser
# suites take ONLY=F1,F3 and SKIP_BUILD=1 like the scripts in tools/e2e.
set -uo pipefail

cd "$(dirname "$0")"

OUT="${OUT:-/tmp/qbase-tests}"
NODE_IMAGE=node:24-slim
PG_IMAGE=postgres:18-alpine
mkdir -p "$OUT"

# --- Colours (only on a terminal, and not with NO_COLOR) ---------------------
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
    BOLD=$'\e[1m' DIM=$'\e[2m' RESET=$'\e[0m'
    RED=$'\e[31m' GREEN=$'\e[32m' YELLOW=$'\e[33m' BLUE=$'\e[34m' MAGENTA=$'\e[35m' CYAN=$'\e[36m'
else
    BOLD='' DIM='' RESET='' RED='' GREEN='' YELLOW='' BLUE='' MAGENTA='' CYAN=''
fi

step() { echo; echo "${BOLD}${BLUE}==>${RESET} ${BOLD}$*${RESET}"; }
ok()   { echo "${GREEN}✔${RESET} $*"; }
warn() { echo "${YELLOW}!${RESET} ${YELLOW}$*${RESET}"; }
err()  { echo "${RED}✖ $*${RESET}" >&2; }

usage() {
    sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
}

# Runs a command, then reports whether it worked and how long it took
report() {
    local start=$SECONDS status
    "$@"
    status=$?
    if [[ $status -eq 0 ]]; then
        ok "Passed ${DIM}($((SECONDS - start)) s)${RESET}"
    else
        err "Failed (exit $status, $((SECONDS - start)) s)."
    fi
    return $status
}

# --- Node: from the host, else from a container ------------------------------
# node_in <dir> <command...>: runs the command in <dir> (relative to the repo)
node_in() {
    local dir="$1"
    shift
    if command -v node >/dev/null 2>&1 && command -v npx >/dev/null 2>&1; then
        (cd "$dir" && "$@")
    else
        local opts=() name
        [[ -t 0 && -t 1 ]] && opts+=(-t)
        # only the variables that are set: an empty TEST_PG_PORT is not "use the default"
        for name in CI NO_COLOR TEST_PG_PORT TEST_PG_USER TEST_PG_PASSWORD PERF_BUDGET_SCALE; do
            [[ -n "${!name:-}" ]] && opts+=(-e "$name")
        done
        docker run --rm "${opts[@]}" --network host -u "$(id -u):$(id -g)" -e HOME=/tmp \
            -e NPM_CONFIG_UPDATE_NOTIFIER=false -v "$PWD":/app -v "$OUT":"$OUT" -w "/app/$dir" "$NODE_IMAGE" "$@"
    fi
}

need_modules() {
    local dir
    for dir in . server; do
        if [[ ! -d "$dir/node_modules" ]]; then
            err "$dir/node_modules is missing. Install first: (cd $dir && npm ci)"
            return 1
        fi
    done
}

# --- A throwaway PostgreSQL for the server tests -----------------------------
# Used unless TEST_PG_PORT is set (then that database is used as it is).
PG_CONTAINER=""
start_pg() {
    if [[ -n "${TEST_PG_PORT:-}" ]]; then
        echo "  Using the PostgreSQL on port $TEST_PG_PORT ${DIM}(TEST_PG_PORT)${RESET}"
        return 0
    fi
    local password port i
    password=$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')
    PG_CONTAINER="qbase-test-pg-$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')"
    docker run -d --name "$PG_CONTAINER" -e POSTGRES_USER=qbase \
        -e POSTGRES_PASSWORD="$password" -p 127.0.0.1::5432 "$PG_IMAGE" >/dev/null ||
        { err "Could not start $PG_IMAGE."; PG_CONTAINER=""; return 1; }
    port=$(docker port "$PG_CONTAINER" 5432/tcp | head -n 1 | sed 's/.*://')
    i=0
    # pg_isready over TCP: the image's first, socket-only start does not count
    until docker exec "$PG_CONTAINER" pg_isready -q -h 127.0.0.1 -U qbase >/dev/null 2>&1; do
        i=$((i + 1))
        [[ $i -gt 60 ]] && { err "PostgreSQL did not start."; stop_pg; return 1; }
        sleep 1
    done
    export TEST_PG_PORT="$port" TEST_PG_USER=qbase TEST_PG_PASSWORD="$password"
    echo "  Throwaway PostgreSQL ${CYAN}$PG_CONTAINER${RESET} on port $port"
}

stop_pg() {
    if [[ -n "$PG_CONTAINER" ]]; then
        docker rm -f "$PG_CONTAINER" >/dev/null 2>&1
        unset TEST_PG_PORT TEST_PG_USER TEST_PG_PASSWORD
        PG_CONTAINER=""
    fi
}
trap stop_pg EXIT
trap 'exit 130' INT TERM

# --- Suites -------------------------------------------------------------------
suite_unit() {
    step "Editor unit and component tests"
    need_modules && report node_in . npx vitest run "$@"
}

suite_server() {
    step "Server tests"
    need_modules || return 1
    start_pg || return 1
    report node_in server npx vitest run "$@"
    local status=$?
    stop_pg
    return $status
}

suite_coverage() {
    step "Coverage: editor"
    need_modules || return 1
    local status=0
    node_in . npx vitest run --coverage --coverage.include='src/**' \
        --coverage.reporter=text-summary --coverage.reporter=html \
        --coverage.reportsDirectory="$OUT/coverage-editor" || status=1
    step "Coverage: server"
    if start_pg; then
        node_in server npx vitest run --coverage --coverage.include='src/**' \
            --coverage.reporter=text-summary --coverage.reporter=html \
            --coverage.reportsDirectory="$OUT/coverage-server" || status=1
        stop_pg
    else
        status=1
    fi
    echo "  HTML reports: ${BOLD}$OUT/coverage-editor/index.html${RESET}"
    echo "                ${BOLD}$OUT/coverage-server/index.html${RESET}"
    [[ $status -eq 0 ]] && ok "Passed" || err "Failed."
    return $status
}

suite_lint() {
    step "Lint and type check"
    need_modules || return 1
    local status=0
    echo "  ${DIM}editor: eslint${RESET}";  node_in . npx eslint . --report-unused-disable-directives --max-warnings 0 || status=1
    echo "  ${DIM}editor: tsc${RESET}";     node_in . npx tsc -b || status=1
    echo "  ${DIM}server: eslint${RESET}";  node_in server npx eslint . --report-unused-disable-directives --max-warnings 0 || status=1
    echo "  ${DIM}server: tsc${RESET}";     node_in server npx tsc -p tsconfig.json --noEmit || status=1
    [[ $status -eq 0 ]] && ok "Passed" || err "Failed."
    return $status
}

suite_bench() {
    step "Performance budgets of the core code"
    need_modules || return 1
    if [[ ! -f vitest.perf.config.ts ]]; then
        err "vitest.perf.config.ts is missing."
        return 1
    fi
    report node_in . npx vitest run --config vitest.perf.config.ts "$@"
}

# Browser suites: the scripts in tools/e2e, which run in the Playwright image
suite_browser() {  # name, script, title
    step "$3"
    local status
    report env SHOTS="$OUT/$1" sh "tools/e2e/$2" "$OUT/$1"
    status=$?
    echo "  Screenshots and results: ${BOLD}$OUT/$1${RESET}"
    return $status  # the status of report, not of the echo
}

suite_load() {
    step "Server load test ${DIM}(k6, about 10 minutes for all scenarios)${RESET}"
    report bash server/load/run.sh "$@"
}

# --- Several suites with a summary --------------------------------------------
RESULTS=()
track() {  # name, command...
    local name="$1"
    shift
    if "$@"; then RESULTS+=("${GREEN}✔${RESET} $name"); else RESULTS+=("${RED}✖${RESET} $name"); fi
}

summary() {
    local line failed=0
    echo
    echo "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━ Summary ━━━━━━━━━━━━━━━━━━━${RESET}"
    for line in "${RESULTS[@]}"; do
        echo "  $line"
        [[ "$line" == *✖* ]] && failed=1
    done
    RESULTS=()
    return $failed
}

suite_quick() {
    track lint suite_lint
    track unit suite_unit
    track server suite_server
    summary
}

suite_all() {
    track lint suite_lint
    track unit suite_unit
    track server suite_server
    track bench suite_bench
    track smoke suite_browser smoke run-smoke.sh "Browser smoke test"
    # the smoke run built dist; the next browser suites reuse it (the performance
    # suite builds into its own folder, so it always builds)
    SKIP_BUILD=1 track flows suite_browser flows run-flows.sh "Browser flows (local mode)"
    track server-flows suite_browser server-flows run-server-flows.sh "Browser flows (server mode)"
    SKIP_BUILD=1 track a11y suite_browser a11y run-a11y.sh "Accessibility audit"
    track perf suite_browser perf run-perf.sh "Browser performance"
    summary
}

run() {
    local command="${1:-}"
    [[ $# -gt 0 ]] && shift
    case "$command" in
        unit)         suite_unit "$@" ;;
        server)       suite_server "$@" ;;
        coverage)     suite_coverage ;;
        lint)         suite_lint ;;
        bench)        suite_bench "$@" ;;
        bench-table)  step "Benchmark tables of the core code"
                      need_modules && report node_in . npx vitest bench --run --config vitest.perf.config.ts "$@" ;;
        smoke)        suite_browser smoke run-smoke.sh "Browser smoke test" ;;
        flows)        suite_browser flows run-flows.sh "Browser flows (local mode)" ;;
        server-flows) suite_browser server-flows run-server-flows.sh "Browser flows (server mode)" ;;
        a11y)         suite_browser a11y run-a11y.sh "Accessibility audit" ;;
        perf)         suite_browser perf run-perf.sh "Browser performance" ;;
        load)         suite_load "$@" ;;
        quick)        suite_quick ;;
        all)          suite_all ;;
        -h|--help|help) usage ;;
        *) usage; return 1 ;;
    esac
}

# --- Menu ----------------------------------------------------------------------
item() {  # key, name, description, colour of the key
    printf "  ${4:-$CYAN}${BOLD}%2s${RESET}  %-13s ${DIM}%s${RESET}\n" "$1" "$2" "$3"
}

node_state() {
    if command -v node >/dev/null 2>&1; then
        echo "${GREEN}●${RESET} node $(node --version)"
    else
        echo "${DIM}○ node in Docker ($NODE_IMAGE)${RESET}"
    fi
}

menu() {
    local choice
    while true; do
        echo
        echo "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
        echo "  ${BOLD}QBase tests${RESET}   $(node_state)"
        echo "  ${DIM}output: $OUT${RESET}"
        echo "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
        echo "  ${DIM}Fast${RESET}"
        item 1 unit         "editor unit and component tests"
        item 2 server       "server tests (throwaway PostgreSQL)"
        item 3 lint         "eslint and tsc, editor and server"
        item 4 coverage     "editor and server, with an HTML report"
        item 5 bench        "performance budgets of the core code"
        echo "  ${DIM}Browser (Playwright in Docker)${RESET}"
        item 6 smoke        "does the built app start and work"
        item 7 flows        "user flows, local mode"
        item 8 server-flows "user flows, server mode"
        item 9 a11y         "accessibility audit"
        echo "  ${DIM}Performance${RESET}"
        item 10 perf        "browser, 50/200/500-table diagrams"
        item 11 load        "server load test with k6 (long)" "$YELLOW"
        echo "  ${DIM}Groups${RESET}"
        item q quick        "lint + unit + server (before a commit)" "$MAGENTA"
        item a all          "everything except load, with a summary" "$MAGENTA"
        item 0 quit         ""
        echo
        read -r -p "${BOLD}Choose:${RESET} " choice || exit 0
        # a failed suite shows its error and returns to the menu
        case "$choice" in
            1) run unit || true ;;
            2) run server || true ;;
            3) run lint || true ;;
            4) run coverage || true ;;
            5) run bench || true ;;
            6) run smoke || true ;;
            7) run flows || true ;;
            8) run server-flows || true ;;
            9) run a11y || true ;;
            10) run perf || true ;;
            11) run load || true ;;
            q|Q) run quick || true ;;
            a|A) run all || true ;;
            0|quit|exit) echo "${DIM}Bye.${RESET}"; exit 0 ;;
            *) err "Choose an entry from the list." ;;
        esac
    done
}

if [[ $# -eq 0 ]]; then
    menu
else
    run "$@"
fi
