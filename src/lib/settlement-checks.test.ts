import { describe, expect, it } from "vitest";
import type { AppData, MonthlySummary } from "@/types/domain";
import { calculateSettlementChecks } from "./settlement-checks";

const baseData: AppData = {
  staff: [
    { id: "staff-active", jobId: "100001", name: "李护士", type: "nurse", isAdmin: false, enabled: true, sortOrder: 1 },
    { id: "staff-disabled", jobId: "100002", name: "王护士", type: "nurse", isAdmin: false, enabled: false, sortOrder: 2 }
  ],
  shifts: [
    { id: "shift-day", name: "白班", shortName: "白", color: "#2563EB", countsAttendance: true, coefficient: 1, enabled: true, sortOrder: 1 },
    { id: "shift-night", name: "夜班", shortName: "夜", color: "#DC2626", countsAttendance: true, coefficient: 1.2, enabled: true, sortOrder: 2 },
    { id: "shift-rest", name: "休息", shortName: "休", color: "#64748B", countsAttendance: false, coefficient: 0, enabled: true, sortOrder: 3 },
    { id: "shift-old", name: "旧班次", shortName: "旧", color: "#475569", countsAttendance: true, coefficient: 1, enabled: false, sortOrder: 4 }
  ],
  holidays: [],
  scheduleEntries: [],
  monthlySettlements: [],
  settings: { defaultRequiredShiftsPerWeek: 5, version: 1 }
};

const baseSummary: MonthlySummary = {
  monthStart: "2026-06-01",
  monthEnd: "2026-06-30",
  totalDays: 30,
  holidayNames: [],
  rows: [
    {
      staffId: "staff-active",
      staffName: "李护士",
      staffJobId: "100001",
      staffType: "nurse",
      attendanceShifts: 0,
      requiredShifts: 20,
      attendanceBalance: 0,
      overtimeShifts: 0,
      coefficientTotal: 0,
      coefficientExcludedReason: ""
    }
  ]
};

describe("calculateSettlementChecks", () => {
  it("warns when an enabled staff member has no attendance-counting shifts in the month", () => {
    const checks = calculateSettlementChecks(
      {
        ...baseData,
        scheduleEntries: [{ id: "rest", date: "2026-06-02", staffId: "staff-active", shiftIds: ["shift-rest"], note: "" }]
      },
      baseSummary
    );

    expect(checks).toContainEqual(
      expect.objectContaining({
        type: "no-attendance",
        staffId: "staff-active",
        message: expect.stringContaining("李护士")
      })
    );
  });

  it("warns when a summary row has negative attendance balance", () => {
    const checks = calculateSettlementChecks(
      {
        ...baseData,
        scheduleEntries: [{ id: "day", date: "2026-06-02", staffId: "staff-active", shiftIds: ["shift-day"], note: "" }]
      },
      {
        ...baseSummary,
        rows: [{ ...baseSummary.rows[0], attendanceShifts: 18, attendanceBalance: -2 }]
      }
    );

    expect(checks).toContainEqual(
      expect.objectContaining({
        type: "attendance-deficit",
        staffId: "staff-active",
        message: expect.stringContaining("缺勤")
      })
    );
  });

  it("does not duplicate attendance deficit when a staff member already has no attendance warning", () => {
    const checks = calculateSettlementChecks(
      {
        ...baseData,
        scheduleEntries: [{ id: "rest", date: "2026-06-02", staffId: "staff-active", shiftIds: ["shift-rest"], note: "" }]
      },
      {
        ...baseSummary,
        rows: [{ ...baseSummary.rows[0], attendanceBalance: -20 }]
      }
    );

    const staffChecks = checks.filter((check) => check.staffId === "staff-active");
    expect(staffChecks.filter((check) => check.type === "no-attendance")).toHaveLength(1);
    expect(staffChecks.some((check) => check.type === "attendance-deficit")).toBe(false);
  });

  it("warns when a schedule references only a missing shift id", () => {
    const checks = calculateSettlementChecks(
      {
        ...baseData,
        scheduleEntries: [{ id: "missing", date: "2026-06-06", staffId: "staff-active", shiftIds: ["shift-missing"], note: "" }]
      },
      baseSummary
    );

    expect(checks).toContainEqual(
      expect.objectContaining({
        type: "missing-shift",
        staffId: "staff-active",
        date: "2026-06-06",
        shiftIds: ["shift-missing"],
        message: expect.stringContaining("李护士")
      })
    );
    expect(checks.find((check) => check.type === "missing-shift")?.message).toContain("shift-missing");
  });

  it("warns about a missing shift id while still counting a valid attendance shift", () => {
    const checks = calculateSettlementChecks(
      {
        ...baseData,
        scheduleEntries: [
          { id: "mixed", date: "2026-06-07", staffId: "staff-active", shiftIds: ["shift-day", "shift-missing"], note: "" }
        ]
      },
      baseSummary
    );

    expect(checks).toContainEqual(
      expect.objectContaining({
        type: "missing-shift",
        staffId: "staff-active",
        date: "2026-06-07",
        shiftIds: ["shift-missing"]
      })
    );
    expect(checks.some((check) => check.type === "no-attendance" && check.staffId === "staff-active")).toBe(false);
  });

  it("ignores schedules outside the summary month", () => {
    const checks = calculateSettlementChecks(
      {
        ...baseData,
        scheduleEntries: [
          { id: "outside-missing", date: "2026-07-01", staffId: "staff-active", shiftIds: ["shift-missing"], note: "" },
          { id: "inside-day", date: "2026-06-01", staffId: "staff-active", shiftIds: ["shift-day"], note: "" }
        ]
      },
      baseSummary
    );

    expect(checks.some((check) => check.date === "2026-07-01")).toBe(false);
    expect(checks.some((check) => check.type === "missing-shift")).toBe(false);
  });

  it("warns about double shifts, disabled shifts, and schedules assigned to disabled staff", () => {
    const checks = calculateSettlementChecks(
      {
        ...baseData,
        scheduleEntries: [
          { id: "double", date: "2026-06-03", staffId: "staff-active", shiftIds: ["shift-day", "shift-night"], note: "" },
          { id: "disabled-shift", date: "2026-06-04", staffId: "staff-active", shiftIds: ["shift-old"], note: "" },
          { id: "disabled-staff", date: "2026-06-05", staffId: "staff-disabled", shiftIds: ["shift-day"], note: "" }
        ]
      },
      baseSummary
    );

    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "double-shift",
          staffId: "staff-active",
          date: "2026-06-03",
          shiftIds: ["shift-day", "shift-night"],
          message: expect.stringContaining("白班")
        }),
        expect.objectContaining({
          type: "disabled-shift",
          staffId: "staff-active",
          date: "2026-06-04",
          shiftIds: ["shift-old"],
          message: expect.stringContaining("旧班次")
        }),
        expect.objectContaining({
          type: "disabled-staff-with-schedule",
          staffId: "staff-disabled",
          date: "2026-06-05",
          shiftIds: ["shift-day"],
          message: expect.stringContaining("王护士")
        })
      ])
    );
  });
});
