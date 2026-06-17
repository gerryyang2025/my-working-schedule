import { describe, expect, it } from "vitest";
import type { AppData, MonthlyStaffSummary, MonthlySummary, WeeklyStaffSummary, WeeklySummary } from "@/types/domain";
import { getMonthDays } from "./date";
import { calculateMonthlySummary, calculateWeeklySummary } from "./calculation";

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
  monthlySettlements: [],
  settings: {
    defaultRequiredShiftsPerWeek: 5,
    version: 1
  }
};

function getRow(summary: WeeklySummary, staffId: string): WeeklyStaffSummary {
  const row = summary.rows.find((candidate) => candidate.staffId === staffId);
  expect(row).toBeDefined();
  return row as WeeklyStaffSummary;
}

function getMonthlyRow(summary: MonthlySummary, staffId: string): MonthlyStaffSummary {
  const row = summary.rows.find((candidate) => candidate.staffId === staffId);
  expect(row).toBeDefined();
  return row as MonthlyStaffSummary;
}

describe("calculateWeeklySummary", () => {
  it("deducts affected holidays from required shifts", () => {
    const summary = calculateWeeklySummary(baseData, "2026-06-17");
    expect(summary.requiredShifts).toBe(4);
    expect(summary.holidayDeduction).toBe(1);
    expect(summary.holidayNames).toEqual(["端午节"]);
  });

  it("calculates attendance by shift count instead of natural day", () => {
    const summary = calculateWeeklySummary(baseData, "2026-06-17");
    const nurse = getRow(summary, "staff-nurse");
    expect(nurse.attendanceShifts).toBe(5);
    expect(nurse.overtimeShifts).toBe(1);
    expect(nurse.coefficientTotal).toBe(6.7);
  });

  it("counts clerks with the same rules as nurses", () => {
    const summary = calculateWeeklySummary(baseData, "2026-06-17");
    const clerk = getRow(summary, "staff-clerk");
    expect(clerk.attendanceShifts).toBe(1);
    expect(clerk.overtimeShifts).toBe(0);
    expect(clerk.coefficientTotal).toBe(1.3);
  });

  it("counts head nurse attendance and overtime but excludes coefficient", () => {
    const summary = calculateWeeklySummary(baseData, "2026-06-17");
    const head = getRow(summary, "staff-head");
    expect(head.attendanceShifts).toBe(2);
    expect(head.overtimeShifts).toBe(0);
    expect(head.coefficientTotal).toBeNull();
    expect(head.coefficientExcludedReason).toBe("护士长绩效单独核算");
  });

  it("skips missing shift IDs", () => {
    const data: AppData = {
      ...baseData,
      scheduleEntries: [
        { id: "missing-shift", date: "2026-06-17", staffId: "staff-nurse", shiftIds: ["shift-missing"], note: "" }
      ]
    };

    const nurse = getRow(calculateWeeklySummary(data, "2026-06-17"), "staff-nurse");
    expect(nurse.attendanceShifts).toBe(0);
    expect(nurse.coefficientTotal).toBe(0);
  });

  it("skips disabled shifts", () => {
    const data: AppData = {
      ...baseData,
      shifts: [
        ...baseData.shifts,
        {
          id: "shift-disabled",
          name: "停用班",
          shortName: "停",
          color: "#94A3B8",
          countsAttendance: true,
          coefficient: 9,
          enabled: false,
          sortOrder: 4
        }
      ],
      scheduleEntries: [
        { id: "disabled-shift", date: "2026-06-17", staffId: "staff-nurse", shiftIds: ["shift-disabled"], note: "" }
      ]
    };

    const nurse = getRow(calculateWeeklySummary(data, "2026-06-17"), "staff-nurse");
    expect(nurse.attendanceShifts).toBe(0);
    expect(nurse.coefficientTotal).toBe(0);
  });

  it("ignores entries outside the selected Monday to Sunday week", () => {
    const data: AppData = {
      ...baseData,
      scheduleEntries: [
        { id: "previous-week", date: "2026-06-14", staffId: "staff-nurse", shiftIds: ["shift-day"], note: "" },
        { id: "current-week", date: "2026-06-17", staffId: "staff-nurse", shiftIds: ["shift-day"], note: "" },
        { id: "next-week", date: "2026-06-22", staffId: "staff-nurse", shiftIds: ["shift-night"], note: "" }
      ]
    };

    const nurse = getRow(calculateWeeklySummary(data, "2026-06-17"), "staff-nurse");
    expect(nurse.attendanceShifts).toBe(1);
    expect(nurse.coefficientTotal).toBe(1.3);
  });

  it("includes disabled staff with historical entries in the selected week", () => {
    const data: AppData = {
      ...baseData,
      staff: [
        ...baseData.staff,
        {
          id: "staff-disabled",
          jobId: "100088",
          name: "停用护士",
          type: "nurse",
          isAdmin: false,
          enabled: false,
          sortOrder: 4
        }
      ],
      scheduleEntries: [
        { id: "historical-entry", date: "2026-06-17", staffId: "staff-disabled", shiftIds: ["shift-day"], note: "" }
      ]
    };

    const disabled = getRow(calculateWeeklySummary(data, "2026-06-17"), "staff-disabled");
    expect(disabled.staffName).toBe("停用护士");
    expect(disabled.attendanceShifts).toBe(1);
    expect(disabled.coefficientTotal).toBe(1.3);
  });

  it("hides disabled staff without entries in the selected week", () => {
    const data: AppData = {
      ...baseData,
      staff: [
        ...baseData.staff,
        {
          id: "staff-disabled",
          jobId: "100088",
          name: "停用护士",
          type: "nurse",
          isAdmin: false,
          enabled: false,
          sortOrder: 4
        }
      ],
      scheduleEntries: [
        { id: "historical-entry", date: "2026-06-14", staffId: "staff-disabled", shiftIds: ["shift-day"], note: "" }
      ]
    };

    const summary = calculateWeeklySummary(data, "2026-06-17");
    expect(summary.rows.map((row) => row.staffId)).not.toContain("staff-disabled");
  });

  it("floors required shifts at zero when holiday deductions exceed the weekly default", () => {
    const data: AppData = {
      ...baseData,
      holidays: [
        { id: "holiday-1", date: "2026-06-15", name: "节日一", affectsRequiredAttendance: true },
        { id: "holiday-2", date: "2026-06-16", name: "节日二", affectsRequiredAttendance: true },
        { id: "holiday-3", date: "2026-06-17", name: "节日三", affectsRequiredAttendance: true }
      ],
      settings: {
        ...baseData.settings,
        defaultRequiredShiftsPerWeek: 1
      }
    };

    const summary = calculateWeeklySummary(data, "2026-06-17");
    expect(summary.holidayDeduction).toBe(3);
    expect(summary.requiredShifts).toBe(0);
  });
});

describe("calculateMonthlySummary", () => {
  const monthDays = getMonthDays(2026, 6);

  it("calculates monthly attendance and coefficients by shift count", () => {
    const summary = calculateMonthlySummary(baseData, monthDays);
    const nurse = getMonthlyRow(summary, "staff-nurse");
    const clerk = getMonthlyRow(summary, "staff-clerk");

    expect(summary.monthStart).toBe("2026-06-01");
    expect(summary.monthEnd).toBe("2026-06-30");
    expect(summary.totalDays).toBe(30);
    expect(summary.holidayNames).toEqual(["端午节"]);
    expect(nurse.attendanceShifts).toBe(5);
    expect(nurse.coefficientTotal).toBe(6.7);
    expect(clerk.attendanceShifts).toBe(1);
    expect(clerk.coefficientTotal).toBe(1.3);
  });

  it("counts head nurse monthly attendance but excludes coefficient", () => {
    const summary = calculateMonthlySummary(baseData, monthDays);
    const head = getMonthlyRow(summary, "staff-head");

    expect(head.attendanceShifts).toBe(2);
    expect(head.coefficientTotal).toBeNull();
    expect(head.coefficientExcludedReason).toBe("护士长绩效单独核算");
  });

  it("ignores entries outside the printed month days", () => {
    const data: AppData = {
      ...baseData,
      scheduleEntries: [
        { id: "previous-month", date: "2026-05-31", staffId: "staff-nurse", shiftIds: ["shift-day"], note: "" },
        { id: "current-month", date: "2026-06-17", staffId: "staff-nurse", shiftIds: ["shift-day"], note: "" },
        { id: "next-month", date: "2026-07-01", staffId: "staff-nurse", shiftIds: ["shift-night"], note: "" }
      ]
    };

    const nurse = getMonthlyRow(calculateMonthlySummary(data, monthDays), "staff-nurse");
    expect(nurse.attendanceShifts).toBe(1);
    expect(nurse.coefficientTotal).toBe(1.3);
  });

  it("skips missing and disabled shift IDs in monthly totals", () => {
    const data: AppData = {
      ...baseData,
      shifts: [
        ...baseData.shifts,
        {
          id: "shift-disabled",
          name: "停用班",
          shortName: "停",
          color: "#94A3B8",
          countsAttendance: true,
          coefficient: 9,
          enabled: false,
          sortOrder: 4
        }
      ],
      scheduleEntries: [
        {
          id: "invalid-month-shifts",
          date: "2026-06-17",
          staffId: "staff-nurse",
          shiftIds: ["shift-missing", "shift-disabled"],
          note: ""
        }
      ]
    };

    const nurse = getMonthlyRow(calculateMonthlySummary(data, monthDays), "staff-nurse");
    expect(nurse.attendanceShifts).toBe(0);
    expect(nurse.coefficientTotal).toBe(0);
  });

  it("includes disabled staff with historical entries in the printed month", () => {
    const data: AppData = {
      ...baseData,
      staff: [
        ...baseData.staff,
        {
          id: "staff-disabled",
          jobId: "100088",
          name: "停用护士",
          type: "nurse",
          isAdmin: false,
          enabled: false,
          sortOrder: 4
        }
      ],
      scheduleEntries: [
        { id: "historical-entry", date: "2026-06-17", staffId: "staff-disabled", shiftIds: ["shift-day"], note: "" }
      ]
    };

    const disabled = getMonthlyRow(calculateMonthlySummary(data, monthDays), "staff-disabled");
    expect(disabled.staffName).toBe("停用护士");
    expect(disabled.attendanceShifts).toBe(1);
    expect(disabled.coefficientTotal).toBe(1.3);
  });

  it("hides disabled staff without entries in the printed month", () => {
    const data: AppData = {
      ...baseData,
      staff: [
        ...baseData.staff,
        {
          id: "staff-disabled",
          jobId: "100088",
          name: "停用护士",
          type: "nurse",
          isAdmin: false,
          enabled: false,
          sortOrder: 4
        }
      ],
      scheduleEntries: [
        { id: "historical-entry", date: "2026-07-01", staffId: "staff-disabled", shiftIds: ["shift-day"], note: "" }
      ]
    };

    const summary = calculateMonthlySummary(data, monthDays);
    expect(summary.rows.map((row) => row.staffId)).not.toContain("staff-disabled");
  });
});
