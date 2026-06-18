import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createSeedData } from "./seed";
import { readAppDataFromSqlite, replaceAppDataInSqlite } from "./sqlite/mapper";
import { initializeSqliteSchema } from "./sqlite/schema";

const tempDirs: string[] = [];

async function createTempDbPath() {
  const dir = await mkdtemp(join(tmpdir(), "schedule-sqlite-"));
  tempDirs.push(dir);
  return join(dir, "schedule.db");
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("SQLite schema and mapper", () => {
  it("creates all required tables", async () => {
    const db = new Database(await createTempDbPath());
    try {
      initializeSqliteSchema(db);

      const rows = db
        .prepare("select name from sqlite_master where type = 'table' order by name")
        .all() as Array<{ name: string }>;

      expect(rows.map((row) => row.name)).toEqual(
        expect.arrayContaining([
          "app_settings",
          "holidays",
          "monthly_settlement_rows",
          "monthly_settlements",
          "schedule_entries",
          "schedule_entry_shifts",
          "schema_migrations",
          "shifts",
          "staff"
        ])
      );
    } finally {
      db.close();
    }
  });

  it("round-trips seed data through SQLite tables", async () => {
    const db = new Database(await createTempDbPath());
    try {
      initializeSqliteSchema(db);

      const seed = createSeedData();
      seed.scheduleEntries = [
        {
          id: "2026-06-15__staff-nurse-001",
          date: "2026-06-15",
          staffId: "staff-nurse-001",
          shiftIds: ["shift-a1", "shift-p1"],
          note: "two shifts"
        }
      ];

      replaceAppDataInSqlite(db, seed);
      const loaded = readAppDataFromSqlite(db);

      expect(loaded).toEqual(seed);
    } finally {
      db.close();
    }
  });

  it("reads an initialized empty database with default settings", async () => {
    const db = new Database(await createTempDbPath());
    try {
      initializeSqliteSchema(db);

      expect(readAppDataFromSqlite(db)).toEqual({
        staff: [],
        shifts: [],
        holidays: [],
        scheduleEntries: [],
        monthlySettlements: [],
        settings: {
          defaultRequiredShiftsPerWeek: 5,
          version: 1
        }
      });
    } finally {
      db.close();
    }
  });
});
