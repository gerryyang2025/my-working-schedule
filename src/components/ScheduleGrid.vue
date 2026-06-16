<script setup lang="ts">
import { computed, onBeforeUnmount } from "vue";
import type { CalendarDay } from "@/lib/date";
import type { Holiday, ScheduleEntry, Shift, StaffMember } from "@/types/domain";

const props = defineProps<{
  staff: StaffMember[];
  days: CalendarDay[];
  holidays: Holiday[];
  shifts: Shift[];
  entries: ScheduleEntry[];
  selectedShiftId: string;
  adminMode: boolean;
}>();

const emit = defineEmits<{
  quickFill: [staffId: string, date: string];
  editCell: [staffId: string, date: string];
}>();

const holidayMap = computed(() => new Map(props.holidays.map((holiday) => [holiday.date, holiday])));
const shiftMap = computed(() => new Map(props.shifts.map((shift) => [shift.id, shift])));
const entryMap = computed(() => new Map(props.entries.map((entry) => [`${entry.date}__${entry.staffId}`, entry])));
const visibleDayKeys = computed(() => new Set(props.days.map((day) => day.key)));
const staffWithVisibleEntries = computed(
  () => new Set(props.entries.filter((entry) => visibleDayKeys.value.has(entry.date)).map((entry) => entry.staffId))
);
const sortedStaff = computed(() =>
  props.staff
    .filter((item) => item.enabled || staffWithVisibleEntries.value.has(item.id))
    .sort((left, right) => left.sortOrder - right.sortOrder)
);
const clickTimers = new Map<string, number>();

function cellKey(staffId: string, date: string): string {
  return `${staffId}__${date}`;
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
  return props.adminMode && staff.enabled;
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
    <table class="schedule-grid">
      <thead>
        <tr>
          <th class="sticky-col person-col">人员</th>
          <th v-for="day in days" :key="day.key" :class="{ weekend: day.isWeekend, holiday: holidayMap.has(day.key) }">
            <span>{{ day.dayOfMonth }}</span>
            <small>{{ day.weekdayName }}</small>
            <em v-if="holidayMap.has(day.key)">{{ holidayMap.get(day.key)?.name }}</em>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="person in sortedStaff" :key="person.id" :class="{ 'disabled-historical-row': !person.enabled }">
          <th class="sticky-col person-col">
            <strong>{{ person.name }}</strong>
            <small>{{ person.jobId }}</small>
            <small v-if="!person.enabled" class="historical-staff-label">停用历史</small>
          </th>
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
