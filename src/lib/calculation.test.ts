import { describe, expect, it } from "vitest";
import type { AppData } from "@/types/domain";
import { calculateWeeklySummary } from "./calculation";

const baseData: AppData = {
  staff: [
    {
      id: "staff-head",
      jobId: "000228",
      name: "护士长",
      type: "head_nurse",
      isAdmin: true,
      enabled: true,
      sortOrder: 1
    },
    {
      id: "staff-nurse",
      jobId: "100001",
      name: "护士",
      type: "nurse",
      isAdmin: false,
      enabled: true,
      sortOrder: 2
    },
    {
      id: "staff-clerk",
      jobId: "200001",
      name: "文员",
      type: "clerk",
      isAdmin: false,
      enabled: true,
      sortOrder: 3
    }
  ],
  shifts: [
    {
      id: "shift-day",
      name: "白班",
      shortName: "白",
      color: "#2563EB",
      countsAttendance: true,
      coefficient: 1.3,
      enabled: true,
      sortOrder: 1
    },
    {
      id: "shift-night",
      name: "夜班",
      shortName: "夜",
      color: "#DC2626",
      countsAttendance: true,
      coefficient: 1.5,
      enabled: true,
      sortOrder: 2
    },
    {
      id: "shift-rest",
      name: "休",
      shortName: "休",
      color: "#64748B",
      countsAttendance: false,
      coefficient: 0,
      enabled: true,
      sortOrder: 3
    }
  ],
  holidays: [
    {
      id: "holiday-dragon",
      date: "2026-06-19",
      name: "端午节",
      affectsRequiredAttendance: true
    }
  ],
  scheduleEntries: [
    { id: "e1", date: "2026-06-15", staffId: "staff-nurse", shiftIds: ["shift-day"], note: "" },
    { id: "e2", date: "2026-06-16", staffId: "staff-nurse", shiftIds: ["shift-day"], note: "" },
    { id: "e3", date: "2026-06-17", staffId: "staff-nurse", shiftIds: ["shift-day", "shift-night"], note: "" },
    { id: "e4", date: "2026-06-18", staffId: "staff-nurse", shiftIds: ["shift-day"], note: "" },
    { id: "e5", date: "2026-06-20", staffId: "staff-clerk", shiftIds: ["shift-day"], note: "" },
    { id: "e6", date: "2026-06-15", staffId: "staff-head", shiftIds: ["shift-day", "shift-night"], note: "" }
  ],
  settings: {
    adminPassword: "123456",
    defaultRequiredShiftsPerWeek: 5,
    version: 1
  }
};

describe("calculateWeeklySummary", () => {
  it("deducts affected holidays from required shifts", () => {
    const summary = calculateWeeklySummary(baseData, "2026-06-17");
    expect(summary.requiredShifts).toBe(4);
    expect(summary.holidayDeduction).toBe(1);
    expect(summary.holidayNames).toEqual(["端午节"]);
  });

  it("calculates attendance by shift count instead of natural day", () => {
    const summary = calculateWeeklySummary(baseData, "2026-06-17");
    const nurse = summary.rows.find((row) => row.staffId === "staff-nurse");
    expect(nurse?.attendanceShifts).toBe(5);
    expect(nurse?.overtimeShifts).toBe(1);
    expect(nurse?.coefficientTotal).toBe(6.7);
  });

  it("counts clerks with the same rules as nurses", () => {
    const summary = calculateWeeklySummary(baseData, "2026-06-17");
    const clerk = summary.rows.find((row) => row.staffId === "staff-clerk");
    expect(clerk?.attendanceShifts).toBe(1);
    expect(clerk?.overtimeShifts).toBe(0);
    expect(clerk?.coefficientTotal).toBe(1.3);
  });

  it("counts head nurse attendance and overtime but excludes coefficient", () => {
    const summary = calculateWeeklySummary(baseData, "2026-06-17");
    const head = summary.rows.find((row) => row.staffId === "staff-head");
    expect(head?.attendanceShifts).toBe(2);
    expect(head?.overtimeShifts).toBe(0);
    expect(head?.coefficientTotal).toBeNull();
    expect(head?.coefficientExcludedReason).toBe("护士长绩效单独核算");
  });
});
