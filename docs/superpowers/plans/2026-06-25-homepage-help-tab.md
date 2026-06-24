# Homepage Help Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move homepage instructional content into a dedicated “使用说明” workbench tab, remove duplicate homepage week/permission hints, and show the logged-in identity in the page header.

**Architecture:** Keep this as a frontend-only refactor in the existing Vue shell. `App.vue` owns header identity and help-page content; `AppToolbar.vue` remains focused on date navigation and actions. Existing business data, permissions, schedule editing, query, weekly summary, and bonus settlement flows remain unchanged.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Element Plus, Vitest, Vue Test Utils, CSS in `src/styles/main.css`.

---

## File Structure

- Modify `src/components/AppToolbar.vue`: remove the `currentUser` prop, user identity computed values, and `.toolbar-user` rendering.
- Modify `src/components/AppToolbar.test.ts`: update the toolbar mount helper and assert that the toolbar still shows the week range but no longer renders account identity.
- Modify `src/App.vue`: extend `WorkbenchTab` with `help`, add header identity computed values, remove the homepage info panel and permission banner, stop passing `currentUser` to `AppToolbar`, and add the “使用说明” workbench panel.
- Modify `src/App.test.ts`: update the `AppToolbarStub`, replace homepage guidance/banner assertions with header/help-tab assertions, and update tab-order expectations.
- Modify `src/styles/main.css`: replace removed homepage styles with `.header-user` and help-page styles, plus mobile/print adjustments.
- Modify `src/styles/main-css.test.ts`: add CSS tests for the header user chip and help-page layout.

## Task 1: Simplify AppToolbar Contract

**Files:**
- Modify: `src/components/AppToolbar.test.ts`
- Modify: `src/components/AppToolbar.vue`

- [ ] **Step 1: Write the failing toolbar test**

In `src/components/AppToolbar.test.ts`, remove the `AuthUser` import and change the mount helper to no longer accept or pass `currentUser`:

```ts
function mountToolbar(selectedDate = "2026-06-17") {
  return mount(AppToolbar, {
    props: {
      selectedDate,
      adminMode: true,
      canManageConfig: true
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

Replace the two identity tests at the end of the file with this single behavior test:

```ts
it("keeps account identity out of the weekly toolbar", () => {
  const wrapper = mountToolbar("2026-06-17");

  expect(wrapper.find(".toolbar-user").exists()).toBe(false);
  expect(wrapper.get(".toolbar-week-range").text()).toBe("2026-06-15 至 2026-06-21");
});
```

- [ ] **Step 2: Run the toolbar test to verify RED**

Run:

```bash
npm run test -- src/components/AppToolbar.test.ts
```

Expected: FAIL because `AppToolbar.vue` still requires `currentUser` and still renders `.toolbar-user`, or because rendering the user label reads the removed prop.

- [ ] **Step 3: Implement the minimal toolbar change**

In `src/components/AppToolbar.vue`, remove `AuthUser` from imports, remove `currentUser` from props, remove `roleLabel`, remove `userIdentityLabel`, and remove the toolbar user span.

The top of the script should become:

```ts
<script setup lang="ts">
import { computed } from "vue";
import { CalendarDays, ChevronLeft, ChevronRight, Expand, KeyRound, LogOut, Printer, Settings } from "lucide-vue-next";
import { addWeeks, getWeekRange, toDateKey } from "@/lib/date";

const props = defineProps<{
  selectedDate: string;
  adminMode: boolean;
  canManageConfig: boolean;
}>();
```

The toolbar actions should become:

```vue
<div class="toolbar-actions">
  <el-button :icon="KeyRound" data-testid="open-password-change" @click="emit('openPasswordChange')">修改密码</el-button>
  <el-button :icon="Settings" :disabled="!canManageConfig" @click="emit('openManagement')">配置</el-button>
  <el-button :icon="CalendarDays" @click="emit('printWeek')">打印周表</el-button>
  <el-button :icon="Printer" @click="emit('printMonth')">打印月表</el-button>
  <el-button :icon="Expand" @click="emit('fullscreen')">全屏</el-button>
  <el-button :icon="LogOut" @click="emit('logout')">退出登录</el-button>
</div>
```

- [ ] **Step 4: Run the toolbar test to verify GREEN**

Run:

```bash
npm run test -- src/components/AppToolbar.test.ts
```

Expected: PASS. The toolbar still renders one date selector, Monday-to-Sunday week range, week navigation buttons, and action events.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add src/components/AppToolbar.vue src/components/AppToolbar.test.ts
git commit -m "refactor: keep account identity out of toolbar"
```

## Task 2: Move Current User Identity Into Header

**Files:**
- Modify: `src/App.test.ts`
- Modify: `src/App.vue`

- [ ] **Step 1: Write the failing header identity tests**

In `src/App.test.ts`, change `AppToolbarStub` so it no longer accepts or renders `currentUser`:

```ts
const AppToolbarStub = defineComponent({
  name: "AppToolbar",
  props: ["selectedDate", "adminMode", "canManageConfig"],
  emits: ["update:selectedDate", "logout", "openManagement", "openPasswordChange", "printMonth", "printWeek"],
  template: `
    <section>
      <button data-testid="open-management" type="button" @click="$emit('openManagement')">配置</button>
      <button data-testid="open-password-change" type="button" @click="$emit('openPasswordChange')">修改密码</button>
      <button data-testid="logout-button" type="button" @click="$emit('logout')">
        退出登录
      </button>
      <button data-testid="jump-date" type="button" @click="$emit('update:selectedDate', '2026-07-01')">
        jump
      </button>
      <button data-testid="jump-same-month-date" type="button" @click="$emit('update:selectedDate', '2026-06-20')">
        jump same month
      </button>
      <button data-testid="print-week" type="button" @click="$emit('printWeek')">
        打印周表
      </button>
      <button data-testid="print-month" type="button" @click="$emit('printMonth')">
        打印月表
      </button>
    </section>
  `
});
```

Update `enterAdminModeForTest`:

```ts
async function enterAdminModeForTest(wrapper: ReturnType<typeof mountApp>) {
  await flushPromises();
  expect(wrapper.get(".header-user").text()).toContain("系统管理员");
}
```

Replace the `shows the current user and supports logging out` test with:

```ts
it("shows the current user in the header and supports logging out", async () => {
  apiMocks.logout.mockResolvedValue(undefined);
  const wrapper = mountApp();

  await flushPromises();
  expect(wrapper.get(".header-user").text()).toBe("admin · 系统管理员");
  expect(wrapper.find(".week-chip").exists()).toBe(false);
  expect(wrapper.find('[data-testid="current-user"]').exists()).toBe(false);

  await wrapper.get('[data-testid="logout-button"]').trigger("click");
  await flushPromises();

  expect(apiMocks.logout).toHaveBeenCalled();
  expect(wrapper.find(".app-shell").exists()).toBe(false);
});
```

Add this scheduler identity test near the logout test:

```ts
it("uses display name for scheduler header identity when it differs from the role label", async () => {
  const wrapper = mountApp(testData, createSchedulerUser(["staff-nurse-001"]));

  await flushPromises();

  expect(wrapper.get(".header-user").text()).toBe("排班员 · 排班管理员");
});
```

- [ ] **Step 2: Run the App tests to verify RED**

Run:

```bash
npm run test -- src/App.test.ts
```

Expected: FAIL because `.header-user` does not exist yet, `.week-chip` still exists, and `App.vue` still passes `currentUser` to `AppToolbar`.

- [ ] **Step 3: Add header identity computed values in App.vue**

In `src/App.vue`, add these computed values near the permission computed values:

```ts
const currentUserRoleLabel = computed(() => {
  if (currentUser.value?.role === "admin") {
    return "系统管理员";
  }
  if (currentUser.value?.role === "scheduler") {
    return "排班管理员";
  }
  return "只读查看";
});
const currentUserIdentityLabel = computed(() => {
  if (!currentUser.value) {
    return "";
  }

  const displayName = currentUser.value.displayName.trim();
  const fallbackName = displayName && displayName !== currentUserRoleLabel.value ? displayName : currentUser.value.username;
  return `${fallbackName} · ${currentUserRoleLabel.value}`;
});
```

- [ ] **Step 4: Update the header and toolbar call in App.vue**

Replace the header with:

```vue
<header class="app-header">
  <div>
    <p class="eyebrow">国际医学部</p>
    <h1>护理排班管理系统</h1>
  </div>
  <div class="header-user">{{ currentUserIdentityLabel }}</div>
</header>
```

Remove `:current-user="currentUser"` from the `AppToolbar` call:

```vue
<AppToolbar
  v-model:selected-date="selectedDate"
  :admin-mode="canEditSchedule"
  :can-manage-config="canManageConfig"
  @open-management="openManagementDrawer"
  @open-password-change="passwordDialogOpen = true"
  @print-month="printWithMode('month')"
  @print-week="printWithMode('week')"
  @fullscreen="handleFullscreen"
  @logout="handleLogout"
/>
```

- [ ] **Step 5: Run the App tests to verify GREEN for header behavior**

Run:

```bash
npm run test -- src/App.test.ts
```

Expected: the new header identity tests pass. Tests that still expect `.app-info-panel`, `.admin-mode-banner`, or the old tab list may fail until Task 3.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add src/App.vue src/App.test.ts
git commit -m "feat: show current user in app header"
```

## Task 3: Add The 使用说明 Workbench Tab

**Files:**
- Modify: `src/App.test.ts`
- Modify: `src/App.vue`

- [ ] **Step 1: Write the failing help tab tests**

Replace the `renders concise usage and calculation guidance below the title` test in `src/App.test.ts` with:

```ts
it("moves usage, permission, and calculation guidance into the help tab", async () => {
  const wrapper = mountApp();

  await flushPromises();

  expect(wrapper.find(".app-info-panel").exists()).toBe(false);
  expect(wrapper.find(".admin-mode-banner").exists()).toBe(false);
  expect(wrapper.find('[data-testid="workbench-panel-help"]').exists()).toBe(true);
  expectPanelHidden(wrapper, "workbench-panel-help");

  await wrapper.get('[data-testid="workbench-tab-help"]').trigger("click");
  await nextTick();

  expectPanelVisible(wrapper, "workbench-panel-help");
  const helpPanel = wrapper.get('[data-testid="workbench-panel-help"]');
  expect(helpPanel.text()).toContain("快速上手");
  expect(helpPanel.text()).toContain("通过日期选择或上一周、本周、下一周定位自然周");
  expect(helpPanel.text()).toContain("选择画笔班次");
  expect(helpPanel.text()).toContain("人员权限");
  expect(helpPanel.text()).toContain("系统管理员：可查看全科排班，可维护人员、班次、节假日、账号、排班和月结");
  expect(helpPanel.text()).toContain("排班管理员：可查看全科排班，只能维护账号可管理人员范围内的排班和月结");
  expect(helpPanel.text()).toContain("只读查看：可查看排班、查询、周统计和月结结果，不能保存修改");
  expect(helpPanel.text()).toContain("绑定人员只用于标识账号本人");
  expect(helpPanel.text()).toContain("核算规则");
  expect(helpPanel.text()).toContain("按班次而不是自然日计出勤");
  expect(helpPanel.text()).toContain("加班 = max(0, 出勤班次 - 满勤标准)");
  expect(helpPanel.text()).toContain("护士长绩效系数单独核算");
  expect(helpPanel.text()).toContain("班次系数");
  expect(helpPanel.text()).toContain("A1组长 1.50");
  expect(helpPanel.text()).toContain("休息 不计出勤");
});
```

Update the tab-order assertion in `adds the query tab between schedule and weekly with the current week selected by default`:

```ts
expect(wrapper.findAll(".workbench-tabs button").map((button) => button.text())).toEqual([
  "排班",
  "查询",
  "周统计",
  "月结与奖金",
  "使用说明"
]);
```

Update `passes only scheduler-managed enabled staff ids to the schedule grid` by replacing the banner assertion:

```ts
expect(wrapper.find(".admin-mode-banner").exists()).toBe(false);
```

- [ ] **Step 2: Run the App tests to verify RED**

Run:

```bash
npm run test -- src/App.test.ts
```

Expected: FAIL because the `help` tab and `workbench-panel-help` do not exist yet, while the removed homepage panel and permission banner still exist.

- [ ] **Step 3: Extend the workbench tab model**

In `src/App.vue`, change:

```ts
type WorkbenchTab = "schedule" | "query" | "weekly" | "bonus";
```

to:

```ts
type WorkbenchTab = "schedule" | "query" | "weekly" | "bonus" | "help";
```

Add the help tab:

```ts
const workbenchTabs: Array<{ key: WorkbenchTab; label: string }> = [
  { key: "schedule", label: "排班" },
  { key: "query", label: "查询" },
  { key: "weekly", label: "周统计" },
  { key: "bonus", label: "月结与奖金" },
  { key: "help", label: "使用说明" }
];
```

- [ ] **Step 4: Remove homepage guidance and permission banner**

In `src/App.vue`, delete the entire top-level `<section class="app-info-panel" aria-label="系统使用说明与核算规则">...</section>`.

Delete the top-level permission banner:

```vue
<section v-if="currentUser.role === 'admin' || currentUser.role === 'scheduler'" class="admin-mode-banner" role="status">
  当前账号可查看全科排班{{ canManageConfig ? "，并可维护人员、班次、节假日和账号" : "；可编辑范围由账号可管理人员决定" }}。
</section>
```

- [ ] **Step 5: Add the help panel after the bonus panel**

In `src/App.vue`, add this panel inside `.workbench-panel`, after `workbench-panel-bonus`:

```vue
<section v-show="activeWorkbenchTab === 'help'" class="workbench-tab-panel help-page" data-testid="workbench-panel-help">
  <section class="help-section">
    <h2>快速上手</h2>
    <ul class="help-list">
      <li>通过日期选择或上一周、本周、下一周定位自然周。</li>
      <li>在“排班”页选择画笔班次，再点击表格格子快速填班。</li>
      <li>点击格子可进入单元格编辑，处理一人一天多个班次或备注。</li>
      <li>搜索人员只影响当前页面展示，不改变排班数据。</li>
      <li>复制上一周、批量休息、批量办公、批量清空只作用于当前可编辑范围。</li>
    </ul>
  </section>

  <section class="help-section">
    <h2>人员权限</h2>
    <ul class="help-list">
      <li>系统管理员：可查看全科排班，可维护人员、班次、节假日、账号、排班和月结。</li>
      <li>排班管理员：可查看全科排班，只能维护账号可管理人员范围内的排班和月结。</li>
      <li>只读查看：可查看排班、查询、周统计和月结结果，不能保存修改。</li>
      <li>绑定人员只用于标识账号本人，不会自动授予排班权限；编辑范围由账号可管理人员决定。</li>
    </ul>
  </section>

  <section class="help-section">
    <h2>核算规则</h2>
    <ul class="help-list">
      <li>按班次而不是自然日计出勤。</li>
      <li>满勤默认 5 个班次，影响满勤的节假日会扣减满勤标准。</li>
      <li>加班 = max(0, 出勤班次 - 满勤标准)。</li>
      <li>总系数按班次系数累加，护士长绩效系数单独核算。</li>
    </ul>
    <p v-if="shiftCoefficientDescriptions" class="help-rule-list">班次系数：{{ shiftCoefficientDescriptions }}</p>
  </section>
</section>
```

- [ ] **Step 6: Run the App tests to verify GREEN**

Run:

```bash
npm run test -- src/App.test.ts
```

Expected: PASS. The default tab is still `排班`; `使用说明` appears last; guidance and role copy appears only in the help panel.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add src/App.vue src/App.test.ts
git commit -m "feat: move homepage guidance to help tab"
```

## Task 4: Update Styles For Header User And Help Page

**Files:**
- Modify: `src/styles/main-css.test.ts`
- Modify: `src/styles/main.css`

- [ ] **Step 1: Write failing CSS tests**

In `src/styles/main-css.test.ts`, add this test near the top-level layout tests:

```ts
it("styles the header account identity without using the old week chip", () => {
  const headerUserRules = ruleBlocks(".header-user")[0] || "";

  expect(headerUserRules).toContain("border: 1px solid #dbe3ef");
  expect(headerUserRules).toContain("background: #ffffff");
  expect(headerUserRules).toContain("font-weight: 700");
  expect(headerUserRules).toContain("white-space: nowrap");
  expect(ruleBlocks(".week-chip")).toHaveLength(0);
  expect(ruleBlocks(".toolbar-user")).toHaveLength(0);
});
```

Add this help page test:

```ts
it("styles the help page as compact full-width guidance content", () => {
  const helpPageRules = ruleBlocks(".help-page")[0] || "";
  const helpSectionRules = ruleBlocks(".help-section")[0] || "";
  const helpHeadingRules = ruleBlocks(".help-section h2")[0] || "";
  const helpListRules = ruleBlocks(".help-list")[0] || "";
  const helpRuleListRules = ruleBlocks(".help-rule-list")[0] || "";

  expect(helpPageRules).toContain("display: grid");
  expect(helpPageRules).toContain("gap: 12px");
  expect(helpPageRules).toContain("border: 1px solid #dbe3ef");
  expect(helpPageRules).toContain("background: #ffffff");
  expect(helpSectionRules).toContain("display: grid");
  expect(helpSectionRules).toContain("gap: 8px");
  expect(helpHeadingRules).toContain("font-size: 15px");
  expect(helpHeadingRules).toContain("font-weight: 900");
  expect(helpListRules).toContain("margin: 0");
  expect(helpListRules).toContain("line-height: 1.7");
  expect(helpRuleListRules).toContain("margin: 0");
  expect(helpRuleListRules).toContain("color: #475569");
});
```

Add this mobile assertion to the same file:

```ts
it("lets the header account identity wrap naturally on mobile", () => {
  const mobileCss = mediaBlock("(max-width: 768px)");
  const mobileHeaderUser = ruleBlockIn(mobileCss, ".header-user");

  expect(mobileHeaderUser).toContain("width: 100%");
  expect(mobileHeaderUser).toContain("text-align: center");
  expect(mobileHeaderUser).toContain("white-space: normal");
});
```

- [ ] **Step 2: Run CSS tests to verify RED**

Run:

```bash
npm run test -- src/styles/main-css.test.ts
```

Expected: FAIL because `.header-user`, `.help-page`, `.help-section`, `.help-list`, and `.help-rule-list` do not exist, and old `.week-chip` / `.toolbar-user` rules still exist.

- [ ] **Step 3: Update main.css**

In `src/styles/main.css`, delete these old rule groups:

```css
.admin-mode-banner {
  margin-bottom: 12px;
  border: 1px solid #bbf7d0;
  background: #f0fdf4;
  color: #166534;
  padding: 9px 12px;
  font-size: 13px;
  font-weight: 600;
}

.toolbar-user {
  border: 1px solid #dbe3ef;
  padding: 6px 9px;
  background: #f8fafc;
  color: #334155;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.week-chip {
  padding: 6px 10px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 13px;
}

.app-info-panel {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
  gap: 12px;
  margin-bottom: 12px;
  border: 1px solid #dbe3ef;
  background: #ffffff;
  padding: 10px 12px;
}

.app-info-block {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.app-info-block h2 {
  margin: 0;
  color: #0f172a;
  font-size: 14px;
}

.app-info-block p {
  margin: 0;
  color: #475569;
  font-size: 13px;
  line-height: 1.55;
}
```

Add these new rules after `.eyebrow`:

```css
.header-user {
  border: 1px solid #dbe3ef;
  padding: 6px 10px;
  background: #ffffff;
  color: #334155;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}
```

Add these help-page rules near the workbench panel styles:

```css
.help-page {
  display: grid;
  gap: 12px;
  border: 1px solid #dbe3ef;
  background: #ffffff;
  padding: 14px 16px;
}

.help-section {
  display: grid;
  gap: 8px;
}

.help-section h2 {
  margin: 0;
  color: #0f172a;
  font-size: 15px;
  font-weight: 900;
}

.help-list {
  margin: 0;
  padding-left: 18px;
  color: #475569;
  font-size: 13px;
  line-height: 1.7;
}

.help-rule-list {
  margin: 0;
  color: #475569;
  font-size: 13px;
  line-height: 1.7;
}
```

In the mobile media query, replace the old `.week-chip`, `.app-info-panel`, `.app-info-block`, and `.admin-mode-banner` blocks with:

```css
.header-user {
  width: 100%;
  text-align: center;
  white-space: normal;
}

.help-page {
  padding: 12px;
}
```

In the `@media print` block, replace `.app-info-panel, .admin-mode-banner,` with `.header-user,`.

- [ ] **Step 4: Run CSS tests to verify GREEN**

Run:

```bash
npm run test -- src/styles/main-css.test.ts
```

Expected: PASS. CSS no longer defines removed homepage/toolbar identity styles and includes compact help-page styling.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add src/styles/main.css src/styles/main-css.test.ts
git commit -m "style: add help tab and header identity layout"
```

## Task 5: Full Verification And Cleanup

**Files:**
- Verify: `src/App.vue`
- Verify: `src/components/AppToolbar.vue`
- Verify: `src/App.test.ts`
- Verify: `src/components/AppToolbar.test.ts`
- Verify: `src/styles/main.css`
- Verify: `src/styles/main-css.test.ts`

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test -- src/components/AppToolbar.test.ts src/App.test.ts src/styles/main-css.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
npm run test
```

Expected: PASS.

- [ ] **Step 3: Run type and production build verification**

Run:

```bash
npm run build
```

Expected: PASS. Vue type checking confirms `AppToolbar` no longer requires `currentUser` and `WorkbenchTab` accepts `help`.

- [ ] **Step 4: Manually verify in the browser**

Start the local app if it is not already running:

```bash
npm run dev
```

Open the local URL shown by Vite. Verify:

- Header left shows `国际医学部` and `护理排班管理系统`.
- Header right shows `admin · 系统管理员`.
- Header no longer shows `2026-06-22 至 2026-06-28`.
- Toolbar still shows the selected natural-week range next to date navigation.
- Homepage no longer shows the old quick-start/rules panel.
- Homepage no longer shows the green current-account permission banner.
- Workbench tabs are `排班 / 查询 / 周统计 / 月结与奖金 / 使用说明`.
- Clicking `使用说明` shows `快速上手`, `人员权限`, and `核算规则`.
- Returning to `排班` leaves the schedule grid behavior unchanged.

- [ ] **Step 5: Inspect git diff**

Run:

```bash
git diff --stat HEAD
git diff HEAD -- src/App.vue src/components/AppToolbar.vue src/App.test.ts src/components/AppToolbar.test.ts src/styles/main.css src/styles/main-css.test.ts
```

Expected: only the planned frontend files changed; no API, server, schema, or business-calculation files changed.

- [ ] **Step 6: Final commit if any cleanup remains**

If Step 5 shows uncommitted cleanup changes, commit them:

```bash
git add src/App.vue src/components/AppToolbar.vue src/App.test.ts src/components/AppToolbar.test.ts src/styles/main.css src/styles/main-css.test.ts
git commit -m "test: verify homepage help tab behavior"
```

If there are no uncommitted changes, skip this commit.
