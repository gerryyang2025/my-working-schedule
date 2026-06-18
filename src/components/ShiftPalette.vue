<script setup lang="ts">
import { computed } from "vue";
import type { Shift } from "@/types/domain";

const props = defineProps<{
  shifts: Shift[];
  selectedShiftId: string;
}>();

const emit = defineEmits<{
  select: [shiftId: string];
}>();

const enabledShifts = computed(() =>
  props.shifts.filter((item) => item.enabled).sort((left, right) => left.sortOrder - right.sortOrder)
);
</script>

<template>
  <aside class="shift-palette">
    <h2>画笔</h2>
    <div class="shift-list">
      <button
        v-for="shift in enabledShifts"
        :key="shift.id"
        class="shift-button"
        :class="{ active: selectedShiftId === shift.id }"
        :style="{ color: shift.color }"
        type="button"
        @click="emit('select', shift.id)"
      >
        {{ shift.shortName }}
      </button>
    </div>
  </aside>
</template>
