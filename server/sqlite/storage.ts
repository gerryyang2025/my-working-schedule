import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { StorageAdapter } from "../storage";
import type { AppData } from "../types";
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
