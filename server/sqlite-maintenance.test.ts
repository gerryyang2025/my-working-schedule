import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppData } from "../src/types/domain";
import { createSeedData } from "./seed";
import {
  backupSqliteDatabase,
  checkSqliteDatabase,
  exportSqliteToJson,
  initSqliteDatabase,
  migrateJsonToSqlite,
  restoreSqliteBackup,
  sqliteMaintenanceFs
} from "./sqlite/maintenance";

const tempDirs: string[] = [];

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "schedule-sqlite-maintenance-"));
  tempDirs.push(dir);
  return dir;
}

async function writeAppData(path: string, data = createSeedData()) {
  const content = `${JSON.stringify(data, null, 2)}\n`;
  await writeFile(path, content, "utf8");
  return content;
}

async function exportSqliteData(sqlitePath: string, dir: string) {
  const exportPath = join(dir, `export-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  await exportSqliteToJson({ sqlitePath, exportPath });
  return JSON.parse(await readFile(exportPath, "utf8"));
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

  it("migrates JSON data into SQLite with a successful report", async () => {
    const dir = await createTempDir();
    const jsonPath = join(dir, "app-data.local.json");
    const sqlitePath = join(dir, "schedule.db");
    const backupPath = join(dir, "backups");
    const seed = createSeedData();
    seed.scheduleEntries = [
      { id: "2026-06-15__staff-nurse-001", date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" }
    ];
    const jsonContent = await writeAppData(jsonPath, seed);

    const report = await migrateJsonToSqlite({ jsonPath, sqlitePath, backupPath });
    const backupRelativePath = relative(backupPath, report.sourceJsonBackupPath);

    expect(report.ok).toBe(true);
    expect(report.counts.scheduleEntries).toEqual({ expected: 1, actual: 1 });
    expect(backupRelativePath).not.toBe("");
    expect(backupRelativePath.startsWith("..")).toBe(false);
    expect(isAbsolute(backupRelativePath)).toBe(false);
    expect(existsSync(report.sourceJsonBackupPath)).toBe(true);
    expect(await readFile(report.sourceJsonBackupPath, "utf8")).toBe(jsonContent);
    expect(existsSync(sqlitePath)).toBe(true);
  });

  it("ignores legacy adminPassword during JSON migration count verification and export", async () => {
    const dir = await createTempDir();
    const jsonPath = join(dir, "app-data.local.json");
    const sqlitePath = join(dir, "schedule.db");
    const backupPath = join(dir, "backups");
    const seed = createSeedData() as AppData & { settings: AppData["settings"] & { adminPassword: string } };
    seed.settings.adminPassword = "legacy-secret";
    seed.scheduleEntries = [
      { id: "2026-06-15__staff-nurse-001", date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" }
    ];
    await writeAppData(jsonPath, seed);

    const report = await migrateJsonToSqlite({ jsonPath, sqlitePath, backupPath });
    const exported = await exportSqliteData(sqlitePath, dir);

    expect(report.ok).toBe(true);
    expect(report.counts.settings).toEqual({ expected: 2, actual: 2 });
    expect(exported.settings).toEqual({
      defaultRequiredShiftsPerWeek: seed.settings.defaultRequiredShiftsPerWeek,
      version: seed.settings.version
    });
    expect("adminPassword" in exported.settings).toBe(false);
    expect(exported.scheduleEntries).toEqual(seed.scheduleEntries);
    expect(exported.staff).toEqual(seed.staff);
    expect(exported.shifts).toEqual(seed.shifts);
    expect(exported.holidays).toEqual(seed.holidays);
    expect(exported.monthlySettlements).toEqual(seed.monthlySettlements);
  });

  it("exports SQLite data back to JSON", async () => {
    const dir = await createTempDir();
    const jsonPath = join(dir, "app-data.local.json");
    const sqlitePath = join(dir, "schedule.db");
    const exportPath = join(dir, "exports", "app-data.json");
    await writeAppData(jsonPath);
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
    await writeAppData(jsonPath);
    await migrateJsonToSqlite({ jsonPath, sqlitePath, backupPath });

    const backupFile = await backupSqliteDatabase({ sqlitePath, backupPath });
    await rm(sqlitePath, { force: true });
    await restoreSqliteBackup({ sqlitePath, backupPath, backupFile, confirm: true });
    const check = await checkSqliteDatabase({ sqlitePath });

    expect(existsSync(sqlitePath)).toBe(true);
    expect(check.ok).toBe(true);
  });

  it("refuses to migrate over an existing SQLite database without touching it", async () => {
    const dir = await createTempDir();
    const jsonPath = join(dir, "app-data.local.json");
    const sqlitePath = join(dir, "schedule.db");
    const backupPath = join(dir, "backups");
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
    await writeAppData(jsonPath, current);
    await migrateJsonToSqlite({ jsonPath, sqlitePath, backupPath });
    const before = await readFile(sqlitePath);

    const next = createSeedData();
    next.scheduleEntries = [
      {
        id: "2026-06-16__staff-nurse-001",
        date: "2026-06-16",
        staffId: "staff-nurse-001",
        shiftIds: ["shift-p1"],
        note: "next"
      }
    ];
    await writeAppData(jsonPath, next);

    await expect(migrateJsonToSqlite({ jsonPath, sqlitePath, backupPath })).rejects.toThrow(/already exists/i);

    expect(await readFile(sqlitePath)).toEqual(before);
    expect((await exportSqliteData(sqlitePath, dir)).scheduleEntries).toEqual(current.scheduleEntries);
  });

  it("cleans up a failed migration without leaving a final SQLite database", async () => {
    const dir = await createTempDir();
    const jsonPath = join(dir, "app-data.local.json");
    const sqlitePath = join(dir, "schedule.db");
    const backupPath = join(dir, "backups");
    const invalid = createSeedData();
    invalid.scheduleEntries = [
      {
        id: "2026-06-15__missing-staff",
        date: "2026-06-15",
        staffId: "missing-staff",
        shiftIds: ["shift-a1"],
        note: "invalid foreign key"
      }
    ];
    await writeAppData(jsonPath, invalid);

    await expect(migrateJsonToSqlite({ jsonPath, sqlitePath, backupPath })).rejects.toThrow(/constraint|foreign key/i);

    expect(existsSync(sqlitePath)).toBe(false);
    expect((await readdir(dir)).filter((file) => file.includes("schedule.db.tmp"))).toEqual([]);
  });

  it("rejects restore when confirmation is false", async () => {
    const dir = await createTempDir();
    const jsonPath = join(dir, "app-data.local.json");
    const sqlitePath = join(dir, "schedule.db");
    const backupPath = join(dir, "backups");
    await writeAppData(jsonPath);
    await migrateJsonToSqlite({ jsonPath, sqlitePath, backupPath });
    const backupFile = await backupSqliteDatabase({ sqlitePath, backupPath });
    const before = await readFile(sqlitePath);

    await expect(restoreSqliteBackup({ sqlitePath, backupPath, backupFile, confirm: false })).rejects.toThrow(/confirm/i);

    expect(await readFile(sqlitePath)).toEqual(before);
  });

  it("backs up the current SQLite database before restoring another backup", async () => {
    const dir = await createTempDir();
    const currentJsonPath = join(dir, "current.json");
    const replacementJsonPath = join(dir, "replacement.json");
    const sqlitePath = join(dir, "schedule.db");
    const replacementSqlitePath = join(dir, "replacement.db");
    const migrationBackups = join(dir, "migration-backups");
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
    await writeAppData(currentJsonPath, current);
    await writeAppData(replacementJsonPath, replacement);
    await migrateJsonToSqlite({ jsonPath: currentJsonPath, sqlitePath, backupPath: migrationBackups });
    await migrateJsonToSqlite({ jsonPath: replacementJsonPath, sqlitePath: replacementSqlitePath, backupPath: migrationBackups });
    const replacementBackupFile = await backupSqliteDatabase({
      sqlitePath: replacementSqlitePath,
      backupPath: replacementBackupPath
    });

    await restoreSqliteBackup({ sqlitePath, backupPath: restoreBackupPath, backupFile: replacementBackupFile, confirm: true });
    const currentBackupFiles = await listDbBackups(restoreBackupPath);

    expect(currentBackupFiles).toHaveLength(1);
    expect((await exportSqliteData(join(restoreBackupPath, currentBackupFiles[0]), dir)).scheduleEntries).toEqual(
      current.scheduleEntries
    );
    expect((await exportSqliteData(sqlitePath, dir)).scheduleEntries).toEqual(replacement.scheduleEntries);
  });

  it("removes destination SQLite WAL and SHM sidecars during restore", async () => {
    const dir = await createTempDir();
    const currentJsonPath = join(dir, "current.json");
    const replacementJsonPath = join(dir, "replacement.json");
    const sqlitePath = join(dir, "schedule.db");
    const migrationBackups = join(dir, "migration-backups");
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
    await writeAppData(currentJsonPath, current);
    await writeAppData(replacementJsonPath, replacement);
    await migrateJsonToSqlite({ jsonPath: currentJsonPath, sqlitePath, backupPath: migrationBackups });

    const replacementSqlitePath = join(dir, "replacement.db");
    await migrateJsonToSqlite({
      jsonPath: replacementJsonPath,
      sqlitePath: replacementSqlitePath,
      backupPath: migrationBackups
    });
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
    expect((await exportSqliteData(sqlitePath, dir)).scheduleEntries).toEqual(replacement.scheduleEntries);
  });

  it("restores the current database and sidecars when the final swap fails", async () => {
    const dir = await createTempDir();
    const currentJsonPath = join(dir, "current.json");
    const replacementJsonPath = join(dir, "replacement.json");
    const sqlitePath = join(dir, "schedule.db");
    const migrationBackups = join(dir, "migration-backups");
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
    await writeAppData(currentJsonPath, current);
    await writeAppData(replacementJsonPath, replacement);
    await migrateJsonToSqlite({ jsonPath: currentJsonPath, sqlitePath, backupPath: migrationBackups });

    const replacementSqlitePath = join(dir, "replacement.db");
    await migrateJsonToSqlite({
      jsonPath: replacementJsonPath,
      sqlitePath: replacementSqlitePath,
      backupPath: migrationBackups
    });
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
    expect((await exportSqliteData(sqlitePath, dir)).scheduleEntries).toEqual(current.scheduleEntries);
  });

  it("rejects a corrupt restore backup before touching the current database", async () => {
    const dir = await createTempDir();
    const jsonPath = join(dir, "app-data.local.json");
    const sqlitePath = join(dir, "schedule.db");
    const backupPath = join(dir, "restore-backups");
    const migrationBackups = join(dir, "migration-backups");
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
    await writeAppData(jsonPath, current);
    await migrateJsonToSqlite({ jsonPath, sqlitePath, backupPath: migrationBackups });
    const before = await readFile(sqlitePath);
    await writeFile(corruptBackupFile, "not a sqlite database", "utf8");

    await expect(
      restoreSqliteBackup({ sqlitePath, backupPath, backupFile: corruptBackupFile, confirm: true })
    ).rejects.toThrow();

    expect(await readFile(sqlitePath)).toEqual(before);
    expect(await listDbBackups(backupPath)).toEqual([]);
    expect((await exportSqliteData(sqlitePath, dir)).scheduleEntries).toEqual(current.scheduleEntries);
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
});
