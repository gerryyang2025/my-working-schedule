# Schedule Staff Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在排班 tab 中支持按人员姓名或工号搜索排班表人员行，帮助用户快速定位对应人员排班。

**Architecture:** 搜索状态放在 `App.vue`，由 App 计算当前周排班表可见人员，再按姓名或工号筛选后传给 `ScheduleGrid`。`ScheduleGrid` 继续负责排序、固定列、历史停用人员展示和单元格交互；后端、SQLite、周统计、月结、打印/PDF 均不参与搜索。

**Tech Stack:** Vue 3 `<script setup>`、TypeScript、Vitest、Vue Test Utils、现有 CSS。

---

## File Structure

- Modify: `src/App.vue`
  - 新增 `scheduleStaffQuery` 搜索状态。
  - 新增当前周排班表可见人员计算。
  - 新增按姓名/工号过滤后的 `filteredScheduleStaff`。
  - 在排班 tab 内新增搜索栏、结果计数、清空按钮和空结果提示。
  - 将 `ScheduleGrid` 的 `staff` prop 改为 `filteredScheduleStaff`。
- Modify: `src/App.test.ts`
  - 覆盖姓名搜索、工号搜索、去空格、大小写不敏感、清空恢复、空结果提示。
  - 覆盖搜索不影响周统计 tab。
  - 覆盖搜索不改变批量操作 payload。
- Modify: `src/styles/main.css`
  - 新增搜索栏桌面和移动端样式。
  - 保持搜索栏不挤压排班表和班次画笔。
- Modify: `src/styles/main-css.test.ts`
  - 覆盖搜索栏基础布局和移动端规则。
- Modify: `docs/功能跟进清单.md`
  - 记录排班表姓名/工号搜索已完成。

---

### Task 1: App 搜索数据流与交互

**Files:**
- Modify: `src/App.test.ts`
- Modify: `src/App.vue`

- [ ] **Step 1: Add failing App tests for name search, job ID search, clear and empty state**

In `src/App.test.ts`, add this helper after `const twoStaffData: PublicAppData = { ... };`:

```ts
const mixedCaseStaffData: PublicAppData = {
  ...twoStaffData,
  staff: [
    ...twoStaffData.staff,
    {
      id: "staff-clerk-abc",
      jobId: "AbC003",
      name: "陈文员",
      type: "clerk",
      isAdmin: false,
      enabled: true,
      sortOrder: 3
    }
  ]
};
```

Add these tests inside the main `describe("App", () => { ... })` block, near the existing schedule-grid tests:

```ts
  it("filters schedule staff by name and restores all staff when cleared", async () => {
    const wrapper = mountApp(twoStaffData);

    await flushPromises();
    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).toBe("staff-nurse-001,staff-nurse-002");

    await wrapper.get('[data-testid="schedule-staff-search"]').setValue("王护士");
    await nextTick();

    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).toBe("staff-nurse-002");
    expect(wrapper.get('[data-testid="schedule-staff-search-count"]').text()).toBe("已显示 1 / 2 人");

    await wrapper.get('[data-testid="clear-schedule-staff-search"]').trigger("click");
    await nextTick();

    expect((wrapper.get('[data-testid="schedule-staff-search"]').element as HTMLInputElement).value).toBe("");
    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).toBe("staff-nurse-001,staff-nurse-002");
    expect(wrapper.get('[data-testid="schedule-staff-search-count"]').text()).toBe("已显示 2 / 2 人");
  });

  it("filters schedule staff by trimmed case-insensitive job id", async () => {
    const wrapper = mountApp(mixedCaseStaffData);

    await flushPromises();
    await wrapper.get('[data-testid="schedule-staff-search"]').setValue(" abc003 ");
    await nextTick();

    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).toBe("staff-clerk-abc");
    expect(wrapper.get('[data-testid="schedule-staff-search-count"]').text()).toBe("已显示 1 / 3 人");
  });

  it("shows an empty state when schedule staff search has no matches", async () => {
    const wrapper = mountApp(twoStaffData);

    await flushPromises();
    await wrapper.get('[data-testid="schedule-staff-search"]').setValue("不存在");
    await nextTick();

    expect(wrapper.find('[data-testid="schedule-staff-ids"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="schedule-staff-search-empty"]').text()).toBe("未找到匹配人员");
    expect(wrapper.get('[data-testid="schedule-staff-search-count"]').text()).toBe("已显示 0 / 2 人");
  });
```

- [ ] **Step 2: Add failing tests for non-goals: weekly summary and batch scope remain unchanged**

In `src/App.test.ts`, add these tests near the same schedule-grid test group:

```ts
  it("keeps weekly summary available when schedule staff search has no matches", async () => {
    const wrapper = mountApp(twoStaffData);

    await flushPromises();
    await wrapper.get('[data-testid="schedule-staff-search"]').setValue("不存在");
    await nextTick();
    await wrapper.get('[data-testid="workbench-tab-weekly"]').trigger("click");
    await nextTick();

    expect(wrapper.get('[data-testid="weekly-summary"]').text()).toContain("2026-06-15-2026-06-21");
  });

  it("does not narrow batch week operations to the staff search result", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17));
    apiMocks.bulkUpdateWeekSchedule.mockResolvedValue({
      data: structuredClone(twoStaffData),
      result: { updated: 14, skipped: 0 }
    });
    const wrapper = mountApp(twoStaffData);

    await flushPromises();
    await wrapper.get('[data-testid="schedule-staff-search"]').setValue("李护士");
    await nextTick();
    await wrapper.get('[data-testid="batch-rest-week-button"]').trigger("click");
    await flushPromises();

    expect(apiMocks.bulkUpdateWeekSchedule).toHaveBeenCalledWith({
      weekStart: "2026-06-15",
      operation: "set-shift",
      shiftId: "shift-rest",
      mode: "overwrite"
    });
    vi.useRealTimers();
  });
```

- [ ] **Step 3: Run App tests and confirm failure**

Run:

```bash
npm run test -- src/App.test.ts
```

Expected: FAIL because `schedule-staff-search`, `schedule-staff-search-count`, `clear-schedule-staff-search`, and `schedule-staff-search-empty` do not exist yet.

- [ ] **Step 4: Add search state and computed staff lists**

In `src/App.vue`, add this state near `selectedShiftId`:

```ts
const scheduleStaffQuery = ref("");
```

Add these computed values after `scheduleDays`:

```ts
const scheduleVisibleDayKeys = computed(() => new Set(scheduleDays.value.map((day) => day.key)));
const scheduleStaffWithVisibleEntries = computed(() => {
  if (!data.value) {
    return new Set<string>();
  }

  return new Set(
    data.value.scheduleEntries
      .filter((entry) => scheduleVisibleDayKeys.value.has(entry.date))
      .map((entry) => entry.staffId)
  );
});
const scheduleVisibleStaff = computed(() => {
  if (!data.value) {
    return [];
  }

  return data.value.staff.filter((staff) => staff.enabled || scheduleStaffWithVisibleEntries.value.has(staff.id));
});
const normalizedScheduleStaffQuery = computed(() => scheduleStaffQuery.value.trim().toLowerCase());
const filteredScheduleStaff = computed(() => {
  const query = normalizedScheduleStaffQuery.value;

  if (!query) {
    return scheduleVisibleStaff.value;
  }

  return scheduleVisibleStaff.value.filter((staff) => {
    return staff.name.toLowerCase().includes(query) || staff.jobId.toLowerCase().includes(query);
  });
});
const hasScheduleStaffSearch = computed(() => normalizedScheduleStaffQuery.value.length > 0);
const hasScheduleStaffSearchResults = computed(() => filteredScheduleStaff.value.length > 0);
```

Add this function near the other small UI handlers:

```ts
function clearScheduleStaffSearch(): void {
  scheduleStaffQuery.value = "";
}
```

- [ ] **Step 5: Add the search UI and pass filtered staff into ScheduleGrid**

In `src/App.vue`, inside the schedule tab panel, after the closing `</div>` of `.schedule-actions` and before `<ShiftPalette ... />`, add:

```vue
            <div class="schedule-search" role="search" aria-label="排班人员搜索">
              <label class="schedule-search-label" for="schedule-staff-search">搜索人员</label>
              <input
                id="schedule-staff-search"
                v-model="scheduleStaffQuery"
                class="schedule-search-input"
                data-testid="schedule-staff-search"
                type="search"
                placeholder="输入姓名或工号"
              />
              <span class="schedule-search-count" data-testid="schedule-staff-search-count">
                已显示 {{ filteredScheduleStaff.length }} / {{ scheduleVisibleStaff.length }} 人
              </span>
              <button
                v-if="hasScheduleStaffSearch"
                class="schedule-search-clear"
                data-testid="clear-schedule-staff-search"
                type="button"
                @click="clearScheduleStaffSearch"
              >
                清空
              </button>
            </div>
            <p
              v-if="hasScheduleStaffSearch && !hasScheduleStaffSearchResults"
              class="schedule-search-empty"
              data-testid="schedule-staff-search-empty"
            >
              未找到匹配人员
            </p>
```

Then change the `ScheduleGrid` block from:

```vue
            <ScheduleGrid
              :staff="data.staff"
              :days="scheduleDays"
              :holidays="data.holidays"
              :shifts="data.shifts"
              :entries="data.scheduleEntries"
              :selected-shift-id="selectedShiftId"
              :editable-staff-ids="editableStaffIds"
              @quick-fill="handleQuickFill"
              @edit-cell="handleEditCell"
            />
```

to:

```vue
            <ScheduleGrid
              v-if="!hasScheduleStaffSearch || hasScheduleStaffSearchResults"
              :staff="filteredScheduleStaff"
              :days="scheduleDays"
              :holidays="data.holidays"
              :shifts="data.shifts"
              :entries="data.scheduleEntries"
              :selected-shift-id="selectedShiftId"
              :editable-staff-ids="editableStaffIds"
              @quick-fill="handleQuickFill"
              @edit-cell="handleEditCell"
            />
```

- [ ] **Step 6: Run App tests and confirm pass**

Run:

```bash
npm run test -- src/App.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit App behavior**

Run:

```bash
git add src/App.vue src/App.test.ts
git commit -m "feat: search schedule staff"
```

---

### Task 2: Search Bar Styling

**Files:**
- Modify: `src/styles/main-css.test.ts`
- Modify: `src/styles/main.css`

- [ ] **Step 1: Write failing CSS tests for the search layout**

In `src/styles/main-css.test.ts`, add this test to `describe("main.css schedule grid sticky column rules", () => { ... })` after the shift palette test:

```ts
  it("lays out the schedule staff search controls without crowding the grid", () => {
    const searchRules = ruleBlocks(".schedule-search")[0] ?? "";
    const inputRules = ruleBlocks(".schedule-search-input")[0] ?? "";
    const countRules = ruleBlocks(".schedule-search-count")[0] ?? "";
    const clearRules = ruleBlocks(".schedule-search-clear")[0] ?? "";
    const emptyRules = ruleBlocks(".schedule-search-empty")[0] ?? "";

    expect(searchRules).toContain("display: flex");
    expect(searchRules).toContain("flex-wrap: wrap");
    expect(searchRules).toContain("align-items: center");
    expect(searchRules).toContain("gap: 8px");
    expect(searchRules).toContain("margin: 0 0 8px");
    expect(inputRules).toContain("flex: 1 1 220px");
    expect(inputRules).toContain("min-height: 34px");
    expect(countRules).toContain("white-space: nowrap");
    expect(clearRules).toContain("min-height: 34px");
    expect(emptyRules).toContain("text-align: center");
  });
```

Add this test to the same describe block or a nearby mobile CSS describe:

```ts
  it("stacks the schedule staff search controls on mobile", () => {
    const mobileCss = mediaBlock("(max-width: 768px)");
    const mobileSearch = ruleBlockIn(mobileCss, ".schedule-search");
    const mobileInput = ruleBlockIn(mobileCss, ".schedule-search-input");
    const mobileClear = ruleBlockIn(mobileCss, ".schedule-search-clear");

    expect(mobileSearch).toContain("display: grid");
    expect(mobileSearch).toContain("grid-template-columns: 1fr");
    expect(mobileInput).toContain("width: 100%");
    expect(mobileInput).toContain("min-width: 0");
    expect(mobileClear).toContain("width: 100%");
  });
```

- [ ] **Step 2: Run CSS tests and confirm failure**

Run:

```bash
npm run test -- src/styles/main-css.test.ts
```

Expected: FAIL because `.schedule-search`, `.schedule-search-input`, `.schedule-search-count`, `.schedule-search-clear`, and `.schedule-search-empty` styles do not exist yet.

- [ ] **Step 3: Add desktop search styles**

In `src/styles/main.css`, add these rules after the `.schedule-actions button:disabled` rule and before `.shift-palette`:

```css
.schedule-search {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  padding: 8px;
  border: 1px solid #dbeafe;
  background: #f8fbff;
}

.schedule-search-label {
  color: #1e3a8a;
  font-weight: 800;
}

.schedule-search-input {
  flex: 1 1 220px;
  min-width: 180px;
  min-height: 34px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  padding: 0 10px;
  color: #0f172a;
  font: inherit;
}

.schedule-search-input:focus {
  outline: 2px solid #bfdbfe;
  outline-offset: 1px;
}

.schedule-search-count {
  color: #475569;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.schedule-search-clear {
  min-height: 34px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
  padding: 0 12px;
  font-weight: 800;
  cursor: pointer;
}

.schedule-search-empty {
  margin: 0 0 8px;
  border: 1px dashed #cbd5e1;
  background: #f8fafc;
  padding: 12px;
  color: #475569;
  text-align: center;
  font-weight: 700;
}
```

- [ ] **Step 4: Add mobile search styles**

Inside the existing `@media (max-width: 768px)` block, after the `.schedule-actions button { ... }` mobile rule and before `.shift-palette`, add:

```css
  .schedule-search {
    display: grid;
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .schedule-search-input {
    width: 100%;
    min-width: 0;
  }

  .schedule-search-count {
    white-space: normal;
  }

  .schedule-search-clear {
    width: 100%;
  }
```

- [ ] **Step 5: Run CSS tests and confirm pass**

Run:

```bash
npm run test -- src/styles/main-css.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit search styles**

Run:

```bash
git add src/styles/main.css src/styles/main-css.test.ts
git commit -m "style: add schedule staff search layout"
```

---

### Task 3: Documentation and Verification

**Files:**
- Modify: `docs/功能跟进清单.md`
- Verify: `src/App.test.ts`
- Verify: `src/styles/main-css.test.ts`

- [ ] **Step 1: Update the tracking document**

In `docs/功能跟进清单.md`, under `### 1.1 排班工作台`, add this bullet after `排班明细显示排序ID、姓名工号和人员类型，便于核对排序和角色。`:

```md
- 支持按姓名或工号搜索排班表人员行，搜索不影响统计、打印或批量操作范围。
```

- [ ] **Step 2: Run focused verification**

Run:

```bash
npm run test -- src/App.test.ts src/styles/main-css.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run:

```bash
npm run test
```

Expected: PASS. If sandbox blocks `server/routes.test.ts` with `listen EPERM: operation not permitted 0.0.0.0`, rerun the same command outside the sandbox with approval and record both outcomes.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: PASS. Vite may print existing large chunk warnings; warnings do not fail the build.

- [ ] **Step 5: Commit docs**

Run:

```bash
git add docs/功能跟进清单.md
git commit -m "docs: document schedule staff search"
```

---

## Self-Review Checklist

- Spec coverage:
  - Search only applies to the schedule tab: Task 1.
  - Name and job ID fuzzy search: Task 1.
  - Trim and case-insensitive behavior: Task 1.
  - Clear button and empty state: Task 1.
  - Search does not affect weekly summary or batch operations: Task 1.
  - Mobile and desktop layout: Task 2.
  - Documentation update: Task 3.
- Placeholder scan:
  - The plan contains concrete file paths, snippets, commands and expected outputs.
- Type consistency:
  - `scheduleStaffQuery`, `normalizedScheduleStaffQuery`, `scheduleVisibleStaff`, `filteredScheduleStaff`, `hasScheduleStaffSearch`, and `hasScheduleStaffSearchResults` are consistently named across implementation and template steps.
