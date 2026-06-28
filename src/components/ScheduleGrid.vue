<script setup lang="ts">
import { computed, onBeforeUnmount } from "vue";
import type { CalendarDay } from "@/lib/date";
import type { Holiday, ScheduleEntry, Shift, StaffMember, StaffType } from "@/types/domain";

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
  }>(),
  { canReorderStaff: false }
);

const emit = defineEmits<{
  quickFill: [staffId: string, date: string];
  editCell: [staffId: string, date: string];
  reorderStaff: [staffIds: string[]];
}>();

const STAFF_TYPE_LABELS: Record<StaffType, string> = {
  head_nurse: "护士长",
  nurse: "护士",
  clerk: "文员"
};

const SORT_COLUMN_WIDTH = 68;
const TYPE_COLUMN_WIDTH = 58;
const SORT_COLUMN_MOBILE_WIDTH = 58;
const TYPE_COLUMN_MOBILE_WIDTH = 46;

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
const personColumnStyle = computed(() => {
  const longestNameUnits = Math.max(2, ...sortedStaff.value.map((person) => measureDisplayUnits(person.name)));
  const personColumnWidth = clamp(Math.ceil(longestNameUnits * 12 + 40), 64, 104);
  const personColumnMobileWidth = clamp(Math.ceil(longestNameUnits * 12 + 32), 56, 88);

  return {
    "--sort-col-width": `${SORT_COLUMN_WIDTH}px`,
    "--person-col-width": `${personColumnWidth}px`,
    "--type-col-width": `${TYPE_COLUMN_WIDTH}px`,
    "--person-col-left": `${SORT_COLUMN_WIDTH}px`,
    "--type-col-left": `${SORT_COLUMN_WIDTH + personColumnWidth}px`,
    "--sort-col-mobile-width": `${SORT_COLUMN_MOBILE_WIDTH}px`,
    "--person-col-mobile-width": `${personColumnMobileWidth}px`,
    "--type-col-mobile-width": `${TYPE_COLUMN_MOBILE_WIDTH}px`,
    "--person-col-mobile-left": `${SORT_COLUMN_MOBILE_WIDTH}px`,
    "--type-col-mobile-left": `${SORT_COLUMN_MOBILE_WIDTH + personColumnMobileWidth}px`
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

function canMoveStaff(staffId: string, direction: "up" | "down"): boolean {
  if (!showStaffReorderControls.value) {
    return false;
  }

  const staffIndex = sortedStaff.value.findIndex((staff) => staff.id === staffId);
  if (staffIndex === -1) {
    return false;
  }

  return direction === "up" ? staffIndex > 0 : staffIndex < sortedStaff.value.length - 1;
}

function moveStaff(staffId: string, direction: "up" | "down"): void {
  if (!canMoveStaff(staffId, direction)) {
    return;
  }

  const staffIds = sortedStaff.value.map((staff) => staff.id);
  const staffIndex = staffIds.indexOf(staffId);
  const swapIndex = direction === "up" ? staffIndex - 1 : staffIndex + 1;
  [staffIds[staffIndex], staffIds[swapIndex]] = [staffIds[swapIndex], staffIds[staffIndex]];
  emit("reorderStaff", staffIds);
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
  <section class="schedule-grid-wrap">
    <table class="schedule-grid" :style="personColumnStyle">
      <thead>
        <tr>
          <th class="sticky-col sort-col">排序ID</th>
          <th class="sticky-col person-col">人员</th>
          <th class="sticky-col type-col">类型</th>
          <th v-for="day in days" :key="day.key" :class="{ weekend: day.isWeekend, holiday: holidayMap.has(day.key) }">
            <span>{{ day.dayOfMonth }}</span>
            <small>{{ day.weekdayName }}</small>
            <em v-if="holidayMap.has(day.key)">{{ holidayMap.get(day.key)?.name }}</em>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="person in sortedStaff" :key="person.id" :class="{ 'disabled-historical-row': !person.enabled }">
          <th class="sticky-col sort-col">
            <span class="sort-order-value">{{ person.sortOrder }}</span>
            <span v-if="showStaffReorderControls" class="staff-reorder-controls">
              <button
                type="button"
                class="staff-reorder-button"
                :data-testid="`move-staff-up-${person.id}`"
                :aria-label="`${person.name} 上移`"
                :disabled="!canMoveStaff(person.id, 'up')"
                @click.stop="moveStaff(person.id, 'up')"
              >
                ↑
              </button>
              <button
                type="button"
                class="staff-reorder-button"
                :data-testid="`move-staff-down-${person.id}`"
                :aria-label="`${person.name} 下移`"
                :disabled="!canMoveStaff(person.id, 'down')"
                @click.stop="moveStaff(person.id, 'down')"
              >
                ↓
              </button>
            </span>
          </th>
          <th class="sticky-col person-col">
            <strong>{{ person.name }}</strong>
            <small>{{ person.jobId }}</small>
            <small v-if="!person.enabled" class="historical-staff-label">停用历史</small>
          </th>
          <td class="sticky-col type-col">{{ staffTypeLabel(person) }}</td>
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
</template>
