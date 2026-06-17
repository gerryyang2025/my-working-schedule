<script setup lang="ts">
import type { MonthlySettlement, MonthlySummary } from "@/types/domain";

defineProps<{
  adminMode: boolean;
  canceling?: boolean;
  month: string;
  monthlySummary: MonthlySummary;
  saving?: boolean;
  settlement: MonthlySettlement | null;
}>();

defineEmits<{
  cancelSettlement: [month: string];
  confirmSettlement: [payload: { month: string; bonusPool: number }];
}>();
</script>

<template>
  <section class="bonus-settlement-panel" />
</template>
