<script setup lang="ts">
import { onMounted, ref } from "vue";
import { loadData } from "@/api/client";
import type { PublicAppData } from "@/api/client";

const data = ref<PublicAppData | null>(null);
const error = ref("");

onMounted(async () => {
  try {
    data.value = await loadData();
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
    </header>

    <section v-if="error" class="state-message">
      {{ error }}
    </section>
    <section v-else-if="!data" class="state-message">正在加载排班数据...</section>
    <section v-else class="state-message">
      已加载 {{ data.staff.length }} 名人员和 {{ data.shifts.length }} 个班次
    </section>
  </main>
</template>
