import type {
  AppData,
  MonthlyStaffSummary,
  MonthlySummary,
  ScheduleEntry,
  Shift,
  StaffMember,
  WeeklyStaffSummary,
  WeeklySummary
} from "@/types/domain";
import type { CalendarDay } from "./date";
import { addDays, getWeekRange, listDateKeys, parseDateKey } from "./date";

type WeeklySummaryInput = Pick<AppData, "staff" | "shifts" | "holidays" | "scheduleEntries"> & {
  settings: Pick<AppData["settings"], "defaultRequiredShiftsPerWeek">;
};
type MonthlySummaryInput = WeeklySummaryInput;

export interface RangeSummary extends MonthlySummary {
  rangeStart: string;
  rangeEnd: string;
}

interface StaffShiftTotals {
  attendanceShifts: number;
  coefficientTotal: number;
}

function isWithinRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function roundCoefficient(value: number): number {
  return Math.round(value * 100) / 100;
}

function summarizeShiftTotals(entries: ScheduleEntry[], shiftMap: Map<string, Shift>): StaffShiftTotals {
  let attendanceShifts = 0;
  let coefficientTotal = 0;

  for (const entry of entries) {
    for (const shiftId of entry.shiftIds) {
      const shift = shiftMap.get(shiftId);
      if (!shift || !shift.enabled) {
        continue;
      }
      if (shift.countsAttendance) {
        attendanceShifts += 1;
      }
      coefficientTotal += shift.coefficient;
    }
  }

  return {
    attendanceShifts,
    coefficientTotal: roundCoefficient(coefficientTotal)
  };
}

function shouldExcludeCoefficient(staff: StaffMember): boolean {
  return staff.type === "head_nurse";
}

function summarizeStaff(
  staff: StaffMember,
  entries: ScheduleEntry[],
  shiftMap: Map<string, Shift>,
  requiredShifts: number
): WeeklyStaffSummary {
  const totals = summarizeShiftTotals(entries, shiftMap);
  const attendanceBalance = totals.attendanceShifts - requiredShifts;
  const overtimeShifts = Math.max(0, attendanceBalance);
  const isCoefficientExcluded = shouldExcludeCoefficient(staff);

  return {
    staffId: staff.id,
    staffName: staff.name,
    staffJobId: staff.jobId,
    staffType: staff.type,
    attendanceShifts: totals.attendanceShifts,
    requiredShifts,
    attendanceBalance,
    overtimeShifts,
    coefficientTotal: isCoefficientExcluded ? null : totals.coefficientTotal,
    coefficientExcludedReason: isCoefficientExcluded ? "护士长绩效单独核算" : ""
  };
}

export function calculateWeeklySummary(data: WeeklySummaryInput, selectedDate: string): WeeklySummary {
  const { start, end } = getWeekRange(selectedDate);
  const affectedHolidays = data.holidays.filter(
    (holiday) => holiday.affectsRequiredAttendance && isWithinRange(holiday.date, start, end)
  );
  const holidayDeduction = affectedHolidays.length;
  const requiredShifts = Math.max(0, data.settings.defaultRequiredShiftsPerWeek - holidayDeduction);
  const shiftMap = new Map(data.shifts.map((shift) => [shift.id, shift]));
  const weekEntries = data.scheduleEntries.filter((entry) => isWithinRange(entry.date, start, end));
  const staffWithWeekEntries = new Set(weekEntries.map((entry) => entry.staffId));
  const visibleStaff = [...data.staff]
    .filter((staff) => staff.enabled || staffWithWeekEntries.has(staff.id))
    .sort((left, right) => left.sortOrder - right.sortOrder);

  return {
    weekStart: start,
    weekEnd: end,
    requiredShifts,
    holidayDeduction,
    holidayNames: affectedHolidays.map((holiday) => holiday.name),
    rows: visibleStaff.map((staff) =>
      summarizeStaff(
        staff,
        weekEntries.filter((entry) => entry.staffId === staff.id),
        shiftMap,
        requiredShifts
      )
    )
  };
}

function summarizeMonthlyStaff(
  staff: StaffMember,
  entries: ScheduleEntry[],
  shiftMap: Map<string, Shift>,
  requiredShifts: number
): MonthlyStaffSummary {
  const totals = summarizeShiftTotals(entries, shiftMap);
  const attendanceBalance = totals.attendanceShifts - requiredShifts;
  const isCoefficientExcluded = shouldExcludeCoefficient(staff);

  return {
    staffId: staff.id,
    staffName: staff.name,
    staffJobId: staff.jobId,
    staffType: staff.type,
    attendanceShifts: totals.attendanceShifts,
    requiredShifts,
    attendanceBalance,
    overtimeShifts: 0,
    coefficientTotal: isCoefficientExcluded ? null : totals.coefficientTotal,
    coefficientExcludedReason: isCoefficientExcluded ? "护士长绩效单独核算" : ""
  };
}

function splitRangeIntoWeekRanges(rangeStart: string, rangeEnd: string): Array<{ start: string; end: string }> {
  const ranges: Array<{ start: string; end: string }> = [];
  let cursor = rangeStart;

  while (cursor <= rangeEnd) {
    const week = getWeekRange(cursor);
    const start = cursor > week.start ? cursor : week.start;
    const end = rangeEnd < week.end ? rangeEnd : week.end;
    ranges.push({ start, end });
    cursor = addDays(end, 1);
  }

  return ranges;
}

function requiredShiftsForPartialWeek(data: WeeklySummaryInput, start: string, end: string): number {
  const dates = listDateKeys(start, end);
  const weekdaysInsideRange = dates.filter((date) => {
    const weekday = parseDateKey(date).getDay();
    return weekday >= 1 && weekday <= 5;
  }).length;
  const affectedHolidayCount = data.holidays.filter(
    (holiday) => holiday.affectsRequiredAttendance && isWithinRange(holiday.date, start, end)
  ).length;

  return Math.max(0, Math.min(data.settings.defaultRequiredShiftsPerWeek, weekdaysInsideRange) - affectedHolidayCount);
}

function calculateOvertimeByStaff(data: WeeklySummaryInput, rangeStart: string, rangeEnd: string): Map<string, number> {
  const shiftMap = new Map(data.shifts.map((shift) => [shift.id, shift]));
  const overtimeByStaff = new Map<string, number>();

  for (const weekRange of splitRangeIntoWeekRanges(rangeStart, rangeEnd)) {
    const requiredShifts = requiredShiftsForPartialWeek(data, weekRange.start, weekRange.end);
    const weekEntries = data.scheduleEntries.filter((entry) => isWithinRange(entry.date, weekRange.start, weekRange.end));

    for (const staff of data.staff) {
      const staffEntries = weekEntries.filter((entry) => entry.staffId === staff.id);
      const totals = summarizeShiftTotals(staffEntries, shiftMap);
      const overtime = Math.max(0, totals.attendanceShifts - requiredShifts);
      overtimeByStaff.set(staff.id, (overtimeByStaff.get(staff.id) ?? 0) + overtime);
    }
  }

  return overtimeByStaff;
}

function calculateRequiredShiftsByStaff(data: WeeklySummaryInput, rangeStart: string, rangeEnd: string): Map<string, number> {
  const requiredByStaff = new Map<string, number>();

  for (const weekRange of splitRangeIntoWeekRanges(rangeStart, rangeEnd)) {
    const requiredShifts = requiredShiftsForPartialWeek(data, weekRange.start, weekRange.end);

    for (const staff of data.staff) {
      requiredByStaff.set(staff.id, (requiredByStaff.get(staff.id) ?? 0) + requiredShifts);
    }
  }

  return requiredByStaff;
}

export function calculateRangeSummary(
  data: WeeklySummaryInput & MonthlySummaryInput,
  rangeStart: string,
  rangeEnd: string
): RangeSummary {
  const printedDayKeys = new Set(listDateKeys(rangeStart, rangeEnd));
  const rangeEntries = data.scheduleEntries.filter((entry) => printedDayKeys.has(entry.date));
  const staffWithRangeEntries = new Set(rangeEntries.map((entry) => entry.staffId));
  const visibleStaff = [...data.staff]
    .filter((staff) => staff.enabled || staffWithRangeEntries.has(staff.id))
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const shiftMap = new Map(data.shifts.map((shift) => [shift.id, shift]));
  const holidayNames = data.holidays
    .filter((holiday) => printedDayKeys.has(holiday.date))
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((holiday) => holiday.name);
  const overtimeByStaff = calculateOvertimeByStaff(data, rangeStart, rangeEnd);
  const requiredByStaff = calculateRequiredShiftsByStaff(data, rangeStart, rangeEnd);

  return {
    rangeStart,
    rangeEnd,
    monthStart: rangeStart,
    monthEnd: rangeEnd,
    totalDays: printedDayKeys.size,
    holidayNames,
    rows: visibleStaff.map((staff) => ({
      ...summarizeMonthlyStaff(
        staff,
        rangeEntries.filter((entry) => entry.staffId === staff.id),
        shiftMap,
        requiredByStaff.get(staff.id) ?? 0
      ),
      overtimeShifts: overtimeByStaff.get(staff.id) ?? 0
    }))
  };
}

export function calculateMonthlySummary(data: MonthlySummaryInput & WeeklySummaryInput, days: CalendarDay[]): MonthlySummary {
  if (days.length === 0) {
    return {
      monthStart: "",
      monthEnd: "",
      totalDays: 0,
      holidayNames: [],
      rows: []
    };
  }

  return calculateRangeSummary(data, days[0].key, days[days.length - 1].key);
}
