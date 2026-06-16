#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

detect_public_host() {
  local ip=""

  if command -v ipconfig >/dev/null 2>&1; then
    for iface in en0 en1; do
      ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
      if [[ -n "$ip" ]]; then
        echo "$ip"
        return
      fi
    done
  fi

  if command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null || true)"
    ip="${ip%% *}"
    if [[ -n "$ip" ]]; then
      echo "$ip"
      return
    fi
  fi

  echo "127.0.0.1"
}

STATE_DIR="${OPTOOLS_STATE_DIR:-"$ROOT_DIR/tmp/optools"}"
LOG_DIR="${OPTOOLS_LOG_DIR:-"$ROOT_DIR/logs/optools"}"
PID_FILE="${OPTOOLS_DEV_PID_FILE:-"$STATE_DIR/dev.pid"}"
LOG_FILE="${OPTOOLS_DEV_LOG_FILE:-"$LOG_DIR/dev.log"}"
API_PORT="${PORT:-3001}"
PORT="$API_PORT"
HOST="${HOST:-0.0.0.0}"
WEB_HOST="${WEB_HOST:-0.0.0.0}"
WEB_PORT="${WEB_PORT:-5173}"
PUBLIC_HOST="${PUBLIC_HOST:-$(detect_public_host)}"
VITE_API_PROXY_TARGET="${VITE_API_PROXY_TARGET:-"http://127.0.0.1:${API_PORT}"}"
API_HEALTH_URL="${OPTOOLS_API_HEALTH_URL:-"http://127.0.0.1:${API_PORT}/api/health"}"
WEB_URL="${OPTOOLS_WEB_URL:-"http://127.0.0.1:${WEB_PORT}"}"

export HOST WEB_HOST WEB_PORT PORT VITE_API_PROXY_TARGET

usage() {
  cat <<EOF
Usage:
  ./optools.sh dev start      Start API and Web dev servers as a daemon
  ./optools.sh dev stop       Stop the dev daemon
  ./optools.sh dev restart    Restart the dev daemon
  ./optools.sh dev status     Show daemon, port, and health status
  ./optools.sh dev logs       Show recent daemon logs
  ./optools.sh dev logs -f    Follow daemon logs
  ./optools.sh help           Show this help

Environment:
  OPTOOLS_STATE_DIR           Runtime pid directory (default: tmp/optools)
  OPTOOLS_LOG_DIR             Runtime log directory (default: logs/optools)
  OPTOOLS_DEV_COMMAND         Command used by dev start (default: npm run dev)
  HOST                        API bind host (default: 0.0.0.0)
  PORT                        API port used by npm run dev:api (default: 3001)
  WEB_HOST                    Web bind host (default: 0.0.0.0)
  WEB_PORT                    Web port used by npm run dev:web (default: 5173)
  PUBLIC_HOST                 Host/IP shown for external access (default: detected LAN IP)
  VITE_API_PROXY_TARGET       Vite API proxy target (default: http://127.0.0.1:PORT)
  SCHEDULE_DATA_PATH          Optional API data file override
  SCHEDULE_ADMIN_PASSWORD     Optional admin password override
EOF
}

ensure_runtime_dirs() {
  mkdir -p "$STATE_DIR" "$LOG_DIR"
}

read_pid() {
  if [[ -f "$PID_FILE" ]]; then
    tr -d '[:space:]' < "$PID_FILE"
  fi
}

is_pid_running() {
  local pid="${1:-}"
  [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null
}

health_status() {
  local label="$1"
  local url="$2"

  if ! command -v curl >/dev/null 2>&1; then
    printf '%s: unknown (curl not found) <%s>\n' "$label" "$url"
    return
  fi

  if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
    printf '%s: ok <%s>\n' "$label" "$url"
  else
    printf '%s: unavailable <%s>\n' "$label" "$url"
  fi
}

launch_dev_daemon() {
  local command="${OPTOOLS_DEV_COMMAND:-npm run dev}"

  if command -v python3 >/dev/null 2>&1; then
    OPTOOLS_LAUNCH_COMMAND="$command" \
    OPTOOLS_LAUNCH_LOG_FILE="$LOG_FILE" \
    OPTOOLS_LAUNCH_PID_FILE="$PID_FILE" \
    OPTOOLS_LAUNCH_ROOT_DIR="$ROOT_DIR" \
      python3 - <<'PY'
import os
import subprocess

command = os.environ["OPTOOLS_LAUNCH_COMMAND"]
log_file = os.environ["OPTOOLS_LAUNCH_LOG_FILE"]
pid_file = os.environ["OPTOOLS_LAUNCH_PID_FILE"]
root_dir = os.environ["OPTOOLS_LAUNCH_ROOT_DIR"]

log_handle = open(log_file, "ab", buffering=0)
process = subprocess.Popen(
    ["/bin/bash", "-lc", command],
    cwd=root_dir,
    stdin=subprocess.DEVNULL,
    stdout=log_handle,
    stderr=subprocess.STDOUT,
    close_fds=True,
    start_new_session=True,
)

with open(pid_file, "w", encoding="utf8") as handle:
    handle.write(f"{process.pid}\n")
PY
    return
  fi

  (
    cd "$ROOT_DIR"
    nohup bash -lc "$command" >> "$LOG_FILE" 2>&1 &
    echo "$!" > "$PID_FILE"
  )
}

dev_status() {
  local pid
  pid="$(read_pid)"

  if is_pid_running "$pid"; then
    echo "dev service: running"
    echo "pid: $pid"
  else
    echo "dev service: stopped"
  fi

  echo "pid file: $PID_FILE"
  echo "log file: $LOG_FILE"
  echo "bind host: ${HOST}"
  echo "web bind host: ${WEB_HOST}"
  echo "api url: http://${PUBLIC_HOST}:${API_PORT}"
  echo "web url: http://${PUBLIC_HOST}:${WEB_PORT}"
  health_status "api health" "$API_HEALTH_URL"
  health_status "web health" "$WEB_URL"
}

dev_start() {
  ensure_runtime_dirs

  local pid
  pid="$(read_pid)"
  if is_pid_running "$pid"; then
    echo "dev service: already running"
    dev_status
    return 0
  fi

  if [[ -f "$PID_FILE" ]]; then
    rm -f "$PID_FILE"
  fi

  {
    echo
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] starting npm run dev"
  } >> "$LOG_FILE"

  launch_dev_daemon

  sleep 1
  pid="$(read_pid)"
  if ! is_pid_running "$pid"; then
    echo "dev service: failed to start"
    echo "log file: $LOG_FILE"
    tail -n 40 "$LOG_FILE" 2>/dev/null || true
    return 1
  fi

  echo "dev service: started"
  echo "pid: $pid"
  echo "bind host: ${HOST}"
  echo "web bind host: ${WEB_HOST}"
  echo "api: http://${PUBLIC_HOST}:${API_PORT}"
  echo "web: http://${PUBLIC_HOST}:${WEB_PORT}"
  echo "log file: $LOG_FILE"
}

dev_stop() {
  local pid
  pid="$(read_pid)"

  if ! is_pid_running "$pid"; then
    rm -f "$PID_FILE"
    echo "dev service: already stopped"
    return 0
  fi

  echo "stopping dev service pid $pid"
  kill -TERM "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true

  for _ in $(seq 1 40); do
    if ! is_pid_running "$pid"; then
      rm -f "$PID_FILE"
      echo "dev service: stopped"
      return 0
    fi
    sleep 0.25
  done

  echo "dev service: still running; forcing stop"
  kill -KILL "-$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
  echo "dev service: stopped"
}

dev_logs() {
  ensure_runtime_dirs

  if [[ ! -f "$LOG_FILE" ]]; then
    echo "log file not found: $LOG_FILE"
    return 0
  fi

  if [[ "${1:-}" == "-f" || "${1:-}" == "--follow" ]]; then
    tail -f "$LOG_FILE"
    return
  fi

  tail -n "${OPTOOLS_LOG_LINES:-80}" "$LOG_FILE"
}

main() {
  local scope="${1:-help}"
  local command="${2:-}"

  case "$scope" in
    help|-h|--help)
      usage
      ;;
    dev)
      case "$command" in
        start)
          dev_start
          ;;
        stop)
          dev_stop
          ;;
        restart)
          dev_stop
          dev_start
          ;;
        status)
          dev_status
          ;;
        logs)
          dev_logs "${3:-}"
          ;;
        *)
          echo "Unknown command: $*" >&2
          usage
          return 1
          ;;
      esac
      ;;
    *)
      echo "Unknown command: $*" >&2
      usage
      return 1
      ;;
  esac
}

main "$@"
