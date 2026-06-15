import type { AppData, ScheduleEntry, Shift, StaffMember, WeeklyStaffSummary, WeeklySummary } from "@/types/domain";
import { getWeekRange } from "./date";

function isWithinRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function roundCoefficient(value: number): number {
  return Math.round(value * 100) / 100;
}

function summarizeStaff(
  staff: StaffMember,
  entries: ScheduleEntry[],
  shiftMap: Map<string, Shift>,
  requiredShifts: number
): WeeklyStaffSummary {
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

  const overtimeShifts = Math.max(0, attendanceShifts - requiredShifts);
  const isHeadNurse = staff.type === "head_nurse";

  return {
    staffId: staff.id,
    staffName: staff.name,
    staffType: staff.type,
    attendanceShifts,
    requiredShifts,
    overtimeShifts,
    coefficientTotal: isHeadNurse ? null : roundCoefficient(coefficientTotal),
    coefficientExcludedReason: isHeadNurse ? "护士长绩效单独核算" : ""
  };
}

export function calculateWeeklySummary(data: AppData, selectedDate: string): WeeklySummary {
  const { start, end } = getWeekRange(selectedDate);
  const affectedHolidays = data.holidays.filter(
    (holiday) => holiday.affectsRequiredAttendance && isWithinRange(holiday.date, start, end)
  );
  const holidayDeduction = affectedHolidays.length;
  const requiredShifts = Math.max(0, data.settings.defaultRequiredShiftsPerWeek - holidayDeduction);
  const enabledStaff = [...data.staff]
    .filter((staff) => staff.enabled)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const shiftMap = new Map(data.shifts.map((shift) => [shift.id, shift]));
  const weekEntries = data.scheduleEntries.filter((entry) => isWithinRange(entry.date, start, end));

  return {
    weekStart: start,
    weekEnd: end,
    requiredShifts,
    holidayDeduction,
    holidayNames: affectedHolidays.map((holiday) => holiday.name),
    rows: enabledStaff.map((staff) =>
      summarizeStaff(
        staff,
        weekEntries.filter((entry) => entry.staffId === staff.id),
        shiftMap,
        requiredShifts
      )
    )
  };
}
