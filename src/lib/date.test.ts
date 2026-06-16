import { describe, expect, it } from "vitest";
import { addWeeks, getMonthDays, getWeekDays, getWeekRange, toDateKey } from "./date";

describe("date utilities", () => {
  it("formats local date keys as yyyy-mm-dd", () => {
    expect(toDateKey(new Date(2026, 5, 3))).toBe("2026-06-03");
  });

  it("returns every day in a month", () => {
    const days = getMonthDays(2026, 6);
    expect(days).toHaveLength(30);
    expect(days[0].key).toBe("2026-06-01");
    expect(days[0].weekdayName).toBe("周一");
    expect(days[29].key).toBe("2026-06-30");
  });

  it("uses Monday to Sunday week range", () => {
    expect(getWeekRange("2026-06-17")).toEqual({
      start: "2026-06-15",
      end: "2026-06-21"
    });
  });

  it("returns every day in the selected Monday-start week", () => {
    const days = getWeekDays("2026-07-01");

    expect(days.map((day) => day.key)).toEqual([
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
      "2026-07-05"
    ]);
    expect(days[0].weekdayName).toBe("周一");
    expect(days[5].isWeekend).toBe(true);
    expect(days[6].weekdayName).toBe("周日");
  });

  it("keeps Sunday in the previous Monday-start week", () => {
    expect(getWeekRange("2026-06-21")).toEqual({
      start: "2026-06-15",
      end: "2026-06-21"
    });
  });

  it("moves by natural weeks from the selected week start", () => {
    expect(addWeeks("2026-06-17", -1)).toBe("2026-06-08");
    expect(addWeeks("2026-06-17", 1)).toBe("2026-06-22");
    expect(addWeeks("2026-06-21", 1)).toBe("2026-06-22");
  });
});
