#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
if [ "$SCRIPT_DIR" = "${BASH_SOURCE[0]}" ]; then
  SCRIPT_DIR="."
fi

ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMMAND="${1:-help}"
LOGROTATE_CONF_DIR="${LOGROTATE_CONF_DIR:-/etc/logrotate.d}"
LOGROTATE_CONF_FILE="${LOGROTATE_CONF_FILE:-$LOGROTATE_CONF_DIR/my-working-schedule}"
LOGROTATE_SOURCE_CONF="${LOGROTATE_SOURCE_CONF:-$ROOT_DIR/deploy/logrotate/my-working-schedule.example}"

usage() {
  cat <<USAGE
Usage:
  ./tools/logrotate-service.sh install
  ./tools/logrotate-service.sh status
  ./tools/logrotate-service.sh test
  ./tools/logrotate-service.sh help

Environment:
  LOGROTATE_CONF_DIR       logrotate.d directory (default: /etc/logrotate.d)
  LOGROTATE_CONF_FILE      target config file (default: LOGROTATE_CONF_DIR/my-working-schedule)
  LOGROTATE_SOURCE_CONF    source config file (default: deploy/logrotate/my-working-schedule.example)
USAGE
}

ensure_source_conf() {
  if [ ! -f "$LOGROTATE_SOURCE_CONF" ]; then
    printf 'logrotate source config does not exist: %s\n' "$LOGROTATE_SOURCE_CONF" >&2
    return 1
  fi
}

ensure_logrotate_command() {
  if command -v logrotate >/dev/null 2>&1; then
    return 0
  fi

  printf 'logrotate command is missing\n' >&2
  printf 'install logrotate with your package manager, then rerun this command\n' >&2
  return 1
}

installed_or_source_conf() {
  if [ -f "$LOGROTATE_CONF_FILE" ]; then
    printf '%s\n' "$LOGROTATE_CONF_FILE"
    return
  fi

  printf '%s\n' "$LOGROTATE_SOURCE_CONF"
}

install_logrotate_conf() {
  ensure_source_conf
  mkdir -p "$LOGROTATE_CONF_DIR"
  cp "$LOGROTATE_SOURCE_CONF" "$LOGROTATE_CONF_FILE"
  chmod 0644 "$LOGROTATE_CONF_FILE"
}

status() {
  local failed=0

  printf 'logrotate conf dir: %s\n' "$LOGROTATE_CONF_DIR"
  printf 'logrotate conf file: %s\n' "$LOGROTATE_CONF_FILE"
  printf 'logrotate source conf: %s\n' "$LOGROTATE_SOURCE_CONF"
  if command -v logrotate >/dev/null 2>&1; then
    printf 'logrotate command: %s\n' "$(command -v logrotate)"
  else
    printf 'logrotate command: missing\n'
    failed=1
  fi
  if [ -f "$LOGROTATE_CONF_FILE" ]; then
    printf 'logrotate app config exists: yes\n'
  else
    printf 'logrotate app config exists: no\n'
    failed=1
  fi

  return "$failed"
}

test_logrotate_conf() {
  local conf_file
  ensure_source_conf
  ensure_logrotate_command
  conf_file="$(installed_or_source_conf)"
  logrotate -d "$conf_file"
}

case "$COMMAND" in
  help|-h|--help)
    usage
    ;;
  install)
    install_logrotate_conf
    status
    printf 'logrotate install completed\n'
    ;;
  status)
    status
    ;;
  test)
    test_logrotate_conf
    ;;
  *)
    printf 'Unknown command: %s\n' "$COMMAND" >&2
    usage
    exit 1
    ;;
esac
