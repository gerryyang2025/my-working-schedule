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
