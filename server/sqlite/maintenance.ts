import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { readJsonAppData, writeJsonAppData } from "../app-data";
import type { AppData } from "../types";
import { readAppDataFromSqlite, replaceAppDataInSqlite } from "./mapper";
import { checkSqliteIntegrity, initializeSqliteSchema, listMissingCoreTables } from "./schema";

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
    settings: Object.keys(data.settings).length
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

export async function initSqliteDatabase(options: CheckOptions): Promise<string> {
  await mkdir(dirname(options.sqlitePath), { recursive: true });
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
  await mkdir(options.backupPath, { recursive: true });
  const sourceJsonBackupPath = join(options.backupPath, `app-data-before-sqlite-${timestamp()}.json`);
  await copyFile(options.jsonPath, sourceJsonBackupPath);
  await mkdir(dirname(options.sqlitePath), { recursive: true });

  const db = new Database(options.sqlitePath);
  try {
    initializeSqliteSchema(db);
    replaceAppDataInSqlite(db, data);
    const counts = buildMigrationCounts(data, db);
    return {
      ok: countsAreOk(counts),
      counts,
      sourceJsonBackupPath,
      sqlitePath: options.sqlitePath
    };
  } finally {
    db.close();
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
  await mkdir(options.backupPath, { recursive: true });
  const backupFile = join(options.backupPath, `schedule-${timestamp()}.db`);
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

  if (existsSync(options.sqlitePath)) {
    await backupSqliteDatabase({ sqlitePath: options.sqlitePath, backupPath: options.backupPath });
  }

  await mkdir(dirname(options.sqlitePath), { recursive: true });
  await copyFile(options.backupFile, options.sqlitePath);
  return options.sqlitePath;
}

export async function checkSqliteDatabase(
  options: CheckOptions
): Promise<{ ok: boolean; integrity: string; missingTables: string[] }> {
  const db = new Database(options.sqlitePath, { fileMustExist: true });
  try {
    const integrity = checkSqliteIntegrity(db);
    const missingTables = listMissingCoreTables(db);
    return {
      ok: integrity === "ok" && missingTables.length === 0,
      integrity,
      missingTables
    };
  } finally {
    db.close();
  }
}
