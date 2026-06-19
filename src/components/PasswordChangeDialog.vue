<script setup lang="ts">
import { computed, reactive, watch } from "vue";

const props = defineProps<{
  modelValue: boolean;
  loading: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  changePassword: [payload: { currentPassword: string; newPassword: string }];
}>();

const draft = reactive({
  currentPassword: "",
  newPassword: "",
  confirmPassword: ""
});

const validationMessage = computed(() => {
  if (!draft.currentPassword || !draft.newPassword || !draft.confirmPassword) {
    return "请填写当前密码和新密码";
  }
  if (draft.newPassword.length < 6) {
    return "新密码至少 6 位";
  }
  if (draft.newPassword !== draft.confirmPassword) {
    return "两次输入的新密码不一致";
  }
  return "";
});

function resetDraft(): void {
  draft.currentPassword = "";
  draft.newPassword = "";
  draft.confirmPassword = "";
}

function closeDialog(): void {
  emit("update:modelValue", false);
}

function submit(): void {
  if (validationMessage.value || props.loading) {
    return;
  }

  emit("changePassword", {
    currentPassword: draft.currentPassword,
    newPassword: draft.newPassword
  });
}

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      resetDraft();
    }
  }
);
</script>

<template>
  <el-dialog
    class="password-change-dialog"
    :model-value="modelValue"
    title="修改密码"
    width="420px"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <section class="password-change-form">
      <el-input
        v-model="draft.currentPassword"
        data-testid="current-password"
        type="password"
        placeholder="当前密码"
        show-password
        :disabled="loading"
      />
      <el-input
        v-model="draft.newPassword"
        data-testid="new-password"
        type="password"
        placeholder="新密码"
        show-password
        :disabled="loading"
      />
      <el-input
        v-model="draft.confirmPassword"
        data-testid="confirm-password"
        type="password"
        placeholder="确认新密码"
        show-password
        :disabled="loading"
      />
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <p v-else-if="validationMessage" class="form-hint">{{ validationMessage }}</p>
    </section>

    <template #footer>
      <el-button :disabled="loading" @click="closeDialog">取消</el-button>
      <el-button
        type="primary"
        data-testid="submit-password-change"
        :loading="loading"
        :disabled="Boolean(validationMessage) || loading"
        @click="submit"
      >
        保存新密码
      </el-button>
    </template>
  </el-dialog>
</template>
