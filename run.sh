#!/usr/bin/env bash
# Build, run and push the QBase image (qubdi/qbase) from this checkout.
#
#   bash run.sh                  a menu: pick a command, it asks for the version
#
# or name the command directly:
#
#   bash run.sh build   [version]   build qubdi/qbase:<version> from this checkout
#   bash run.sh rebuild [version]   build from scratch (no cache, fresh base images), then start it
#   bash run.sh up      [version]   start QBase: the local image of that version if there is
#                                   one, otherwise it is pulled from Docker Hub
#   bash run.sh down                stop; the data stays in the postgres-data volume
#   bash run.sh down -v             stop AND delete all data (asks first)
#   bash run.sh push    <version>   push qubdi/qbase:<version> to Docker Hub (asks first)
#                                   --all-platforms: build for amd64 and arm64 and push that
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
    sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'
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

push() {
    local all_platforms=false version="" arg
    for arg in "$@"; do
        case "$arg" in
            --all-platforms) all_platforms=true ;;
            -*) err "Unknown option: $arg"; return 1 ;;
            *) version="$arg" ;;
        esac
    done
    if [[ -z "$version" || "$version" == "latest" ]]; then
        err "Give the version to push, e.g. 1.0.5 (latest is moved only by the release workflow, and never by a prerelease)."
        return 1
    fi
    if $all_platforms; then
        step "Build for amd64 + arm64 and push"
        set_version "$version"
        confirm "Build $(tag "$version") for amd64 and arm64 and push it to Docker Hub?" || return 1
        report docker buildx build --platform linux/amd64,linux/arm64 \
            -t "$IMAGE:$version" --push .
    else
        step "Push to Docker Hub"
        set_version "$version"
        if ! docker image inspect "$IMAGE:$version" >/dev/null 2>&1; then
            err "There is no local $IMAGE:$version. Build it first: bash run.sh build $version"
            return 1
        fi
        warn "This pushes the image built for this machine only ($(docker version -f '{{.Server.Arch}}'))."
        warn "Choose \"push all\" for amd64 and arm64."
        confirm "Push $(tag "$version") to Docker Hub?" || return 1
        report "${BUILD[@]}" push app
    fi
}

run() {
    local command="${1:-}"
    [[ $# -gt 0 ]] && shift
    case "$command" in
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
        echo "  ${DIM}Image${RESET}"
        item 1 build    "build from this checkout"
        item 2 rebuild  "build from scratch, then start"
        echo "  ${DIM}Run${RESET}"
        item 3 up       "start QBase"
        item 4 down     "stop (data is kept)"
        item 5 "down -v" "stop and DELETE all data" "$RED"
        echo "  ${DIM}Docker Hub${RESET}"
        item 6 push     "push the image you built"
        item 7 "push all" "build amd64 + arm64 and push"
        echo "  ${DIM}Look${RESET}"
        item 8 ps       "status"
        item 9 logs     "follow the app's log"
        item 0 quit     ""
        echo
        read -r -p "${BOLD}Choose:${RESET} " choice || exit 0
        # a failed command shows its error and returns to the menu
        case "$choice" in
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
