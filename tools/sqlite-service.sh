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

warn_sqlite3() {
  if ! command -v sqlite3 >/dev/null 2>&1; then
    printf 'sqlite3 command is missing\n' >&2
    printf 'sqlite3 is optional and only needed for manual inspection/debugging flows\n' >&2
    printf 'Ubuntu/Debian install command: sudo apt install -y sqlite3\n' >&2
  fi
}

ensure_node() {
  if ! command -v node >/dev/null 2>&1; then
    printf 'node command is missing\n' >&2
    return 1
  fi
}

ensure_npm() {
  if ! command -v npm >/dev/null 2>&1; then
    printf 'npm command is missing\n' >&2
    return 1
  fi
}

path_dirname() {
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

find_existing_parent() {
  local path="$1"

  while [ ! -e "$path" ]; do
    local parent
    parent="$(path_dirname "$path")"
    if [ "$parent" = "$path" ]; then
      break
    fi
    path="$parent"
  done

  printf '%s\n' "$path"
}

ensure_parent_creatable() {
  local target_path="$1"
  local target_kind="$2"
  local create_target="$3"
  local parent
  parent="$(find_existing_parent "$create_target")"

  if [ ! -d "$parent" ]; then
    printf '%s path is not ready: %s\n' "$target_kind" "$target_path" >&2
    printf 'nearest existing parent is not a directory: %s\n' "$parent" >&2
    return 1
  fi

  if [ ! -x "$parent" ] || [ ! -w "$parent" ]; then
    printf '%s path is not ready: %s\n' "$target_kind" "$target_path" >&2
    printf 'nearest existing parent is not writable/traversable: %s\n' "$parent" >&2
    return 1
  fi
}

ensure_sqlite_path_ready() {
  if [ -e "$SQLITE_PATH" ]; then
    if [ -d "$SQLITE_PATH" ]; then
      printf 'sqlite path is not ready: %s\n' "$SQLITE_PATH" >&2
      printf 'path exists but is a directory\n' >&2
      return 1
    fi

    if [ ! -w "$SQLITE_PATH" ]; then
      printf 'sqlite path is not ready: %s\n' "$SQLITE_PATH" >&2
      printf 'path exists but is not writable\n' >&2
      return 1
    fi
    return 0
  fi

  ensure_parent_creatable "$SQLITE_PATH" "sqlite" "$(path_dirname "$SQLITE_PATH")"
}

ensure_backup_path_ready() {
  if [ -e "$BACKUP_PATH" ]; then
    if [ ! -d "$BACKUP_PATH" ]; then
      printf 'backup path is not ready: %s\n' "$BACKUP_PATH" >&2
      printf 'path exists but is not a directory\n' >&2
      return 1
    fi
    if [ ! -w "$BACKUP_PATH" ] || [ ! -x "$BACKUP_PATH" ]; then
      printf 'backup path is not ready: %s\n' "$BACKUP_PATH" >&2
      printf 'path exists but is not writable/traversable\n' >&2
      return 1
    fi
    return 0
  fi

  ensure_parent_creatable "$BACKUP_PATH" "backup" "$BACKUP_PATH"
}

ensure_install_paths_ready() {
  ensure_sqlite_path_ready
  ensure_backup_path_ready
}

ensure_dirs() {
  mkdir -p "$(path_dirname "$SQLITE_PATH")" "$BACKUP_PATH"
}

sqlite_modified_time() {
  case "$(uname -s)" in
    Darwin)
      stat -f '%Sm' -t '%Y-%m-%d %H:%M:%S %z' "$SQLITE_PATH"
      ;;
    *)
      stat -c '%y' "$SQLITE_PATH"
      ;;
  esac
}

status() {
  printf 'sqlite path: %s\n' "$SQLITE_PATH"
  printf 'backup path: %s\n' "$BACKUP_PATH"
  printf 'json data path: %s\n' "$DATA_PATH"
  if [ -f "$SQLITE_PATH" ]; then
    printf 'sqlite exists: yes\n'
    printf 'sqlite modified time: %s\n' "$(sqlite_modified_time)"
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
    ensure_node
    ensure_npm
    warn_sqlite3
    run_npm_command data:preflight
    ensure_install_paths_ready
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
    if [ "${CONFIRM_RESTORE:-}" != "yes" ]; then
      printf 'Restore is a high-risk operation. Set CONFIRM_RESTORE=yes to continue.\n' >&2
      exit 1
    fi
    case "$BACKUP_FILE" in
      /)
        printf 'restore backup filename must be a simple filename under backup path\n' >&2
        exit 1
        ;;
      /*)
        RESTORE_BACKUP_FILE="$BACKUP_FILE"
        ;;
      .|..|*/*|*\\*)
        printf 'restore backup filename must be a simple filename under backup path\n' >&2
        exit 1
        ;;
      *)
        RESTORE_BACKUP_FILE="${BACKUP_PATH%/}/$BACKUP_FILE"
        ;;
    esac
    ensure_dirs
    run_npm_command data:restore -- "$RESTORE_BACKUP_FILE"
    ;;
  status)
    status
    ;;
  check)
    run_npm_command data:check:sqlite
    ;;
  *)
    printf 'Unknown command: %s\n' "$COMMAND" >&2
    usage
    exit 1
    ;;
esac
