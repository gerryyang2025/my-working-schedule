import type { MonthlySettlementRow, StaffType } from "@/types/domain";
import type { RangeSourceMonth } from "./range-bonus";

interface BonusAllocationCsvInput {
  title: string;
  status: string;
  bonusPool: number;
  coefficientTotal: number;
  sourceMonths: RangeSourceMonth[];
  rows: MonthlySettlementRow[];
}

const STAFF_TYPE_LABELS: Record<StaffType, string> = {
  nurse: "护士",
  clerk: "文员",
  head_nurse: "护士长"
};

const CSV_HEADERS = [
  "人员",
  "工号",
  "人员类型",
  "出勤班次",
  "满勤标准",
  "出勤盈亏",
  "累计加班班次",
  "月总系数",
  "分配金额",
  "备注"
];

function csvCell(value: string | number): string {
  const text = String(value);

  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvRow(values: Array<string | number>): string {
  return values.map(csvCell).join(",");
}

function formatMoney(value: number): string {
  return value.toFixed(2);
}

function formatCoefficient(value: number): string {
  return value.toFixed(2);
}

function formatSignedBalance(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function coefficientText(row: MonthlySettlementRow): string {
  return row.coefficientTotal === null ? "单独核算" : formatCoefficient(row.coefficientTotal);
}

function rowNote(row: MonthlySettlementRow): string {
  return row.bonusExcludedReason || row.coefficientExcludedReason;
}

function sourceMonthText(sourceMonths: RangeSourceMonth[]): string {
  return sourceMonths
    .map((item) => `${item.month} 使用${item.source === "settlement" ? "月结快照" : "实时排班"}`)
    .join("；");
}

export function createBonusAllocationCsv(input: BonusAllocationCsvInput): string {
  const metadataRows = [
    csvRow(["导出范围", input.title]),
    csvRow(["状态", input.status]),
    csvRow(["奖金总额", formatMoney(input.bonusPool)]),
    csvRow(["普通人员总系数", formatCoefficient(input.coefficientTotal)])
  ];

  if (input.sourceMonths.length > 0) {
    metadataRows.push(csvRow(["来源月份", sourceMonthText(input.sourceMonths)]));
  }

  const dataRows = input.rows.map((row) =>
    csvRow([
      row.staffName,
      row.staffJobId,
      STAFF_TYPE_LABELS[row.staffType],
      row.attendanceShifts,
      row.requiredShifts,
      formatSignedBalance(row.attendanceBalance),
      row.overtimeShifts,
      coefficientText(row),
      formatMoney(row.bonusAmount),
      rowNote(row)
    ])
  );

  return `\uFEFF${[...metadataRows, "", csvRow(CSV_HEADERS), ...dataRows].join("\n")}`;
}

export function getBonusAllocationCsvFilename(
  title: string,
  isRangeMode: boolean,
  startMonth: string,
  endMonth: string
): string {
  if (isRangeMode) {
    return `bonus-allocation-${startMonth}_to_${endMonth}.csv`;
  }

  return `bonus-allocation-${title}.csv`;
}
