# Schedule Range Query Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated read-only `查询` tab that lets users view schedule information over any custom date range, grouped by natural week and searchable by staff name or job ID.

**Architecture:** Keep editing in the existing `排班` tab and add a separate read-only query flow. Put date-range validation and week grouping in a focused library, render read-only schedule blocks in a new component, and let `App.vue` own query state and filtering. No backend, SQLite, print, weekly summary, or settlement behavior changes.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Vitest, Vue Test Utils, existing date helpers and CSS.

---

## File Structure

- Create: `src/lib/schedule-query.ts`
  - Validates custom date ranges.
  - Expands date ranges into `CalendarDay[]`.
  - Groups queried days by natural week while keeping partial first/last weeks.
  - Flags long ranges over 180 days without blocking them.
- Create: `src/lib/schedule-query.test.ts`
  - Unit tests for malformed dates, inverted ranges, partial week grouping, and long-range warnings.
- Create: `src/components/ScheduleQueryResults.vue`
  - Renders read-only week-grouped schedule tables.
  - Uses the same core columns as the schedule grid: `排序ID`, `人员`, `类型`, dates.
  - Does not emit edit events and does not apply editable classes.
- Create: `src/components/ScheduleQueryResults.test.ts`
  - Component tests for week block titles, partial week dates, staff ordering, disabled historical labels, shift rendering, and read-only cells.
- Modify: `src/App.vue`
  - Adds the `查询` workbench tab.
  - Owns query range and staff search state.
  - Computes query validation, visible staff, filtered staff, result summary, and warning state.
  - Renders the query controls and `ScheduleQueryResults`.
- Modify: `src/App.test.ts`
  - Adds a `ScheduleQueryResults` stub and App-level integration tests.
  - Verifies query defaults, custom ranges, search, disabled historical staff, warnings, invalid state, read-only behavior, and non-interference with existing schedule operations.
- Modify: `src/styles/main.css`
  - Adds query tab layout, warning, metadata, and week block styles.
  - Keeps mobile layout stacked and readable.
- Modify: `src/styles/main-css.test.ts`
  - Adds CSS string tests matching existing style-test patterns.
- Modify: `docs/功能跟进清单.md`
  - Records the completed query tab once implementation is done.

---

### Task 1: Date Range Validation And Week Grouping

**Files:**
- Create: `src/lib/schedule-query.ts`
- Create: `src/lib/schedule-query.test.ts`

- [ ] **Step 1: Write failing schedule query utility tests**

Create `src/lib/schedule-query.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateScheduleQueryRange, type ScheduleQueryRangeResult } from "./schedule-query";

function expectOk(result: ScheduleQueryRangeResult): Extract<ScheduleQueryRangeResult, { ok: true }> {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(result.message);
  }

  return result;
}

describe("schedule query range helpers", () => {
  it("rejects missing and malformed date keys", () => {
    expect(validateScheduleQueryRange("", "2026-06-21")).toEqual({
      ok: false,
      message: "请输入完整的开始日期和结束日期",
      days: [],
      weekGroups: [],
      isLongRange: false
    });

    expect(validateScheduleQueryRange("2026-6-15", "2026-06-21")).toEqual({
      ok: false,
      message: "请输入完整的开始日期和结束日期",
      days: [],
      weekGroups: [],
      isLongRange: false
    });

    expect(validateScheduleQueryRange("2026-02-30", "2026-03-01")).toEqual({
      ok: false,
      message: "请输入完整的开始日期和结束日期",
      days: [],
      weekGroups: [],
      isLongRange: false
    });
  });

  it("rejects a range whose start date is after the end date", () => {
    expect(validateScheduleQueryRange("2026-06-22", "2026-06-21")).toEqual({
      ok: false,
      message: "开始日期不能晚于结束日期",
      days: [],
      weekGroups: [],
      isLongRange: false
    });
  });

  it("expands a valid range and groups partial natural weeks", () => {
    const result = expectOk(validateScheduleQueryRange("2026-06-18", "2026-06-24"));

    expect(result.days.map((day) => day.key)).toEqual([
      "2026-06-18",
      "2026-06-19",
      "2026-06-20",
      "2026-06-21",
      "2026-06-22",
      "2026-06-23",
      "2026-06-24"
    ]);
    expect(result.weekGroups.map((group) => `${group.start} 至 ${group.end}`)).toEqual([
      "2026-06-18 至 2026-06-21",
      "2026-06-22 至 2026-06-24"
    ]);
    expect(result.weekGroups[0].days.map((day) => day.key)).toEqual([
      "2026-06-18",
      "2026-06-19",
      "2026-06-20",
      "2026-06-21"
    ]);
    expect(result.weekGroups[1].days.map((day) => day.key)).toEqual([
      "2026-06-22",
      "2026-06-23",
      "2026-06-24"
    ]);
    expect(result.isLongRange).toBe(false);
  });

  it("allows long ranges and flags ranges over 180 days", () => {
    const result = expectOk(validateScheduleQueryRange("2026-01-01", "2026-07-01"));

    expect(result.days).toHaveLength(182);
    expect(result.weekGroups.length).toBeGreaterThan(20);
    expect(result.isLongRange).toBe(true);
  });
});
```

- [ ] **Step 2: Run the new utility tests and confirm failure**

Run:

```bash
npm run test -- src/lib/schedule-query.test.ts
```

Expected: FAIL because `src/lib/schedule-query.ts` does not exist.

- [ ] **Step 3: Implement date validation and week grouping**

Create `src/lib/schedule-query.ts`:

```ts
import type { CalendarDay } from "./date";
import { addDays, getWeekRange, parseDateKey, toDateKey } from "./date";

export interface ScheduleQueryWeekGroup {
  id: string;
  start: string;
  end: string;
  days: CalendarDay[];
}

export type ScheduleQueryRangeResult =
  | {
      ok: true;
      message: "";
      days: CalendarDay[];
      weekGroups: ScheduleQueryWeekGroup[];
      isLongRange: boolean;
    }
  | {
      ok: false;
      message: string;
      days: [];
      weekGroups: [];
      isLongRange: false;
    };

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LONG_RANGE_WARNING_DAYS = 180;

function isValidDateKey(value: string): boolean {
  if (!DATE_KEY_PATTERN.test(value)) {
    return false;
  }

  const parsed = parseDateKey(value);
  return !Number.isNaN(parsed.getTime()) && toDateKey(parsed) === value;
}

function calendarDayFromKey(key: string): CalendarDay {
  const date = parseDateKey(key);
  const weekday = date.getDay();

  return {
    key,
    dayOfMonth: date.getDate(),
    weekday,
    weekdayName: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][weekday],
    isWeekend: weekday === 0 || weekday === 6
  };
}

function expandDateRange(startDate: string, endDate: string): CalendarDay[] {
  const days: CalendarDay[] = [];
  let cursor = startDate;

  while (cursor <= endDate) {
    days.push(calendarDayFromKey(cursor));
    cursor = addDays(cursor, 1);
  }

  return days;
}

function groupDaysByNaturalWeek(days: CalendarDay[]): ScheduleQueryWeekGroup[] {
  const groups: ScheduleQueryWeekGroup[] = [];

  for (const day of days) {
    const weekStart = getWeekRange(day.key).start;
    const lastGroup = groups[groups.length - 1];

    if (!lastGroup || lastGroup.id !== weekStart) {
      groups.push({
        id: weekStart,
        start: day.key,
        end: day.key,
        days: [day]
      });
      continue;
    }

    lastGroup.days.push(day);
    lastGroup.end = day.key;
  }

  return groups;
}

export function validateScheduleQueryRange(startDate: string, endDate: string): ScheduleQueryRangeResult {
  const normalizedStart = startDate.trim();
  const normalizedEnd = endDate.trim();

  if (!isValidDateKey(normalizedStart) || !isValidDateKey(normalizedEnd)) {
    return {
      ok: false,
      message: "请输入完整的开始日期和结束日期",
      days: [],
      weekGroups: [],
      isLongRange: false
    };
  }

  if (normalizedStart > normalizedEnd) {
    return {
      ok: false,
      message: "开始日期不能晚于结束日期",
      days: [],
      weekGroups: [],
      isLongRange: false
    };
  }

  const days = expandDateRange(normalizedStart, normalizedEnd);

  return {
    ok: true,
    message: "",
    days,
    weekGroups: groupDaysByNaturalWeek(days),
    isLongRange: days.length > LONG_RANGE_WARNING_DAYS
  };
}
```

- [ ] **Step 4: Run utility tests and verify they pass**

Run:

```bash
npm run test -- src/lib/schedule-query.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit date utility work**

Run:

```bash
git add src/lib/schedule-query.ts src/lib/schedule-query.test.ts
git commit -m "feat: add schedule query date grouping"
```

---

### Task 2: Read-Only Query Results Component

**Files:**
- Create: `src/components/ScheduleQueryResults.vue`
- Create: `src/components/ScheduleQueryResults.test.ts`

- [ ] **Step 1: Write failing component tests**

Create `src/components/ScheduleQueryResults.test.ts`:

```ts
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ScheduleQueryResults from "./ScheduleQueryResults.vue";
import type { ScheduleQueryWeekGroup } from "@/lib/schedule-query";
import type { Holiday, ScheduleEntry, Shift, StaffMember } from "@/types/domain";

const weekGroups: ScheduleQueryWeekGroup[] = [
  {
    id: "2026-06-15",
    start: "2026-06-18",
    end: "2026-06-21",
    days: [
      { key: "2026-06-18", dayOfMonth: 18, weekday: 4, weekdayName: "周四", isWeekend: false },
      { key: "2026-06-19", dayOfMonth: 19, weekday: 5, weekdayName: "周五", isWeekend: false },
      { key: "2026-06-20", dayOfMonth: 20, weekday: 6, weekdayName: "周六", isWeekend: true },
      { key: "2026-06-21", dayOfMonth: 21, weekday: 0, weekdayName: "周日", isWeekend: true }
    ]
  },
  {
    id: "2026-06-22",
    start: "2026-06-22",
    end: "2026-06-24",
    days: [
      { key: "2026-06-22", dayOfMonth: 22, weekday: 1, weekdayName: "周一", isWeekend: false },
      { key: "2026-06-23", dayOfMonth: 23, weekday: 2, weekdayName: "周二", isWeekend: false },
      { key: "2026-06-24", dayOfMonth: 24, weekday: 3, weekdayName: "周三", isWeekend: false }
    ]
  }
];

const staff: StaffMember[] = [
  {
    id: "staff-nurse",
    jobId: "N001",
    name: "李护士",
    type: "nurse",
    isAdmin: false,
    enabled: true,
    sortOrder: 2
  },
  {
    id: "staff-head",
    jobId: "H001",
    name: "段护士长",
    type: "head_nurse",
    isAdmin: true,
    enabled: true,
    sortOrder: 1
  },
  {
    id: "staff-disabled",
    jobId: "D001",
    name: "停用护士",
    type: "nurse",
    isAdmin: false,
    enabled: false,
    sortOrder: 3
  }
];

const shifts: Shift[] = [
  {
    id: "shift-a1",
    name: "A1",
    shortName: "A1",
    color: "#2563EB",
    countsAttendance: true,
    coefficient: 1.2,
    enabled: true,
    sortOrder: 1
  }
];

const holidays: Holiday[] = [
  {
    id: "holiday-dragon",
    date: "2026-06-19",
    name: "端午节",
    affectsRequiredShifts: true
  }
];

const entries: ScheduleEntry[] = [
  {
    id: "entry-nurse",
    date: "2026-06-19",
    staffId: "staff-nurse",
    shiftIds: ["shift-a1"],
    note: ""
  },
  {
    id: "entry-disabled",
    date: "2026-06-23",
    staffId: "staff-disabled",
    shiftIds: ["shift-a1"],
    note: ""
  }
];

function mountResults(overrides: Partial<InstanceType<typeof ScheduleQueryResults>["$props"]> = {}) {
  return mount(ScheduleQueryResults, {
    props: {
      weekGroups,
      staff,
      holidays,
      shifts,
      entries,
      ...overrides
    }
  });
}

describe("ScheduleQueryResults", () => {
  it("renders natural week blocks with partial date ranges", () => {
    const wrapper = mountResults();

    expect(wrapper.findAll('[data-testid="schedule-query-week-title"]').map((item) => item.text())).toEqual([
      "2026-06-18 至 2026-06-21",
      "2026-06-22 至 2026-06-24"
    ]);
    expect(wrapper.findAll('[data-testid="schedule-query-week-days"]').map((item) => item.text())).toEqual([
      "2026-06-18,2026-06-19,2026-06-20,2026-06-21",
      "2026-06-22,2026-06-23,2026-06-24"
    ]);
  });

  it("uses schedule columns, staff ordering, staff type labels, and disabled historical labels", () => {
    const wrapper = mountResults();

    const firstBlockRows = wrapper.findAll('[data-testid="schedule-query-week-block"]')[0].findAll("tbody tr");

    expect(firstBlockRows.map((row) => row.get(".sort-col").text())).toEqual(["1", "2", "3"]);
    expect(firstBlockRows.map((row) => row.get(".type-col").text())).toEqual(["护士长", "护士", "护士"]);
    expect(firstBlockRows[0].get(".person-col").text()).toContain("段护士长");
    expect(firstBlockRows[0].get(".person-col").text()).toContain("H001");
    expect(firstBlockRows[2].text()).toContain("停用历史");
  });

  it("renders holidays and shift text without editable cell affordances", async () => {
    const wrapper = mountResults();

    expect(wrapper.get('[data-testid="schedule-query-cell-staff-nurse-2026-06-19"]').text()).toContain("A1");
    expect(wrapper.get('[data-testid="schedule-query-week-block"]').text()).toContain("端午节");
    expect(wrapper.find(".editable").exists()).toBe(false);

    await wrapper.get('[data-testid="schedule-query-cell-staff-nurse-2026-06-19"]').trigger("click");

    expect(wrapper.emitted()).toEqual({});
  });
});
```

- [ ] **Step 2: Run component tests and confirm failure**

Run:

```bash
npm run test -- src/components/ScheduleQueryResults.test.ts
```

Expected: FAIL because `ScheduleQueryResults.vue` does not exist.

- [ ] **Step 3: Implement the read-only query results component**

Create `src/components/ScheduleQueryResults.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { ScheduleQueryWeekGroup } from "@/lib/schedule-query";
import type { Holiday, ScheduleEntry, Shift, StaffMember, StaffType } from "@/types/domain";

const props = defineProps<{
  weekGroups: ScheduleQueryWeekGroup[];
  staff: StaffMember[];
  holidays: Holiday[];
  shifts: Shift[];
  entries: ScheduleEntry[];
}>();

const STAFF_TYPE_LABELS: Record<StaffType, string> = {
  head_nurse: "护士长",
  nurse: "护士",
  clerk: "文员"
};

const SORT_COLUMN_WIDTH = 54;
const TYPE_COLUMN_WIDTH = 58;
const SORT_COLUMN_MOBILE_WIDTH = 42;
const TYPE_COLUMN_MOBILE_WIDTH = 46;

const holidayMap = computed(() => new Map(props.holidays.map((holiday) => [holiday.date, holiday])));
const shiftMap = computed(() => new Map(props.shifts.map((shift) => [shift.id, shift])));
const entryMap = computed(() => new Map(props.entries.map((entry) => [`${entry.date}__${entry.staffId}`, entry])));
const sortedStaff = computed(() => [...props.staff].sort((left, right) => left.sortOrder - right.sortOrder));
const personColumnStyle = computed(() => {
  const longestNameUnits = Math.max(2, ...sortedStaff.value.map((person) => measureDisplayUnits(person.name)));
  const personColumnWidth = clamp(Math.ceil(longestNameUnits * 12 + 40), 64, 104);
  const personColumnMobileWidth = clamp(Math.ceil(longestNameUnits * 12 + 32), 56, 88);

  return {
    "--sort-col-width": `${SORT_COLUMN_WIDTH}px`,
    "--person-col-width": `${personColumnWidth}px`,
    "--type-col-width": `${TYPE_COLUMN_WIDTH}px`,
    "--person-col-left": `${SORT_COLUMN_WIDTH}px`,
    "--type-col-left": `${SORT_COLUMN_WIDTH + personColumnWidth}px`,
    "--sort-col-mobile-width": `${SORT_COLUMN_MOBILE_WIDTH}px`,
    "--person-col-mobile-width": `${personColumnMobileWidth}px`,
    "--type-col-mobile-width": `${TYPE_COLUMN_MOBILE_WIDTH}px`,
    "--person-col-mobile-left": `${SORT_COLUMN_MOBILE_WIDTH}px`,
    "--type-col-mobile-left": `${SORT_COLUMN_MOBILE_WIDTH + personColumnMobileWidth}px`
  };
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function measureDisplayUnits(text: string): number {
  return [...text.trim()].reduce((total, character) => {
    return total + (/^[\u0000-\u00ff]$/.test(character) ? 0.55 : 1);
  }, 0);
}

function entryFor(staffId: string, date: string): ScheduleEntry | null {
  return entryMap.value.get(`${date}__${staffId}`) ?? null;
}

function staffTypeLabel(staff: StaffMember): string {
  return STAFF_TYPE_LABELS[staff.type];
}
</script>

<template>
  <section class="schedule-query-results" data-testid="schedule-query-results">
    <article
      v-for="group in weekGroups"
      :key="group.id"
      class="schedule-query-week"
      data-testid="schedule-query-week-block"
    >
      <h3 class="schedule-query-week-title" data-testid="schedule-query-week-title">
        {{ group.start }} 至 {{ group.end }}
      </h3>
      <span class="sr-only" data-testid="schedule-query-week-days">
        {{ group.days.map((day) => day.key).join(",") }}
      </span>
      <section class="schedule-grid-wrap schedule-query-grid-wrap">
        <table class="schedule-grid schedule-query-grid" :style="personColumnStyle">
          <thead>
            <tr>
              <th class="sticky-col sort-col">排序ID</th>
              <th class="sticky-col person-col">人员</th>
              <th class="sticky-col type-col">类型</th>
              <th
                v-for="day in group.days"
                :key="day.key"
                :class="{ weekend: day.isWeekend, holiday: holidayMap.has(day.key) }"
              >
                <span>{{ day.dayOfMonth }}</span>
                <small>{{ day.weekdayName }}</small>
                <em v-if="holidayMap.has(day.key)">{{ holidayMap.get(day.key)?.name }}</em>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="person in sortedStaff" :key="`${group.id}-${person.id}`" :class="{ 'disabled-historical-row': !person.enabled }">
              <th class="sticky-col sort-col">{{ person.sortOrder }}</th>
              <th class="sticky-col person-col">
                <strong>{{ person.name }}</strong>
                <small>{{ person.jobId }}</small>
                <small v-if="!person.enabled" class="historical-staff-label">停用历史</small>
              </th>
              <td class="sticky-col type-col">{{ staffTypeLabel(person) }}</td>
              <td
                v-for="day in group.days"
                :key="`${person.id}-${day.key}`"
                :data-testid="`schedule-query-cell-${person.id}-${day.key}`"
                :class="{ weekend: day.isWeekend, holiday: holidayMap.has(day.key) }"
              >
                <div class="cell-shifts">
                  <span
                    v-for="shiftId in entryFor(person.id, day.key)?.shiftIds ?? []"
                    :key="shiftId"
                    class="shift-chip"
                    :style="{ color: shiftMap.get(shiftId)?.color, borderColor: shiftMap.get(shiftId)?.color }"
                  >
                    {{ shiftMap.get(shiftId)?.shortName }}
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </article>
  </section>
</template>
```

- [ ] **Step 4: Run component tests and verify they pass**

Run:

```bash
npm run test -- src/components/ScheduleQueryResults.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit query results component**

Run:

```bash
git add src/components/ScheduleQueryResults.vue src/components/ScheduleQueryResults.test.ts
git commit -m "feat: add read-only schedule query results"
```

---

### Task 3: App-Level Query Tab Integration

**Files:**
- Modify: `src/App.vue`
- Modify: `src/App.test.ts`

- [ ] **Step 1: Add failing App integration tests**

In `src/App.test.ts`, add a `ScheduleQueryResultsStub` near `ScheduleGridStub`:

```ts
const ScheduleQueryResultsStub = defineComponent({
  name: "ScheduleQueryResults",
  props: ["weekGroups", "staff", "entries"],
  emits: ["quickFill", "editCell"],
  template: `
    <section data-testid="schedule-query-results">
      <span data-testid="query-week-groups">
        {{ weekGroups.map((group) => group.start + '-' + group.end + ':' + group.days.map((day) => day.key).join('|')).join(';') }}
      </span>
      <span data-testid="query-staff-ids">{{ staff.map((person) => person.id).join(",") }}</span>
      <span data-testid="query-entry-count">{{ entries.length }}</span>
      <button data-testid="query-emit-quick-fill" type="button" @click="$emit('quickFill', 'staff-nurse-001', '2026-06-19')">
        query quick fill
      </button>
      <button data-testid="query-emit-edit-cell" type="button" @click="$emit('editCell', 'staff-nurse-001', '2026-06-19')">
        query edit
      </button>
    </section>
  `
});
```

Add it to `global.stubs` in `mountApp`:

```ts
ScheduleQueryResults: ScheduleQueryResultsStub,
```

Add these tests near the current schedule search tests:

```ts
it("adds a read-only query tab between schedule and weekly with current week defaults", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 17));
  const wrapper = mountApp(twoStaffData);

  await flushPromises();

  expect(wrapper.findAll(".workbench-tabs button").map((button) => button.text())).toEqual([
    "排班",
    "查询",
    "周统计",
    "月结与奖金"
  ]);

  await wrapper.get('[data-testid="workbench-tab-query"]').trigger("click");
  await nextTick();

  expectPanelVisible(wrapper, "workbench-panel-query");
  expect((wrapper.get('[data-testid="schedule-query-start-date"]').element as HTMLInputElement).value).toBe("2026-06-15");
  expect((wrapper.get('[data-testid="schedule-query-end-date"]').element as HTMLInputElement).value).toBe("2026-06-21");
  expect(wrapper.get('[data-testid="query-week-groups"]').text()).toContain(
    "2026-06-15-2026-06-21:2026-06-15|2026-06-16|2026-06-17|2026-06-18|2026-06-19|2026-06-20|2026-06-21"
  );
  expect(wrapper.get('[data-testid="schedule-query-summary"]').text()).toBe("已显示 2 / 2 人；日期 7 天；共 1 周");
  vi.useRealTimers();
});

it("renders a custom query range as partial natural-week blocks", async () => {
  const wrapper = mountApp(twoStaffData);

  await flushPromises();
  await wrapper.get('[data-testid="workbench-tab-query"]').trigger("click");
  await wrapper.get('[data-testid="schedule-query-start-date"]').setValue("2026-06-18");
  await wrapper.get('[data-testid="schedule-query-end-date"]').setValue("2026-06-24");
  await nextTick();

  expect(wrapper.get('[data-testid="query-week-groups"]').text()).toContain(
    "2026-06-18-2026-06-21:2026-06-18|2026-06-19|2026-06-20|2026-06-21;2026-06-22-2026-06-24:2026-06-22|2026-06-23|2026-06-24"
  );
  expect(wrapper.get('[data-testid="schedule-query-summary"]').text()).toBe("已显示 2 / 2 人；日期 7 天；共 2 周");
});

it("filters query results by trimmed case-insensitive staff name or job id", async () => {
  const wrapper = mountApp(mixedCaseStaffData);

  await flushPromises();
  await wrapper.get('[data-testid="workbench-tab-query"]').trigger("click");
  await wrapper.get('[data-testid="schedule-query-staff-search"]').setValue(" abc003 ");
  await nextTick();

  expect(wrapper.get('[data-testid="query-staff-ids"]').text()).toBe("staff-clerk-abc");
  expect(wrapper.get('[data-testid="schedule-query-summary"]').text()).toBe("已显示 1 / 3 人；日期 7 天；共 1 周");

  await wrapper.get('[data-testid="schedule-query-staff-search"]').setValue("王护士");
  await nextTick();

  expect(wrapper.get('[data-testid="query-staff-ids"]').text()).toBe("staff-nurse-002");
});

it("shows disabled historical staff only when they have entries in the query range", async () => {
  const disabledData: PublicAppData = {
    ...twoStaffData,
    staff: [
      ...twoStaffData.staff,
      {
        id: "staff-disabled-history",
        jobId: "D001",
        name: "停用护士",
        type: "nurse",
        isAdmin: false,
        enabled: false,
        sortOrder: 3
      }
    ],
    scheduleEntries: [
      ...twoStaffData.scheduleEntries,
      {
        id: "entry-disabled-history",
        date: "2026-06-24",
        staffId: "staff-disabled-history",
        shiftIds: ["shift-a1"],
        note: ""
      }
    ]
  };
  const wrapper = mountApp(disabledData);

  await flushPromises();
  await wrapper.get('[data-testid="workbench-tab-query"]').trigger("click");

  expect(wrapper.get('[data-testid="query-staff-ids"]').text()).toBe("staff-nurse-001,staff-nurse-002");

  await wrapper.get('[data-testid="schedule-query-end-date"]').setValue("2026-06-24");
  await nextTick();

  expect(wrapper.get('[data-testid="query-staff-ids"]').text()).toBe(
    "staff-nurse-001,staff-nurse-002,staff-disabled-history"
  );
});

it("warns for long query ranges without blocking the results", async () => {
  const wrapper = mountApp(twoStaffData);

  await flushPromises();
  await wrapper.get('[data-testid="workbench-tab-query"]').trigger("click");
  await wrapper.get('[data-testid="schedule-query-start-date"]').setValue("2026-01-01");
  await wrapper.get('[data-testid="schedule-query-end-date"]').setValue("2026-07-01");
  await nextTick();

  expect(wrapper.get('[data-testid="schedule-query-warning"]').text()).toBe("当前查询范围较长，结果较多，加载和滚动可能变慢。");
  expect(wrapper.find('[data-testid="schedule-query-results"]').exists()).toBe(true);
  expect(wrapper.get('[data-testid="schedule-query-summary"]').text()).toContain("日期 182 天");
});

it("shows query validation errors and hides stale query results", async () => {
  const wrapper = mountApp(twoStaffData);

  await flushPromises();
  await wrapper.get('[data-testid="workbench-tab-query"]').trigger("click");
  expect(wrapper.find('[data-testid="schedule-query-results"]').exists()).toBe(true);

  await wrapper.get('[data-testid="schedule-query-start-date"]').setValue("2026-07-01");
  await wrapper.get('[data-testid="schedule-query-end-date"]').setValue("2026-06-01");
  await nextTick();

  expect(wrapper.get('[data-testid="schedule-query-error"]').text()).toBe("开始日期不能晚于结束日期");
  expect(wrapper.find('[data-testid="schedule-query-results"]').exists()).toBe(false);
});

it("keeps query tab cells read-only and does not trigger schedule edits", async () => {
  apiMocks.saveScheduleEntry.mockResolvedValue(structuredClone(twoStaffData));
  const wrapper = mountApp(twoStaffData);

  await flushPromises();
  await wrapper.get('[data-testid="workbench-tab-query"]').trigger("click");
  await wrapper.get('[data-testid="select-shift-a1"]').trigger("click");
  await wrapper.get('[data-testid="query-emit-quick-fill"]').trigger("click");
  await wrapper.get('[data-testid="query-emit-edit-cell"]').trigger("click");
  await flushPromises();

  expect(apiMocks.saveScheduleEntry).not.toHaveBeenCalled();
  expect(wrapper.find('[data-testid="cell-editor"]').exists()).toBe(false);
});

it("does not let query range state change current-week batch operations", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 17));
  apiMocks.bulkUpdateWeekSchedule.mockResolvedValue({
    data: structuredClone(twoStaffData),
    result: { updated: 14, skipped: 0 }
  });
  const wrapper = mountApp(twoStaffData);

  await flushPromises();
  await wrapper.get('[data-testid="workbench-tab-query"]').trigger("click");
  await wrapper.get('[data-testid="schedule-query-start-date"]').setValue("2026-01-01");
  await wrapper.get('[data-testid="schedule-query-end-date"]').setValue("2026-07-01");
  await wrapper.get('[data-testid="workbench-tab-schedule"]').trigger("click");
  await wrapper.get('[data-testid="batch-office-week-button"]').trigger("click");
  await flushPromises();

  expect(apiMocks.bulkUpdateWeekSchedule).toHaveBeenCalledWith({
    weekStart: "2026-06-15",
    operation: "set-shift",
    shiftId: "shift-office",
    mode: "overwrite"
  });
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run App tests and confirm failure**

Run:

```bash
npm run test -- src/App.test.ts
```

Expected: FAIL because the query tab, inputs, summary, and `ScheduleQueryResults` integration do not exist yet.

- [ ] **Step 3: Add query tab imports, tab key, state, and computed values**

In `src/App.vue`, update imports:

```ts
import { computed, onMounted, ref, watch } from "vue";
import ScheduleQueryResults from "@/components/ScheduleQueryResults.vue";
import { validateScheduleQueryRange } from "@/lib/schedule-query";
```

Update the tab type and list:

```ts
type WorkbenchTab = "schedule" | "query" | "weekly" | "bonus";

const workbenchTabs: Array<{ key: WorkbenchTab; label: string }> = [
  { key: "schedule", label: "排班" },
  { key: "query", label: "查询" },
  { key: "weekly", label: "周统计" },
  { key: "bonus", label: "月结与奖金" }
];
```

Add query state after `scheduleStaffQuery`:

```ts
const scheduleQueryStartDate = ref(getWeekRange(today).start);
const scheduleQueryEndDate = ref(getWeekRange(today).end);
const scheduleQueryStaffQuery = ref("");
const scheduleQueryRangeDirty = ref(false);
```

Add computed values after the current schedule staff search computed values:

```ts
const scheduleQueryRange = computed(() => validateScheduleQueryRange(scheduleQueryStartDate.value, scheduleQueryEndDate.value));
const scheduleQueryDays = computed(() => (scheduleQueryRange.value.ok ? scheduleQueryRange.value.days : []));
const scheduleQueryWeekGroups = computed(() => (scheduleQueryRange.value.ok ? scheduleQueryRange.value.weekGroups : []));
const scheduleQueryDateKeys = computed(() => new Set(scheduleQueryDays.value.map((day) => day.key)));
const scheduleQueryStaffWithEntries = computed(() => {
  if (!data.value) {
    return new Set<string>();
  }

  return new Set(
    data.value.scheduleEntries
      .filter((entry) => scheduleQueryDateKeys.value.has(entry.date))
      .map((entry) => entry.staffId)
  );
});
const scheduleQueryVisibleStaff = computed<StaffMember[]>(() => {
  if (!data.value || !scheduleQueryRange.value.ok) {
    return [];
  }

  return data.value.staff.filter((staff) => staff.enabled || scheduleQueryStaffWithEntries.value.has(staff.id));
});
const normalizedScheduleQueryStaffQuery = computed(() => scheduleQueryStaffQuery.value.trim().toLowerCase());
const filteredScheduleQueryStaff = computed<StaffMember[]>(() => {
  const query = normalizedScheduleQueryStaffQuery.value;

  if (!query) {
    return scheduleQueryVisibleStaff.value;
  }

  return scheduleQueryVisibleStaff.value.filter((staff) => {
    return staff.name.toLowerCase().includes(query) || staff.jobId.toLowerCase().includes(query);
  });
});
const hasScheduleQueryStaffSearch = computed(() => normalizedScheduleQueryStaffQuery.value.length > 0);
const hasScheduleQueryResults = computed(() => scheduleQueryRange.value.ok && filteredScheduleQueryStaff.value.length > 0);
const scheduleQuerySummary = computed(() => {
  if (!scheduleQueryRange.value.ok) {
    return "";
  }

  return `已显示 ${filteredScheduleQueryStaff.value.length} / ${scheduleQueryVisibleStaff.value.length} 人；日期 ${scheduleQueryDays.value.length} 天；共 ${scheduleQueryWeekGroups.value.length} 周`;
});
const scheduleQueryWarning = computed(() =>
  scheduleQueryRange.value.ok && scheduleQueryRange.value.isLongRange ? "当前查询范围较长，结果较多，加载和滚动可能变慢。" : ""
);
const scheduleQueryError = computed(() => (scheduleQueryRange.value.ok ? "" : scheduleQueryRange.value.message));
```

Add a watcher and handlers near other small UI handlers:

```ts
watch(selectedWeek, (week) => {
  if (scheduleQueryRangeDirty.value) {
    return;
  }

  scheduleQueryStartDate.value = week.start;
  scheduleQueryEndDate.value = week.end;
});

function markScheduleQueryRangeDirty(): void {
  scheduleQueryRangeDirty.value = true;
}

function clearScheduleQuery(): void {
  scheduleQueryStaffQuery.value = "";
  scheduleQueryStartDate.value = selectedWeek.value.start;
  scheduleQueryEndDate.value = selectedWeek.value.end;
  scheduleQueryRangeDirty.value = false;
}
```

- [ ] **Step 4: Add query tab template**

In `src/App.vue`, add this query panel between the schedule and weekly panels:

```vue
<section v-show="activeWorkbenchTab === 'query'" class="workbench-tab-panel" data-testid="workbench-panel-query">
  <section class="schedule-query-panel">
    <div class="schedule-search schedule-query-controls" role="search" aria-label="排班范围查询">
      <label class="schedule-search-label schedule-query-date-field" for="schedule-query-start-date">
        开始日期
        <input
          id="schedule-query-start-date"
          v-model="scheduleQueryStartDate"
          class="schedule-search-input"
          data-testid="schedule-query-start-date"
          type="date"
          @input="markScheduleQueryRangeDirty"
        />
      </label>
      <label class="schedule-search-label schedule-query-date-field" for="schedule-query-end-date">
        结束日期
        <input
          id="schedule-query-end-date"
          v-model="scheduleQueryEndDate"
          class="schedule-search-input"
          data-testid="schedule-query-end-date"
          type="date"
          @input="markScheduleQueryRangeDirty"
        />
      </label>
      <label class="schedule-search-label schedule-query-staff-field" for="schedule-query-staff-search">
        搜索人员
        <input
          id="schedule-query-staff-search"
          v-model="scheduleQueryStaffQuery"
          class="schedule-search-input"
          data-testid="schedule-query-staff-search"
          type="search"
          placeholder="输入姓名或工号"
        />
      </label>
      <span v-if="scheduleQuerySummary" class="schedule-query-meta" data-testid="schedule-query-summary">
        {{ scheduleQuerySummary }}
      </span>
      <button
        class="schedule-search-clear"
        data-testid="clear-schedule-query"
        type="button"
        @click="clearScheduleQuery"
      >
        清空条件
      </button>
    </div>
    <p v-if="scheduleQueryError" class="schedule-search-empty schedule-query-error" data-testid="schedule-query-error">
      {{ scheduleQueryError }}
    </p>
    <p v-else-if="scheduleQueryWarning" class="schedule-query-warning" data-testid="schedule-query-warning">
      {{ scheduleQueryWarning }}
    </p>
    <p
      v-if="scheduleQueryRange.ok && hasScheduleQueryStaffSearch && !hasScheduleQueryResults"
      class="schedule-search-empty"
      data-testid="schedule-query-empty"
    >
      未找到匹配人员
    </p>
    <ScheduleQueryResults
      v-if="hasScheduleQueryResults"
      :week-groups="scheduleQueryWeekGroups"
      :staff="filteredScheduleQueryStaff"
      :holidays="data.holidays"
      :shifts="data.shifts"
      :entries="data.scheduleEntries"
    />
  </section>
</section>
```

Do not attach `@quick-fill`, `@edit-cell`, or any save handler to `ScheduleQueryResults`.

- [ ] **Step 5: Run App tests and verify they pass**

Run:

```bash
npm run test -- src/App.test.ts
```

Expected: PASS. The total test count should increase by 8.

- [ ] **Step 6: Commit App integration**

Run:

```bash
git add src/App.vue src/App.test.ts
git commit -m "feat: add read-only schedule query tab"
```

---

### Task 4: Query Tab Styling

**Files:**
- Modify: `src/styles/main.css`
- Modify: `src/styles/main-css.test.ts`

- [ ] **Step 1: Add failing CSS tests**

In `src/styles/main-css.test.ts`, add these tests near the existing schedule search CSS tests:

```ts
it("styles the schedule query controls and week blocks", () => {
  const panelRules = ruleBlocks(".schedule-query-panel")[0] ?? "";
  const controlsRules = ruleBlocks(".schedule-query-controls")[0] ?? "";
  const dateFieldRules = ruleBlocks(".schedule-query-date-field")[0] ?? "";
  const metaRules = ruleBlocks(".schedule-query-meta")[0] ?? "";
  const warningRules = ruleBlocks(".schedule-query-warning")[0] ?? "";
  const resultsRules = ruleBlocks(".schedule-query-results")[0] ?? "";
  const weekRules = ruleBlocks(".schedule-query-week")[0] ?? "";
  const titleRules = ruleBlocks(".schedule-query-week-title")[0] ?? "";
  const gridRules = ruleBlocks(".schedule-query-grid")[0] ?? "";

  expect(panelRules).toContain("display: grid");
  expect(panelRules).toContain("gap: 12px");
  expect(controlsRules).toContain("align-items: end");
  expect(dateFieldRules).toContain("display: grid");
  expect(dateFieldRules).toContain("gap: 4px");
  expect(metaRules).toContain("font-weight: 800");
  expect(warningRules).toContain("border: 1px solid #fde68a");
  expect(resultsRules).toContain("display: grid");
  expect(resultsRules).toContain("gap: 12px");
  expect(weekRules).toContain("border: 1px solid #dbe3ef");
  expect(titleRules).toContain("font-size: 15px");
  expect(gridRules).toContain("margin: 0");
});

it("stacks schedule query controls on mobile", () => {
  const mobileCss = mediaBlock("(max-width: 768px)");
  const mobileControls = ruleBlockIn(mobileCss, ".schedule-query-controls");
  const mobileField = ruleBlockIn(mobileCss, ".schedule-query-date-field");
  const mobileMeta = ruleBlockIn(mobileCss, ".schedule-query-meta");

  expect(mobileControls).toContain("display: grid");
  expect(mobileControls).toContain("grid-template-columns: 1fr");
  expect(mobileField).toContain("width: 100%");
  expect(mobileMeta).toContain("white-space: normal");
});
```

- [ ] **Step 2: Run CSS tests and confirm failure**

Run:

```bash
npm run test -- src/styles/main-css.test.ts
```

Expected: FAIL because query tab styles do not exist.

- [ ] **Step 3: Add query tab styles**

In `src/styles/main.css`, add this block after the existing `.schedule-search-empty` rules:

```css
.schedule-query-panel {
  display: grid;
  gap: 12px;
}

.schedule-query-controls {
  align-items: end;
}

.schedule-query-date-field,
.schedule-query-staff-field {
  display: grid;
  gap: 4px;
}

.schedule-query-date-field {
  flex: 0 1 170px;
}

.schedule-query-staff-field {
  flex: 1 1 220px;
}

.schedule-query-meta {
  color: #334155;
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
}

.schedule-query-warning {
  margin: 0;
  border: 1px solid #fde68a;
  background: #fffbeb;
  padding: 10px 12px;
  color: #92400e;
  font-weight: 800;
}

.schedule-query-results {
  display: grid;
  gap: 12px;
}

.schedule-query-week {
  border: 1px solid #dbe3ef;
  background: #ffffff;
}

.schedule-query-week-title {
  margin: 0;
  border-bottom: 1px solid #dbe3ef;
  background: #f8fafc;
  padding: 10px 12px;
  color: #1e3a8a;
  font-size: 15px;
  font-weight: 900;
}

.schedule-query-grid-wrap {
  border: 0;
}

.schedule-query-grid {
  margin: 0;
}

.schedule-query-grid td {
  cursor: default;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
```

In the existing `@media (max-width: 768px)` block, add this after the mobile `.schedule-search` rules:

```css
  .schedule-query-controls {
    display: grid;
    grid-template-columns: 1fr;
  }

  .schedule-query-date-field,
  .schedule-query-staff-field {
    width: 100%;
  }

  .schedule-query-meta {
    white-space: normal;
  }
```

- [ ] **Step 4: Run CSS tests and verify they pass**

Run:

```bash
npm run test -- src/styles/main-css.test.ts
```

Expected: PASS. The CSS test count should increase by 2.

- [ ] **Step 5: Commit query tab styles**

Run:

```bash
git add src/styles/main.css src/styles/main-css.test.ts
git commit -m "style: add schedule query layout"
```

---

### Task 5: Documentation And Verification

**Files:**
- Modify: `docs/功能跟进清单.md`

- [ ] **Step 1: Update feature tracking documentation**

In `docs/功能跟进清单.md`, update `更新时间` to `2026-06-22` if needed.

In `### 1.1 排班工作台`, add this bullet after the current schedule search bullet:

```md
- 支持独立只读查询 tab，可按自定义开始日期、结束日期、姓名或工号查询排班；查询结果按自然周分块展示，长时间范围仅提示性能风险，不限制查询。
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
npm run test -- src/lib/schedule-query.test.ts src/components/ScheduleQueryResults.test.ts src/App.test.ts src/styles/main-css.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the full test suite**

Run:

```bash
npm run test
```

Expected: PASS. If `server/routes.test.ts` fails with `listen EPERM: operation not permitted 0.0.0.0` in a sandboxed environment, rerun the same command with elevated permissions because the API tests need local listen permissions.

- [ ] **Step 4: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS. Existing Vite/Rollup chunk-size and PURE-comment warnings are acceptable if there are no type or build errors.

- [ ] **Step 5: Commit documentation**

Run:

```bash
git add docs/功能跟进清单.md
git commit -m "docs: document schedule range query"
```

- [ ] **Step 6: Manual smoke check**

If the local dev server is available, open the app and verify:

```text
1. 登录后能看到 tab 顺序：排班、查询、周统计、月结与奖金。
2. 查询 tab 默认显示当前周。
3. 设置 2026-06-18 至 2026-06-24 后显示两个周块。
4. 输入姓名或工号后人员行过滤。
5. 查询 tab 中点击格子不会打开编辑弹窗。
6. 回到排班 tab 后当前周编辑和批量按钮仍按原逻辑工作。
```

Do not require manual smoke check to pass in CI-only environments; automated tests are the acceptance gate.

---

## Final Verification Commands

Run these before marking implementation complete:

```bash
npm run test -- src/lib/schedule-query.test.ts src/components/ScheduleQueryResults.test.ts src/App.test.ts src/styles/main-css.test.ts
npm run test
npm run build
```

Expected:

- Focused tests pass.
- Full test suite passes.
- Build passes with no type errors.

## Implementation Notes

- Do not modify backend routes, SQLite schema, storage code, print views, weekly summary, monthly settlement, or bonus allocation.
- Do not make query tab cells editable.
- Do not wire query tab cells to `handleQuickFill`, `handleEditCell`, or `saveEntry`.
- Do not make batch actions use the query date range.
- Keep the existing schedule tab staff search scoped to the selected week.
