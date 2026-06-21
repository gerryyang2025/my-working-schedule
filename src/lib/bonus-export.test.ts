import { describe, expect, it } from "vitest";
import { createBonusAllocationCsv, getBonusAllocationCsvFilename } from "./bonus-export";
import type { MonthlySettlementRow } from "@/types/domain";
import type { RangeSourceMonth } from "./range-bonus";

const rows: MonthlySettlementRow[] = [
  {
    staffId: "staff-head",
    staffName: "段护士长",
    staffJobId: "000228",
    staffType: "head_nurse",
    attendanceShifts: 10,
    requiredShifts: 20,
    attendanceBalance: -10,
    overtimeShifts: 0,
    coefficientTotal: null,
    coefficientExcludedReason: "护士长绩效单独核算",
    bonusAmount: 0,
    bonusExcludedReason: "护士长绩效单独核算"
  },
  {
    staffId: "staff-nurse",
    staffName: "李护士,测试",
    staffJobId: "100001",
    staffType: "nurse",
    attendanceShifts: 12,
    requiredShifts: 20,
    attendanceBalance: -8,
    overtimeShifts: 2,
    coefficientTotal: 10,
    coefficientExcludedReason: "",
    bonusAmount: 1000,
    bonusExcludedReason: "需要\"复核\""
  }
];

describe("bonus export", () => {
  it("creates an Excel-friendly CSV with metadata and escaped bonus rows", () => {
    const sourceMonths: RangeSourceMonth[] = [
      { month: "2026-06", source: "settlement" },
      { month: "2026-07", source: "live" }
    ];

    const csv = createBonusAllocationCsv({
      title: "2026-06 至 2026-07",
      status: "临时试算",
      bonusPool: 1000,
      coefficientTotal: 10,
      sourceMonths,
      rows
    });

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.split("\n")).toEqual([
      "\uFEFF导出范围,2026-06 至 2026-07",
      "状态,临时试算",
      "奖金总额,1000.00",
      "护士与文员总系数,10.00",
      "来源月份,2026-06 使用月结快照；2026-07 使用实时排班",
      "",
      "人员,工号,人员类型,出勤班次,满勤标准,出勤盈亏,累计加班班次,月总系数,分配金额,备注",
      "段护士长,000228,护士长,10,20,-10,0,单独核算,0.00,护士长绩效单独核算",
      "\"李护士,测试\",100001,护士,12,20,-8,2,10.00,1000.00,\"需要\"\"复核\"\"\""
    ]);
  });

  it("builds stable CSV filenames for single months and ranges", () => {
    expect(getBonusAllocationCsvFilename("2026-06", false, "2026-06", "2026-06")).toBe(
      "bonus-allocation-2026-06.csv"
    );
    expect(getBonusAllocationCsvFilename("2026-06 至 2026-07", true, "2026-06", "2026-07")).toBe(
      "bonus-allocation-2026-06_to_2026-07.csv"
    );
  });
});
