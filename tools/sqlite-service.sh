#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
if [ "$SCRIPT_DIR" = "${BASH_SOURCE[0]}" ]; then
  SCRIPT_DIR="."
fi
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SQLITE_PATH="${SCHEDULE_SQLITE_PATH:-/var/lib/my-working-schedule/schedule.db}"
BACKUP_PATH="${SCHEDULE_BACKUP_PATH:-/var/backups/my-working-schedule}"
DATA_PATH="${SCHEDULE_DATA_PATH:-$ROOT_DIR/data/app-data.local.json}"
COMMAND="${1:-help}"

usage() {
  cat <<USAGE
Usage:
  ./tools/sqlite-service.sh install
  ./tools/sqlite-service.sh init
  ./tools/sqlite-service.sh migrate
  ./tools/sqlite-service.sh backup
  ./tools/sqlite-service.sh restore <backup-file>
  ./tools/sqlite-service.sh status
  ./tools/sqlite-service.sh check
USAGE
}

ensure_sqlite3() {
  if ! command -v sqlite3 >/dev/null 2>&1; then
    printf 'sqlite3 command is missing\n' >&2
    printf 'Ubuntu/Debian install command: sudo apt install -y sqlite3\n' >&2
    return 1
  fi
}

ensure_dirs() {
  mkdir -p "$(dirname "$SQLITE_PATH")" "$BACKUP_PATH"
}

status() {
  printf 'sqlite path: %s\n' "$SQLITE_PATH"
  printf 'backup path: %s\n' "$BACKUP_PATH"
  printf 'json data path: %s\n' "$DATA_PATH"
  if [ -f "$SQLITE_PATH" ]; then
    printf 'sqlite exists: yes\n'
    printf 'sqlite size: %s bytes\n' "$(wc -c < "$SQLITE_PATH" | tr -d ' ')"
  else
    printf 'sqlite exists: no\n'
  fi
}

run_npm_command() {
  cd "$ROOT_DIR"
  SCHEDULE_DATA_PATH="$DATA_PATH" SCHEDULE_SQLITE_PATH="$SQLITE_PATH" SCHEDULE_BACKUP_PATH="$BACKUP_PATH" npm run "$@"
}

case "$COMMAND" in
  help|-h|--help)
    usage
    ;;
  install)
    ensure_sqlite3
    ensure_dirs
    status
    ;;
  init)
    ensure_dirs
    run_npm_command data:init:sqlite
    ;;
  migrate)
    ensure_dirs
    run_npm_command data:migrate:sqlite
    ;;
  backup)
    ensure_dirs
    run_npm_command data:backup
    ;;
  restore)
    BACKUP_FILE="${2:-}"
    if [ -z "$BACKUP_FILE" ]; then
      printf 'restore requires <backup-file>\n' >&2
      exit 1
    fi
    printf 'Restore is a high-risk operation. Set CONFIRM_RESTORE=yes to continue.\n' >&2
    if [ "${CONFIRM_RESTORE:-}" != "yes" ]; then
      exit 1
    fi
    ensure_dirs
    run_npm_command data:restore -- "$BACKUP_FILE"
    ;;
  status)
    status
    ;;
  check)
    ensure_sqlite3
    run_npm_command data:check:sqlite
    ;;
  *)
    printf 'Unknown command: %s\n' "$COMMAND" >&2
    usage
    exit 1
    ;;
esac
