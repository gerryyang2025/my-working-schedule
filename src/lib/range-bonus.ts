import type { AppData, MonthlyStaffSummary, MonthlySummary } from "@/types/domain";
import { calculateRangeSummary } from "./calculation";
import { listDateKeys } from "./date";

export interface RangeSourceMonth {
  month: string;
  source: "settlement" | "live";
}

export interface RangeBonusSummary extends MonthlySummary {
  isValidRange: boolean;
  rangeStart: string;
  rangeEnd: string;
  sourceMonths: RangeSourceMonth[];
}

function invalidRangeBonusSummary(): RangeBonusSummary {
  return {
    isValidRange: false,
    rangeStart: "",
    rangeEnd: "",
    monthStart: "",
    monthEnd: "",
    totalDays: 0,
    holidayNames: [],
    sourceMonths: [],
    rows: []
  };
}

function parseMonthKey(month: string): { year: number; monthNumber: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);

  if (monthNumber < 1 || monthNumber > 12) {
    return null;
  }

  return { year, monthNumber };
}

export function monthRangeToDates(startMonth: string, endMonth: string): { rangeStart: string; rangeEnd: string } | null {
  const start = parseMonthKey(startMonth);
  const end = parseMonthKey(endMonth);

  if (!start || !end) {
    return null;
  }

  if (startMonth > endMonth) {
    return null;
  }

  const lastDay = new Date(end.year, end.monthNumber, 0).getDate();

  return {
    rangeStart: `${startMonth}-01`,
    rangeEnd: `${endMonth}-${String(lastDay).padStart(2, "0")}`
  };
}

function addRows(target: Map<string, MonthlyStaffSummary>, rows: MonthlyStaffSummary[]): void {
  for (const row of rows) {
    const existing = target.get(row.staffId);
    if (!existing) {
      target.set(row.staffId, { ...row });
      continue;
    }

    existing.attendanceShifts += row.attendanceShifts;
    existing.requiredShifts += row.requiredShifts;
    existing.attendanceBalance += row.attendanceBalance;
    existing.overtimeShifts += row.overtimeShifts;
    existing.coefficientTotal =
      existing.coefficientTotal === null || row.coefficientTotal === null
        ? null
        : Math.round((existing.coefficientTotal + row.coefficientTotal) * 100) / 100;
    existing.coefficientExcludedReason =
      existing.coefficientTotal === null ? existing.coefficientExcludedReason || row.coefficientExcludedReason : "";
  }
}

function settlementRowsToSummaryRows(rows: AppData["monthlySettlements"][number]["rows"]): MonthlyStaffSummary[] {
  return rows.map((row) => ({
    staffId: row.staffId,
    staffName: row.staffName,
    staffJobId: row.staffJobId,
    staffType: row.staffType,
    attendanceShifts: row.attendanceShifts,
    requiredShifts: row.requiredShifts ?? 0,
    attendanceBalance: row.attendanceBalance ?? 0,
    overtimeShifts: row.overtimeShifts,
    coefficientTotal: row.coefficientTotal,
    coefficientExcludedReason: row.coefficientExcludedReason
  }));
}

export function calculateRangeBonusSummary(data: AppData, startMonth: string, endMonth: string): RangeBonusSummary {
  const range = monthRangeToDates(startMonth, endMonth);

  if (!range) {
    return invalidRangeBonusSummary();
  }

  const rowsByStaffId = new Map<string, MonthlyStaffSummary>();
  const sourceMonths: RangeSourceMonth[] = [];
  const start = parseMonthKey(startMonth);
  const end = parseMonthKey(endMonth);

  if (!start || !end) {
    return invalidRangeBonusSummary();
  }

  for (
    let absoluteMonth = start.year * 12 + start.monthNumber;
    absoluteMonth <= end.year * 12 + end.monthNumber;
    absoluteMonth += 1
  ) {
    const year = Math.floor((absoluteMonth - 1) / 12);
    const monthNumber = ((absoluteMonth - 1) % 12) + 1;
    const month = `${year}-${String(monthNumber).padStart(2, "0")}`;
    const settlement = data.monthlySettlements.find((item) => item.month === month);

    if (settlement) {
      sourceMonths.push({ month, source: "settlement" });
      addRows(rowsByStaffId, settlementRowsToSummaryRows(settlement.rows));
      continue;
    }

    const dates = monthRangeToDates(month, month);
    if (!dates) {
      continue;
    }
    sourceMonths.push({ month, source: "live" });
    addRows(rowsByStaffId, calculateRangeSummary(data, dates.rangeStart, dates.rangeEnd).rows);
  }

  return {
    isValidRange: true,
    rangeStart: range.rangeStart,
    rangeEnd: range.rangeEnd,
    monthStart: range.rangeStart,
    monthEnd: range.rangeEnd,
    totalDays: listDateKeys(range.rangeStart, range.rangeEnd).length,
    holidayNames: data.holidays
      .filter((holiday) => holiday.date >= range.rangeStart && holiday.date <= range.rangeEnd)
      .sort((left, right) => left.date.localeCompare(right.date))
      .map((holiday) => holiday.name),
    sourceMonths,
    rows: [...rowsByStaffId.values()].sort((left, right) => {
      const leftStaff = data.staff.find((staff) => staff.id === left.staffId);
      const rightStaff = data.staff.find((staff) => staff.id === right.staffId);
      return (leftStaff?.sortOrder ?? 0) - (rightStaff?.sortOrder ?? 0);
    })
  };
}
