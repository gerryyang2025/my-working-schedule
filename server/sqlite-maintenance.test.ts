import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSeedData } from "./seed";
import {
  backupSqliteDatabase,
  checkSqliteDatabase,
  exportSqliteToJson,
  initSqliteDatabase,
  migrateJsonToSqlite,
  restoreSqliteBackup
} from "./sqlite/maintenance";

const tempDirs: string[] = [];

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "schedule-sqlite-maintenance-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("SQLite maintenance", () => {
  it("initializes an empty SQLite database", async () => {
    const dir = await createTempDir();
    const sqlitePath = join(dir, "schedule.db");

    await initSqliteDatabase({ sqlitePath });
    const check = await checkSqliteDatabase({ sqlitePath });

    expect(check.ok).toBe(true);
  });

  it("migrates JSON data into SQLite with a successful report", async () => {
    const dir = await createTempDir();
    const jsonPath = join(dir, "app-data.local.json");
    const sqlitePath = join(dir, "schedule.db");
    const backupPath = join(dir, "backups");
    const seed = createSeedData();
    seed.scheduleEntries = [
      { id: "2026-06-15__staff-nurse-001", date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" }
    ];
    const jsonContent = `${JSON.stringify(seed, null, 2)}\n`;
    await writeFile(jsonPath, jsonContent, "utf8");

    const report = await migrateJsonToSqlite({ jsonPath, sqlitePath, backupPath });
    const backupRelativePath = relative(backupPath, report.sourceJsonBackupPath);

    expect(report.ok).toBe(true);
    expect(report.counts.scheduleEntries).toEqual({ expected: 1, actual: 1 });
    expect(backupRelativePath).not.toBe("");
    expect(backupRelativePath.startsWith("..")).toBe(false);
    expect(isAbsolute(backupRelativePath)).toBe(false);
    expect(existsSync(report.sourceJsonBackupPath)).toBe(true);
    expect(await readFile(report.sourceJsonBackupPath, "utf8")).toBe(jsonContent);
    expect(existsSync(sqlitePath)).toBe(true);
  });

  it("exports SQLite data back to JSON", async () => {
    const dir = await createTempDir();
    const jsonPath = join(dir, "app-data.local.json");
    const sqlitePath = join(dir, "schedule.db");
    const exportPath = join(dir, "exports", "app-data.json");
    await writeFile(jsonPath, `${JSON.stringify(createSeedData(), null, 2)}\n`, "utf8");
    await migrateJsonToSqlite({ jsonPath, sqlitePath, backupPath: join(dir, "backups") });

    await exportSqliteToJson({ sqlitePath, exportPath });
    const exported = JSON.parse(await readFile(exportPath, "utf8"));

    expect(exported.staff).toHaveLength(3);
    expect(exported.shifts).toHaveLength(5);
  });

  it("backs up and restores a SQLite database", async () => {
    const dir = await createTempDir();
    const jsonPath = join(dir, "app-data.local.json");
    const sqlitePath = join(dir, "schedule.db");
    const backupPath = join(dir, "backups");
    await writeFile(jsonPath, `${JSON.stringify(createSeedData(), null, 2)}\n`, "utf8");
    await migrateJsonToSqlite({ jsonPath, sqlitePath, backupPath });

    const backupFile = await backupSqliteDatabase({ sqlitePath, backupPath });
    await rm(sqlitePath, { force: true });
    await restoreSqliteBackup({ sqlitePath, backupPath, backupFile, confirm: true });
    const check = await checkSqliteDatabase({ sqlitePath });

    expect(existsSync(sqlitePath)).toBe(true);
    expect(check.ok).toBe(true);
  });
});
