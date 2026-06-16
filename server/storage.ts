import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createSeedData } from "./seed";
import type { AppData, Holiday, ScheduleEntry, Settings, Shift, StaffMember } from "./types";

export const DEFAULT_STORAGE_PATH = resolve(process.cwd(), "data/app-data.local.json");

export interface StorageAdapter {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
  update(mutator: (current: AppData) => AppData | Promise<AppData>): Promise<AppData>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isStaffMember(value: unknown): value is StaffMember {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    isString(value.jobId) &&
    isString(value.name) &&
    (value.type === "nurse" || value.type === "clerk" || value.type === "head_nurse") &&
    isBoolean(value.isAdmin) &&
    isBoolean(value.enabled) &&
    isNumber(value.sortOrder)
  );
}

function isShift(value: unknown): value is Shift {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    isString(value.name) &&
    isString(value.shortName) &&
    isString(value.color) &&
    isBoolean(value.countsAttendance) &&
    isNumber(value.coefficient) &&
    isBoolean(value.enabled) &&
    isNumber(value.sortOrder)
  );
}

function isHoliday(value: unknown): value is Holiday {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    isString(value.date) &&
    isString(value.name) &&
    isBoolean(value.affectsRequiredAttendance)
  );
}

function isScheduleEntry(value: unknown): value is ScheduleEntry {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    isString(value.date) &&
    isString(value.staffId) &&
    isStringArray(value.shiftIds) &&
    isString(value.note)
  );
}

function isSettings(value: unknown): value is Settings {
  if (!isRecord(value)) {
    return false;
  }

  return isString(value.adminPassword) && isNumber(value.defaultRequiredShiftsPerWeek) && isNumber(value.version);
}

function assertAppData(value: unknown): asserts value is AppData {
  if (!isRecord(value)) {
    throw new Error("数据文件结构不正确");
  }

  const isValid =
    Array.isArray(value.staff) &&
    value.staff.every(isStaffMember) &&
    Array.isArray(value.shifts) &&
    value.shifts.every(isShift) &&
    Array.isArray(value.holidays) &&
    value.holidays.every(isHoliday) &&
    Array.isArray(value.scheduleEntries) &&
    value.scheduleEntries.every(isScheduleEntry) &&
    isSettings(value.settings);

  if (!isValid) {
    throw new Error("数据文件结构不正确");
  }
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
      const data: unknown = JSON.parse(content);
      assertAppData(data);
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
