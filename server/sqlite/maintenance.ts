import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import * as fsPromises from "node:fs/promises";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { readJsonAppData, writeJsonAppData } from "../app-data";
import type { AppData } from "../types";
import { readAppDataFromSqlite, replaceAppDataInSqlite } from "./mapper";
import { checkSqliteIntegrity, initializeSqliteSchema, listMissingCoreTables } from "./schema";

export const sqliteMaintenanceFs = {
  copyFile: fsPromises.copyFile,
  mkdir: fsPromises.mkdir,
  rename: fsPromises.rename,
  rm: fsPromises.rm
};

const SQLITE_SIDECAR_SUFFIXES = ["-journal", "-shm", "-wal"] as const;
const SQLITE_PERSISTED_SETTING_KEYS = ["defaultRequiredShiftsPerWeek", "version"] as const;

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

function timestamp(): string {
  return new Date().toISOString().replace(/[-:.]/g, "");
}

function createTempSqlitePath(sqlitePath: string): string {
  return `${sqlitePath}.tmp-${process.pid}-${timestamp()}-${randomUUID()}`;
}

function createRollbackSqliteArtifactPath(path: string): string {
  return `${path}.restore-${process.pid}-${timestamp()}-${randomUUID()}`;
}

function listSqliteArtifactPaths(path: string): string[] {
  return [path, ...SQLITE_SIDECAR_SUFFIXES.map((suffix) => `${path}${suffix}`)];
}

async function cleanupSqliteFile(path: string): Promise<void> {
  await Promise.all(listSqliteArtifactPaths(path).map((candidate) => sqliteMaintenanceFs.rm(candidate, { force: true })));
}

interface MovedSqliteArtifact {
  originalPath: string;
  rollbackPath: string;
}

async function restoreMovedSqliteArtifacts(artifacts: MovedSqliteArtifact[]): Promise<void> {
  for (const artifact of artifacts) {
    await sqliteMaintenanceFs.rename(artifact.rollbackPath, artifact.originalPath);
  }
}

async function cleanupMovedSqliteArtifacts(artifacts: MovedSqliteArtifact[]): Promise<void> {
  await Promise.all(artifacts.map((artifact) => sqliteMaintenanceFs.rm(artifact.rollbackPath, { force: true })));
}

async function moveSqliteArtifactsToRollback(path: string): Promise<MovedSqliteArtifact[]> {
  const movedArtifacts: MovedSqliteArtifact[] = [];
  try {
    for (const candidate of listSqliteArtifactPaths(path)) {
      if (!existsSync(candidate)) {
        continue;
      }
      const rollbackPath = createRollbackSqliteArtifactPath(candidate);
      await sqliteMaintenanceFs.rename(candidate, rollbackPath);
      movedArtifacts.push({ originalPath: candidate, rollbackPath });
    }
    return movedArtifacts;
  } catch (error) {
    await restoreMovedSqliteArtifacts(movedArtifacts);
    throw error;
  }
}

function ensureDefaultSettings(db: Database.Database): void {
  db.prepare("insert or ignore into app_settings (key, value) values (?, ?)").run("defaultRequiredShiftsPerWeek", "5");
  db.prepare("insert or ignore into app_settings (key, value) values (?, ?)").run("version", "1");
}

function countRows(db: Database.Database, table: string): number {
  const row = db.prepare(`select count(*) as count from ${table}`).get() as { count: number };
  return row.count;
}

function countExpectedRows(data: AppData): Record<string, number> {
  return {
    staff: data.staff.length,
    shifts: data.shifts.length,
    holidays: data.holidays.length,
    scheduleEntries: data.scheduleEntries.length,
    scheduleEntryShifts: data.scheduleEntries.reduce((total, entry) => total + entry.shiftIds.length, 0),
    monthlySettlements: data.monthlySettlements.length,
    monthlySettlementRows: data.monthlySettlements.reduce((total, settlement) => total + settlement.rows.length, 0),
    settings: SQLITE_PERSISTED_SETTING_KEYS.reduce((total, key) => total + (key in data.settings ? 1 : 0), 0)
  };
}

function countActualRows(db: Database.Database): Record<string, number> {
  return {
    staff: countRows(db, "staff"),
    shifts: countRows(db, "shifts"),
    holidays: countRows(db, "holidays"),
    scheduleEntries: countRows(db, "schedule_entries"),
    scheduleEntryShifts: countRows(db, "schedule_entry_shifts"),
    monthlySettlements: countRows(db, "monthly_settlements"),
    monthlySettlementRows: countRows(db, "monthly_settlement_rows"),
    settings: countRows(db, "app_settings")
  };
}

function buildMigrationCounts(data: AppData, db: Database.Database): Record<string, MigrationCount> {
  const expected = countExpectedRows(data);
  const actual = countActualRows(db);
  return Object.fromEntries(
    Object.entries(expected).map(([key, expectedCount]) => [
      key,
      {
        expected: expectedCount,
        actual: actual[key] ?? 0
      }
    ])
  );
}

function countsAreOk(counts: Record<string, MigrationCount>): boolean {
  return Object.values(counts).every((count) => count.expected === count.actual);
}

function checkOpenSqliteDatabase(db: Database.Database): { ok: boolean; integrity: string; missingTables: string[] } {
  const integrity = checkSqliteIntegrity(db);
  const missingTables = listMissingCoreTables(db);
  return {
    ok: integrity === "ok" && missingTables.length === 0,
    integrity,
    missingTables
  };
}

function assertValidOpenSqliteDatabase(db: Database.Database, label: string): void {
  const check = checkOpenSqliteDatabase(db);
  if (!check.ok) {
    throw new Error(
      `${label} is not a valid SQLite database: integrity=${check.integrity}; missingTables=${check.missingTables.join(",")}`
    );
  }
}

function validateSqliteFile(path: string, label: string): void {
  const db = new Database(path, { fileMustExist: true });
  try {
    assertValidOpenSqliteDatabase(db, label);
  } finally {
    db.close();
  }
}

export async function initSqliteDatabase(options: CheckOptions): Promise<string> {
  await sqliteMaintenanceFs.mkdir(dirname(options.sqlitePath), { recursive: true });
  const db = new Database(options.sqlitePath);
  try {
    initializeSqliteSchema(db);
    ensureDefaultSettings(db);
  } finally {
    db.close();
  }
  return options.sqlitePath;
}

export async function migrateJsonToSqlite(options: MigrationOptions): Promise<MigrationReport> {
  if (existsSync(options.sqlitePath) && !options.overwrite) {
    throw new Error("SQLite database already exists. Pass overwrite to replace it.");
  }

  const { data } = await readJsonAppData(options.jsonPath);
  await sqliteMaintenanceFs.mkdir(options.backupPath, { recursive: true });
  const sourceJsonBackupPath = join(options.backupPath, `app-data-before-sqlite-${timestamp()}.json`);
  await sqliteMaintenanceFs.copyFile(options.jsonPath, sourceJsonBackupPath);
  await sqliteMaintenanceFs.mkdir(dirname(options.sqlitePath), { recursive: true });

  const tempSqlitePath = createTempSqlitePath(options.sqlitePath);
  let db: Database.Database | undefined;
  try {
    db = new Database(tempSqlitePath);
    initializeSqliteSchema(db);
    replaceAppDataInSqlite(db, data);
    const counts = buildMigrationCounts(data, db);
    assertValidOpenSqliteDatabase(db, "Migrated SQLite database");
    const report = {
      ok: countsAreOk(counts),
      counts,
      sourceJsonBackupPath,
      sqlitePath: options.sqlitePath
    };

    if (!report.ok) {
      throw new Error("SQLite migration count verification failed.");
    }

    db.close();
    db = undefined;
    await sqliteMaintenanceFs.rename(tempSqlitePath, options.sqlitePath);
    return report;
  } finally {
    if (db) {
      db.close();
    }
    await cleanupSqliteFile(tempSqlitePath);
  }
}

export async function exportSqliteToJson(options: ExportOptions): Promise<string> {
  const db = new Database(options.sqlitePath, { fileMustExist: true });
  try {
    const data = readAppDataFromSqlite(db);
    await writeJsonAppData(options.exportPath, data);
    return options.exportPath;
  } finally {
    db.close();
  }
}

export async function backupSqliteDatabase(options: BackupOptions): Promise<string> {
  await sqliteMaintenanceFs.mkdir(options.backupPath, { recursive: true });
  const backupFile = join(options.backupPath, `schedule-${timestamp()}-${randomUUID()}.db`);
  const db = new Database(options.sqlitePath, { fileMustExist: true });
  try {
    await db.backup(backupFile);
    return backupFile;
  } finally {
    db.close();
  }
}

export async function restoreSqliteBackup(options: RestoreOptions): Promise<string> {
  if (!options.confirm) {
    throw new Error("Restore requires confirm to be true.");
  }

  validateSqliteFile(options.backupFile, "Selected SQLite backup");

  if (existsSync(options.sqlitePath)) {
    await backupSqliteDatabase({ sqlitePath: options.sqlitePath, backupPath: options.backupPath });
  }

  await sqliteMaintenanceFs.mkdir(dirname(options.sqlitePath), { recursive: true });
  const tempSqlitePath = createTempSqlitePath(options.sqlitePath);
  let rollbackArtifacts: MovedSqliteArtifact[] = [];
  try {
    await sqliteMaintenanceFs.copyFile(options.backupFile, tempSqlitePath);
    validateSqliteFile(tempSqlitePath, "Copied SQLite backup");
    rollbackArtifacts = await moveSqliteArtifactsToRollback(options.sqlitePath);
    try {
      await sqliteMaintenanceFs.rename(tempSqlitePath, options.sqlitePath);
    } catch (error) {
      await restoreMovedSqliteArtifacts(rollbackArtifacts);
      throw error;
    }
    await cleanupMovedSqliteArtifacts(rollbackArtifacts);
    return options.sqlitePath;
  } finally {
    await cleanupSqliteFile(tempSqlitePath);
  }
}

export async function checkSqliteDatabase(
  options: CheckOptions
): Promise<{ ok: boolean; integrity: string; missingTables: string[] }> {
  const db = new Database(options.sqlitePath, { fileMustExist: true });
  try {
    return checkOpenSqliteDatabase(db);
  } finally {
    db.close();
  }
}
