# Print Staff Job ID Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update printed weekly and monthly tables so every personnel cell shows staff name plus job ID on two lines, and printed shift markers match the page by rendering as plain colored text without boxes.

**Architecture:** `PrintViews.vue` already receives all required job ID data through `data.staff`, `summary.rows`, `monthlySummary.rows`, and `monthlySettlement.rows`. Add one small reusable print-person markup pattern in the component and shared CSS for print/preview rendering. Reuse the existing shift marker DOM and adjust only CSS so print shifts are plain colored text without changing calculation, scheduling, or settlement logic.

**Tech Stack:** Vue 3 SFC, TypeScript domain types, Vitest with Vue Test Utils, existing CSS print media rules.

---

## File Structure

- Modify `src/components/PrintViews.vue`: render name + job ID in all printed personnel cells.
- Modify `src/components/PrintViews.test.ts`: add regression coverage for monthly detail, monthly summary, bonus summary, weekly detail, and weekly summary personnel cells.
- Modify `src/styles/main.css`: add shared print preview and print media styling for `.print-person`, widen the monthly schedule personnel column slightly, and remove boxed styling from printed shift markers.

No new runtime files are needed.

---

### Task 1: Add PrintViews Regression Tests

**Files:**
- Modify: `src/components/PrintViews.test.ts`

- [ ] **Step 1: Add a helper assertion for two-line personnel cells**

Add this helper after `disabledStaff()`:

```ts
function expectPersonCellText(text: string, name: string, jobId: string): void {
  expect(text).toContain(name);
  expect(text).toContain(jobId);
}
```

- [ ] **Step 2: Add a monthly detail personnel-cell test**

Add this test inside `describe("PrintViews", () => { ... })`:

```ts
it("prints staff job IDs in month schedule detail personnel cells", () => {
  const wrapper = mount(PrintViews, {
    props: {
      data: createData([]),
      days,
      summary
    }
  });

  const personnelHeader = wrapper.get(".print-month tbody th");

  expectPersonCellText(personnelHeader.text(), "王护士", "N001");
});
```

- [ ] **Step 3: Update the monthly summary expected first row**

In the existing `"prints monthly attendance and coefficient summary below the month schedule"` test, change the first row expectation to:

```ts
expect(monthSummary.findAll("tbody tr")[0].findAll("td").map((cell) => cell.text())).toEqual([
  "王护士N001",
  "护士",
  "5",
  "1",
  "5.50",
  ""
]);
expectPersonCellText(monthSummary.text(), "王护士", "N001");
expectPersonCellText(monthSummary.text(), "李文员", "C001");
expectPersonCellText(monthSummary.text(), "段护士长", "H001");
```

- [ ] **Step 4: Update the bonus summary expected first row**

In the existing `"prints bonus settlement snapshot below the monthly summary"` test, change the first row expectation to:

```ts
expect(bonusSummary.findAll("tbody tr")[0].findAll("td").map((cell) => cell.text())).toEqual([
  "王护士N001",
  "护士",
  "5",
  "3",
  "5.50",
  "1392.41",
  ""
]);
expectPersonCellText(bonusSummary.text(), "王护士", "N001");
expectPersonCellText(bonusSummary.text(), "李文员", "C001");
```

- [ ] **Step 5: Strengthen weekly print tests**

In the existing `"keeps weekly print content present"` test, add:

```ts
expectPersonCellText(weeklyPrint.text(), "王护士", "N001");
```

In the existing `"prints weekly schedule details by weekday"` test, add:

```ts
const personnelHeader = detailTable.get("tbody th");
expectPersonCellText(personnelHeader.text(), "王护士", "N001");
```

Add this test for the weekly summary table:

```ts
it("prints staff job IDs in weekly summary rows", () => {
  const wrapper = mount(PrintViews, {
    props: {
      data: createData([]),
      days,
      summary
    }
  });

  const weeklySummaryRow = wrapper.get(".print-week > .print-table tbody tr");

  expectPersonCellText(weeklySummaryRow.findAll("td")[0].text(), "王护士", "N001");
});
```

- [ ] **Step 6: Add a regression test for plain printed shift text**

Add this test inside `describe("PrintViews", () => { ... })`:

```ts
it("prints shift markers as plain colored text without boxes", () => {
  const wrapper = mount(PrintViews, {
    props: {
      data: createData([createEntry(["shift-day"])]),
      days,
      summary
    }
  });

  const marker = wrapper.get(".print-month tbody td .print-shift-chip");

  expect(marker.text()).toBe("白");
  expect(marker.classes()).toContain("print-shift-chip");
});
```

- [ ] **Step 7: Run tests to verify personnel tests fail before implementation**

Run:

```bash
npm run test -- src/components/PrintViews.test.ts
```

Expected: FAIL because print personnel cells still contain only names. The plain shift marker test may pass before CSS changes because component tests cannot fully inspect stylesheet rules.

---

### Task 2: Render Name + Job ID in PrintViews

**Files:**
- Modify: `src/components/PrintViews.vue`

- [ ] **Step 1: Add a print person markup pattern for month schedule detail**

Replace the monthly schedule personnel `<th>` content:

```vue
<th>
  <span>{{ staff.name }}</span>
  <span v-if="!staff.enabled" class="historical-staff-label">停用历史</span>
</th>
```

with:

```vue
<th>
  <span class="print-person">
    <strong>{{ staff.name }}</strong>
    <small>{{ staff.jobId }}</small>
  </span>
  <span v-if="!staff.enabled" class="historical-staff-label">停用历史</span>
</th>
```

- [ ] **Step 2: Render job IDs in monthly summary rows**

Replace:

```vue
<td>
  <span>{{ row.staffName }}</span>
  <span v-if="isDisabledMonthlyStaff(row)" class="historical-staff-label">停用历史</span>
</td>
```

with:

```vue
<td>
  <span class="print-person">
    <strong>{{ row.staffName }}</strong>
    <small>{{ row.staffJobId }}</small>
  </span>
  <span v-if="isDisabledMonthlyStaff(row)" class="historical-staff-label">停用历史</span>
</td>
```

- [ ] **Step 3: Render job IDs in bonus summary rows**

Replace:

```vue
<td>{{ row.staffName }}</td>
```

inside `.print-bonus-summary` with:

```vue
<td>
  <span class="print-person">
    <strong>{{ row.staffName }}</strong>
    <small>{{ row.staffJobId }}</small>
  </span>
</td>
```

- [ ] **Step 4: Render job IDs in weekly schedule detail**

Replace:

```vue
<th>{{ row.staffName }}</th>
```

inside `.print-week-detail` with:

```vue
<th>
  <span class="print-person">
    <strong>{{ row.staffName }}</strong>
    <small>{{ row.staffJobId }}</small>
  </span>
</th>
```

- [ ] **Step 5: Render job IDs in weekly summary rows**

Replace:

```vue
<td>{{ row.staffName }}</td>
```

inside the final weekly summary table with:

```vue
<td>
  <span class="print-person">
    <strong>{{ row.staffName }}</strong>
    <small>{{ row.staffJobId }}</small>
  </span>
</td>
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm run test -- src/components/PrintViews.test.ts
```

Expected: PASS.

---

### Task 3: Tune Print Preview and Print CSS

**Files:**
- Modify: `src/styles/main.css`

- [ ] **Step 1: Add shared print-person styles for preview mode**

After `.print-preview-content .historical-staff-label { ... }`, add:

```css
.print-preview-content .print-person {
  display: grid;
  justify-items: center;
  gap: 1px;
  line-height: 1.15;
}

.print-preview-content .print-person strong {
  color: #0f172a;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.print-preview-content .print-person small {
  color: #64748b;
  font-size: 9px;
  font-weight: 600;
  white-space: nowrap;
}
```

- [ ] **Step 2: Widen the month schedule personnel column in preview mode**

Change:

```css
.print-preview-content .print-month .print-table th:first-child,
.print-preview-content .print-month .print-table td:first-child {
  width: 58px;
}
```

to:

```css
.print-preview-content .print-month .print-month-detail-table th:first-child,
.print-preview-content .print-month .print-month-detail-table td:first-child {
  width: 68px;
}
```

- [ ] **Step 3: Add print-media print-person styles**

Inside `@media print`, after `.print-table .historical-staff-label { ... }`, add:

```css
.print-person {
  display: grid;
  justify-items: center;
  gap: 1px;
  line-height: 1.12;
}

.print-person strong {
  color: #111827;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.print-person small {
  color: #4b5563;
  font-size: 8px;
  font-weight: 600;
  white-space: nowrap;
}
```

- [ ] **Step 4: Add print-media month detail personnel width**

Inside `@media print`, after `.print-table th, .print-table td { ... }`, add:

```css
.print-month-detail-table th:first-child,
.print-month-detail-table td:first-child {
  width: 68px;
}
```

- [ ] **Step 5: Remove boxed styling from print preview shift markers**

Change:

```css
.print-preview-content .print-shift-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  min-height: 18px;
  border: 1px solid;
  padding: 2px 4px;
  background: #ffffff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}
```

to:

```css
.print-preview-content .print-shift-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
  border: 0;
  padding: 0 2px;
  background: transparent;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.1;
}
```

Change:

```css
.print-preview-content .print-month .print-shift-chip {
  min-width: 18px;
  padding: 1px 2px;
  font-size: 9px;
}
```

to:

```css
.print-preview-content .print-month .print-shift-chip {
  padding: 0 1px;
  font-size: 11px;
}
```

- [ ] **Step 6: Remove boxed styling from print-media shift markers**

Change the `@media print` `.print-shift-chip` rule:

```css
.print-shift-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  min-height: 16px;
  border: 1px solid;
  padding: 1px 3px;
  background: #ffffff;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
```

to:

```css
.print-shift-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
  border: 0;
  padding: 0 2px;
  background: transparent;
  font-size: 10px;
  font-weight: 800;
  line-height: 1.1;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
```

- [ ] **Step 7: Add CSS regression coverage for unboxed print shift markers**

In `src/styles/main-css.test.ts`, add an assertion to the existing print CSS test or a new test:

```ts
expect(css).toContain(".print-preview-content .print-shift-chip");
expect(css).toContain("border: 0;");
expect(css).toContain("background: transparent;");
```

- [ ] **Step 8: Run CSS and component tests**

Run:

```bash
npm run test -- src/components/PrintViews.test.ts src/styles/main-css.test.ts
```

Expected: PASS.

---

### Task 4: Full Verification and Browser Preview

**Files:**
- No source file changes expected unless verification finds a layout issue.

- [ ] **Step 1: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: PASS. Existing Vite chunk-size warning is acceptable.

- [ ] **Step 3: Run full test suite**

Run:

```bash
npm run test
```

Expected: PASS. If sandbox reports `listen EPERM` for `server/routes.test.ts`, rerun the same command with escalated permissions because Supertest needs local port binding.

- [ ] **Step 4: Verify in browser preview**

Using the in-app browser at `http://localhost:5173/`, open print preview for both views or inspect the hidden print DOM:

```js
Array.from(document.querySelectorAll(".print-week .print-person, .print-month .print-person"))
  .slice(0, 8)
  .map((node) => node.textContent?.trim())
```

Expected: values include names with job IDs, such as `段鸿露000228`, `李护士100001`, and `王文员200001`.

Also inspect printed shift markers:

```js
Array.from(document.querySelectorAll(".print-week .print-shift-chip, .print-month .print-shift-chip"))
  .slice(0, 8)
  .map((node) => ({
    text: node.textContent?.trim(),
    border: getComputedStyle(node).borderStyle,
    background: getComputedStyle(node).backgroundColor
  }))
```

Expected: shift marker text is present, border style is `none`, and background is transparent.

- [ ] **Step 5: Visual/PDF sanity check**

Generate or preview both printed outputs:

- 打印周表: personnel cells show name + job ID, shift markers are plain colored text without boxes, and weekly summary table remains aligned.
- 打印月表: monthly schedule personnel column remains readable, shift markers are plain colored text without boxes, month summary and bonus summary include job IDs, and the table does not visibly shift or crop.

- [ ] **Step 6: Final status**

Report changed files and verification results. Do not claim completion until all verification commands have passed.

---

## Self-Review

- Spec coverage: all five required print personnel areas are covered by Task 1 tests and Task 2 rendering changes; printed shift marker style is covered by Task 1 and Task 3.
- Placeholder scan: no TODO/TBD/placeholders are present.
- Type consistency: the plan uses existing `staff.jobId`, `row.staffJobId`, `MonthlySettlementRow`, `MonthlyStaffSummary`, and `WeeklySummary` fields already present in the branch.
