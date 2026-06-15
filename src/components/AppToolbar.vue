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
</script>

<template>
  <section class="toolbar">
    <div class="toolbar-group">
      <el-input-number
        :model-value="year"
        :min="2020"
        :max="2035"
        controls-position="right"
        @update:model-value="emit('update:year', Number($event))"
      />
      <el-select
        :model-value="month"
        class="month-select"
        @update:model-value="emit('update:month', Number($event))"
      >
        <el-option v-for="item in 12" :key="item" :label="`${item}月`" :value="item" />
      </el-select>
      <el-date-picker
        :model-value="selectedDate"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="选择日期"
        @update:model-value="emit('update:selectedDate', String($event))"
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
