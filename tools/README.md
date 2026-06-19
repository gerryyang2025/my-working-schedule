# SQLite Linux Maintenance Tools

SQLite is an embedded file database. This project does not run a separate SQLite daemon. The long-running production process is the Web/API service; this directory maintains production helper scripts for the SQLite database file and Nginx reverse proxy used by that service.

## Recommended Entry Point

Daily operations should use the root wrapper first:

```bash
./optools.sh data status
./optools.sh data check
./optools.sh data backup
CONFIRM_RESTORE=yes ./optools.sh data restore <backup-file>
./optools.sh nginx status
./optools.sh nginx test
./optools.sh nginx reload
./optools.sh logrotate install
./optools.sh logrotate status
./optools.sh logrotate test
./optools.sh firewall status
./optools.sh firewall guide
./optools.sh app init
./optools.sh app doctor
./optools.sh app status
./optools.sh app logs
./optools.sh doctor
```

Formal deployments should normally use `./optools.sh deploy` from the source directory. It builds and installs the app, validates SQLite and Nginx, installs and dry-runs logrotate, restarts the production API service, and waits for `/api/health` before completing. Slow servers can extend the health wait with:

```bash
OPTOOLS_HEALTH_RETRIES=60 OPTOOLS_HEALTH_RETRY_DELAY=1 ./optools.sh deploy
```

The scripts in this directory are lower-level helpers used by `optools.sh` and can still be run directly for focused debugging.

## SQLite Commands

```bash
./tools/sqlite-service.sh install
./tools/sqlite-service.sh init
./tools/sqlite-service.sh migrate
./tools/sqlite-service.sh backup
./tools/sqlite-service.sh restore <backup-file>
./tools/sqlite-service.sh status
./tools/sqlite-service.sh check
```

`install` is a non-mutating preflight check that requires `node`, `npm`, and the app's side-effect-free SQLite maintenance runtime preflight (`npm run data:preflight`) to work. It also verifies that an existing SQLite file is both readable and writable, or that the configured SQLite file location and backup directory can be created by the service user from the nearest existing parent, without creating those paths during the check. The script rejects empty or malformed preflight output and only accepts a single JSON object payload after stripping npm banner lines and blank lines; that payload must report both `"ok": true` and `"command": "preflight"`, which catches silent runtime failures without creating app directories or touching app data. If `sqlite3` is missing, the script prints an informational warning because that CLI is only useful for manual inspection/debugging.

`check` re-runs the same runtime preflight validation before delegating to the app-level SQLite integrity check, and it still does not require the system `sqlite3` command.

## Backup

Run backups from the project root after the SQLite environment variables are set:

```bash
./tools/sqlite-service.sh status
./tools/sqlite-service.sh check
./tools/sqlite-service.sh backup
```

Backups are written to `SCHEDULE_BACKUP_PATH`. Run a manual backup before month-end settlement, system upgrades, server migration, or any high-risk maintenance window. If you do not use the wrapper script, the underlying command is:

```bash
npm run data:backup
```

The npm command still depends on the same `SCHEDULE_STORAGE_DRIVER=sqlite`, `SCHEDULE_SQLITE_PATH`, and `SCHEDULE_BACKUP_PATH` configuration.

## Restore

Restore is intentionally guarded:

```bash
CONFIRM_RESTORE=yes ./tools/sqlite-service.sh restore <backup-file>
```

Relative restore values must be simple filenames in `SCHEDULE_BACKUP_PATH`; absolute paths are passed through unchanged.

Before restoring, stop the Web/API service. The restore command first validates the backup file, then creates a protective backup of the current database when one exists, and finally replaces the live database. After restoring, always run:

```bash
./tools/sqlite-service.sh check
```

Then restart the Web/API service and verify normal page reads/writes.

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

## Nginx Helper

Use the Nginx helper from the project root when debugging below the `optools.sh nginx` wrapper:

```bash
./tools/nginx-service.sh install
./tools/nginx-service.sh configure --no-reload
./tools/nginx-service.sh configure-https --no-reload
./tools/nginx-service.sh test
./tools/nginx-service.sh reload
./tools/nginx-service.sh status
```

`install` handles the common failure where `nginx` is not installed and `/etc/nginx/conf.d` does not exist. It detects `dnf`, `yum`, or `apt-get`, installs nginx when needed, creates the config directory, copies `deploy/nginx/my-working-schedule.conf.example` to `/etc/nginx/conf.d/my-working-schedule.conf`, runs `nginx -t`, and reloads nginx through systemd when available.

Current deployments without a formal domain should keep using HTTP + server IP with the normal `configure` command. Use `configure-https` later, after a formal domain and domain certificate are available.

Useful overrides:

```bash
NGINX_CONF_DIR=/etc/nginx/conf.d
NGINX_CONF_FILE=/etc/nginx/conf.d/my-working-schedule.conf
NGINX_TARGET_CONF=/etc/nginx/conf.d/my-working-schedule.conf
NGINX_SOURCE_CONF=/opt/my-working-schedule/deploy/nginx/my-working-schedule.conf.example
NGINX_HTTPS_SOURCE_CONF=/opt/my-working-schedule/deploy/nginx/my-working-schedule-https.conf.example
NGINX_SERVER_NAME=schedule.example.com
NGINX_SSL_CERTIFICATE=/etc/letsencrypt/live/schedule.example.com/fullchain.pem
NGINX_SSL_CERTIFICATE_KEY=/etc/letsencrypt/live/schedule.example.com/privkey.pem
NGINX_SERVICE_NAME=nginx
```

`configure-https` does not request certificates. It is intended for the later domain stage: it renders the HTTPS template with the supplied domain name, certificate path, and key path; then it runs `nginx -t` before reloading unless `--no-reload` is set.

## Logrotate Helper

Use the logrotate helper from the project root when debugging below the `optools.sh logrotate` wrapper:

```bash
./tools/logrotate-service.sh install
./tools/logrotate-service.sh status
./tools/logrotate-service.sh test
```

`install` copies `deploy/logrotate/my-working-schedule.example` to `/etc/logrotate.d/my-working-schedule`. `test` runs `logrotate -d` as a dry-run.

Useful overrides:

```bash
LOGROTATE_CONF_DIR=/etc/logrotate.d
LOGROTATE_CONF_FILE=/etc/logrotate.d/my-working-schedule
LOGROTATE_SOURCE_CONF=/opt/my-working-schedule/deploy/logrotate/my-working-schedule.example
```

## Firewall Helper

Use the firewall helper from the project root when debugging below the `optools.sh firewall` wrapper:

```bash
./tools/firewall-service.sh status
./tools/firewall-service.sh guide
```

The firewall helper is read-only. It detects common tools such as `firewall-cmd`, `ufw`, `nft`, and `iptables`, then prints guidance for opening TCP 80/443 while keeping API port 3001 private behind Nginx.
