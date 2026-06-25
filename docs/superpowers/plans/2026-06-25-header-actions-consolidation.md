# Header Actions Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the schedule home page controls so the header carries only global actions and the schedule row carries week selection, staff search, and batch schedule actions.

**Architecture:** Keep `App.vue` responsible for page-level actions, authentication state, search state, and batch schedule handlers. Narrow `AppToolbar.vue` into a reusable week-control component that only emits selected-date updates. Add one small date utility for Monday-start schedule week numbering so the UI can show labels such as `第26周`.

**Tech Stack:** Vue 3 `<script setup>`, Element Plus buttons, lucide-vue-next icons, Vitest, Vue Test Utils, CSS in `src/styles/main.css`.

---

## File Structure

- Modify `src/lib/date.ts`: add `getScheduleWeekNumber(dateKey)` using the existing Monday-to-Sunday week model.
- Modify `src/lib/date.test.ts`: cover week labels for ordinary weeks, year end, and Sunday behavior.
- Modify `src/components/AppToolbar.vue`: reduce the component to week number, date picker, previous/current/next week, and range text.
- Modify `src/components/AppToolbar.test.ts`: remove global action expectations and verify week number output.
- Modify `src/App.vue`: move global actions into the header, implement the `admin` account dropdown, remove visible fullscreen workflow, and merge week controls/search/batch actions into one schedule operation row.
- Modify `src/App.test.ts`: update stubs and add page-level tests for the header actions, account menu, removed fullscreen action, and consolidated schedule operation row.
- Modify `src/styles/main.css`: style the compact header actions, account dropdown, operation row, moderate-width search input, and mobile wrapping.
- Modify `src/styles/main-css.test.ts`: assert the new structural CSS rules and removed old toolbar action group.

---

### Task 1: Schedule Week Number Utility

**Files:**
- Modify: `src/lib/date.ts`
- Test: `src/lib/date.test.ts`

- [ ] **Step 1: Write failing date utility tests**

Update the import in `src/lib/date.test.ts`:

```ts
import { addWeeks, getMonthDays, getScheduleWeekNumber, getWeekDays, getWeekRange, toDateKey } from "./date";
```

Add these tests before the `moves by natural weeks from the selected week start` test:

```ts
  it("returns the schedule week number for a Monday-start week", () => {
    expect(getScheduleWeekNumber("2026-06-22")).toBe(26);
    expect(getScheduleWeekNumber("2026-06-25")).toBe(26);
    expect(getScheduleWeekNumber("2026-06-28")).toBe(26);
  });

  it("keeps Sunday in the previous schedule week number", () => {
    expect(getScheduleWeekNumber("2026-06-21")).toBe(25);
  });

  it("returns the final ISO-style schedule week at year end", () => {
    expect(getScheduleWeekNumber("2026-12-30")).toBe(53);
  });
```

- [ ] **Step 2: Run the failing test**

Run: `npm run test -- src/lib/date.test.ts`

Expected: FAIL with an import error or assertion error because `getScheduleWeekNumber` does not exist.

- [ ] **Step 3: Implement the week number utility**

In `src/lib/date.ts`, add this helper near the top after `parseDateKey`:

```ts
function dateKeyToUtcTime(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}
```

Add this exported function after `getWeekRange`:

```ts
export function getScheduleWeekNumber(dateKey: string): number {
  const { start } = getWeekRange(dateKey);
  const scheduleWeekThursday = addDays(start, 3);
  const scheduleWeekYear = parseDateKey(scheduleWeekThursday).getFullYear();
  const firstScheduleWeekStart = getWeekRange(`${scheduleWeekYear}-01-04`).start;
  const elapsedDays = (dateKeyToUtcTime(scheduleWeekThursday) - dateKeyToUtcTime(firstScheduleWeekStart)) / 86400000;
  return Math.floor(elapsedDays / 7) + 1;
}
```

- [ ] **Step 4: Verify date tests pass**

Run: `npm run test -- src/lib/date.test.ts`

Expected: PASS with 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/date.ts src/lib/date.test.ts
git commit -m "feat: add schedule week number utility"
```

---

### Task 2: Narrow `AppToolbar` To Week Controls

**Files:**
- Modify: `src/components/AppToolbar.vue`
- Test: `src/components/AppToolbar.test.ts`

- [ ] **Step 1: Update failing toolbar tests**

In `src/components/AppToolbar.test.ts`, change `mountToolbar` so it only passes `selectedDate`:

```ts
function mountToolbar(selectedDate = "2026-06-17") {
  return mount(AppToolbar, {
    props: {
      selectedDate
    },
    global: {
      stubs: {
        ElButton: ElButtonStub,
        ElDatePicker: ElDatePickerStub,
        ElInputNumber: ElInputNumberStub,
        ElOption: ElOptionStub,
        ElSelect: ElSelectStub,
        ElTooltip: ElTooltipStub
      }
    }
  });
}
```

Replace the first test with:

```ts
  it("uses one date selector with a schedule week label and Monday-to-Sunday range", () => {
    const wrapper = mountToolbar("2026-06-25");
    const dateSelectors = wrapper.findAll('input[data-type="date"]');

    expect(dateSelectors).toHaveLength(1);
    expect(dateSelectors[0].attributes("data-placeholder")).toBe("选择日期");
    expect(wrapper.find('input[data-placeholder="选择周"]').exists()).toBe(false);
    expect(wrapper.get(".schedule-week-number").text()).toBe("第26周");
    expect(wrapper.get(".toolbar-week-range").text()).toBe("2026-06-22 至 2026-06-28");
  });
```

Delete the existing `emits a password-change action from the user toolbar` test.

Replace the `keeps account identity out of the weekly toolbar` test with:

```ts
  it("keeps global account and print actions out of the weekly toolbar", () => {
    const wrapper = mountToolbar("2026-06-17");

    expect(wrapper.find(".toolbar-user").exists()).toBe(false);
    expect(wrapper.find('[data-testid="open-password-change"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="open-management"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="print-week"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="print-month"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("全屏");
    expect(wrapper.get(".toolbar-week-range").text()).toBe("2026-06-15 至 2026-06-21");
  });
```

- [ ] **Step 2: Run toolbar tests to verify failure**

Run: `npm run test -- src/components/AppToolbar.test.ts`

Expected: FAIL because `.schedule-week-number` is missing and old global actions still render.

- [ ] **Step 3: Replace `AppToolbar.vue` with focused week controls**

Replace the full contents of `src/components/AppToolbar.vue` with:

```vue
<script setup lang="ts">
import { computed } from "vue";
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import { addWeeks, getScheduleWeekNumber, getWeekRange, toDateKey } from "@/lib/date";

const props = defineProps<{
  selectedDate: string;
}>();

const emit = defineEmits<{
  "update:selectedDate": [value: string];
}>();

function handleSelectedDateUpdate(value: unknown): void {
  if (typeof value === "string" && value) {
    emit("update:selectedDate", value);
  }
}

const selectedWeek = computed(() => getWeekRange(props.selectedDate));
const scheduleWeekLabel = computed(() => `第${getScheduleWeekNumber(props.selectedDate)}周`);

function moveWeek(offset: number): void {
  emit("update:selectedDate", addWeeks(props.selectedDate, offset));
}

function moveToCurrentWeek(): void {
  emit("update:selectedDate", getWeekRange(toDateKey(new Date())).start);
}
</script>

<template>
  <section class="schedule-week-controls" data-testid="schedule-week-controls">
    <span class="schedule-week-number">{{ scheduleWeekLabel }}</span>
    <el-date-picker
      :model-value="selectedDate"
      type="date"
      value-format="YYYY-MM-DD"
      placeholder="选择日期"
      :clearable="false"
      @update:model-value="handleSelectedDateUpdate"
    />
    <div class="week-nav" role="group" aria-label="周选择">
      <el-tooltip content="上一周" placement="top">
        <el-button :icon="ChevronLeft" aria-label="上一周" @click="moveWeek(-1)" />
      </el-tooltip>
      <el-button class="current-week-button" @click="moveToCurrentWeek">本周</el-button>
      <el-tooltip content="下一周" placement="top">
        <el-button :icon="ChevronRight" aria-label="下一周" @click="moveWeek(1)" />
      </el-tooltip>
    </div>
    <span class="toolbar-week-range">{{ selectedWeek.start }} 至 {{ selectedWeek.end }}</span>
  </section>
</template>
```

- [ ] **Step 4: Verify toolbar tests pass**

Run: `npm run test -- src/components/AppToolbar.test.ts`

Expected: PASS with 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/AppToolbar.vue src/components/AppToolbar.test.ts
git commit -m "refactor: narrow toolbar to week controls"
```

---

### Task 3: Consolidate Header Actions And Schedule Operation Row

**Files:**
- Modify: `src/App.vue`
- Test: `src/App.test.ts`

- [ ] **Step 1: Update App toolbar stub and helper expectations**

In `src/App.test.ts`, replace `AppToolbarStub` with:

```ts
const AppToolbarStub = defineComponent({
  name: "AppToolbar",
  props: ["selectedDate"],
  emits: ["update:selectedDate"],
  template: `
    <section data-testid="schedule-week-controls">
      <span data-testid="toolbar-selected-date">{{ selectedDate }}</span>
      <span class="schedule-week-number">第26周</span>
      <span class="toolbar-week-range">2026-06-15 至 2026-06-21</span>
      <button data-testid="jump-date" type="button" @click="$emit('update:selectedDate', '2026-07-01')">
        jump
      </button>
      <button data-testid="jump-same-month-date" type="button" @click="$emit('update:selectedDate', '2026-06-20')">
        jump same month
      </button>
    </section>
  `
});
```

Update `enterAdminModeForTest`:

```ts
async function enterAdminModeForTest(wrapper: ReturnType<typeof mountApp>) {
  await flushPromises();
  expect(wrapper.get('[data-testid="header-user-menu-button"]').text()).toContain("admin");
}
```

- [ ] **Step 2: Add failing App tests**

Replace the existing `shows the current user in the header and supports logging out` test with:

```ts
  it("shows the current account name in the header and supports logging out from the account menu", async () => {
    apiMocks.logout.mockResolvedValue(undefined);
    const wrapper = mountApp();

    await flushPromises();
    expect(wrapper.get('[data-testid="header-user-menu-button"]').text()).toContain("admin");
    expect(wrapper.get('[data-testid="header-user-menu-button"]').text()).not.toContain("系统管理员");
    expect(wrapper.find(".week-chip").exists()).toBe(false);
    expect(wrapper.find('[data-testid="current-user"]').exists()).toBe(false);

    await wrapper.get('[data-testid="header-user-menu-button"]').trigger("click");
    await wrapper.get('[data-testid="logout-button"]').trigger("click");
    await flushPromises();

    expect(apiMocks.logout).toHaveBeenCalled();
    expect(wrapper.find(".app-shell").exists()).toBe(false);
  });
```

Replace the existing `uses display name for scheduler header identity when it differs from the role label` test with:

```ts
  it("uses only the scheduler username in the header account menu", async () => {
    const wrapper = mountApp(testData, createSchedulerUser(["staff-nurse-001"]));

    await flushPromises();

    expect(wrapper.get('[data-testid="header-user-menu-button"]').text()).toContain("scheduler");
    expect(wrapper.get('[data-testid="header-user-menu-button"]').text()).not.toContain("排班员");
    expect(wrapper.get('[data-testid="header-user-menu-button"]').text()).not.toContain("排班管理员");
  });
```

Add these tests after `shows the current user in the header and supports logging out`:

```ts
  it("shows compact header actions and an account-only user menu", async () => {
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.get(".app-header-actions").text()).toContain("配置");
    expect(wrapper.get(".app-header-actions").text()).toContain("打印周表");
    expect(wrapper.get(".app-header-actions").text()).toContain("打印月表");
    expect(wrapper.get('[data-testid="header-user-menu-button"]').text()).toContain("admin");
    expect(wrapper.get('[data-testid="header-user-menu-button"]').text()).not.toContain("系统管理员");
    expect(wrapper.text()).not.toContain("全屏");
    expect(wrapper.find('[data-testid="fullscreen-button"]').exists()).toBe(false);
  });

  it("opens password change and logout from the account menu", async () => {
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.get('[data-testid="header-user-menu-button"]').trigger("click");
    await wrapper.get('[data-testid="open-password-change"]').trigger("click");

    expect(wrapper.find('[data-testid="password-dialog"]').exists()).toBe(true);
    expect(wrapper.find(".header-user-dropdown").exists()).toBe(false);

    await wrapper.get('[data-testid="header-user-menu-button"]').trigger("click");
    await wrapper.get('[data-testid="logout-button"]').trigger("click");

    expect(apiMocks.logout).toHaveBeenCalled();
  });

  it("puts week controls, staff search, count, and batch actions in one schedule operation row", async () => {
    const wrapper = mountApp();
    await flushPromises();

    const row = wrapper.get('[data-testid="schedule-operation-row"]');

    expect(row.find('[data-testid="schedule-week-controls"]').exists()).toBe(true);
    expect(row.text()).toContain("搜索人员");
    expect(row.find('[data-testid="schedule-staff-search"]').exists()).toBe(true);
    expect(row.find('[data-testid="schedule-staff-search-count"]').text()).toBe("已显示 2 / 2 人");
    expect(row.find('[data-testid="copy-previous-week-button"]').exists()).toBe(true);
    expect(row.find('[data-testid="batch-rest-week-button"]').exists()).toBe(true);
    expect(row.find('[data-testid="batch-office-week-button"]').exists()).toBe(true);
    expect(row.find('[data-testid="clear-week-button"]').exists()).toBe(true);
  });
```

- [ ] **Step 3: Run App tests to verify failure**

Run: `npm run test -- src/App.test.ts`

Expected: FAIL because the header actions, account menu, and `schedule-operation-row` do not exist yet.

- [ ] **Step 4: Update `App.vue` script**

Add this import after the Element Plus import:

```ts
import { CalendarDays, Printer, Settings } from "lucide-vue-next";
```

Replace `currentUserIdentityLabel` with:

```ts
const currentUserAccountLabel = computed(() => currentUser.value?.username ?? "");
const userMenuOpen = ref(false);
```

Add these functions near `handleLogout`:

```ts
function openPasswordChangeFromMenu(): void {
  userMenuOpen.value = false;
  passwordDialogOpen.value = true;
}

async function handleLogoutFromMenu(): Promise<void> {
  userMenuOpen.value = false;
  await handleLogout();
}
```

Delete the `handleFullscreen` function.

- [ ] **Step 5: Update `App.vue` template**

Replace the authenticated header and the standalone `AppToolbar` block with:

```vue
    <header class="app-header">
      <div class="app-title">
        <p class="eyebrow">国际医学部</p>
        <h1>护理排班管理系统</h1>
      </div>
      <div class="app-header-actions">
        <el-button :icon="Settings" data-testid="open-management" :disabled="!canManageConfig" @click="openManagementDrawer">
          配置
        </el-button>
        <el-button :icon="CalendarDays" data-testid="print-week" @click="printWithMode('week')">打印周表</el-button>
        <el-button :icon="Printer" data-testid="print-month" @click="printWithMode('month')">打印月表</el-button>
        <div class="header-user-menu">
          <button
            class="header-user-menu-button"
            data-testid="header-user-menu-button"
            type="button"
            aria-haspopup="menu"
            :aria-expanded="userMenuOpen"
            @click="userMenuOpen = !userMenuOpen"
          >
            {{ currentUserAccountLabel }}
            <span aria-hidden="true">v</span>
          </button>
          <div v-if="userMenuOpen" class="header-user-dropdown" role="menu">
            <button data-testid="open-password-change" type="button" role="menuitem" @click="openPasswordChangeFromMenu">
              修改密码
            </button>
            <button class="danger-menu-item" data-testid="logout-button" type="button" role="menuitem" @click="handleLogoutFromMenu">
              退出登录
            </button>
          </div>
        </div>
      </div>
    </header>
```

Inside the schedule panel, replace the separate `schedule-actions` and `schedule-search` blocks with:

```vue
            <div class="schedule-operation-row" data-testid="schedule-operation-row">
              <AppToolbar v-model:selected-date="selectedDate" />
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
              <div class="schedule-actions">
                <button
                  data-testid="copy-previous-week-button"
                  type="button"
                  :disabled="!canEditSchedule || scheduleActionBusy"
                  @click="handleCopyPreviousWeek"
                >
                  {{ copyingPreviousWeek ? "复制中..." : "复制上一周" }}
                </button>
                <button
                  data-testid="batch-rest-week-button"
                  type="button"
                  :disabled="!canEditSchedule || scheduleActionBusy"
                  @click="handleBatchSetWeekShift('rest')"
                >
                  批量休息
                </button>
                <button
                  data-testid="batch-office-week-button"
                  type="button"
                  :disabled="!canEditSchedule || scheduleActionBusy"
                  @click="handleBatchSetWeekShift('office')"
                >
                  批量办公
                </button>
                <button
                  class="danger-action"
                  data-testid="clear-week-button"
                  type="button"
                  :disabled="!canEditSchedule || scheduleActionBusy"
                  @click="handleClearWeek"
                >
                  批量清空
                </button>
              </div>
            </div>
```

Keep the existing empty-state paragraph immediately after this row:

```vue
            <p
              v-if="hasScheduleStaffSearch && !hasScheduleStaffSearchResults"
              class="schedule-search-empty"
              data-testid="schedule-staff-search-empty"
            >
              未找到匹配人员
            </p>
```

- [ ] **Step 6: Verify App tests pass**

Run: `npm run test -- src/App.test.ts`

Expected: PASS with 64 tests after updating the test count for the added cases.

- [ ] **Step 7: Commit**

```bash
git add src/App.vue src/App.test.ts
git commit -m "feat: consolidate header and schedule controls"
```

---

### Task 4: Update Layout CSS And CSS Tests

**Files:**
- Modify: `src/styles/main.css`
- Test: `src/styles/main-css.test.ts`

- [ ] **Step 1: Update failing CSS tests**

Replace the first CSS test in `src/styles/main-css.test.ts` with:

```ts
  it("styles compact header actions and the account dropdown", () => {
    const headerActionsRules = ruleBlocks(".app-header-actions")[0] || "";
    const userMenuRules = ruleBlocks(".header-user-menu")[0] || "";
    const menuButtonRules = ruleBlocks(".header-user-menu-button")[0] || "";
    const dropdownRules = ruleBlocks(".header-user-dropdown")[0] || "";

    expect(headerActionsRules).toContain("display: flex");
    expect(headerActionsRules).toContain("justify-content: flex-end");
    expect(userMenuRules).toContain("position: relative");
    expect(menuButtonRules).toContain("white-space: nowrap");
    expect(dropdownRules).toContain("position: absolute");
    expect(dropdownRules).toContain("z-index: 20");
    expect(ruleBlocks(".week-chip")).toHaveLength(0);
    expect(ruleBlocks(".toolbar-user")).toHaveLength(0);
    expect(ruleBlocks(".header-user")).toHaveLength(0);
    expectSelectorAbsent(".week-chip");
    expectSelectorAbsent(".toolbar-user");
    expectSelectorAbsent(".header-user");
    expectSelectorAbsent(".app-info-panel");
    expectSelectorAbsent(".admin-mode-banner");
  });
```

Add this CSS test after the header test:

```ts
  it("keeps schedule controls, search, and batch actions in one operation row", () => {
    const operationRules = ruleBlocks(".schedule-operation-row")[0] || "";
    const weekControlsRules = ruleBlocks(".schedule-week-controls")[0] || "";
    const weekNumberRules = ruleBlocks(".schedule-week-number")[0] || "";
    const searchRules = ruleBlocks(".schedule-operation-row .schedule-search")[0] || "";
    const inputRules = ruleBlocks(".schedule-operation-row .schedule-search-input")[0] || "";
    const actionsRules = ruleBlocks(".schedule-operation-row .schedule-actions")[0] || "";

    expect(operationRules).toContain("display: flex");
    expect(operationRules).toContain("flex-wrap: wrap");
    expect(operationRules).toContain("padding-right: 150px");
    expect(weekControlsRules).toContain("display: flex");
    expect(weekNumberRules).toContain("background: #eef4ff");
    expect(searchRules).toContain("display: flex");
    expect(inputRules).toContain("flex: 0 0 280px");
    expect(actionsRules).toContain("margin-left: auto");
  });
```

- [ ] **Step 2: Run CSS tests to verify failure**

Run: `npm run test -- src/styles/main-css.test.ts`

Expected: FAIL because the new selectors are missing and old `.header-user` rules still exist.

- [ ] **Step 3: Replace header, toolbar, schedule action, and search CSS**

In `src/styles/main.css`, replace `.header-user` rules with:

```css
.app-title {
  min-width: 220px;
}

.app-header-actions {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}

.header-user-menu {
  position: relative;
  flex: 0 0 auto;
}

.header-user-menu-button {
  min-height: 34px;
  border: 1px solid #dbe3ef;
  background: #eef4ff;
  color: #2563eb;
  padding: 0 12px;
  font: inherit;
  font-weight: 800;
  white-space: nowrap;
  cursor: pointer;
}

.header-user-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 20;
  min-width: 138px;
  border: 1px solid #dbe3ef;
  background: #ffffff;
  box-shadow: 0 6px 14px rgb(15 23 42 / 14%);
}

.header-user-dropdown button {
  display: block;
  width: 100%;
  min-height: 40px;
  border: 0;
  border-bottom: 1px solid #edf2f7;
  background: #ffffff;
  color: #1f2937;
  padding: 0 16px;
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.header-user-dropdown button:last-child {
  border-bottom: 0;
}

.header-user-dropdown .danger-menu-item {
  color: #dc2626;
}
```

Replace `.toolbar`, `.toolbar-group`, and `.toolbar-actions` rules with:

```css
.schedule-week-controls {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.schedule-week-number {
  flex: 0 0 auto;
  min-height: 34px;
  border: 1px solid #dbe3ef;
  background: #eef4ff;
  color: #2563eb;
  padding: 7px 10px;
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
}
```

Replace `.schedule-actions` and `.schedule-search` base rules with:

```css
.schedule-operation-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 8px 150px 8px 8px;
  border: 1px solid #dbeafe;
  background: #f8fbff;
}

.schedule-operation-row .schedule-search {
  display: flex;
  flex: 0 1 auto;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
}

.schedule-operation-row .schedule-search-input {
  flex: 0 0 280px;
  width: 280px;
  min-width: 0;
}

.schedule-actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  margin: 0 0 0 auto;
}
```

Keep the existing `.schedule-actions button`, `.danger-action`, disabled styles, `.schedule-search-label`, `.schedule-search-input:focus`, `.schedule-search-count`, `.schedule-search-clear`, and `.schedule-search-empty` rules unless the selectors conflict with the new row selectors.

Remove `.header-user` from the print media hidden-selector list. The print rule should continue to hide `.app-header`, `.print-preview-dialog`, `.workbench`, and other non-print surfaces, but it should not reference `.header-user` after that selector is deleted.

- [ ] **Step 4: Update mobile CSS**

Inside `@media (max-width: 768px)`, replace the `.header-user`, `.toolbar`, `.toolbar-group`, `.toolbar-actions`, and `.toolbar-week-range` rules with:

```css
  .app-header-actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .header-user-menu {
    margin-left: auto;
  }

  .schedule-operation-row {
    display: grid;
    grid-template-columns: 1fr;
    padding-right: 8px;
  }

  .schedule-week-controls {
    flex-wrap: wrap;
    align-items: center;
  }

  .schedule-week-controls > .el-date-editor.el-input,
  .schedule-week-controls > .el-date-editor.el-input__wrapper {
    flex: 1 1 164px;
    min-width: 164px;
  }

  .toolbar-week-range {
    flex-basis: 100%;
    text-align: center;
  }

  .schedule-operation-row .schedule-search {
    display: grid;
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .schedule-operation-row .schedule-search-input {
    width: 100%;
    flex-basis: auto;
  }

  .schedule-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-left: 0;
  }
```

- [ ] **Step 5: Verify CSS tests pass**

Run: `npm run test -- src/styles/main-css.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/styles/main.css src/styles/main-css.test.ts
git commit -m "style: compact schedule header controls"
```

---

### Task 5: Full Verification And Browser Check

**Files:**
- No source edits unless verification exposes a defect.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test -- src/lib/date.test.ts src/components/AppToolbar.test.ts src/App.test.ts src/styles/main-css.test.ts
```

Expected: PASS for all focused files.

- [ ] **Step 2: Run full tests**

Run: `npm run test`

Expected: PASS for all test files. If a known flaky backend route test fails once with a different 401/403 location, rerun `npm run test -- server/routes.test.ts` and then rerun `npm run test`; only proceed if the final full run passes.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: PASS. Existing Rollup pure-comment and chunk-size warnings may appear; build must finish successfully.

- [ ] **Step 4: Browser verification**

Start the web app:

```bash
WEB_HOST=127.0.0.1 WEB_PORT=52620 npm run dev:web
```

Open `http://127.0.0.1:52620/` in the in-app browser. Verify:

- Header right side shows `配置`, `打印周表`, `打印月表`, and `admin`.
- Header and page do not show `全屏`.
- Clicking `admin` opens `修改密码` and `退出登录`.
- The dropdown renders above the page and does not cover the schedule operation row controls.
- The schedule operation row shows `第26周`, date picker, previous week, `本周`, next week, week range, `搜索人员`, a moderate-width search input, displayed count, and batch actions.
- Search still filters staff and the batch buttons remain clickable when the user has permission.

Stop the dev server with `Ctrl-C` after verification.

- [ ] **Step 5: Final status check**

Run:

```bash
git status --short
git log --oneline -5
```

Expected: clean worktree after commits and the last commits correspond to this feature.
