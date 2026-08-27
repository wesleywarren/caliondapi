#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL="${CALIONDA_PI_URL:-http://127.0.0.1:8000/}"
HEALTH_URL="${CALIONDA_PI_HEALTH_URL:-http://127.0.0.1:8000/api/health}"
WAIT_SECONDS="${CALIONDA_PI_WAIT_SECONDS:-30}"
PROFILE_DIR="${CALIONDA_PI_PROFILE_DIR:-$HOME/.config/calionda-chromium}"
CHROMIUM_BIN="${CALIONDA_PI_CHROMIUM_BIN:-}"

find_chromium() {
    if [[ -n "${CHROMIUM_BIN}" ]]; then
        printf '%s\n' "${CHROMIUM_BIN}"
        return 0
    fi

    local candidate
    for candidate in chromium-browser chromium google-chrome; do
        if command -v "${candidate}" >/dev/null 2>&1; then
            printf '%s\n' "${candidate}"
            return 0
        fi
    done

    return 1
}

wait_for_server() {
    local elapsed=0
    while (( elapsed < WAIT_SECONDS )); do
        if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    return 1
}

main() {
    local chromium
    chromium="$(find_chromium)"

    if [[ -x "${ROOT_DIR}/monitor.sh" ]] && command -v wlr-randr >/dev/null 2>&1; then
        "${ROOT_DIR}/monitor.sh" >/dev/null 2>&1 || true
    fi

    wait_for_server || true

    mkdir -p "${PROFILE_DIR}"

    exec "${chromium}" \
        --kiosk \
        --start-fullscreen \
        --app="${URL}" \
        --noerrdialogs \
        --disable-infobars \
        --disable-session-crashed-bubble \
        --check-for-update-interval=31536000 \
        --simulate-outdated-no-au='Tue, 31 Dec 2099 23:59:59 GMT' \
        --user-data-dir="${PROFILE_DIR}"
}

main "$@"
