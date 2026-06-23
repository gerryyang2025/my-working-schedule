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

type PaletteGroupKey = "common" | "normal";

interface PaletteShift {
  shift: Shift;
  order: number;
  color: string;
}

interface PaletteGroup {
  key: PaletteGroupKey;
  label: string;
  shifts: PaletteShift[];
}

interface ShiftOrderRule {
  keys: string[];
  containsName?: boolean;
  codeNameMatch?: boolean;
}

const COMMON_SHIFT_RULES = [
  { keys: ["常班"] },
  { keys: ["A1", "A1组长"], codeNameMatch: true },
  { keys: ["A2"], codeNameMatch: true },
  { keys: ["A3", "A3组长"], codeNameMatch: true },
  { keys: ["A4"], codeNameMatch: true },
  { keys: ["A5"], codeNameMatch: true },
  { keys: ["A6"], codeNameMatch: true },
  { keys: ["A7"], codeNameMatch: true },
  { keys: ["P1"], codeNameMatch: true },
  { keys: ["P2"], codeNameMatch: true },
  { keys: ["P3"], codeNameMatch: true },
  { keys: ["N1"], codeNameMatch: true },
  { keys: ["N2"], codeNameMatch: true },
  { keys: ["办公"], containsName: true },
  { keys: ["休", "休息"] },
  { keys: ["带检"], containsName: true }
] satisfies ShiftOrderRule[];

const NORMAL_SHIFT_RULES = [
  { keys: ["护理总值"] },
  { keys: ["进修"] },
  { keys: ["备1"] },
  { keys: ["备2"] },
  { keys: ["培训"] },
  { keys: ["公休"] },
  { keys: ["婚假"] },
  { keys: ["育儿假"] },
  { keys: ["病假"] },
  { keys: ["产假"] },
  { keys: ["事假"] },
  { keys: ["丧假"] },
  { keys: ["产假/休"] },
  { keys: ["保健"] }
] satisfies ShiftOrderRule[];

const PALETTE_GROUPS: Array<{ key: PaletteGroupKey; label: string }> = [
  { key: "common", label: "常用" },
  { key: "normal", label: "普通" }
];

const SERIES_COLORS: Record<string, string> = {
  A: "#2563EB",
  P: "#0F766E",
  N: "#DC2626"
};

function normalizeShiftText(value: string) {
  return value.trim().toUpperCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesCodeName(normalizedName: string, normalizedToken: string) {
  if (!/^[APN]\d+$/.test(normalizedToken)) {
    return false;
  }

  return new RegExp(`${escapeRegExp(normalizedToken)}(?!\\d)`).test(normalizedName);
}

function getRuleOrder(shift: Shift, rules: ShiftOrderRule[]) {
  const normalizedShortName = normalizeShiftText(shift.shortName);
  const normalizedName = normalizeShiftText(shift.name);
  const shortNameOrder = rules.findIndex((rule) =>
    rule.keys.some((token) => normalizeShiftText(token) === normalizedShortName)
  );

  if (shortNameOrder >= 0) {
    return shortNameOrder;
  }

  const exactNameOrder = rules.findIndex((rule) =>
    rule.keys.some((token) => normalizeShiftText(token) === normalizedName)
  );

  if (exactNameOrder >= 0) {
    return exactNameOrder;
  }

  return rules.findIndex((rule) =>
    rule.keys.some((token) => {
      const normalizedToken = normalizeShiftText(token);

      return (
        (rule.containsName && normalizedName.includes(normalizedToken)) ||
        (rule.codeNameMatch && matchesCodeName(normalizedName, normalizedToken))
      );
    })
  );
}

function comparePaletteShift(left: PaletteShift, right: PaletteShift) {
  if (left.order !== right.order) {
    return left.order - right.order;
  }

  if (left.shift.sortOrder !== right.shift.sortOrder) {
    return left.shift.sortOrder - right.shift.sortOrder;
  }

  return left.shift.id.localeCompare(right.shift.id);
}

function getPaletteColor(shift: Shift) {
  const series = [shift.shortName, shift.name]
    .map(normalizeShiftText)
    .map((value) => value.match(/([APN])\d/)?.[1])
    .find(Boolean);

  return series ? SERIES_COLORS[series] : shift.color;
}

const paletteGroups = computed<PaletteGroup[]>(() => {
  const groupedShifts: Record<PaletteGroupKey, PaletteShift[]> = {
    common: [],
    normal: []
  };

  for (const shift of props.shifts) {
    if (!shift.enabled) {
      continue;
    }

    const commonOrder = getRuleOrder(shift, COMMON_SHIFT_RULES);
    const key: PaletteGroupKey = commonOrder >= 0 ? "common" : "normal";
    const order = commonOrder >= 0 ? commonOrder : getRuleOrder(shift, NORMAL_SHIFT_RULES);

    groupedShifts[key].push({
      shift,
      order: order >= 0 ? order : Number.MAX_SAFE_INTEGER,
      color: getPaletteColor(shift)
    });
  }

  return PALETTE_GROUPS.map((group) => ({
    ...group,
    shifts: groupedShifts[group.key].sort(comparePaletteShift)
  })).filter((group) => group.shifts.length > 0);
});
</script>

<template>
  <aside class="shift-palette">
    <h2>画笔</h2>
    <div class="shift-palette-body">
      <section
        v-for="group in paletteGroups"
        :key="group.key"
        class="shift-palette-group"
        :data-testid="`shift-palette-group-${group.key}`"
      >
        <div class="shift-palette-group-label">{{ group.label }}</div>
        <div class="shift-list">
          <button
            v-for="paletteShift in group.shifts"
            :key="paletteShift.shift.id"
            class="shift-button"
            :class="{ active: selectedShiftId === paletteShift.shift.id }"
            :data-testid="`shift-button-${paletteShift.shift.id}`"
            :style="{ color: paletteShift.color }"
            type="button"
            @click="emit('select', paletteShift.shift.id)"
          >
            {{ paletteShift.shift.shortName }}
          </button>
        </div>
      </section>
    </div>
  </aside>
</template>
