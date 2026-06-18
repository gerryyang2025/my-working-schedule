import { resolve } from "node:path";
import type { ServerConfig } from "./config";
import { createJsonStorage, DEFAULT_STORAGE_PATH } from "./json-storage";
import type { AppData } from "./types";

export { createJsonStorage, DEFAULT_STORAGE_PATH };

export const DEFAULT_SQLITE_PATH = resolve(process.cwd(), "data/schedule.db");

export interface StorageAdapter {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
  update(mutator: (current: AppData) => AppData | Promise<AppData>): Promise<AppData>;
}

export function createSqliteStorage(path: string): StorageAdapter {
  let adapterPromise: Promise<StorageAdapter> | undefined;

  function getAdapter() {
    adapterPromise ??= import("./sqlite/storage").then((module) => module.createSqliteStorage(path));
    return adapterPromise;
  }

  return {
    async load() {
      const adapter = await getAdapter();
      return adapter.load();
    },
    async save(data) {
      const adapter = await getAdapter();
      return adapter.save(data);
    },
    async update(mutator) {
      const adapter = await getAdapter();
      return adapter.update(mutator);
    }
  };
}

export function createConfiguredStorage(config: ServerConfig): StorageAdapter {
  if (config.storageDriver === "json") {
    return createJsonStorage(config.storagePath);
  }

  return createSqliteStorage(config.sqlitePath ?? DEFAULT_SQLITE_PATH);
}
