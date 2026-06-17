import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_STORAGE_PATH, createJsonStorage } from "./storage";

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
  it("uses an ignored local file for the default runtime data path", () => {
    expect(DEFAULT_STORAGE_PATH.endsWith("data/app-data.local.json")).toBe(true);
  });

  it("creates seed data when the file is missing", async () => {
    const path = await createTempDataPath();
    const storage = createJsonStorage(path);

    const data = await storage.load();
    const persisted = JSON.parse(await readFile(path, "utf8"));

    expect(data.staff).toHaveLength(3);
    expect(persisted.staff).toHaveLength(3);
  });

  it("repairs older local data that does not have monthly settlements", async () => {
    const path = await createTempDataPath();
    const legacyData = {
      staff: [],
      shifts: [],
      holidays: [],
      scheduleEntries: [],
      settings: {
        defaultRequiredShiftsPerWeek: 5,
        version: 1
      }
    };
    await writeFile(path, `${JSON.stringify(legacyData, null, 2)}\n`, "utf8");

    const storage = createJsonStorage(path);
    const data = await storage.load();
    const persisted = JSON.parse(await readFile(path, "utf8"));

    expect(data.monthlySettlements).toEqual([]);
    expect(persisted.monthlySettlements).toEqual([]);
  });

  it("does not rewrite current data that already has monthly settlements", async () => {
    const path = await createTempDataPath();
    const currentData = {
      staff: [],
      shifts: [],
      holidays: [],
      scheduleEntries: [],
      monthlySettlements: [],
      settings: {
        defaultRequiredShiftsPerWeek: 5,
        version: 1
      }
    };
    const original = `${JSON.stringify(currentData)}\n`;
    await writeFile(path, original, "utf8");

    const storage = createJsonStorage(path);
    const data = await storage.load();

    expect(data.monthlySettlements).toEqual([]);
    await expect(readFile(path, "utf8")).resolves.toBe(original);
  });

  it("throws on invalid present monthly settlements without overwriting the existing file", async () => {
    const path = await createTempDataPath();
    const invalidData = `${JSON.stringify(
      {
        staff: [],
        shifts: [],
        holidays: [],
        scheduleEntries: [],
        monthlySettlements: {},
        settings: {
          defaultRequiredShiftsPerWeek: 5,
          version: 1
        }
      },
      null,
      2
    )}\n`;
    await writeFile(path, invalidData, "utf8");

    await expect(createJsonStorage(path).load()).rejects.toThrow("数据文件结构不正确");
    await expect(readFile(path, "utf8")).resolves.toBe(invalidData);
  });

  it.each([
    { name: "string element", monthlySettlements: ["bad"] },
    { name: "malformed object", monthlySettlements: [{ id: "settlement-1" }] }
  ])("throws on malformed monthly settlement array contents: $name", async ({ monthlySettlements }) => {
    const path = await createTempDataPath();
    const invalidData = `${JSON.stringify(
      {
        staff: [],
        shifts: [],
        holidays: [],
        scheduleEntries: [],
        monthlySettlements,
        settings: {
          defaultRequiredShiftsPerWeek: 5,
          version: 1
        }
      },
      null,
      2
    )}\n`;
    await writeFile(path, invalidData, "utf8");

    await expect(createJsonStorage(path).load()).rejects.toThrow("数据文件结构不正确");
    await expect(readFile(path, "utf8")).resolves.toBe(invalidData);
  });

  it("defaults missing monthly settlement overtime shifts for legacy rows", async () => {
    const path = await createTempDataPath();
    await writeFile(
      path,
      JSON.stringify({
        staff: [],
        shifts: [],
        holidays: [],
        scheduleEntries: [],
        settings: { defaultRequiredShiftsPerWeek: 5, version: 1 },
        monthlySettlements: [
          {
            id: "settlement-2026-06",
            month: "2026-06",
            monthStart: "2026-06-01",
            monthEnd: "2026-06-30",
            totalDays: 30,
            bonusPool: 1000,
            coefficientTotal: 1.5,
            settledAt: "2026-06-30T10:00:00.000Z",
            rows: [
              {
                staffId: "staff-nurse-001",
                staffName: "李护士",
                staffType: "nurse",
                attendanceShifts: 6,
                coefficientTotal: 1.5,
                coefficientExcludedReason: "",
                bonusAmount: 1000,
                bonusExcludedReason: ""
              }
            ]
          }
        ]
      })
    );

    const storage = createJsonStorage(path);
    const data = await storage.load();

    expect(data.monthlySettlements[0].rows[0].overtimeShifts).toBe(0);
  });

  it("throws on malformed JSON without overwriting the existing file", async () => {
    const path = await createTempDataPath();
    const malformed = "{ not valid json";
    await writeFile(path, malformed, "utf8");

    await expect(createJsonStorage(path).load()).rejects.toThrow(SyntaxError);
    await expect(readFile(path, "utf8")).resolves.toBe(malformed);
  });

  it("throws on invalid app data structure without overwriting the existing file", async () => {
    const path = await createTempDataPath();
    const invalidData = "{}\n";
    await writeFile(path, invalidData, "utf8");

    await expect(createJsonStorage(path).load()).rejects.toThrow("数据文件结构不正确");
    await expect(readFile(path, "utf8")).resolves.toBe(invalidData);
  });
});
