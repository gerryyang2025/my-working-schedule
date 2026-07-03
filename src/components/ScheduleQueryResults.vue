<script setup lang="ts">
import { computed } from "vue";
import type { ScheduleQueryWeekGroup } from "@/lib/schedule-query";
import type { Holiday, ScheduleEntry, Shift, StaffMember, StaffType } from "@/types/domain";

const props = defineProps<{
  weekGroups: ScheduleQueryWeekGroup[];
  staff: StaffMember[];
  holidays: Holiday[];
  shifts: Shift[];
  entries: ScheduleEntry[];
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
const SORT_COLUMN_MOBILE_WIDTH = 48;
const JOB_COLUMN_MOBILE_WIDTH = 54;
const TYPE_COLUMN_MOBILE_WIDTH = 44;
const DAY_COLUMN_MOBILE_WIDTH = 68;

const holidayMap = computed(() => new Map(props.holidays.map((holiday) => [holiday.date, holiday])));
const shiftMap = computed(() => new Map(props.shifts.map((shift) => [shift.id, shift])));
const entryMap = computed(() => new Map(props.entries.map((entry) => [`${entry.date}__${entry.staffId}`, entry])));
const sortedStaff = computed(() => [...props.staff].sort((left, right) => left.sortOrder - right.sortOrder));
const personColumnStyle = computed(() => {
  const longestNameUnits = Math.max(2, ...sortedStaff.value.map((person) => measureDisplayUnits(person.name)));
  const personColumnWidth = clamp(Math.ceil(longestNameUnits * 12 + 40), 64, 104);
  const personColumnMobileWidth = clamp(Math.ceil(longestNameUnits * 12 + 32), 56, 88);
  const maxDayCount = Math.max(0, ...props.weekGroups.map((group) => group.days.length));
  const jobColumnLeft = SORT_COLUMN_WIDTH + personColumnWidth;
  const typeColumnLeft = jobColumnLeft + JOB_COLUMN_WIDTH;
  const jobColumnMobileLeft = SORT_COLUMN_MOBILE_WIDTH + personColumnMobileWidth;
  const typeColumnMobileLeft = jobColumnMobileLeft + JOB_COLUMN_MOBILE_WIDTH;
  const scheduleGridMinWidth = typeColumnLeft + TYPE_COLUMN_WIDTH + maxDayCount * DAY_COLUMN_WIDTH;
  const scheduleGridMobileMinWidth =
    typeColumnMobileLeft + TYPE_COLUMN_MOBILE_WIDTH + maxDayCount * DAY_COLUMN_MOBILE_WIDTH;

  return {
    "--sort-col-width": `${SORT_COLUMN_WIDTH}px`,
    "--person-col-width": `${personColumnWidth}px`,
    "--job-col-width": `${JOB_COLUMN_WIDTH}px`,
    "--type-col-width": `${TYPE_COLUMN_WIDTH}px`,
    "--day-col-width": `${DAY_COLUMN_WIDTH}px`,
    "--person-col-left": `${SORT_COLUMN_WIDTH}px`,
    "--job-col-left": `${jobColumnLeft}px`,
    "--type-col-left": `${typeColumnLeft}px`,
    "--schedule-grid-min-width": `${scheduleGridMinWidth}px`,
    "--sort-col-mobile-width": `${SORT_COLUMN_MOBILE_WIDTH}px`,
    "--person-col-mobile-width": `${personColumnMobileWidth}px`,
    "--job-col-mobile-width": `${JOB_COLUMN_MOBILE_WIDTH}px`,
    "--type-col-mobile-width": `${TYPE_COLUMN_MOBILE_WIDTH}px`,
    "--day-col-mobile-width": `${DAY_COLUMN_MOBILE_WIDTH}px`,
    "--person-col-mobile-left": `${SORT_COLUMN_MOBILE_WIDTH}px`,
    "--job-col-mobile-left": `${jobColumnMobileLeft}px`,
    "--type-col-mobile-left": `${typeColumnMobileLeft}px`,
    "--schedule-grid-mobile-min-width": `${scheduleGridMobileMinWidth}px`
  };
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function measureDisplayUnits(text: string): number {
  return [...text.trim()].reduce((total, character) => {
    return total + (/^[\u0000-\u00ff]$/.test(character) ? 0.55 : 1);
  }, 0);
}

function entryFor(staffId: string, date: string): ScheduleEntry | null {
  return entryMap.value.get(`${date}__${staffId}`) ?? null;
}

function staffTypeLabel(staff: StaffMember): string {
  return STAFF_TYPE_LABELS[staff.type];
}
</script>

<template>
  <section class="schedule-query-results" data-testid="schedule-query-results">
    <article
      v-for="group in weekGroups"
      :key="group.id"
      class="schedule-query-week"
      data-testid="schedule-query-week-block"
    >
      <h3 class="schedule-query-week-title" data-testid="schedule-query-week-title">
        {{ group.start }} 至 {{ group.end }}
      </h3>
      <section class="schedule-grid-wrap schedule-query-grid-wrap">
        <table class="schedule-grid schedule-query-grid" :style="personColumnStyle">
          <colgroup>
            <col class="sort-col-layout" />
            <col class="person-col-layout" />
            <col class="job-col-layout" />
            <col class="type-col-layout" />
            <col v-for="day in group.days" :key="`layout-${group.id}-${day.key}`" class="day-col-layout" />
          </colgroup>
          <thead>
            <tr>
              <th class="sticky-col sort-col">排序ID</th>
              <th class="sticky-col person-col">人员</th>
              <th class="sticky-col job-col">工号</th>
              <th class="sticky-col type-col">类型</th>
              <th
                v-for="day in group.days"
                :key="day.key"
                :class="{ weekend: day.isWeekend, holiday: holidayMap.has(day.key) }"
              >
                <span>{{ day.dayOfMonth }}</span>
                <small>{{ day.weekdayName }}</small>
                <em v-if="holidayMap.has(day.key)">{{ holidayMap.get(day.key)?.name }}</em>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="person in sortedStaff" :key="`${group.id}-${person.id}`" :class="{ 'disabled-historical-row': !person.enabled }">
              <th class="sticky-col sort-col">{{ person.sortOrder }}</th>
              <th class="sticky-col person-col">
                <strong>{{ person.name }}</strong>
                <small v-if="!person.enabled" class="historical-staff-label">停用历史</small>
              </th>
              <td class="sticky-col job-col">{{ person.jobId }}</td>
              <td class="sticky-col type-col">{{ staffTypeLabel(person) }}</td>
              <td
                v-for="day in group.days"
                :key="`${person.id}-${day.key}`"
                :data-testid="`schedule-query-cell-${person.id}-${day.key}`"
                :class="{ weekend: day.isWeekend, holiday: holidayMap.has(day.key) }"
                @click.stop
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
    </article>
  </section>
</template>
