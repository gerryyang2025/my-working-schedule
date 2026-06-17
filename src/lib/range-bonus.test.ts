import { describe, expect, it } from "vitest";
import { calculateRangeBonusSummary, monthRangeToDates } from "./range-bonus";
import type { AppData, MonthlySettlement } from "@/types/domain";

function settlement(month: string, overrides: Partial<MonthlySettlement> = {}): MonthlySettlement {
  return {
    id: `settlement-${month}`,
    month,
    monthStart: `${month}-01`,
    monthEnd: `${month}-30`,
    totalDays: 30,
    bonusPool: 1000,
    coefficientTotal: 2,
    settledAt: `${month}-30T10:00:00.000Z`,
    rows: [
      {
        staffId: "staff-nurse-001",
        staffName: "李护士",
        staffType: "nurse",
        attendanceShifts: 4,
        overtimeShifts: 1,
        coefficientTotal: 2,
        coefficientExcludedReason: "",
        bonusAmount: 1000,
        bonusExcludedReason: ""
      }
    ],
    ...overrides
  };
}

function data(overrides: Partial<AppData> = {}): AppData {
  return {
    staff: [
      { id: "staff-nurse-001", jobId: "100001", name: "李护士", type: "nurse", isAdmin: false, enabled: true, sortOrder: 1 },
      { id: "staff-head-001", jobId: "000228", name: "段鸿露", type: "head_nurse", isAdmin: true, enabled: true, sortOrder: 2 }
    ],
    shifts: [
      { id: "shift-a1", name: "A1组长", shortName: "A1", color: "#2563EB", countsAttendance: true, coefficient: 1.5, enabled: true, sortOrder: 1 }
    ],
    holidays: [],
    scheduleEntries: [
      { id: "2026-07-01__staff-nurse-001", date: "2026-07-01", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" }
    ],
    monthlySettlements: [],
    settings: { defaultRequiredShiftsPerWeek: 5, version: 1 },
    ...overrides
  };
}

describe("monthRangeToDates", () => {
  it("expands whole-month ranges", () => {
    expect(monthRangeToDates("2026-06", "2026-07")).toEqual({
      rangeStart: "2026-06-01",
      rangeEnd: "2026-07-31"
    });
  });

  it("marks reversed ranges as invalid", () => {
    expect(monthRangeToDates("2026-08", "2026-07")).toBeNull();
  });
});

describe("calculateRangeBonusSummary", () => {
  it("combines settled snapshot months with live unsettled months", () => {
    const summary = calculateRangeBonusSummary(data({ monthlySettlements: [settlement("2026-06")] }), "2026-06", "2026-07");
    const nurse = summary.rows.find((row) => row.staffId === "staff-nurse-001");

    expect(summary.isValidRange).toBe(true);
    expect(summary.totalDays).toBe(61);
    expect(summary.sourceMonths).toEqual([
      { month: "2026-06", source: "settlement" },
      { month: "2026-07", source: "live" }
    ]);
    expect(nurse?.attendanceShifts).toBe(5);
    expect(nurse?.overtimeShifts).toBe(1);
    expect(nurse?.coefficientTotal).toBe(3.5);
  });

  it("keeps head nurses excluded when merging range rows", () => {
    const summary = calculateRangeBonusSummary(
      data({
        monthlySettlements: [
          settlement("2026-06", {
            rows: [
              {
                staffId: "staff-head-001",
                staffName: "段鸿露",
                staffType: "head_nurse",
                attendanceShifts: 2,
                overtimeShifts: 0,
                coefficientTotal: null,
                coefficientExcludedReason: "护士长绩效单独核算",
                bonusAmount: 0,
                bonusExcludedReason: "护士长绩效单独核算"
              }
            ],
            coefficientTotal: 0
          })
        ]
      }),
      "2026-06",
      "2026-07"
    );
    const head = summary.rows.find((row) => row.staffId === "staff-head-001");

    expect(head?.coefficientTotal).toBeNull();
    expect(head?.coefficientExcludedReason).toBe("护士长绩效单独核算");
  });

  it("returns an empty invalid summary for reversed ranges", () => {
    expect(calculateRangeBonusSummary(data(), "2026-08", "2026-07")).toMatchObject({
      isValidRange: false,
      rangeStart: "",
      rangeEnd: "",
      monthStart: "",
      monthEnd: "",
      totalDays: 0,
      holidayNames: [],
      sourceMonths: [],
      rows: []
    });
  });
});
