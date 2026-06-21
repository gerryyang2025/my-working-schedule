import type { AppData } from "@/types/domain";
import type { CalendarDay } from "./date";

export type ScheduleAnomalyType =
  | "missing-schedule"
  | "double-shift"
  | "missing-shift"
  | "disabled-shift"
  | "disabled-staff-with-schedule";

export interface ScheduleAnomaly {
  type: ScheduleAnomalyType;
  message: string;
  staffId?: string;
  date?: string;
  shiftIds?: string[];
}

function formatShiftNames(shiftIds: string[], shiftNameById: Map<string, string>): string {
  return shiftIds.map((shiftId) => shiftNameById.get(shiftId) ?? shiftId).join("、");
}

export function calculateWeeklyScheduleAnomalies(data: AppData, days: CalendarDay[]): ScheduleAnomaly[] {
  const dayKeys = new Set(days.map((day) => day.key));
  const shiftById = new Map(data.shifts.map((shift) => [shift.id, shift]));
  const staffById = new Map(data.staff.map((staff) => [staff.id, staff]));
  const shiftNameById = new Map(data.shifts.map((shift) => [shift.id, shift.name]));
  const entryByStaffAndDate = new Map(
    data.scheduleEntries
      .filter((entry) => dayKeys.has(entry.date))
      .map((entry) => [`${entry.date}__${entry.staffId}`, entry])
  );
  const weekEntries = data.scheduleEntries.filter((entry) => dayKeys.has(entry.date));
  const anomalies: ScheduleAnomaly[] = [];

  for (const staff of data.staff.filter((person) => person.enabled)) {
    for (const day of days) {
      const entry = entryByStaffAndDate.get(`${day.key}__${staff.id}`);

      if (!entry || entry.shiftIds.length === 0) {
        anomalies.push({
          type: "missing-schedule",
          staffId: staff.id,
          date: day.key,
          message: `${staff.name} ${day.key} 未排班。`
        });
      }
    }
  }

  for (const entry of weekEntries) {
    const staff = staffById.get(entry.staffId);
    const staffName = staff?.name ?? entry.staffId;
    const missingShiftIds = entry.shiftIds.filter((shiftId) => !shiftById.has(shiftId));
    const disabledShiftIds = entry.shiftIds.filter((shiftId) => shiftById.get(shiftId)?.enabled === false);

    if (entry.shiftIds.length >= 2) {
      anomalies.push({
        type: "double-shift",
        staffId: entry.staffId,
        date: entry.date,
        shiftIds: [...entry.shiftIds],
        message: `${staffName} ${entry.date} 有多个班次：${formatShiftNames(entry.shiftIds, shiftNameById)}。`
      });
    }

    if (missingShiftIds.length > 0) {
      anomalies.push({
        type: "missing-shift",
        staffId: entry.staffId,
        date: entry.date,
        shiftIds: missingShiftIds,
        message: `${staffName} ${entry.date} 引用了不存在的班次 ID：${missingShiftIds.join("、")}。`
      });
    }

    if (disabledShiftIds.length > 0) {
      anomalies.push({
        type: "disabled-shift",
        staffId: entry.staffId,
        date: entry.date,
        shiftIds: disabledShiftIds,
        message: `${staffName} ${entry.date} 使用了已停用班次：${formatShiftNames(disabledShiftIds, shiftNameById)}。`
      });
    }

    if (staff && !staff.enabled && entry.shiftIds.length > 0) {
      anomalies.push({
        type: "disabled-staff-with-schedule",
        staffId: entry.staffId,
        date: entry.date,
        shiftIds: [...entry.shiftIds],
        message: `${staff.name} 已停用，但 ${entry.date} 仍有排班：${formatShiftNames(entry.shiftIds, shiftNameById)}。`
      });
    }
  }

  return anomalies;
}
