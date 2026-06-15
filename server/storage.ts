import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createSeedData } from "./seed";
import type { AppData } from "./types";

export interface StorageAdapter {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
}

export function createJsonStorage(path = resolve(process.cwd(), "data/app-data.json")): StorageAdapter {
  return {
    async load() {
      try {
        const content = await readFile(path, "utf8");
        return JSON.parse(content) as AppData;
      } catch {
        const seedData = createSeedData();
        await this.save(seedData);
        return seedData;
      }
    },
    async save(data) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    }
  };
}
