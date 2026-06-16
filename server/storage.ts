import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createSeedData } from "./seed";
import type { AppData } from "./types";

export const DEFAULT_STORAGE_PATH = resolve(process.cwd(), "data/app-data.local.json");

export interface StorageAdapter {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
  update(mutator: (current: AppData) => AppData | Promise<AppData>): Promise<AppData>;
}

export function createJsonStorage(path = DEFAULT_STORAGE_PATH): StorageAdapter {
  let updateQueue = Promise.resolve();

  async function saveData(data: AppData) {
    await mkdir(dirname(path), { recursive: true });
    const tempPath = `${path}.${randomUUID()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await rename(tempPath, path);
  }

  async function loadData() {
    try {
      const content = await readFile(path, "utf8");
      return JSON.parse(content) as AppData;
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        const seedData = createSeedData();
        await saveData(seedData);
        return seedData;
      }

      throw error;
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
