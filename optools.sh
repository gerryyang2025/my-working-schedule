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
NODE_MODULES_BIN_DIR="${OPTOOLS_NODE_MODULES_BIN_DIR:-"$ROOT_DIR/node_modules/.bin"}"
REQUIRED_NODE_PACKAGES="${OPTOOLS_REQUIRED_NODE_PACKAGES:-"html2canvas jspdf"}"
INSTALL_DIR="${OPTOOLS_INSTALL_DIR:-/opt/my-working-schedule}"
BUILD_COMMAND="${OPTOOLS_BUILD_COMMAND:-npm run build}"
BUILD_SOURCE_DIR="${OPTOOLS_BUILD_SOURCE_DIR:-"$ROOT_DIR/dist"}"
INSTALL_DIST_DIR="${OPTOOLS_INSTALL_DIST_DIR:-"$INSTALL_DIR/dist"}"
NGINX_SERVICE_SCRIPT="${OPTOOLS_NGINX_SERVICE_SCRIPT:-"$ROOT_DIR/tools/nginx-service.sh"}"
SQLITE_SERVICE_SCRIPT="${OPTOOLS_SQLITE_SERVICE_SCRIPT:-"$ROOT_DIR/tools/sqlite-service.sh"}"
APP_SERVICE_NAME="${OPTOOLS_APP_SERVICE_NAME:-my-working-schedule}"
APP_USER="${OPTOOLS_APP_USER:-my-working-schedule}"
APP_GROUP="${OPTOOLS_APP_GROUP:-my-working-schedule}"
DATA_DIR="${OPTOOLS_DATA_DIR:-/var/lib/my-working-schedule}"
BACKUP_DIR="${OPTOOLS_BACKUP_DIR:-/var/backups/my-working-schedule}"
SYSTEMD_SOURCE_FILE="${OPTOOLS_SYSTEMD_SOURCE_FILE:-"$ROOT_DIR/deploy/systemd/my-working-schedule.service.example"}"
SYSTEMD_SERVICE_FILE="${OPTOOLS_SYSTEMD_SERVICE_FILE:-"/etc/systemd/system/${APP_SERVICE_NAME}.service"}"
NPM_BIN="${OPTOOLS_NPM_BIN:-}"
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
  ./optools.sh build          Build frontend assets and install dist
  ./optools.sh nginx install  Install/configure nginx and reload
  ./optools.sh nginx configure [--no-reload]
  ./optools.sh nginx test     Run nginx -t through the helper
  ./optools.sh nginx reload   Reload nginx through the helper
  ./optools.sh nginx status   Show nginx helper status
  ./optools.sh data status    Show SQLite storage status
  ./optools.sh data check     Check SQLite storage integrity
  ./optools.sh data backup    Back up SQLite storage
  ./optools.sh data restore <backup-file>
  ./optools.sh data export-json
  ./optools.sh app init       Initialize production user, directories, and systemd service
  ./optools.sh app doctor     Check production app prerequisites
  ./optools.sh app start      Start the production systemd service
  ./optools.sh app stop       Stop the production systemd service
  ./optools.sh app restart    Restart the production systemd service
  ./optools.sh app status     Show production service status
  ./optools.sh app logs       Show production service logs
  ./optools.sh app health     Check production API health
  ./optools.sh doctor         Run production deployment checks
  ./optools.sh help           Show this help

Environment:
  OPTOOLS_STATE_DIR           Runtime pid directory (default: tmp/optools)
  OPTOOLS_LOG_DIR             Runtime log directory (default: logs/optools)
  OPTOOLS_DEV_COMMAND         Command used by dev start (default: npm run dev)
  OPTOOLS_NODE_MODULES_BIN_DIR Local npm bin directory (default: node_modules/.bin)
  OPTOOLS_REQUIRED_NODE_PACKAGES Runtime npm packages checked before dev start (default: html2canvas jspdf)
  OPTOOLS_BUILD_COMMAND       Build command used by build (default: npm run build)
  OPTOOLS_BUILD_SOURCE_DIR    Built static asset directory (default: dist)
  OPTOOLS_INSTALL_DIR         Static asset install root (default: /opt/my-working-schedule)
  OPTOOLS_INSTALL_DIST_DIR    Static asset install dir (default: OPTOOLS_INSTALL_DIR/dist)
  OPTOOLS_NGINX_SERVICE_SCRIPT Nginx helper script (default: tools/nginx-service.sh)
  OPTOOLS_SQLITE_SERVICE_SCRIPT SQLite helper script (default: tools/sqlite-service.sh)
  OPTOOLS_APP_SERVICE_NAME    systemd service name (default: my-working-schedule)
  OPTOOLS_APP_USER            systemd service user (default: my-working-schedule)
  OPTOOLS_APP_GROUP           systemd service group (default: my-working-schedule)
  OPTOOLS_DATA_DIR            SQLite data directory (default: /var/lib/my-working-schedule)
  OPTOOLS_BACKUP_DIR          SQLite backup directory (default: /var/backups/my-working-schedule)
  OPTOOLS_SYSTEMD_SOURCE_FILE systemd source file (default: deploy/systemd/my-working-schedule.service.example)
  OPTOOLS_SYSTEMD_SERVICE_FILE systemd target file (default: /etc/systemd/system/OPTOOLS_APP_SERVICE_NAME.service)
  OPTOOLS_NPM_BIN             npm executable for systemd ExecStart (default: detected with command -v npm)
  HOST                        API bind host (default: 0.0.0.0)
  PORT                        API port used by npm run dev:api (default: 3001)
  WEB_HOST                    Web bind host (default: 0.0.0.0)
  WEB_PORT                    Web port used by npm run dev:web (default: 5173)
  PUBLIC_HOST                 Host/IP shown for external access (default: detected LAN IP)
  VITE_API_PROXY_TARGET       Vite API proxy target (default: http://127.0.0.1:PORT)
  SCHEDULE_DATA_PATH          Optional API data file override
  SCHEDULE_CONFIG_PATH        Optional API config file override
  SCHEDULE_ADMIN_PASSWORD     Optional admin password override
EOF
}

ensure_runtime_dirs() {
  mkdir -p "$STATE_DIR" "$LOG_DIR"
}

timestamp_ms() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'from datetime import datetime; print(datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3])'
    return
  fi

  local timestamp
  timestamp="$(date '+%Y-%m-%d %H:%M:%S.%3N' 2>/dev/null || true)"
  if [[ -z "$timestamp" || "$timestamp" == *"%3N"* ]]; then
    timestamp="$(date '+%Y-%m-%d %H:%M:%S').000"
  fi
  echo "$timestamp"
}

append_dev_log() {
  printf '\n[%s] %s\n' "$(timestamp_ms)" "$*" >> "$LOG_FILE"
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

health_check() {
  local label="$1"
  local url="$2"

  if ! command -v curl >/dev/null 2>&1; then
    printf '%s: unknown (curl not found) <%s>\n' "$label" "$url"
    return 1
  fi

  if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
    printf '%s: ok <%s>\n' "$label" "$url"
    return 0
  fi

  printf '%s: unavailable <%s>\n' "$label" "$url"
  return 1
}

join_by_comma() {
  local joined=""
  local item

  for item in "$@"; do
    if [[ -n "$joined" ]]; then
      joined+=", "
    fi
    joined+="$item"
  done

  echo "$joined"
}

check_required_node_packages() {
  if [[ -z "${REQUIRED_NODE_PACKAGES//[[:space:]]/}" ]]; then
    return 0
  fi

  if ! command -v node >/dev/null 2>&1; then
    {
      echo "dev service: cannot start"
      echo "missing command: node"
      echo "install Node.js before starting the dev service."
    } >&2
    return 1
  fi

  local missing=()
  local package_name
  local package_check_script
  package_check_script='
const { createRequire } = require("module");
const path = require("path");
const rootDir = process.argv[1];
const packageName = process.argv[2];
const requireFromRoot = createRequire(path.join(rootDir, "package.json"));

try {
  requireFromRoot.resolve(packageName);
} catch {
  process.exit(1);
}
'

  for package_name in $REQUIRED_NODE_PACKAGES; do
    if ! node -e "$package_check_script" "$ROOT_DIR" "$package_name" >/dev/null 2>&1; then
      missing+=("$package_name")
    fi
  done

  if ((${#missing[@]} > 0)); then
    {
      echo "dev service: cannot start"
      echo "missing local npm packages: $(join_by_comma "${missing[@]}")"
      echo "run: npm ci --include=dev"
      echo "or: npm install --include=dev"
      echo "hint: package.json was updated; reinstall dependencies before restarting dev service."
    } >&2
    return 1
  fi
}

check_dev_start_prerequisites() {
  local command="$1"

  if [[ "$command" != "npm run dev" ]]; then
    return 0
  fi

  if ! command -v npm >/dev/null 2>&1; then
    {
      echo "dev service: cannot start"
      echo "missing command: npm"
      echo "install Node.js and npm before starting the dev service."
    } >&2
    return 1
  fi

  local missing=()
  local binary
  for binary in concurrently vite tsx; do
    if [[ ! -x "$NODE_MODULES_BIN_DIR/$binary" ]]; then
      missing+=("$binary")
    fi
  done

  if ((${#missing[@]} > 0)); then
    {
      echo "dev service: cannot start"
      echo "missing local development dependencies: $(join_by_comma "${missing[@]}")"
      echo "run: npm ci --include=dev"
      echo "or: npm install --include=dev"
      echo "hint: if dependencies were installed with --omit=dev or NODE_ENV=production, reinstall with dev dependencies."
    } >&2
    return 1
  fi

  check_required_node_packages || return 1
}

launch_dev_daemon() {
  local command="$1"

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
  local command="${OPTOOLS_DEV_COMMAND:-npm run dev}"
  pid="$(read_pid)"
  if is_pid_running "$pid"; then
    echo "dev service: already running"
    dev_status
    return 0
  fi

  if [[ -f "$PID_FILE" ]]; then
    rm -f "$PID_FILE"
  fi

  check_dev_start_prerequisites "$command" || return 1

  append_dev_log "starting npm run dev"

  launch_dev_daemon "$command"

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

build_static_assets() {
  local temp_dist_dir

  if ! command -v npm >/dev/null 2>&1 && [[ "$BUILD_COMMAND" == npm* ]]; then
    echo "build: cannot start" >&2
    echo "missing command: npm" >&2
    return 1
  fi

  echo "build: running $BUILD_COMMAND"
  (
    cd "$ROOT_DIR"
    bash -lc "$BUILD_COMMAND"
  )

  if [[ ! -d "$BUILD_SOURCE_DIR" ]]; then
    echo "build: source dist directory not found: $BUILD_SOURCE_DIR" >&2
    return 1
  fi

  if [[ ! -f "$BUILD_SOURCE_DIR/index.html" ]]; then
    echo "build: source dist index.html not found: $BUILD_SOURCE_DIR/index.html" >&2
    return 1
  fi

  mkdir -p "$INSTALL_DIR"
  temp_dist_dir="${INSTALL_DIST_DIR}.tmp.$$"
  rm -rf "$temp_dist_dir"
  mkdir -p "$temp_dist_dir"
  cp -a "$BUILD_SOURCE_DIR/." "$temp_dist_dir/"
  chmod -R a+rX "$temp_dist_dir"
  rm -rf "$INSTALL_DIST_DIR"
  mv "$temp_dist_dir" "$INSTALL_DIST_DIR"

  echo "build: completed"
  echo "source dist: $BUILD_SOURCE_DIR"
  echo "installed dist: $INSTALL_DIST_DIR"
}

run_nginx_helper() {
  local command="${1:-help}"
  shift || true

  if [[ ! -f "$NGINX_SERVICE_SCRIPT" ]]; then
    echo "nginx helper script not found: $NGINX_SERVICE_SCRIPT" >&2
    return 1
  fi

  case "$command" in
    install|configure|test|reload|status|help|-h|--help)
      (
        cd "$ROOT_DIR"
        bash "$NGINX_SERVICE_SCRIPT" "$command" "$@"
      )
      ;;
    *)
      echo "Unknown nginx command: $command" >&2
      usage
      return 1
      ;;
  esac
}

run_data_export_json() {
  if ! command -v npm >/dev/null 2>&1; then
    echo "data export-json: cannot start" >&2
    echo "missing command: npm" >&2
    return 1
  fi

  (
    cd "$ROOT_DIR"
    npm run data:export:json
  )
}

run_data_helper() {
  local command="${1:-help}"
  shift || true

  if [[ "$command" == "export-json" ]]; then
    run_data_export_json "$@"
    return
  fi

  if [[ ! -f "$SQLITE_SERVICE_SCRIPT" ]]; then
    echo "SQLite helper script not found: $SQLITE_SERVICE_SCRIPT" >&2
    return 1
  fi

  case "$command" in
    install|init|migrate|backup|restore|status|check|help|-h|--help)
      (
        cd "$ROOT_DIR"
        bash "$SQLITE_SERVICE_SCRIPT" "$command" "$@"
      )
      ;;
    *)
      echo "Unknown data command: $command" >&2
      usage
      return 1
      ;;
  esac
}

ensure_systemctl() {
  if ! command -v systemctl >/dev/null 2>&1; then
    echo "systemctl command is missing" >&2
    return 1
  fi
}

ensure_journalctl() {
  if ! command -v journalctl >/dev/null 2>&1; then
    echo "journalctl command is missing" >&2
    return 1
  fi
}

run_app_systemctl() {
  local command="$1"
  ensure_systemctl
  systemctl "$command" "$APP_SERVICE_NAME"
}

run_app_logs() {
  ensure_journalctl

  if [[ "${1:-}" == "-f" || "${1:-}" == "--follow" ]]; then
    journalctl -u "$APP_SERVICE_NAME" -f
    return
  fi

  journalctl -u "$APP_SERVICE_NAME" -n "${OPTOOLS_LOG_LINES:-80}" --no-pager
}

ensure_app_group() {
  if getent group "$APP_GROUP" >/dev/null 2>&1; then
    return 0
  fi

  groupadd --system "$APP_GROUP"
}

ensure_app_user() {
  if getent passwd "$APP_USER" >/dev/null 2>&1; then
    return 0
  fi

  useradd --system --gid "$APP_GROUP" --home-dir "$DATA_DIR" --shell /sbin/nologin "$APP_USER"
}

systemd_target_dir() {
  local path="$1"

  case "$path" in
    */*)
      printf '%s\n' "${path%/*}"
      ;;
    *)
      printf '.\n'
      ;;
  esac
}

resolve_npm_bin() {
  local npm_bin="$NPM_BIN"

  if [[ -z "$npm_bin" ]]; then
    npm_bin="$(command -v npm 2>/dev/null || true)"
  fi

  if [[ -z "$npm_bin" ]]; then
    echo "npm executable not found; install Node.js/npm or set OPTOOLS_NPM_BIN" >&2
    return 1
  fi

  if [[ ! -x "$npm_bin" ]]; then
    echo "npm executable is not executable: $npm_bin" >&2
    return 1
  fi

  printf '%s\n' "$npm_bin"
}

service_default_path() {
  local npm_bin="$1"
  local npm_dir
  npm_dir="$(systemd_target_dir "$npm_bin")"
  printf '%s\n' "$npm_dir:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
}

ensure_npm_runnable_by_app_user() {
  local npm_bin="$1"
  local service_path
  service_path="$(service_default_path "$npm_bin")"

  if command -v runuser >/dev/null 2>&1; then
    if env PATH="$service_path" runuser -u "$APP_USER" -- "$npm_bin" --version >/dev/null 2>&1; then
      return 0
    fi

    {
      echo "npm executable cannot be run by service user: $APP_USER"
      echo "npm executable: $npm_bin"
      echo "hint: do not use npm under /root/.nvm for a non-root systemd service."
      echo "hint: install/copy Node.js to a service-user accessible path, then rerun:"
      echo "      OPTOOLS_NPM_BIN=/opt/node/bin/npm ./optools.sh app init"
    } >&2
    return 1
  fi

  if [[ ! -x "$npm_bin" ]]; then
    echo "npm executable is not executable: $npm_bin" >&2
    return 1
  fi
}

install_systemd_service_file() {
  local npm_bin="$1"
  local service_path
  service_path="$(service_default_path "$npm_bin")"

  awk -v npm_bin="$npm_bin" -v service_path="$service_path" '
    BEGIN {
      replaced = 0
      path_written = 0
    }
    /^Environment=PATH=/ {
      if (path_written == 0) {
        print "Environment=PATH=" service_path
        path_written = 1
      }
      next
    }
    /^ExecStart=/ {
      if (path_written == 0) {
        print "Environment=PATH=" service_path
        path_written = 1
      }
      print "ExecStart=" npm_bin " run start:api"
      replaced = 1
      next
    }
    {
      print
    }
    END {
      if (replaced == 0) {
        if (path_written == 0) {
          print "Environment=PATH=" service_path
        }
        print "ExecStart=" npm_bin " run start:api"
      }
    }
  ' "$SYSTEMD_SOURCE_FILE" > "$SYSTEMD_SERVICE_FILE"
}

systemd_exec_start_is_executable() {
  if [[ ! -f "$SYSTEMD_SERVICE_FILE" ]]; then
    return 1
  fi

  local line
  local executable
  local service_path
  line="$(grep -E '^ExecStart=' "$SYSTEMD_SERVICE_FILE" | tail -n 1 || true)"
  line="${line#ExecStart=}"
  line="${line#"${line%%[![:space:]]*}"}"
  executable="${line%%[[:space:]]*}"

  if [[ -z "$executable" || ! -x "$executable" ]]; then
    return 1
  fi

  service_path="$(grep -E '^Environment=PATH=' "$SYSTEMD_SERVICE_FILE" | tail -n 1 || true)"
  service_path="${service_path#Environment=PATH=}"
  if [[ -z "$service_path" || "$service_path" == "Environment=PATH=" ]]; then
    service_path="$(service_default_path "$executable")"
  fi

  if command -v runuser >/dev/null 2>&1; then
    env PATH="$service_path" runuser -u "$APP_USER" -- "$executable" --version >/dev/null 2>&1
    return
  fi

  return 0
}

run_app_init() {
  local npm_bin

  if [[ ! -f "$SYSTEMD_SOURCE_FILE" ]]; then
    echo "systemd source file not found: $SYSTEMD_SOURCE_FILE" >&2
    return 1
  fi

  npm_bin="$(resolve_npm_bin)"
  ensure_systemctl
  ensure_app_group
  ensure_app_user
  ensure_npm_runnable_by_app_user "$npm_bin"

  mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$BACKUP_DIR"
  chown -R "$APP_USER:$APP_GROUP" "$INSTALL_DIR" "$DATA_DIR" "$BACKUP_DIR"

  mkdir -p "$(systemd_target_dir "$SYSTEMD_SERVICE_FILE")"
  install_systemd_service_file "$npm_bin"
  systemctl daemon-reload
  systemctl enable "$APP_SERVICE_NAME"

  echo "app init: completed"
  echo "service: $APP_SERVICE_NAME"
  echo "user: $APP_USER"
  echo "group: $APP_GROUP"
  echo "install dir: $INSTALL_DIR"
  echo "data dir: $DATA_DIR"
  echo "backup dir: $BACKUP_DIR"
  echo "npm executable: $npm_bin"
  echo "systemd service file: $SYSTEMD_SERVICE_FILE"
}

run_app_doctor() {
  local failed=0

  echo "app doctor: checking production app prerequisites"

  doctor_check "app group" getent group "$APP_GROUP" || failed=1
  doctor_check "app user" getent passwd "$APP_USER" || failed=1
  doctor_check "app install dir" test -d "$INSTALL_DIR" || failed=1
  doctor_check "app data dir" test -d "$DATA_DIR" || failed=1
  doctor_check "app backup dir" test -d "$BACKUP_DIR" || failed=1
  doctor_check "systemd service file" test -f "$SYSTEMD_SERVICE_FILE" || failed=1
  doctor_check "systemd exec start" systemd_exec_start_is_executable || failed=1
  doctor_check "app service status" run_app_systemctl status || failed=1

  if [[ "$failed" == "0" ]]; then
    echo "app doctor: ok"
    return 0
  fi

  echo "app doctor: failed"
  return 1
}

run_app_helper() {
  local command="${1:-help}"
  shift || true

  case "$command" in
    init)
      run_app_init
      ;;
    doctor)
      run_app_doctor
      ;;
    start|stop|restart|status)
      run_app_systemctl "$command"
      ;;
    logs)
      run_app_logs "$@"
      ;;
    health)
      health_check "api health" "$API_HEALTH_URL"
      ;;
    help|-h|--help)
      usage
      ;;
    *)
      echo "Unknown app command: $command" >&2
      usage
      return 1
      ;;
  esac
}

doctor_check() {
  local label="$1"
  shift

  if "$@" >/dev/null 2>&1; then
    printf '[ok] %s\n' "$label"
    return 0
  fi

  printf '[fail] %s\n' "$label"
  return 1
}

doctor_check_api_health() {
  if [[ "$API_HEALTH_URL" == "disabled" || "$API_HEALTH_URL" == "skip" ]]; then
    printf '[skip] api health\n'
    return 0
  fi

  if ! command -v curl >/dev/null 2>&1; then
    printf '[fail] api health\n'
    return 1
  fi

  doctor_check "api health" curl -fsS --max-time 2 "$API_HEALTH_URL"
}

run_doctor() {
  local failed=0

  echo "doctor: checking production runtime"

  doctor_check "node" command -v node || failed=1
  doctor_check "npm" command -v npm || failed=1
  doctor_check "static dist" test -f "$INSTALL_DIST_DIR/index.html" || failed=1
  doctor_check "data status" run_data_helper status || failed=1
  doctor_check "data check" run_data_helper check || failed=1
  doctor_check "nginx status" run_nginx_helper status || failed=1
  doctor_check "nginx test" run_nginx_helper test || failed=1
  doctor_check "app status" run_app_systemctl status || failed=1
  doctor_check_api_health || failed=1

  if [[ "$failed" == "0" ]]; then
    echo "doctor: ok"
    return 0
  fi

  echo "doctor: failed"
  return 1
}

main() {
  local scope="${1:-help}"
  local command="${2:-}"

  case "$scope" in
    help|-h|--help)
      usage
      ;;
    build)
      build_static_assets
      ;;
    nginx)
      shift || true
      run_nginx_helper "$@"
      ;;
    data)
      shift || true
      run_data_helper "$@"
      ;;
    app)
      shift || true
      run_app_helper "$@"
      ;;
    doctor)
      run_doctor
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
