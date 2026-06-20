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
});
