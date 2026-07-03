<script setup lang="ts">
import { computed, onBeforeUnmount } from "vue";
import type { CalendarDay } from "@/lib/date";
import type { Holiday, ScheduleEntry, Shift, StaffMember, StaffType } from "@/types/domain";

type ScheduleDisplayDensity = "standard" | "compact";

const props = withDefaults(
  defineProps<{
    staff: StaffMember[];
    days: CalendarDay[];
    holidays: Holiday[];
    shifts: Shift[];
    entries: ScheduleEntry[];
    selectedShiftId: string;
    editableStaffIds: string[];
    canReorderStaff?: boolean;
    selectedStaffId?: string;
    displayDensity?: ScheduleDisplayDensity;
    showTypeColumn?: boolean;
  }>(),
  { canReorderStaff: false, selectedStaffId: "", displayDensity: "standard", showTypeColumn: true }
);

const emit = defineEmits<{
  quickFill: [staffId: string, date: string];
  editCell: [staffId: string, date: string];
  reorderStaff: [staffIds: string[]];
  swapSchedule: [direction: "up" | "down"];
  selectStaff: [staffId: string];
}>();

const STAFF_TYPE_LABELS: Record<StaffType, string> = {
  head_nurse: "护士长",
  nurse: "护士",
  clerk: "文员"
};

const SORT_COLUMN_WIDTH = 52;
const JOB_COLUMN_WIDTH = 58;
const TYPE_COLUMN_WIDTH = 48;
const DAY_COLUMN_WIDTH = 104;
const DAY_COLUMN_COMPACT_WIDTH = 88;
const SORT_COLUMN_MOBILE_WIDTH = 48;
const JOB_COLUMN_MOBILE_WIDTH = 54;
const TYPE_COLUMN_MOBILE_WIDTH = 44;
const DAY_COLUMN_MOBILE_WIDTH = 68;
const DAY_COLUMN_COMPACT_MOBILE_WIDTH = 62;

const holidayMap = computed(() => new Map(props.holidays.map((holiday) => [holiday.date, holiday])));
const shiftMap = computed(() => new Map(props.shifts.map((shift) => [shift.id, shift])));
const entryMap = computed(() => new Map(props.entries.map((entry) => [`${entry.date}__${entry.staffId}`, entry])));
const editableStaffIdSet = computed(() => new Set(props.editableStaffIds));
const visibleDayKeys = computed(() => new Set(props.days.map((day) => day.key)));
const staffWithVisibleEntries = computed(
  () => new Set(props.entries.filter((entry) => visibleDayKeys.value.has(entry.date)).map((entry) => entry.staffId))
);
const sortedStaff = computed(() =>
  props.staff
    .filter((item) => item.enabled || staffWithVisibleEntries.value.has(item.id))
    .sort((left, right) => left.sortOrder - right.sortOrder)
);
const showStaffReorderControls = computed(() => props.canReorderStaff && sortedStaff.value.length > 1);
const dayColumnWidth = computed(() => (props.displayDensity === "compact" ? DAY_COLUMN_COMPACT_WIDTH : DAY_COLUMN_WIDTH));
const dayColumnMobileWidth = computed(() =>
  props.displayDensity === "compact" ? DAY_COLUMN_COMPACT_MOBILE_WIDTH : DAY_COLUMN_MOBILE_WIDTH
);
const personColumnStyle = computed(() => {
  const longestNameUnits = Math.max(2, ...sortedStaff.value.map((person) => measureDisplayUnits(person.name)));
  const personColumnWidth = clamp(Math.ceil(longestNameUnits * 12 + 40), 64, 104);
  const personColumnMobileWidth = clamp(Math.ceil(longestNameUnits * 12 + 32), 56, 88);
  const jobColumnLeft = SORT_COLUMN_WIDTH + personColumnWidth;
  const typeColumnLeft = jobColumnLeft + JOB_COLUMN_WIDTH;
  const jobColumnMobileLeft = SORT_COLUMN_MOBILE_WIDTH + personColumnMobileWidth;
  const typeColumnMobileLeft = jobColumnMobileLeft + JOB_COLUMN_MOBILE_WIDTH;
  const fixedColumnWidth = props.showTypeColumn ? typeColumnLeft + TYPE_COLUMN_WIDTH : typeColumnLeft;
  const fixedColumnMobileWidth = props.showTypeColumn
    ? typeColumnMobileLeft + TYPE_COLUMN_MOBILE_WIDTH
    : typeColumnMobileLeft;
  const scheduleGridMinWidth = fixedColumnWidth + props.days.length * dayColumnWidth.value;
  const scheduleGridMobileMinWidth =
    fixedColumnMobileWidth + props.days.length * dayColumnMobileWidth.value;

  return {
    "--sort-col-width": `${SORT_COLUMN_WIDTH}px`,
    "--person-col-width": `${personColumnWidth}px`,
    "--job-col-width": `${JOB_COLUMN_WIDTH}px`,
    "--type-col-width": `${TYPE_COLUMN_WIDTH}px`,
    "--day-col-width": `${dayColumnWidth.value}px`,
    "--person-col-left": `${SORT_COLUMN_WIDTH}px`,
    "--job-col-left": `${jobColumnLeft}px`,
    "--type-col-left": `${typeColumnLeft}px`,
    "--schedule-grid-min-width": `${scheduleGridMinWidth}px`,
    "--sort-col-mobile-width": `${SORT_COLUMN_MOBILE_WIDTH}px`,
    "--person-col-mobile-width": `${personColumnMobileWidth}px`,
    "--job-col-mobile-width": `${JOB_COLUMN_MOBILE_WIDTH}px`,
    "--type-col-mobile-width": `${TYPE_COLUMN_MOBILE_WIDTH}px`,
    "--day-col-mobile-width": `${dayColumnMobileWidth.value}px`,
    "--person-col-mobile-left": `${SORT_COLUMN_MOBILE_WIDTH}px`,
    "--job-col-mobile-left": `${jobColumnMobileLeft}px`,
    "--type-col-mobile-left": `${typeColumnMobileLeft}px`,
    "--schedule-grid-mobile-min-width": `${scheduleGridMobileMinWidth}px`
  };
});
const clickTimers = new Map<string, number>();

function cellKey(staffId: string, date: string): string {
  return `${staffId}__${date}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function measureDisplayUnits(text: string): number {
  return [...text.trim()].reduce((total, character) => {
    return total + (/^[\u0000-\u00ff]$/.test(character) ? 0.55 : 1);
  }, 0);
}

function staffTypeLabel(staff: StaffMember): string {
  return STAFF_TYPE_LABELS[staff.type];
}

function clearClickTimer(key: string): void {
  const timer = clickTimers.get(key);
  if (timer === undefined) {
    return;
  }

  window.clearTimeout(timer);
  clickTimers.delete(key);
}

function clearAllClickTimers(): void {
  for (const timer of clickTimers.values()) {
    window.clearTimeout(timer);
  }
  clickTimers.clear();
}

function entryFor(staffId: string, date: string): ScheduleEntry | null {
  return entryMap.value.get(`${date}__${staffId}`) ?? null;
}

function canEditStaff(staff: StaffMember): boolean {
  return staff.enabled && editableStaffIdSet.value.has(staff.id);
}

function selectStaff(staffId: string): void {
  if (!props.canReorderStaff) {
    return;
  }

  emit("selectStaff", staffId);
}

function handleCellClick(staff: StaffMember, date: string): void {
  if (!canEditStaff(staff)) {
    return;
  }

  const key = cellKey(staff.id, date);
  clearClickTimer(key);
  const timer = window.setTimeout(() => {
    clickTimers.delete(key);
    if (props.selectedShiftId) {
      emit("quickFill", staff.id, date);
      return;
    }
    emit("editCell", staff.id, date);
  }, 180);
  clickTimers.set(key, timer);
}

function handleCellDoubleClick(staff: StaffMember, date: string): void {
  if (!canEditStaff(staff)) {
    return;
  }

  clearClickTimer(cellKey(staff.id, date));
  emit("editCell", staff.id, date);
}

onBeforeUnmount(() => {
  clearAllClickTimers();
});
</script>

<template>
  <section class="schedule-grid-panel">
    <section class="schedule-grid-wrap">
      <table
        class="schedule-grid"
        :class="{
          'schedule-grid-compact': displayDensity === 'compact',
          'schedule-grid-hide-type': !showTypeColumn
        }"
        :style="personColumnStyle"
      >
        <colgroup>
          <col class="sort-col-layout" />
          <col class="person-col-layout" />
          <col class="job-col-layout" />
          <col v-if="showTypeColumn" class="type-col-layout" />
          <col v-for="day in days" :key="`layout-${day.key}`" class="day-col-layout" />
        </colgroup>
        <thead>
          <tr>
            <th class="sticky-col sort-col">排序ID</th>
            <th class="sticky-col person-col">人员</th>
            <th class="sticky-col job-col">工号</th>
            <th v-if="showTypeColumn" class="sticky-col type-col">类型</th>
            <th v-for="day in days" :key="day.key" :class="{ weekend: day.isWeekend, holiday: holidayMap.has(day.key) }">
              <span>{{ day.dayOfMonth }}</span>
              <small>{{ day.weekdayName }}</small>
              <em v-if="holidayMap.has(day.key)">{{ holidayMap.get(day.key)?.name }}</em>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="person in sortedStaff"
            :key="person.id"
            :class="{
              'disabled-historical-row': !person.enabled,
              'selected-staff-row': showStaffReorderControls && person.id === selectedStaffId
            }"
            :tabindex="showStaffReorderControls ? 0 : undefined"
            :aria-selected="showStaffReorderControls ? person.id === selectedStaffId : undefined"
            @click="selectStaff(person.id)"
            @keydown.enter.prevent="selectStaff(person.id)"
            @keydown.space.prevent="selectStaff(person.id)"
          >
            <th class="sticky-col sort-col">
              <span class="sort-order-value">{{ person.sortOrder }}</span>
            </th>
            <th class="sticky-col person-col">
              <strong>{{ person.name }}</strong>
              <small v-if="!person.enabled" class="historical-staff-label">停用历史</small>
            </th>
            <td class="sticky-col job-col">{{ person.jobId }}</td>
            <td v-if="showTypeColumn" class="sticky-col type-col">{{ staffTypeLabel(person) }}</td>
            <td
              v-for="day in days"
              :key="`${person.id}-${day.key}`"
              :data-testid="`schedule-cell-${person.id}-${day.key}`"
              :class="{ editable: canEditStaff(person), weekend: day.isWeekend, holiday: holidayMap.has(day.key) }"
              @click="handleCellClick(person, day.key)"
              @dblclick="handleCellDoubleClick(person, day.key)"
            >
              <div class="cell-shifts">
                <span
                  v-for="shiftId in entryFor(person.id, day.key)?.shiftIds ?? []"
                  :key="shiftId"
                  class="shift-chip"
                  :style="{ color: shiftMap.get(shiftId)?.color, borderColor: shiftMap.get(shiftId)?.color }"
                >
                  {{ shiftMap.get(shiftId)?.shortName }}
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>
</template>
