#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
if [ "$SCRIPT_DIR" = "${BASH_SOURCE[0]}" ]; then
  SCRIPT_DIR="."
fi

ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMMAND="${1:-help}"
NGINX_CONF_DIR="${NGINX_CONF_DIR:-/etc/nginx/conf.d}"
NGINX_CONF_FILE="${NGINX_TARGET_CONF:-${NGINX_CONF_FILE:-$NGINX_CONF_DIR/my-working-schedule.conf}}"
NGINX_SOURCE_CONF="${NGINX_SOURCE_CONF:-$ROOT_DIR/deploy/nginx/my-working-schedule.conf.example}"
NGINX_HTTPS_SOURCE_CONF="${NGINX_HTTPS_SOURCE_CONF:-$ROOT_DIR/deploy/nginx/my-working-schedule-https.conf.example}"
NGINX_SERVER_NAME="${NGINX_SERVER_NAME:-}"
NGINX_SSL_CERTIFICATE="${NGINX_SSL_CERTIFICATE:-}"
NGINX_SSL_CERTIFICATE_KEY="${NGINX_SSL_CERTIFICATE_KEY:-}"
NGINX_SERVICE_NAME="${NGINX_SERVICE_NAME:-nginx}"
NO_RELOAD=0

for arg in "${@:2}"; do
  case "$arg" in
    --no-reload)
      NO_RELOAD=1
      ;;
    *)
      printf 'Unknown option: %s\n' "$arg" >&2
      exit 1
      ;;
  esac
done

usage() {
  cat <<USAGE
Usage:
  ./tools/nginx-service.sh install [--no-reload]
  ./tools/nginx-service.sh configure [--no-reload]
  ./tools/nginx-service.sh configure-https [--no-reload]
  ./tools/nginx-service.sh test
  ./tools/nginx-service.sh reload
  ./tools/nginx-service.sh status
  ./tools/nginx-service.sh help

Environment:
  NGINX_CONF_DIR       Nginx conf.d directory (default: /etc/nginx/conf.d)
  NGINX_CONF_FILE      Target config file (default: NGINX_CONF_DIR/my-working-schedule.conf)
  NGINX_TARGET_CONF    Alias for NGINX_CONF_FILE
  NGINX_SOURCE_CONF    Source config file (default: deploy/nginx/my-working-schedule.conf.example)
  NGINX_HTTPS_SOURCE_CONF HTTPS source config template (default: deploy/nginx/my-working-schedule-https.conf.example)
  NGINX_SERVER_NAME    HTTPS server name, usually a domain name
  NGINX_SSL_CERTIFICATE HTTPS certificate file path
  NGINX_SSL_CERTIFICATE_KEY HTTPS private key file path
  NGINX_SERVICE_NAME   systemd service name (default: nginx)
USAGE
}

ensure_nginx_installed() {
  if command -v nginx >/dev/null 2>&1; then
    return 0
  fi

  printf 'nginx command is missing\n' >&2

  if command -v dnf >/dev/null 2>&1; then
    dnf install -y nginx
  elif command -v yum >/dev/null 2>&1; then
    yum install -y nginx
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y nginx
  else
    printf 'supported package manager not found: install nginx manually, then rerun this script\n' >&2
    return 1
  fi

  if ! command -v nginx >/dev/null 2>&1; then
    printf 'nginx command is still missing after install\n' >&2
    return 1
  fi
}

ensure_source_conf() {
  if [ ! -f "$NGINX_SOURCE_CONF" ]; then
    printf 'nginx source config does not exist: %s\n' "$NGINX_SOURCE_CONF" >&2
    return 1
  fi
}

ensure_https_source_conf() {
  if [ ! -f "$NGINX_HTTPS_SOURCE_CONF" ]; then
    printf 'nginx HTTPS source config does not exist: %s\n' "$NGINX_HTTPS_SOURCE_CONF" >&2
    return 1
  fi
}

ensure_non_empty() {
  local label="$1"
  local value="$2"

  if [ -z "$value" ]; then
    printf '%s is required\n' "$label" >&2
    return 1
  fi
}

ensure_file_exists() {
  local label="$1"
  local path="$2"

  ensure_non_empty "$label" "$path"
  if [ ! -f "$path" ]; then
    printf '%s does not exist: %s\n' "$label" "$path" >&2
    return 1
  fi
}

escape_sed_replacement() {
  printf '%s' "$1" | sed 's/[&|]/\\&/g'
}

configure_nginx() {
  ensure_source_conf
  mkdir -p "$NGINX_CONF_DIR"
  cp "$NGINX_SOURCE_CONF" "$NGINX_CONF_FILE"
  nginx -t
}

configure_nginx_https() {
  local server_name
  local certificate
  local certificate_key

  ensure_https_source_conf
  ensure_non_empty "NGINX_SERVER_NAME" "$NGINX_SERVER_NAME"
  ensure_file_exists "NGINX_SSL_CERTIFICATE" "$NGINX_SSL_CERTIFICATE"
  ensure_file_exists "NGINX_SSL_CERTIFICATE_KEY" "$NGINX_SSL_CERTIFICATE_KEY"

  server_name="$(escape_sed_replacement "$NGINX_SERVER_NAME")"
  certificate="$(escape_sed_replacement "$NGINX_SSL_CERTIFICATE")"
  certificate_key="$(escape_sed_replacement "$NGINX_SSL_CERTIFICATE_KEY")"

  mkdir -p "$NGINX_CONF_DIR"
  sed \
    -e "s|__SERVER_NAME__|$server_name|g" \
    -e "s|__SSL_CERTIFICATE__|$certificate|g" \
    -e "s|__SSL_CERTIFICATE_KEY__|$certificate_key|g" \
    "$NGINX_HTTPS_SOURCE_CONF" > "$NGINX_CONF_FILE"
  nginx -t
}

reload_nginx() {
  if [ "$NO_RELOAD" = "1" ]; then
    return 0
  fi

  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable "$NGINX_SERVICE_NAME"
    systemctl reload "$NGINX_SERVICE_NAME"
    return 0
  fi

  nginx -s reload
}

status() {
  printf 'nginx conf dir: %s\n' "$NGINX_CONF_DIR"
  printf 'nginx conf file: %s\n' "$NGINX_CONF_FILE"
  printf 'nginx source conf: %s\n' "$NGINX_SOURCE_CONF"
  printf 'nginx HTTPS source conf: %s\n' "$NGINX_HTTPS_SOURCE_CONF"
  if [ -n "$NGINX_SERVER_NAME" ]; then
    printf 'nginx HTTPS server name: %s\n' "$NGINX_SERVER_NAME"
  else
    printf 'nginx HTTPS server name: not configured\n'
  fi
  if [ -n "$NGINX_SSL_CERTIFICATE" ] && [ -f "$NGINX_SSL_CERTIFICATE" ]; then
    printf 'nginx HTTPS certificate exists: yes\n'
  elif [ -n "$NGINX_SSL_CERTIFICATE" ]; then
    printf 'nginx HTTPS certificate exists: no <%s>\n' "$NGINX_SSL_CERTIFICATE"
  else
    printf 'nginx HTTPS certificate exists: not configured\n'
  fi
  if [ -n "$NGINX_SSL_CERTIFICATE_KEY" ] && [ -f "$NGINX_SSL_CERTIFICATE_KEY" ]; then
    printf 'nginx HTTPS certificate key exists: yes\n'
  elif [ -n "$NGINX_SSL_CERTIFICATE_KEY" ]; then
    printf 'nginx HTTPS certificate key exists: no <%s>\n' "$NGINX_SSL_CERTIFICATE_KEY"
  else
    printf 'nginx HTTPS certificate key exists: not configured\n'
  fi
  if command -v nginx >/dev/null 2>&1; then
    printf 'nginx command: %s\n' "$(command -v nginx)"
  else
    printf 'nginx command: missing\n'
  fi
  if [ -f "$NGINX_CONF_FILE" ]; then
    printf 'nginx app config exists: yes\n'
  else
    printf 'nginx app config exists: no\n'
  fi
}

case "$COMMAND" in
  help|-h|--help)
    usage
    ;;
  install)
    ensure_nginx_installed
    configure_nginx
    reload_nginx
    status
    printf 'nginx install/configure completed\n'
    ;;
  configure)
    ensure_nginx_installed
    configure_nginx
    reload_nginx
    status
    printf 'nginx configure completed\n'
    ;;
  configure-https)
    ensure_nginx_installed
    configure_nginx_https
    reload_nginx
    status
    printf 'nginx HTTPS configure completed\n'
    ;;
  test)
    ensure_nginx_installed
    nginx -t
    ;;
  reload)
    ensure_nginx_installed
    reload_nginx
    ;;
  status)
    status
    ;;
  *)
    printf 'Unknown command: %s\n' "$COMMAND" >&2
    usage
    exit 1
    ;;
esac
