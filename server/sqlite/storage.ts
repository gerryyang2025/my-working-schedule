import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import type { StorageAdapter } from "../storage";
import type { AppData } from "../types";
import { readAppDataFromSqlite, replaceAppDataInSqlite } from "./mapper";
import { checkSqliteIntegrity, listMissingCoreTables } from "./schema";

const MISSING_SQLITE_ERROR_MESSAGE = "SQLite 数据库文件不存在，请先执行迁移或初始化命令";
const UNINITIALIZED_SQLITE_ERROR_MESSAGE = "SQLite 数据库结构未初始化，请先执行迁移或初始化命令";
const INTEGRITY_FAILED_SQLITE_ERROR_MESSAGE = "SQLite 数据库完整性检查失败，请先执行恢复或重新迁移命令";

export function createSqliteStorage(path: string): StorageAdapter {
  let updateQueue = Promise.resolve();

  function assertSqliteRuntimeReady(db: Database.Database) {
    const integrity = checkSqliteIntegrity(db);
    if (integrity !== "ok") {
      throw new Error(INTEGRITY_FAILED_SQLITE_ERROR_MESSAGE);
    }

    if (listMissingCoreTables(db).length > 0) {
      throw new Error(UNINITIALIZED_SQLITE_ERROR_MESSAGE);
    }
  }

  async function openDatabase() {
    let db: Database.Database | undefined;
    try {
      db = new Database(path, { fileMustExist: true });
      db.pragma("foreign_keys = ON");
      assertSqliteRuntimeReady(db);
      return db;
    } catch (error) {
      if (db) {
        try {
          db.close();
        } catch {
          // Preserve the original initialization/open error.
        }
      }
      if (!existsSync(path)) {
        throw new Error(MISSING_SQLITE_ERROR_MESSAGE);
      }
      throw error;
    }
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
