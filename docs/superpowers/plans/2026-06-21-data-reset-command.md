# Data Reset Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe one-command SQLite data reset flow that clears schedule/monthly/audit/session runtime data while preserving staff, shifts, holidays, settings, users, and user permission bindings.

**Architecture:** Implement reset as a SQLite maintenance operation in `server/sqlite/maintenance.ts`, then expose it through `server/data-cli.ts`, `package.json`, `tools/sqlite-service.sh`, and `optools.sh`. The maintenance layer owns backup, transaction, and integrity checks; shell scripts only guard confirmation and delegate.

**Tech Stack:** TypeScript, better-sqlite3, Vitest, Bash, existing `optools.sh` and `tools/sqlite-service.sh` operations framework.

---

## File Structure

- Modify `server/sqlite/maintenance.ts`: add `resetSqliteDatabase()`, `ResetOptions`, `ResetResult`, foreign-key check helper, and a stable cleared table list.
- Modify `server/sqlite-maintenance.test.ts`: add reset tests that exercise backup, clearing, preserving base data, preserving auth relations, and confirmation failure.
- Modify `server/data-cli.ts`: add `reset` command with `CONFIRM_RESET=yes` guard and JSON output.
- Modify `package.json`: add `data:reset`.
- Modify `tools/sqlite-service.sh`: add `reset` to usage and command dispatch.
- Modify `tools/sqlite-service.test.ts`: add shell helper and CLI reset coverage.
- Modify `optools.sh`: add `data reset` to usage and data helper allow-list.
- Modify `optools.test.ts`: add help and delegation coverage for `./optools.sh data reset`.
- Modify `docs/正式部署运行手册.md`: document one-command data initialization for re-entry.
- Modify `docs/SQLite常用命令.md`: add reset-related checks and count queries.
- Modify `docs/功能跟进清单.md`: mark one-command data reset as completed.

---

### Task 1: Add SQLite Reset Maintenance Function

**Files:**
- Modify: `server/sqlite-maintenance.test.ts`
- Modify: `server/sqlite/maintenance.ts`

- [ ] **Step 1: Add failing maintenance tests**

In `server/sqlite-maintenance.test.ts`, update the maintenance import to include `resetSqliteDatabase`:

```ts
import {
  backupSqliteDatabase,
  checkSqliteDatabase,
  initSqliteDatabase,
  resetSqliteDatabase,
  restoreSqliteBackup,
  sqliteMaintenanceFs
} from "./sqlite/maintenance";
```

Add these helpers after `readSqliteData()`:

```ts
function readScalarNumber(sqlitePath: string, sql: string): number {
  const db = new Database(sqlitePath, { fileMustExist: true });
  try {
    const row = db.prepare(sql).get() as { value: number };
    return row.value;
  } finally {
    db.close();
  }
}

function readRows<T>(sqlitePath: string, sql: string): T[] {
  const db = new Database(sqlitePath, { fileMustExist: true });
  try {
    return db.prepare(sql).all() as T[];
  } finally {
    db.close();
  }
}

function insertAuthRuntimeRows(sqlitePath: string): void {
  const db = new Database(sqlitePath, { fileMustExist: true });
  try {
    db.pragma("foreign_keys = ON");
    db.exec(`
      insert into users (
        id, username, display_name, role, staff_id, password_hash, enabled, created_at, updated_at
      ) values (
        'user-scheduler', 'scheduler', '排班员', 'scheduler', 'staff-nurse-001', 'hash', 1,
        '2026-06-21T00:00:00.000Z', '2026-06-21T00:00:00.000Z'
      );

      insert into user_managed_staff (user_id, staff_id, created_at, created_by)
      values ('user-scheduler', 'staff-nurse-001', '2026-06-21T00:00:00.000Z', null);

      insert into user_sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
      values (
        'session-001', 'user-scheduler', 'token-hash',
        '2026-06-21T00:00:00.000Z', '2026-06-22T00:00:00.000Z', null
      );

      insert into audit_logs (
        id, occurred_at, user_id, username, action, target_type, target_id, summary, ip, user_agent
      ) values (
        'audit-001', '2026-06-21T00:00:00.000Z', 'user-scheduler', 'scheduler',
        'data.schedule.update', 'schedule', '2026-06-15__staff-nurse-001',
        '保存排班', '127.0.0.1', 'vitest'
      );
    `);
  } finally {
    db.close();
  }
}

function createDataWithRuntimeRows(): AppData {
  const data = createSeedData();
  data.scheduleEntries = [
    {
      id: "2026-06-15__staff-nurse-001",
      date: "2026-06-15",
      staffId: "staff-nurse-001",
      shiftIds: ["shift-a1"],
      note: "reset candidate"
    }
  ];
  data.monthlySettlements = [
    {
      id: "settlement-2026-06",
      month: "2026-06",
      monthStart: "2026-06-01",
      monthEnd: "2026-06-30",
      totalDays: 30,
      bonusPool: 1000,
      coefficientTotal: 1.5,
      settledAt: "2026-06-30T00:00:00.000Z",
      rows: [
        {
          staffId: "staff-nurse-001",
          staffName: "李护士",
          staffJobId: "100001",
          staffType: "nurse",
          attendanceShifts: 1,
          requiredShifts: 1,
          attendanceBalance: 0,
          overtimeShifts: 0,
          coefficientTotal: 1.5,
          coefficientExcludedReason: "",
          bonusAmount: 1000,
          bonusExcludedReason: ""
        }
      ]
    }
  ];
  data.settings.defaultRequiredShiftsPerWeek = 4;
  return data;
}
```

Add these tests before the existing `"returns not ok when checking a SQLite database with missing tables"` test:

```ts
  it("rejects reset when confirmation is false", async () => {
    const dir = await createTempDir();
    const sqlitePath = join(dir, "schedule.db");
    const backupPath = join(dir, "backups");
    const data = createDataWithRuntimeRows();
    writeSqliteData(sqlitePath, data);
    const before = await readFile(sqlitePath);

    await expect(resetSqliteDatabase({ sqlitePath, backupPath, confirm: false })).rejects.toThrow(/confirm/i);

    expect(await readFile(sqlitePath)).toEqual(before);
    expect(await listDbBackups(backupPath)).toEqual([]);
    expect(readSqliteData(sqlitePath).scheduleEntries).toEqual(data.scheduleEntries);
  });

  it("backs up the database then clears only runtime data during reset", async () => {
    const dir = await createTempDir();
    const sqlitePath = join(dir, "schedule.db");
    const backupPath = join(dir, "backups");
    const data = createDataWithRuntimeRows();
    writeSqliteData(sqlitePath, data);
    insertAuthRuntimeRows(sqlitePath);

    const result = await resetSqliteDatabase({ sqlitePath, backupPath, confirm: true });
    const backupFiles = await listDbBackups(backupPath);
    const loaded = readSqliteData(sqlitePath);

    expect(result.sqlitePath).toBe(sqlitePath);
    expect(result.backupFile.startsWith(backupPath)).toBe(true);
    expect(result.clearedTables).toEqual([
      "schedule_entry_shifts",
      "schedule_entries",
      "monthly_settlement_rows",
      "monthly_settlements",
      "user_sessions",
      "audit_logs"
    ]);
    expect(result.check.ok).toBe(true);
    expect(backupFiles).toHaveLength(1);
    expect(readSqliteData(join(backupPath, backupFiles[0])).scheduleEntries).toEqual(data.scheduleEntries);
    expect(readSqliteData(join(backupPath, backupFiles[0])).monthlySettlements).toEqual(data.monthlySettlements);

    expect(loaded.scheduleEntries).toEqual([]);
    expect(loaded.monthlySettlements).toEqual([]);
    expect(loaded.staff).toEqual(data.staff);
    expect(loaded.shifts).toEqual(data.shifts);
    expect(loaded.holidays).toEqual(data.holidays);
    expect(loaded.settings).toEqual(data.settings);

    expect(readScalarNumber(sqlitePath, "select count(*) as value from user_sessions")).toBe(0);
    expect(readScalarNumber(sqlitePath, "select count(*) as value from audit_logs")).toBe(0);
    expect(readRows(sqlitePath, "select username, staff_id from users order by username")).toEqual([
      { username: "scheduler", staff_id: "staff-nurse-001" }
    ]);
    expect(readRows(sqlitePath, "select user_id, staff_id from user_managed_staff order by user_id, staff_id")).toEqual([
      { user_id: "user-scheduler", staff_id: "staff-nurse-001" }
    ]);
    expect(readRows(sqlitePath, "pragma foreign_key_check")).toEqual([]);
  });
```

- [ ] **Step 2: Run maintenance test to verify it fails**

Run:

```bash
npm run test -- server/sqlite-maintenance.test.ts
```

Expected: FAIL because `resetSqliteDatabase` is not exported from `server/sqlite/maintenance.ts`.

- [ ] **Step 3: Implement reset in the maintenance module**

In `server/sqlite/maintenance.ts`, add these interfaces after `RestoreOptions`:

```ts
export interface ResetOptions {
  sqlitePath: string;
  backupPath: string;
  confirm: boolean;
}

export interface ResetResult {
  sqlitePath: string;
  backupFile: string;
  clearedTables: string[];
  check: CheckResult;
  message: string;
}
```

Add this constant after `SQLITE_SIDECAR_SUFFIXES`:

```ts
const RESET_CLEARED_TABLES = [
  "schedule_entry_shifts",
  "schedule_entries",
  "monthly_settlement_rows",
  "monthly_settlements",
  "user_sessions",
  "audit_logs"
] as const;
```

Add this helper after `assertValidOpenSqliteDatabase()`:

```ts
function assertNoForeignKeyViolations(db: Database.Database, label: string): void {
  const rows = db.prepare("pragma foreign_key_check").all();
  if (rows.length > 0) {
    throw new Error(`${label} has foreign key violations: ${JSON.stringify(rows)}`);
  }
}
```

Add this exported function after `restoreSqliteBackup()` and before `checkSqliteDatabase()`:

```ts
export async function resetSqliteDatabase(options: ResetOptions): Promise<ResetResult> {
  if (!options.confirm) {
    throw new Error("Reset requires confirm to be true.");
  }

  validateSqliteFile(options.sqlitePath, "SQLite database");
  const backupFile = await backupSqliteDatabase({ sqlitePath: options.sqlitePath, backupPath: options.backupPath });

  const db = new Database(options.sqlitePath, { fileMustExist: true });
  try {
    db.pragma("foreign_keys = ON");
    assertValidOpenSqliteDatabase(db, "SQLite database");

    const reset = db.transaction(() => {
      db.exec(`
        delete from schedule_entry_shifts;
        delete from schedule_entries;
        delete from monthly_settlement_rows;
        delete from monthly_settlements;
        delete from user_sessions;
        delete from audit_logs;
      `);
    });

    reset();
    assertNoForeignKeyViolations(db, "SQLite database after reset");
    const check = checkOpenSqliteDatabase(db);
    if (!check.ok) {
      throw new Error(
        `SQLite database after reset is invalid: integrity=${check.integrity}; missingTables=${check.missingTables.join(",")}; missingColumns=${check.missingColumns.join(",")}`
      );
    }

    return {
      sqlitePath: options.sqlitePath,
      backupFile,
      clearedTables: [...RESET_CLEARED_TABLES],
      check,
      message: "SQLite runtime data reset completed. Existing sessions were cleared; users must log in again."
    };
  } finally {
    db.close();
  }
}
```

- [ ] **Step 4: Run maintenance test to verify it passes**

Run:

```bash
npm run test -- server/sqlite-maintenance.test.ts
```

Expected: PASS for all SQLite maintenance tests.

- [ ] **Step 5: Commit Task 1**

```bash
git add server/sqlite/maintenance.ts server/sqlite-maintenance.test.ts
git commit -m "feat: add sqlite data reset maintenance"
```

---

### Task 2: Expose Reset Through Node CLI and npm Script

**Files:**
- Modify: `server/data-cli.ts`
- Modify: `package.json`
- Modify: `tools/sqlite-service.test.ts`

- [ ] **Step 1: Add failing CLI tests**

In `tools/sqlite-service.test.ts`, add this constant near `restoreGuidance`:

```ts
const resetGuidance = "Reset is a high-risk operation. Set CONFIRM_RESET=yes to continue.";
```

Add these tests immediately after the existing `"rejects the root path for direct data restore before restore"` test:

```ts
  it("rejects data-cli reset without explicit confirmation", async () => {
    const dir = await createTempDir();
    const sqlitePath = join(dir, "schedule.db");
    await createValidSqliteBackup(sqlitePath);

    const result = await runDataCli(["reset"], {
      SCHEDULE_SQLITE_PATH: sqlitePath,
      SCHEDULE_BACKUP_PATH: join(dir, "backups")
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(resetGuidance);
  });

  it("runs data-cli reset when confirmation is explicit", async () => {
    const dir = await createTempDir();
    const sqlitePath = join(dir, "schedule.db");
    const backupPath = join(dir, "backups");
    await createValidSqliteBackup(sqlitePath);

    const result = await runDataCli(["reset"], {
      CONFIRM_RESET: "yes",
      SCHEDULE_SQLITE_PATH: sqlitePath,
      SCHEDULE_BACKUP_PATH: backupPath
    });

    expect(result.code, result.stderr).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      sqlitePath: string;
      backupFile: string;
      clearedTables: string[];
      check: { ok: boolean };
      message: string;
    };
    expect(parsed.sqlitePath).toBe(sqlitePath);
    expect(parsed.backupFile.startsWith(backupPath)).toBe(true);
    expect(parsed.clearedTables).toContain("schedule_entries");
    expect(parsed.clearedTables).toContain("audit_logs");
    expect(parsed.check.ok).toBe(true);
    expect(parsed.message).toContain("users must log in again");
  });
```

- [ ] **Step 2: Run CLI tests to verify they fail**

Run:

```bash
npm run test -- tools/sqlite-service.test.ts
```

Expected: FAIL because `server/data-cli.ts` does not recognize `reset`.

- [ ] **Step 3: Add npm script**

In `package.json`, add `data:reset` after `data:restore`:

```json
"data:restore": "node --import tsx server/data-cli.ts restore",
"data:reset": "node --import tsx server/data-cli.ts reset",
"data:check:sqlite": "node --import tsx server/data-cli.ts check",
```

- [ ] **Step 4: Add reset command to data-cli**

In `server/data-cli.ts`, update the import:

```ts
import {
  backupSqliteDatabase,
  checkSqliteDatabase,
  initSqliteDatabase,
  resetSqliteDatabase,
  restoreSqliteBackup
} from "./sqlite/maintenance";
```

Add this constant after `restoreGuidance`:

```ts
const resetGuidance = "Reset is a high-risk operation. Set CONFIRM_RESET=yes to continue.";
```

Add this command branch after the `restore` branch and before the final usage error:

```ts
  if (command === "reset") {
    if (process.env.CONFIRM_RESET !== "yes") {
      console.error(resetGuidance);
      process.exitCode = 1;
      return;
    }
    const result = await resetSqliteDatabase({ sqlitePath, backupPath, confirm: true });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
```

Update the final usage line:

```ts
  console.error("Usage: node --import tsx server/data-cli.ts <preflight|init|backup|restore|reset|check>");
```

- [ ] **Step 5: Run CLI tests to verify they pass**

Run:

```bash
npm run test -- tools/sqlite-service.test.ts
```

Expected: PASS for the data CLI reset tests and existing sqlite-service tests.

- [ ] **Step 6: Commit Task 2**

```bash
git add package.json server/data-cli.ts tools/sqlite-service.test.ts
git commit -m "feat: expose sqlite data reset cli"
```

---

### Task 3: Wire Reset Into SQLite Helper and optools

**Files:**
- Modify: `tools/sqlite-service.sh`
- Modify: `tools/sqlite-service.test.ts`
- Modify: `optools.sh`
- Modify: `optools.test.ts`

- [ ] **Step 1: Add failing shell helper tests**

In `tools/sqlite-service.test.ts`, add these tests after the existing `"prints usage"` test:

```ts
  it("prints reset usage", async () => {
    const result = await runTool(["help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("./tools/sqlite-service.sh reset");
  });

  it("rejects reset before invoking npm when confirmation is missing", async () => {
    const dir = await createTempDir();
    const fakeBin = await createFakeNpmBin(dir);
    const logPath = join(dir, "reset-missing-confirm.log");

    const result = await runTool(["reset"], {
      PATH: fakeBin,
      NPM_LOG: logPath,
      SCHEDULE_SQLITE_PATH: join(dir, "schedule.db"),
      SCHEDULE_BACKUP_PATH: join(dir, "backups")
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(resetGuidance);
    await expect(readLog(logPath)).rejects.toThrow();
  });

  it("delegates reset to the npm data reset command when confirmation is explicit", async () => {
    const dir = await createTempDir();
    const fakeBin = await createFakeNpmBin(dir);
    const sqlitePath = join(dir, "sqlite", "schedule.db");
    const backupPath = join(dir, "backups");
    const logPath = join(dir, "reset-confirmed.log");

    const result = await runTool(["reset"], {
      PATH: fakeBin,
      CONFIRM_RESET: "yes",
      NPM_LOG: logPath,
      SCHEDULE_SQLITE_PATH: sqlitePath,
      SCHEDULE_BACKUP_PATH: backupPath
    });

    expect(result.code, result.stderr).toBe(0);
    expect((await readLog(logPath)).trimEnd().split("\n")).toEqual([
      `cwd=${process.cwd()}`,
      `SCHEDULE_SQLITE_PATH=${sqlitePath}`,
      `SCHEDULE_BACKUP_PATH=${backupPath}`,
      "argc=2",
      "arg1=run",
      "arg2=data:reset"
    ]);
  });
```

In `optools.test.ts`, update the first usage test by adding:

```ts
    expect(result.stdout).toContain("./optools.sh data reset");
```

Add this test after `"delegates SQLite data operations to the data helper script"`:

```ts
  it("delegates SQLite data reset to the data helper script", async () => {
    const stateDir = await createStateDir();
    const fakeDataHelper = join(stateDir, "sqlite-service.sh");
    const logPath = join(stateDir, "data-reset.log");

    await createExecutable(
      fakeDataHelper,
      `{
  printf 'cwd=%s\\n' "$PWD"
  printf 'argc=%s\\n' "$#"
  index=1
  for arg in "$@"; do
    printf 'arg%s=%s\\n' "$index" "$arg"
    index=$((index + 1))
  done
} >> "$DATA_LOG"
`
    );

    const result = await runOptools(["data", "reset"], {
      OPTOOLS_SQLITE_SERVICE_SCRIPT: fakeDataHelper,
      DATA_LOG: logPath
    });

    expect(result.code, result.stderr).toBe(0);
    expect(await readFile(logPath, "utf8")).toBe(
      [
        `cwd=${process.cwd()}`,
        "argc=1",
        "arg1=reset",
        ""
      ].join("\n")
    );
  });
```

- [ ] **Step 2: Run shell tests to verify they fail**

Run:

```bash
npm run test -- tools/sqlite-service.test.ts optools.test.ts
```

Expected: FAIL because `reset` is not in usage or command allow-lists.

- [ ] **Step 3: Update sqlite-service usage and dispatch**

In `tools/sqlite-service.sh`, add reset to usage:

```bash
  ./tools/sqlite-service.sh reset
```

Add this branch in the main `case "$COMMAND" in` block after `restore)` and before `status)`:

```bash
  reset)
    if [ "${CONFIRM_RESET:-}" != "yes" ]; then
      printf 'Reset is a high-risk operation. Set CONFIRM_RESET=yes to continue.\n' >&2
      exit 1
    fi
    ensure_dirs
    run_npm_command data:reset
    ;;
```

- [ ] **Step 4: Update optools usage and delegation**

In `optools.sh`, add this usage line after `./optools.sh data restore <backup-file>`:

```bash
  ./optools.sh data reset    Back up SQLite storage, then clear runtime data for re-entry
```

In `run_data_helper()`, update the allow-list:

```bash
    install|init|backup|restore|reset|status|check|help|-h|--help)
```

- [ ] **Step 5: Run shell tests to verify they pass**

Run:

```bash
npm run test -- tools/sqlite-service.test.ts optools.test.ts
```

Expected: PASS for all sqlite helper and optools tests.

- [ ] **Step 6: Commit Task 3**

```bash
git add tools/sqlite-service.sh tools/sqlite-service.test.ts optools.sh optools.test.ts
git commit -m "feat: add data reset operations command"
```

---

### Task 4: Update Operations Documentation

**Files:**
- Modify: `docs/正式部署运行手册.md`
- Modify: `docs/SQLite常用命令.md`
- Modify: `docs/功能跟进清单.md`

- [ ] **Step 1: Update runbook reset section**

In `docs/正式部署运行手册.md`, add this section between `恢复` and `验收与演练文档`:

````md
## 一键初始化与重新录入

如果测试录入完成后需要重新开始正式录入，可以使用一键初始化命令清空运行数据。该命令会先自动备份当前 SQLite 数据库，再清空排班、月结快照、登录会话和审计日志。

默认保留以下数据：

- 人员档案
- 班次配置
- 节假日配置
- 系统配置
- 账号、角色、绑定人员和可管理人员范围

执行前先查看当前数据库和备份路径：

```bash
./optools.sh data status
```

未显式确认时命令会拒绝执行：

```bash
./optools.sh data reset
```

确认重新录入时执行：

```bash
CONFIRM_RESET=yes ./optools.sh data reset
./optools.sh data check
```

执行后所有已登录会话会失效，需要重新登录。命令输出会包含自动生成的备份文件路径；如果发现误操作，可以按恢复流程回滚：

```bash
./optools.sh app stop
CONFIRM_RESTORE=yes ./optools.sh data restore <reset-before-backup-file>
./optools.sh data check
./optools.sh app start
```
````

- [ ] **Step 2: Update SQLite command reference**

In `docs/SQLite常用命令.md`, add this section before `## 备份与恢复`:

````md
## 一键初始化前后检查

一键初始化命令：

```bash
CONFIRM_RESET=yes ./optools.sh data reset
```

该命令会自动备份当前 SQLite 数据库，并清空排班、月结快照、登录会话和审计日志。人员、班次、节假日、系统配置、账号和账号管理范围会保留。

初始化前可查看运行数据数量：

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db \
  "select 'schedule_entries' as table_name, count(*) from schedule_entries
   union all select 'monthly_settlements', count(*) from monthly_settlements
   union all select 'user_sessions', count(*) from user_sessions
   union all select 'audit_logs', count(*) from audit_logs;"
```

初始化后确认运行数据已清空：

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db \
  "select 'schedule_entries' as table_name, count(*) from schedule_entries
   union all select 'monthly_settlements', count(*) from monthly_settlements
   union all select 'user_sessions', count(*) from user_sessions
   union all select 'audit_logs', count(*) from audit_logs;"
```

初始化后确认基础数据仍保留：

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db \
  "select 'staff' as table_name, count(*) from staff
   union all select 'shifts', count(*) from shifts
   union all select 'holidays', count(*) from holidays
   union all select 'users', count(*) from users
   union all select 'user_managed_staff', count(*) from user_managed_staff;"
```
````

- [ ] **Step 3: Update feature tracking checklist**

In `docs/功能跟进清单.md`, under `### 1.7 正式存储基础能力`, add this bullet:

```md
- 支持 `optools.sh data reset` 一键初始化运行数据：执行前自动备份，清空排班、月结、会话和审计，保留人员、班次、节假日、系统配置和账号权限，便于测试录入后重新开始正式录入。
```

Leave `## 5. 建议下一步` focused on target-server verification and permissions; the reset feature is recorded only under completed storage capabilities.

- [ ] **Step 4: Commit Task 4**

```bash
git add docs/正式部署运行手册.md docs/SQLite常用命令.md docs/功能跟进清单.md
git commit -m "docs: document data reset operation"
```

---

### Task 5: Full Verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test -- server/sqlite-maintenance.test.ts tools/sqlite-service.test.ts optools.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Run full unit suite**

Run:

```bash
npm run test
```

Expected: PASS. If local sandbox blocks server listen operations with `EPERM`, rerun the same command outside the sandbox with approval and record that reason in the final note.

- [ ] **Step 4: Manual smoke test against a temporary SQLite database**

Run:

```bash
tmp_dir="$(mktemp -d)"
SCHEDULE_SQLITE_PATH="$tmp_dir/schedule.db" SCHEDULE_BACKUP_PATH="$tmp_dir/backups" npm run data:init:sqlite
SCHEDULE_SQLITE_PATH="$tmp_dir/schedule.db" SCHEDULE_BACKUP_PATH="$tmp_dir/backups" ./optools.sh data reset
CONFIRM_RESET=yes SCHEDULE_SQLITE_PATH="$tmp_dir/schedule.db" SCHEDULE_BACKUP_PATH="$tmp_dir/backups" ./optools.sh data reset
SCHEDULE_SQLITE_PATH="$tmp_dir/schedule.db" SCHEDULE_BACKUP_PATH="$tmp_dir/backups" ./optools.sh data check
find "$tmp_dir/backups" -name '*.db' -type f
```

Expected:

- The unconfirmed reset fails with `Reset is a high-risk operation. Set CONFIRM_RESET=yes to continue.`
- The confirmed reset succeeds.
- `data check` prints `"ok": true`.
- `find` prints one backup `.db` file.

- [ ] **Step 5: Final status check**

Run:

```bash
git status --short
```

Expected: no uncommitted changes after all task commits.
