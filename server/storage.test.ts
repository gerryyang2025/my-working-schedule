import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createJsonStorage } from "./storage";

const tempDirs: string[] = [];

async function createTempDataPath() {
  const dir = await mkdtemp(join(tmpdir(), "schedule-storage-"));
  tempDirs.push(dir);
  return join(dir, "app-data.json");
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("JSON storage", () => {
  it("creates seed data when the file is missing", async () => {
    const path = await createTempDataPath();
    const storage = createJsonStorage(path);

    const data = await storage.load();
    const persisted = JSON.parse(await readFile(path, "utf8"));

    expect(data.staff).toHaveLength(3);
    expect(persisted.staff).toHaveLength(3);
  });

  it("throws on malformed JSON without overwriting the existing file", async () => {
    const path = await createTempDataPath();
    const malformed = "{ not valid json";
    await writeFile(path, malformed, "utf8");

    await expect(createJsonStorage(path).load()).rejects.toThrow(SyntaxError);
    await expect(readFile(path, "utf8")).resolves.toBe(malformed);
  });
});
