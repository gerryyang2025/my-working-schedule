# Remove Schedule Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the persistent schedule reminder panel from the scheduling tab while preserving month-end settlement checks.

**Architecture:** The schedule workspace should no longer compute or render weekly anomaly reminders. The month-end settlement check flow remains the single place that reports missing schedules, double shifts, missing shifts, disabled shifts, and disabled staff schedules before confirming settlement.

**Tech Stack:** Vue 3, TypeScript, Vitest, Element Plus, existing SQLite-backed API.

---

## File Structure

- Modify: `src/App.vue`
  - Remove the `schedule-anomalies` import, computed values, click helpers, and template panel.
  - Keep `calculateSettlementChecks` and the `月结前数据检查` confirmation flow intact.
- Modify: `src/App.test.ts`
  - Replace the old reminder interaction test with a regression test proving the schedule tab does not render the reminder panel even when data would have triggered it before.
- Delete: `src/lib/schedule-anomalies.ts`
  - Remove the now-unused weekly reminder calculation helper.
- Delete: `src/lib/schedule-anomalies.test.ts`
  - Remove tests for the deleted helper.
- Modify: `src/styles/main.css`
  - Remove `.schedule-anomaly-*` desktop and mobile styles.
- Modify: `docs/功能跟进清单.md`
  - Remove current-week schedule anomaly reminders from completed features.
  - Keep month-end settlement checks listed under monthly settlement features.

## Implementation Tasks

### Task 1: Replace Reminder UI Test With Removal Regression

**Files:**
- Modify: `src/App.test.ts:1071-1100`

- [ ] **Step 1: Write the failing regression test**

Replace the existing test named `shows current week schedule anomaly reminders and opens editable cells from reminders` with this test:

```ts
  it("does not render current week schedule anomaly reminders", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17));
    const dataWithFormerReminder = structuredClone(testData);
    dataWithFormerReminder.scheduleEntries = [
      {
        id: "2026-06-15__staff-nurse-001",
        date: "2026-06-15",
        staffId: "staff-nurse-001",
        shiftIds: ["shift-a1", "shift-rest"],
        note: ""
      }
    ];
    const wrapper = mountApp(dataWithFormerReminder);

    await flushPromises();

    expect(wrapper.find('[data-testid="schedule-anomaly-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="schedule-anomaly-item-staff-nurse-001-2026-06-16"]').exists()).toBe(false);
    vi.useRealTimers();
  });
```

- [ ] **Step 2: Run the targeted test and verify it fails before implementation**

Run:

```bash
npm run test -- src/App.test.ts -t "does not render current week schedule anomaly reminders"
```

Expected: FAIL because `schedule-anomaly-panel` still renders.

- [ ] **Step 3: Commit the failing test**

```bash
git add src/App.test.ts
git commit -m "test: cover removed schedule reminder panel"
```

### Task 2: Remove Schedule Reminder Wiring From App.vue

**Files:**
- Modify: `src/App.vue:50`
- Modify: `src/App.vue:179-185`
- Modify: `src/App.vue:691-704`
- Modify: `src/App.vue:1088-1112`

- [ ] **Step 1: Remove the reminder import**

In `src/App.vue`, change this import area:

```ts
import { createPrintPdfFile } from "@/lib/print-pdf";
import { calculateRangeBonusSummary, monthRangeToDates } from "@/lib/range-bonus";
import { calculateWeeklyScheduleAnomalies, type ScheduleAnomaly } from "@/lib/schedule-anomalies";
import { calculateSettlementChecks } from "@/lib/settlement-checks";
```

to:

```ts
import { createPrintPdfFile } from "@/lib/print-pdf";
import { calculateRangeBonusSummary, monthRangeToDates } from "@/lib/range-bonus";
import { calculateSettlementChecks } from "@/lib/settlement-checks";
```

- [ ] **Step 2: Remove reminder computed values**

Delete this block:

```ts
const weeklyScheduleAnomalies = computed(() =>
  data.value ? calculateWeeklyScheduleAnomalies(data.value, scheduleDays.value) : []
);
const visibleScheduleAnomalies = computed(() => weeklyScheduleAnomalies.value.slice(0, 8));
const hiddenScheduleAnomalyCount = computed(() =>
  Math.max(0, weeklyScheduleAnomalies.value.length - visibleScheduleAnomalies.value.length)
);
```

After deletion, the surrounding code should read:

```ts
const currentWeekEditableEntryCount = computed(() => {
  if (!data.value) {
    return 0;
  }

  const weekDayKeys = new Set(scheduleDays.value.map((day) => day.key));
  const editableIds = new Set(editableStaffIds.value);
  return data.value.scheduleEntries.filter((entry) => weekDayKeys.has(entry.date) && editableIds.has(entry.staffId)).length;
});
const restShift = computed(() => findEnabledShift(["休"], ["休息"]));
const officeShift = computed(() => findEnabledShift(["办公"], ["办公"]));
const scheduleActionBusy = computed(() => copyingPreviousWeek.value || bulkUpdatingWeek.value);
```

- [ ] **Step 3: Remove reminder click helpers**

Delete this block:

```ts
function scheduleAnomalyTestId(item: ScheduleAnomaly): string {
  return item.staffId && item.date ? `schedule-anomaly-item-${item.staffId}-${item.date}` : "schedule-anomaly-item";
}

function handleScheduleAnomalyClick(item: ScheduleAnomaly): void {
  if (!item.staffId || !item.date) {
    return;
  }

  selectedDate.value = item.date;
  handleEditCell(item.staffId, item.date);
}
```

After deletion, `handleEditCell` should be followed directly by `handleEditorSave`:

```ts
function handleEditCell(staffId: string, date: string): void {
  if (!canEditStaffId(staffId)) {
    return;
  }

  editingStaffId.value = staffId;
  editingDate.value = date;
  editorOpen.value = true;
}

async function handleEditorSave(shiftIds: string[], note: string): Promise<void> {
```

- [ ] **Step 4: Remove reminder template panel**

Delete this block from the schedule tab:

```vue
            <section
              v-if="weeklyScheduleAnomalies.length > 0"
              class="schedule-anomaly-panel"
              data-testid="schedule-anomaly-panel"
            >
              <div class="schedule-anomaly-summary">
                <strong>排班提醒 {{ weeklyScheduleAnomalies.length }} 项</strong>
                <span>仅提醒，不阻止保存。</span>
              </div>
              <div class="schedule-anomaly-list">
                <button
                  v-for="item in visibleScheduleAnomalies"
                  :key="`${item.type}-${item.staffId ?? ''}-${item.date ?? ''}-${item.shiftIds?.join('-') ?? ''}`"
                  class="schedule-anomaly-item"
                  :data-testid="scheduleAnomalyTestId(item)"
                  type="button"
                  @click="handleScheduleAnomalyClick(item)"
                >
                  {{ item.message }}
                </button>
              </div>
              <p v-if="hiddenScheduleAnomalyCount > 0" class="schedule-anomaly-more">
                还有 {{ hiddenScheduleAnomalyCount }} 项提醒，可通过补齐排班后自动消失。
              </p>
            </section>
```

After deletion, the schedule tab should move from the action buttons directly to the shift palette:

```vue
            <ShiftPalette :shifts="data.shifts" :selected-shift-id="selectedShiftId" @select="selectedShiftId = $event" />
            <ScheduleGrid
              :staff="data.staff"
              :days="scheduleDays"
```

- [ ] **Step 5: Run the targeted regression test**

Run:

```bash
npm run test -- src/App.test.ts -t "does not render current week schedule anomaly reminders"
```

Expected: PASS.

- [ ] **Step 6: Commit App.vue and test changes**

```bash
git add src/App.vue src/App.test.ts
git commit -m "fix: remove schedule reminder panel"
```

### Task 3: Delete Unused Schedule Anomaly Helper

**Files:**
- Delete: `src/lib/schedule-anomalies.ts`
- Delete: `src/lib/schedule-anomalies.test.ts`

- [ ] **Step 1: Delete the unused helper and its tests**

Run:

```bash
git rm src/lib/schedule-anomalies.ts src/lib/schedule-anomalies.test.ts
```

- [ ] **Step 2: Verify no source references remain**

Run:

```bash
rg -n "schedule-anomalies|ScheduleAnomaly|calculateWeeklyScheduleAnomalies|schedule-anomaly" src --glob "!src/App.test.ts"
```

Expected: no output. `src/App.test.ts` is excluded because it intentionally keeps the old test ids in a negative regression test.

- [ ] **Step 3: Verify month-end settlement checks still pass**

Run:

```bash
npm run test -- src/lib/settlement-checks.test.ts
```

Expected: PASS. This confirms the retained `月结前数据检查` logic still has direct test coverage.

- [ ] **Step 4: Commit helper deletion**

```bash
git add src/lib/schedule-anomalies.ts src/lib/schedule-anomalies.test.ts
git commit -m "refactor: delete weekly schedule anomaly helper"
```

### Task 4: Remove Reminder Styles

**Files:**
- Modify: `src/styles/main.css:269-321`
- Modify: `src/styles/main.css:951-967`

- [ ] **Step 1: Remove desktop reminder styles**

Delete this CSS block:

```css
.schedule-anomaly-panel {
  margin-bottom: 10px;
  border: 1px solid #facc15;
  background: #fefce8;
  padding: 10px 12px;
}

.schedule-anomaly-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #854d0e;
  font-size: 13px;
}

.schedule-anomaly-summary strong {
  font-size: 14px;
}

.schedule-anomaly-summary span,
.schedule-anomaly-more {
  color: #a16207;
}

.schedule-anomaly-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.schedule-anomaly-item {
  border: 1px solid #fde68a;
  background: #fff;
  color: #713f12;
  padding: 5px 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
}

.schedule-anomaly-item:hover {
  border-color: #f59e0b;
  background: #fffbeb;
}

.schedule-anomaly-more {
  margin: 8px 0 0;
  font-size: 12px;
}
```

- [ ] **Step 2: Remove mobile reminder styles**

Delete this CSS block inside the mobile media query:

```css
  .schedule-anomaly-summary {
    display: block;
  }

  .schedule-anomaly-summary span {
    display: block;
    margin-top: 4px;
  }

  .schedule-anomaly-list {
    display: grid;
    grid-template-columns: 1fr;
  }

  .schedule-anomaly-item {
    width: 100%;
  }
```

- [ ] **Step 3: Verify no source style references remain**

Run:

```bash
rg -n "schedule-anomaly" src --glob "!src/App.test.ts"
```

Expected: no output. `src/App.test.ts` is excluded because it intentionally keeps the old test ids in a negative regression test.

- [ ] **Step 4: Commit style cleanup**

```bash
git add src/styles/main.css
git commit -m "style: remove schedule reminder styles"
```

### Task 5: Update Feature Tracking Documentation

**Files:**
- Modify: `docs/功能跟进清单.md:27`

- [ ] **Step 1: Remove the completed-feature bullet for schedule reminders**

In `docs/功能跟进清单.md`, remove this bullet from `### 1.1 排班工作台`:

```md
- 支持当前周排班异常提醒：未排班、异常双班、缺失班次、停用班次引用和停用人员排班；提醒仅辅助检查，不阻止保存。
```

Keep this bullet in `### 1.4 月度汇总、奖金分配和月结` unchanged:

```md
- 支持确认月结前进行数据检查，提示未排班、出勤不足、异常双班、缺失班次、停用班次引用和停用人员排班；检查结果仅提醒，不阻止用户继续月结。
```

- [ ] **Step 2: Verify docs mention only retained settlement checks**

Run:

```bash
rg -n "排班提醒|当前周排班异常提醒|schedule-anomaly" docs/功能跟进清单.md src --glob "!src/App.test.ts"
```

Expected: no output. `src/App.test.ts` is excluded because it intentionally keeps the old test ids in a negative regression test.

Run:

```bash
rg -n "月结前数据检查|确认月结前进行数据检查" docs/功能跟进清单.md src/App.vue src/lib/settlement-checks.ts
```

Expected: output includes `docs/功能跟进清单.md`, `src/App.vue`, and `src/lib/settlement-checks.ts`.

- [ ] **Step 3: Commit documentation update**

```bash
git add docs/功能跟进清单.md
git commit -m "docs: remove schedule reminder feature note"
```

### Task 6: Final Verification

**Files:**
- No direct edits.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test -- src/App.test.ts src/lib/settlement-checks.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Run the full test suite**

Run:

```bash
npm run test
```

Expected: PASS. If `server/routes.test.ts` fails with `listen EPERM` in the sandbox, rerun the same command with escalated execution because the API route tests bind a local test server.

- [ ] **Step 4: Confirm final diff contains no reminder implementation**

Run:

```bash
rg -n "排班提醒|当前周排班异常提醒|schedule-anomaly|schedule-anomalies|ScheduleAnomaly|calculateWeeklyScheduleAnomalies" src docs/功能跟进清单.md --glob "!src/App.test.ts"
```

Expected: no output. `src/App.test.ts` is excluded because it intentionally keeps the old test ids in a negative regression test.

- [ ] **Step 5: Commit verification-only cleanup if needed**

If verification required only formatting or documentation corrections, commit those corrections:

```bash
git add src/App.vue src/App.test.ts src/styles/main.css docs/功能跟进清单.md
git commit -m "chore: finalize schedule reminder removal"
```

Skip this commit when `git status --short` shows no remaining changes.

## Self-Review

- Spec coverage: The plan removes the schedule tab reminder panel, deletes its calculation helper and styles, removes the completed-feature documentation entry, and keeps month-end settlement checks intact.
- Placeholder scan: This plan uses concrete file paths, exact code blocks, commands, and expected results.
- Type consistency: `ScheduleAnomaly`, `calculateWeeklyScheduleAnomalies`, and `.schedule-anomaly-*` are deleted together, so no source references remain after Task 4.
