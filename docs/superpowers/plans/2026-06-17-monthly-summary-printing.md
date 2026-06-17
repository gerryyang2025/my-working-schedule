# Monthly Summary Printing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add monthly attendance and coefficient summaries to month print/PDF output.

**Architecture:** Extend the existing frontend calculation layer with a monthly summary function that mirrors the weekly summary visibility and coefficient rules without adding month full-attendance or overtime concepts. Pass the computed summary from `App.vue` into `PrintViews.vue`, where the month print view renders a compact summary table below the month schedule.

**Tech Stack:** Vue 3, TypeScript, Vitest, Element Plus styling, existing print/PDF capture flow.

---

### Task 1: Monthly Calculation

**Files:**
- Modify: `src/types/domain.ts`
- Modify: `src/lib/calculation.ts`
- Modify: `src/lib/calculation.test.ts`

- [ ] **Step 1: Write failing monthly calculation tests**

Add tests for enabled staff, head nurse coefficient exclusion, disabled historical staff, disabled shift IDs, and entries outside the printed month.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm run test -- src/lib/calculation.test.ts`

Expected: fail because `calculateMonthlySummary` and monthly summary types do not exist.

- [ ] **Step 3: Implement monthly types and calculation**

Add `MonthlyStaffSummary` and `MonthlySummary`. Add `calculateMonthlySummary(data, days)` using the printed day range and existing shift/staff rules.

- [ ] **Step 4: Run focused tests to verify pass**

Run: `npm run test -- src/lib/calculation.test.ts`

Expected: pass.

### Task 2: Month Print Summary View

**Files:**
- Modify: `src/components/PrintViews.vue`
- Modify: `src/components/PrintViews.test.ts`
- Modify: `src/styles/main.css`

- [ ] **Step 1: Write failing print view tests**

Extend `PrintViews.test.ts` so the month print view expects a “月度汇总” section with staff type, attendance shifts, total coefficient, and head nurse single-accounting text.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm run test -- src/components/PrintViews.test.ts`

Expected: fail because `monthlySummary` is not accepted or rendered.

- [ ] **Step 3: Render the monthly summary**

Add a `monthlySummary` prop to `PrintViews.vue`, render the monthly summary table below the month schedule, and add small print-preview styles for the new section.

- [ ] **Step 4: Run focused tests to verify pass**

Run: `npm run test -- src/components/PrintViews.test.ts`

Expected: pass.

### Task 3: App Integration

**Files:**
- Modify: `src/App.vue`
- Modify: `src/App.test.ts`

- [ ] **Step 1: Write failing App test**

Extend the month preview test so it verifies the print preview receives/render monthly summary content.

- [ ] **Step 2: Run focused App test to verify failure**

Run: `npm run test -- src/App.test.ts`

Expected: fail because `App.vue` does not compute or pass `monthlySummary`.

- [ ] **Step 3: Wire monthly summary into App**

Import `calculateMonthlySummary`, compute it from `data` and `printMonthDays`, and pass it to both hidden and preview `PrintViews` instances.

- [ ] **Step 4: Run focused App tests**

Run: `npm run test -- src/App.test.ts`

Expected: pass.

### Task 4: Verification

**Files:**
- No production files unless verification exposes a defect.

- [ ] **Step 1: Run focused regression tests**

Run: `npm run test -- src/lib/calculation.test.ts src/components/PrintViews.test.ts src/App.test.ts`

Expected: pass.

- [ ] **Step 2: Run full build**

Run: `npm run build`

Expected: pass.

- [ ] **Step 3: Run full test suite**

Run: `npm run test`

Expected: pass.

- [ ] **Step 4: Browser check**

Open the local app at mobile width, open month print preview, generate/share PDF, and verify the month schedule plus “月度汇总” are visible without frontend errors.
