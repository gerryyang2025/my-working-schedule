<script setup lang="ts">
import { computed, ref } from "vue";
import { LogIn } from "lucide-vue-next";

defineProps<{
  loading: boolean;
  error: string;
}>();

const emit = defineEmits<{
  login: [payload: { username: string; password: string }];
}>();

const username = ref("admin");
const password = ref("");
const canSubmit = computed(() => username.value.trim().length > 0 && password.value.trim().length > 0);

function submitLogin(): void {
  if (!canSubmit.value) {
    return;
  }

  emit("login", {
    username: username.value.trim(),
    password: password.value
  });
}
</script>

<template>
  <main class="login-page">
    <section class="login-panel" aria-label="系统登录">
      <p class="eyebrow">国际医学部</p>
      <h1>护理排班管理系统</h1>
      <p class="login-subtitle">请使用系统账号登录后查看排班、统计和月结信息。</p>

      <form class="login-form" @submit.prevent="submitLogin">
        <el-input v-model="username" data-testid="login-username" placeholder="用户名" :disabled="loading" />
        <el-input
          v-model="password"
          data-testid="login-password"
          type="password"
          placeholder="密码"
          show-password
          :disabled="loading"
        />
        <p v-if="error" class="login-error" role="alert">{{ error }}</p>
        <el-button
          data-testid="login-submit"
          type="primary"
          native-type="submit"
          :icon="LogIn"
          :loading="loading"
          :disabled="!canSubmit || loading"
        >
          登录
        </el-button>
      </form>
    </section>
  </main>
</template>
