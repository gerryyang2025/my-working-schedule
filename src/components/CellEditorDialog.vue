<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ScheduleEntry, Shift, StaffMember } from "@/types/domain";

const props = defineProps<{
  modelValue: boolean;
  staff: StaffMember | null;
  date: string;
  entry: ScheduleEntry | null;
  shifts: Shift[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  save: [shiftIds: string[], note: string];
}>();

const localShiftIds = ref<string[]>([]);
const note = ref("");

const enabledShifts = computed(() =>
  props.shifts.filter((shift) => shift.enabled).sort((left, right) => left.sortOrder - right.sortOrder)
);

watch(
  () => [props.modelValue, props.entry?.id, props.entry?.shiftIds.join("|"), props.entry?.note],
  () => {
    localShiftIds.value = props.entry?.shiftIds ? [...props.entry.shiftIds] : [];
    note.value = props.entry?.note ?? "";
  },
  { immediate: true }
);

function save(): void {
  emit("save", localShiftIds.value.filter(Boolean).slice(0, 2), note.value);
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    width="420px"
    title="编辑排班"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="staff" class="cell-editor">
      <p class="editor-context">{{ staff.name }} · {{ date }}</p>
      <el-select v-model="localShiftIds" multiple :multiple-limit="2" placeholder="选择最多两个班次" class="full-width">
        <el-option v-for="shift in enabledShifts" :key="shift.id" :label="shift.name" :value="shift.id" />
      </el-select>
      <el-input v-model="note" type="textarea" :rows="3" placeholder="备注" />
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :disabled="!staff" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>
