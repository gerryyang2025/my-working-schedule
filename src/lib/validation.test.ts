import { describe, expect, it } from "vitest";
import type { Shift } from "../types/domain";
import { validateScheduleShiftIds } from "./validation";

const shifts: Shift[] = [
  {
    id: "shift-a1",
    name: "A1组长",
    shortName: "A1",
    color: "#2563EB",
    countsAttendance: true,
    coefficient: 1.5,
    enabled: true,
    sortOrder: 1
  },
  {
    id: "shift-p1",
    name: "P1责任护士",
    shortName: "P1",
    color: "#16A34A",
    countsAttendance: true,
    coefficient: 1,
    enabled: true,
    sortOrder: 2
  },
  {
    id: "shift-rest",
    name: "休息",
    shortName: "休",
    color: "#64748B",
    countsAttendance: false,
    coefficient: 0,
    enabled: false,
    sortOrder: 3
  }
];

describe("validateScheduleShiftIds", () => {
  it("accepts zero, one, or two enabled shifts", () => {
    expect(validateScheduleShiftIds([], shifts).ok).toBe(true);
    expect(validateScheduleShiftIds(["shift-a1"], shifts).ok).toBe(true);
    expect(validateScheduleShiftIds(["shift-a1", "shift-p1"], shifts).ok).toBe(true);
  });

  it("rejects duplicate shift IDs", () => {
    const result = validateScheduleShiftIds(["shift-a1", "shift-a1"], shifts);
    expect(result).toEqual({ ok: false, message: "同一天不能重复保存同一个班次" });
  });

  it("rejects more than two shifts", () => {
    const result = validateScheduleShiftIds(["shift-a1", "shift-a1", "shift-a1"], shifts);
    expect(result).toEqual({ ok: false, message: "单人单日最多两个班次" });
  });

  it("rejects disabled shifts", () => {
    const result = validateScheduleShiftIds(["shift-rest"], shifts);
    expect(result).toEqual({ ok: false, message: "班次已禁用：休息" });
  });

  it("rejects unknown shifts", () => {
    const result = validateScheduleShiftIds(["shift-missing"], shifts);
    expect(result).toEqual({ ok: false, message: "班次不存在：shift-missing" });
  });
});
