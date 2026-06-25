<script setup lang="ts">
import { computed } from "vue";
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import { addWeeks, getScheduleWeekNumber, getWeekRange, toDateKey } from "@/lib/date";

const props = defineProps<{
  selectedDate: string;
}>();

const emit = defineEmits<{
  "update:selectedDate": [value: string];
}>();

function handleSelectedDateUpdate(value: unknown): void {
  if (typeof value === "string" && value) {
    emit("update:selectedDate", value);
  }
}

const selectedWeek = computed(() => getWeekRange(props.selectedDate));
const scheduleWeekLabel = computed(() => `第${getScheduleWeekNumber(props.selectedDate)}周`);

function moveWeek(offset: number): void {
  emit("update:selectedDate", addWeeks(props.selectedDate, offset));
}

function moveToCurrentWeek(): void {
  emit("update:selectedDate", getWeekRange(toDateKey(new Date())).start);
}
</script>

<template>
  <section class="schedule-week-controls" data-testid="schedule-week-controls">
    <div class="schedule-week-fields">
      <span class="schedule-week-number">{{ scheduleWeekLabel }}</span>
      <el-date-picker
        :model-value="selectedDate"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="选择日期"
        :clearable="false"
        @update:model-value="handleSelectedDateUpdate"
      />
      <div class="week-nav" role="group" aria-label="周选择">
        <el-tooltip content="上一周" placement="top">
          <el-button :icon="ChevronLeft" aria-label="上一周" @click="moveWeek(-1)" />
        </el-tooltip>
        <el-button class="current-week-button" @click="moveToCurrentWeek">本周</el-button>
        <el-tooltip content="下一周" placement="top">
          <el-button :icon="ChevronRight" aria-label="下一周" @click="moveWeek(1)" />
        </el-tooltip>
      </div>
      <span class="schedule-week-range">{{ selectedWeek.start }} 至 {{ selectedWeek.end }}</span>
    </div>
  </section>
</template>
