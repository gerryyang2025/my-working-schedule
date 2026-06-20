import type { AppData, MonthlySummary } from "@/types/domain";

export type SettlementCheckType =
  | "no-attendance"
  | "attendance-deficit"
  | "double-shift"
  | "missing-shift"
  | "disabled-shift"
  | "disabled-staff-with-schedule";

export interface SettlementCheckItem {
  type: SettlementCheckType;
  message: string;
  staffId?: string;
  date?: string;
  shiftIds?: string[];
}

function isWithinSummaryMonth(date: string, summary: MonthlySummary): boolean {
  return summary.monthStart !== "" && date >= summary.monthStart && date <= summary.monthEnd;
}

function formatShiftNames(shiftIds: string[], shiftNameById: Map<string, string>): string {
  return shiftIds.map((shiftId) => shiftNameById.get(shiftId) ?? shiftId).join("、");
}

export function calculateSettlementChecks(data: AppData, summary: MonthlySummary): SettlementCheckItem[] {
  const shiftById = new Map(data.shifts.map((shift) => [shift.id, shift]));
  const staffById = new Map(data.staff.map((staff) => [staff.id, staff]));
  const shiftNameById = new Map(data.shifts.map((shift) => [shift.id, shift.name]));
  const monthEntries = data.scheduleEntries.filter((entry) => isWithinSummaryMonth(entry.date, summary));
  const checks: SettlementCheckItem[] = [];
  const staffIdsWithoutAttendance = new Set<string>();

  for (const staff of data.staff.filter((person) => person.enabled)) {
    const staffEntries = monthEntries.filter((entry) => entry.staffId === staff.id);
    const hasAttendanceShift = staffEntries.some((entry) =>
      entry.shiftIds.some((shiftId) => shiftById.get(shiftId)?.enabled && shiftById.get(shiftId)?.countsAttendance)
    );

    if (!hasAttendanceShift) {
      staffIdsWithoutAttendance.add(staff.id);
      checks.push({
        type: "no-attendance",
        staffId: staff.id,
        message: `${staff.name} 当月没有任何计出勤班次。`
      });
    }
  }

  for (const row of summary.rows) {
    if (row.attendanceBalance < 0 && !staffIdsWithoutAttendance.has(row.staffId)) {
      checks.push({
        type: "attendance-deficit",
        staffId: row.staffId,
        message: `${row.staffName} 当月出勤不足，缺勤 ${Math.abs(row.attendanceBalance)} 班。`
      });
    }
  }

  for (const entry of monthEntries) {
    const staff = staffById.get(entry.staffId);
    const staffName = staff?.name ?? entry.staffId;
    const missingShiftIds = entry.shiftIds.filter((shiftId) => !shiftById.has(shiftId));
    const disabledShiftIds = entry.shiftIds.filter((shiftId) => shiftById.get(shiftId)?.enabled === false);

    if (entry.shiftIds.length >= 2) {
      checks.push({
        type: "double-shift",
        staffId: entry.staffId,
        date: entry.date,
        shiftIds: [...entry.shiftIds],
        message: `${staffName} ${entry.date} 有多个班次：${formatShiftNames(entry.shiftIds, shiftNameById)}。`
      });
    }

    if (missingShiftIds.length > 0) {
      checks.push({
        type: "missing-shift",
        staffId: entry.staffId,
        date: entry.date,
        shiftIds: missingShiftIds,
        message: `${staffName} ${entry.date} 引用了不存在的班次 ID：${missingShiftIds.join("、")}。`
      });
    }

    if (disabledShiftIds.length > 0) {
      checks.push({
        type: "disabled-shift",
        staffId: entry.staffId,
        date: entry.date,
        shiftIds: disabledShiftIds,
        message: `${staffName} ${entry.date} 使用了已停用班次：${formatShiftNames(disabledShiftIds, shiftNameById)}。`
      });
    }

    if (staff && !staff.enabled && entry.shiftIds.length > 0) {
      checks.push({
        type: "disabled-staff-with-schedule",
        staffId: entry.staffId,
        date: entry.date,
        shiftIds: [...entry.shiftIds],
        message: `${staff.name} 已停用，但 ${entry.date} 仍有排班：${formatShiftNames(entry.shiftIds, shiftNameById)}。`
      });
    }
  }

  return checks;
}
