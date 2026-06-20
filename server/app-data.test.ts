import { describe, expect, it } from "vitest";
import { normalizeAppData } from "./app-data";

describe("app data normalization", () => {
  it("normalizes legacy data without monthly settlements", () => {
    const legacyData = {
      staff: [],
      shifts: [],
      holidays: [],
      scheduleEntries: [],
      settings: {
        defaultRequiredShiftsPerWeek: 5,
        version: 1
      }
    };

    const result = normalizeAppData(legacyData);

    expect(result.changed).toBe(true);
    expect(result.data).toMatchObject({
      monthlySettlements: []
    });
  });

  it("normalizes legacy monthly settlement rows without required shifts and attendance balance", () => {
    const legacyData = {
      staff: [],
      shifts: [],
      holidays: [],
      scheduleEntries: [],
      monthlySettlements: [
        {
          id: "settlement-2026-06",
          month: "2026-06",
          monthStart: "2026-06-01",
          monthEnd: "2026-06-30",
          totalDays: 30,
          bonusPool: 1000,
          coefficientTotal: 2,
          settledAt: "2026-06-30T10:00:00.000Z",
          rows: [
            {
              staffId: "staff-nurse-001",
              staffName: "李护士",
              staffJobId: "100001",
              staffType: "nurse",
              attendanceShifts: 4,
              overtimeShifts: 1,
              coefficientTotal: 2,
              coefficientExcludedReason: "",
              bonusAmount: 1000,
              bonusExcludedReason: ""
            }
          ]
        }
      ],
      settings: {
        defaultRequiredShiftsPerWeek: 5,
        version: 1
      }
    };

    const result = normalizeAppData(legacyData);

    expect(result.changed).toBe(true);
    expect(result.data).toMatchObject({
      monthlySettlements: [
        {
          rows: [
            {
              requiredShifts: 0,
              attendanceBalance: 0
            }
          ]
        }
      ]
    });
  });
});
