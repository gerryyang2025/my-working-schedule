import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import * as fsPromises from "node:fs/promises";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { checkSqliteIntegrity, initializeSqliteSchema, listMissingCoreColumns, listMissingCoreTables } from "./schema";

export const sqliteMaintenanceFs = {
  copyFile: fsPromises.copyFile,
  mkdir: fsPromises.mkdir,
  rename: fsPromises.rename,
  rm: fsPromises.rm
};

const SQLITE_SIDECAR_SUFFIXES = ["-journal", "-shm", "-wal"] as const;

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

export interface ResetOptions {
  sqlitePath: string;
  backupPath: string;
  confirm: boolean;
}

export interface CheckOptions {
  sqlitePath: string;
}

export interface CheckResult {
  ok: boolean;
  integrity: string;
  missingTables: string[];
  missingColumns: string[];
}

export interface ResetResult {
  sqlitePath: string;
  backupFile: string;
  clearedTables: string[];
  check: CheckResult;
  message: string;
}

const RESET_CLEARED_TABLES = [
  "schedule_entry_shifts",
  "schedule_entries",
  "monthly_settlement_rows",
  "monthly_settlements",
  "user_sessions",
  "audit_logs"
] as const;

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

function checkOpenSqliteDatabase(db: Database.Database): CheckResult {
  const integrity = checkSqliteIntegrity(db);
  const missingTables = listMissingCoreTables(db);
  const missingColumns = listMissingCoreColumns(db);
  return {
    ok: integrity === "ok" && missingTables.length === 0 && missingColumns.length === 0,
    integrity,
    missingTables,
    missingColumns
  };
}

function assertValidOpenSqliteDatabase(db: Database.Database, label: string): void {
  const check = checkOpenSqliteDatabase(db);
  if (!check.ok) {
    throw new Error(
      `${label} is not a valid SQLite database: integrity=${check.integrity}; missingTables=${check.missingTables.join(",")}; missingColumns=${check.missingColumns.join(",")}`
    );
  }
}

function assertNoForeignKeyViolations(db: Database.Database, label: string): void {
  const rows = db.prepare("pragma foreign_key_check").all();
  if (rows.length > 0) {
    throw new Error(`${label} has foreign key violations: ${JSON.stringify(rows)}`);
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

    const reset = db.transaction((): CheckResult => {
      db.exec(`
        delete from schedule_entry_shifts;
        delete from schedule_entries;
        delete from monthly_settlement_rows;
        delete from monthly_settlements;
        delete from user_sessions;
        delete from audit_logs;
      `);

      assertNoForeignKeyViolations(db, "SQLite database after reset");
      const check = checkOpenSqliteDatabase(db);
      if (!check.ok) {
        throw new Error(
          `SQLite database after reset is invalid: integrity=${check.integrity}; missingTables=${check.missingTables.join(",")}; missingColumns=${check.missingColumns.join(",")}`
        );
      }
      return check;
    });

    const check = reset();

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

export async function checkSqliteDatabase(options: CheckOptions): Promise<CheckResult> {
  const db = new Database(options.sqlitePath, { fileMustExist: true });
  try {
    return checkOpenSqliteDatabase(db);
  } finally {
    db.close();
  }
}
