# Workbench Action Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `配置`, `打印周表`, and `打印月表` out of the homepage header and into first-class workbench tabs, while making the account menu label and dropdown match the approved design.

**Architecture:** Keep the single-page `App.vue` workbench and extend its tab state with `printWeek`, `printMonth`, and `config`. Reuse `PrintViews` and PDF helper functions through an in-page print panel, and extend `ManagementDrawer.vue` with an inline shell mode so the same management content can render inside the `配置` tab.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Element Plus, Vitest with Vue Test Utils, existing CSS in `src/styles/main.css`.

---

## File Structure

- Modify `src/App.vue`
  - Extend `WorkbenchTab` and `workbenchTabs`.
  - Remove header action buttons for config and print.
  - Change account label to `当前用户：<username>`.
  - Add print-week, print-month, and config tab panels.
  - Replace `managementOpen` drawer state with tab-driven management loading.
  - Reuse PDF/share/system-print helpers for tab panels.
- Modify `src/components/ManagementDrawer.vue`
  - Add a `mode?: "drawer" | "inline"` prop.
  - Render the existing management content in either `el-drawer` or an inline section.
  - Preserve all existing props, emits, tab state, form state, and tests.
- Modify `src/App.test.ts`
  - Update header/menu expectations.
  - Add workbench tab order tests.
  - Move print tests from header button + dialog behavior to print tab panel behavior.
  - Move config tests from header button + drawer behavior to config tab behavior.
- Modify `src/components/ManagementDrawer.test.ts`
  - Add inline-mode coverage and preserve default drawer-mode coverage.
- Modify `src/styles/main.css`
  - Remove `.app-header.user-menu-open` layout-shift rule.
  - Keep `.header-user-dropdown` absolute and raise layering if needed.
  - Add `.print-panel`, `.print-panel-actions`, `.management-panel`, and inline-management styling.
  - Update mobile header rules now that header actions only contain the account menu.
- Modify `src/styles/main-css.test.ts`
  - Update CSS assertions for no layout shift, floating menu, print panels, and inline management.
- Optional follow-up if needed: modify `tests/e2e/schedule.spec.ts`
  - Existing e2e opens config via the header button. If unit coverage is enough, update this e2e selector to open the `配置` workbench tab only when the e2e is run locally.

---

### Task 1: Header And Workbench Navigation

**Files:**
- Modify: `src/App.test.ts`
- Modify: `src/App.vue`
- Modify: `src/styles/main-css.test.ts`
- Modify: `src/styles/main.css`

- [ ] **Step 1: Write failing App tests for the approved tab order and header**

In `src/App.test.ts`, update the existing `adds the query tab between schedule and weekly with the current week selected by default` expectation to:

```ts
expect(wrapper.findAll(".workbench-tabs button").map((button) => button.text())).toEqual([
  "排班",
  "查询",
  "周统计",
  "月结与奖金",
  "打印周表",
  "打印月表",
  "配置",
  "使用说明"
]);
```

Replace `shows header actions with the user menu and removes fullscreen and role labels` with:

```ts
it("shows only the current user trigger in the header actions", async () => {
  const wrapper = mountApp();

  await flushPromises();

  const headerActions = wrapper.get(".app-header-actions");
  expect(headerActions.find('[data-testid="open-management"]').exists()).toBe(false);
  expect(headerActions.find('[data-testid="print-week"]').exists()).toBe(false);
  expect(headerActions.find('[data-testid="print-month"]').exists()).toBe(false);
  expect(headerActions.get('[data-testid="header-user-menu-button"]').text()).toBe("当前用户：admin");
  expect(headerActions.text()).not.toContain("全屏");
  expect(wrapper.find('[data-testid="fullscreen-button"]').exists()).toBe(false);
  expect(wrapper.get(".app-header").text()).not.toContain("系统管理员");
  expect(wrapper.get(".app-header").text()).not.toContain("排班管理员");
});
```

Update `shows the current user in the header and supports logging out`:

```ts
expect(userButton.text()).toBe("当前用户：admin");
expect(userButton.text()).not.toContain("系统管理员");
```

Update `shows only the scheduler account in the header identity`:

```ts
expect(userButtonText).toBe("当前用户：scheduler");
```

Update `opens user menu with password change and logout actions` so the class expectation proves the menu floats without layout shifting:

```ts
expect(wrapper.get(".app-header").classes()).not.toContain("user-menu-open");
expect(wrapper.find(".header-user-dropdown").exists()).toBe(false);

await wrapper.get('[data-testid="header-user-menu-button"]').trigger("click");
await nextTick();

expect(wrapper.get(".app-header").classes()).not.toContain("user-menu-open");
const dropdown = wrapper.get(".header-user-dropdown");
expect(dropdown.attributes("role")).toBe("menu");
expect(dropdown.get('[data-testid="open-password-change"]').text()).toContain("修改密码");
expect(dropdown.get('[data-testid="logout-button"]').text()).toContain("退出登录");
```

- [ ] **Step 2: Run the focused App tests and verify they fail for the expected missing behavior**

Run:

```bash
npm run test -- src/App.test.ts
```

Expected: FAIL because the old tab order has only five tabs, the header still renders `配置` / `打印周表` / `打印月表`, the account label is still `admin`, and opening the menu still adds `user-menu-open`.

- [ ] **Step 3: Implement the minimal App header and tab state changes**

In `src/App.vue`, remove unused icon imports:

```ts
import { ElMessage, ElMessageBox } from "element-plus";
```

Update the tab type:

```ts
type WorkbenchTab = "schedule" | "query" | "weekly" | "bonus" | "printWeek" | "printMonth" | "config" | "help";
```

Update `workbenchTabs`:

```ts
const workbenchTabs: Array<{ key: WorkbenchTab; label: string }> = [
  { key: "schedule", label: "排班" },
  { key: "query", label: "查询" },
  { key: "weekly", label: "周统计" },
  { key: "bonus", label: "月结与奖金" },
  { key: "printWeek", label: "打印周表" },
  { key: "printMonth", label: "打印月表" },
  { key: "config", label: "配置" },
  { key: "help", label: "使用说明" }
];
```

Update `currentUserAccountLabel`:

```ts
const currentUserAccountLabel = computed(() => (currentUser.value ? `当前用户：${currentUser.value.username}` : "当前用户："));
```

Change the header opening tag:

```vue
<header class="app-header">
```

Remove the three header action buttons:

```vue
<button data-testid="open-management" ...>配置</button>
<button data-testid="print-week" ...>打印周表</button>
<button data-testid="print-month" ...>打印月表</button>
```

Keep the existing `.app-header-actions` wrapper with only `.header-user-menu` inside it.

- [ ] **Step 4: Write failing CSS test for no layout-shift rule**

In `src/styles/main-css.test.ts`, update `styles compact header actions and account dropdown`:

```ts
const openUserMenuHeaderRules = ruleBlocks(".app-header.user-menu-open");
const headerActionsRules = ruleBlocks(".app-header-actions")[0] || "";
const userMenuRules = ruleBlocks(".header-user-menu")[0] || "";
const userMenuButtonRules = ruleBlocks(".app-header-actions .header-user-menu-button")[0] || "";
const userDropdownRules = ruleBlocks(".header-user-dropdown")[0] || "";

expect(openUserMenuHeaderRules).toHaveLength(0);
expect(headerActionsRules).toContain("display: flex");
expect(headerActionsRules).toContain("justify-content: flex-end");
expect(headerActionsRules).toContain("align-items: center");
expect(userMenuRules).toContain("position: relative");
expect(userMenuButtonRules).toContain("max-width:");
expect(userMenuButtonRules).toContain("overflow: hidden");
expect(userMenuButtonRules).toContain("text-overflow: ellipsis");
expect(userDropdownRules).toContain("position: absolute");
expect(userDropdownRules).toContain("right: 0");
expect(userDropdownRules).toContain("top: calc(100% + 6px)");
expect(userDropdownRules).toContain("z-index:");
```

- [ ] **Step 5: Run the focused CSS test and verify it fails for the expected missing behavior**

Run:

```bash
npm run test -- src/styles/main-css.test.ts
```

Expected: FAIL because `.app-header.user-menu-open` still exists and the desktop account button does not yet constrain overflow.

- [ ] **Step 6: Implement minimal header CSS**

In `src/styles/main.css`, delete:

```css
.app-header.user-menu-open {
  margin-bottom: 88px;
}
```

Update `.app-header-actions .header-user-menu-button`:

```css
.app-header-actions .header-user-menu-button {
  max-width: min(220px, 50vw);
  overflow: hidden;
  border: 1px solid #dbe3ef;
  background: #ffffff;
  color: #334155;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

If needed after browser verification, raise `.header-user-dropdown` to:

```css
z-index: 50;
```

- [ ] **Step 7: Run focused tests and commit Task 1**

Run:

```bash
npm run test -- src/App.test.ts src/styles/main-css.test.ts
```

Expected: PASS for updated header/navigation/CSS tests.

Commit:

```bash
git add src/App.vue src/App.test.ts src/styles/main.css src/styles/main-css.test.ts
git commit -m "feat: move header actions into workbench tabs"
```

---

### Task 2: Print Week And Print Month Panels

**Files:**
- Modify: `src/App.test.ts`
- Modify: `src/App.vue`
- Modify: `src/styles/main-css.test.ts`
- Modify: `src/styles/main.css`

- [ ] **Step 1: Write failing App tests for print tab panels**

Replace the old header-button print tests with tab-driven tests:

```ts
async function openPrintWeekTab(wrapper: ReturnType<typeof mountApp>) {
  await wrapper.get('[data-testid="workbench-tab-printWeek"]').trigger("click");
}

async function openPrintMonthTab(wrapper: ReturnType<typeof mountApp>) {
  await wrapper.get('[data-testid="workbench-tab-printMonth"]').trigger("click");
}
```

Update `opens a visible week print preview on mobile instead of silently invoking system print`:

```ts
await openPrintWeekTab(wrapper);
await nextTick();

expect(printSpy).not.toHaveBeenCalled();
expectPanelVisible(wrapper, "workbench-panel-print-week");
expect(wrapper.get('[data-testid="workbench-panel-print-week"]').text()).toContain("周表打印预览");
expect(wrapper.get('[data-testid="print-panel-pdf-button"]').text()).toContain("生成/分享 PDF");
expect(wrapper.get(".print-preview-active").text()).toContain("周表预览");
expect(wrapper.find(".print-preview-dialog").exists()).toBe(false);
```

Update `hides the duplicate system print button in the mobile print preview`:

```ts
await openPrintMonthTab(wrapper);
await nextTick();

expect(printSpy).not.toHaveBeenCalled();
expect(wrapper.get('[data-testid="print-panel-pdf-button"]').text()).toContain("生成/分享 PDF");
expect(wrapper.find('[data-testid="print-panel-system-button"]').exists()).toBe(false);
```

Update `passes a monthly summary into the month print preview`:

```ts
await openPrintMonthTab(wrapper);
await nextTick();

expect(printSpy).not.toHaveBeenCalled();
expect(wrapper.get(".print-preview-active").text()).toContain("月度汇总");
expect(wrapper.get(".print-preview-active").text()).toContain("李护士:1:1.50");
```

Update PDF tests to open print tabs and click `print-panel-pdf-button`:

```ts
await openPrintWeekTab(wrapper);
await nextTick();
await wrapper.get('[data-testid="print-panel-pdf-button"]').trigger("click");
```

```ts
await openPrintMonthTab(wrapper);
await nextTick();
await wrapper.get('[data-testid="print-panel-pdf-button"]').trigger("click");
```

Update expected share titles:

```ts
title: "周表打印预览"
```

and keep `month-schedule.pdf` / `week-schedule.pdf` filename assertions unchanged.

- [ ] **Step 2: Run the focused App print tests and verify they fail for the expected missing behavior**

Run:

```bash
npm run test -- src/App.test.ts -t "print preview|PDF|monthly summary"
```

Expected: FAIL because `workbench-tab-printWeek`, `workbench-tab-printMonth`, `workbench-panel-print-week`, `workbench-panel-print-month`, and `print-panel-pdf-button` do not exist yet.

- [ ] **Step 3: Implement shared print panel state and helpers**

In `src/App.vue`, add:

```ts
const printWeekPanelContentRef = ref<HTMLElement | null>(null);
const printMonthPanelContentRef = ref<HTMLElement | null>(null);
const activePrintMode = computed<PrintMode | null>(() => {
  if (activeWorkbenchTab.value === "printWeek") {
    return "week";
  }

  if (activeWorkbenchTab.value === "printMonth") {
    return "month";
  }

  return printPreviewMode.value;
});

const activePrintTitle = computed(() => {
  if (activePrintMode.value === "week") {
    return "周表打印预览";
  }

  if (activePrintMode.value === "month") {
    return "月表打印预览";
  }

  return "打印预览";
});
```

Keep `printPreviewTitle` for any remaining compatibility, but change it to:

```ts
const printPreviewTitle = computed(() => activePrintTitle.value);
```

Add a reset watcher:

```ts
watch(activeWorkbenchTab, (nextTab, previousTab) => {
  if (nextTab !== previousTab && (nextTab === "printWeek" || nextTab === "printMonth" || previousTab === "printWeek" || previousTab === "printMonth")) {
    revokePdfDownloadUrl();
  }
});
```

Add:

```ts
function getActivePrintElement(): HTMLElement | null {
  if (activePrintMode.value === "week") {
    return printWeekPanelContentRef.value?.querySelector(".print-preview-active") ?? null;
  }

  if (activePrintMode.value === "month") {
    return printMonthPanelContentRef.value?.querySelector(".print-preview-active") ?? null;
  }

  return (
    printPreviewContentRef.value?.querySelector(".print-preview-active") ??
    null
  );
}

function getCurrentPrintMode(): PrintMode | null {
  return activePrintMode.value;
}

function handlePrintPanelPrint(): void {
  const mode = getCurrentPrintMode();
  if (!mode) {
    return;
  }

  invokeSystemPrint(mode);
}
```

Update `handlePreviewPrint`:

```ts
function handlePreviewPrint(): void {
  handlePrintPanelPrint();
}
```

Update `handlePreviewPdfShare` to use active mode and element:

```ts
async function handlePreviewPdfShare(): Promise<void> {
  const mode = getCurrentPrintMode();
  if (!mode || pdfGenerating.value) {
    return;
  }

  const activePrintView = getActivePrintElement();
  if (!(activePrintView instanceof HTMLElement)) {
    ElMessage.error("打印内容不可用");
    return;
  }

  pdfGenerating.value = true;
  revokePdfDownloadUrl();

  try {
    const filename = getPrintPdfFilename(mode);
    const pdfFile = await createPrintPdfFile({ element: activePrintView, filename });

    if (canSharePdfFile(pdfFile)) {
      try {
        await navigator.share({
          files: [pdfFile],
          title: activePrintTitle.value
        });
        ElMessage.success("PDF 已发送到系统分享");
      } catch (shareError) {
        preparePdfDownload(pdfFile, "系统分享未完成，请点击下方链接下载 PDF。");
        ElMessage.warning(shareError instanceof Error ? shareError.message : "系统分享未完成");
      }
      return;
    }

    preparePdfDownload(pdfFile, "当前浏览器不支持直接分享 PDF，请点击下方链接下载。");
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "PDF 生成失败");
  } finally {
    pdfGenerating.value = false;
  }
}
```

- [ ] **Step 4: Render print panels**

In `src/App.vue`, add before the help panel:

```vue
<section
  v-show="activeWorkbenchTab === 'printWeek'"
  class="workbench-tab-panel print-panel"
  data-testid="workbench-panel-print-week"
>
  <header class="print-panel-header">
    <div>
      <h2>周表打印预览</h2>
      <p class="print-preview-tip">预览内容确认无误后可生成 PDF；手机端优先使用系统分享，不支持时可下载 PDF 后打印。</p>
    </div>
    <div class="print-panel-actions">
      <button data-testid="print-panel-pdf-button" type="button" :disabled="pdfGenerating" @click="handlePreviewPdfShare">
        {{ pdfGenerating ? "生成中..." : "生成/分享 PDF" }}
      </button>
      <button
        v-if="!isMobileViewport() && isSystemPrintSupported"
        data-testid="print-panel-system-button"
        type="button"
        @click="handlePrintPanelPrint"
      >
        调用系统打印
      </button>
    </div>
  </header>
  <p v-if="!isSystemPrintSupported" class="print-preview-warning">
    当前浏览器不支持直接调用系统打印，可先核对预览内容，再使用浏览器菜单中的打印或分享功能。
  </p>
  <section ref="printWeekPanelContentRef" class="print-preview-content" aria-label="周表打印预览内容">
    <PrintViews
      v-if="data && weeklySummary"
      :data="data"
      :days="printMonthDays"
      :monthly-summary="monthlySummary"
      :monthly-settlement="currentMonthlySettlement"
      :summary="weeklySummary"
      preview-mode="week"
    />
  </section>
  <p v-if="printPdfStatus" class="print-pdf-status">{{ printPdfStatus }}</p>
  <p v-if="pdfDownloadUrl" class="print-pdf-download">
    <a data-testid="print-pdf-download-link" :href="pdfDownloadUrl" :download="pdfDownloadName">下载 PDF</a>
  </p>
</section>

<section
  v-show="activeWorkbenchTab === 'printMonth'"
  class="workbench-tab-panel print-panel"
  data-testid="workbench-panel-print-month"
>
  <header class="print-panel-header">
    <div>
      <h2>月表打印预览</h2>
      <p class="print-preview-tip">预览内容确认无误后可生成 PDF；手机端优先使用系统分享，不支持时可下载 PDF 后打印。</p>
    </div>
    <div class="print-panel-actions">
      <button data-testid="print-panel-pdf-button" type="button" :disabled="pdfGenerating" @click="handlePreviewPdfShare">
        {{ pdfGenerating ? "生成中..." : "生成/分享 PDF" }}
      </button>
      <button
        v-if="!isMobileViewport() && isSystemPrintSupported"
        data-testid="print-panel-system-button"
        type="button"
        @click="handlePrintPanelPrint"
      >
        调用系统打印
      </button>
    </div>
  </header>
  <p v-if="!isSystemPrintSupported" class="print-preview-warning">
    当前浏览器不支持直接调用系统打印，可先核对预览内容，再使用浏览器菜单中的打印或分享功能。
  </p>
  <section ref="printMonthPanelContentRef" class="print-preview-content" aria-label="月表打印预览内容">
    <PrintViews
      v-if="data && weeklySummary"
      :data="data"
      :days="printMonthDays"
      :monthly-summary="monthlySummary"
      :monthly-settlement="currentMonthlySettlement"
      :summary="weeklySummary"
      preview-mode="month"
    />
  </section>
  <p v-if="printPdfStatus" class="print-pdf-status">{{ printPdfStatus }}</p>
  <p v-if="pdfDownloadUrl" class="print-pdf-download">
    <a data-testid="print-pdf-download-link" :href="pdfDownloadUrl" :download="pdfDownloadName">下载 PDF</a>
  </p>
</section>
```

Leave the old dialog only if any compatibility tests still need it; no header path should open it after Task 1.

- [ ] **Step 5: Write failing CSS tests for print panels**

In `src/styles/main-css.test.ts`, add:

```ts
it("styles in-page print panels with readable controls", () => {
  const panelRules = ruleBlocks(".print-panel")[0] || "";
  const headerRules = ruleBlocks(".print-panel-header")[0] || "";
  const actionRules = ruleBlocks(".print-panel-actions")[0] || "";

  expect(panelRules).toContain("display: grid");
  expect(panelRules).toContain("border: 1px solid #dbe3ef");
  expect(panelRules).toContain("background: #ffffff");
  expect(headerRules).toContain("display: flex");
  expect(headerRules).toContain("justify-content: space-between");
  expect(actionRules).toContain("display: flex");
  expect(actionRules).toContain("flex-wrap: wrap");
});
```

- [ ] **Step 6: Implement print panel CSS**

In `src/styles/main.css`, add near existing print preview styles:

```css
.print-panel {
  display: grid;
  gap: 12px;
  border: 1px solid #dbe3ef;
  background: #ffffff;
  padding: 14px;
}

.print-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.print-panel-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 900;
  letter-spacing: 0;
}

.print-panel-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.print-panel-actions button {
  min-height: 34px;
  border: 1px solid #bfdbfe;
  padding: 0 10px;
  background: #eff6ff;
  color: #1d4ed8;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.print-panel-actions button:disabled {
  border-color: #e2e8f0;
  background: #f8fafc;
  color: #94a3b8;
  cursor: not-allowed;
}
```

Add mobile rule:

```css
.print-panel-header {
  flex-direction: column;
}

.print-panel-actions {
  justify-content: flex-start;
}
```

inside the existing `@media (max-width: 768px)` block.

- [ ] **Step 7: Run focused tests and commit Task 2**

Run:

```bash
npm run test -- src/App.test.ts src/styles/main-css.test.ts
```

Expected: PASS for App and CSS tests.

Commit:

```bash
git add src/App.vue src/App.test.ts src/styles/main.css src/styles/main-css.test.ts
git commit -m "feat: add print workbench panels"
```

---

### Task 3: Configuration Tab With Inline Management

**Files:**
- Modify: `src/components/ManagementDrawer.test.ts`
- Modify: `src/components/ManagementDrawer.vue`
- Modify: `src/App.test.ts`
- Modify: `src/App.vue`
- Modify: `src/styles/main-css.test.ts`
- Modify: `src/styles/main.css`
- Optional: `tests/e2e/schedule.spec.ts`

- [ ] **Step 1: Write failing ManagementDrawer inline-mode test**

In `src/components/ManagementDrawer.test.ts`, add:

```ts
it("renders management content inline when mode is inline", () => {
  const wrapper = mountDrawer({
    props: {
      mode: "inline",
      modelValue: true
    }
  });

  expect(wrapper.find(".management-drawer").exists()).toBe(false);
  expect(wrapper.find('[data-testid="management-inline-panel"]').exists()).toBe(true);
  expect(wrapper.get('[data-testid="management-inline-panel"]').text()).toContain("人员");
  expect(wrapper.find(".management-mobile-list").exists()).toBe(true);
});
```

If `mountDrawer` currently does not accept overrides in that shape, adapt only the helper signature so this test can pass without weakening existing tests.

- [ ] **Step 2: Run focused ManagementDrawer test and verify it fails for the expected missing inline mode**

Run:

```bash
npm run test -- src/components/ManagementDrawer.test.ts
```

Expected: FAIL because `mode` is not defined and `management-inline-panel` does not exist.

- [ ] **Step 3: Implement inline shell in ManagementDrawer**

In `src/components/ManagementDrawer.vue`, add prop:

```ts
mode?: "drawer" | "inline";
```

Add default:

```ts
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    mode?: "drawer" | "inline";
    data: Pick<PublicAppData, "staff" | "shifts" | "holidays">;
    users: ManagedAuthUser[];
    auditLogs: AuditLogEntry[];
    adminMode: boolean;
    staffSaveVersion: number;
    shiftSaveVersion: number;
    holidaySaveVersion: number;
    staffSaving: boolean;
    shiftSaving: boolean;
    holidaySaving: boolean;
    userSaving: boolean;
    auditLoading: boolean;
  }>(),
  { mode: "drawer" }
);
```

Replace the outer `<el-drawer>` with a dynamic shell so the management tab panes stay in one place:

```vue
<component
  :is="mode === 'drawer' ? 'el-drawer' : 'section'"
  v-if="mode === 'drawer' || modelValue"
  :class="mode === 'drawer' ? 'management-drawer' : 'management-inline-panel'"
  :data-testid="mode === 'inline' ? 'management-inline-panel' : undefined"
  :model-value="mode === 'drawer' ? modelValue : undefined"
  :title="mode === 'drawer' ? '系统配置' : undefined"
  :size="mode === 'drawer' ? '560px' : undefined"
  @update:model-value="emit('update:modelValue', $event)"
>
  <header v-if="mode === 'inline'" class="management-inline-header">
    <h2>系统配置</h2>
  </header>

  <el-alert v-if="!adminMode" title="进入编辑模式后才能保存配置" type="warning" :closable="false" />

  <el-tabs v-model="activeManagementTab" @tab-change="handleManagementTabChange">
    <!-- keep all existing el-tab-pane content here unchanged -->
  </el-tabs>
</component>
```

Do not duplicate the management tab panes.

- [ ] **Step 4: Write failing App tests for config tab loading and rendering**

In `src/App.test.ts`, update `ManagementDrawerStub`:

```ts
props: ["modelValue", "mode", "users", "auditLogs", "adminMode"],
template: `
  <section
    v-if="modelValue"
    :data-testid="mode === 'inline' ? 'management-inline-panel' : 'management-drawer'"
  >
    <span data-testid="management-mode">{{ mode }}</span>
    <span v-if="!adminMode" data-testid="management-permission">无配置权限</span>
    <span data-testid="drawer-users">{{ users.map((user) => user.username).join(",") }}</span>
    <span data-testid="drawer-audit">{{ auditLogs.map((entry) => entry.summary).join(",") }}</span>
    <!-- keep existing action buttons unchanged -->
  </section>
`
```

Replace `loads users and audit logs when opening system management`:

```ts
it("loads users and audit logs when opening the config tab", async () => {
  const wrapper = mountApp();

  await flushPromises();
  await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
  await flushPromises();

  expect(apiMocks.loadData).toHaveBeenCalledTimes(2);
  expect(apiMocks.listUsers).toHaveBeenCalled();
  expect(apiMocks.listAuditLogs).toHaveBeenCalledWith({ limit: 100 });
  expectPanelVisible(wrapper, "workbench-panel-config");
  expect(wrapper.get('[data-testid="management-inline-panel"]').exists()).toBe(true);
  expect(wrapper.get('[data-testid="management-mode"]').text()).toBe("inline");
  expect(wrapper.get('[data-testid="drawer-users"]').text()).toContain("admin");
  expect(wrapper.get('[data-testid="drawer-audit"]').text()).toContain("保存账号：scheduler");
});
```

Add a non-admin test:

```ts
it("shows configuration permission state for non-admin users", async () => {
  const wrapper = mountApp(testData, createSchedulerUser(["staff-nurse-001"]));

  await flushPromises();
  await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
  await flushPromises();

  expect(apiMocks.listUsers).not.toHaveBeenCalled();
  expect(apiMocks.listAuditLogs).not.toHaveBeenCalled();
  expectPanelVisible(wrapper, "workbench-panel-config");
  expect(wrapper.get('[data-testid="management-inline-panel"]').exists()).toBe(true);
  expect(wrapper.get('[data-testid="management-permission"]').text()).toContain("无配置权限");
});
```

Update existing management save/delete tests to open config tab before clicking drawer action buttons:

```ts
await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
await flushPromises();
```

Keep their save/delete assertions unchanged.

- [ ] **Step 5: Run focused App config tests and verify they fail for the expected missing behavior**

Run:

```bash
npm run test -- src/App.test.ts -t "config|management|配置|users|audit"
```

Expected: FAIL because the config tab panel is not implemented and management still opens via removed header button/drawer state.

- [ ] **Step 6: Implement config tab loading and inline management**

In `src/App.vue`, keep `managementOpen` only if the old drawer is retained for compatibility. Prefer replacing it with:

```ts
const configPanelOpen = computed(() => activeWorkbenchTab.value === "config");
```

Update `refreshLatestAuditLogsIfManaging`:

```ts
async function refreshLatestAuditLogsIfManaging(): Promise<void> {
  if (activeWorkbenchTab.value !== "config" || !canManageConfig.value) {
    return;
  }

  await refreshLatestAuditLogs();
}
```

Replace `openManagementDrawer` with a loader that does not mutate `activeWorkbenchTab`:

```ts
async function loadConfigPanelData(): Promise<void> {
  try {
    await refreshData();
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "系统配置加载失败");
  }
  await refreshManagementData();
}

watch(activeWorkbenchTab, (nextTab) => {
  if (nextTab === "config") {
    void loadConfigPanelData();
  }
});
```

Render config panel before help:

```vue
<section
  v-show="activeWorkbenchTab === 'config'"
  class="workbench-tab-panel management-panel"
  data-testid="workbench-panel-config"
>
  <ManagementDrawer
    v-if="data"
    :model-value="configPanelOpen"
    mode="inline"
    :data="data"
    :users="users"
    :audit-logs="auditLogs"
    :admin-mode="canManageConfig"
    :staff-save-version="staffSaveVersion"
    :shift-save-version="shiftSaveVersion"
    :holiday-save-version="holidaySaveVersion"
    :staff-saving="staffSaving"
    :shift-saving="shiftSaving"
    :holiday-saving="holidaySaving"
    :user-saving="userSaving"
    :audit-loading="auditLoading"
    @save-staff="handleSaveStaff"
    @delete-staff="handleDeleteStaff"
    @save-shift="handleSaveShift"
    @save-holiday="handleSaveHoliday"
    @delete-holiday="handleDeleteHoliday"
    @save-user="handleSaveUser"
    @delete-user="handleDeleteUser"
    @refresh-audit-logs="refreshAuditLogs"
  />
</section>
```

Remove the old always-mounted `ManagementDrawer` drawer from the top of `.workbench`.

- [ ] **Step 7: Write failing CSS tests for inline management**

In `src/styles/main-css.test.ts`, add:

```ts
it("styles inline management as a workbench panel", () => {
  const panelRules = ruleBlocks(".management-panel")[0] || "";
  const inlineRules = ruleBlocks(".management-inline-panel")[0] || "";
  const headerRules = ruleBlocks(".management-inline-header")[0] || "";

  expect(panelRules).toContain("min-width: 0");
  expect(inlineRules).toContain("border: 1px solid #dbe3ef");
  expect(inlineRules).toContain("background: #ffffff");
  expect(inlineRules).toContain("padding:");
  expect(headerRules).toContain("display: flex");
});
```

- [ ] **Step 8: Implement inline management CSS**

In `src/styles/main.css`, add near management styles:

```css
.management-panel {
  min-width: 0;
}

.management-inline-panel {
  border: 1px solid #dbe3ef;
  background: #ffffff;
  padding: 14px;
}

.management-inline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.management-inline-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 900;
  letter-spacing: 0;
}
```

Update mobile management selectors so both drawer and inline panel hide tables and show mobile cards:

```css
.management-drawer .el-table,
.management-inline-panel .el-table {
  display: none;
}
```

Keep existing `.management-mobile-list` mobile behavior.

- [ ] **Step 9: Update e2e config entry selector if needed**

In `tests/e2e/schedule.spec.ts`, replace:

```ts
await page.getByRole("button", { name: /配置/ }).click();
```

with:

```ts
await page.getByRole("button", { name: "配置" }).click();
```

Then update the heading assertion to accept inline content:

```ts
await expect(page.getByRole("heading", { name: "系统配置" })).toBeVisible();
```

This assertion may already remain valid if inline mode renders the same heading.

- [ ] **Step 10: Run focused tests and commit Task 3**

Run:

```bash
npm run test -- src/components/ManagementDrawer.test.ts src/App.test.ts src/styles/main-css.test.ts
```

Expected: PASS for management, App, and CSS tests.

Commit:

```bash
git add src/components/ManagementDrawer.vue src/components/ManagementDrawer.test.ts src/App.vue src/App.test.ts src/styles/main.css src/styles/main-css.test.ts tests/e2e/schedule.spec.ts
git commit -m "feat: add config workbench panel"
```

---

### Task 4: Full Verification And Browser QA

**Files:**
- Modify only if verification exposes a defect:
  - `src/App.vue`
  - `src/components/ManagementDrawer.vue`
  - `src/styles/main.css`
  - tests matching the defect

- [ ] **Step 1: Run the full unit suite**

Run:

```bash
npm run test
```

Expected: all Vitest tests pass.

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build
```

Expected: Vue type check, node TypeScript check, and Vite build complete with exit code 0.

- [ ] **Step 3: Start the local dev server if not already running**

Run:

```bash
npm run dev
```

Expected: API and Vite dev server start. Use the existing browser tab at `http://localhost:52618/` if it remains active; otherwise open the new Vite URL shown in the terminal.

- [ ] **Step 4: Browser verify desktop layout**

In the browser, verify:

- Header shows title on the left and `当前用户：admin` on the right.
- Header does not show `配置`, `打印周表`, or `打印月表` buttons.
- Clicking `当前用户：admin` opens a floating dropdown with `修改密码` and `退出登录`.
- Opening the dropdown does not push the schedule operation row downward.
- Left tabs show `排班`, `查询`, `周统计`, `月结与奖金`, `打印周表`, `打印月表`, `配置`, `使用说明` in that order.
- `打印周表` shows weekly preview and PDF/system print controls.
- `打印月表` shows monthly preview and PDF/system print controls.
- `配置` shows the inline system configuration panel.

- [ ] **Step 5: Browser verify mobile layout**

Use a mobile viewport and verify:

- Header account label truncates instead of overflowing.
- Workbench tabs remain reachable.
- Account dropdown floats above content.
- Print panels remain readable and use PDF/share controls.
- Config panel uses mobile-friendly management cards.

- [ ] **Step 6: Fix defects with TDD if found**

For each defect:

1. Add or update a failing Vitest test that reproduces the defect.
2. Run the focused test and verify the expected failure.
3. Implement the minimal fix.
4. Run the focused test and then `npm run test`.

- [ ] **Step 7: Final commit if verification fixes were needed**

If Step 6 changed files, commit:

```bash
git add <changed files>
git commit -m "fix: polish workbench action tabs"
```

If Step 6 made no changes, do not create an empty commit.

---

## Self-Review

- Spec coverage:
  - Tab order and left-side workbench navigation: Task 1.
  - Header only title plus current account: Task 1.
  - `当前用户：admin` label and no role label: Task 1.
  - Floating account dropdown without layout shift: Task 1.
  - Weekly and monthly print panels with PDF/share/system print actions: Task 2.
  - Configuration panel with admin loading and non-admin permission state: Task 3.
  - CSS and mobile behavior: Tasks 1, 2, 3, and 4.
  - Browser verification: Task 4.
- Placeholder scan:
  - No `TODO`, `TBD`, `???`, or unspecified “implement later” steps are intentionally left in the plan.
- Type consistency:
  - `WorkbenchTab` variants used by tests and implementation are `printWeek`, `printMonth`, and `config`.
  - Print panel test ids are `workbench-panel-print-week`, `workbench-panel-print-month`, `print-panel-pdf-button`, and `print-panel-system-button`.
  - Config panel test ids are `workbench-tab-config`, `workbench-panel-config`, and `management-inline-panel`.
