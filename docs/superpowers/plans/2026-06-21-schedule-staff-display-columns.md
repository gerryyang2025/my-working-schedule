# Schedule Staff Display Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在排班明细页面和周/月打印明细中显示人员排序ID与人员类型，便于护士长核对排班顺序和角色身份。

**Architecture:** 不改数据结构、不改 API，直接复用 `StaffMember.sortOrder` 与 `StaffMember.type`。页面排班表新增三列固定区：排序ID、人员、类型；打印周表和月表的排班明细同步新增排序ID与类型列，统计汇总表保持不变。

**Tech Stack:** Vue 3 `<script setup>`、TypeScript、Vitest、Vue Test Utils、现有 CSS 与打印样式。

---

## File Structure

- Modify: `src/components/ScheduleGrid.vue`
  - 新增人员类型中文标签映射。
  - 页面排班表新增 `排序ID` 与 `类型` 固定列。
  - 扩展表格 CSS 变量，给三列 sticky left 偏移提供稳定宽度。
- Modify: `src/components/ScheduleGrid.test.ts`
  - 覆盖表头、排序ID、类型中文标签、现有人员列工号展示与禁用历史人员展示。
  - 覆盖新增 CSS 变量计算结果。
- Modify: `src/styles/main.css`
  - 为 `.sort-col`、`.person-col`、`.type-col` 配置桌面和移动端宽度。
  - 为三列配置 sticky left，保证手机横向滚动时三列固定。
  - 为打印预览和打印媒体新增排班明细列宽规则。
- Modify: `src/styles/main-css.test.ts`
  - 覆盖三列固定列宽度、left 偏移、移动端规则。
  - 覆盖打印月表明细列宽不再只依赖 `:first-child`。
- Modify: `src/components/PrintViews.vue`
  - 月排班明细新增 `排序ID | 人员 | 类型 | 日期...`。
  - 周排班明细新增 `排序ID | 人员 | 类型 | 日期...`。
  - 周排班明细通过 `staffById` 找回 `sortOrder`。
- Modify: `src/components/PrintViews.test.ts`
  - 覆盖月排班明细和周排班明细的新表头、新单元格内容。
- Modify: `docs/功能跟进清单.md`
  - 记录“排班明细显示排序ID与人员类型”完成状态。

---

### Task 1: ScheduleGrid 排班表固定列

**Files:**
- Modify: `src/components/ScheduleGrid.test.ts`
- Modify: `src/components/ScheduleGrid.vue`

- [ ] **Step 1: Write failing tests for schedule detail headers and staff columns**

Add these tests inside the existing `describe("ScheduleGrid", () => { ... })` block in `src/components/ScheduleGrid.test.ts`, near the current cell test-id and sizing tests:

```ts
  it("shows sort id, person and type as the fixed schedule columns", () => {
    const wrapper = mountGrid([]);

    expect(wrapper.findAll("thead th").slice(0, 3).map((cell) => cell.text())).toEqual(["排序ID", "人员", "类型"]);

    const firstRow = wrapper.get("tbody tr");
    expect(firstRow.get(".sort-col").text()).toBe("1");
    expect(firstRow.get(".person-col").text()).toContain("在职护士");
    expect(firstRow.get(".person-col").text()).toContain("N001");
    expect(firstRow.get(".type-col").text()).toBe("护士");
  });

  it("shows all configured staff type labels and keeps rows sorted by sort id", () => {
    const wrapper = mountGrid([], {
      staff: [
        {
          id: "staff-head",
          jobId: "H001",
          name: "段护士长",
          type: "head_nurse",
          isAdmin: true,
          enabled: true,
          sortOrder: 3
        },
        {
          id: "staff-clerk",
          jobId: "C001",
          name: "王文员",
          type: "clerk",
          isAdmin: false,
          enabled: true,
          sortOrder: 1
        },
        {
          id: "staff-nurse",
          jobId: "N001",
          name: "李护士",
          type: "nurse",
          isAdmin: false,
          enabled: true,
          sortOrder: 2
        }
      ],
      editableStaffIds: ["staff-head", "staff-clerk", "staff-nurse"]
    });

    const rows = wrapper.findAll("tbody tr");

    expect(rows.map((row) => row.get(".sort-col").text())).toEqual(["1", "2", "3"]);
    expect(rows.map((row) => row.get(".type-col").text())).toEqual(["文员", "护士", "护士长"]);
    expect(rows[0].get(".person-col").text()).toContain("王文员");
    expect(rows[1].get(".person-col").text()).toContain("李护士");
    expect(rows[2].get(".person-col").text()).toContain("段护士长");
  });
```

- [ ] **Step 2: Extend the existing column sizing test**

In the existing `it("sizes the person column from the longest visible staff name", ...)` test, append these assertions after the two existing `--person-col-*` expectations:

```ts
    expect(tableStyle.getPropertyValue("--sort-col-width")).toBe("54px");
    expect(tableStyle.getPropertyValue("--type-col-width")).toBe("58px");
    expect(tableStyle.getPropertyValue("--person-col-left")).toBe("54px");
    expect(tableStyle.getPropertyValue("--type-col-left")).toBe("142px");
    expect(tableStyle.getPropertyValue("--sort-col-mobile-width")).toBe("42px");
    expect(tableStyle.getPropertyValue("--type-col-mobile-width")).toBe("46px");
    expect(tableStyle.getPropertyValue("--person-col-mobile-left")).toBe("42px");
    expect(tableStyle.getPropertyValue("--type-col-mobile-left")).toBe("122px");
```

- [ ] **Step 3: Run schedule grid tests and confirm failure**

Run:

```bash
npm run test -- src/components/ScheduleGrid.test.ts
```

Expected: FAIL because `.sort-col` and `.type-col` do not exist and the header still starts with `人员` only.

- [ ] **Step 4: Add staff type mapping and fixed column width variables**

In `src/components/ScheduleGrid.vue`, change the type import to include `StaffType`:

```ts
import type { Holiday, ScheduleEntry, Shift, StaffMember, StaffType } from "@/types/domain";
```

Add these constants below `const emit = defineEmits...`:

```ts
const STAFF_TYPE_LABELS: Record<StaffType, string> = {
  head_nurse: "护士长",
  nurse: "护士",
  clerk: "文员"
};

const SORT_COLUMN_WIDTH = 54;
const TYPE_COLUMN_WIDTH = 58;
const SORT_COLUMN_MOBILE_WIDTH = 42;
const TYPE_COLUMN_MOBILE_WIDTH = 46;
```

Replace the current `personColumnStyle` computed with:

```ts
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
```

Add this helper below `measureDisplayUnits`:

```ts
function staffTypeLabel(staff: StaffMember): string {
  return STAFF_TYPE_LABELS[staff.type];
}
```

- [ ] **Step 5: Add the schedule table columns**

In the table header of `src/components/ScheduleGrid.vue`, replace:

```vue
          <th class="sticky-col person-col">人员</th>
```

with:

```vue
          <th class="sticky-col sort-col">排序ID</th>
          <th class="sticky-col person-col">人员</th>
          <th class="sticky-col type-col">类型</th>
```

In the body row, replace the single personnel header cell:

```vue
          <th class="sticky-col person-col">
            <strong>{{ person.name }}</strong>
            <small>{{ person.jobId }}</small>
            <small v-if="!person.enabled" class="historical-staff-label">停用历史</small>
          </th>
```

with:

```vue
          <th class="sticky-col sort-col">{{ person.sortOrder }}</th>
          <th class="sticky-col person-col">
            <strong>{{ person.name }}</strong>
            <small>{{ person.jobId }}</small>
            <small v-if="!person.enabled" class="historical-staff-label">停用历史</small>
          </th>
          <td class="sticky-col type-col">{{ staffTypeLabel(person) }}</td>
```

- [ ] **Step 6: Run schedule grid tests and confirm pass**

Run:

```bash
npm run test -- src/components/ScheduleGrid.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit schedule grid behavior**

Run:

```bash
git add src/components/ScheduleGrid.vue src/components/ScheduleGrid.test.ts
git commit -m "feat: show staff order and type in schedule grid"
```

---

### Task 2: ScheduleGrid mobile sticky column styles

**Files:**
- Modify: `src/styles/main-css.test.ts`
- Modify: `src/styles/main.css`

- [ ] **Step 1: Write failing CSS tests for three sticky columns**

In `src/styles/main-css.test.ts`, replace the test named `keeps the staff column fixed and layered above scrolling day headers` with:

```ts
  it("keeps sort id, staff and type columns fixed above scrolling day headers", () => {
    const stickyColumn = ruleBlocks(".sticky-col")[0] ?? "";
    const stickyHeader = ruleBlocks(".schedule-grid thead .sticky-col")[0] ?? "";
    const sortColumnRules = ruleBlocks(".schedule-grid .sort-col");
    const personColumnRules = ruleBlocks(".schedule-grid .person-col");
    const typeColumnRules = ruleBlocks(".schedule-grid .type-col");

    expect(stickyColumn).toContain("position: sticky");
    expect(stickyColumn).toContain("left: 0");
    expect(stickyHeader).toContain("z-index: 6");

    expect(sortColumnRules).toHaveLength(2);
    expect(sortColumnRules[0]).toContain("width: var(--sort-col-width, 54px)");
    expect(sortColumnRules[0]).toContain("min-width: var(--sort-col-width, 54px)");
    expect(sortColumnRules[0]).toContain("max-width: var(--sort-col-width, 54px)");
    expect(sortColumnRules[0]).toContain("left: 0");
    expect(sortColumnRules[1]).toContain("width: var(--sort-col-mobile-width, 42px)");
    expect(sortColumnRules[1]).toContain("min-width: var(--sort-col-mobile-width, 42px)");
    expect(sortColumnRules[1]).toContain("max-width: var(--sort-col-mobile-width, 42px)");

    expect(personColumnRules).toHaveLength(2);
    expect(personColumnRules[0]).toContain("width: var(--person-col-width, 88px)");
    expect(personColumnRules[0]).toContain("min-width: var(--person-col-width, 88px)");
    expect(personColumnRules[0]).toContain("max-width: var(--person-col-width, 88px)");
    expect(personColumnRules[0]).toContain("left: var(--person-col-left, 54px)");
    expect(personColumnRules[0]).toContain("text-align: left");
    expect(personColumnRules[0]).toContain("padding: 0 6px");
    expect(personColumnRules[1]).toContain("width: var(--person-col-mobile-width, 72px)");
    expect(personColumnRules[1]).toContain("min-width: var(--person-col-mobile-width, 72px)");
    expect(personColumnRules[1]).toContain("max-width: var(--person-col-mobile-width, 72px)");
    expect(personColumnRules[1]).toContain("left: var(--person-col-mobile-left, 42px)");
    expect(personColumnRules[1]).toContain("padding: 0 5px");

    expect(typeColumnRules).toHaveLength(2);
    expect(typeColumnRules[0]).toContain("width: var(--type-col-width, 58px)");
    expect(typeColumnRules[0]).toContain("min-width: var(--type-col-width, 58px)");
    expect(typeColumnRules[0]).toContain("max-width: var(--type-col-width, 58px)");
    expect(typeColumnRules[0]).toContain("left: var(--type-col-left, 142px)");
    expect(typeColumnRules[1]).toContain("width: var(--type-col-mobile-width, 46px)");
    expect(typeColumnRules[1]).toContain("min-width: var(--type-col-mobile-width, 46px)");
    expect(typeColumnRules[1]).toContain("max-width: var(--type-col-mobile-width, 46px)");
    expect(typeColumnRules[1]).toContain("left: var(--type-col-mobile-left, 114px)");
  });
```

Add this test inside `describe("main.css print month layout rules", () => { ... })` after the current month table layout test:

```ts
  it("sets explicit preview widths for month detail sort, person, type and day columns", () => {
    const sortColumn = ruleBlockIn(css, ".print-preview-content .print-month .print-month-detail-table .print-sort-col");
    const personColumn = ruleBlockIn(css, ".print-preview-content .print-month .print-month-detail-table .print-person-col");
    const typeColumn = ruleBlockIn(css, ".print-preview-content .print-month .print-month-detail-table .print-type-col");
    const dayColumn = ruleBlockIn(css, ".print-preview-content .print-month .print-month-detail-table .print-day-col");

    expect(sortColumn).toContain("width: 42px");
    expect(sortColumn).toContain("min-width: 42px");
    expect(sortColumn).toContain("max-width: 42px");
    expect(personColumn).toContain("width: 86px");
    expect(typeColumn).toContain("width: 52px");
    expect(dayColumn).toContain("width: 34px");
  });
```

- [ ] **Step 2: Run CSS tests and confirm failure**

Run:

```bash
npm run test -- src/styles/main-css.test.ts
```

Expected: FAIL because `.sort-col`, `.type-col`, `.print-sort-col`, `.print-type-col`, and `.print-day-col` rules are missing.

- [ ] **Step 3: Add desktop sticky column CSS**

In `src/styles/main.css`, replace the current `.schedule-grid .person-col` rule with:

```css
.schedule-grid .sort-col {
  width: var(--sort-col-width, 54px);
  min-width: var(--sort-col-width, 54px);
  max-width: var(--sort-col-width, 54px);
  left: 0;
  text-align: center;
  padding: 0 4px;
}

.schedule-grid .person-col {
  width: var(--person-col-width, 88px);
  min-width: var(--person-col-width, 88px);
  max-width: var(--person-col-width, 88px);
  left: var(--person-col-left, 54px);
  text-align: left;
  padding: 0 6px;
}

.schedule-grid .type-col {
  width: var(--type-col-width, 58px);
  min-width: var(--type-col-width, 58px);
  max-width: var(--type-col-width, 58px);
  left: var(--type-col-left, 142px);
  text-align: center;
  padding: 0 4px;
  font-weight: 700;
  color: #334155;
}
```

- [ ] **Step 4: Add mobile sticky column CSS**

Inside the existing mobile media block where `.schedule-grid .person-col` is already overridden, replace that single `.person-col` block with:

```css
  .schedule-grid .sort-col {
    width: var(--sort-col-mobile-width, 42px);
    min-width: var(--sort-col-mobile-width, 42px);
    max-width: var(--sort-col-mobile-width, 42px);
    padding: 0 3px;
  }

  .schedule-grid .person-col {
    width: var(--person-col-mobile-width, 72px);
    min-width: var(--person-col-mobile-width, 72px);
    max-width: var(--person-col-mobile-width, 72px);
    left: var(--person-col-mobile-left, 42px);
    padding: 0 5px;
  }

  .schedule-grid .type-col {
    width: var(--type-col-mobile-width, 46px);
    min-width: var(--type-col-mobile-width, 46px);
    max-width: var(--type-col-mobile-width, 46px);
    left: var(--type-col-mobile-left, 114px);
    padding: 0 3px;
  }
```

- [ ] **Step 5: Add print preview month detail column CSS**

In `src/styles/main.css`, replace these rules:

```css
.print-preview-content .print-month .print-month-detail-table th:first-child,
.print-preview-content .print-month .print-month-detail-table td:first-child {
  width: 86px;
  min-width: 86px;
  max-width: 86px;
}

.print-preview-content .print-month .print-month-detail-table th:not(:first-child),
.print-preview-content .print-month .print-month-detail-table td:not(:first-child) {
  width: 34px;
  min-width: 34px;
  max-width: 34px;
}
```

with:

```css
.print-preview-content .print-month .print-month-detail-table .print-sort-col {
  width: 42px;
  min-width: 42px;
  max-width: 42px;
}

.print-preview-content .print-month .print-month-detail-table .print-person-col {
  width: 86px;
  min-width: 86px;
  max-width: 86px;
}

.print-preview-content .print-month .print-month-detail-table .print-type-col {
  width: 52px;
  min-width: 52px;
  max-width: 52px;
}

.print-preview-content .print-month .print-month-detail-table .print-day-col {
  width: 34px;
  min-width: 34px;
  max-width: 34px;
}
```

- [ ] **Step 6: Add print media widths for detail columns**

Inside the existing `@media print` block in `src/styles/main.css`, replace:

```css
  .print-month-detail-table th:first-child,
  .print-month-detail-table td:first-child {
    width: 68px;
  }
```

with:

```css
  .print-month-detail-table .print-sort-col,
  .print-week-detail-table .print-sort-col {
    width: 34px;
  }

  .print-month-detail-table .print-person-col,
  .print-week-detail-table .print-person-col {
    width: 68px;
  }

  .print-month-detail-table .print-type-col,
  .print-week-detail-table .print-type-col {
    width: 42px;
  }
```

- [ ] **Step 7: Run CSS tests and confirm pass**

Run:

```bash
npm run test -- src/styles/main-css.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit sticky style changes**

Run:

```bash
git add src/styles/main.css src/styles/main-css.test.ts
git commit -m "style: keep schedule staff detail columns sticky"
```

---

### Task 3: PrintViews 周/月排班明细列

**Files:**
- Modify: `src/components/PrintViews.test.ts`
- Modify: `src/components/PrintViews.vue`

- [ ] **Step 1: Write failing tests for month detail sort id and type columns**

In `src/components/PrintViews.test.ts`, after the test named `prints staff job IDs in month schedule detail personnel cells`, add:

```ts
  it("prints sort id and staff type in month schedule detail rows", () => {
    const wrapper = mount(PrintViews, {
      props: {
        data: createData([]),
        days,
        summary
      }
    });

    const monthDetailHeaders = wrapper.findAll(".print-month-detail-table thead th").map((cell) => cell.text());
    expect(monthDetailHeaders.slice(0, 3)).toEqual(["排序ID", "人员", "类型"]);

    const firstMonthDetailRow = wrapper.get(".print-month-detail-table tbody tr");
    expect(firstMonthDetailRow.get(".print-sort-col").text()).toBe("1");
    expectPersonCellText(firstMonthDetailRow.get(".print-person-col").text(), "王护士", "N001");
    expect(firstMonthDetailRow.get(".print-type-col").text()).toBe("护士");
  });
```

- [ ] **Step 2: Write failing tests for week detail sort id and type columns**

In `src/components/PrintViews.test.ts`, inside the existing test named `prints weekly schedule details by weekday`, append these assertions after `expectPersonCellText(personnelHeader.text(), "王护士", "N001");`:

```ts
    expect(detailTable.findAll("thead th").slice(0, 3).map((cell) => cell.text())).toEqual(["排序ID", "人员", "类型"]);
    const firstDetailRow = detailTable.get("tbody tr");
    expect(firstDetailRow.get(".print-sort-col").text()).toBe("1");
    expectPersonCellText(firstDetailRow.get(".print-person-col").text(), "王护士", "N001");
    expect(firstDetailRow.get(".print-type-col").text()).toBe("护士");
```

Also change the existing personnel selector in that same test from:

```ts
    const personnelHeader = detailTable.get("tbody th");
```

to:

```ts
    const personnelHeader = detailTable.get(".print-person-col");
```

- [ ] **Step 3: Run print component tests and confirm failure**

Run:

```bash
npm run test -- src/components/PrintViews.test.ts
```

Expected: FAIL because print detail tables do not have `排序ID` or `类型` columns yet.

- [ ] **Step 4: Add week sort-order helper**

In `src/components/PrintViews.vue`, add this helper after `function getStaffTypeLabel(staffType: StaffType): string { ... }`:

```ts
function getStaffSortOrder(staffId: string): string {
  const sortOrder = staffById.value.get(staffId)?.sortOrder;
  return typeof sortOrder === "number" ? String(sortOrder) : "";
}
```

- [ ] **Step 5: Add month detail print columns**

In the month detail table header in `src/components/PrintViews.vue`, replace:

```vue
          <th>人员</th>
          <th v-for="day in days" :key="day.key">
```

with:

```vue
          <th class="print-sort-col">排序ID</th>
          <th class="print-person-col">人员</th>
          <th class="print-type-col">类型</th>
          <th v-for="day in days" :key="day.key" class="print-day-col">
```

In the month detail table body, replace:

```vue
          <th>
            <span class="print-person">
              <strong>{{ staff.name }}</strong>
              <small>{{ staff.jobId }}</small>
            </span>
            <span v-if="!staff.enabled" class="historical-staff-label">停用历史</span>
          </th>
          <td v-for="day in days" :key="`${staff.id}-${day.key}`">
```

with:

```vue
          <th class="print-sort-col">{{ staff.sortOrder }}</th>
          <th class="print-person-col">
            <span class="print-person">
              <strong>{{ staff.name }}</strong>
              <small>{{ staff.jobId }}</small>
            </span>
            <span v-if="!staff.enabled" class="historical-staff-label">停用历史</span>
          </th>
          <td class="print-type-col">{{ getStaffTypeLabel(staff.type) }}</td>
          <td v-for="day in days" :key="`${staff.id}-${day.key}`" class="print-day-col">
```

- [ ] **Step 6: Add week detail print columns**

In the week detail table, change:

```vue
      <table class="print-table">
```

to:

```vue
      <table class="print-table print-week-detail-table">
```

In that table header, replace:

```vue
            <th>人员</th>
            <th v-for="day in weekDays" :key="day.key">
```

with:

```vue
            <th class="print-sort-col">排序ID</th>
            <th class="print-person-col">人员</th>
            <th class="print-type-col">类型</th>
            <th v-for="day in weekDays" :key="day.key" class="print-day-col">
```

In the week detail table body, replace:

```vue
            <th>
              <span class="print-person">
                <strong>{{ row.staffName }}</strong>
                <small>{{ row.staffJobId }}</small>
              </span>
            </th>
            <td v-for="day in weekDays" :key="`${row.staffId}-${day.key}`">
```

with:

```vue
            <th class="print-sort-col">{{ getStaffSortOrder(row.staffId) }}</th>
            <th class="print-person-col">
              <span class="print-person">
                <strong>{{ row.staffName }}</strong>
                <small>{{ row.staffJobId }}</small>
              </span>
            </th>
            <td class="print-type-col">{{ getStaffTypeLabel(row.staffType) }}</td>
            <td v-for="day in weekDays" :key="`${row.staffId}-${day.key}`" class="print-day-col">
```

- [ ] **Step 7: Run print tests and confirm pass**

Run:

```bash
npm run test -- src/components/PrintViews.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit print view changes**

Run:

```bash
git add src/components/PrintViews.vue src/components/PrintViews.test.ts
git commit -m "feat: show staff order and type in printed schedules"
```

---

### Task 4: Documentation and verification

**Files:**
- Modify: `docs/功能跟进清单.md`
- Verify: `src/components/ScheduleGrid.test.ts`
- Verify: `src/components/PrintViews.test.ts`
- Verify: `src/styles/main-css.test.ts`

- [ ] **Step 1: Update the tracking document**

In `docs/功能跟进清单.md`, keep the latest date line as:

```md
更新时间：2026-06-21。
```

Under `### 1.1 排班工作台`, add this bullet after `人员列显示姓名和工号。`:

```md
- 排班明细显示排序ID、姓名工号和人员类型，便于核对排序和角色。
```

Under `### 1.5 打印、PDF 和移动端输出`, add this bullet after `打印中的人员信息显示姓名和工号。`:

```md
- 打印周表和月表的排班明细显示排序ID、姓名工号和人员类型。
```

- [ ] **Step 2: Run focused verification**

Run:

```bash
npm run test -- src/components/ScheduleGrid.test.ts src/components/PrintViews.test.ts src/styles/main-css.test.ts
```

Expected: PASS for all three files.

- [ ] **Step 3: Run full test suite**

Run:

```bash
npm run test
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: PASS. Vite may print chunk-size warnings for existing large bundles; these warnings do not fail the build.

- [ ] **Step 5: Commit docs and verification notes**

Run:

```bash
git add docs/功能跟进清单.md
git commit -m "docs: document schedule staff display columns"
```

If Task 4 only changes `docs/功能跟进清单.md` and that document was already committed by a previous task, skip this commit and record the focused/full verification output in the final response.

---

## Self-Review Checklist

- Spec coverage:
  - Page schedule table shows `排序ID | 人员 | 类型 | 日期...`: Task 1.
  - Mobile sticky fixed columns for all three identity columns: Task 2.
  - Month printed schedule detail shows sort ID and type: Task 3.
  - Week printed schedule detail shows sort ID and type: Task 3.
  - Summary tables are unchanged: Task 3 only targets detail tables.
  - No API or schema changes: all tasks use existing fields.
- Placeholder scan:
  - The plan uses concrete file paths, test names, snippets, commands and expected results.
- Type consistency:
  - `StaffType`, `StaffMember.sortOrder`, `StaffMember.type`, `WeeklySummary.rows[].staffType`, and existing `staffById` are used consistently.
