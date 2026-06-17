# Workbench Range Bonus Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved workbench Tab layout, overtime-shift reporting, and temporary multi-month bonus range trial calculation without changing formal single-month settlement semantics.

**Architecture:** Extend the existing summary model with `overtimeShifts`, then centralize date-range summary logic so monthly and custom range views share one calculation path. Keep formal settlement APIs month-only; implement custom range trial calculation entirely in the frontend using live summaries plus existing monthly settlement snapshots.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Element Plus, Vitest, Playwright, existing Express API/storage layer.

---

## File Structure

- Modify `src/types/domain.ts`
  - Add `overtimeShifts` to `MonthlyStaffSummary` and `MonthlySettlementRow`.
- Modify `server/storage.ts`
  - Normalize old settlement rows that do not have `overtimeShifts`.
- Modify `server/storage.test.ts`
  - Cover legacy monthly settlement row compatibility.
- Modify `src/lib/calculation.ts`
  - Add range-based monthly summary calculation with partial-week overtime rules.
  - Keep `calculateMonthlySummary()` as a wrapper for existing call sites.
- Modify `src/lib/calculation.test.ts`
  - Cover boundary weeks, holiday deduction, two shifts in one day, and monthly wrapper behavior.
- Modify `src/lib/bonus.ts`
  - Preserve `overtimeShifts` when creating allocation rows.
- Modify `src/lib/bonus.test.ts`
  - Assert allocation and settlement snapshots carry overtime shifts.
- Modify `server/routes.test.ts`
  - Assert monthly settlement snapshots persist overtime shifts.
- Create `src/lib/range-bonus.ts`
  - Combine live summaries and existing monthly settlement snapshots for a temporary custom range summary.
- Create `src/lib/range-bonus.test.ts`
  - Cover multi-month aggregation, mixed settled/unsettled months, invalid ranges.
- Modify `src/App.vue`
  - Add active workbench Tab state, month-range state, range summary computed values, and pass them to the panel.
- Modify `src/App.test.ts`
  - Cover Tab switching, date persistence, range mode, and single-month settlement behavior.
- Modify `src/components/BonusSettlementPanel.vue`
  - Add month pickers, range-mode display, overtime column, and no-save range trial behavior.
- Modify `src/components/BonusSettlementPanel.test.ts`
  - Cover single-month mode, multi-month trial mode, invalid range, overtime column.
- Modify `src/components/PrintViews.vue`
  - Add overtime column to monthly summary and bonus snapshot print tables.
- Modify `src/components/PrintViews.test.ts`
  - Cover printed overtime column from live summary and settlement snapshot.
- Modify `src/components/ScheduleGrid.vue`
  - Keep markup mostly unchanged; allow text-only shift style through CSS.
- Modify `src/styles/main.css`
  - Add workbench Tabs, shorten staff column, text-only shift marks, shared stats panel styles.
- Modify `src/styles/main-css.test.ts`
  - Update sticky column width expectations and text-only shift marker rules.
- Modify `src/components/WeeklySummary.vue`
  - Align class naming/style hooks with the shared stats panel style.
- Modify `tests/e2e/schedule.spec.ts`
  - Add smoke coverage for Tab switching and keeping quick-fill usable in the scheduling Tab.

---

### Task 1: Extend Monthly Summary and Settlement Types With Overtime

**Files:**
- Modify: `src/types/domain.ts`
- Modify: `server/storage.ts`
- Modify: `server/storage.test.ts`

- [ ] **Step 1: Write failing storage compatibility tests**

Add this test to `server/storage.test.ts` near the existing monthly settlement normalization tests:

```ts
it("defaults missing monthly settlement overtime shifts for legacy rows", async () => {
  const file = join(tmpdir(), `schedule-legacy-overtime-${Date.now()}.json`);
  await writeFile(
    file,
    JSON.stringify({
      staff: [],
      shifts: [],
      holidays: [],
      scheduleEntries: [],
      settings: { defaultRequiredShiftsPerWeek: 5, version: 1 },
      monthlySettlements: [
        {
          id: "settlement-2026-06",
          month: "2026-06",
          monthStart: "2026-06-01",
          monthEnd: "2026-06-30",
          totalDays: 30,
          bonusPool: 1000,
          coefficientTotal: 1.5,
          settledAt: "2026-06-30T10:00:00.000Z",
          rows: [
            {
              staffId: "staff-nurse-001",
              staffName: "李护士",
              staffType: "nurse",
              attendanceShifts: 6,
              coefficientTotal: 1.5,
              coefficientExcludedReason: "",
              bonusAmount: 1000,
              bonusExcludedReason: ""
            }
          ]
        }
      ]
    })
  );

  const storage = createFileStorage(file);
  const data = await storage.read();

  expect(data.monthlySettlements[0].rows[0].overtimeShifts).toBe(0);
});
```

- [ ] **Step 2: Run the storage test to verify it fails**

Run: `npm run test -- server/storage.test.ts`

Expected: FAIL because `MonthlySettlementRow` does not yet include `overtimeShifts`, or storage validation rejects the row shape.

- [ ] **Step 3: Update domain types**

In `src/types/domain.ts`, change these interfaces:

```ts
export interface MonthlyStaffSummary {
  staffId: string;
  staffName: string;
  staffType: StaffType;
  attendanceShifts: number;
  overtimeShifts: number;
  coefficientTotal: number | null;
  coefficientExcludedReason: string;
}

export interface MonthlySettlementRow {
  staffId: string;
  staffName: string;
  staffType: StaffType;
  attendanceShifts: number;
  overtimeShifts: number;
  coefficientTotal: number | null;
  coefficientExcludedReason: string;
  bonusAmount: number;
  bonusExcludedReason: string;
}
```

- [ ] **Step 4: Normalize legacy settlement rows**

In `server/storage.ts`, update the monthly settlement row normalization path so a missing `overtimeShifts` becomes `0`. Keep malformed non-number values invalid.

Use this helper near the existing settlement normalization helpers:

```ts
function normalizeMonthlySettlementRow(row: unknown): MonthlySettlementRow | null {
  if (!isObject(row)) {
    return null;
  }

  const candidate = {
    ...row,
    overtimeShifts: "overtimeShifts" in row ? row.overtimeShifts : 0
  };

  return isMonthlySettlementRow(candidate) ? candidate : null;
}
```

Then update settlement normalization to use `normalizeMonthlySettlementRow()` for each row before validating the settlement.

- [ ] **Step 5: Run focused tests**

Run: `npm run test -- server/storage.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/domain.ts server/storage.ts server/storage.test.ts
git commit -m "feat: add overtime shifts to monthly settlement rows"
```

---

### Task 2: Implement Range Summary Overtime Calculation

**Files:**
- Modify: `src/lib/calculation.ts`
- Modify: `src/lib/calculation.test.ts`

- [ ] **Step 1: Write failing calculation tests**

In `src/lib/calculation.test.ts`, update the imports so the file can use the new function and helper type:

```ts
import type { AppData, MonthlyStaffSummary, MonthlySummary, ScheduleEntry, WeeklyStaffSummary, WeeklySummary } from "@/types/domain";
import { calculateMonthlySummary, calculateRangeSummary, calculateWeeklySummary } from "./calculation";
```

Add these helper functions after `getMonthlyRow()`:

```ts
function entry(date: string, staffId: string, shiftIds: string[]): ScheduleEntry {
  return {
    id: `${date}__${staffId}`,
    date,
    staffId,
    shiftIds,
    note: ""
  };
}

function createData(overrides: Partial<AppData> = {}): AppData {
  return {
    staff: [
      { id: "staff-head-001", jobId: "000228", name: "段鸿露", type: "head_nurse", isAdmin: true, enabled: true, sortOrder: 1 },
      { id: "staff-nurse-001", jobId: "100001", name: "李护士", type: "nurse", isAdmin: false, enabled: true, sortOrder: 2 },
      { id: "staff-clerk-001", jobId: "200001", name: "王文员", type: "clerk", isAdmin: false, enabled: true, sortOrder: 3 }
    ],
    shifts: [
      { id: "shift-a1", name: "A1组长", shortName: "A1", color: "#2563EB", countsAttendance: true, coefficient: 1.5, enabled: true, sortOrder: 1 },
      { id: "shift-p1", name: "P1", shortName: "P1", color: "#0F766E", countsAttendance: true, coefficient: 1.3, enabled: true, sortOrder: 2 },
      { id: "shift-rest", name: "休息", shortName: "休", color: "#64748B", countsAttendance: false, coefficient: 0, enabled: true, sortOrder: 3 }
    ],
    holidays: [],
    scheduleEntries: [],
    monthlySettlements: [],
    settings: { defaultRequiredShiftsPerWeek: 5, version: 1 },
    ...overrides
  };
}
```

Add these tests:

```ts
describe("calculateRangeSummary", () => {
  it("calculates overtime by partial weeks inside the selected range", () => {
    const data = createData({
      scheduleEntries: [
        entry("2026-06-15", "staff-nurse-001", ["shift-a1"]),
        entry("2026-06-16", "staff-nurse-001", ["shift-a1"]),
        entry("2026-06-17", "staff-nurse-001", ["shift-a1"]),
        entry("2026-06-18", "staff-nurse-001", ["shift-a1"]),
        entry("2026-06-19", "staff-nurse-001", ["shift-a1"]),
        entry("2026-06-20", "staff-nurse-001", ["shift-a1"])
      ]
    });

    const summary = calculateRangeSummary(data, "2026-06-15", "2026-06-21");
    const nurse = summary.rows.find((row) => row.staffId === "staff-nurse-001");

    expect(summary.rangeStart).toBe("2026-06-15");
    expect(summary.rangeEnd).toBe("2026-06-21");
    expect(nurse?.attendanceShifts).toBe(6);
    expect(nurse?.overtimeShifts).toBe(1);
  });

  it("counts two shifts in one day as two attendance shifts for overtime", () => {
    const data = createData({
      scheduleEntries: [
        entry("2026-06-15", "staff-nurse-001", ["shift-a1", "shift-p1"]),
        entry("2026-06-16", "staff-nurse-001", ["shift-a1"]),
        entry("2026-06-17", "staff-nurse-001", ["shift-a1"]),
        entry("2026-06-18", "staff-nurse-001", ["shift-a1"]),
        entry("2026-06-19", "staff-nurse-001", ["shift-a1"])
      ]
    });

    const summary = calculateRangeSummary(data, "2026-06-15", "2026-06-21");
    const nurse = summary.rows.find((row) => row.staffId === "staff-nurse-001");

    expect(nurse?.attendanceShifts).toBe(6);
    expect(nurse?.overtimeShifts).toBe(1);
  });

  it("deducts holidays that affect required attendance inside the range", () => {
    const data = createData({
      holidays: [{ id: "holiday-dragon", date: "2026-06-19", name: "端午节", affectsRequiredAttendance: true }],
      scheduleEntries: [
        entry("2026-06-15", "staff-nurse-001", ["shift-a1"]),
        entry("2026-06-16", "staff-nurse-001", ["shift-a1"]),
        entry("2026-06-17", "staff-nurse-001", ["shift-a1"]),
        entry("2026-06-18", "staff-nurse-001", ["shift-a1"]),
        entry("2026-06-19", "staff-nurse-001", ["shift-a1"])
      ]
    });

    const summary = calculateRangeSummary(data, "2026-06-15", "2026-06-21");
    const nurse = summary.rows.find((row) => row.staffId === "staff-nurse-001");

    expect(summary.holidayNames).toEqual(["端午节"]);
    expect(nurse?.attendanceShifts).toBe(5);
    expect(nurse?.overtimeShifts).toBe(1);
  });

  it("uses only dates inside boundary weeks", () => {
    const data = createData({
      scheduleEntries: [
        entry("2026-06-10", "staff-nurse-001", ["shift-a1"]),
        entry("2026-06-11", "staff-nurse-001", ["shift-a1"]),
        entry("2026-06-12", "staff-nurse-001", ["shift-a1"])
      ]
    });

    const summary = calculateRangeSummary(data, "2026-06-10", "2026-06-12");
    const nurse = summary.rows.find((row) => row.staffId === "staff-nurse-001");

    expect(nurse?.attendanceShifts).toBe(3);
    expect(nurse?.overtimeShifts).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test -- src/lib/calculation.test.ts`

Expected: FAIL because `calculateRangeSummary()` is not exported and monthly rows do not include overtime.

- [ ] **Step 3: Implement range summary**

In `src/lib/calculation.ts`, update the date import and monthly input type first:

```ts
import type { CalendarDay } from "./date";
import { addDays, getWeekRange, listDateKeys, parseDateKey } from "./date";
```

```ts
type MonthlySummaryInput = WeeklySummaryInput;
```

Then add:

```ts
export interface RangeSummary extends MonthlySummary {
  rangeStart: string;
  rangeEnd: string;
}

function splitRangeIntoWeekRanges(rangeStart: string, rangeEnd: string): Array<{ start: string; end: string }> {
  const ranges: Array<{ start: string; end: string }> = [];
  let cursor = rangeStart;

  while (cursor <= rangeEnd) {
    const week = getWeekRange(cursor);
    const start = cursor > week.start ? cursor : week.start;
    const end = rangeEnd < week.end ? rangeEnd : week.end;
    ranges.push({ start, end });
    cursor = addDays(end, 1);
  }

  return ranges;
}

function requiredShiftsForPartialWeek(data: WeeklySummaryInput, start: string, end: string): number {
  const dates = listDateKeys(start, end);
  const weekdaysInsideRange = dates.filter((date) => {
    const weekday = parseDateKey(date).getDay();
    return weekday >= 1 && weekday <= 5;
  }).length;
  const affectedHolidayCount = data.holidays.filter(
    (holiday) => holiday.affectsRequiredAttendance && isWithinRange(holiday.date, start, end)
  ).length;

  return Math.max(0, Math.min(data.settings.defaultRequiredShiftsPerWeek, weekdaysInsideRange) - affectedHolidayCount);
}
```

Then add:

```ts
function calculateOvertimeByStaff(data: WeeklySummaryInput, rangeStart: string, rangeEnd: string): Map<string, number> {
  const shiftMap = new Map(data.shifts.map((shift) => [shift.id, shift]));
  const overtimeByStaff = new Map<string, number>();

  for (const weekRange of splitRangeIntoWeekRanges(rangeStart, rangeEnd)) {
    const requiredShifts = requiredShiftsForPartialWeek(data, weekRange.start, weekRange.end);
    const weekEntries = data.scheduleEntries.filter((entry) => isWithinRange(entry.date, weekRange.start, weekRange.end));

    for (const staff of data.staff) {
      const staffEntries = weekEntries.filter((entry) => entry.staffId === staff.id);
      const totals = summarizeShiftTotals(staffEntries, shiftMap);
      const overtime = Math.max(0, totals.attendanceShifts - requiredShifts);
      overtimeByStaff.set(staff.id, (overtimeByStaff.get(staff.id) ?? 0) + overtime);
    }
  }

  return overtimeByStaff;
}

export function calculateRangeSummary(data: WeeklySummaryInput & MonthlySummaryInput, rangeStart: string, rangeEnd: string): RangeSummary {
  const printedDayKeys = new Set(listDateKeys(rangeStart, rangeEnd));
  const rangeEntries = data.scheduleEntries.filter((entry) => printedDayKeys.has(entry.date));
  const staffWithRangeEntries = new Set(rangeEntries.map((entry) => entry.staffId));
  const visibleStaff = [...data.staff]
    .filter((staff) => staff.enabled || staffWithRangeEntries.has(staff.id))
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const shiftMap = new Map(data.shifts.map((shift) => [shift.id, shift]));
  const holidayNames = data.holidays
    .filter((holiday) => printedDayKeys.has(holiday.date))
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((holiday) => holiday.name);
  const overtimeByStaff = calculateOvertimeByStaff(data, rangeStart, rangeEnd);

  return {
    rangeStart,
    rangeEnd,
    monthStart: rangeStart,
    monthEnd: rangeEnd,
    totalDays: printedDayKeys.size,
    holidayNames,
    rows: visibleStaff.map((staff) => ({
      ...summarizeMonthlyStaff(
        staff,
        rangeEntries.filter((entry) => entry.staffId === staff.id),
        shiftMap
      ),
      overtimeShifts: overtimeByStaff.get(staff.id) ?? 0
    }))
  };
}
```

Update `calculateMonthlySummary()` to delegate:

```ts
export function calculateMonthlySummary(data: MonthlySummaryInput & WeeklySummaryInput, days: CalendarDay[]): MonthlySummary {
  if (days.length === 0) {
    return {
      monthStart: "",
      monthEnd: "",
      totalDays: 0,
      holidayNames: [],
      rows: []
    };
  }

  return calculateRangeSummary(data, days[0].key, days[days.length - 1].key);
}
```

- [ ] **Step 4: Run calculation tests**

Run: `npm run test -- src/lib/calculation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/calculation.ts src/lib/calculation.test.ts
git commit -m "feat: calculate range overtime shifts"
```

---

### Task 3: Carry Overtime Through Bonus Allocation and Monthly Settlement

**Files:**
- Modify: `src/lib/bonus.ts`
- Modify: `src/lib/bonus.test.ts`
- Modify: `server/routes.test.ts`

- [ ] **Step 1: Write failing bonus tests**

In `src/lib/bonus.test.ts`, update the base summary fixture rows to include `overtimeShifts`, then add:

```ts
it("copies overtime shifts into allocation rows", () => {
  const allocation = calculateBonusAllocation(baseSummary, 1500);
  const nurse = allocation.rows.find((row) => row.staffId === "staff-nurse");

  expect(nurse?.overtimeShifts).toBe(baseSummary.rows.find((row) => row.staffId === "staff-nurse")?.overtimeShifts);
});
```

Update the existing `createMonthlySettlement` test to assert:

```ts
expect(settlement.rows[0]).toMatchObject({
  overtimeShifts: expect.any(Number)
});
```

- [ ] **Step 2: Write failing route snapshot test**

In `server/routes.test.ts`, in the monthly settlement creation test, add:

```ts
expect(response.body.monthlySettlements[0].rows[0]).toHaveProperty("overtimeShifts");
```

- [ ] **Step 3: Run focused tests to verify failure**

Run: `npm run test -- src/lib/bonus.test.ts server/routes.test.ts`

Expected: FAIL until allocation rows copy `overtimeShifts`. In sandbox, `server/routes.test.ts` may fail with Supertest `listen EPERM`; rerun outside sandbox during verification.

- [ ] **Step 4: Implement overtime copy**

In `src/lib/bonus.ts`, update `createSettlementRow()`:

```ts
function createSettlementRow(row: MonthlySummary["rows"][number], bonusAmount: number): MonthlySettlementRow {
  const isExcluded = row.coefficientTotal === null;

  return {
    staffId: row.staffId,
    staffName: row.staffName,
    staffType: row.staffType,
    attendanceShifts: row.attendanceShifts,
    overtimeShifts: row.overtimeShifts,
    coefficientTotal: row.coefficientTotal,
    coefficientExcludedReason: row.coefficientExcludedReason,
    bonusAmount,
    bonusExcludedReason: isExcluded ? row.coefficientExcludedReason : ""
  };
}
```

- [ ] **Step 5: Run focused tests**

Run: `npm run test -- src/lib/bonus.test.ts server/routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/bonus.ts src/lib/bonus.test.ts server/routes.test.ts
git commit -m "feat: include overtime shifts in settlements"
```

---

### Task 4: Add Temporary Range Bonus Aggregation

**Files:**
- Create: `src/lib/range-bonus.ts`
- Create: `src/lib/range-bonus.test.ts`

- [ ] **Step 1: Write failing range aggregation tests**

Create `src/lib/range-bonus.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calculateRangeBonusSummary, monthRangeToDates } from "./range-bonus";
import type { AppData, MonthlySettlement } from "@/types/domain";

function settlement(month: string, overrides: Partial<MonthlySettlement> = {}): MonthlySettlement {
  return {
    id: `settlement-${month}`,
    month,
    monthStart: `${month}-01`,
    monthEnd: `${month}-30`,
    totalDays: 30,
    bonusPool: 1000,
    coefficientTotal: 2,
    settledAt: `${month}-30T10:00:00.000Z`,
    rows: [
      {
        staffId: "staff-nurse-001",
        staffName: "李护士",
        staffType: "nurse",
        attendanceShifts: 4,
        overtimeShifts: 1,
        coefficientTotal: 2,
        coefficientExcludedReason: "",
        bonusAmount: 1000,
        bonusExcludedReason: ""
      }
    ],
    ...overrides
  };
}

function data(overrides: Partial<AppData> = {}): AppData {
  return {
    staff: [
      { id: "staff-nurse-001", jobId: "100001", name: "李护士", type: "nurse", isAdmin: false, enabled: true, sortOrder: 1 },
      { id: "staff-head-001", jobId: "000228", name: "段鸿露", type: "head_nurse", isAdmin: true, enabled: true, sortOrder: 2 }
    ],
    shifts: [
      { id: "shift-a1", name: "A1组长", shortName: "A1", color: "#2563EB", countsAttendance: true, coefficient: 1.5, enabled: true, sortOrder: 1 }
    ],
    holidays: [],
    scheduleEntries: [
      { id: "2026-07-01__staff-nurse-001", date: "2026-07-01", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" }
    ],
    monthlySettlements: [],
    settings: { defaultRequiredShiftsPerWeek: 5, version: 1 },
    ...overrides
  };
}

describe("monthRangeToDates", () => {
  it("expands whole-month ranges", () => {
    expect(monthRangeToDates("2026-06", "2026-07")).toEqual({
      rangeStart: "2026-06-01",
      rangeEnd: "2026-07-31"
    });
  });

  it("marks reversed ranges as invalid", () => {
    expect(monthRangeToDates("2026-08", "2026-07")).toBeNull();
  });
});

describe("calculateRangeBonusSummary", () => {
  it("combines settled snapshot months with live unsettled months", () => {
    const summary = calculateRangeBonusSummary(data({ monthlySettlements: [settlement("2026-06")] }), "2026-06", "2026-07");
    const nurse = summary.rows.find((row) => row.staffId === "staff-nurse-001");

    expect(summary.isValidRange).toBe(true);
    expect(summary.sourceMonths).toEqual([
      { month: "2026-06", source: "settlement" },
      { month: "2026-07", source: "live" }
    ]);
    expect(nurse?.attendanceShifts).toBe(5);
    expect(nurse?.overtimeShifts).toBe(1);
    expect(nurse?.coefficientTotal).toBe(3.5);
  });

  it("keeps head nurses excluded when merging range rows", () => {
    const summary = calculateRangeBonusSummary(
      data({
        monthlySettlements: [
          settlement("2026-06", {
            rows: [
              {
                staffId: "staff-head-001",
                staffName: "段鸿露",
                staffType: "head_nurse",
                attendanceShifts: 2,
                overtimeShifts: 0,
                coefficientTotal: null,
                coefficientExcludedReason: "护士长绩效单独核算",
                bonusAmount: 0,
                bonusExcludedReason: "护士长绩效单独核算"
              }
            ],
            coefficientTotal: 0
          })
        ]
      }),
      "2026-06",
      "2026-07"
    );
    const head = summary.rows.find((row) => row.staffId === "staff-head-001");

    expect(head?.coefficientTotal).toBeNull();
    expect(head?.coefficientExcludedReason).toBe("护士长绩效单独核算");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test -- src/lib/range-bonus.test.ts`

Expected: FAIL because `src/lib/range-bonus.ts` does not exist.

- [ ] **Step 3: Implement range-bonus module**

Create `src/lib/range-bonus.ts`:

```ts
import type { AppData, MonthlyStaffSummary, MonthlySummary } from "@/types/domain";
import { calculateRangeSummary } from "./calculation";

export interface RangeSourceMonth {
  month: string;
  source: "settlement" | "live";
}

export interface RangeBonusSummary extends MonthlySummary {
  isValidRange: boolean;
  rangeStart: string;
  rangeEnd: string;
  sourceMonths: RangeSourceMonth[];
}

export function monthRangeToDates(startMonth: string, endMonth: string): { rangeStart: string; rangeEnd: string } | null {
  if (startMonth > endMonth) {
    return null;
  }

  const [endYear, endMonthNumber] = endMonth.split("-").map(Number);
  const lastDay = new Date(endYear, endMonthNumber, 0).getDate();

  return {
    rangeStart: `${startMonth}-01`,
    rangeEnd: `${endMonth}-${String(lastDay).padStart(2, "0")}`
  };
}

function addRows(target: Map<string, MonthlyStaffSummary>, rows: MonthlyStaffSummary[]): void {
  for (const row of rows) {
    const existing = target.get(row.staffId);
    if (!existing) {
      target.set(row.staffId, { ...row });
      continue;
    }

    existing.attendanceShifts += row.attendanceShifts;
    existing.overtimeShifts += row.overtimeShifts;
    existing.coefficientTotal =
      existing.coefficientTotal === null || row.coefficientTotal === null
        ? null
        : Math.round((existing.coefficientTotal + row.coefficientTotal) * 100) / 100;
    existing.coefficientExcludedReason = existing.coefficientTotal === null ? existing.coefficientExcludedReason || row.coefficientExcludedReason : "";
  }
}

function settlementRowsToSummaryRows(rows: AppData["monthlySettlements"][number]["rows"]): MonthlyStaffSummary[] {
  return rows.map((row) => ({
    staffId: row.staffId,
    staffName: row.staffName,
    staffType: row.staffType,
    attendanceShifts: row.attendanceShifts,
    overtimeShifts: row.overtimeShifts,
    coefficientTotal: row.coefficientTotal,
    coefficientExcludedReason: row.coefficientExcludedReason
  }));
}

export function calculateRangeBonusSummary(data: AppData, startMonth: string, endMonth: string): RangeBonusSummary {
  const range = monthRangeToDates(startMonth, endMonth);

  if (!range) {
    return {
      isValidRange: false,
      rangeStart: "",
      rangeEnd: "",
      monthStart: "",
      monthEnd: "",
      totalDays: 0,
      holidayNames: [],
      sourceMonths: [],
      rows: []
    };
  }

  const rowsByStaffId = new Map<string, MonthlyStaffSummary>();
  const sourceMonths: RangeSourceMonth[] = [];
  const [startYear, startMonthNumber] = startMonth.split("-").map(Number);
  const [endYear, endMonthNumber] = endMonth.split("-").map(Number);

  for (let absoluteMonth = startYear * 12 + startMonthNumber; absoluteMonth <= endYear * 12 + endMonthNumber; absoluteMonth += 1) {
    const year = Math.floor((absoluteMonth - 1) / 12);
    const monthNumber = ((absoluteMonth - 1) % 12) + 1;
    const month = `${year}-${String(monthNumber).padStart(2, "0")}`;
    const settlement = data.monthlySettlements.find((item) => item.month === month);

    if (settlement) {
      sourceMonths.push({ month, source: "settlement" });
      addRows(rowsByStaffId, settlementRowsToSummaryRows(settlement.rows));
      continue;
    }

    const dates = monthRangeToDates(month, month);
    if (!dates) {
      continue;
    }
    sourceMonths.push({ month, source: "live" });
    addRows(rowsByStaffId, calculateRangeSummary(data, dates.rangeStart, dates.rangeEnd).rows);
  }

  return {
    isValidRange: true,
    rangeStart: range.rangeStart,
    rangeEnd: range.rangeEnd,
    monthStart: range.rangeStart,
    monthEnd: range.rangeEnd,
    totalDays: 0,
    holidayNames: data.holidays
      .filter((holiday) => holiday.date >= range.rangeStart && holiday.date <= range.rangeEnd)
      .sort((left, right) => left.date.localeCompare(right.date))
      .map((holiday) => holiday.name),
    sourceMonths,
    rows: [...rowsByStaffId.values()].sort((left, right) => {
      const leftStaff = data.staff.find((staff) => staff.id === left.staffId);
      const rightStaff = data.staff.find((staff) => staff.id === right.staffId);
      return (leftStaff?.sortOrder ?? 0) - (rightStaff?.sortOrder ?? 0);
    })
  };
}
```

- [ ] **Step 4: Run range-bonus tests**

Run: `npm run test -- src/lib/range-bonus.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/range-bonus.ts src/lib/range-bonus.test.ts
git commit -m "feat: aggregate custom range bonus summaries"
```

---

### Task 5: Add Workbench Tabs in App

**Files:**
- Modify: `src/App.vue`
- Modify: `src/App.test.ts`

- [ ] **Step 1: Write failing App tests for Tabs**

Add tests to `src/App.test.ts`:

```ts
const WeeklySummaryStub = defineComponent({
  name: "WeeklySummary",
  template: '<section data-testid="weekly-summary">周统计</section>'
});

it("shows scheduling content by default and switches workbench tabs without changing the selected date", async () => {
  const wrapper = mountApp();

  await flushPromises();

  expect(wrapper.get('[data-testid="workbench-tab-schedule"]').classes()).toContain("active");
  expect(wrapper.get('[data-testid="schedule-grid"]').exists()).toBe(true);
  expect(wrapper.find('[data-testid="weekly-summary"]').exists()).toBe(false);

  await wrapper.get('[data-testid="jump-date"]').trigger("click");
  await wrapper.get('[data-testid="workbench-tab-weekly"]').trigger("click");

  expect(wrapper.get('[data-testid="weekly-summary"]').exists()).toBe(true);
  expect(wrapper.find('[data-testid="schedule-grid"]').exists()).toBe(false);
});

it("shows the bonus panel only in the bonus tab", async () => {
  const wrapper = mountApp();

  await flushPromises();
  expect(wrapper.find('[data-testid="bonus-panel"]').exists()).toBe(false);

  await wrapper.get('[data-testid="workbench-tab-bonus"]').trigger("click");

  expect(wrapper.get('[data-testid="bonus-panel"]').exists()).toBe(true);
});
```

Update the `global.stubs` block in `mountApp()` so `WeeklySummary` uses `WeeklySummaryStub` instead of `EmptyStub`.

- [ ] **Step 2: Run App tests to verify failure**

Run: `npm run test -- src/App.test.ts`

Expected: FAIL because workbench Tab buttons do not exist.

- [ ] **Step 3: Implement active workbench Tab**

In `src/App.vue`, add:

```ts
type WorkbenchTab = "schedule" | "weekly" | "bonus";
const activeWorkbenchTab = ref<WorkbenchTab>("schedule");

const workbenchTabs: Array<{ key: WorkbenchTab; label: string }> = [
  { key: "schedule", label: "排班" },
  { key: "weekly", label: "周统计" },
  { key: "bonus", label: "月结与奖金" }
];
```

In the template, replace the direct workbench children with:

```vue
<section class="workbench">
  <ManagementDrawer
    v-if="data"
    v-model="managementOpen"
    :data="data"
    :admin-mode="adminMode"
    :staff-save-version="staffSaveVersion"
    :shift-save-version="shiftSaveVersion"
    :holiday-save-version="holidaySaveVersion"
    :staff-saving="staffSaving"
    :shift-saving="shiftSaving"
    :holiday-saving="holidaySaving"
    @save-staff="handleSaveStaff"
    @save-shift="handleSaveShift"
    @save-holiday="handleSaveHoliday"
    @delete-holiday="handleDeleteHoliday"
  />

  <nav class="workbench-tabs" aria-label="工作台分区">
    <button
      v-for="tab in workbenchTabs"
      :key="tab.key"
      :data-testid="`workbench-tab-${tab.key}`"
      type="button"
      :class="{ active: activeWorkbenchTab === tab.key }"
      @click="activeWorkbenchTab = tab.key"
    >
      {{ tab.label }}
    </button>
  </nav>

  <section class="workbench-panel">
    <template v-if="activeWorkbenchTab === 'schedule'">
      <ShiftPalette :shifts="data.shifts" :selected-shift-id="selectedShiftId" @select="selectedShiftId = $event" />
      <ScheduleGrid
        :staff="data.staff"
        :days="scheduleDays"
        :holidays="data.holidays"
        :shifts="data.shifts"
        :entries="data.scheduleEntries"
        :selected-shift-id="selectedShiftId"
        :admin-mode="adminMode"
        @quick-fill="handleQuickFill"
        @edit-cell="handleEditCell"
      />
    </template>
    <WeeklySummary v-else-if="activeWorkbenchTab === 'weekly' && weeklySummary" :summary="weeklySummary" />
    <BonusSettlementPanel
      v-else-if="activeWorkbenchTab === 'bonus' && monthlySummary"
      :admin-mode="adminMode"
      :month="selectedMonth"
      :monthly-summary="monthlySummary"
      :settlement="currentMonthlySettlement"
      :saving="settlementSaving"
      :canceling="settlementCanceling"
      @confirm-settlement="handleConfirmSettlement"
      @cancel-settlement="handleCancelSettlement"
    />
  </section>

  <CellEditorDialog
    v-model="editorOpen"
    :staff="editingStaff"
    :date="editingDate"
    :entry="editingEntry"
    :shifts="data.shifts"
    @save="handleEditorSave"
  />
</section>
```

- [ ] **Step 4: Add CSS for Tabs**

In `src/styles/main.css`, add:

```css
.workbench {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.workbench-tabs {
  display: grid;
  gap: 8px;
  position: sticky;
  top: 12px;
}

.workbench-tabs button {
  min-height: 38px;
  border: 1px solid #dbe3ef;
  background: #ffffff;
  color: #334155;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.workbench-tabs button.active {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
}

.workbench-panel {
  min-width: 0;
}

@media (max-width: 768px) {
  .workbench {
    grid-template-columns: 1fr;
  }

  .workbench-tabs {
    display: flex;
    position: static;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .workbench-tabs button {
    flex: 0 0 auto;
    text-align: center;
    white-space: nowrap;
  }
}
```

- [ ] **Step 5: Run App tests**

Run: `npm run test -- src/App.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.vue src/App.test.ts src/styles/main.css
git commit -m "feat: add workbench tabs"
```

---

### Task 6: Add Month Range Controls and Range Trial Mode to Bonus Panel

**Files:**
- Modify: `src/App.vue`
- Modify: `src/App.test.ts`
- Modify: `src/components/BonusSettlementPanel.vue`
- Modify: `src/components/BonusSettlementPanel.test.ts`

- [ ] **Step 1: Write failing BonusSettlementPanel tests**

In `src/components/BonusSettlementPanel.test.ts`, add:

```ts
it("renders range controls and hides settlement actions in multi-month trial mode", async () => {
  const wrapper = mountPanel({
    startMonth: "2026-06",
    endMonth: "2026-07",
    isRangeMode: true,
    sourceMonths: [
      { month: "2026-06", source: "settlement" },
      { month: "2026-07", source: "live" }
    ]
  });

  expect(wrapper.text()).toContain("临时试算，不会保存或锁定排班");
  expect(wrapper.text()).toContain("2026-06 使用月结快照");
  expect(wrapper.text()).toContain("2026-07 使用实时排班");
  expect(wrapper.find('[data-testid="confirm-settlement-button"]').exists()).toBe(false);
  expect(wrapper.find('[data-testid="cancel-settlement-button"]').exists()).toBe(false);
});

it("emits month range updates", async () => {
  const wrapper = mountPanel();

  await wrapper.get('[data-testid="bonus-start-month"]').setValue("2026-05");
  await wrapper.get('[data-testid="bonus-end-month"]').setValue("2026-07");

  expect(wrapper.emitted("update:startMonth")).toEqual([["2026-05"]]);
  expect(wrapper.emitted("update:endMonth")).toEqual([["2026-07"]]);
});

it("shows cumulative overtime shifts", async () => {
  const wrapper = mountPanel();

  expect(wrapper.text()).toContain("累计加班班次");
  expect(wrapper.text()).toContain("1");
});
```

Update the `mountPanel()` default props and fixtures to include `startMonth`, `endMonth`, `isRangeMode`, and `sourceMonths`, and add `overtimeShifts` to all summary/settlement rows.

- [ ] **Step 2: Write failing App range tests**

In `src/App.test.ts`, add:

```ts
it("passes a custom range trial summary into the bonus panel", async () => {
  const wrapper = mountApp({
    ...testData,
    scheduleEntries: [
      { id: "2026-07-01__staff-nurse-001", date: "2026-07-01", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" }
    ]
  });

  await flushPromises();
  await wrapper.get('[data-testid="workbench-tab-bonus"]').trigger("click");
  await wrapper.get('[data-testid="set-end-july"]').trigger("click");
  expect(wrapper.get('[data-testid="bonus-range"]').text()).toContain("2026-06-2026-07 range");
});
```

Update the existing `BonusSettlementPanelStub` in `src/App.test.ts` to include `startMonth`, `endMonth`, `isRangeMode`, and update events:

```ts
props: ["month", "monthlySummary", "settlement", "startMonth", "endMonth", "isRangeMode", "sourceMonths"],
emits: ["confirmSettlement", "cancelSettlement", "update:startMonth", "update:endMonth"],
template: `
  <section data-testid="bonus-panel">
    <span data-testid="bonus-range">{{ startMonth }}-{{ endMonth }} {{ isRangeMode ? "range" : "single" }}</span>
    <button data-testid="set-end-july" type="button" @click="$emit('update:endMonth', '2026-07')">set july</button>
    <button data-testid="confirm-settlement" type="button" @click="$emit('confirmSettlement', { month, bonusPool: 1000 })">confirm</button>
    <button data-testid="cancel-settlement" type="button" @click="$emit('cancelSettlement', month)">cancel</button>
  </section>
`
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npm run test -- src/App.test.ts src/components/BonusSettlementPanel.test.ts`

Expected: FAIL because props and controls do not exist.

- [ ] **Step 4: Implement App range state**

In `src/App.vue`, add:

```ts
const bonusStartMonth = ref(selectedMonth.value);
const bonusEndMonth = ref(selectedMonth.value);

watch(selectedMonth, (month) => {
  bonusStartMonth.value = month;
  bonusEndMonth.value = month;
});

const bonusRangeSummary = computed(() => {
  if (!data.value) {
    return null;
  }
  return calculateRangeBonusSummary(data.value, bonusStartMonth.value, bonusEndMonth.value);
});
const isBonusRangeMode = computed(() => bonusStartMonth.value !== bonusEndMonth.value);
const displayedBonusSummary = computed(() => (isBonusRangeMode.value ? bonusRangeSummary.value : monthlySummary.value));
```

Import `watch` from `vue` and `calculateRangeBonusSummary` from `@/lib/range-bonus`.

Pass new props to `BonusSettlementPanel`:

```vue
<BonusSettlementPanel
  v-else-if="activeWorkbenchTab === 'bonus' && displayedBonusSummary"
  v-model:start-month="bonusStartMonth"
  v-model:end-month="bonusEndMonth"
  :admin-mode="adminMode"
  :month="selectedMonth"
  :monthly-summary="displayedBonusSummary"
  :settlement="isBonusRangeMode ? null : currentMonthlySettlement"
  :saving="settlementSaving"
  :canceling="settlementCanceling"
  :is-range-mode="isBonusRangeMode"
  :source-months="bonusRangeSummary?.sourceMonths ?? []"
  @confirm-settlement="handleConfirmSettlement"
  @cancel-settlement="handleCancelSettlement"
/>
```

- [ ] **Step 5: Implement BonusSettlementPanel props and controls**

In `BonusSettlementPanel.vue`, add props:

```ts
startMonth: string;
endMonth: string;
isRangeMode: boolean;
sourceMonths: Array<{ month: string; source: "settlement" | "live" }>;
```

Add emits:

```ts
"update:startMonth": [value: string];
"update:endMonth": [value: string];
```

Add template controls near the header:

```vue
<div class="settlement-range-controls">
  <label>
    <span>开始月份</span>
    <input data-testid="bonus-start-month" type="month" :value="startMonth" @input="emit('update:startMonth', ($event.target as HTMLInputElement).value)" />
  </label>
  <label>
    <span>结束月份</span>
    <input data-testid="bonus-end-month" type="month" :value="endMonth" @input="emit('update:endMonth', ($event.target as HTMLInputElement).value)" />
  </label>
</div>
```

Use this range notice:

```vue
<p v-if="isRangeMode" class="settlement-range-notice">
  临时试算，不会保存或锁定排班。
  <span v-for="item in sourceMonths" :key="item.month">
    {{ item.month }} 使用{{ item.source === "settlement" ? "月结快照" : "实时排班" }}
  </span>
</p>
```

Hide formal actions in range mode by changing the existing settlement actions container opening tag from `<div class="settlement-actions">` to `<div v-if="!isRangeMode" class="settlement-actions">`. Leave the existing confirm and cancel buttons inside that container unchanged.

Update `canConfirm` and `canCancel` to include `!props.isRangeMode`.

Add `累计加班班次` column after `出勤班次`:

```vue
<th>累计加班班次</th>
<td data-label="累计加班班次">{{ row.overtimeShifts }}</td>
```

- [ ] **Step 6: Run focused tests**

Run: `npm run test -- src/App.test.ts src/components/BonusSettlementPanel.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/App.vue src/App.test.ts src/components/BonusSettlementPanel.vue src/components/BonusSettlementPanel.test.ts
git commit -m "feat: add bonus range trial mode"
```

---

### Task 7: Update Print Views for Overtime Column

**Files:**
- Modify: `src/components/PrintViews.vue`
- Modify: `src/components/PrintViews.test.ts`

- [ ] **Step 1: Write failing print tests**

In `src/components/PrintViews.test.ts`, update monthly summary and settlement fixtures with `overtimeShifts`, then add:

```ts
it("prints cumulative overtime shifts in monthly summary and bonus snapshot", () => {
  const wrapper = mount(PrintViews, {
    props: {
      data: createData([]),
      days,
      summary,
      monthlySummary,
      monthlySettlement
    }
  });

  expect(wrapper.get(".print-month-summary").text()).toContain("累计加班班次");
  expect(wrapper.get(".print-month-summary").text()).toContain("1");
  expect(wrapper.get(".print-bonus-summary").text()).toContain("累计加班班次");
  expect(wrapper.get(".print-bonus-summary").text()).toContain("1");
});
```

- [ ] **Step 2: Run PrintViews tests to verify failure**

Run: `npm run test -- src/components/PrintViews.test.ts`

Expected: FAIL because the column does not exist.

- [ ] **Step 3: Add print columns**

In `PrintViews.vue`, add `累计加班班次` after `月出勤班次` in both monthly summary and bonus summary tables. In each affected table header row, insert `<th>累计加班班次</th>` immediately after the existing attendance-shift header. In each affected `v-for` body row, insert `<td>{{ row.overtimeShifts }}</td>` immediately after the existing attendance-shift value cell.

- [ ] **Step 4: Run PrintViews tests**

Run: `npm run test -- src/components/PrintViews.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/PrintViews.vue src/components/PrintViews.test.ts
git commit -m "feat: print overtime shifts in monthly summaries"
```

---

### Task 8: Optimize Schedule Grid Visuals

**Files:**
- Modify: `src/styles/main.css`
- Modify: `src/styles/main-css.test.ts`
- Modify: `src/components/ScheduleGrid.test.ts`

- [ ] **Step 1: Write failing CSS tests**

Update `src/styles/main-css.test.ts`:

```ts
it("uses compact staff column widths", () => {
  const personColumnRules = ruleBlocks(".schedule-grid .person-col");

  expect(personColumnRules[0]).toContain("width: 112px");
  expect(personColumnRules[0]).toContain("min-width: 112px");
  expect(personColumnRules[1]).toContain("width: 88px");
  expect(personColumnRules[1]).toContain("min-width: 88px");
});

it("renders shift marks as text without chip borders", () => {
  const shiftChip = ruleBlocks(".shift-chip")[0] ?? "";

  expect(shiftChip).toContain("border: 0");
  expect(shiftChip).toContain("font-size: 15px");
});
```

Update any old width expectations from `132px`/`100px` to `112px`/`88px`.

- [ ] **Step 2: Run CSS tests to verify failure**

Run: `npm run test -- src/styles/main-css.test.ts`

Expected: FAIL with old widths and border styles.

- [ ] **Step 3: Update CSS**

In `src/styles/main.css`, change:

```css
.schedule-grid .person-col {
  width: 112px;
  min-width: 112px;
  max-width: 112px;
  text-align: left;
  padding: 0 6px;
}

.shift-chip {
  display: inline-flex;
  justify-content: center;
  border: 0;
  padding: 0;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.2;
  background: transparent;
}
```

Inside the mobile media block, change:

```css
.schedule-grid .person-col {
  width: 88px;
  min-width: 88px;
  max-width: 88px;
  padding: 0 5px;
}

.shift-chip {
  font-size: 14px;
}
```

- [ ] **Step 4: Run focused tests**

Run: `npm run test -- src/styles/main-css.test.ts src/components/ScheduleGrid.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/styles/main.css src/styles/main-css.test.ts src/components/ScheduleGrid.test.ts
git commit -m "style: simplify schedule grid shift display"
```

---

### Task 9: Align Weekly and Bonus Panel Visual Style

**Files:**
- Modify: `src/components/WeeklySummary.vue`
- Modify: `src/components/WeeklySummary.test.ts`
- Modify: `src/components/BonusSettlementPanel.vue`
- Modify: `src/styles/main.css`

- [ ] **Step 1: Write focused style-hook tests**

In `src/components/WeeklySummary.test.ts`, add:

```ts
it("uses the shared stats panel shell", () => {
  const wrapper = mount(WeeklySummary, { props: { summary } });

  expect(wrapper.get(".weekly-summary").classes()).toContain("stats-panel");
  expect(wrapper.get("header").classes()).toContain("stats-panel-header");
});
```

In `src/components/BonusSettlementPanel.test.ts`, assert the root also uses `stats-panel`:

```ts
expect(wrapper.get(".bonus-settlement-panel").classes()).toContain("stats-panel");
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test -- src/components/WeeklySummary.test.ts src/components/BonusSettlementPanel.test.ts`

Expected: FAIL because shared classes are missing.

- [ ] **Step 3: Add shared classes**

In `WeeklySummary.vue`:

```vue
<section class="weekly-summary stats-panel">
  <header class="stats-panel-header">
```

In `BonusSettlementPanel.vue`:

```vue
<section class="bonus-settlement-panel stats-panel" aria-labelledby="bonus-settlement-title">
```

In `src/styles/main.css`, add shared rules:

```css
.stats-panel {
  border: 1px solid #dbe3ef;
  background: #ffffff;
  padding: 12px;
}

.stats-panel-header h2 {
  margin: 0 0 4px;
  color: #0f172a;
  font-size: 16px;
}

.stats-panel-header p {
  margin: 0 0 4px;
  color: #475569;
  font-size: 13px;
}
```

Remove duplicate conflicting `weekly-summary` and `bonus-settlement-panel` header rules only where they produce different typography. Keep component-scoped business styles such as status labels.

- [ ] **Step 4: Run tests**

Run: `npm run test -- src/components/WeeklySummary.test.ts src/components/BonusSettlementPanel.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/WeeklySummary.vue src/components/WeeklySummary.test.ts src/components/BonusSettlementPanel.vue src/components/BonusSettlementPanel.test.ts src/styles/main.css
git commit -m "style: align statistics panels"
```

---

### Task 10: E2E and Final Verification

**Files:**
- Modify: `tests/e2e/schedule.spec.ts`

- [ ] **Step 1: Write E2E Tab smoke test**

Add this test to `tests/e2e/schedule.spec.ts`:

```ts
test("switches workbench tabs while preserving quick scheduling", async ({ page, request }) => {
  await page.clock.setFixedTime("2026-06-16T08:00:00+08:00");
  const session = await request.post("/api/admin/session", { data: { password: "123456" } });
  expect(session.ok()).toBeTruthy();
  const { token } = (await session.json()) as { token: string };
  await clearScheduleEntry(request, token, quickFillDate, quickFillStaffId);

  try {
    await page.goto("/");
    await page.getByRole("button", { name: /输入管理密码/ }).click();
    await page.getByPlaceholder("管理密码").fill("123456");
    await page.getByRole("button", { name: "进入编辑模式" }).click();

    await page.getByTestId("workbench-tab-weekly").click();
    await expect(page.getByRole("heading", { name: "周统计" })).toBeVisible();
    await page.getByTestId("workbench-tab-bonus").click();
    await expect(page.getByRole("heading", { name: "2026-06" })).toBeVisible();

    await page.getByTestId("workbench-tab-schedule").click();
    await page.getByRole("button", { name: "A1", exact: true }).click();
    const targetCell = page.getByTestId(`schedule-cell-${quickFillStaffId}-${quickFillDate}`);
    await targetCell.click();
    await expect(targetCell).toContainText("A1");
  } finally {
    await clearScheduleEntry(request, token, quickFillDate, quickFillStaffId);
  }
});
```

- [ ] **Step 2: Run E2E spec**

Run: `npm run test:e2e -- tests/e2e/schedule.spec.ts`

Expected: PASS.

- [ ] **Step 3: Run all unit/component tests**

Run: `npm run test`

Expected: PASS.

- [ ] **Step 4: Run production build**

Run: `npm run build`

Expected: PASS. Existing Vite chunk size warnings are acceptable.

- [ ] **Step 5: Run lint**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 6: Search for unfinished markers**

Run:

```bash
rg -n "TO[D]O|TB[D]|implement\\slater|fill\\sin\\sdetails|类[似]|待[定]" docs/superpowers/plans/2026-06-18-workbench-range-bonus-implementation.md src server tests
```

Expected: no matches.

- [ ] **Step 7: Commit E2E and any verification updates**

```bash
git add tests/e2e/schedule.spec.ts
git commit -m "test: cover workbench tab navigation"
```

If no files changed during verification, do not create a commit.

---

## Self-Review Notes

- Spec coverage: Tasks 1-4 cover overtime and range trial calculation; Tasks 5-6 cover Tab navigation and range controls; Tasks 7-9 cover printing and visual polish; Task 10 covers E2E and final verification.
- Formal monthly settlement remains month-only. Multi-month range mode is frontend trial only and hides confirm/cancel actions.
- The plan intentionally avoids account, audit, deployment, and cross-month locking work.
- The highest-risk implementation detail is partial-week required shift calculation. Task 2 isolates it with focused tests before UI work begins.
