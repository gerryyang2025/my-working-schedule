import type { MonthlySettlement, MonthlySettlementRow, MonthlySummary } from "@/types/domain";

const ZERO_COEFFICIENT_MESSAGE = "普通人员月总系数合计为 0，无法按系数分配奖金";
const INVALID_BONUS_POOL_MESSAGE = "奖金总额格式不正确";

export interface BonusAllocation {
  canSettle: boolean;
  bonusPool: number;
  coefficientTotal: number;
  rows: MonthlySettlementRow[];
  message?: string;
}

interface CreateMonthlySettlementInput {
  month: string;
  monthlySummary: MonthlySummary;
  bonusPool: number;
  settledAt: string;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

function assertValidBonusPool(bonusPool: number): void {
  if (!Number.isFinite(bonusPool) || bonusPool < 0) {
    throw new Error(INVALID_BONUS_POOL_MESSAGE);
  }
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
  assertValidBonusPool(bonusPool);

  const roundedPool = roundCurrency(bonusPool);
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

  const poolCents = toCents(roundedPool);
  let distributedCents = 0;
  const lastPositiveIndex = positiveParticipantIndexes[positiveParticipantIndexes.length - 1];

  const rows = monthlySummary.rows.map((row, index) => {
    const coefficient = row.coefficientTotal ?? 0;
    let bonusAmount = 0;

    if (coefficient > 0) {
      const bonusCents =
        index === lastPositiveIndex ? poolCents - distributedCents : toCents((roundedPool * coefficient) / coefficientTotal);
      distributedCents += bonusCents;
      bonusAmount = bonusCents / 100;
    }

    return createSettlementRow(row, bonusAmount);
  });

  return {
    canSettle: true,
    bonusPool: roundedPool,
    coefficientTotal,
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
