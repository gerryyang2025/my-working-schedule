import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppData } from "../src/types/domain";
import { createSeedData } from "./seed";
import {
  backupSqliteDatabase,
  checkSqliteDatabase,
  initSqliteDatabase,
  resetSqliteDatabase,
  restoreSqliteBackup,
  sqliteMaintenanceFs
} from "./sqlite/maintenance";
import { readAppDataFromSqlite, replaceAppDataInSqlite } from "./sqlite/mapper";
import { initializeSqliteSchema } from "./sqlite/schema";

const tempDirs: string[] = [];

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "schedule-sqlite-maintenance-"));
  tempDirs.push(dir);
  return dir;
}

function writeSqliteData(sqlitePath: string, data: AppData = createSeedData()) {
  const db = new Database(sqlitePath);
  try {
    initializeSqliteSchema(db);
    replaceAppDataInSqlite(db, data);
  } finally {
    db.close();
  }
}

function readSqliteData(sqlitePath: string) {
  const db = new Database(sqlitePath, { fileMustExist: true });
  try {
    return readAppDataFromSqlite(db);
  } finally {
    db.close();
  }
}

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

async function listDbBackups(backupPath: string) {
  if (!existsSync(backupPath)) {
    return [];
  }
  return (await readdir(backupPath)).filter((file) => file.endsWith(".db")).sort();
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

  it("backs up and restores a SQLite database", async () => {
    const dir = await createTempDir();
    const sqlitePath = join(dir, "schedule.db");
    const backupPath = join(dir, "backups");
    writeSqliteData(sqlitePath);

    const backupFile = await backupSqliteDatabase({ sqlitePath, backupPath });
    await rm(sqlitePath, { force: true });
    await restoreSqliteBackup({ sqlitePath, backupPath, backupFile, confirm: true });
    const check = await checkSqliteDatabase({ sqlitePath });

    expect(existsSync(sqlitePath)).toBe(true);
    expect(check.ok).toBe(true);
  });

  it("rejects restore when confirmation is false", async () => {
    const dir = await createTempDir();
    const sqlitePath = join(dir, "schedule.db");
    const backupPath = join(dir, "backups");
    writeSqliteData(sqlitePath);
    const backupFile = await backupSqliteDatabase({ sqlitePath, backupPath });
    const before = await readFile(sqlitePath);

    await expect(restoreSqliteBackup({ sqlitePath, backupPath, backupFile, confirm: false })).rejects.toThrow(/confirm/i);

    expect(await readFile(sqlitePath)).toEqual(before);
  });

  it("backs up the current SQLite database before restoring another backup", async () => {
    const dir = await createTempDir();
    const sqlitePath = join(dir, "schedule.db");
    const replacementSqlitePath = join(dir, "replacement.db");
    const replacementBackupPath = join(dir, "replacement-backups");
    const restoreBackupPath = join(dir, "restore-backups");
    const current = createSeedData();
    current.scheduleEntries = [
      {
        id: "2026-06-15__staff-nurse-001",
        date: "2026-06-15",
        staffId: "staff-nurse-001",
        shiftIds: ["shift-a1"],
        note: "current"
      }
    ];
    const replacement = createSeedData();
    replacement.scheduleEntries = [
      {
        id: "2026-06-16__staff-nurse-001",
        date: "2026-06-16",
        staffId: "staff-nurse-001",
        shiftIds: ["shift-p1"],
        note: "replacement"
      }
    ];
    writeSqliteData(sqlitePath, current);
    writeSqliteData(replacementSqlitePath, replacement);
    const replacementBackupFile = await backupSqliteDatabase({
      sqlitePath: replacementSqlitePath,
      backupPath: replacementBackupPath
    });

    await restoreSqliteBackup({ sqlitePath, backupPath: restoreBackupPath, backupFile: replacementBackupFile, confirm: true });
    const currentBackupFiles = await listDbBackups(restoreBackupPath);

    expect(currentBackupFiles).toHaveLength(1);
    expect(readSqliteData(join(restoreBackupPath, currentBackupFiles[0])).scheduleEntries).toEqual(
      current.scheduleEntries
    );
    expect(readSqliteData(sqlitePath).scheduleEntries).toEqual(replacement.scheduleEntries);
  });

  it("removes destination SQLite WAL and SHM sidecars during restore", async () => {
    const dir = await createTempDir();
    const sqlitePath = join(dir, "schedule.db");
    const replacementBackupPath = join(dir, "replacement-backups");
    const restoreBackupPath = join(dir, "restore-backups");
    const current = createSeedData();
    current.scheduleEntries = [
      {
        id: "2026-06-15__staff-nurse-001",
        date: "2026-06-15",
        staffId: "staff-nurse-001",
        shiftIds: ["shift-a1"],
        note: "current"
      }
    ];
    const replacement = createSeedData();
    replacement.scheduleEntries = [
      {
        id: "2026-06-16__staff-nurse-001",
        date: "2026-06-16",
        staffId: "staff-nurse-001",
        shiftIds: ["shift-p1"],
        note: "replacement"
      }
    ];
    writeSqliteData(sqlitePath, current);

    const replacementSqlitePath = join(dir, "replacement.db");
    writeSqliteData(replacementSqlitePath, replacement);
    const replacementBackupFile = await backupSqliteDatabase({
      sqlitePath: replacementSqlitePath,
      backupPath: replacementBackupPath
    });

    await rm(sqlitePath, { force: true });
    await writeFile(`${sqlitePath}-wal`, "stale wal", "utf8");
    await writeFile(`${sqlitePath}-shm`, "stale shm", "utf8");
    await writeFile(`${sqlitePath}-journal`, "stale journal", "utf8");

    await restoreSqliteBackup({ sqlitePath, backupPath: restoreBackupPath, backupFile: replacementBackupFile, confirm: true });

    expect(existsSync(`${sqlitePath}-wal`)).toBe(false);
    expect(existsSync(`${sqlitePath}-shm`)).toBe(false);
    expect(existsSync(`${sqlitePath}-journal`)).toBe(false);
    expect(readSqliteData(sqlitePath).scheduleEntries).toEqual(replacement.scheduleEntries);
  });

  it("restores the current database and sidecars when the final swap fails", async () => {
    const dir = await createTempDir();
    const sqlitePath = join(dir, "schedule.db");
    const replacementBackupPath = join(dir, "replacement-backups");
    const restoreBackupPath = join(dir, "restore-backups");
    const current = createSeedData();
    current.scheduleEntries = [
      {
        id: "2026-06-15__staff-nurse-001",
        date: "2026-06-15",
        staffId: "staff-nurse-001",
        shiftIds: ["shift-a1"],
        note: "current"
      }
    ];
    const replacement = createSeedData();
    replacement.scheduleEntries = [
      {
        id: "2026-06-16__staff-nurse-001",
        date: "2026-06-16",
        staffId: "staff-nurse-001",
        shiftIds: ["shift-p1"],
        note: "replacement"
      }
    ];
    writeSqliteData(sqlitePath, current);

    const replacementSqlitePath = join(dir, "replacement.db");
    writeSqliteData(replacementSqlitePath, replacement);
    const replacementBackupFile = await backupSqliteDatabase({
      sqlitePath: replacementSqlitePath,
      backupPath: replacementBackupPath
    });

    const walContents = "current wal";
    const shmContents = "current shm";
    const journalContents = "current journal";
    const originalCopyFile = sqliteMaintenanceFs.copyFile;
    const copyFileSpy = vi.spyOn(sqliteMaintenanceFs, "copyFile").mockImplementation(async (sourcePath, destinationPath) => {
      await originalCopyFile(sourcePath, destinationPath);
      if (sourcePath === replacementBackupFile) {
        await writeFile(`${sqlitePath}-wal`, walContents, "utf8");
        await writeFile(`${sqlitePath}-shm`, shmContents, "utf8");
        await writeFile(`${sqlitePath}-journal`, journalContents, "utf8");
      }
    });
    const originalRename = sqliteMaintenanceFs.rename;
    let shouldFailNextRenameIntoDestination = true;
    const renameSpy = vi.spyOn(sqliteMaintenanceFs, "rename").mockImplementation(async (oldPath, newPath) => {
      if (shouldFailNextRenameIntoDestination && newPath === sqlitePath) {
        shouldFailNextRenameIntoDestination = false;
        throw new Error(`Injected rename failure for ${newPath}`);
      }
      return originalRename(oldPath, newPath);
    });
    try {
      await expect(
        restoreSqliteBackup({
          sqlitePath,
          backupPath: restoreBackupPath,
          backupFile: replacementBackupFile,
          confirm: true
        })
      ).rejects.toThrow(/Injected rename failure/);
    } finally {
      copyFileSpy.mockRestore();
      renameSpy.mockRestore();
    }

    expect(await readFile(`${sqlitePath}-wal`, "utf8")).toBe(walContents);
    expect(await readFile(`${sqlitePath}-shm`, "utf8")).toBe(shmContents);
    expect(await readFile(`${sqlitePath}-journal`, "utf8")).toBe(journalContents);
    expect(readSqliteData(sqlitePath).scheduleEntries).toEqual(current.scheduleEntries);
  });

  it("rejects a corrupt restore backup before touching the current database", async () => {
    const dir = await createTempDir();
    const sqlitePath = join(dir, "schedule.db");
    const backupPath = join(dir, "restore-backups");
    const corruptBackupFile = join(dir, "corrupt.db");
    const current = createSeedData();
    current.scheduleEntries = [
      {
        id: "2026-06-15__staff-nurse-001",
        date: "2026-06-15",
        staffId: "staff-nurse-001",
        shiftIds: ["shift-a1"],
        note: "current"
      }
    ];
    writeSqliteData(sqlitePath, current);
    const before = await readFile(sqlitePath);
    await writeFile(corruptBackupFile, "not a sqlite database", "utf8");

    await expect(
      restoreSqliteBackup({ sqlitePath, backupPath, backupFile: corruptBackupFile, confirm: true })
    ).rejects.toThrow();

    expect(await readFile(sqlitePath)).toEqual(before);
    expect(await listDbBackups(backupPath)).toEqual([]);
    expect(readSqliteData(sqlitePath).scheduleEntries).toEqual(current.scheduleEntries);
  });

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

  it("returns not ok when checking a SQLite database with missing tables", async () => {
    const dir = await createTempDir();
    const sqlitePath = join(dir, "schedule.db");
    const db = new Database(sqlitePath);
    try {
      db.exec("create table staff (id text primary key)");
    } finally {
      db.close();
    }

    const check = await checkSqliteDatabase({ sqlitePath });

    expect(check.ok).toBe(false);
    expect(check.integrity).toBe("ok");
    expect(check.missingTables).toContain("app_settings");
  });

  it("returns not ok when checking a SQLite database with legacy monthly settlement row columns", async () => {
    const dir = await createTempDir();
    const sqlitePath = join(dir, "schedule.db");
    const db = new Database(sqlitePath);
    try {
      initializeSqliteSchema(db);
      db.exec(`
        drop table monthly_settlement_rows;

        create table monthly_settlement_rows (
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
      `);
    } finally {
      db.close();
    }

    const legacyCheck = await checkSqliteDatabase({ sqlitePath });

    expect(legacyCheck.ok).toBe(false);
    expect(legacyCheck.integrity).toBe("ok");
    expect(legacyCheck.missingTables).toEqual([]);
    expect(legacyCheck.missingColumns).toEqual([
      "monthly_settlement_rows.required_shifts",
      "monthly_settlement_rows.attendance_balance"
    ]);

    await initSqliteDatabase({ sqlitePath });
    const migratedCheck = await checkSqliteDatabase({ sqlitePath });

    expect(migratedCheck.ok).toBe(true);
    expect(migratedCheck.missingColumns).toEqual([]);
  });
});
