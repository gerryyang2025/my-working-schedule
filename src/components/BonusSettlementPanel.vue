<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { calculateBonusAllocation, type BonusAllocation } from "@/lib/bonus";
import { formatSettledAt } from "@/lib/format";
import type { MonthlySettlement, MonthlySettlementRow, MonthlySummary, StaffType } from "@/types/domain";
import type { RangeSourceMonth } from "@/lib/range-bonus";

const INVALID_BONUS_POOL_MESSAGE = "奖金总额格式不正确";

const STAFF_TYPE_LABELS: Record<StaffType, string> = {
  nurse: "护士",
  clerk: "文员",
  head_nurse: "护士长"
};

const props = defineProps<{
  adminMode: boolean;
  canceling: boolean;
  month: string;
  monthlySummary: MonthlySummary;
  saving: boolean;
  settlement: MonthlySettlement | null;
  startMonth: string;
  endMonth: string;
  isRangeMode: boolean;
  isRangeValid: boolean;
  sourceMonths: RangeSourceMonth[];
}>();

const emit = defineEmits<{
  cancelSettlement: [month: string];
  confirmSettlement: [payload: { month: string; bonusPool: number }];
  "update:startMonth": [value: string];
  "update:endMonth": [value: string];
}>();

const bonusPoolText = ref("0");

const isSettled = computed(() => props.settlement !== null);
const isInvalidRange = computed(() => props.isRangeMode && !props.isRangeValid);
const panelTitle = computed(() =>
  props.isRangeMode ? `${props.startMonth} 至 ${props.endMonth}` : props.month
);
const statusText = computed(() => {
  if (isInvalidRange.value) {
    return "范围无效";
  }

  if (props.isRangeMode) {
    return "临时试算";
  }

  return props.settlement ? "已月结" : "未月结";
});
const bonusPoolInputValue = computed(() => (props.settlement ? formatMoney(props.settlement.bonusPool) : bonusPoolText.value));
const bonusPoolState = computed(() => parseBonusPool(bonusPoolText.value));
const settlementWarningId = computed(() => `bonus-settlement-warning-${props.month}`);
const previewAllocation = computed<BonusAllocation>(() => {
  if (!bonusPoolState.value.isValid) {
    return {
      canSettle: false,
      bonusPool: 0,
      coefficientTotal: 0,
      message: "",
      rows: createZeroBonusRows()
    };
  }

  return calculateBonusAllocation(props.monthlySummary, bonusPoolState.value.value);
});
const displayedRows = computed(() => props.settlement?.rows ?? previewAllocation.value.rows);
const displayedBonusPool = computed(() => props.settlement?.bonusPool ?? previewAllocation.value.bonusPool);
const displayedCoefficientTotal = computed(() => props.settlement?.coefficientTotal ?? previewAllocation.value.coefficientTotal);
const bonusPoolError = computed(() =>
  isInvalidRange.value || isSettled.value || bonusPoolState.value.isValid ? "" : INVALID_BONUS_POOL_MESSAGE
);
const allocationMessage = computed(() =>
  isInvalidRange.value || isSettled.value || bonusPoolError.value ? "" : previewAllocation.value.message
);
const bonusPoolInputDescribedBy = computed(() =>
  bonusPoolError.value || allocationMessage.value ? settlementWarningId.value : undefined
);
const canConfirm = computed(
  () =>
    props.adminMode &&
    !props.isRangeMode &&
    props.isRangeValid &&
    !isSettled.value &&
    !props.saving &&
    !props.canceling &&
    bonusPoolState.value.isValid &&
    previewAllocation.value.canSettle
);
const canCancel = computed(
  () => props.adminMode && !props.isRangeMode && props.isRangeValid && isSettled.value && !props.saving && !props.canceling
);

watch(
  () => props.month,
  () => {
    bonusPoolText.value = "0";
  }
);

function parseBonusPool(text: string): { isValid: boolean; value: number } {
  const normalizedText = text.trim();

  if (!normalizedText) {
    return { isValid: false, value: 0 };
  }

  const value = Number(normalizedText);

  return {
    isValid: Number.isFinite(value) && value >= 0,
    value
  };
}

function createZeroBonusRows(): MonthlySettlementRow[] {
  return props.monthlySummary.rows.map((row) => ({
    staffId: row.staffId,
    staffName: row.staffName,
    staffType: row.staffType,
    attendanceShifts: row.attendanceShifts,
    overtimeShifts: row.overtimeShifts,
    coefficientTotal: row.coefficientTotal,
    coefficientExcludedReason: row.coefficientExcludedReason,
    bonusAmount: 0,
    bonusExcludedReason: row.coefficientTotal === null ? row.coefficientExcludedReason : ""
  }));
}

function handleBonusPoolInput(event: Event): void {
  if (isSettled.value) {
    return;
  }

  bonusPoolText.value = event.target instanceof HTMLInputElement ? event.target.value : "";
}

function handleStartMonthInput(event: Event): void {
  emit("update:startMonth", event.target instanceof HTMLInputElement ? event.target.value : "");
}

function handleEndMonthInput(event: Event): void {
  emit("update:endMonth", event.target instanceof HTMLInputElement ? event.target.value : "");
}

function handleConfirm(): void {
  if (!canConfirm.value) {
    return;
  }

  emit("confirmSettlement", {
    month: props.month,
    bonusPool: previewAllocation.value.bonusPool
  });
}

function handleCancel(): void {
  if (!canCancel.value) {
    return;
  }

  emit("cancelSettlement", props.month);
}

function staffTypeLabel(type: StaffType): string {
  return STAFF_TYPE_LABELS[type];
}

function formatMoney(value: number): string {
  return value.toFixed(2);
}

function formatCoefficient(value: number): string {
  return value.toFixed(2);
}

function coefficientCellText(row: MonthlySettlementRow): string {
  return row.coefficientTotal === null ? "单独核算" : formatCoefficient(row.coefficientTotal);
}

function rowNote(row: MonthlySettlementRow): string {
  return row.bonusExcludedReason || row.coefficientExcludedReason;
}

</script>

<template>
  <section class="bonus-settlement-panel" aria-labelledby="bonus-settlement-title">
    <header class="bonus-panel-header">
      <div>
        <p class="bonus-panel-eyebrow">月结与奖金</p>
        <h2 id="bonus-settlement-title">{{ panelTitle }}</h2>
      </div>
      <span class="settlement-status" :class="{ settled: isSettled }">{{ statusText }}</span>
    </header>

    <div class="settlement-range-controls">
      <label>
        <span>开始月份</span>
        <input data-testid="bonus-start-month" type="month" :value="startMonth" @input="handleStartMonthInput" />
      </label>
      <label>
        <span>结束月份</span>
        <input data-testid="bonus-end-month" type="month" :value="endMonth" @input="handleEndMonthInput" />
      </label>
    </div>

    <p v-if="isRangeMode && !isRangeValid" data-testid="bonus-range-error" class="settlement-warning" role="alert">
      月份范围不正确，请调整开始月份和结束月份。
    </p>

    <p v-else-if="isRangeMode" class="settlement-range-notice">
      临时试算，不会保存或锁定排班。
      <span v-for="item in sourceMonths" :key="item.month">
        {{ item.month }} 使用{{ item.source === "settlement" ? "月结快照" : "实时排班" }}
      </span>
    </p>

    <div v-if="!isRangeMode || isRangeValid" class="settlement-meta">
      <div class="settlement-meta-item">
        <span>奖金总额</span>
        <strong>{{ formatMoney(displayedBonusPool) }}</strong>
      </div>
      <div class="settlement-meta-item">
        <span>普通人员总系数</span>
        <strong>{{ formatCoefficient(displayedCoefficientTotal) }}</strong>
      </div>
      <div v-if="settlement" class="settlement-meta-item">
        <span>月结时间</span>
        <strong>{{ formatSettledAt(settlement.settledAt) }}</strong>
      </div>
    </div>

    <div v-if="!isInvalidRange" class="settlement-controls">
      <label class="bonus-pool-field">
        <span>奖金总额</span>
        <input
          data-testid="bonus-pool-input"
          :value="bonusPoolInputValue"
          type="number"
          inputmode="decimal"
          min="0"
          step="0.01"
          :disabled="isSettled || saving || canceling"
          :aria-describedby="bonusPoolInputDescribedBy"
          :aria-invalid="Boolean(bonusPoolError)"
          @input="handleBonusPoolInput"
        />
      </label>
      <div v-if="!isRangeMode" class="settlement-actions">
        <button
          data-testid="confirm-settlement-button"
          type="button"
          class="primary-action"
          :disabled="!canConfirm"
          @click="handleConfirm"
        >
          {{ saving ? "确认中" : "确认月结" }}
        </button>
        <button data-testid="cancel-settlement-button" type="button" :disabled="!canCancel" @click="handleCancel">
          {{ canceling ? "取消中" : "取消月结" }}
        </button>
      </div>
    </div>

    <p v-if="bonusPoolError" :id="settlementWarningId" class="settlement-warning" role="alert">
      {{ bonusPoolError }}
    </p>
    <p v-if="allocationMessage" :id="settlementWarningId" class="settlement-warning" role="alert">
      {{ allocationMessage }}
    </p>

    <div v-if="!isRangeMode || isRangeValid" class="bonus-table-wrap">
      <table class="bonus-table">
        <thead>
          <tr>
            <th>人员</th>
            <th>类型</th>
            <th>出勤班次</th>
            <th>累计加班班次</th>
            <th>月总系数</th>
            <th>分配金额</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in displayedRows" :key="row.staffId">
            <td data-label="人员">{{ row.staffName }}</td>
            <td data-label="类型">{{ staffTypeLabel(row.staffType) }}</td>
            <td data-label="出勤班次">{{ row.attendanceShifts }}</td>
            <td data-label="累计加班班次">{{ row.overtimeShifts }}</td>
            <td data-label="月总系数">{{ coefficientCellText(row) }}</td>
            <td data-label="分配金额">{{ formatMoney(row.bonusAmount) }}</td>
            <td data-label="备注">{{ rowNote(row) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.bonus-settlement-panel {
  grid-column: 1 / -1;
  border: 1px solid #dbe3ef;
  background: #ffffff;
  padding: 12px;
}

.bonus-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.bonus-panel-eyebrow {
  margin: 0 0 2px;
  color: #2563eb;
  font-size: 13px;
  font-weight: 600;
}

.bonus-panel-header h2 {
  margin: 0;
  color: #0f172a;
  font-size: 16px;
}

.settlement-status {
  flex: 0 0 auto;
  border: 1px solid #fde68a;
  background: #fffbeb;
  color: #92400e;
  padding: 4px 8px;
  font-size: 13px;
  font-weight: 600;
}

.settlement-status.settled {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #166534;
}

.settlement-range-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}

.settlement-range-controls label {
  display: grid;
  gap: 4px;
  min-width: 180px;
}

.settlement-range-controls span {
  color: #475569;
  font-size: 13px;
}

.settlement-range-controls input {
  height: 32px;
  border: 1px solid #cbd5e1;
  padding: 4px 8px;
  color: #0f172a;
  font: inherit;
}

.settlement-range-notice {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 10px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1e40af;
  padding: 7px 8px;
  font-size: 13px;
}

.settlement-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}

.settlement-meta-item {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 8px;
}

.settlement-meta-item span {
  display: block;
  color: #64748b;
  font-size: 12px;
  white-space: nowrap;
}

.settlement-meta-item strong {
  display: block;
  margin-top: 2px;
  color: #0f172a;
  font-size: 14px;
  white-space: nowrap;
}

.settlement-controls {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.bonus-pool-field {
  display: grid;
  gap: 4px;
  min-width: 220px;
}

.bonus-pool-field span {
  color: #475569;
  font-size: 13px;
}

.bonus-pool-field input {
  height: 32px;
  border: 1px solid #cbd5e1;
  padding: 4px 8px;
  color: #0f172a;
  font: inherit;
}

.bonus-pool-field input:disabled {
  background: #f8fafc;
  color: #64748b;
}

.settlement-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.settlement-actions button {
  height: 32px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #1f2937;
  padding: 0 12px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.settlement-actions button.primary-action {
  border-color: #2563eb;
  background: #2563eb;
  color: #ffffff;
}

.settlement-actions button:disabled {
  border-color: #dbe3ef;
  background: #f1f5f9;
  color: #94a3b8;
  cursor: not-allowed;
}

.settlement-warning {
  margin: 0 0 8px;
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #b91c1c;
  padding: 7px 8px;
  font-size: 13px;
}

.bonus-table-wrap {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.bonus-table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
  font-size: 13px;
}

.bonus-table th,
.bonus-table td {
  border: 1px solid #e2e8f0;
  padding: 8px;
  text-align: center;
  white-space: nowrap;
}

.bonus-table th {
  background: #f8fafc;
  color: #0f172a;
  font-weight: 700;
}

.bonus-table td:last-child {
  text-align: left;
}

@media (max-width: 768px) {
  .bonus-settlement-panel {
    margin-top: 10px;
    padding: 10px;
  }

  .bonus-panel-header,
  .settlement-range-controls,
  .settlement-controls {
    align-items: stretch;
    flex-direction: column;
  }

  .settlement-meta {
    grid-template-columns: 1fr;
  }

  .bonus-pool-field {
    min-width: 0;
  }

  .settlement-range-controls label {
    min-width: 0;
  }

  .settlement-actions {
    justify-content: flex-start;
  }
}
</style>
