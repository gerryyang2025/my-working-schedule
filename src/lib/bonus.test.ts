import { describe, expect, it } from "vitest";
import type { MonthlySummary } from "@/types/domain";
import { calculateBonusAllocation, createMonthlySettlement } from "./bonus";

const baseSummary: MonthlySummary = {
  monthStart: "2026-06-01",
  monthEnd: "2026-06-30",
  totalDays: 30,
  holidayNames: ["端午节"],
  rows: [
    {
      staffId: "staff-head",
      staffName: "段护士长",
      staffType: "head_nurse",
      attendanceShifts: 10,
      overtimeShifts: 0,
      coefficientTotal: null,
      coefficientExcludedReason: "护士长绩效单独核算"
    },
    {
      staffId: "staff-nurse",
      staffName: "李护士",
      staffType: "nurse",
      attendanceShifts: 12,
      overtimeShifts: 2,
      coefficientTotal: 10,
      coefficientExcludedReason: ""
    },
    {
      staffId: "staff-clerk",
      staffName: "王文员",
      staffType: "clerk",
      attendanceShifts: 8,
      overtimeShifts: 0,
      coefficientTotal: 5,
      coefficientExcludedReason: ""
    }
  ]
};

describe("calculateBonusAllocation", () => {
  it("returns the rounded bonus pool", () => {
    const allocation = calculateBonusAllocation(baseSummary, 1500.129);

    expect(allocation.bonusPool).toBe(1500.13);
  });

  it.each([
    [1.005, 1.01],
    [10.075, 10.08]
  ])("normalizes half-cent bonus pool %s to %s", (bonusPool, expected) => {
    expect(calculateBonusAllocation(baseSummary, bonusPool).bonusPool).toBe(expected);
  });

  it("allocates bonus by monthly coefficient and excludes the head nurse", () => {
    const allocation = calculateBonusAllocation(baseSummary, 1500);

    expect(allocation.canSettle).toBe(true);
    expect(allocation.message).toBe("");
    expect(allocation.coefficientTotal).toBe(15);
    expect(allocation.rows.map((row) => [row.staffName, row.bonusAmount, row.bonusExcludedReason])).toEqual([
      ["段护士长", 0, "护士长绩效单独核算"],
      ["李护士", 1000, ""],
      ["王文员", 500, ""]
    ]);
  });

  it("copies overtime shifts into allocation rows", () => {
    const allocation = calculateBonusAllocation(baseSummary, 1500);
    const nurse = allocation.rows.find((row) => row.staffId === "staff-nurse");

    expect(nurse?.overtimeShifts).toBe(baseSummary.rows.find((row) => row.staffId === "staff-nurse")?.overtimeShifts);
  });

  it("keeps zero-coefficient ordinary staff in the result with zero bonus", () => {
    const allocation = calculateBonusAllocation(
      {
        ...baseSummary,
        rows: [
          baseSummary.rows[0],
          { ...baseSummary.rows[1], coefficientTotal: 0 },
          baseSummary.rows[2]
        ]
      },
      500
    );

    expect(allocation.canSettle).toBe(true);
    expect(allocation.rows[1].bonusAmount).toBe(0);
    expect(allocation.rows[2].bonusAmount).toBe(500);
  });

  it("keeps distributed bonuses equal to the rounded pool with excluded and zero-coefficient rows", () => {
    const allocation = calculateBonusAllocation(
      {
        ...baseSummary,
        rows: [
          baseSummary.rows[0],
          { ...baseSummary.rows[1], coefficientTotal: 0 },
          baseSummary.rows[2],
          { ...baseSummary.rows[1], staffId: "staff-nurse-2", staffName: "赵护士", coefficientTotal: 5 }
        ]
      },
      100
    );

    const distributedTotal = allocation.rows.reduce((total, row) => total + row.bonusAmount, 0);

    expect(allocation.rows.map((row) => row.bonusAmount)).toEqual([0, 0, 50, 50]);
    expect(distributedTotal).toBe(allocation.bonusPool);
  });

  it("puts the rounding tail on the last positive-coefficient participant", () => {
    const allocation = calculateBonusAllocation(
      {
        ...baseSummary,
        rows: [
          { ...baseSummary.rows[1], staffId: "one", staffName: "一", coefficientTotal: 1 },
          { ...baseSummary.rows[1], staffId: "two", staffName: "二", coefficientTotal: 1 },
          { ...baseSummary.rows[1], staffId: "three", staffName: "三", coefficientTotal: 1 }
        ]
      },
      100
    );

    expect(allocation.rows.map((row) => row.bonusAmount)).toEqual([33.33, 33.33, 33.34]);
  });

  it("rounds non-tail half-cent shares before giving the tail to the last participant", () => {
    const allocation = calculateBonusAllocation(
      {
        ...baseSummary,
        rows: [
          { ...baseSummary.rows[1], staffId: "one", staffName: "一", coefficientTotal: 0.41 },
          { ...baseSummary.rows[2], staffId: "two", staffName: "二", coefficientTotal: 0.41 }
        ]
      },
      100.09
    );

    expect(allocation.coefficientTotal).toBe(0.82);
    expect(allocation.rows.map((row) => row.bonusAmount)).toEqual([50.05, 50.04]);
  });

  it("keeps small-pool tail correction from making the last participant negative", () => {
    const allocation = calculateBonusAllocation(
      {
        ...baseSummary,
        rows: [
          { ...baseSummary.rows[1], staffId: "one", staffName: "一", coefficientTotal: 1 },
          { ...baseSummary.rows[1], staffId: "two", staffName: "二", coefficientTotal: 1 },
          { ...baseSummary.rows[1], staffId: "three", staffName: "三", coefficientTotal: 1 },
          { ...baseSummary.rows[1], staffId: "four", staffName: "四", coefficientTotal: 1 }
        ]
      },
      0.02
    );
    const bonusAmounts = allocation.rows.map((row) => row.bonusAmount);
    const distributedTotal = bonusAmounts.reduce((total, amount) => total + amount, 0);

    expect(bonusAmounts.every((amount) => amount >= 0)).toBe(true);
    expect(distributedTotal).toBe(allocation.bonusPool);
    expect(bonusAmounts).toEqual([0.01, 0.01, 0, 0]);
  });

  it("does not allow settlement when ordinary coefficient total is zero", () => {
    const allocation = calculateBonusAllocation(
      {
        ...baseSummary,
        rows: [
          baseSummary.rows[0],
          { ...baseSummary.rows[1], coefficientTotal: 0 },
          { ...baseSummary.rows[2], coefficientTotal: 0 }
        ]
      },
      100
    );

    expect(allocation.canSettle).toBe(false);
    expect(allocation.message).toBe("普通人员月总系数合计为 0，无法按系数分配奖金");
    expect(allocation.rows.map((row) => row.bonusAmount)).toEqual([0, 0, 0]);
  });
});

describe("createMonthlySettlement", () => {
  it("creates a settlement snapshot with rounded pool and server settlement time", () => {
    const settlement = createMonthlySettlement({
      month: "2026-06",
      monthlySummary: baseSummary,
      bonusPool: 1500.129,
      settledAt: "2026-06-30T10:00:00.000Z"
    });

    expect(settlement.rows[0]).toMatchObject({
      overtimeShifts: expect.any(Number)
    });
    expect(settlement).toMatchObject({
      id: "settlement-2026-06",
      month: "2026-06",
      monthStart: "2026-06-01",
      monthEnd: "2026-06-30",
      totalDays: 30,
      bonusPool: 1500.13,
      coefficientTotal: 15,
      settledAt: "2026-06-30T10:00:00.000Z"
    });
    expect(settlement.rows).toEqual([
      {
        staffId: "staff-head",
        staffName: "段护士长",
        staffType: "head_nurse",
        attendanceShifts: 10,
        overtimeShifts: 0,
        coefficientTotal: null,
        coefficientExcludedReason: "护士长绩效单独核算",
        bonusAmount: 0,
        bonusExcludedReason: "护士长绩效单独核算"
      },
      {
        staffId: "staff-nurse",
        staffName: "李护士",
        staffType: "nurse",
        attendanceShifts: 12,
        overtimeShifts: 2,
        coefficientTotal: 10,
        coefficientExcludedReason: "",
        bonusAmount: 1000.09,
        bonusExcludedReason: ""
      },
      {
        staffId: "staff-clerk",
        staffName: "王文员",
        staffType: "clerk",
        attendanceShifts: 8,
        overtimeShifts: 0,
        coefficientTotal: 5,
        coefficientExcludedReason: "",
        bonusAmount: 500.04,
        bonusExcludedReason: ""
      }
    ]);
  });

  it("throws when trying to snapshot a month with zero ordinary coefficient", () => {
    expect(() =>
      createMonthlySettlement({
        month: "2026-06",
        monthlySummary: {
          ...baseSummary,
          rows: [baseSummary.rows[0], { ...baseSummary.rows[1], coefficientTotal: 0 }]
        },
        bonusPool: 100,
        settledAt: "2026-06-30T10:00:00.000Z"
      })
    ).toThrow("普通人员月总系数合计为 0，无法按系数分配奖金");
  });

  it("throws when raw bonus pool is negative before rounding", () => {
    expect(() =>
      createMonthlySettlement({
        month: "2026-06",
        monthlySummary: baseSummary,
        bonusPool: -0.001,
        settledAt: "2026-06-30T10:00:00.000Z"
      })
    ).toThrow("奖金总额格式不正确");
  });

  it.each([
    ["Infinity", Infinity],
    ["NaN", Number.NaN]
  ])("throws when bonus pool is %s", (_label, bonusPool) => {
    expect(() =>
      createMonthlySettlement({
        month: "2026-06",
        monthlySummary: baseSummary,
        bonusPool,
        settledAt: "2026-06-30T10:00:00.000Z"
      })
    ).toThrow("奖金总额格式不正确");
  });
});
