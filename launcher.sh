#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
# SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
#
# @launcher-deed begin
# ;; SPDX-License-Identifier: MPL-2.0
# (praxis-deed
#   :schema-version  "1.0.0"
#   :canonical-name  "befunge93-vault-cracker-launcher"
#   :beholding-chora #u5"estate/chora"
#   (artefact :type "launcher" :version "0.4.2"
#             :generator "launch-scaffolder")
#   (app :name "befunge93-vault-cracker" :display "Befunge-93 Vault Cracker"
#        :url "https://github.com/catachresis-colloquium/befunge93-vault-cracker"
#        :archetype "app")
#   (compliance :standard-version "0.6.0"
#               :standards '("launcher-standard_praxis.deed"
#                            "launcher-standard.adoc"
#                            "PROVISIONING-STANDARD.adoc"))
#   (modes :accepted '("--setup" "--doctor" "--heal" "--ai-setup" "--help" "--version"
#                      "--start" "--stop" "--status" "--auto" "--browser" "--web"
#                      "--integ" "--disinteg"))
#   (platforms :supported '("linux" "macos" "windows"))
#   (lifecycle-phases :covered '("provision" "diagnose" "heal" "install" "run")
#                     :deferred '()))
# @launcher-deed end
#
# Compliant with launcher-standard_praxis.deed v0.6.0 and PROVISIONING-STANDARD.adoc v1.0.0.
# Per-app descriptor: .machine_readable/descriptiles/befunge93-vault-cracker.launcher_praxis.deed
set -uo pipefail

REPO_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
APP_NAME="befunge93-vault-cracker"
APP_DISPLAY="Befunge-93 Vault Cracker"
APP_HOST="${HOST:-0.0.0.0}"
APP_PORT="${PORT:-8000}"
HEALTH_URL="http://127.0.0.1:${APP_PORT}/health"

# XDG state/runtime directory (strictly user-scoped 0700; never /tmp)
STATE_BASE="${XDG_RUNTIME_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}}"
STATE_DIR="${STATE_BASE}/${APP_NAME}"
PID_FILE="${STATE_DIR}/${APP_NAME}.pid"
LOG_FILE="${STATE_DIR}/${APP_NAME}.log"
DESKTOP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DESKTOP_FILE="${DESKTOP_DIR}/${APP_NAME}.desktop"

if [ ! -f "$REPO_DIR/build/just/provision-modes.sh" ]; then
  echo "launcher.sh: build/just/provision-modes.sh is missing — checkout incomplete." >&2
  exit 1
fi
# shellcheck source=build/just/provision-modes.sh
. "$REPO_DIR/build/just/provision-modes.sh"
hp_provision_or_return "$@"

ensure_state_dir() {
  mkdir -p "$STATE_DIR"
  chmod 0700 "$STATE_DIR"
}

find_bun() {
  if command -v bun >/dev/null 2>&1; then
    command -v bun
    return 0
  fi
  if [ -x "$HOME/.bun/bin/bun" ]; then
    printf '%s\n' "$HOME/.bun/bin/bun"
    return 0
  fi
  echo "launcher.sh: 'bun' not found on PATH. Run './launcher.sh --setup' first." >&2
  return 1
}

read_live_pid() {
  [ -f "$PID_FILE" ] || return 1
  local pid
  pid="$(tr -d '[:space:]' < "$PID_FILE" 2>/dev/null || true)"
  case "$pid" in
    ''|*[!0-9]*) rm -f "$PID_FILE"; return 1 ;;
  esac
  if kill -0 "$pid" 2>/dev/null; then
    if [ -r "/proc/$pid/cmdline" ]; then
      if ! tr '\0' ' ' < "/proc/$pid/cmdline" | grep -q "server.js"; then
        rm -f "$PID_FILE"
        return 1
      fi
    fi
    printf '%s\n' "$pid"
    return 0
  fi
  rm -f "$PID_FILE"
  return 1
}

open_url() {
  local url="http://127.0.0.1:${APP_PORT}"
  if [ "${LAUNCHER_NO_OPEN:-0}" = "1" ]; then
    echo "Browser URL: $url"
    return 0
  fi
  if command -v xdg-open >/dev/null 2>&1 && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
    xdg-open "$url" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1 && [ "$(uname -s)" = "Darwin" ]; then
    open "$url" >/dev/null 2>&1 || true
  else
    echo "Open in browser: $url"
  fi
}

cmd_start() {
  local open_after="${1:-0}" pid bun_bin
  if pid="$(read_live_pid)"; then
    echo "${APP_NAME} is already running (PID ${pid}) at http://127.0.0.1:${APP_PORT}"
    [ "$open_after" = "1" ] && open_url
    return 0
  fi

  bun_bin="$(find_bun)" || return 1
  ensure_state_dir

  (
    cd "$REPO_DIR" || exit 1
    HOST="$APP_HOST" PORT="$APP_PORT" "$bun_bin" run server.js </dev/null >>"$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    disown 2>/dev/null || true
  )

  local tries=0
  while [ $tries -lt 50 ]; do
    if pid="$(read_live_pid)"; then
      if command -v curl >/dev/null 2>&1; then
        if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
          echo "${APP_NAME} started (PID ${pid}) -> http://127.0.0.1:${APP_PORT}"
          [ "$open_after" = "1" ] && open_url
          return 0
        fi
      else
        echo "${APP_NAME} started (PID ${pid}) -> http://127.0.0.1:${APP_PORT}"
        [ "$open_after" = "1" ] && open_url
        return 0
      fi
    fi
    sleep 0.1
    tries=$((tries + 1))
  done

  if pid="$(read_live_pid)"; then
    echo "${APP_NAME} started (PID ${pid}) -> http://127.0.0.1:${APP_PORT}"
    [ "$open_after" = "1" ] && open_url
    return 0
  fi

  echo "launcher.sh: ${APP_NAME} failed to start; see ${LOG_FILE}" >&2
  return 1
}

cmd_stop() {
  local pid
  if ! pid="$(read_live_pid)"; then
    echo "${APP_NAME} is not running."
    return 0
  fi

  kill -TERM "$pid" 2>/dev/null || true
  local tries=0
  while [ $tries -lt 30 ] && kill -0 "$pid" 2>/dev/null; do
    sleep 0.1
    tries=$((tries + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  echo "${APP_NAME} stopped (was PID ${pid})."
}

cmd_status() {
  local pid
  if pid="$(read_live_pid)"; then
    echo "${APP_NAME}: RUNNING (PID ${pid}, endpoint http://127.0.0.1:${APP_PORT}, log ${LOG_FILE})"
    return 0
  fi
  echo "${APP_NAME}: STOPPED"
  return 1
}

cmd_integ() {
  mkdir -p "$DESKTOP_DIR"
  cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=${APP_DISPLAY}
Comment=Interactive 2D Befunge-93 torus puzzle in Vue 3 and Bun
Exec=${REPO_DIR}/launcher.sh --browser
Path=${REPO_DIR}
Terminal=false
Categories=Game;LogicGame;Development;
EOF
  chmod 0644 "$DESKTOP_FILE"
  echo "Installed desktop entry: ${DESKTOP_FILE}"
}

cmd_disinteg() {
  if [ -f "$DESKTOP_FILE" ]; then
    rm -f "$DESKTOP_FILE"
    echo "Removed desktop entry: ${DESKTOP_FILE}"
  else
    echo "Desktop entry not present: ${DESKTOP_FILE}"
  fi
}

print_app_help() {
  hp_help
  cat <<EOF

Application runtime modes:
  --start      Start the Bun + Vue 3 game server in background (port ${APP_PORT})
  --stop       Gracefully stop the running game server
  --status     Report whether ${APP_NAME} is running (exit 0) or stopped (exit 1)
  --auto       Default mode: start if stopped, then print browser endpoint
  --browser    Start server if needed and open in system browser
  --web        Alias for --browser

Desktop integration modes:
  --integ      Install XDG .desktop launcher entry under ~/.local/share/applications
  --disinteg   Remove XDG .desktop launcher entry
EOF
}

MODE="${1:---auto}"
case "$MODE" in
  -h|--help)     print_app_help ;;
  -V|--version)  hp_version_line ;;
  --start)       cmd_start 0 ;;
  --auto)        cmd_start 0 ;;
  --browser|--web) cmd_start 1 ;;
  --stop)        cmd_stop ;;
  --status)      cmd_status ;;
  --integ)       cmd_integ ;;
  --disinteg)    cmd_disinteg ;;
  *)
    echo "launcher.sh: unknown mode '$MODE'" >&2
    print_app_help >&2
    exit 2
    ;;
esac
