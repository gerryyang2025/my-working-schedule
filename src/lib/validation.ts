import type { Shift } from "../types/domain";

export interface ValidationResult {
  ok: boolean;
  message: string;
}

export function validateScheduleShiftIds(shiftIds: string[], shifts: Shift[]): ValidationResult {
  if (shiftIds.length > 2) {
    return { ok: false, message: "单人单日最多两个班次" };
  }

  if (new Set(shiftIds).size !== shiftIds.length) {
    return { ok: false, message: "同一天不能重复保存同一个班次" };
  }

  const shiftMap = new Map(shifts.map((shift) => [shift.id, shift]));
  for (const shiftId of shiftIds) {
    const shift = shiftMap.get(shiftId);
    if (!shift) {
      return { ok: false, message: `班次不存在：${shiftId}` };
    }
    if (!shift.enabled) {
      return { ok: false, message: `班次已禁用：${shift.name}` };
    }
  }

  return { ok: true, message: "" };
}
