#!/usr/bin/env bash
# Build, run and push the QBase image (qubdi/qbase) from this checkout.
#
#   bash run.sh                  a menu: pick a command, it asks for the version
#
# or name the command directly:
#
#   bash run.sh start   [version]   first time: make .env with random secrets, build QBase
#                                   from this checkout and start it (needs only Docker)
#   bash run.sh setup               only make .env (copies .env.example, replaces its two dummy
#                                   secrets with random ones; never changes a value you set)
#   bash run.sh build   [version]   build qubdi/qbase:<version> from this checkout
#   bash run.sh rebuild [version]   build from scratch (no cache, fresh base images), then start it
#   bash run.sh up      [version]   start QBase: the local image of that version if there is
#                                   one, otherwise it is pulled from Docker Hub
#   bash run.sh down                stop; the data stays in the postgres-data volume
#   bash run.sh down -v             stop AND delete all data (asks first)
#   bash run.sh push    <version>   push qubdi/qbase:<version> to Docker Hub (asks first), and
#                                   move latest to it, replacing the previous latest; a
#                                   prerelease such as 1.0.5-rc1 never moves latest
#                                   --all-platforms: build for amd64 and arm64 and push that
#                                   --no-latest: push the version only, latest stays as it is
#   bash run.sh ps | logs           status, or follow the app's log
#
# version: a tag such as 1.0.5 or 1.0.5-rc1. Without one, QBASE_VERSION from the
# environment or .env is used, else the version docker-compose.yml names. Set NO_COLOR=1 for plain output.
set -euo pipefail

cd "$(dirname "$0")"

IMAGE=qubdi/qbase
BASE=(docker compose -f docker-compose.yml)
BUILD=(docker compose -f docker-compose.yml -f docker-compose.build.yml)
# a narrower `ps`: service, image, state and ports
PS_FORMAT='table {{.Service}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'

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
tag()  { echo "${CYAN}${BOLD}$IMAGE:$1${RESET}"; }

# Runs a command, then reports whether it worked
report() {
    if "$@"; then ok "Done."; else err "Failed (exit $?)."; return 1; fi
}

usage() {
    # the comment block at the top of this file
    awk '/^set -euo/ { exit } NR > 1 { sub(/^# ?/, ""); print }' "$0"
}

# Asks yes/no; fails (so the command stops) unless the answer is yes
confirm() {
    local answer
    read -r -p "${YELLOW}${BOLD}?${RESET} $1 ${DIM}[y/N]${RESET} " answer
    [[ "$answer" =~ ^[Yy]$ ]] || { warn "Cancelled."; return 1; }
}

# The version from .env or the environment, else the one docker-compose.yml names
default_version() {
    local version="${QBASE_VERSION:-}"
    if [[ -z "$version" && -f .env ]]; then
        version=$(sed -n 's/^QBASE_VERSION=//p' .env | tail -n 1 | tr -d '\r"'"'")
    fi
    if [[ -z "$version" ]]; then
        version=$(sed -n 's/.*QBASE_VERSION:-\([^}]*\)}.*/\1/p' docker-compose.yml | head -n 1)
    fi
    echo "${version:-latest}"
}

set_version() {
    export QBASE_VERSION="${1:-$(default_version)}"
    echo "  Image: $(tag "$QBASE_VERSION")"
}

# A random hex string of $1 bytes (twice as many characters)
random_secret() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex "$1"
    else
        head -c "$1" /dev/urandom | od -An -vtx1 | tr -d ' \n'
    fi
}

# The value of KEY in .env (empty when unset)
env_value() {
    sed -n "s/^$1=//p" .env | tail -n 1 | tr -d '\r"'"'"
}

# Sets KEY=value in .env: replaces the line, or adds one
set_env() {
    local tmp
    tmp=$(mktemp)
    if grep -q "^$1=" .env; then
        awk -v key="$1" -v value="$2" 'BEGIN { FS = OFS = "=" } $1 == key { print key "=" value; next } { print }' .env > "$tmp"
    else
        cp .env "$tmp"
        printf '%s=%s\n' "$1" "$2" >> "$tmp"
    fi
    cat "$tmp" > .env   # keeps the file's permissions
    rm -f "$tmp"
}

# The dummy secrets .env.example ships, so that QBase starts straight away. They are
# public: the server warns while it runs on one, and a test keeps these in step with
# .env.example and server/src/config.ts.
DUMMY_POSTGRES_PASSWORD=dummy-db-password-change-me
DUMMY_CONNECTION_KEY=dummy-connection-key-change-me-0123456789

# Makes .env from .env.example when there is none, and gives the two values Compose
# requires random secrets when they are empty or, in the .env just made, still the dummies
# .env.example ships. A value you have set stays as it is. In an .env that already exists
# a dummy is only warned about: the database keeps the password it was created with, so
# changing it under an existing database would lock QBase out.
setup_env() {
    local fresh=false
    if [[ ! -f .env ]]; then
        [[ -f .env.example ]] || { err ".env.example is missing: run this from the QBase folder."; return 1; }
        cp .env.example .env
        chmod 600 .env
        ok "Made .env from .env.example"
        fresh=true
    else
        echo "  .env exists: only empty required values are filled in; a dummy value is only warned about."
    fi
    local made=false value
    value=$(env_value POSTGRES_PASSWORD)
    if [[ -z "$value" ]] || { $fresh && [[ "$value" == "$DUMMY_POSTGRES_PASSWORD" ]]; }; then
        set_env POSTGRES_PASSWORD "$(random_secret 12)"
        ok "Made POSTGRES_PASSWORD"
        made=true
    fi
    value=$(env_value CONNECTION_KEY)
    if [[ -z "$value" ]] || { $fresh && [[ "$value" == "$DUMMY_CONNECTION_KEY" ]]; }; then
        set_env CONNECTION_KEY "$(random_secret 24)"
        ok "Made CONNECTION_KEY"
        made=true
    fi
    if [[ -z "$(env_value SETUP_TOKEN)" ]]; then
        set_env SETUP_TOKEN "$(random_secret 16)"
        ok "Made SETUP_TOKEN (the first account asks for it)"
        made=true
    fi
    if $made; then
        warn ".env now holds passwords and keys: keep it private and never commit it."
        warn "Back up CONNECTION_KEY with your database backups: without it, saved database connections cannot be read."
    fi
    if [[ "$(env_value POSTGRES_PASSWORD)" == "$DUMMY_POSTGRES_PASSWORD" ]]; then
        warn "POSTGRES_PASSWORD in .env is still the dummy value from .env.example, which anyone can read. Set your own before the first start: an existing database keeps the password it was created with."
    fi
    if [[ "$(env_value CONNECTION_KEY)" == "$DUMMY_CONNECTION_KEY" ]]; then
        warn "CONNECTION_KEY in .env is still the dummy value from .env.example, which anyone can read. Set your own before you save any database connection."
    fi
}

# Points latest at the version just pushed: the registry copies that image to the
# new tag, nothing is rebuilt. The image latest named before ($2, a digest, or
# nothing) stays on Docker Hub under its own version tag.
promote_latest() {
    step "Move latest"
    report docker buildx imagetools create --tag "$IMAGE:latest" "$IMAGE:$1" || return 1
    if [[ -n "$2" ]]; then
        echo "  The previous latest was $2. To put it back:"
        echo "  docker buildx imagetools create --tag $IMAGE:latest $IMAGE@$2"
    fi
}

push() {
    local all_platforms=false latest=true version="" arg
    for arg in "$@"; do
        case "$arg" in
            --all-platforms) all_platforms=true ;;
            --no-latest) latest=false ;;
            -*) err "Unknown option: $arg"; return 1 ;;
            *) version="$arg" ;;
        esac
    done
    if [[ -z "$version" || "$version" == "latest" ]]; then
        err "Give the version to push, e.g. 1.0.5 (a stable version also moves latest; latest is not a version of its own)."
        return 1
    fi
    # a prerelease never moves latest
    if $latest && [[ "$version" == *-* ]]; then
        warn "$version is a prerelease: latest is not moved."
        latest=false
    fi
    # what latest names now, kept to print so it can be put back
    local previous="" what
    what=$(tag "$version")
    if $latest; then
        previous=$(docker buildx imagetools inspect "$IMAGE:latest" --format '{{.Manifest.Digest}}' 2>/dev/null || true)
        what="$what and $(tag latest) (replacing the current latest${previous:+, $previous})"
    fi
    if $all_platforms; then
        step "Build for amd64 + arm64 and push"
        set_version "$version"
        confirm "Build $what for amd64 and arm64 and push to Docker Hub?" || return 1
        report docker buildx build --platform linux/amd64,linux/arm64 \
            -t "$IMAGE:$version" --push . || return 1
    else
        step "Push to Docker Hub"
        set_version "$version"
        if ! docker image inspect "$IMAGE:$version" >/dev/null 2>&1; then
            err "There is no local $IMAGE:$version. Build it first: bash run.sh build $version"
            return 1
        fi
        warn "This pushes the image built for this machine only ($(docker version -f '{{.Server.Arch}}'))."
        warn "Choose \"push all\" for amd64 and arm64."
        if $latest; then
            warn "latest would then be for this platform only too: other platforms could no longer pull it."
        fi
        confirm "Push $what to Docker Hub?" || return 1
        report "${BUILD[@]}" push app || return 1
    fi
    if $latest; then
        promote_latest "$version" "$previous"
    fi
}

run() {
    local command="${1:-}"
    [[ $# -gt 0 ]] && shift
    case "$command" in
        setup)
            step "Make .env"
            setup_env
            ;;
        start)
            step "Set up and start QBase from this checkout"
            setup_env || return 1
            set_version "${1:-}"
            "${BUILD[@]}" up -d --build --wait --wait-timeout 300 || { err "Failed. See: bash run.sh logs"; return 1; }
            report "${BUILD[@]}" ps --format "$PS_FORMAT"
            local port token
            port=$(env_value APP_PORT)
            token=$(env_value SETUP_TOKEN)
            echo "  Open ${BOLD}http://localhost:${port:-8080}${RESET} and create the first account (it becomes the administrator)."
            if [[ -n "$token" ]]; then
                echo "  Setup token for that form: ${BOLD}$token${RESET}"
            else
                echo "  The setup token is the SETUP_TOKEN in .env (the server makes none itself)"
            fi
            ;;
        build)
            step "Build the image from this checkout"
            set_version "${1:-}"
            report "${BUILD[@]}" build app
            ;;
        rebuild)
            step "Rebuild from scratch and start"
            set_version "${1:-}"
            # chained with &&: the menu runs commands without set -e
            "${BUILD[@]}" build --no-cache --pull app &&
                "${BUILD[@]}" up -d &&
                report "${BUILD[@]}" ps --format "$PS_FORMAT" ||
                { err "Failed."; return 1; }
            ;;
        up)
            step "Start QBase"
            set_version "${1:-}"
            "${BASE[@]}" up -d && report "${BASE[@]}" ps --format "$PS_FORMAT" || { err "Failed."; return 1; }
            echo "  Open ${BOLD}http://localhost:${APP_PORT:-8080}${RESET}"
            ;;
        down)
            if [[ "${1:-}" == "-v" ]]; then
                step "Stop and delete all data"
                warn "This deletes the postgres-data volume: every account, project and diagram."
                confirm "Delete ALL QBase data?" || return 1
                report "${BASE[@]}" down -v
            else
                step "Stop (data is kept)"
                report "${BASE[@]}" down
            fi
            ;;
        push) push "$@" ;;
        ps)
            step "Status"
            "${BASE[@]}" ps --format "$PS_FORMAT"
            ;;
        logs)
            step "App log ${DIM}(Ctrl+C to stop)${RESET}"
            "${BASE[@]}" logs -f app
            ;;
        -h|--help|help) usage ;;
        *) usage; return 1 ;;
    esac
}

# Asks for the version, offering the current one
ask_version() {
    local default version
    default=$(default_version)
    read -r -p "${MAGENTA}${BOLD}?${RESET} Version ${DIM}[$default]${RESET}: " version
    echo "${version:-$default}"
}

# Whether QBase is running, and which image, for the menu header
state() {
    local image
    image=$("${BASE[@]}" ps --status running --format '{{.Image}}' app 2>/dev/null || true)
    if [[ -n "$image" ]]; then
        echo "${GREEN}● running${RESET} ${CYAN}$image${RESET}"
    else
        echo "${DIM}○ stopped${RESET}"
    fi
}

item() {  # number, name, description, colour of the number
    printf "  ${4:-$CYAN}${BOLD}%s${RESET}  %-10s ${DIM}%s${RESET}\n" "$1" "$2" "$3"
}

menu() {
    local choice version
    while true; do
        echo
        echo "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
        echo "  ${BOLD}QBase${RESET}   $(state)"
        echo "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
        echo "  ${DIM}First time${RESET}"
        item s start    "make .env, build from this checkout and start" "$GREEN"
        echo "  ${DIM}Image${RESET}"
        item 1 build    "build from this checkout"
        item 2 rebuild  "build from scratch, then start"
        echo "  ${DIM}Run${RESET}"
        item 3 up       "start QBase"
        item 4 down     "stop (data is kept)"
        item 5 "down -v" "stop and DELETE all data" "$RED"
        echo "  ${DIM}Docker Hub${RESET}"
        item 6 push     "push the image you built, and move latest"
        item 7 "push all" "build amd64 + arm64, push, and move latest"
        echo "  ${DIM}Look${RESET}"
        item 8 ps       "status"
        item 9 logs     "follow the app's log"
        item 0 quit     ""
        echo
        read -r -p "${BOLD}Choose:${RESET} " choice || exit 0
        # a failed command shows its error and returns to the menu
        case "$choice" in
            s|start) run start || true ;;
            1) version=$(ask_version); run build "$version" || true ;;
            2) version=$(ask_version); run rebuild "$version" || true ;;
            3) version=$(ask_version); run up "$version" || true ;;
            4) run down || true ;;
            5) run down -v || true ;;
            6) version=$(ask_version); push "$version" || true ;;
            7) version=$(ask_version); push "$version" --all-platforms || true ;;
            8) run ps || true ;;
            9) trap 'true' INT; run logs || true; trap - INT ;;
            0|q|quit|exit) echo "${DIM}Bye.${RESET}"; exit 0 ;;
            *) err "Choose a number from the list." ;;
        esac
    done
}

if [[ $# -eq 0 ]]; then
    menu
else
    run "$@"
fi
