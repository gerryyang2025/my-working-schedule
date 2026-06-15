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
const sortedStaff = computed(() =>
  props.staff.filter((item) => item.enabled).sort((left, right) => left.sortOrder - right.sortOrder)
);
let clickTimer: number | null = null;

function clearClickTimer(): void {
  if (clickTimer === null) {
    return;
  }

  window.clearTimeout(clickTimer);
  clickTimer = null;
}

function entryFor(staffId: string, date: string): ScheduleEntry | null {
  return entryMap.value.get(`${date}__${staffId}`) ?? null;
}

function handleCellClick(staffId: string, date: string): void {
  if (!props.adminMode) {
    return;
  }

  clearClickTimer();
  clickTimer = window.setTimeout(() => {
    clickTimer = null;
    if (props.selectedShiftId) {
      emit("quickFill", staffId, date);
      return;
    }
    emit("editCell", staffId, date);
  }, 180);
}

function handleCellDoubleClick(staffId: string, date: string): void {
  if (!props.adminMode) {
    return;
  }

  clearClickTimer();
  emit("editCell", staffId, date);
}

onBeforeUnmount(() => {
  clearClickTimer();
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
        <tr v-for="person in sortedStaff" :key="person.id">
          <th class="sticky-col person-col">
            <strong>{{ person.name }}</strong>
            <small>{{ person.jobId }}</small>
          </th>
          <td
            v-for="day in days"
            :key="`${person.id}-${day.key}`"
            :class="{ editable: adminMode, weekend: day.isWeekend, holiday: holidayMap.has(day.key) }"
            @click="handleCellClick(person.id, day.key)"
            @dblclick="handleCellDoubleClick(person.id, day.key)"
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
