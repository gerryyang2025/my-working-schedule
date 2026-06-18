import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  AppData,
  Holiday,
  MonthlySettlement,
  MonthlySettlementRow,
  ScheduleEntry,
  Settings,
  Shift,
  StaffMember
} from "./types";

export function normalizeAppData(candidate: unknown): { data: unknown; changed: boolean } {
  return normalizeAppDataCandidate(candidate);
}

export function assertAppData(value: unknown): asserts value is AppData {
  assertAppDataCandidate(value);
}

export async function readJsonAppData(path: string): Promise<{ data: AppData; changed: boolean }> {
  const content = await readFile(path, "utf8");
  const { data, changed } = normalizeAppData(JSON.parse(content));
  assertAppData(data);
  return { data, changed };
}

export async function writeJsonAppData(path: string, data: AppData): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(tempPath, path);
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

  return isNumber(value.defaultRequiredShiftsPerWeek) && isNumber(value.version);
}

function isMonthlySettlementRow(value: unknown): value is MonthlySettlementRow {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.staffId) &&
    isString(value.staffName) &&
    isString(value.staffJobId) &&
    (value.staffType === "nurse" || value.staffType === "clerk" || value.staffType === "head_nurse") &&
    isNumber(value.attendanceShifts) &&
    isNumber(value.overtimeShifts) &&
    (isNumber(value.coefficientTotal) || value.coefficientTotal === null) &&
    isString(value.coefficientExcludedReason) &&
    isNumber(value.bonusAmount) &&
    isString(value.bonusExcludedReason)
  );
}

function normalizeMonthlySettlementRow(row: unknown): MonthlySettlementRow | null {
  if (!isRecord(row)) {
    return null;
  }

  const candidate = {
    ...row,
    staffJobId: "staffJobId" in row ? row.staffJobId : "",
    overtimeShifts: "overtimeShifts" in row ? row.overtimeShifts : 0
  };

  return isMonthlySettlementRow(candidate) ? candidate : null;
}

function normalizeMonthlySettlement(settlement: unknown): MonthlySettlement | null {
  if (!isRecord(settlement) || !Array.isArray(settlement.rows)) {
    return null;
  }

  const rows = settlement.rows.map(normalizeMonthlySettlementRow);
  if (rows.some((row) => row === null)) {
    return null;
  }

  const candidate = {
    ...settlement,
    rows
  };

  return isMonthlySettlement(candidate) ? candidate : null;
}

function isMonthlySettlement(value: unknown): value is MonthlySettlement {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    isString(value.month) &&
    isString(value.monthStart) &&
    isString(value.monthEnd) &&
    isNumber(value.totalDays) &&
    isNumber(value.bonusPool) &&
    isNumber(value.coefficientTotal) &&
    isString(value.settledAt) &&
    Array.isArray(value.rows) &&
    value.rows.every(isMonthlySettlementRow)
  );
}

function normalizeAppDataCandidate(candidate: unknown): { data: unknown; changed: boolean } {
  if (!isRecord(candidate)) {
    return { data: candidate, changed: false };
  }

  if (!("monthlySettlements" in candidate)) {
    return { data: { ...candidate, monthlySettlements: [] }, changed: true };
  }

  if (!Array.isArray(candidate.monthlySettlements)) {
    return { data: candidate, changed: false };
  }

  const monthlySettlements = candidate.monthlySettlements.map(normalizeMonthlySettlement);
  if (monthlySettlements.some((settlement) => settlement === null)) {
    return { data: candidate, changed: false };
  }

  return {
    data: { ...candidate, monthlySettlements },
    changed: JSON.stringify(monthlySettlements) !== JSON.stringify(candidate.monthlySettlements)
  };
}

function assertAppDataCandidate(value: unknown): asserts value is AppData {
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
    Array.isArray(value.monthlySettlements) &&
    value.monthlySettlements.every(isMonthlySettlement) &&
    isSettings(value.settings);

  if (!isValid) {
    throw new Error("数据文件结构不正确");
  }
}
