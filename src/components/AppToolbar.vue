<script setup lang="ts">
import { computed } from "vue";
import { CalendarDays, ChevronLeft, ChevronRight, Expand, KeyRound, LogOut, Printer, Settings } from "lucide-vue-next";
import { addWeeks, getWeekRange, toDateKey } from "@/lib/date";
import type { AuthUser } from "@/api/client";

const props = defineProps<{
  selectedDate: string;
  adminMode: boolean;
  canManageConfig: boolean;
  currentUser: AuthUser;
}>();

const emit = defineEmits<{
  "update:selectedDate": [value: string];
  logout: [];
  openPasswordChange: [];
  openManagement: [];
  printMonth: [];
  printWeek: [];
  fullscreen: [];
}>();

function handleSelectedDateUpdate(value: unknown): void {
  if (typeof value === "string" && value) {
    emit("update:selectedDate", value);
  }
}

const selectedWeek = computed(() => getWeekRange(props.selectedDate));
const roleLabel = computed(() => {
  if (props.currentUser.role === "admin") {
    return "系统管理员";
  }
  if (props.currentUser.role === "scheduler") {
    return "排班管理员";
  }
  return "只读查看";
});

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
      <span class="toolbar-user">{{ currentUser.displayName }} · {{ roleLabel }}</span>
      <el-button :icon="KeyRound" data-testid="open-password-change" @click="emit('openPasswordChange')">修改密码</el-button>
      <el-button :icon="Settings" :disabled="!canManageConfig" @click="emit('openManagement')">配置</el-button>
      <el-button :icon="CalendarDays" @click="emit('printWeek')">打印周表</el-button>
      <el-button :icon="Printer" @click="emit('printMonth')">打印月表</el-button>
      <el-button :icon="Expand" @click="emit('fullscreen')">全屏</el-button>
      <el-button :icon="LogOut" @click="emit('logout')">退出登录</el-button>
    </div>
  </section>
</template>
