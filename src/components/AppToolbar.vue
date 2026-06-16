<script setup lang="ts">
import { computed } from "vue";
import { CalendarDays, ChevronLeft, ChevronRight, Expand, Printer, Settings, ShieldCheck } from "lucide-vue-next";
import { addWeeks, getWeekRange, toDateKey } from "@/lib/date";

const props = defineProps<{
  year: number;
  month: number;
  selectedDate: string;
  adminMode: boolean;
}>();

const emit = defineEmits<{
  "update:year": [value: number];
  "update:month": [value: number];
  "update:selectedDate": [value: string];
  enterAdmin: [];
  openManagement: [];
  printMonth: [];
  printWeek: [];
  fullscreen: [];
}>();

function handleYearUpdate(value: unknown): void {
  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    emit("update:year", numericValue);
  }
}

function handleMonthUpdate(value: unknown): void {
  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    emit("update:month", numericValue);
  }
}

function handleSelectedDateUpdate(value: unknown): void {
  if (typeof value === "string" && value) {
    emit("update:selectedDate", value);
  }
}

const selectedWeek = computed(() => getWeekRange(props.selectedDate));

function moveWeek(offset: number): void {
  emit("update:selectedDate", addWeeks(props.selectedDate, offset));
}

function moveToCurrentWeek(): void {
  emit("update:selectedDate", getWeekRange(toDateKey(new Date())).start);
}
</script>

<template>
  <section class="toolbar">
    <div class="toolbar-group">
      <el-input-number
        :model-value="year"
        :min="2020"
        :max="2035"
        controls-position="right"
        @update:model-value="handleYearUpdate"
      />
      <el-select
        :model-value="month"
        class="month-select"
        @update:model-value="handleMonthUpdate"
      >
        <el-option v-for="item in 12" :key="item" :label="`${item}月`" :value="item" />
      </el-select>
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
      <span class="toolbar-week-range">{{ selectedWeek.start }} 至 {{ selectedWeek.end }}</span>
    </div>

    <div class="toolbar-actions">
      <el-button :type="adminMode ? 'success' : 'primary'" :icon="ShieldCheck" @click="emit('enterAdmin')">
        {{ adminMode ? "编辑模式" : "输入管理密码" }}
      </el-button>
      <el-button :icon="Settings" @click="emit('openManagement')">配置</el-button>
      <el-button :icon="CalendarDays" @click="emit('printWeek')">打印周表</el-button>
      <el-button :icon="Printer" @click="emit('printMonth')">打印月表</el-button>
      <el-button :icon="Expand" @click="emit('fullscreen')">全屏</el-button>
    </div>
  </section>
</template>
