import type { MonthlySettlement, MonthlySettlementRow, MonthlySummary } from "@/types/domain";

const ZERO_COEFFICIENT_MESSAGE = "护士与文员月总系数合计为 0，无法按系数分配奖金";
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

  return toTwoDecimalUnits(value);
}

function toTwoDecimalUnits(value: number): number {
  const scale = 100;

  const [integerPart, fractionPart = ""] = expandExponentialDecimal(value).split(".");
  const centsPart = `${fractionPart}00`.slice(0, 2);
  const roundingDigit = Number(`${fractionPart}000`.charAt(2));
  const baseCents = Number(integerPart) * scale + Number(centsPart);

  return roundingDigit >= 5 ? baseCents + 1 : baseCents;
}

function divideHalfUp(numerator: number, denominator: number): number {
  return Math.floor((numerator * 2 + denominator) / (2 * denominator));
}

function correctRoundedShares(roundedShares: number[], poolCents: number): number[] {
  const correctedShares = [...roundedShares];
  let correction = poolCents - correctedShares.reduce((total, share) => total + share, 0);

  if (correction > 0) {
    correctedShares[correctedShares.length - 1] += correction;
    return correctedShares;
  }

  for (let index = correctedShares.length - 1; correction < 0 && index >= 0; index -= 1) {
    const removableCents = Math.min(correctedShares[index], Math.abs(correction));
    correctedShares[index] -= removableCents;
    correction += removableCents;
  }

  return correctedShares;
}

function createSettlementRow(row: MonthlySummary["rows"][number], bonusAmount: number): MonthlySettlementRow {
  const isExcluded = row.coefficientTotal === null;

  return {
    staffId: row.staffId,
    staffName: row.staffName,
    staffJobId: row.staffJobId,
    staffType: row.staffType,
    attendanceShifts: row.attendanceShifts,
    requiredShifts: row.requiredShifts,
    attendanceBalance: row.attendanceBalance,
    overtimeShifts: row.overtimeShifts,
    coefficientTotal: row.coefficientTotal,
    coefficientExcludedReason: row.coefficientExcludedReason,
    bonusAmount,
    bonusExcludedReason: isExcluded ? row.coefficientExcludedReason : ""
  };
}

export function calculateBonusAllocation(monthlySummary: MonthlySummary, bonusPool: number): BonusAllocation {
  const poolCents = toMoneyCents(bonusPool);
  const roundedPool = poolCents / 100;
  const coefficientUnitsByRow = monthlySummary.rows.map((row) => toTwoDecimalUnits(row.coefficientTotal ?? 0));
  const totalCoefficientUnits = coefficientUnitsByRow.reduce((total, units) => total + units, 0);
  const coefficientTotal = totalCoefficientUnits / 100;
  const positiveParticipantIndexes = coefficientUnitsByRow.reduce<number[]>((indexes, units, index) => {
    if (units > 0) {
      indexes.push(index);
    }
    return indexes;
  }, []);

  if (totalCoefficientUnits === 0) {
    return {
      canSettle: false,
      bonusPool: roundedPool,
      coefficientTotal,
      message: ZERO_COEFFICIENT_MESSAGE,
      rows: monthlySummary.rows.map((row) => createSettlementRow(row, 0))
    };
  }

  const roundedShares = positiveParticipantIndexes.map((index) =>
    divideHalfUp(poolCents * coefficientUnitsByRow[index], totalCoefficientUnits)
  );
  const correctedShares = correctRoundedShares(roundedShares, poolCents);
  const bonusCentsByRowIndex = new Map(
    positiveParticipantIndexes.map((rowIndex, shareIndex) => [rowIndex, correctedShares[shareIndex]])
  );

  const rows = monthlySummary.rows.map((row, index) => {
    const bonusCents = bonusCentsByRowIndex.get(index) ?? 0;
    const bonusAmount = bonusCents / 100;

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
