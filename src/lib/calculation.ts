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
import { getWeekRange } from "./date";

type WeeklySummaryInput = Pick<AppData, "staff" | "shifts" | "holidays" | "scheduleEntries"> & {
  settings: Pick<AppData["settings"], "defaultRequiredShiftsPerWeek">;
};
type MonthlySummaryInput = Pick<AppData, "staff" | "shifts" | "holidays" | "scheduleEntries">;

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
  const overtimeShifts = Math.max(0, totals.attendanceShifts - requiredShifts);
  const isCoefficientExcluded = shouldExcludeCoefficient(staff);

  return {
    staffId: staff.id,
    staffName: staff.name,
    staffType: staff.type,
    attendanceShifts: totals.attendanceShifts,
    requiredShifts,
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
  shiftMap: Map<string, Shift>
): MonthlyStaffSummary {
  const totals = summarizeShiftTotals(entries, shiftMap);
  const isCoefficientExcluded = shouldExcludeCoefficient(staff);

  return {
    staffId: staff.id,
    staffName: staff.name,
    staffType: staff.type,
    attendanceShifts: totals.attendanceShifts,
    overtimeShifts: 0,
    coefficientTotal: isCoefficientExcluded ? null : totals.coefficientTotal,
    coefficientExcludedReason: isCoefficientExcluded ? "护士长绩效单独核算" : ""
  };
}

export function calculateMonthlySummary(data: MonthlySummaryInput, days: CalendarDay[]): MonthlySummary {
  const printedDayKeys = new Set(days.map((day) => day.key));
  const monthEntries = data.scheduleEntries.filter((entry) => printedDayKeys.has(entry.date));
  const staffWithMonthEntries = new Set(monthEntries.map((entry) => entry.staffId));
  const visibleStaff = [...data.staff]
    .filter((staff) => staff.enabled || staffWithMonthEntries.has(staff.id))
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const shiftMap = new Map(data.shifts.map((shift) => [shift.id, shift]));
  const holidayNames = data.holidays
    .filter((holiday) => printedDayKeys.has(holiday.date))
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((holiday) => holiday.name);

  return {
    monthStart: days[0]?.key ?? "",
    monthEnd: days[days.length - 1]?.key ?? "",
    totalDays: days.length,
    holidayNames,
    rows: visibleStaff.map((staff) =>
      summarizeMonthlyStaff(
        staff,
        monthEntries.filter((entry) => entry.staffId === staff.id),
        shiftMap
      )
    )
  };
}
