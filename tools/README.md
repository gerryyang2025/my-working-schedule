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

`install` is a non-mutating preflight check that verifies `sqlite3`, `node`, `npm`, and the app's side-effect-free SQLite maintenance runtime preflight (`npm run data:preflight`) all work. This catches broken or missing runtime dependencies such as `tsx` or `better-sqlite3` without creating app directories or touching app data.

`check` delegates to the app-level SQLite integrity check and does not require the system `sqlite3` command.

Restore is intentionally guarded:

```bash
CONFIRM_RESTORE=yes ./tools/sqlite-service.sh restore <backup-file>
```

Relative restore values must be simple filenames in `SCHEDULE_BACKUP_PATH`; absolute paths are passed through unchanged.

Short restore runbook:

1. Stop the Web/API service.
2. Run `CONFIRM_RESTORE=yes ./tools/sqlite-service.sh restore <backup-file>`.
3. Run `./tools/sqlite-service.sh check`.
4. Restart the Web/API service.
5. Verify the service health endpoint or normal startup health checks.

## Recommended Linux Paths

```bash
export SCHEDULE_SQLITE_PATH=/var/lib/my-working-schedule/schedule.db
export SCHEDULE_BACKUP_PATH=/var/backups/my-working-schedule
export SCHEDULE_DATA_PATH=/var/lib/my-working-schedule/app-data.local.json
```

The service user must be able to read and write the database file and backup directory.
