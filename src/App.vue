<script setup lang="ts">
import { ElMessage } from "element-plus";
import { computed, onMounted, ref } from "vue";
import AppToolbar from "@/components/AppToolbar.vue";
import { enterAdminMode, loadData } from "@/api/client";
import type { PublicAppData } from "@/api/client";
import { getWeekRange, toDateKey } from "@/lib/date";

const today = toDateKey(new Date());
const data = ref<PublicAppData | null>(null);
const error = ref("");
const adminMode = ref(false);
const selectedDate = ref(today);
const currentYear = ref(new Date().getFullYear());
const currentMonth = ref(new Date().getMonth() + 1);
const managementOpen = ref(false);

const selectedWeek = computed(() => getWeekRange(selectedDate.value));

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
    <section v-else class="state-message">
      已加载 {{ data.staff.length }} 名人员和 {{ data.shifts.length }} 个班次，配置抽屉状态：{{
        managementOpen ? "打开" : "关闭"
      }}
    </section>
  </main>
</template>
