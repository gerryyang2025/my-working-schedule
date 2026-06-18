import { resolve } from "node:path";
import type { ServerConfig } from "./config";
import { createJsonStorage, DEFAULT_STORAGE_PATH } from "./json-storage";
import { createSqliteStorage } from "./sqlite/storage";
import type { AppData } from "./types";

export { createJsonStorage, DEFAULT_STORAGE_PATH, createSqliteStorage };

export const DEFAULT_SQLITE_PATH = resolve(process.cwd(), "data/schedule.db");

export interface StorageAdapter {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
  update(mutator: (current: AppData) => AppData | Promise<AppData>): Promise<AppData>;
}

export function createConfiguredStorage(config: ServerConfig): StorageAdapter {
  if (config.storageDriver === "json") {
    return createJsonStorage(config.storagePath);
  }

  return createSqliteStorage(config.sqlitePath ?? DEFAULT_SQLITE_PATH);
}
