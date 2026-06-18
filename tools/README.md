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

`install` is a non-mutating preflight check that requires `node`, `npm`, and the app's side-effect-free SQLite maintenance runtime preflight (`npm run data:preflight`) to work. It also verifies that an existing SQLite file is both readable and writable, or that the configured SQLite file location and backup directory can be created by the service user from the nearest existing parent, without creating those paths during the check. The script now rejects empty or malformed preflight output and parses the preflight JSON to confirm both `"ok": true` and `"command": "preflight"`, which catches silent runtime failures without creating app directories or touching app data. If `sqlite3` is missing, the script prints an informational warning because that CLI is only useful for manual inspection/debugging.

`check` re-runs the same runtime preflight validation before delegating to the app-level SQLite integrity check, and it still does not require the system `sqlite3` command.

Restore is intentionally guarded:

```bash
CONFIRM_RESTORE=yes ./tools/sqlite-service.sh restore <backup-file>
```

Relative restore values must be simple filenames in `SCHEDULE_BACKUP_PATH`; absolute paths are passed through unchanged.

Short restore runbook:

1. Stop the Web/API service.
2. Make sure `SCHEDULE_BACKUP_PATH` has enough free space for a full backup of the current database when one exists, and make sure the filesystem containing `SCHEDULE_SQLITE_PATH` also has enough free space for the sibling temp copy beside the live SQLite file before renaming it into place.
3. Run `CONFIRM_RESTORE=yes ./tools/sqlite-service.sh restore <backup-file>`.
4. Run `./tools/sqlite-service.sh check`.
5. Restart the Web/API service.
6. Verify the service health endpoint or normal startup health checks.

## Recommended Linux Paths

```bash
export SCHEDULE_SQLITE_PATH=/var/lib/my-working-schedule/schedule.db
export SCHEDULE_BACKUP_PATH=/var/backups/my-working-schedule
export SCHEDULE_DATA_PATH=/var/lib/my-working-schedule/app-data.local.json
```

The service user must be able to read and write the database file and backup directory.
