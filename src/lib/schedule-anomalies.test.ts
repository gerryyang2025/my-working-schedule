import { describe, expect, it } from "vitest";
import type { AppData } from "@/types/domain";
import { getWeekDays } from "./date";
import { calculateWeeklyScheduleAnomalies } from "./schedule-anomalies";

const baseData: AppData = {
  staff: [
    { id: "staff-active", jobId: "100001", name: "李护士", type: "nurse", isAdmin: false, enabled: true, sortOrder: 1 },
    { id: "staff-disabled", jobId: "100002", name: "王护士", type: "nurse", isAdmin: false, enabled: false, sortOrder: 2 }
  ],
  shifts: [
    { id: "shift-day", name: "白班", shortName: "白", color: "#2563EB", countsAttendance: true, coefficient: 1, enabled: true, sortOrder: 1 },
    { id: "shift-night", name: "夜班", shortName: "夜", color: "#DC2626", countsAttendance: true, coefficient: 1.2, enabled: true, sortOrder: 2 },
    { id: "shift-old", name: "旧班次", shortName: "旧", color: "#475569", countsAttendance: true, coefficient: 1, enabled: false, sortOrder: 3 }
  ],
  holidays: [],
  scheduleEntries: [],
  monthlySettlements: [],
  settings: { defaultRequiredShiftsPerWeek: 5, version: 1 }
};

describe("calculateWeeklyScheduleAnomalies", () => {
  it("warns about missing schedules for enabled staff in the selected week", () => {
    const anomalies = calculateWeeklyScheduleAnomalies(
      {
        ...baseData,
        scheduleEntries: [
          { id: "day", date: "2026-06-15", staffId: "staff-active", shiftIds: ["shift-day"], note: "" }
        ]
      },
      getWeekDays("2026-06-15")
    );

    expect(anomalies).toContainEqual(
      expect.objectContaining({
        type: "missing-schedule",
        staffId: "staff-active",
        date: "2026-06-16",
        message: "李护士 2026-06-16 未排班。"
      })
    );
    expect(anomalies.some((item) => item.type === "missing-schedule" && item.staffId === "staff-disabled")).toBe(false);
  });

  it("warns about double shifts, disabled shifts, missing shift ids, and disabled staff with schedules", () => {
    const anomalies = calculateWeeklyScheduleAnomalies(
      {
        ...baseData,
        scheduleEntries: [
          { id: "double", date: "2026-06-15", staffId: "staff-active", shiftIds: ["shift-day", "shift-night"], note: "" },
          { id: "disabled-shift", date: "2026-06-16", staffId: "staff-active", shiftIds: ["shift-old"], note: "" },
          { id: "missing-shift", date: "2026-06-17", staffId: "staff-active", shiftIds: ["shift-missing"], note: "" },
          { id: "disabled-staff", date: "2026-06-18", staffId: "staff-disabled", shiftIds: ["shift-day"], note: "" }
        ]
      },
      getWeekDays("2026-06-15")
    );

    expect(anomalies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "double-shift",
          staffId: "staff-active",
          date: "2026-06-15",
          message: expect.stringContaining("多个班次")
        }),
        expect.objectContaining({
          type: "disabled-shift",
          staffId: "staff-active",
          date: "2026-06-16",
          message: expect.stringContaining("旧班次")
        }),
        expect.objectContaining({
          type: "missing-shift",
          staffId: "staff-active",
          date: "2026-06-17",
          message: expect.stringContaining("shift-missing")
        }),
        expect.objectContaining({
          type: "disabled-staff-with-schedule",
          staffId: "staff-disabled",
          date: "2026-06-18",
          message: expect.stringContaining("王护士")
        })
      ])
    );
  });

  it("ignores entries outside the selected week", () => {
    const anomalies = calculateWeeklyScheduleAnomalies(
      {
        ...baseData,
        scheduleEntries: [
          { id: "outside", date: "2026-06-22", staffId: "staff-active", shiftIds: ["shift-missing"], note: "" },
          ...getWeekDays("2026-06-15").map((day) => ({
            id: `${day.key}__staff-active`,
            date: day.key,
            staffId: "staff-active",
            shiftIds: ["shift-day"],
            note: ""
          }))
        ]
      },
      getWeekDays("2026-06-15")
    );

    expect(anomalies).toEqual([]);
  });
});
