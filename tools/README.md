# SQLite Linux Maintenance Tools

SQLite is an embedded file database. This project does not run a separate SQLite daemon. The long-running production process is the Web/API service; this directory only maintains the SQLite database file used by that service.

## Commands

```bash
./tools/sqlite-service.sh install
./tools/sqlite-service.sh init
./tools/sqlite-service.sh migrate
./tools/sqlite-service.sh backup
./tools/sqlite-service.sh restore <backup-file>
./tools/sqlite-service.sh status
./tools/sqlite-service.sh check
```

`install` is a non-mutating preflight check that verifies `sqlite3`, `node`, `npm`, and the local npm toolchain used by `npm run data:*` are available. In the current dev-mode flow that means `node_modules/.bin/tsx` must exist and be executable; if it is missing, run `npm ci --include=dev` in the repo first. It does not install packages, run `sudo`, or create app directories.

`check` delegates to the app-level SQLite integrity check and does not require the system `sqlite3` command.

Restore is intentionally guarded:

```bash
CONFIRM_RESTORE=yes ./tools/sqlite-service.sh restore <backup-file>
```

Relative restore values must be simple filenames in `SCHEDULE_BACKUP_PATH`; absolute paths are passed through unchanged.

## Recommended Linux Paths

```bash
export SCHEDULE_SQLITE_PATH=/var/lib/my-working-schedule/schedule.db
export SCHEDULE_BACKUP_PATH=/var/backups/my-working-schedule
export SCHEDULE_DATA_PATH=/var/lib/my-working-schedule/app-data.local.json
```

The service user must be able to read and write the database file and backup directory.
