import { resolve } from "node:path";
import { readJsonAppData, writeJsonAppData } from "./app-data";
import { createSeedData } from "./seed";
import type { StorageAdapter } from "./storage";
import type { AppData } from "./types";

export const DEFAULT_STORAGE_PATH = resolve(process.cwd(), "data/app-data.local.json");

export function createJsonStorage(path = DEFAULT_STORAGE_PATH): StorageAdapter {
  let updateQueue = Promise.resolve();

  async function saveData(data: AppData) {
    await writeJsonAppData(path, data);
  }

  async function loadData() {
    try {
      const { data, changed } = await readJsonAppData(path);
      if (changed) {
        await saveData(data);
      }
      return data;
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
        if (next === current) {
          return next;
        }
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
