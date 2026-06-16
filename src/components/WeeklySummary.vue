<script setup lang="ts">
import type { WeeklySummary } from "@/types/domain";

defineProps<{
  summary: WeeklySummary;
}>();
</script>

<template>
  <section class="weekly-summary">
    <header>
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
          <td data-label="类型">{{ row.staffType === "head_nurse" ? "护士长" : row.staffType === "clerk" ? "文员" : "护士" }}</td>
          <td data-label="出勤班次">{{ row.attendanceShifts }}</td>
          <td data-label="满勤标准">{{ row.requiredShifts }}</td>
          <td data-label="加班班次">{{ row.overtimeShifts }}</td>
          <td data-label="总系数">{{ row.coefficientTotal === null ? row.coefficientExcludedReason : row.coefficientTotal.toFixed(2) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
