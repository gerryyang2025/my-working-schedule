<script setup lang="ts">
import { CalendarDays, Expand, Printer, Settings, ShieldCheck } from "lucide-vue-next";

defineProps<{
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
