import { describe, expect, it } from "vitest";
import { validateScheduleQueryRange, type ScheduleQueryRangeResult } from "./schedule-query";

function expectOk(result: ScheduleQueryRangeResult): Extract<ScheduleQueryRangeResult, { ok: true }> {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(result.message);
  }

  return result;
}

describe("schedule query range helpers", () => {
  it("rejects missing and malformed date keys", () => {
    expect(validateScheduleQueryRange("", "2026-06-21")).toEqual({
      ok: false,
      message: "请输入完整的开始日期和结束日期",
      days: [],
      weekGroups: [],
      isLongRange: false
    });

    expect(validateScheduleQueryRange("2026-6-15", "2026-06-21")).toEqual({
      ok: false,
      message: "请输入完整的开始日期和结束日期",
      days: [],
      weekGroups: [],
      isLongRange: false
    });

    expect(validateScheduleQueryRange("2026-02-30", "2026-03-01")).toEqual({
      ok: false,
      message: "请输入完整的开始日期和结束日期",
      days: [],
      weekGroups: [],
      isLongRange: false
    });
  });

  it("rejects a range whose start date is after the end date", () => {
    expect(validateScheduleQueryRange("2026-06-22", "2026-06-21")).toEqual({
      ok: false,
      message: "开始日期不能晚于结束日期",
      days: [],
      weekGroups: [],
      isLongRange: false
    });
  });

  it("expands a valid range and groups partial natural weeks", () => {
    const result = expectOk(validateScheduleQueryRange("2026-06-18", "2026-06-24"));

    expect(result.days.map((day) => day.key)).toEqual([
      "2026-06-18",
      "2026-06-19",
      "2026-06-20",
      "2026-06-21",
      "2026-06-22",
      "2026-06-23",
      "2026-06-24"
    ]);
    expect(result.weekGroups.map((group) => `${group.start} 至 ${group.end}`)).toEqual([
      "2026-06-18 至 2026-06-21",
      "2026-06-22 至 2026-06-24"
    ]);
    expect(result.weekGroups[0].days.map((day) => day.key)).toEqual([
      "2026-06-18",
      "2026-06-19",
      "2026-06-20",
      "2026-06-21"
    ]);
    expect(result.weekGroups[1].days.map((day) => day.key)).toEqual([
      "2026-06-22",
      "2026-06-23",
      "2026-06-24"
    ]);
    expect(result.isLongRange).toBe(false);
  });

  it("allows long ranges and flags ranges over 180 days", () => {
    const result = expectOk(validateScheduleQueryRange("2026-01-01", "2026-07-01"));

    expect(result.days).toHaveLength(182);
    expect(result.weekGroups.length).toBeGreaterThan(20);
    expect(result.isLongRange).toBe(true);
  });
});
