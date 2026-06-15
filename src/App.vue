<script setup lang="ts">
import { ElMessage } from "element-plus";
import { computed, onMounted, ref } from "vue";
import AppToolbar from "@/components/AppToolbar.vue";
import CellEditorDialog from "@/components/CellEditorDialog.vue";
import ScheduleGrid from "@/components/ScheduleGrid.vue";
import ShiftPalette from "@/components/ShiftPalette.vue";
import { enterAdminMode, loadData, saveScheduleEntry } from "@/api/client";
import type { PublicAppData } from "@/api/client";
import { getMonthDays, getWeekRange, toDateKey } from "@/lib/date";

const today = toDateKey(new Date());
const data = ref<PublicAppData | null>(null);
const error = ref("");
const adminMode = ref(false);
const selectedDate = ref(today);
const currentYear = ref(new Date().getFullYear());
const currentMonth = ref(new Date().getMonth() + 1);
const managementOpen = ref(false);
const selectedShiftId = ref("");
const editorOpen = ref(false);
const editingStaffId = ref("");
const editingDate = ref("");

const selectedWeek = computed(() => getWeekRange(selectedDate.value));
const monthDays = computed(() => getMonthDays(currentYear.value, currentMonth.value));
const editingStaff = computed(() => data.value?.staff.find((staff) => staff.id === editingStaffId.value) ?? null);
const editingEntry = computed(
  () =>
    data.value?.scheduleEntries.find((entry) => entry.staffId === editingStaffId.value && entry.date === editingDate.value) ??
    null
);

async function refreshData(): Promise<void> {
  data.value = await loadData();
}

async function handleEnterAdmin(): Promise<void> {
  if (adminMode.value) {
    return;
  }

  const password = window.prompt("请输入管理密码");
  if (!password) {
    return;
  }

  try {
    await enterAdminMode(password);
    adminMode.value = true;
  } catch (caughtError) {
    adminMode.value = false;
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "管理密码验证失败");
  }
}

async function handleFullscreen(): Promise<void> {
  const root = document.documentElement;

  if (!document.fullscreenEnabled || !root.requestFullscreen || !document.exitFullscreen) {
    ElMessage.error("当前浏览器不支持全屏模式");
    return;
  }

  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await root.requestFullscreen();
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "全屏切换失败");
  }
}

function printWithMode(mode: "month" | "week"): void {
  document.body.dataset.printMode = mode;
  window.print();
  window.setTimeout(() => {
    delete document.body.dataset.printMode;
  }, 200);
}

async function saveEntry(staffId: string, date: string, shiftIds: string[], note = ""): Promise<void> {
  try {
    data.value = await saveScheduleEntry({ staffId, date, shiftIds, note });
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "排班保存失败");
    throw caughtError;
  }
}

async function handleQuickFill(staffId: string, date: string): Promise<void> {
  if (!selectedShiftId.value) {
    return;
  }

  await saveEntry(staffId, date, [selectedShiftId.value], "");
}

function handleEditCell(staffId: string, date: string): void {
  editingStaffId.value = staffId;
  editingDate.value = date;
  editorOpen.value = true;
}

async function handleEditorSave(shiftIds: string[], note: string): Promise<void> {
  await saveEntry(editingStaffId.value, editingDate.value, shiftIds, note);
  editorOpen.value = false;
}

onMounted(async () => {
  try {
    await refreshData();
  } catch (caughtError) {
    error.value = caughtError instanceof Error ? caughtError.message : "系统加载失败";
  }
});
</script>

<template>
  <main class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">国际医学部</p>
        <h1>护理排班管理系统</h1>
      </div>
      <div class="week-chip">{{ selectedWeek.start }} 至 {{ selectedWeek.end }}</div>
    </header>

    <AppToolbar
      v-model:year="currentYear"
      v-model:month="currentMonth"
      v-model:selected-date="selectedDate"
      :admin-mode="adminMode"
      @enter-admin="handleEnterAdmin"
      @open-management="managementOpen = true"
      @print-month="printWithMode('month')"
      @print-week="printWithMode('week')"
      @fullscreen="handleFullscreen"
    />

    <section v-if="error" class="state-message">
      {{ error }}
    </section>
    <section v-else-if="!data" class="state-message">正在加载排班数据...</section>
    <section v-else class="workbench">
      <ShiftPalette :shifts="data.shifts" :selected-shift-id="selectedShiftId" @select="selectedShiftId = $event" />
      <ScheduleGrid
        :staff="data.staff"
        :days="monthDays"
        :holidays="data.holidays"
        :shifts="data.shifts"
        :entries="data.scheduleEntries"
        :selected-shift-id="selectedShiftId"
        :admin-mode="adminMode"
        @quick-fill="handleQuickFill"
        @edit-cell="handleEditCell"
      />
      <CellEditorDialog
        v-model="editorOpen"
        :staff="editingStaff"
        :date="editingDate"
        :entry="editingEntry"
        :shifts="data.shifts"
        @save="handleEditorSave"
      />
    </section>
  </main>
</template>
