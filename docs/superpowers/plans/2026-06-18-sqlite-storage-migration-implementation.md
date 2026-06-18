# SQLite Storage Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SQLite as the formal single-machine storage backend, with JSON migration, JSON export, database backup/restore, and Linux maintenance tools, while keeping current API and frontend behavior unchanged.

**Architecture:** Keep the existing `StorageAdapter` contract as the compatibility boundary. Split app-data normalization, JSON storage, SQLite schema, SQLite mapping, SQLite storage, and maintenance commands into focused server modules, then wire the API through `createConfiguredStorage()`. Use a stable SQLite npm dependency for the app layer and the system `sqlite3` CLI only for Linux maintenance checks.

**Tech Stack:** TypeScript, Express, Vitest, `better-sqlite3`, Node.js scripts, Bash, existing JSON seed data and storage tests.

---

## File Structure

- Modify `package.json`
  - Add `better-sqlite3` runtime dependency and `@types/better-sqlite3` dev dependency.
  - Add `data:init:sqlite`, `data:migrate:sqlite`, `data:export:json`, `data:backup`, `data:restore`, and `data:check:sqlite` scripts.
- Modify `package-lock.json`
  - Updated by `npm install`.
- Modify `server/config.ts`
  - Add `storageDriver`, `sqlitePath`, and `backupPath` config fields.
  - Add `SCHEDULE_STORAGE_DRIVER`, `SCHEDULE_SQLITE_PATH`, and `SCHEDULE_BACKUP_PATH` env overrides.
- Modify `server/config.test.ts`
  - Cover default JSON mode, env overrides, file config, invalid driver, and invalid blank paths.
- Create `server/app-data.ts`
  - Move app-data validation and compatibility normalization out of `server/storage.ts`.
  - Export `assertAppData()`, `normalizeAppData()`, `readJsonAppData()`, and `writeJsonAppData()`.
- Modify `server/storage.ts`
  - Keep `StorageAdapter`, `DEFAULT_STORAGE_PATH`, and `createJsonStorage()` exports.
  - Re-export JSON storage from `server/json-storage.ts`.
  - Export `createConfiguredStorage(config)`.
- Create `server/json-storage.ts`
  - Own JSON file storage behavior currently inside `server/storage.ts`.
- Create `server/sqlite/schema.ts`
  - Own SQLite schema creation, version table, integrity check, and table-existence checks.
- Create `server/sqlite/mapper.ts`
  - Own `AppData` to SQLite write mapping and SQLite read mapping back to `AppData`.
- Create `server/sqlite/storage.ts`
  - Implement `createSqliteStorage(path)` as a `StorageAdapter`.
- Create `server/sqlite/maintenance.ts`
  - Implement `initSqliteDatabase()`, `migrateJsonToSqlite()`, `exportSqliteToJson()`, `backupSqliteDatabase()`, `restoreSqliteBackup()`, and `checkSqliteDatabase()`.
- Create `server/data-cli.ts`
  - Provide the npm data command entry point.
- Modify `server/index.ts`
  - Use `createConfiguredStorage(resolveServerConfig())`.
- Create `server/sqlite-storage.test.ts`
  - Cover schema initialization, load/save/update, constraints, monthly settlements, and API compatibility.
- Create `server/sqlite-maintenance.test.ts`
  - Cover migration reports, export, backup, restore, and integrity check.
- Modify `server/storage.test.ts`
  - Keep JSON storage coverage after extracting app-data helpers.
- Modify `server/routes.test.ts`
  - Reuse existing route tests with SQLite storage for representative write flows.
- Modify `package-scripts.test.ts`
  - Assert data scripts exist and point to `server/data-cli.ts`.
- Create `tools/sqlite-service.sh`
  - Linux maintenance wrapper for install/init/migrate/backup/restore/status/check.
- Create `tools/README.md`
  - Explain SQLite is an embedded file database and document script usage.
- Create `tools/sqlite-service.test.ts`
  - Cover help, status, missing sqlite3 guidance, and command forwarding behavior.
- Modify `README.md`
  - Document SQLite configuration, migration, backup, restore, and Linux tool usage.
- Modify `docs/功能跟进清单.md`
  - Mark SQLite migration work as in progress or complete after verification.
- Modify `docs/正式环境存储优化方案.md`
  - Align documented command names and paths with the implemented scripts.

---

### Task 1: Add SQLite Dependency and Server Configuration

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `server/config.ts`
- Modify: `server/config.test.ts`
- Modify: `package-scripts.test.ts`

- [ ] **Step 1: Install SQLite dependency**

Run:

```bash
npm install better-sqlite3
npm install --save-dev @types/better-sqlite3
```

Expected: `package.json` contains `better-sqlite3` under `dependencies` and `@types/better-sqlite3` under `devDependencies`.

- [ ] **Step 2: Add failing config tests**

Append these cases to `server/config.test.ts`:

```ts
it("uses JSON storage by default", () => {
  const config = resolveServerConfig({}, { defaultConfigPath: null });

  expect(config.storageDriver).toBe("json");
  expect(config.sqlitePath).toBeUndefined();
  expect(config.backupPath).toBeUndefined();
});

it("allows SQLite storage env overrides", () => {
  const config = resolveServerConfig(
    {
      SCHEDULE_STORAGE_DRIVER: "sqlite",
      SCHEDULE_SQLITE_PATH: "/var/lib/my-working-schedule/schedule.db",
      SCHEDULE_BACKUP_PATH: "/var/backups/my-working-schedule"
    },
    { defaultConfigPath: null }
  );

  expect(config.storageDriver).toBe("sqlite");
  expect(config.sqlitePath).toBe("/var/lib/my-working-schedule/schedule.db");
  expect(config.backupPath).toBe("/var/backups/my-working-schedule");
});

it("loads SQLite storage settings from the server config file", () => {
  withTempConfig(
    {
      storageDriver: "sqlite",
      sqlitePath: "data/schedule.db",
      backupPath: "backups"
    },
    (path) => {
      const config = resolveServerConfig({ SCHEDULE_CONFIG_PATH: path });

      expect(config.storageDriver).toBe("sqlite");
      expect(config.sqlitePath).toBe("data/schedule.db");
      expect(config.backupPath).toBe("backups");
    }
  );
});

it("rejects unsupported storage drivers", () => {
  withTempConfig({ storageDriver: "postgres" }, (path) => {
    expect(() => resolveServerConfig({ SCHEDULE_CONFIG_PATH: path })).toThrow("存储驱动配置不正确");
  });
});
```

- [ ] **Step 3: Run config tests to verify failure**

Run:

```bash
npm run test -- server/config.test.ts package-scripts.test.ts
```

Expected: config tests fail because the new fields and scripts do not exist.

- [ ] **Step 4: Extend config types and parsing**

In `server/config.ts`, update the interfaces:

```ts
export type StorageDriver = "json" | "sqlite";

export interface ServerConfig {
  host: string;
  port: number;
  storageDriver: StorageDriver;
  storagePath?: string;
  sqlitePath?: string;
  backupPath?: string;
  adminPassword?: string;
}

interface ServerEnv {
  HOST?: string;
  PORT?: string;
  SCHEDULE_STORAGE_DRIVER?: string;
  SCHEDULE_DATA_PATH?: string;
  SCHEDULE_SQLITE_PATH?: string;
  SCHEDULE_BACKUP_PATH?: string;
  SCHEDULE_ADMIN_PASSWORD?: string;
  SCHEDULE_CONFIG_PATH?: string;
}

interface ServerFileConfig {
  host?: unknown;
  port?: unknown;
  storageDriver?: unknown;
  storagePath?: unknown;
  sqlitePath?: unknown;
  backupPath?: unknown;
  adminPassword?: unknown;
}
```

Add this parser near `parsePort()`:

```ts
function parseStorageDriver(value: unknown): StorageDriver | undefined {
  const driver = nonBlankString(value);
  if (driver === undefined) {
    return undefined;
  }
  if (driver !== "json" && driver !== "sqlite") {
    throw new Error("存储驱动配置不正确");
  }
  return driver;
}
```

Update the returned object:

```ts
return {
  host: nonBlankString(env.HOST) ?? nonBlankString(fileConfig.host) ?? "0.0.0.0",
  port: parsePort(env.PORT) ?? parsePort(fileConfig.port) ?? 3001,
  storageDriver: parseStorageDriver(env.SCHEDULE_STORAGE_DRIVER) ?? parseStorageDriver(fileConfig.storageDriver) ?? "json",
  storagePath: nonBlankString(env.SCHEDULE_DATA_PATH) ?? nonBlankString(fileConfig.storagePath),
  sqlitePath: nonBlankString(env.SCHEDULE_SQLITE_PATH) ?? nonBlankString(fileConfig.sqlitePath),
  backupPath: nonBlankString(env.SCHEDULE_BACKUP_PATH) ?? nonBlankString(fileConfig.backupPath),
  adminPassword: nonBlankString(env.SCHEDULE_ADMIN_PASSWORD) ?? nonBlankString(fileConfig.adminPassword)
};
```

- [ ] **Step 5: Add data scripts**

In `package.json`, add:

```json
"data:init:sqlite": "node --import tsx server/data-cli.ts init",
"data:migrate:sqlite": "node --import tsx server/data-cli.ts migrate",
"data:export:json": "node --import tsx server/data-cli.ts export-json",
"data:backup": "node --import tsx server/data-cli.ts backup",
"data:restore": "node --import tsx server/data-cli.ts restore",
"data:check:sqlite": "node --import tsx server/data-cli.ts check"
```

Update `package-scripts.test.ts` with:

```ts
it("exposes SQLite data maintenance scripts", async () => {
  const packageJson = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };

  expect(packageJson.scripts["data:init:sqlite"]).toBe("node --import tsx server/data-cli.ts init");
  expect(packageJson.scripts["data:migrate:sqlite"]).toBe("node --import tsx server/data-cli.ts migrate");
  expect(packageJson.scripts["data:export:json"]).toBe("node --import tsx server/data-cli.ts export-json");
  expect(packageJson.scripts["data:backup"]).toBe("node --import tsx server/data-cli.ts backup");
  expect(packageJson.scripts["data:restore"]).toBe("node --import tsx server/data-cli.ts restore");
  expect(packageJson.scripts["data:check:sqlite"]).toBe("node --import tsx server/data-cli.ts check");
});
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm run test -- server/config.test.ts package-scripts.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json server/config.ts server/config.test.ts package-scripts.test.ts
git commit -m "feat: add sqlite storage configuration"
```

---

### Task 2: Extract App Data Normalization and JSON Storage

**Files:**
- Create: `server/app-data.ts`
- Create: `server/json-storage.ts`
- Modify: `server/storage.ts`
- Modify: `server/storage.test.ts`

- [ ] **Step 1: Add focused app-data tests**

Create a new `describe("app data normalization")` block in `server/storage.test.ts` and import `normalizeAppData` from `./app-data`:

```ts
import { normalizeAppData } from "./app-data";
```

Add this test:

```ts
it("normalizes legacy data without monthly settlements", () => {
  const legacyData = {
    staff: [],
    shifts: [],
    holidays: [],
    scheduleEntries: [],
    settings: {
      defaultRequiredShiftsPerWeek: 5,
      version: 1
    }
  };

  const result = normalizeAppData(legacyData);

  expect(result.changed).toBe(true);
  expect(result.data).toMatchObject({
    monthlySettlements: []
  });
});
```

- [ ] **Step 2: Run storage tests to verify failure**

Run:

```bash
npm run test -- server/storage.test.ts
```

Expected: FAIL because `server/app-data.ts` does not exist.

- [ ] **Step 3: Create `server/app-data.ts`**

Move the current validation helpers from `server/storage.ts` into `server/app-data.ts`. Export this public API:

```ts
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AppData } from "./types";

export function normalizeAppData(candidate: unknown): { data: unknown; changed: boolean } {
  return normalizeAppDataCandidate(candidate);
}

export function assertAppData(value: unknown): asserts value is AppData {
  assertAppDataCandidate(value);
}

export async function readJsonAppData(path: string): Promise<{ data: AppData; changed: boolean }> {
  const content = await readFile(path, "utf8");
  const { data, changed } = normalizeAppData(JSON.parse(content));
  assertAppData(data);
  return { data, changed };
}

export async function writeJsonAppData(path: string, data: AppData): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(tempPath, path);
}
```

Keep the internal helper names private inside this file by renaming the moved `normalizeAppData()` and `assertAppData()` implementations to `normalizeAppDataCandidate()` and `assertAppDataCandidate()`.

- [ ] **Step 4: Create `server/json-storage.ts`**

Create:

```ts
import { resolve } from "node:path";
import { createSeedData } from "./seed";
import type { AppData } from "./types";
import { readJsonAppData, writeJsonAppData } from "./app-data";
import type { StorageAdapter } from "./storage";

export const DEFAULT_STORAGE_PATH = resolve(process.cwd(), "data/app-data.local.json");

export function createJsonStorage(path = DEFAULT_STORAGE_PATH): StorageAdapter {
  let updateQueue = Promise.resolve();

  async function saveData(data: AppData) {
    await writeJsonAppData(path, data);
  }

  async function loadData() {
    try {
      const { data, changed } = await readJsonAppData(path);
      if (changed) {
        await saveData(data);
      }
      return data;
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        const seedData = createSeedData();
        await saveData(seedData);
        return seedData;
      }

      throw error;
    }
  }

  return {
    load() {
      return loadData();
    },
    save(data) {
      return saveData(data);
    },
    async update(mutator) {
      const run = updateQueue.then(async () => {
        const current = await loadData();
        const next = await mutator(current);
        await saveData(next);
        return next;
      });
      updateQueue = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    }
  };
}
```

- [ ] **Step 5: Simplify `server/storage.ts`**

Replace the JSON implementation body with:

```ts
import type { ServerConfig } from "./config";
import { createJsonStorage, DEFAULT_STORAGE_PATH } from "./json-storage";

export { createJsonStorage, DEFAULT_STORAGE_PATH };

export interface StorageAdapter {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
  update(mutator: (current: AppData) => AppData | Promise<AppData>): Promise<AppData>;
}

export function createConfiguredStorage(config: ServerConfig): StorageAdapter {
  if (config.storageDriver === "json") {
    return createJsonStorage(config.storagePath);
  }

  throw new Error("SQLite 存储尚未实现");
}
```

Keep the existing `AppData` import in `server/storage.ts`:

```ts
import type { AppData } from "./types";
```

- [ ] **Step 6: Run JSON storage tests**

Run:

```bash
npm run test -- server/storage.test.ts
```

Expected: PASS with no behavior change.

- [ ] **Step 7: Commit**

```bash
git add server/app-data.ts server/json-storage.ts server/storage.ts server/storage.test.ts
git commit -m "refactor: split app data validation from json storage"
```

---

### Task 3: Add SQLite Schema and AppData Mapper

**Files:**
- Create: `server/sqlite/schema.ts`
- Create: `server/sqlite/mapper.ts`
- Create: `server/sqlite-storage.test.ts`

- [ ] **Step 1: Write failing schema and mapper tests**

Create `server/sqlite-storage.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createSeedData } from "./seed";
import { initializeSqliteSchema } from "./sqlite/schema";
import { readAppDataFromSqlite, replaceAppDataInSqlite } from "./sqlite/mapper";

const tempDirs: string[] = [];

async function createTempDbPath() {
  const dir = await mkdtemp(join(tmpdir(), "schedule-sqlite-"));
  tempDirs.push(dir);
  return join(dir, "schedule.db");
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("SQLite schema and mapper", () => {
  it("creates all required tables", async () => {
    const db = new Database(await createTempDbPath());
    initializeSqliteSchema(db);

    const rows = db
      .prepare("select name from sqlite_master where type = 'table' order by name")
      .all() as Array<{ name: string }>;

    expect(rows.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        "app_settings",
        "holidays",
        "monthly_settlement_rows",
        "monthly_settlements",
        "schedule_entries",
        "schedule_entry_shifts",
        "schema_migrations",
        "shifts",
        "staff"
      ])
    );
  });

  it("round-trips seed data through SQLite tables", async () => {
    const db = new Database(await createTempDbPath());
    initializeSqliteSchema(db);

    const seed = createSeedData();
    seed.scheduleEntries = [
      {
        id: "2026-06-15__staff-nurse-001",
        date: "2026-06-15",
        staffId: "staff-nurse-001",
        shiftIds: ["shift-a1", "shift-p1"],
        note: "two shifts"
      }
    ];

    replaceAppDataInSqlite(db, seed);
    const loaded = readAppDataFromSqlite(db);

    expect(loaded).toEqual(seed);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm run test -- server/sqlite-storage.test.ts
```

Expected: FAIL because `server/sqlite/schema.ts` and `server/sqlite/mapper.ts` do not exist.

- [ ] **Step 3: Create SQLite schema**

Create `server/sqlite/schema.ts` with:

```ts
import type Database from "better-sqlite3";

export const SQLITE_SCHEMA_VERSION = 1;

export function initializeSqliteSchema(db: Database.Database): void {
  db.pragma("foreign_keys = ON");
  db.exec(`
    create table if not exists schema_migrations (
      version integer primary key,
      applied_at text not null
    );

    create table if not exists staff (
      id text primary key,
      job_id text not null unique,
      name text not null,
      type text not null check (type in ('nurse', 'clerk', 'head_nurse')),
      is_admin integer not null check (is_admin in (0, 1)),
      enabled integer not null check (enabled in (0, 1)),
      sort_order integer not null
    );

    create table if not exists shifts (
      id text primary key,
      name text not null,
      short_name text not null,
      color text not null,
      counts_attendance integer not null check (counts_attendance in (0, 1)),
      coefficient real not null,
      enabled integer not null check (enabled in (0, 1)),
      sort_order integer not null
    );

    create table if not exists holidays (
      id text primary key,
      date text not null unique,
      name text not null,
      affects_required_attendance integer not null check (affects_required_attendance in (0, 1))
    );

    create table if not exists schedule_entries (
      id text primary key,
      date text not null,
      staff_id text not null references staff(id),
      note text not null,
      unique(date, staff_id)
    );

    create table if not exists schedule_entry_shifts (
      entry_id text not null references schedule_entries(id) on delete cascade,
      shift_id text not null references shifts(id),
      position integer not null,
      primary key(entry_id, position)
    );

    create table if not exists monthly_settlements (
      id text primary key,
      month text not null unique,
      month_start text not null,
      month_end text not null,
      total_days integer not null,
      bonus_pool real not null,
      coefficient_total real not null,
      settled_at text not null
    );

    create table if not exists monthly_settlement_rows (
      settlement_id text not null references monthly_settlements(id) on delete cascade,
      position integer not null,
      staff_id text not null,
      staff_name text not null,
      staff_job_id text not null,
      staff_type text not null check (staff_type in ('nurse', 'clerk', 'head_nurse')),
      attendance_shifts integer not null,
      overtime_shifts integer not null,
      coefficient_total real,
      coefficient_excluded_reason text not null,
      bonus_amount real not null,
      bonus_excluded_reason text not null,
      primary key(settlement_id, position),
      unique(settlement_id, staff_id)
    );

    create table if not exists app_settings (
      key text primary key,
      value text not null
    );
  `);

  const migration = db.prepare("select version from schema_migrations where version = ?").get(SQLITE_SCHEMA_VERSION);
  if (!migration) {
    db.prepare("insert into schema_migrations (version, applied_at) values (?, ?)").run(
      SQLITE_SCHEMA_VERSION,
      new Date().toISOString()
    );
  }
}

export function checkSqliteIntegrity(db: Database.Database): string {
  const row = db.prepare("pragma integrity_check").get() as { integrity_check: string };
  return row.integrity_check;
}

export function listMissingCoreTables(db: Database.Database): string[] {
  const expected = [
    "app_settings",
    "holidays",
    "monthly_settlement_rows",
    "monthly_settlements",
    "schedule_entries",
    "schedule_entry_shifts",
    "schema_migrations",
    "shifts",
    "staff"
  ];
  const rows = db.prepare("select name from sqlite_master where type = 'table'").all() as Array<{ name: string }>;
  const names = new Set(rows.map((row) => row.name));
  return expected.filter((name) => !names.has(name));
}
```

- [ ] **Step 4: Create SQLite mapper**

Create `server/sqlite/mapper.ts` with functions named:

```ts
import type Database from "better-sqlite3";
import type { AppData, Holiday, MonthlySettlement, ScheduleEntry, Settings, Shift, StaffMember } from "../types";
import { assertAppData } from "../app-data";

export function replaceAppDataInSqlite(db: Database.Database, data: AppData): void {
  assertAppData(data);
  const replace = db.transaction((next: AppData) => {
    db.exec(`
      delete from monthly_settlement_rows;
      delete from monthly_settlements;
      delete from schedule_entry_shifts;
      delete from schedule_entries;
      delete from holidays;
      delete from shifts;
      delete from staff;
      delete from app_settings;
    `);

    const insertStaff = db.prepare(`
      insert into staff (id, job_id, name, type, is_admin, enabled, sort_order)
      values (@id, @jobId, @name, @type, @isAdmin, @enabled, @sortOrder)
    `);
    for (const staff of next.staff) {
      insertStaff.run({ ...staff, isAdmin: staff.isAdmin ? 1 : 0, enabled: staff.enabled ? 1 : 0 });
    }

    const insertShift = db.prepare(`
      insert into shifts (id, name, short_name, color, counts_attendance, coefficient, enabled, sort_order)
      values (@id, @name, @shortName, @color, @countsAttendance, @coefficient, @enabled, @sortOrder)
    `);
    for (const shift of next.shifts) {
      insertShift.run({
        ...shift,
        countsAttendance: shift.countsAttendance ? 1 : 0,
        enabled: shift.enabled ? 1 : 0
      });
    }

    const insertHoliday = db.prepare(`
      insert into holidays (id, date, name, affects_required_attendance)
      values (@id, @date, @name, @affectsRequiredAttendance)
    `);
    for (const holiday of next.holidays) {
      insertHoliday.run({
        ...holiday,
        affectsRequiredAttendance: holiday.affectsRequiredAttendance ? 1 : 0
      });
    }

    const insertEntry = db.prepare("insert into schedule_entries (id, date, staff_id, note) values (?, ?, ?, ?)");
    const insertEntryShift = db.prepare("insert into schedule_entry_shifts (entry_id, shift_id, position) values (?, ?, ?)");
    for (const entry of next.scheduleEntries) {
      insertEntry.run(entry.id, entry.date, entry.staffId, entry.note);
      entry.shiftIds.forEach((shiftId, index) => insertEntryShift.run(entry.id, shiftId, index));
    }

    const insertSettlement = db.prepare(`
      insert into monthly_settlements (id, month, month_start, month_end, total_days, bonus_pool, coefficient_total, settled_at)
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertSettlementRow = db.prepare(`
      insert into monthly_settlement_rows (
        settlement_id, position, staff_id, staff_name, staff_job_id, staff_type, attendance_shifts, overtime_shifts,
        coefficient_total, coefficient_excluded_reason, bonus_amount, bonus_excluded_reason
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const settlement of next.monthlySettlements) {
      insertSettlement.run(
        settlement.id,
        settlement.month,
        settlement.monthStart,
        settlement.monthEnd,
        settlement.totalDays,
        settlement.bonusPool,
        settlement.coefficientTotal,
        settlement.settledAt
      );
      settlement.rows.forEach((row, index) => {
        insertSettlementRow.run(
          settlement.id,
          index,
          row.staffId,
          row.staffName,
          row.staffJobId,
          row.staffType,
          row.attendanceShifts,
          row.overtimeShifts,
          row.coefficientTotal,
          row.coefficientExcludedReason,
          row.bonusAmount,
          row.bonusExcludedReason
        );
      });
    }

    db.prepare("insert into app_settings (key, value) values (?, ?)").run(
      "defaultRequiredShiftsPerWeek",
      String(next.settings.defaultRequiredShiftsPerWeek)
    );
    db.prepare("insert into app_settings (key, value) values (?, ?)").run("version", String(next.settings.version));
  });

  replace(data);
}

export function readAppDataFromSqlite(db: Database.Database): AppData {
  const staff = readStaff(db);
  const shifts = readShifts(db);
  const holidays = readHolidays(db);
  const scheduleEntries = readScheduleEntries(db);
  const monthlySettlements = readMonthlySettlements(db);
  const settings = readSettings(db);
  const data = { staff, shifts, holidays, scheduleEntries, monthlySettlements, settings };
  assertAppData(data);
  return data;
}
```

Then add private `readStaff`, `readShifts`, `readHolidays`, `readScheduleEntries`, `readMonthlySettlements`, and `readSettings` helpers in the same file. Each helper should sort by the existing stable order:

- `staff`: `sort_order asc, id asc`
- `shifts`: `sort_order asc, id asc`
- `holidays`: `date asc, id asc`
- `schedule_entries`: `date asc, staff_id asc`
- `schedule_entry_shifts`: `position asc`
- `monthly_settlements`: `month asc`
- `monthly_settlement_rows`: `position asc`

`readSettings()` must return this default when `app_settings` is empty, so an explicitly initialized empty SQLite database still returns valid `AppData` without creating seed staff or seed shifts:

```ts
const defaultSettings: Settings = {
  defaultRequiredShiftsPerWeek: 5,
  version: 1
};
```

- [ ] **Step 5: Run mapper tests**

Run:

```bash
npm run test -- server/sqlite-storage.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/sqlite/schema.ts server/sqlite/mapper.ts server/sqlite-storage.test.ts
git commit -m "feat: add sqlite schema and app data mapper"
```

---

### Task 4: Implement SQLite Storage Adapter and Route Compatibility

**Files:**
- Create: `server/sqlite/storage.ts`
- Modify: `server/storage.ts`
- Modify: `server/sqlite-storage.test.ts`
- Modify: `server/routes.test.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Add failing adapter tests**

Append to `server/sqlite-storage.test.ts`:

```ts
import { createSqliteStorage } from "./sqlite/storage";
```

Add:

```ts
it("rejects a missing SQLite database file", async () => {
  const path = await createTempDbPath();
  await rm(path, { force: true });
  const storage = createSqliteStorage(path);

  await expect(storage.load()).rejects.toThrow("SQLite 数据库文件不存在，请先执行迁移或初始化命令");
});

it("loads explicit SQLite data without creating seed data implicitly", async () => {
  const path = await createTempDbPath();
  const db = new Database(path);
  initializeSqliteSchema(db);
  replaceAppDataInSqlite(db, createSeedData());
  db.close();

  const storage = createSqliteStorage(path);

  const data = await storage.load();

  expect(data.staff).toHaveLength(3);
  expect(data.shifts).toHaveLength(5);
});

it("serializes concurrent SQLite updates", async () => {
  const path = await createTempDbPath();
  const db = new Database(path);
  initializeSqliteSchema(db);
  replaceAppDataInSqlite(db, createSeedData());
  db.close();
  const storage = createSqliteStorage(path);

  await Promise.all([
    storage.update((data) => ({
      ...data,
      scheduleEntries: [
        ...data.scheduleEntries,
        { id: "2026-06-15__staff-nurse-001", date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" }
      ]
    })),
    storage.update((data) => ({
      ...data,
      scheduleEntries: [
        ...data.scheduleEntries,
        { id: "2026-06-16__staff-clerk-001", date: "2026-06-16", staffId: "staff-clerk-001", shiftIds: ["shift-office"], note: "" }
      ]
    }))
  ]);

  const loaded = await storage.load();
  expect(loaded.scheduleEntries.map((entry) => entry.id).sort()).toEqual([
    "2026-06-15__staff-nurse-001",
    "2026-06-16__staff-clerk-001"
  ]);
});
```

- [ ] **Step 2: Run adapter tests to verify failure**

Run:

```bash
npm run test -- server/sqlite-storage.test.ts
```

Expected: FAIL because `createSqliteStorage()` does not exist.

- [ ] **Step 3: Create SQLite storage adapter**

Create `server/sqlite/storage.ts`:

```ts
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { AppData } from "../types";
import type { StorageAdapter } from "../storage";
import { readAppDataFromSqlite, replaceAppDataInSqlite } from "./mapper";
import { initializeSqliteSchema } from "./schema";

export function createSqliteStorage(path: string): StorageAdapter {
  let updateQueue = Promise.resolve();

  async function openDatabase() {
    if (!existsSync(path)) {
      throw new Error("SQLite 数据库文件不存在，请先执行迁移或初始化命令");
    }
    await mkdir(dirname(path), { recursive: true });
    const db = new Database(path);
    db.pragma("foreign_keys = ON");
    initializeSqliteSchema(db);
    return db;
  }

  async function loadData(): Promise<AppData> {
    const db = await openDatabase();
    try {
      return readAppDataFromSqlite(db);
    } finally {
      db.close();
    }
  }

  async function saveData(data: AppData): Promise<void> {
    const db = await openDatabase();
    try {
      replaceAppDataInSqlite(db, data);
    } finally {
      db.close();
    }
  }

  return {
    load() {
      return loadData();
    },
    save(data) {
      return saveData(data);
    },
    async update(mutator) {
      const run = updateQueue.then(async () => {
        const current = await loadData();
        const next = await mutator(current);
        await saveData(next);
        return next;
      });
      updateQueue = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    }
  };
}
```

The final behavior must be: API startup in SQLite mode does not create a database file implicitly; users run `npm run data:init:sqlite` or `npm run data:migrate:sqlite` first.

- [ ] **Step 4: Wire storage factory**

In `server/storage.ts`, import and use SQLite storage:

```ts
import { resolve } from "node:path";
import type { ServerConfig } from "./config";
import type { AppData } from "./types";
import { createJsonStorage, DEFAULT_STORAGE_PATH } from "./json-storage";
import { createSqliteStorage } from "./sqlite/storage";

export { createJsonStorage, DEFAULT_STORAGE_PATH, createSqliteStorage };

export const DEFAULT_SQLITE_PATH = resolve(process.cwd(), "data/schedule.db");

export function createConfiguredStorage(config: ServerConfig): StorageAdapter {
  if (config.storageDriver === "json") {
    return createJsonStorage(config.storagePath);
  }

  return createSqliteStorage(config.sqlitePath ?? DEFAULT_SQLITE_PATH);
}
```

- [ ] **Step 5: Wire API startup**

In `server/index.ts`, replace the JSON-only storage creation:

```ts
const config = resolveServerConfig();
const { adminPassword, host, port } = config;

app.use(express.json());
app.use("/api", createRoutes(createConfiguredStorage(config), { adminPassword }));
```

Update imports:

```ts
import { createConfiguredStorage } from "./storage";
```

- [ ] **Step 6: Add route compatibility smoke test**

In `server/routes.test.ts`, add helper:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createSqliteStorage } from "./sqlite/storage";
import { initializeSqliteSchema } from "./sqlite/schema";
import { replaceAppDataInSqlite } from "./sqlite/mapper";
```

Add a test near existing route tests:

```ts
it("supports representative API writes with SQLite storage", async () => {
  const dir = await mkdtemp(join(tmpdir(), "schedule-routes-sqlite-"));
  try {
    const dbPath = join(dir, "schedule.db");
    const db = new Database(dbPath);
    initializeSqliteSchema(db);
    replaceAppDataInSqlite(db, createSeedData());
    db.close();

    const app = express();
    app.use(express.json());
    app.use("/api", createRoutes(createSqliteStorage(dbPath), { adminPassword: TEST_ADMIN_PASSWORD }));
    const headers = await adminHeaders(app);

    await request(app)
      .put("/api/data/schedule-entry")
      .set(headers)
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" })
      .expect(200);

    const response = await request(app).get("/api/data").expect(200);
    expect(response.body.scheduleEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "2026-06-15__staff-nurse-001",
          shiftIds: ["shift-a1"]
        })
      ])
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm run test -- server/sqlite-storage.test.ts server/routes.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/sqlite/storage.ts server/storage.ts server/sqlite-storage.test.ts server/routes.test.ts server/index.ts
git commit -m "feat: add sqlite storage adapter"
```

---

### Task 5: Implement Migration, Export, Backup, Restore, and Check Commands

**Files:**
- Create: `server/sqlite/maintenance.ts`
- Create: `server/sqlite-maintenance.test.ts`
- Create: `server/data-cli.ts`

- [ ] **Step 1: Write failing maintenance tests**

Create `server/sqlite-maintenance.test.ts`:

```ts
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSeedData } from "./seed";
import {
  backupSqliteDatabase,
  checkSqliteDatabase,
  exportSqliteToJson,
  initSqliteDatabase,
  migrateJsonToSqlite,
  restoreSqliteBackup
} from "./sqlite/maintenance";

const tempDirs: string[] = [];

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "schedule-sqlite-maintenance-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("SQLite maintenance", () => {
  it("initializes an empty SQLite database", async () => {
    const dir = await createTempDir();
    const sqlitePath = join(dir, "schedule.db");

    await initSqliteDatabase({ sqlitePath });
    const check = await checkSqliteDatabase({ sqlitePath });

    expect(check.ok).toBe(true);
  });

  it("migrates JSON data into SQLite with a successful report", async () => {
    const dir = await createTempDir();
    const jsonPath = join(dir, "app-data.local.json");
    const sqlitePath = join(dir, "schedule.db");
    const backupPath = join(dir, "backups");
    const seed = createSeedData();
    seed.scheduleEntries = [
      { id: "2026-06-15__staff-nurse-001", date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" }
    ];
    await writeFile(jsonPath, `${JSON.stringify(seed, null, 2)}\n`, "utf8");

    const report = await migrateJsonToSqlite({ jsonPath, sqlitePath, backupPath });

    expect(report.ok).toBe(true);
    expect(report.counts.scheduleEntries).toEqual({ expected: 1, actual: 1 });
    expect(existsSync(sqlitePath)).toBe(true);
  });

  it("exports SQLite data back to JSON", async () => {
    const dir = await createTempDir();
    const jsonPath = join(dir, "app-data.local.json");
    const sqlitePath = join(dir, "schedule.db");
    const exportPath = join(dir, "exports", "app-data.json");
    await writeFile(jsonPath, `${JSON.stringify(createSeedData(), null, 2)}\n`, "utf8");
    await migrateJsonToSqlite({ jsonPath, sqlitePath, backupPath: join(dir, "backups") });

    await exportSqliteToJson({ sqlitePath, exportPath });
    const exported = JSON.parse(await readFile(exportPath, "utf8"));

    expect(exported.staff).toHaveLength(3);
    expect(exported.shifts).toHaveLength(5);
  });

  it("backs up and restores a SQLite database", async () => {
    const dir = await createTempDir();
    const jsonPath = join(dir, "app-data.local.json");
    const sqlitePath = join(dir, "schedule.db");
    const backupPath = join(dir, "backups");
    await writeFile(jsonPath, `${JSON.stringify(createSeedData(), null, 2)}\n`, "utf8");
    await migrateJsonToSqlite({ jsonPath, sqlitePath, backupPath });

    const backupFile = await backupSqliteDatabase({ sqlitePath, backupPath });
    await rm(sqlitePath, { force: true });
    await restoreSqliteBackup({ sqlitePath, backupPath, backupFile, confirm: true });
    const check = await checkSqliteDatabase({ sqlitePath });

    expect(existsSync(sqlitePath)).toBe(true);
    expect(check.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run maintenance tests to verify failure**

Run:

```bash
npm run test -- server/sqlite-maintenance.test.ts
```

Expected: FAIL because the maintenance module does not exist.

- [ ] **Step 3: Create maintenance module public API**

Create `server/sqlite/maintenance.ts` with these exported interfaces and function names:

```ts
export interface MigrationCount {
  expected: number;
  actual: number;
}

export interface MigrationReport {
  ok: boolean;
  counts: Record<string, MigrationCount>;
  sourceJsonBackupPath: string;
  sqlitePath: string;
}

export interface MigrationOptions {
  jsonPath: string;
  sqlitePath: string;
  backupPath: string;
  overwrite?: boolean;
}

export interface ExportOptions {
  sqlitePath: string;
  exportPath: string;
}

export interface BackupOptions {
  sqlitePath: string;
  backupPath: string;
}

export interface RestoreOptions {
  sqlitePath: string;
  backupPath: string;
  backupFile: string;
  confirm: boolean;
}

export interface CheckOptions {
  sqlitePath: string;
}
```

Implement:

```ts
export async function initSqliteDatabase(options: CheckOptions): Promise<string>;
export async function migrateJsonToSqlite(options: MigrationOptions): Promise<MigrationReport>;
export async function exportSqliteToJson(options: ExportOptions): Promise<string>;
export async function backupSqliteDatabase(options: BackupOptions): Promise<string>;
export async function restoreSqliteBackup(options: RestoreOptions): Promise<string>;
export async function checkSqliteDatabase(options: CheckOptions): Promise<{ ok: boolean; integrity: string; missingTables: string[] }>;
```

Use these concrete rules:

- `initSqliteDatabase()` creates the parent directory, opens the SQLite database, calls `initializeSqliteSchema()`, ensures default `app_settings` rows exist, closes the database, and returns the database path.
- `migrateJsonToSqlite()` reads via `readJsonAppData()`.
- It backs up the source JSON to `${backupPath}/app-data-before-sqlite-${timestamp}.json`.
- It rejects an existing SQLite file unless `overwrite` is `true`.
- It calls `initializeSqliteSchema()` and `replaceAppDataInSqlite()`.
- It builds count comparisons for `staff`, `shifts`, `holidays`, `scheduleEntries`, `scheduleEntryShifts`, `monthlySettlements`, `monthlySettlementRows`, and `settings`.
- `backupSqliteDatabase()` uses `new Database(sqlitePath).backup(backupFile)`.
- `restoreSqliteBackup()` rejects when `confirm` is false, backs up the current database when it exists, then copies `backupFile` to `sqlitePath`.
- `checkSqliteDatabase()` calls `checkSqliteIntegrity()` and `listMissingCoreTables()`.

- [ ] **Step 4: Create data CLI**

Create `server/data-cli.ts`:

```ts
import { resolve } from "node:path";
import { resolveServerConfig } from "./config";
import { DEFAULT_STORAGE_PATH } from "./storage";
import {
  backupSqliteDatabase,
  checkSqliteDatabase,
  exportSqliteToJson,
  initSqliteDatabase,
  migrateJsonToSqlite
} from "./sqlite/maintenance";

const command = process.argv[2];
const config = resolveServerConfig();
const jsonPath = resolve(config.storagePath ?? DEFAULT_STORAGE_PATH);
const sqlitePath = resolve(config.sqlitePath ?? "data/schedule.db");
const backupPath = resolve(config.backupPath ?? "backups");

async function main() {
  if (command === "init") {
    console.log(await initSqliteDatabase({ sqlitePath }));
    return;
  }

  if (command === "migrate") {
    const report = await migrateJsonToSqlite({ jsonPath, sqlitePath, backupPath, overwrite: process.argv.includes("--overwrite") });
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "export-json") {
    const exportPath = resolve("exports", `app-data-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}.json`);
    console.log(await exportSqliteToJson({ sqlitePath, exportPath }));
    return;
  }

  if (command === "backup") {
    console.log(await backupSqliteDatabase({ sqlitePath, backupPath }));
    return;
  }

  if (command === "check") {
    const result = await checkSqliteDatabase({ sqlitePath });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }

  console.error("Usage: node --import tsx server/data-cli.ts <init|migrate|export-json|backup|restore|check>");
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
```

- [ ] **Step 5: Run maintenance tests**

Run:

```bash
npm run test -- server/sqlite-maintenance.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run CLI smoke commands with temp paths**

Run:

```bash
SCHEDULE_SQLITE_PATH=/tmp/my-working-schedule-test.db SCHEDULE_BACKUP_PATH=/tmp/my-working-schedule-backups npm run data:init:sqlite
SCHEDULE_DATA_PATH=data/app-data.json SCHEDULE_SQLITE_PATH=/tmp/my-working-schedule-test.db SCHEDULE_BACKUP_PATH=/tmp/my-working-schedule-backups npm run data:migrate:sqlite -- --overwrite
SCHEDULE_SQLITE_PATH=/tmp/my-working-schedule-test.db SCHEDULE_BACKUP_PATH=/tmp/my-working-schedule-backups npm run data:check:sqlite
SCHEDULE_SQLITE_PATH=/tmp/my-working-schedule-test.db SCHEDULE_BACKUP_PATH=/tmp/my-working-schedule-backups npm run data:backup
```

Expected: init prints `/tmp/my-working-schedule-test.db`, migrate prints `"ok": true`, check prints `"ok": true`, backup prints a `.db` path.

- [ ] **Step 7: Commit**

```bash
git add server/sqlite/maintenance.ts server/sqlite-maintenance.test.ts server/data-cli.ts
git commit -m "feat: add sqlite migration and backup commands"
```

---

### Task 6: Add Linux `tools/sqlite-service.sh`

**Files:**
- Create: `tools/sqlite-service.sh`
- Create: `tools/README.md`
- Create: `tools/sqlite-service.test.ts`

- [ ] **Step 1: Write failing tool tests**

Create `tools/sqlite-service.test.ts`:

```ts
import { execFile, type ExecFileException } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

const tempDirs: string[] = [];
const scriptPath = resolve(process.cwd(), "tools/sqlite-service.sh");

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "sqlite-service-test-"));
  tempDirs.push(dir);
  return dir;
}

function runTool(args: string[], env: Record<string, string> = {}): Promise<CommandResult> {
  return new Promise((resolveResult) => {
    execFile(
      "bash",
      [scriptPath, ...args],
      {
        env: {
          ...process.env,
          ...env
        }
      },
      (error: ExecFileException | null, stdout, stderr) => {
        resolveResult({
          code: typeof error?.code === "number" ? error.code : error ? 1 : 0,
          stdout,
          stderr
        });
      }
    );
  });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("tools/sqlite-service.sh", () => {
  it("prints usage", async () => {
    const result = await runTool(["help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("./tools/sqlite-service.sh install");
    expect(result.stdout).toContain("./tools/sqlite-service.sh restore <backup-file>");
  });

  it("reports status using configured paths", async () => {
    const dir = await createTempDir();
    const result = await runTool(["status"], {
      SCHEDULE_SQLITE_PATH: join(dir, "schedule.db"),
      SCHEDULE_BACKUP_PATH: join(dir, "backups")
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`sqlite path: ${join(dir, "schedule.db")}`);
    expect(result.stdout).toContain(`backup path: ${join(dir, "backups")}`);
  });

  it("prints install guidance when sqlite3 is missing", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    await mkdir(fakeBin);

    const result = await runTool(["install"], {
      PATH: fakeBin,
      SCHEDULE_SQLITE_PATH: join(dir, "schedule.db"),
      SCHEDULE_BACKUP_PATH: join(dir, "backups")
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("sqlite3 command is missing");
    expect(result.stderr).toContain("sudo apt install -y sqlite3");
  });
});
```

- [ ] **Step 2: Run tool tests to verify failure**

Run:

```bash
npm run test -- tools/sqlite-service.test.ts
```

Expected: FAIL because the script does not exist.

- [ ] **Step 3: Create `tools/sqlite-service.sh`**

Create executable Bash script with these command handlers:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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
    ensure_dirs
    BACKUP_FILE="${2:-}"
    if [ -z "$BACKUP_FILE" ]; then
      printf 'restore requires <backup-file>\n' >&2
      exit 1
    fi
    printf 'Restore is a high-risk operation. Set CONFIRM_RESTORE=yes to continue.\n' >&2
    if [ "${CONFIRM_RESTORE:-}" != "yes" ]; then
      exit 1
    fi
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
```

After creation, run:

```bash
chmod +x tools/sqlite-service.sh
```

- [ ] **Step 4: Add restore command support to `server/data-cli.ts`**

Extend the CLI command parsing:

```ts
import { restoreSqliteBackup } from "./sqlite/maintenance";
```

Add branch:

```ts
if (command === "restore") {
  const backupFile = process.argv[3];
  if (!backupFile) {
    console.error("Usage: node --import tsx server/data-cli.ts restore <backup-file>");
    process.exitCode = 1;
    return;
  }
  console.log(await restoreSqliteBackup({ sqlitePath, backupPath, backupFile, confirm: true }));
  return;
}
```

Update the usage text to include `restore`.

- [ ] **Step 5: Create `tools/README.md`**

Create:

````md
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

## Recommended Linux Paths

```bash
export SCHEDULE_SQLITE_PATH=/var/lib/my-working-schedule/schedule.db
export SCHEDULE_BACKUP_PATH=/var/backups/my-working-schedule
export SCHEDULE_DATA_PATH=/var/lib/my-working-schedule/app-data.local.json
```

The service user must be able to read and write the database file and backup directory.
````

- [ ] **Step 6: Run tool tests**

Run:

```bash
npm run test -- tools/sqlite-service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tools/sqlite-service.sh tools/README.md tools/sqlite-service.test.ts server/data-cli.ts
git commit -m "feat: add linux sqlite maintenance tool"
```

---

### Task 7: Documentation and Operational Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/功能跟进清单.md`
- Modify: `docs/正式环境存储优化方案.md`
- Modify: `docs/superpowers/specs/2026-06-18-sqlite-storage-migration-design.md`

- [ ] **Step 1: Update README SQLite section**

Add a section to `README.md`:

````md
## SQLite Storage

Development defaults to JSON storage. Formal single-machine deployment can use SQLite:

```bash
export SCHEDULE_STORAGE_DRIVER=sqlite
export SCHEDULE_SQLITE_PATH=/var/lib/my-working-schedule/schedule.db
export SCHEDULE_BACKUP_PATH=/var/backups/my-working-schedule
```

Migrate existing JSON data:

```bash
SCHEDULE_DATA_PATH=data/app-data.local.json npm run data:migrate:sqlite
```

Check and back up the database:

```bash
npm run data:check:sqlite
npm run data:backup
```

Linux maintenance helper:

```bash
./tools/sqlite-service.sh status
./tools/sqlite-service.sh migrate
./tools/sqlite-service.sh backup
./tools/sqlite-service.sh check
```

SQLite is a database file, not a separate daemon. Use `optools.sh` or a future systemd unit to manage the Web/API process.
````

- [ ] **Step 2: Update tracking docs**

In `docs/功能跟进清单.md`, change the SQLite P0 item status to reflect the implemented state:

```md
- SQLite 存储迁移与备份：已实现基础存储、迁移、导出、备份、恢复和 Linux 维护脚本；待正式部署联调。
```

In `docs/正式环境存储优化方案.md`, ensure command names match:

```bash
npm run data:init:sqlite
npm run data:migrate:sqlite
npm run data:export:json
npm run data:backup
npm run data:restore -- <backup-file>
npm run data:check:sqlite
./tools/sqlite-service.sh status
```

- [ ] **Step 3: Run full automated verification**

Run:

```bash
npm run test
npm run lint
npm run build
```

Expected: all commands exit with code `0`.

- [ ] **Step 4: Run migration smoke verification**

Run:

```bash
SCHEDULE_SQLITE_PATH=/tmp/my-working-schedule-smoke.db SCHEDULE_BACKUP_PATH=/tmp/my-working-schedule-smoke-backups npm run data:init:sqlite
SCHEDULE_DATA_PATH=data/app-data.json SCHEDULE_SQLITE_PATH=/tmp/my-working-schedule-smoke.db SCHEDULE_BACKUP_PATH=/tmp/my-working-schedule-smoke-backups npm run data:migrate:sqlite -- --overwrite
SCHEDULE_SQLITE_PATH=/tmp/my-working-schedule-smoke.db SCHEDULE_BACKUP_PATH=/tmp/my-working-schedule-smoke-backups npm run data:check:sqlite
SCHEDULE_SQLITE_PATH=/tmp/my-working-schedule-smoke.db SCHEDULE_BACKUP_PATH=/tmp/my-working-schedule-smoke-backups ./tools/sqlite-service.sh status
```

Expected:

- init output contains `/tmp/my-working-schedule-smoke.db`.
- migration output contains `"ok": true`.
- check output contains `"ok": true`.
- tool status prints `/tmp/my-working-schedule-smoke.db`.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/功能跟进清单.md docs/正式环境存储优化方案.md docs/superpowers/specs/2026-06-18-sqlite-storage-migration-design.md
git commit -m "docs: document sqlite storage operations"
```

---

### Task 8: Final Integration Review

**Files:**
- Read only unless a defect is found during verification.

- [ ] **Step 1: Inspect final diff**

Run:

```bash
git status --short
git log --oneline -8
```

Expected: working tree is clean, and recent commits include the SQLite configuration, schema, adapter, maintenance commands, Linux tool, and docs.

- [ ] **Step 2: Run final verification**

Run:

```bash
npm run test
npm run lint
npm run build
```

Expected: all commands exit with code `0`.

- [ ] **Step 3: Record verification result**

Add a short note to the implementation summary in the final response:

```text
Verification: npm run test, npm run lint, npm run build all passed.
SQLite smoke: JSON seed migrated to /tmp database, integrity check passed.
```

No commit is needed in this task when the working tree is already clean.

---

## Self-Review

- Spec coverage:
  - Config selection is covered by Task 1.
  - JSON compatibility extraction is covered by Task 2.
  - SQLite schema and data model are covered by Task 3.
  - Storage adapter and API compatibility are covered by Task 4.
  - SQLite init, JSON migration, JSON export, backup, restore, and check are covered by Task 5.
  - Linux `tools/` maintenance entry is covered by Task 6.
  - README and tracking docs are covered by Task 7.
  - Final verification is covered by Task 8.
- Type consistency:
  - `StorageAdapter`, `AppData`, `ServerConfig`, and `createConfiguredStorage()` are introduced before use.
  - `initSqliteDatabase()`, `migrateJsonToSqlite()`, `exportSqliteToJson()`, `backupSqliteDatabase()`, `restoreSqliteBackup()`, and `checkSqliteDatabase()` use one consistent naming scheme.
  - `SCHEDULE_DATA_PATH`, `SCHEDULE_SQLITE_PATH`, and `SCHEDULE_BACKUP_PATH` are used consistently across config, CLI, and Bash tools.
