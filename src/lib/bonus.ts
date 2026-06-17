import type { MonthlySettlement, MonthlySettlementRow, MonthlySummary } from "@/types/domain";

const ZERO_COEFFICIENT_MESSAGE = "普通人员月总系数合计为 0，无法按系数分配奖金";
const INVALID_BONUS_POOL_MESSAGE = "奖金总额格式不正确";

export interface BonusAllocation {
  canSettle: boolean;
  bonusPool: number;
  coefficientTotal: number;
  rows: MonthlySettlementRow[];
  message: string;
}

interface CreateMonthlySettlementInput {
  month: string;
  monthlySummary: MonthlySummary;
  bonusPool: number;
  settledAt: string;
}

function roundCurrency(value: number): number {
  return toMoneyCents(value) / 100;
}

function assertValidMoneyValue(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(INVALID_BONUS_POOL_MESSAGE);
  }
}

function expandExponentialDecimal(value: number): string {
  const text = value.toString();

  if (!text.includes("e")) {
    return text;
  }

  const [significand, exponentText] = text.split("e");
  const exponent = Number(exponentText);
  const [integerPart, fractionPart = ""] = significand.split(".");
  const digits = `${integerPart}${fractionPart}`;
  const decimalIndex = integerPart.length + exponent;

  if (decimalIndex <= 0) {
    return `0.${"0".repeat(Math.abs(decimalIndex))}${digits}`;
  }

  if (decimalIndex >= digits.length) {
    return `${digits}${"0".repeat(decimalIndex - digits.length)}`;
  }

  return `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

function toMoneyCents(value: number): number {
  assertValidMoneyValue(value);

  const [integerPart, fractionPart = ""] = expandExponentialDecimal(value).split(".");
  const centsPart = `${fractionPart}00`.slice(0, 2);
  const roundingDigit = Number(`${fractionPart}000`.charAt(2));
  const baseCents = Number(integerPart) * 100 + Number(centsPart);

  return roundingDigit >= 5 ? baseCents + 1 : baseCents;
}

function createSettlementRow(row: MonthlySummary["rows"][number], bonusAmount: number): MonthlySettlementRow {
  const isExcluded = row.coefficientTotal === null;

  return {
    staffId: row.staffId,
    staffName: row.staffName,
    staffType: row.staffType,
    attendanceShifts: row.attendanceShifts,
    coefficientTotal: row.coefficientTotal,
    coefficientExcludedReason: row.coefficientExcludedReason,
    bonusAmount,
    bonusExcludedReason: isExcluded ? row.coefficientExcludedReason : ""
  };
}

export function calculateBonusAllocation(monthlySummary: MonthlySummary, bonusPool: number): BonusAllocation {
  const poolCents = toMoneyCents(bonusPool);
  const roundedPool = poolCents / 100;
  const coefficientTotal = roundCurrency(
    monthlySummary.rows.reduce((total, row) => total + (row.coefficientTotal ?? 0), 0)
  );
  const positiveParticipantIndexes = monthlySummary.rows.reduce<number[]>((indexes, row, index) => {
    if ((row.coefficientTotal ?? 0) > 0) {
      indexes.push(index);
    }
    return indexes;
  }, []);

  if (coefficientTotal === 0) {
    return {
      canSettle: false,
      bonusPool: roundedPool,
      coefficientTotal,
      message: ZERO_COEFFICIENT_MESSAGE,
      rows: monthlySummary.rows.map((row) => createSettlementRow(row, 0))
    };
  }

  let distributedCents = 0;
  const lastPositiveIndex = positiveParticipantIndexes[positiveParticipantIndexes.length - 1];

  const rows = monthlySummary.rows.map((row, index) => {
    const coefficient = row.coefficientTotal ?? 0;
    let bonusAmount = 0;

    if (coefficient > 0) {
      const bonusCents =
        index === lastPositiveIndex
          ? poolCents - distributedCents
          : toMoneyCents((roundedPool * coefficient) / coefficientTotal);
      distributedCents += bonusCents;
      bonusAmount = bonusCents / 100;
    }

    return createSettlementRow(row, bonusAmount);
  });

  return {
    canSettle: true,
    bonusPool: roundedPool,
    coefficientTotal,
    message: "",
    rows
  };
}

export function createMonthlySettlement(input: CreateMonthlySettlementInput): MonthlySettlement {
  const allocation = calculateBonusAllocation(input.monthlySummary, input.bonusPool);

  if (!allocation.canSettle) {
    throw new Error(allocation.message);
  }

  return {
    id: `settlement-${input.month}`,
    month: input.month,
    monthStart: input.monthlySummary.monthStart,
    monthEnd: input.monthlySummary.monthEnd,
    totalDays: input.monthlySummary.totalDays,
    bonusPool: allocation.bonusPool,
    coefficientTotal: allocation.coefficientTotal,
    settledAt: input.settledAt,
    rows: allocation.rows
  };
}
