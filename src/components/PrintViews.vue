<script setup lang="ts">
import { computed } from "vue";
import type { PublicAppData } from "@/api/client";
import type { CalendarDay } from "@/lib/date";
import type { WeeklySummary } from "@/types/domain";

const props = defineProps<{
  data: PublicAppData;
  days: CalendarDay[];
  summary: WeeklySummary;
}>();

const enabledStaff = computed(() =>
  [...props.data.staff].filter((staff) => staff.enabled).sort((left, right) => left.sortOrder - right.sortOrder)
);

const shiftShortNameById = computed(() => new Map(props.data.shifts.map((shift) => [shift.id, shift.shortName])));

const entryShiftNamesByCell = computed(() => {
  const cellMap = new Map<string, string>();
  const shortNameMap = shiftShortNameById.value;

  for (const entry of props.data.scheduleEntries) {
    const shiftNames = entry.shiftIds
      .map((shiftId) => shortNameMap.get(shiftId))
      .filter((shortName): shortName is string => Boolean(shortName));

    cellMap.set(`${entry.staffId}:${entry.date}`, shiftNames.join("/"));
  }

  return cellMap;
});

function getCellShiftNames(staffId: string, date: string): string {
  return entryShiftNamesByCell.value.get(`${staffId}:${date}`) ?? "";
}
</script>

<template>
  <section class="print-view print-month">
    <h1>国际医学部护理排班表</h1>
    <table class="print-table">
      <thead>
        <tr>
          <th>人员</th>
          <th v-for="day in days" :key="day.key">
            {{ day.dayOfMonth }}<br />{{ day.weekdayName }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="staff in enabledStaff" :key="staff.id">
          <th>{{ staff.name }}</th>
          <td v-for="day in days" :key="`${staff.id}-${day.key}`">
            {{ getCellShiftNames(staff.id, day.key) }}
          </td>
        </tr>
      </tbody>
    </table>
  </section>

  <section class="print-view print-week">
    <h1>国际医学部护理周统计表</h1>
    <p>
      {{ summary.weekStart }} 至 {{ summary.weekEnd }}；满勤 {{ summary.requiredShifts }} 个班次；节假日扣减
      {{ summary.holidayDeduction }} 个。
    </p>
    <p v-if="summary.holidayNames.length">节假日：{{ summary.holidayNames.join("、") }}</p>
    <table class="print-table">
      <thead>
        <tr>
          <th>人员</th>
          <th>出勤班次</th>
          <th>满勤标准</th>
          <th>加班班次</th>
          <th>总系数</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in summary.rows" :key="row.staffId">
          <td>{{ row.staffName }}</td>
          <td>{{ row.attendanceShifts }}</td>
          <td>{{ row.requiredShifts }}</td>
          <td>{{ row.overtimeShifts }}</td>
          <td>{{ row.coefficientTotal === null ? row.coefficientExcludedReason : row.coefficientTotal.toFixed(2) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
