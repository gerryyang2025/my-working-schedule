<script setup lang="ts">
import { computed } from "vue";
import type { StaffType, WeeklyStaffSummary, WeeklySummary } from "@/types/domain";

const props = defineProps<{
  summary: WeeklySummary;
}>();

const personColumnStyle = computed(() => {
  const longestNameUnits = Math.max(2, ...props.summary.rows.map((row) => measureDisplayUnits(row.staffName)));
  const desktopWidth = clamp(Math.ceil(longestNameUnits * 12 + 40), 64, 112);
  const mobileWidth = clamp(Math.ceil(longestNameUnits * 12 + 34), 56, 92);

  return {
    "--summary-person-col-width": `${desktopWidth}px`,
    "--summary-person-col-mobile-width": `${mobileWidth}px`
  };
});

function measureDisplayUnits(text: string): number {
  return [...text].reduce((total, char) => total + (char.charCodeAt(0) <= 0x7f ? 0.55 : 1), 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

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

function formatSignedBalance(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}
</script>

<template>
  <section class="weekly-summary stats-panel" :style="personColumnStyle">
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
          <th>工号</th>
          <th>类型</th>
          <th>出勤班次</th>
          <th>满勤标准</th>
          <th>出勤盈亏</th>
          <th>加班班次</th>
          <th>总系数</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in summary.rows" :key="row.staffId">
          <td data-label="人员">
            <span class="summary-person">
              <strong>{{ row.staffName }}</strong>
            </span>
          </td>
          <td data-label="工号">{{ row.staffJobId }}</td>
          <td data-label="类型">{{ staffTypeLabel(row.staffType) }}</td>
          <td data-label="出勤班次">{{ row.attendanceShifts }}</td>
          <td data-label="满勤标准">{{ row.requiredShifts }}</td>
          <td data-label="出勤盈亏">{{ formatSignedBalance(row.attendanceBalance) }}</td>
          <td data-label="加班班次">{{ row.overtimeShifts }}</td>
          <td data-label="总系数">{{ coefficientCellText(row) }}</td>
        </tr>
      </tbody>
    </table>

    <div class="summary-compact-list">
      <div v-for="row in summary.rows" :key="`${row.staffId}-compact`" class="summary-compact-row">
        <div class="summary-compact-person">
          <span class="summary-person">
            <strong>{{ row.staffName }}</strong>
            <small>{{ row.staffJobId }}</small>
          </span>
          <span class="summary-person-type">{{ staffTypeLabel(row.staffType) }}</span>
        </div>
        <div class="summary-compact-metrics">
          <span>出勤 {{ row.attendanceShifts }}/{{ row.requiredShifts }}</span>
          <span>盈亏 {{ formatSignedBalance(row.attendanceBalance) }}</span>
          <span>加班 {{ row.overtimeShifts }}</span>
          <span>{{ compactCoefficientText(row) }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
