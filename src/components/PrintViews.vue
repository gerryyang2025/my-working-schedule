<script setup lang="ts">
import { computed } from "vue";
import type { PublicAppData } from "@/api/client";
import { listDateKeys, parseDateKey } from "@/lib/date";
import type { CalendarDay } from "@/lib/date";
import { formatSettledAt } from "@/lib/format";
import type {
  MonthlySettlement,
  MonthlySettlementRow,
  MonthlyStaffSummary,
  MonthlySummary,
  StaffType,
  WeeklySummary
} from "@/types/domain";

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

type PrintedMonthlyRow = MonthlyStaffSummary | MonthlySettlementRow;

const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const STAFF_TYPE_LABELS: Record<StaffType, string> = {
  nurse: "护士",
  clerk: "文员",
  head_nurse: "护士长"
};

const props = defineProps<{
  data: PublicAppData;
  days: CalendarDay[];
  summary: WeeklySummary;
  monthlySettlement?: MonthlySettlement | null;
  monthlySummary?: MonthlySummary | null;
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
const staffById = computed(() => new Map(props.data.staff.map((staff) => [staff.id, staff])));
const monthStart = computed(() => props.days[0]?.key ?? "");
const monthEnd = computed(() => props.days[props.days.length - 1]?.key ?? "");
const monthHolidays = computed(() =>
  props.data.holidays
    .filter((holiday) => printedDayKeys.value.has(holiday.date))
    .sort((left, right) => left.date.localeCompare(right.date))
);
const printedMonthlyRows = computed<PrintedMonthlyRow[]>(
  () => props.monthlySettlement?.rows ?? props.monthlySummary?.rows ?? []
);
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

function getStaffTypeLabel(staffType: StaffType): string {
  return STAFF_TYPE_LABELS[staffType];
}

function getStaffSortOrder(staffId: string): string {
  const sortOrder = staffById.value.get(staffId)?.sortOrder;
  return typeof sortOrder === "number" ? String(sortOrder) : "";
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

function getMonthlyCoefficientText(row: PrintedMonthlyRow): string {
  return row.coefficientTotal === null ? "单独核算" : row.coefficientTotal.toFixed(2);
}

function getBonusNote(row: MonthlySettlementRow): string {
  return row.bonusExcludedReason || row.coefficientExcludedReason;
}

function isDisabledMonthlyStaff(row: PrintedMonthlyRow): boolean {
  return staffById.value.get(row.staffId)?.enabled === false;
}
</script>

<template>
  <section class="print-view print-month" :class="{ 'print-preview-active': previewMode === 'month' }">
    <section class="print-pdf-page print-pdf-schedule-page">
      <h1>国际医学部护理月排班表</h1>
      <p>
        {{ monthStart }} 至 {{ monthEnd }}；共 {{ days.length }} 天；节假日 {{ monthHolidays.length }} 个。
      </p>
      <p v-if="monthHolidays.length">
        节假日：{{ monthHolidays.map((holiday) => `${holiday.date} ${holiday.name}`).join("、") }}
      </p>
      <table class="print-table print-month-detail-table">
        <thead>
          <tr>
            <th class="print-sort-col">排序ID</th>
            <th class="print-person-col">人员</th>
            <th class="print-type-col">类型</th>
            <th v-for="day in days" :key="day.key" class="print-day-col">
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
            <th class="print-sort-col">{{ staff.sortOrder }}</th>
            <th class="print-person-col">
              <span class="print-person">
                <strong>{{ staff.name }}</strong>
                <small>{{ staff.jobId }}</small>
              </span>
              <span v-if="!staff.enabled" class="historical-staff-label">停用历史</span>
            </th>
            <td class="print-type-col">{{ getStaffTypeLabel(staff.type) }}</td>
            <td v-for="day in days" :key="`${staff.id}-${day.key}`" class="print-day-col">
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

    <section v-if="monthlySummary || monthlySettlement" class="print-pdf-page print-month-summary">
      <h2>月度汇总</h2>
      <table class="print-table print-summary-table">
        <thead>
          <tr>
            <th>人员</th>
            <th>人员类型</th>
            <th>月出勤班次</th>
            <th>满勤标准</th>
            <th>出勤盈亏</th>
            <th>累计加班班次</th>
            <th>月总系数</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in printedMonthlyRows" :key="row.staffId">
            <td>
              <span class="print-person">
                <strong>{{ row.staffName }}</strong>
                <small>{{ row.staffJobId }}</small>
              </span>
              <span v-if="isDisabledMonthlyStaff(row)" class="historical-staff-label">停用历史</span>
            </td>
            <td>{{ getStaffTypeLabel(row.staffType) }}</td>
            <td>{{ row.attendanceShifts }}</td>
            <td>{{ row.requiredShifts }}</td>
            <td>{{ formatSignedBalance(row.attendanceBalance) }}</td>
            <td>{{ row.overtimeShifts }}</td>
            <td>{{ getMonthlyCoefficientText(row) }}</td>
            <td>{{ row.coefficientExcludedReason }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="monthlySettlement" class="print-pdf-page print-bonus-summary">
      <h2>奖金分配</h2>
      <div class="print-bonus-meta">
        <p>奖金总额 {{ formatMoney(monthlySettlement.bonusPool) }}</p>
        <p>护士与文员总系数 {{ formatCoefficient(monthlySettlement.coefficientTotal) }}</p>
        <p>月结时间 {{ formatSettledAt(monthlySettlement.settledAt) }}</p>
      </div>
      <table class="print-table print-summary-table">
        <thead>
          <tr>
            <th>人员</th>
            <th>人员类型</th>
            <th>月出勤班次</th>
            <th>满勤标准</th>
            <th>出勤盈亏</th>
            <th>累计加班班次</th>
            <th>月总系数</th>
            <th>分配金额</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in monthlySettlement.rows" :key="row.staffId">
            <td>
              <span class="print-person">
                <strong>{{ row.staffName }}</strong>
                <small>{{ row.staffJobId }}</small>
              </span>
            </td>
            <td>{{ getStaffTypeLabel(row.staffType) }}</td>
            <td>{{ row.attendanceShifts }}</td>
            <td>{{ row.requiredShifts }}</td>
            <td>{{ formatSignedBalance(row.attendanceBalance) }}</td>
            <td>{{ row.overtimeShifts }}</td>
            <td>{{ getMonthlyCoefficientText(row) }}</td>
            <td>{{ formatMoney(row.bonusAmount) }}</td>
            <td>{{ getBonusNote(row) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>

  <section class="print-view print-week" :class="{ 'print-preview-active': previewMode === 'week' }">
    <section class="print-pdf-page print-pdf-schedule-page">
      <h1>国际医学部护理周统计表</h1>
      <p>
        {{ summary.weekStart }} 至 {{ summary.weekEnd }}；满勤 {{ summary.requiredShifts }} 个班次；节假日扣减
        {{ summary.holidayDeduction }} 个。
      </p>
      <p v-if="summary.holidayNames.length">节假日：{{ summary.holidayNames.join("、") }}</p>

      <section class="print-week-detail">
        <h2>周排班明细</h2>
        <table class="print-table print-week-detail-table">
          <thead>
            <tr>
              <th class="print-sort-col">排序ID</th>
              <th class="print-person-col">人员</th>
              <th class="print-type-col">类型</th>
              <th v-for="day in weekDays" :key="day.key" class="print-day-col">
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
              <th class="print-sort-col">{{ getStaffSortOrder(row.staffId) }}</th>
              <th class="print-person-col">
                <span class="print-person">
                  <strong>{{ row.staffName }}</strong>
                  <small>{{ row.staffJobId }}</small>
                </span>
              </th>
              <td class="print-type-col">{{ getStaffTypeLabel(row.staffType) }}</td>
              <td v-for="day in weekDays" :key="`${row.staffId}-${day.key}`" class="print-day-col">
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
    </section>

    <section class="print-pdf-page print-week-summary">
      <h2>周统计汇总</h2>
      <table class="print-table">
        <thead>
          <tr>
            <th>人员</th>
            <th>出勤班次</th>
            <th>满勤标准</th>
            <th>出勤盈亏</th>
            <th>加班班次</th>
            <th>总系数</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in summary.rows" :key="row.staffId">
            <td>
              <span class="print-person">
                <strong>{{ row.staffName }}</strong>
                <small>{{ row.staffJobId }}</small>
              </span>
            </td>
            <td>{{ row.attendanceShifts }}</td>
            <td>{{ row.requiredShifts }}</td>
            <td>{{ formatSignedBalance(row.attendanceBalance) }}</td>
            <td>{{ row.overtimeShifts }}</td>
            <td>{{ row.coefficientTotal === null ? row.coefficientExcludedReason : row.coefficientTotal.toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>
</template>

<style scoped>
.print-week-summary .print-table,
.print-month-summary .print-table,
.print-bonus-summary .print-table {
  width: 100%;
  min-width: 100%;
  border-collapse: collapse;
  table-layout: auto;
}

.print-week-summary .print-table th:first-child,
.print-week-summary .print-table td:first-child,
.print-month-summary .print-table th:first-child,
.print-month-summary .print-table td:first-child,
.print-bonus-summary .print-table th:first-child,
.print-bonus-summary .print-table td:first-child {
  width: auto;
}

.print-week-summary h2,
.print-month-summary h2,
.print-bonus-summary h2 {
  margin: 0 0 8px;
  font-size: 14px;
}

.print-bonus-summary {
  margin-top: 12px;
}

.print-bonus-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 16px;
  margin-bottom: 8px;
  color: #334155;
  font-size: 12px;
}

.print-bonus-meta p {
  margin: 0;
}

@media print {
  .print-week-summary,
  .print-month-summary,
  .print-bonus-summary {
    margin: 8px 0 10px;
  }

  .print-week-summary h2,
  .print-month-summary h2,
  .print-bonus-summary h2 {
    margin: 0 0 6px;
    font-size: 13px;
  }
}
</style>
