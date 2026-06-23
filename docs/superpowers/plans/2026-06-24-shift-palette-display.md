# Shift Palette Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize the homepage shift brush palette so many enabled shifts are easier to scan through grouped wrapping rows.

**Architecture:** Keep the change local to `ShiftPalette.vue` and `src/styles/main.css`. The component derives display-only groups, fixed ordering, and A/P/N palette colors from the existing `Shift` data without changing API types, SQLite schema, system configuration, schedule cells, print views, or settlement logic.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Vue Test Utils, Vitest, CSS tests over `src/styles/main.css`.

---

## File Structure

- Modify `src/components/ShiftPalette.test.ts`: add focused component tests for grouping, fixed ordering, disabled shift exclusion, A/P/N palette colors, active state, and `select` events.
- Modify `src/components/ShiftPalette.vue`: replace the flat enabled-shift list with derived `paletteGroups`; add display-only grouping, ordering, and palette color helpers; render two labeled groups when non-empty.
- Modify `src/styles/main-css.test.ts`: update the existing shift palette CSS expectations from one horizontal toolbar to grouped wrapping rows.
- Modify `src/styles/main.css`: update `.shift-palette`, add `.shift-palette-body`, `.shift-palette-group`, and `.shift-palette-group-label`, and make `.shift-list` wrap instead of scroll horizontally.
- Do not modify `src/types/domain.ts`, `src/App.vue`, `server/sqlite/schema.ts`, `server/sqlite/mapper.ts`, `src/components/ManagementDrawer.vue`, print views, or calculation modules.

## Task 1: Component Behavior And Display Tests

**Files:**
- Modify: `src/components/ShiftPalette.test.ts`
- Modify: `src/components/ShiftPalette.vue`

- [ ] **Step 1: Replace the component test file with failing grouped palette tests**

Use this complete file content for `src/components/ShiftPalette.test.ts`:

```ts
import { VueWrapper, mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ShiftPalette from "./ShiftPalette.vue";
import type { Shift } from "@/types/domain";

function shift(input: Partial<Shift> & Pick<Shift, "id" | "name" | "shortName" | "sortOrder">): Shift {
  return {
    color: "#64748B",
    countsAttendance: true,
    coefficient: 1,
    enabled: true,
    ...input
  };
}

function buttonTexts(wrapper: VueWrapper, testId: string): string[] {
  return wrapper.get(`[data-testid="${testId}"]`).findAll(".shift-button").map((button) => button.text());
}

function buttonByText(wrapper: VueWrapper, text: string): HTMLElement {
  const button = wrapper.findAll(".shift-button").find((item) => item.text() === text);

  if (!button) {
    throw new Error(`Missing shift button: ${text}`);
  }

  return button.element as HTMLElement;
}

const shifts: Shift[] = [
  shift({ id: "shift-training", name: "培训", shortName: "培训", color: "#B45309", sortOrder: 16 }),
  shift({ id: "shift-a3", name: "A3组长", shortName: "A3", color: "#111827", sortOrder: 8 }),
  shift({ id: "shift-office", name: "办公班", shortName: "办公", color: "#7C3AED", sortOrder: 2 }),
  shift({ id: "shift-n2", name: "N2夜班", shortName: "N2", color: "#111827", sortOrder: 6 }),
  shift({ id: "shift-custom-low", name: "自定义低", shortName: "自低", color: "#0891B2", sortOrder: 30 }),
  shift({ id: "shift-a1", name: "A1组长", shortName: "A1", color: "#111827", sortOrder: 7 }),
  shift({ id: "shift-disabled", name: "停用班", shortName: "停", enabled: false, sortOrder: 1 }),
  shift({ id: "shift-p2", name: "P2", shortName: "P2", color: "#111827", sortOrder: 5 }),
  shift({ id: "shift-rest", name: "休息", shortName: "休", color: "#64748B", countsAttendance: false, coefficient: 0, sortOrder: 3 }),
  shift({ id: "shift-regular", name: "常班", shortName: "常班", color: "#334155", sortOrder: 9 }),
  shift({ id: "shift-sick", name: "病假", shortName: "病假", color: "#9333EA", countsAttendance: false, coefficient: 0, sortOrder: 14 }),
  shift({ id: "shift-standby-1", name: "备1", shortName: "备1", color: "#64748B", sortOrder: 20 }),
  shift({ id: "shift-custom-high", name: "自定义高", shortName: "自高", color: "#0E7490", sortOrder: 22 })
];

describe("ShiftPalette", () => {
  it("renders enabled shifts in common and normal groups with fixed ordering", () => {
    const wrapper = mount(ShiftPalette, {
      props: {
        selectedShiftId: "shift-a1",
        shifts
      }
    });

    expect(wrapper.get("h2").text()).toBe("画笔");
    expect(wrapper.find(".shift-dot").exists()).toBe(false);
    expect(wrapper.findAll(".shift-palette-group-label").map((label) => label.text())).toEqual(["常用", "普通"]);
    expect(buttonTexts(wrapper, "shift-palette-group-common")).toEqual(["常班", "A1", "A3", "P2", "N2", "办公", "休"]);
    expect(buttonTexts(wrapper, "shift-palette-group-normal")).toEqual(["备1", "培训", "病假", "自高", "自低"]);
    expect(wrapper.text()).not.toContain("停");
  });

  it("uses grouped palette colors for A, P, and N series while keeping configured colors for other shifts", () => {
    const wrapper = mount(ShiftPalette, {
      props: {
        selectedShiftId: "shift-a1",
        shifts
      }
    });

    expect(buttonByText(wrapper, "A1").style.color).toBe("rgb(37, 99, 235)");
    expect(buttonByText(wrapper, "A3").style.color).toBe("rgb(37, 99, 235)");
    expect(buttonByText(wrapper, "P2").style.color).toBe("rgb(15, 118, 110)");
    expect(buttonByText(wrapper, "N2").style.color).toBe("rgb(220, 38, 38)");
    expect(buttonByText(wrapper, "办公").style.color).toBe("rgb(124, 58, 237)");
  });

  it("keeps active state and emits the selected shift id", async () => {
    const wrapper = mount(ShiftPalette, {
      props: {
        selectedShiftId: "shift-a1",
        shifts
      }
    });

    expect(wrapper.find(".shift-button.active").text()).toBe("A1");

    await wrapper.get('[data-testid="shift-button-shift-rest"]').trigger("click");

    expect(wrapper.emitted("select")).toEqual([["shift-rest"]]);
  });

  it("omits empty groups when only one group has enabled shifts", () => {
    const wrapper = mount(ShiftPalette, {
      props: {
        selectedShiftId: "shift-custom-low",
        shifts: [
          shift({ id: "shift-custom-low", name: "自定义低", shortName: "自低", color: "#0891B2", sortOrder: 30 }),
          shift({ id: "shift-disabled-a1", name: "A1组长", shortName: "A1", enabled: false, sortOrder: 1 })
        ]
      }
    });

    expect(wrapper.findAll(".shift-palette-group-label").map((label) => label.text())).toEqual(["普通"]);
    expect(buttonTexts(wrapper, "shift-palette-group-normal")).toEqual(["自低"]);
    expect(wrapper.find('[data-testid="shift-palette-group-common"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the component test and verify it fails**

Run:

```bash
npm run test -- src/components/ShiftPalette.test.ts
```

Expected: FAIL because `ShiftPalette.vue` still renders one flat `.shift-list`, does not render `.shift-palette-group-label`, does not provide `data-testid="shift-palette-group-common"`, and does not apply A/P/N palette colors.

- [ ] **Step 3: Replace `ShiftPalette.vue` with grouped display logic**

Use this complete file content for `src/components/ShiftPalette.vue`:

```vue
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

interface ShiftOrderRule {
  keys: string[];
  containsName?: boolean;
}

interface PaletteShift {
  shift: Shift;
  color: string;
  order: number;
}

interface PaletteGroup {
  key: PaletteGroupKey;
  label: string;
  shifts: PaletteShift[];
}

const SERIES_COLORS = {
  a: "#2563EB",
  p: "#0F766E",
  n: "#DC2626"
};

const COMMON_SHIFT_ORDER: ShiftOrderRule[] = [
  { keys: ["常班"], containsName: true },
  { keys: ["A1", "A1组长"], containsName: true },
  { keys: ["A2"], containsName: true },
  { keys: ["A3", "A3组长"], containsName: true },
  { keys: ["A4"], containsName: true },
  { keys: ["A5"], containsName: true },
  { keys: ["A6"], containsName: true },
  { keys: ["A7"], containsName: true },
  { keys: ["P1"], containsName: true },
  { keys: ["P2"], containsName: true },
  { keys: ["P3"], containsName: true },
  { keys: ["N1"], containsName: true },
  { keys: ["N2"], containsName: true },
  { keys: ["办公"], containsName: true },
  { keys: ["休"], containsName: true },
  { keys: ["带检"], containsName: true }
];

const NORMAL_SHIFT_ORDER: ShiftOrderRule[] = [
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
];

function normalize(value: string): string {
  return value.trim().toUpperCase();
}

function matchesRule(shift: Shift, rule: ShiftOrderRule): boolean {
  const shortName = normalize(shift.shortName);
  const name = normalize(shift.name);

  return rule.keys.some((key) => {
    const normalizedKey = normalize(key);

    return shortName === normalizedKey || name === normalizedKey || Boolean(rule.containsName && name.includes(normalizedKey));
  });
}

function findOrder(shift: Shift, rules: ShiftOrderRule[]): number | null {
  const index = rules.findIndex((rule) => matchesRule(shift, rule));
  return index === -1 ? null : index;
}

function paletteColor(shift: Shift): string {
  const shortName = normalize(shift.shortName);
  const name = normalize(shift.name);

  if (/^A\d+/.test(shortName) || /A\d+/.test(name)) {
    return SERIES_COLORS.a;
  }

  if (/^P\d+/.test(shortName) || /P\d+/.test(name)) {
    return SERIES_COLORS.p;
  }

  if (/^N\d+/.test(shortName) || /N\d+/.test(name)) {
    return SERIES_COLORS.n;
  }

  return shift.color;
}

function comparePaletteShifts(left: PaletteShift, right: PaletteShift): number {
  return (
    left.order - right.order ||
    left.shift.sortOrder - right.shift.sortOrder ||
    left.shift.id.localeCompare(right.shift.id)
  );
}

const paletteGroups = computed<PaletteGroup[]>(() => {
  const common: PaletteShift[] = [];
  const normal: PaletteShift[] = [];

  for (const shift of props.shifts.filter((item) => item.enabled)) {
    const commonOrder = findOrder(shift, COMMON_SHIFT_ORDER);
    const target = commonOrder === null ? normal : common;
    const order = commonOrder ?? findOrder(shift, NORMAL_SHIFT_ORDER) ?? Number.MAX_SAFE_INTEGER;

    target.push({
      shift,
      color: paletteColor(shift),
      order
    });
  }

  const groups: PaletteGroup[] = [
    { key: "common", label: "常用", shifts: common.sort(comparePaletteShifts) },
    { key: "normal", label: "普通", shifts: normal.sort(comparePaletteShifts) }
  ];

  return groups.filter((group) => group.shifts.length > 0);
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
            v-for="{ shift, color } in group.shifts"
            :key="shift.id"
            class="shift-button"
            :class="{ active: selectedShiftId === shift.id }"
            :data-testid="`shift-button-${shift.id}`"
            :style="{ color }"
            type="button"
            @click="emit('select', shift.id)"
          >
            {{ shift.shortName }}
          </button>
        </div>
      </section>
    </div>
  </aside>
</template>
```

- [ ] **Step 4: Run the component test and verify it passes**

Run:

```bash
npm run test -- src/components/ShiftPalette.test.ts
```

Expected: PASS for all `ShiftPalette` tests.

- [ ] **Step 5: Commit component behavior**

Run:

```bash
git add src/components/ShiftPalette.vue src/components/ShiftPalette.test.ts
git commit -m "feat: group homepage shift palette"
```

Expected: commit succeeds with only the component and component test changes.

## Task 2: Grouped Wrapping Palette Styles

**Files:**
- Modify: `src/styles/main-css.test.ts`
- Modify: `src/styles/main.css`

- [ ] **Step 1: Replace the shift palette CSS test expectations**

In `src/styles/main-css.test.ts`, replace only the test named `keeps the shift palette compact in one horizontal toolbar` with this test:

```ts
  it("lays out the shift palette as grouped wrapping rows", () => {
    const paletteRules = ruleBlocks(".shift-palette");
    const paletteTitle = ruleBlocks(".shift-palette h2")[0] ?? "";
    const paletteBodyRules = ruleBlocks(".shift-palette-body")[0] ?? "";
    const paletteGroupRules = ruleBlocks(".shift-palette-group")[0] ?? "";
    const paletteGroupLabelRules = ruleBlocks(".shift-palette-group-label")[0] ?? "";
    const shiftListRules = ruleBlocks(".shift-list")[0] ?? "";
    const shiftButtonRules = ruleBlocks(".shift-button")[0] ?? "";

    expect(paletteRules[0]).toContain("display: grid");
    expect(paletteRules[0]).toContain("gap: 8px");
    expect(paletteTitle).toContain("white-space: nowrap");
    expect(paletteBodyRules).toContain("display: grid");
    expect(paletteBodyRules).toContain("gap: 8px");
    expect(paletteGroupRules).toContain("display: grid");
    expect(paletteGroupRules).toContain("grid-template-columns: 44px minmax(0, 1fr)");
    expect(paletteGroupRules).toContain("align-items: start");
    expect(paletteGroupLabelRules).toContain("font-weight: 800");
    expect(paletteGroupLabelRules).toContain("white-space: nowrap");
    expect(shiftListRules).toContain("display: flex");
    expect(shiftListRules).toContain("flex-wrap: wrap");
    expect(shiftListRules).not.toContain("overflow-x: auto");
    expect(shiftButtonRules).toContain("min-width: 44px");
    expect(shiftButtonRules).toContain("height: 30px");
    expect(shiftButtonRules).toContain("border: 0");
    expect(shiftButtonRules).toContain("border-bottom: 2px solid currentColor");
    expect(ruleBlocks(".shift-dot")).toHaveLength(0);
  });
```

- [ ] **Step 2: Run the CSS test and verify it fails**

Run:

```bash
npm run test -- src/styles/main-css.test.ts
```

Expected: FAIL because `.shift-palette` still uses `display: flex`, `.shift-palette-body`, `.shift-palette-group`, and `.shift-palette-group-label` do not exist, and `.shift-list` still contains `overflow-x: auto`.

- [ ] **Step 3: Replace the desktop shift palette CSS block**

In `src/styles/main.css`, replace the existing desktop rules from `.shift-palette {` through `.shift-button.active { ... }` with this block:

```css
.shift-palette {
  display: grid;
  gap: 8px;
  position: sticky;
  top: 12px;
  border: 1px solid #dbe3ef;
  background: #ffffff;
  padding: 8px 10px;
}

.shift-palette h2 {
  margin: 0;
  color: #475569;
  font-size: 13px;
  white-space: nowrap;
}

.shift-palette-body {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.shift-palette-group {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  min-width: 0;
}

.shift-palette-group-label {
  padding-top: 6px;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.shift-list {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
  padding-bottom: 0;
}

.shift-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-width: 44px;
  height: 30px;
  border: 0;
  border-bottom: 2px solid currentColor;
  background: transparent;
  padding: 0 8px;
  font-weight: 800;
  cursor: pointer;
}

.shift-button.active {
  background: #eff6ff;
}
```

- [ ] **Step 4: Replace the mobile shift palette CSS block**

In the existing `@media (max-width: 768px)` block in `src/styles/main.css`, replace the current mobile `.shift-palette`, `.shift-palette h2`, `.shift-list`, and `.shift-button` rules with this block:

```css
  .shift-palette {
    position: sticky;
    top: 0;
    z-index: 5;
    margin-bottom: 10px;
    padding: 7px 8px;
  }

  .shift-palette h2 {
    font-size: 12px;
  }

  .shift-palette-body {
    gap: 7px;
  }

  .shift-palette-group {
    grid-template-columns: 38px minmax(0, 1fr);
    gap: 6px;
  }

  .shift-palette-group-label {
    padding-top: 6px;
    font-size: 12px;
  }

  .shift-list {
    gap: 6px;
  }

  .shift-button {
    min-width: 42px;
    height: 28px;
    padding: 0 7px;
  }
```

- [ ] **Step 5: Run the CSS test and verify it passes**

Run:

```bash
npm run test -- src/styles/main-css.test.ts
```

Expected: PASS for `main-css.test.ts`.

- [ ] **Step 6: Commit stylesheet behavior**

Run:

```bash
git add src/styles/main.css src/styles/main-css.test.ts
git commit -m "style: wrap grouped shift palette"
```

Expected: commit succeeds with only stylesheet and stylesheet test changes.

## Task 3: Full Verification

**Files:**
- Verify: `src/components/ShiftPalette.vue`
- Verify: `src/components/ShiftPalette.test.ts`
- Verify: `src/styles/main.css`
- Verify: `src/styles/main-css.test.ts`

- [ ] **Step 1: Run focused tests together**

Run:

```bash
npm run test -- src/components/ShiftPalette.test.ts src/styles/main-css.test.ts
```

Expected: PASS for both focused test files.

- [ ] **Step 2: Run full unit test suite**

Run:

```bash
npm run test
```

Expected: PASS for all Vitest test files.

- [ ] **Step 3: Run static type verification**

Run:

```bash
npm run lint
```

Expected: PASS with no TypeScript or Vue type errors.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: PASS and Vite produces `dist/`.

- [ ] **Step 5: Check final Git status**

Run:

```bash
git status --short
```

Expected: no unstaged implementation changes. If `dist/` appears and is ignored by the repository, no action is needed. If tracked files changed during verification, inspect them before proceeding.

## Plan Self-Review

- Spec coverage: Task 1 covers component grouping, fixed ordering, disabled-shift exclusion, A/P/N palette colors, active state, and click behavior. Task 2 covers grouped wrapping layout and removal of horizontal scrolling. Task 3 covers focused and full verification.
- Scope check: No task changes system configuration, persisted shift data, SQLite schema, API types, schedule cells, print views, statistics, or settlement logic.
- Type consistency: The only new local TypeScript names are `PaletteGroupKey`, `ShiftOrderRule`, `PaletteShift`, `PaletteGroup`, `paletteGroups`, and display helper functions inside `ShiftPalette.vue`; tests reference only rendered classes and `data-testid` attributes introduced in Task 1.
