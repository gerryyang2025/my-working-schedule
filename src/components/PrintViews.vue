<script setup lang="ts">
import { computed } from "vue";
import type { PublicAppData } from "@/api/client";
import { listDateKeys, parseDateKey } from "@/lib/date";
import type { CalendarDay } from "@/lib/date";
import type { WeeklySummary } from "@/types/domain";

interface PrintShiftMarker {
  id: string;
  shortName: string;
  color: string;
}

interface PrintWeekDay {
  key: string;
  dayOfMonth: number;
  weekdayName: string;
}

const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const props = defineProps<{
  data: PublicAppData;
  days: CalendarDay[];
  summary: WeeklySummary;
  previewMode?: "month" | "week" | null;
}>();

const printedDayKeys = computed(() => new Set(props.days.map((day) => day.key)));
const staffWithPrintedEntries = computed(
  () =>
    new Set(
      props.data.scheduleEntries.filter((entry) => printedDayKeys.value.has(entry.date)).map((entry) => entry.staffId)
    )
);
const printedStaff = computed(() =>
  [...props.data.staff]
    .filter((staff) => staff.enabled || staffWithPrintedEntries.value.has(staff.id))
    .sort((left, right) => left.sortOrder - right.sortOrder)
);

const holidayByDate = computed(() => new Map(props.data.holidays.map((holiday) => [holiday.date, holiday])));
const shiftById = computed(() => new Map(props.data.shifts.map((shift) => [shift.id, shift])));
const weekDays = computed<PrintWeekDay[]>(() =>
  listDateKeys(props.summary.weekStart, props.summary.weekEnd).map((key) => {
    const date = parseDateKey(key);
    return {
      key,
      dayOfMonth: date.getDate(),
      weekdayName: WEEKDAY_NAMES[date.getDay()]
    };
  })
);

const entryShiftsByCell = computed(() => {
  const cellMap = new Map<string, PrintShiftMarker[]>();
  const shiftMap = shiftById.value;

  for (const entry of props.data.scheduleEntries) {
    const shifts = entry.shiftIds
      .map((shiftId) => shiftMap.get(shiftId))
      .filter((shift): shift is NonNullable<typeof shift> => Boolean(shift?.enabled))
      .slice(0, 2)
      .map((shift) => ({
        id: shift.id,
        shortName: shift.shortName,
        color: shift.color
      }));

    cellMap.set(`${entry.staffId}:${entry.date}`, shifts);
  }

  return cellMap;
});

function getHolidayName(date: string): string {
  return holidayByDate.value.get(date)?.name ?? "";
}

function getCellShifts(staffId: string, date: string): PrintShiftMarker[] {
  return entryShiftsByCell.value.get(`${staffId}:${date}`) ?? [];
}
</script>

<template>
  <section class="print-view print-month" :class="{ 'print-preview-active': previewMode === 'month' }">
    <h1>国际医学部护理排班表</h1>
    <table class="print-table">
      <thead>
        <tr>
          <th>人员</th>
          <th v-for="day in days" :key="day.key">
            <span class="print-day-heading">
              <span>{{ day.dayOfMonth }}</span>
              <span>{{ day.weekdayName }}</span>
              <span v-if="getHolidayName(day.key)" class="print-holiday-name">{{ getHolidayName(day.key) }}</span>
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="staff in printedStaff" :key="staff.id" :class="{ 'disabled-historical-row': !staff.enabled }">
          <th>
            <span>{{ staff.name }}</span>
            <span v-if="!staff.enabled" class="historical-staff-label">停用历史</span>
          </th>
          <td v-for="day in days" :key="`${staff.id}-${day.key}`">
            <span class="print-cell-shifts">
              <span
                v-for="shift in getCellShifts(staff.id, day.key)"
                :key="shift.id"
                class="print-shift-chip"
                :style="{ color: shift.color, borderColor: shift.color }"
              >
                {{ shift.shortName }}
              </span>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </section>

  <section class="print-view print-week" :class="{ 'print-preview-active': previewMode === 'week' }">
    <h1>国际医学部护理周统计表</h1>
    <p>
      {{ summary.weekStart }} 至 {{ summary.weekEnd }}；满勤 {{ summary.requiredShifts }} 个班次；节假日扣减
      {{ summary.holidayDeduction }} 个。
    </p>
    <p v-if="summary.holidayNames.length">节假日：{{ summary.holidayNames.join("、") }}</p>

    <section class="print-week-detail">
      <h2>周排班明细</h2>
      <table class="print-table">
        <thead>
          <tr>
            <th>人员</th>
            <th v-for="day in weekDays" :key="day.key">
              <span class="print-day-heading">
                <span>{{ day.dayOfMonth }}</span>
                <span>{{ day.weekdayName }}</span>
                <span v-if="getHolidayName(day.key)" class="print-holiday-name">{{ getHolidayName(day.key) }}</span>
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in summary.rows" :key="row.staffId">
            <th>{{ row.staffName }}</th>
            <td v-for="day in weekDays" :key="`${row.staffId}-${day.key}`">
              <span class="print-cell-shifts">
                <span
                  v-for="shift in getCellShifts(row.staffId, day.key)"
                  :key="shift.id"
                  class="print-shift-chip"
                  :style="{ color: shift.color, borderColor: shift.color }"
                >
                  {{ shift.shortName }}
                </span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

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
