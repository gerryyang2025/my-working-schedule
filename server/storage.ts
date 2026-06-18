import type { ServerConfig } from "./config";
import { createJsonStorage, DEFAULT_STORAGE_PATH } from "./json-storage";
import type { AppData } from "./types";

export { createJsonStorage, DEFAULT_STORAGE_PATH };

export interface StorageAdapter {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
  update(mutator: (current: AppData) => AppData | Promise<AppData>): Promise<AppData>;
}

export function createConfiguredStorage(config: ServerConfig): StorageAdapter {
  if (config.storageDriver === "json") {
    return createJsonStorage(config.storagePath);
  }

  throw new Error("SQLite 存储尚未实现");
}
