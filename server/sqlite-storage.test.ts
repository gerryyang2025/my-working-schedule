import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSeedData } from "./seed";
import { readAppDataFromSqlite, replaceAppDataInSqlite } from "./sqlite/mapper";
import { initializeSqliteSchema, listMissingCoreTables } from "./sqlite/schema";
import { createSqliteStorage } from "./sqlite/storage";
import type { AppData, MonthlySettlement } from "./types";

const tempDirs: string[] = [];
const MISSING_SQLITE_ERROR_MESSAGE = "SQLite 数据库文件不存在，请先执行迁移或初始化命令";
const UNINITIALIZED_SQLITE_ERROR_MESSAGE = "SQLite 数据库结构未初始化，请先执行迁移或初始化命令";

async function createTempDbPath() {
  const dir = await mkdtemp(join(tmpdir(), "schedule-sqlite-"));
  tempDirs.push(dir);
  return join(dir, "schedule.db");
}

function createMonthlySettlement(): MonthlySettlement {
  return {
    id: "settlement-2026-06",
    month: "2026-06",
    monthStart: "2026-06-01",
    monthEnd: "2026-06-30",
    totalDays: 30,
    bonusPool: 1200,
    coefficientTotal: 2.5,
    settledAt: "2026-06-30T10:00:00.000Z",
    rows: [
      {
        staffId: "staff-nurse-001",
        staffName: "Nurse Li",
        staffJobId: "100001",
        staffType: "nurse",
        attendanceShifts: 6,
        requiredShifts: 5,
        attendanceBalance: 1,
        overtimeShifts: 1,
        coefficientTotal: null,
        coefficientExcludedReason: "excluded from coefficient pool",
        bonusAmount: 0,
        bonusExcludedReason: "excluded from bonus"
      },
      {
        staffId: "staff-head-001",
        staffName: "Head Nurse Duan",
        staffJobId: "000228",
        staffType: "head_nurse",
        attendanceShifts: 7,
        requiredShifts: 5,
        attendanceBalance: 2,
        overtimeShifts: 2,
        coefficientTotal: 2.5,
        coefficientExcludedReason: "",
        bonusAmount: 1200,
        bonusExcludedReason: ""
      }
    ]
  };
}

function createReplacementData(): AppData {
  return {
    staff: [
      {
        id: "staff-replacement-001",
        jobId: "300001",
        name: "Replacement Nurse",
        type: "nurse",
        isAdmin: false,
        enabled: true,
        sortOrder: 1
      }
    ],
    shifts: [
      {
        id: "shift-replacement",
        name: "Replacement Shift",
        shortName: "R",
        color: "#0891B2",
        countsAttendance: true,
        coefficient: 1,
        enabled: true,
        sortOrder: 1
      }
    ],
    holidays: [
      {
        id: "holiday-2026-07-01",
        date: "2026-07-01",
        name: "Replacement Holiday",
        affectsRequiredAttendance: false
      }
    ],
    scheduleEntries: [
      {
        id: "2026-07-02__staff-replacement-001",
        date: "2026-07-02",
        staffId: "staff-replacement-001",
        shiftIds: ["shift-replacement"],
        note: "replacement"
      }
    ],
    monthlySettlements: [
      {
        id: "settlement-2026-07",
        month: "2026-07",
        monthStart: "2026-07-01",
        monthEnd: "2026-07-31",
        totalDays: 31,
        bonusPool: 300,
        coefficientTotal: 1,
        settledAt: "2026-07-31T10:00:00.000Z",
        rows: [
          {
            staffId: "staff-replacement-001",
            staffName: "Replacement Nurse",
            staffJobId: "300001",
            staffType: "nurse",
            attendanceShifts: 5,
            requiredShifts: 20,
            attendanceBalance: -15,
            overtimeShifts: 0,
            coefficientTotal: 1,
            coefficientExcludedReason: "",
            bonusAmount: 300,
            bonusExcludedReason: ""
          }
        ]
      }
    ],
    settings: {
      defaultRequiredShiftsPerWeek: 4,
      version: 2
    }
  };
}

function countRows(db: Database.Database, sql: string, ...params: unknown[]): number {
  const row = db.prepare(sql).get(...params) as { count: number };
  return row.count;
}

function listTableColumnNames(db: Database.Database, tableName: string): string[] {
  const rows = db.prepare(`pragma table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
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

  it("creates monthly settlement row attendance balance columns", async () => {
    const db = new Database(await createTempDbPath());
    try {
      initializeSqliteSchema(db);

      expect(listTableColumnNames(db, "monthly_settlement_rows")).toEqual(
        expect.arrayContaining(["required_shifts", "attendance_balance"])
      );
    } finally {
      db.close();
    }
  });

  it("migrates legacy monthly settlement row tables to include attendance balance columns", async () => {
    const db = new Database(await createTempDbPath());
    try {
      db.exec(`
        create table monthly_settlement_rows (
          settlement_id text not null,
          position integer not null,
          staff_id text not null,
          staff_name text not null,
          staff_job_id text not null,
          staff_type text not null check (staff_type in ('nurse', 'clerk', 'head_nurse')),
          attendance_shifts integer not null,
          overtime_shifts integer not null,
          coefficient_total real,
          coefficient_excluded_reason text not null,
          bonus_amount real not null,
          bonus_excluded_reason text not null,
          primary key(settlement_id, position),
          unique(settlement_id, staff_id)
        );
      `);

      initializeSqliteSchema(db);

      expect(listTableColumnNames(db, "monthly_settlement_rows")).toEqual(
        expect.arrayContaining(["required_shifts", "attendance_balance"])
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

  it("round-trips monthly settlements with nullable coefficient totals", async () => {
    const db = new Database(await createTempDbPath());
    try {
      initializeSqliteSchema(db);

      const seed = createSeedData();
      seed.monthlySettlements = [createMonthlySettlement()];

      replaceAppDataInSqlite(db, seed);
      const loaded = readAppDataFromSqlite(db);

      expect(loaded).toEqual(seed);
      expect(loaded.monthlySettlements[0].rows.map((row) => [row.requiredShifts, row.attendanceBalance])).toEqual([
        [5, 1],
        [5, 2]
      ]);
      expect(db.prepare("pragma foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("clears old rows when replacing app data again", async () => {
    const db = new Database(await createTempDbPath());
    try {
      initializeSqliteSchema(db);

      const first = createSeedData();
      first.scheduleEntries = [
        {
          id: "2026-06-15__staff-nurse-001",
          date: "2026-06-15",
          staffId: "staff-nurse-001",
          shiftIds: ["shift-a1", "shift-p1"],
          note: "old"
        }
      ];
      first.monthlySettlements = [createMonthlySettlement()];
      const second = createReplacementData();

      replaceAppDataInSqlite(db, first);
      replaceAppDataInSqlite(db, second);

      expect(readAppDataFromSqlite(db)).toEqual(second);
      expect(countRows(db, "select count(*) as count from staff where id = ?", "staff-nurse-001")).toBe(0);
      expect(countRows(db, "select count(*) as count from shifts where id = ?", "shift-a1")).toBe(0);
      expect(countRows(db, "select count(*) as count from holidays where id = ?", "holiday-2026-06-19")).toBe(0);
      expect(
        countRows(db, "select count(*) as count from schedule_entries where id = ?", "2026-06-15__staff-nurse-001")
      ).toBe(0);
      expect(
        countRows(db, "select count(*) as count from schedule_entry_shifts where entry_id = ?", first.scheduleEntries[0].id)
      ).toBe(0);
      expect(countRows(db, "select count(*) as count from monthly_settlements where id = ?", "settlement-2026-06")).toBe(0);
      expect(
        countRows(db, "select count(*) as count from monthly_settlement_rows where settlement_id = ?", "settlement-2026-06")
      ).toBe(0);
      expect(db.prepare("pragma foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("preserves user staff bindings when replacement data keeps the staff member", async () => {
    const db = new Database(await createTempDbPath());
    try {
      initializeSqliteSchema(db);
      db.pragma("foreign_keys = ON");

      const seed = createSeedData();
      replaceAppDataInSqlite(db, seed);
      db.prepare(
        `
          insert into users (id, username, display_name, role, staff_id, password_hash, enabled, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        "user-viewer",
        "viewer",
        "Viewer",
        "viewer",
        "staff-nurse-001",
        "hash",
        1,
        "2026-06-20T00:00:00.000Z",
        "2026-06-20T00:00:00.000Z"
      );

      const replacement = createReplacementData();
      replacement.staff = [seed.staff.find((staff) => staff.id === "staff-nurse-001")!, ...replacement.staff];

      replaceAppDataInSqlite(db, replacement);

      expect(db.prepare("select staff_id from users where id = ?").get("user-viewer")).toEqual({
        staff_id: "staff-nurse-001"
      });
      expect(db.prepare("pragma foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("clears user staff bindings when replacement data removes the staff member", async () => {
    const db = new Database(await createTempDbPath());
    try {
      initializeSqliteSchema(db);
      db.pragma("foreign_keys = ON");

      const seed = createSeedData();
      replaceAppDataInSqlite(db, seed);
      db.prepare(
        `
          insert into users (id, username, display_name, role, staff_id, password_hash, enabled, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        "user-viewer",
        "viewer",
        "Viewer",
        "viewer",
        "staff-nurse-001",
        "hash",
        1,
        "2026-06-20T00:00:00.000Z",
        "2026-06-20T00:00:00.000Z"
      );

      replaceAppDataInSqlite(db, createReplacementData());

      expect(db.prepare("select staff_id from users where id = ?").get("user-viewer")).toEqual({
        staff_id: null
      });
      expect(db.prepare("pragma foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("preserves user managed staff relations when replacement data keeps referenced staff", async () => {
    const db = new Database(await createTempDbPath());
    try {
      initializeSqliteSchema(db);
      db.pragma("foreign_keys = ON");

      const seed = createSeedData();
      replaceAppDataInSqlite(db, seed);
      db.prepare(
        `
          insert into users (id, username, display_name, role, staff_id, password_hash, enabled, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        "user-scheduler",
        "scheduler",
        "Scheduler",
        "scheduler",
        null,
        "hash",
        1,
        "2026-06-20T00:00:00.000Z",
        "2026-06-20T00:00:00.000Z"
      );
      db.prepare("insert into user_managed_staff (user_id, staff_id, created_at, created_by) values (?, ?, ?, ?)")
        .run("user-scheduler", "staff-nurse-001", "2026-06-20T00:00:00.000Z", null);

      const replacement = createReplacementData();
      replacement.staff = [seed.staff.find((staff) => staff.id === "staff-nurse-001")!, ...replacement.staff];

      replaceAppDataInSqlite(db, replacement);

      expect(
        db.prepare("select staff_id from user_managed_staff where user_id = ? order by staff_id asc").all("user-scheduler")
      ).toEqual([{ staff_id: "staff-nurse-001" }]);
      expect(db.prepare("pragma foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("removes user managed staff relations when replacement data removes referenced staff", async () => {
    const db = new Database(await createTempDbPath());
    try {
      initializeSqliteSchema(db);
      db.pragma("foreign_keys = ON");

      const seed = createSeedData();
      replaceAppDataInSqlite(db, seed);
      db.prepare(
        `
          insert into users (id, username, display_name, role, staff_id, password_hash, enabled, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        "user-scheduler",
        "scheduler",
        "Scheduler",
        "scheduler",
        null,
        "hash",
        1,
        "2026-06-20T00:00:00.000Z",
        "2026-06-20T00:00:00.000Z"
      );
      db.prepare("insert into user_managed_staff (user_id, staff_id, created_at, created_by) values (?, ?, ?, ?)")
        .run("user-scheduler", "staff-nurse-001", "2026-06-20T00:00:00.000Z", null);

      replaceAppDataInSqlite(db, createReplacementData());

      expect(db.prepare("select staff_id from user_managed_staff where user_id = ?").all("user-scheduler")).toEqual([]);
      expect(db.prepare("pragma foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("rolls back the previous database state when constraints fail", async () => {
    const db = new Database(await createTempDbPath());
    try {
      initializeSqliteSchema(db);

      const current = createSeedData();
      current.scheduleEntries = [
        {
          id: "2026-06-15__staff-nurse-001",
          date: "2026-06-15",
          staffId: "staff-nurse-001",
          shiftIds: ["shift-a1"],
          note: "current"
        }
      ];
      current.monthlySettlements = [createMonthlySettlement()];
      replaceAppDataInSqlite(db, current);

      const foreignKeyFailure: AppData = {
        ...current,
        scheduleEntries: [
          {
            id: "2026-06-16__missing-staff",
            date: "2026-06-16",
            staffId: "missing-staff",
            shiftIds: ["shift-a1"],
            note: "invalid staff"
          }
        ]
      };
      expect(() => replaceAppDataInSqlite(db, foreignKeyFailure)).toThrow(/constraint/i);
      expect(readAppDataFromSqlite(db)).toEqual(current);

      const uniqueFailure: AppData = {
        ...current,
        holidays: [
          ...current.holidays,
          {
            id: "holiday-duplicate-date",
            date: current.holidays[0].date,
            name: "Duplicate holiday date",
            affectsRequiredAttendance: true
          }
        ]
      };
      expect(() => replaceAppDataInSqlite(db, uniqueFailure)).toThrow(/constraint/i);
      expect(readAppDataFromSqlite(db)).toEqual(current);
    } finally {
      db.close();
    }
  });

  it("reads rows in stable domain order", async () => {
    const db = new Database(await createTempDbPath());
    try {
      initializeSqliteSchema(db);

      const seed = createSeedData();
      const [headNurse, nurse, clerk] = seed.staff;
      const [shiftA1, shiftP1, , , shiftRest] = seed.shifts;
      const settlement = createMonthlySettlement();
      const unordered: AppData = {
        ...seed,
        staff: [
          { ...headNurse, sortOrder: 2 },
          { ...clerk, sortOrder: 2 },
          { ...nurse, sortOrder: 1 }
        ],
        shifts: [
          { ...shiftRest, sortOrder: 3 },
          { ...shiftP1, sortOrder: 1 },
          { ...shiftA1, sortOrder: 1 }
        ],
        holidays: [
          {
            id: "holiday-2026-06-20",
            date: "2026-06-20",
            name: "Later holiday",
            affectsRequiredAttendance: true
          },
          {
            id: "holiday-2026-06-18",
            date: "2026-06-18",
            name: "Earlier holiday",
            affectsRequiredAttendance: false
          },
          {
            id: "holiday-2026-06-19",
            date: "2026-06-19",
            name: "Middle holiday",
            affectsRequiredAttendance: true
          }
        ],
        scheduleEntries: [
          {
            id: "2026-06-17__staff-head-001",
            date: "2026-06-17",
            staffId: "staff-head-001",
            shiftIds: ["shift-a1"],
            note: "third"
          },
          {
            id: "2026-06-16__staff-nurse-001",
            date: "2026-06-16",
            staffId: "staff-nurse-001",
            shiftIds: ["shift-p1"],
            note: "second"
          },
          {
            id: "2026-06-16__staff-clerk-001",
            date: "2026-06-16",
            staffId: "staff-clerk-001",
            shiftIds: ["shift-a1"],
            note: "first"
          }
        ],
        monthlySettlements: [
          {
            ...settlement,
            rows: settlement.rows
          }
        ]
      };

      replaceAppDataInSqlite(db, unordered);
      const loaded = readAppDataFromSqlite(db);

      expect(loaded.staff.map((staff) => staff.id)).toEqual([
        "staff-nurse-001",
        "staff-clerk-001",
        "staff-head-001"
      ]);
      expect(loaded.shifts.map((shift) => shift.id)).toEqual(["shift-a1", "shift-p1", "shift-rest"]);
      expect(loaded.holidays.map((holiday) => holiday.id)).toEqual([
        "holiday-2026-06-18",
        "holiday-2026-06-19",
        "holiday-2026-06-20"
      ]);
      expect(loaded.scheduleEntries.map((entry) => entry.id)).toEqual([
        "2026-06-16__staff-clerk-001",
        "2026-06-16__staff-nurse-001",
        "2026-06-17__staff-head-001"
      ]);
      expect(loaded.monthlySettlements[0].rows.map((row) => row.staffId)).toEqual([
        "staff-nurse-001",
        "staff-head-001"
      ]);
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

  it("rejects a missing SQLite database file", async () => {
    const path = await createTempDbPath();
    await rm(path, { force: true });
    const storage = createSqliteStorage(path);

    await storage.load().then(
      () => {
        throw new Error("expected missing SQLite database load to reject");
      },
      (error: unknown) => {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe(MISSING_SQLITE_ERROR_MESSAGE);
      }
    );
    await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects an empty SQLite file without initializing schema implicitly", async () => {
    const path = await createTempDbPath();
    await writeFile(path, "");
    const storage = createSqliteStorage(path);

    await expect(storage.load()).rejects.toThrow(UNINITIALIZED_SQLITE_ERROR_MESSAGE);

    const db = new Database(path, { fileMustExist: true });
    try {
      expect(listMissingCoreTables(db)).toEqual(
        expect.arrayContaining([
          "app_settings",
          "schema_migrations",
          "schedule_entries",
          "schedule_entry_shifts",
          "shifts",
          "staff"
        ])
      );
    } finally {
      db.close();
    }
  });

  it("rejects a missing SQLite path without creating parent directories implicitly", async () => {
    const dir = await mkdtemp(join(tmpdir(), "schedule-sqlite-missing-parent-"));
    tempDirs.push(dir);
    const sqliteDir = join(dir, "nested", "sqlite");
    const path = join(sqliteDir, "schedule.db");
    const storage = createSqliteStorage(path);

    await expect(storage.load()).rejects.toThrow(MISSING_SQLITE_ERROR_MESSAGE);
    await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(sqliteDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("opens SQLite with fileMustExist to avoid stale existence checks", async () => {
    const path = await createTempDbPath();
    await rm(path, { force: true });
    let receivedOptions: unknown;
    vi.resetModules();
    vi.doMock("better-sqlite3", () => ({
      default: class FakeDatabase {
        constructor(_path: string, options?: unknown) {
          receivedOptions = options;
          const error = new Error("unable to open database file") as Error & { code?: string };
          error.code = "SQLITE_CANTOPEN";
          throw error;
        }
      }
    }));

    try {
      const { createSqliteStorage: createStorageWithMockDatabase } = await import("./sqlite/storage");
      const storage = createStorageWithMockDatabase(path);

      await storage.load().then(
        () => {
          throw new Error("expected mocked missing SQLite database load to reject");
        },
        (error: unknown) => {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBe(MISSING_SQLITE_ERROR_MESSAGE);
        }
      );
      expect(receivedOptions).toEqual({ fileMustExist: true });
      await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      vi.doUnmock("better-sqlite3");
      vi.resetModules();
    }
  });

  it("closes the database when SQLite runtime validation fails", async () => {
    const path = await createTempDbPath();
    await writeFile(path, "", "utf8");
    let closed = false;
    vi.resetModules();
    vi.doMock("better-sqlite3", () => ({
      default: class FakeDatabase {
        pragma() {
          throw new Error("pragma failed");
        }

        close() {
          closed = true;
        }
      }
    }));

    try {
      const { createSqliteStorage: createStorageWithMockDatabase } = await import("./sqlite/storage");
      const storage = createStorageWithMockDatabase(path);

      await expect(storage.load()).rejects.toThrow("pragma failed");
      expect(closed).toBe(true);
    } finally {
      vi.doUnmock("better-sqlite3");
      vi.resetModules();
    }
  });

  it("uses the SQLite adapter for configured storage by default", async () => {
    const path = await createTempDbPath();
    vi.resetModules();
    const load = vi.fn().mockResolvedValue(createSeedData());
    vi.doMock("./sqlite/storage", () => ({
      createSqliteStorage: vi.fn(() => ({
        load,
        save: vi.fn(),
        update: vi.fn()
      }))
    }));

    try {
      const { createConfiguredStorage } = await import("./storage");
      const storage = createConfiguredStorage({
        host: "127.0.0.1",
        port: 0,
        storageDriver: "sqlite",
        sqlitePath: path
      });

      const data = await storage.load();

      expect(data.staff).toHaveLength(3);
      expect(load).toHaveBeenCalledTimes(1);
    } finally {
      vi.doUnmock("./sqlite/storage");
      vi.resetModules();
    }
  });

  it("loads explicit SQLite data without creating seed data implicitly", async () => {
    const path = await createTempDbPath();
    const db = new Database(path);
    try {
      initializeSqliteSchema(db);
      replaceAppDataInSqlite(db, createSeedData());
    } finally {
      db.close();
    }

    const storage = createSqliteStorage(path);

    const data = await storage.load();

    expect(data.staff).toHaveLength(3);
    expect(data.shifts).toHaveLength(5);
  });

  it("serializes concurrent SQLite updates", async () => {
    const path = await createTempDbPath();
    const db = new Database(path);
    try {
      initializeSqliteSchema(db);
      replaceAppDataInSqlite(db, createSeedData());
    } finally {
      db.close();
    }
    const storage = createSqliteStorage(path);

    await Promise.all([
      storage.update((data) => ({
        ...data,
        scheduleEntries: [
          ...data.scheduleEntries,
          { id: "2026-06-15__staff-nurse-001", date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" }
        ]
      })),
      storage.update((data) => ({
        ...data,
        scheduleEntries: [
          ...data.scheduleEntries,
          { id: "2026-06-16__staff-clerk-001", date: "2026-06-16", staffId: "staff-clerk-001", shiftIds: ["shift-office"], note: "" }
        ]
      }))
    ]);

    const loaded = await storage.load();
    expect(loaded.scheduleEntries.map((entry) => entry.id).sort()).toEqual([
      "2026-06-15__staff-nurse-001",
      "2026-06-16__staff-clerk-001"
    ]);
  });
});
