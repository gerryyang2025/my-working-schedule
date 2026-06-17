<script setup lang="ts">
import type { StaffType, WeeklyStaffSummary, WeeklySummary } from "@/types/domain";

defineProps<{
  summary: WeeklySummary;
}>();

function staffTypeLabel(type: StaffType): string {
  if (type === "head_nurse") {
    return "护士长";
  }

  if (type === "clerk") {
    return "文员";
  }

  return "护士";
}

function coefficientCellText(row: WeeklyStaffSummary): string {
  return row.coefficientTotal === null ? row.coefficientExcludedReason : row.coefficientTotal.toFixed(2);
}

function compactCoefficientText(row: WeeklyStaffSummary): string {
  return row.coefficientTotal === null ? "单独核算" : `系数 ${row.coefficientTotal.toFixed(2)}`;
}
</script>

<template>
  <section class="weekly-summary stats-panel">
    <header class="stats-panel-header">
      <h2>周统计</h2>
      <p>
        {{ summary.weekStart }} 至 {{ summary.weekEnd }} · 满勤 {{ summary.requiredShifts }} 个班次 · 节假日扣减
        {{ summary.holidayDeduction }} 个
      </p>
      <p v-if="summary.holidayNames.length" class="summary-note">节假日：{{ summary.holidayNames.join("、") }}</p>
      <p class="summary-note">护士长绩效系数单独核算，出勤和加班仍按相同排班规则统计。</p>
    </header>

    <table class="summary-table">
      <thead>
        <tr>
          <th>人员</th>
          <th>类型</th>
          <th>出勤班次</th>
          <th>满勤标准</th>
          <th>加班班次</th>
          <th>总系数</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in summary.rows" :key="row.staffId">
          <td data-label="人员">{{ row.staffName }}</td>
          <td data-label="类型">{{ staffTypeLabel(row.staffType) }}</td>
          <td data-label="出勤班次">{{ row.attendanceShifts }}</td>
          <td data-label="满勤标准">{{ row.requiredShifts }}</td>
          <td data-label="加班班次">{{ row.overtimeShifts }}</td>
          <td data-label="总系数">{{ coefficientCellText(row) }}</td>
        </tr>
      </tbody>
    </table>

    <div class="summary-compact-list">
      <div v-for="row in summary.rows" :key="`${row.staffId}-compact`" class="summary-compact-row">
        <div class="summary-compact-person">
          <strong>{{ row.staffName }}</strong>
          <span>{{ staffTypeLabel(row.staffType) }}</span>
        </div>
        <div class="summary-compact-metrics">
          <span>出勤 {{ row.attendanceShifts }}/{{ row.requiredShifts }}</span>
          <span>加班 {{ row.overtimeShifts }}</span>
          <span>{{ compactCoefficientText(row) }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
