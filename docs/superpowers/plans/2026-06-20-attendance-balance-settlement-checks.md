# Attendance Balance Settlement Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add attendance balance to weekly/monthly/settlement/print flows and warn users about month-end data issues before confirming settlement.

**Architecture:** Extend the existing calculation pipeline so weekly, monthly, range bonus, and settlement snapshot rows all carry `requiredShifts` and `attendanceBalance`. Add a focused settlement-check helper that computes non-blocking warnings from loaded app data, then wire it into the existing `App.vue` settlement confirmation flow.

**Tech Stack:** Vue 3, TypeScript, Vitest, Element Plus, better-sqlite3, Vite.

---

## File Structure

- Modify `src/types/domain.ts`
  - Add `attendanceBalance` to `WeeklyStaffSummary`.
  - Add `requiredShifts` and `attendanceBalance` to `MonthlyStaffSummary` and `MonthlySettlementRow`.

- Modify `src/lib/calculation.ts`
  - Keep existing weekly required-shift logic.
  - Expose monthly required shifts by staff and monthly attendance balance using the current partial-week split.

- Modify `src/lib/bonus.ts`
  - Copy new monthly summary fields into bonus allocation and monthly settlement rows.

- Modify `src/lib/range-bonus.ts`
  - Merge `requiredShifts` and `attendanceBalance` across settled and live months.

- Create `src/lib/settlement-checks.ts`
  - Compute non-blocking month-end checks for no attendance, attendance deficit, double shifts, disabled shifts, and disabled staff with schedules.

- Modify `src/App.vue`
  - Run settlement checks before the existing final confirmation.
  - Show one additional warning confirm only when checks exist.

- Modify `src/components/WeeklySummary.vue`
  - Display attendance balance on desktop and mobile.

- Modify `src/components/BonusSettlementPanel.vue`
  - Display required shifts and attendance balance in the monthly/bonus table.

- Modify `src/components/PrintViews.vue`
  - Print the new fields in weekly summary, monthly summary, and bonus snapshot tables.

- Modify `server/app-data.ts`
  - Accept and normalize existing monthly settlement rows that do not yet contain the new fields.

- Modify `server/sqlite/schema.ts`
  - Increment schema version and add migration helpers for `monthly_settlement_rows.required_shifts` and `monthly_settlement_rows.attendance_balance`.

- Modify `server/sqlite/mapper.ts`
  - Write and read new monthly settlement row fields.

- Tests to update or create:
  - `src/lib/calculation.test.ts`
  - `src/lib/bonus.test.ts`
  - `src/lib/range-bonus.test.ts`
  - `src/lib/settlement-checks.test.ts`
  - `src/components/WeeklySummary.test.ts`
  - `src/components/BonusSettlementPanel.test.ts`
  - `src/components/PrintViews.test.ts`
  - `src/App.test.ts`
  - `server/app-data.test.ts`
  - `server/sqlite-storage.test.ts`

---

### Task 1: Calculation Types And Summaries

**Files:**
- Modify: `src/types/domain.ts`
- Modify: `src/lib/calculation.ts`
- Test: `src/lib/calculation.test.ts`

- [ ] **Step 1: Write failing type-aware calculation tests**

Add assertions to existing weekly tests in `src/lib/calculation.test.ts`:

```ts
it("calculates weekly attendance balance as attendance minus required shifts", () => {
  const summary = calculateWeeklySummary(baseData, "2026-06-17");
  const nurse = getRow(summary, "staff-nurse");
  const clerk = getRow(summary, "staff-clerk");

  expect(nurse).toMatchObject({
    attendanceShifts: 5,
    requiredShifts: 4,
    attendanceBalance: 1,
    overtimeShifts: 1
  });
  expect(clerk).toMatchObject({
    attendanceShifts: 1,
    requiredShifts: 4,
    attendanceBalance: -3,
    overtimeShifts: 0
  });
});
```

Add monthly assertions near existing monthly/range summary tests:

```ts
it("calculates monthly required shifts and attendance balance across partial weeks", () => {
  const data = createData({
    holidays: [{ id: "h1", date: "2026-06-19", name: "端午节", affectsRequiredAttendance: true }],
    scheduleEntries: [
      entry("2026-06-01", "staff-nurse-001", ["shift-a1"]),
      entry("2026-06-02", "staff-nurse-001", ["shift-a1"]),
      entry("2026-06-03", "staff-nurse-001", ["shift-a1"]),
      entry("2026-06-04", "staff-nurse-001", ["shift-a1"]),
      entry("2026-06-05", "staff-nurse-001", ["shift-a1"]),
      entry("2026-06-29", "staff-nurse-001", ["shift-a1"]),
      entry("2026-06-30", "staff-nurse-001", ["shift-a1"])
    ]
  });

  const summary = calculateMonthlySummary(data, getMonthDays(2026, 5));
  const nurse = getMonthlyRow(summary, "staff-nurse-001");

  expect(nurse.requiredShifts).toBe(21);
  expect(nurse.attendanceShifts).toBe(7);
  expect(nurse.attendanceBalance).toBe(-14);
});
```

Add a range-specific overtime guard:

```ts
it("keeps monthly overtime as positive weekly overtime instead of net monthly balance", () => {
  const data = createData({
    scheduleEntries: [
      entry("2026-06-01", "staff-nurse-001", ["shift-a1"]),
      entry("2026-06-02", "staff-nurse-001", ["shift-a1"]),
      entry("2026-06-03", "staff-nurse-001", ["shift-a1"]),
      entry("2026-06-04", "staff-nurse-001", ["shift-a1"]),
      entry("2026-06-05", "staff-nurse-001", ["shift-a1"]),
      entry("2026-06-06", "staff-nurse-001", ["shift-a1"])
    ]
  });

  const summary = calculateRangeSummary(data, "2026-06-01", "2026-06-14");
  const nurse = getMonthlyRow(summary, "staff-nurse-001");

  expect(nurse.requiredShifts).toBe(10);
  expect(nurse.attendanceShifts).toBe(6);
  expect(nurse.attendanceBalance).toBe(-4);
  expect(nurse.overtimeShifts).toBe(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/lib/calculation.test.ts
```

Expected: FAIL because `attendanceBalance` and monthly `requiredShifts` do not exist yet.

- [ ] **Step 3: Extend domain types**

In `src/types/domain.ts`, update interfaces:

```ts
export interface WeeklyStaffSummary {
  staffId: string;
  staffName: string;
  staffJobId: string;
  staffType: StaffType;
  attendanceShifts: number;
  requiredShifts: number;
  attendanceBalance: number;
  overtimeShifts: number;
  coefficientTotal: number | null;
  coefficientExcludedReason: string;
}

export interface MonthlyStaffSummary {
  staffId: string;
  staffName: string;
  staffJobId: string;
  staffType: StaffType;
  attendanceShifts: number;
  requiredShifts: number;
  attendanceBalance: number;
  overtimeShifts: number;
  coefficientTotal: number | null;
  coefficientExcludedReason: string;
}
```

- [ ] **Step 4: Implement calculation fields**

In `src/lib/calculation.ts`, add `attendanceBalance` to weekly rows:

```ts
const attendanceBalance = totals.attendanceShifts - requiredShifts;
const overtimeShifts = Math.max(0, attendanceBalance);
```

Return it from `summarizeStaff`:

```ts
attendanceBalance,
overtimeShifts,
```

Add a monthly required-shift helper:

```ts
function calculateRequiredShiftsByStaff(data: WeeklySummaryInput, rangeStart: string, rangeEnd: string): Map<string, number> {
  const requiredByStaff = new Map<string, number>();

  for (const weekRange of splitRangeIntoWeekRanges(rangeStart, rangeEnd)) {
    const requiredShifts = requiredShiftsForPartialWeek(data, weekRange.start, weekRange.end);

    for (const staff of data.staff) {
      requiredByStaff.set(staff.id, (requiredByStaff.get(staff.id) ?? 0) + requiredShifts);
    }
  }

  return requiredByStaff;
}
```

Update `summarizeMonthlyStaff` signature:

```ts
function summarizeMonthlyStaff(
  staff: StaffMember,
  entries: ScheduleEntry[],
  shiftMap: Map<string, Shift>,
  requiredShifts: number
): MonthlyStaffSummary {
  const totals = summarizeShiftTotals(entries, shiftMap);
  const attendanceBalance = totals.attendanceShifts - requiredShifts;
  const isCoefficientExcluded = shouldExcludeCoefficient(staff);

  return {
    staffId: staff.id,
    staffName: staff.name,
    staffJobId: staff.jobId,
    staffType: staff.type,
    attendanceShifts: totals.attendanceShifts,
    requiredShifts,
    attendanceBalance,
    overtimeShifts: 0,
    coefficientTotal: isCoefficientExcluded ? null : totals.coefficientTotal,
    coefficientExcludedReason: isCoefficientExcluded ? "护士长绩效单独核算" : ""
  };
}
```

In `calculateRangeSummary`, compute and pass `requiredShiftsByStaff`:

```ts
const overtimeByStaff = calculateOvertimeByStaff(data, rangeStart, rangeEnd);
const requiredShiftsByStaff = calculateRequiredShiftsByStaff(data, rangeStart, rangeEnd);
```

Then call:

```ts
...summarizeMonthlyStaff(
  staff,
  rangeEntries.filter((entry) => entry.staffId === staff.id),
  shiftMap,
  requiredShiftsByStaff.get(staff.id) ?? 0
),
```

- [ ] **Step 5: Verify calculation tests pass**

Run:

```bash
npm run test -- src/lib/calculation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit calculation changes**

```bash
git add src/types/domain.ts src/lib/calculation.ts src/lib/calculation.test.ts
git commit -m "Add attendance balance calculations"
```

---

### Task 2: Bonus, Range Trial, App Data Normalization

**Files:**
- Modify: `src/types/domain.ts`
- Modify: `src/lib/bonus.ts`
- Modify: `src/lib/range-bonus.ts`
- Modify: `server/app-data.ts`
- Test: `src/lib/bonus.test.ts`
- Test: `src/lib/range-bonus.test.ts`
- Test: `server/app-data.test.ts`

- [ ] **Step 1: Write failing bonus tests**

Update `baseSummary` rows in `src/lib/bonus.test.ts` to include:

```ts
requiredShifts: 21,
attendanceBalance: -11,
```

with row-specific values:

```ts
{
  staffId: "staff-nurse",
  staffName: "李护士",
  staffJobId: "100001",
  staffType: "nurse",
  attendanceShifts: 12,
  requiredShifts: 21,
  attendanceBalance: -9,
  overtimeShifts: 2,
  coefficientTotal: 10,
  coefficientExcludedReason: ""
}
```

Add a test:

```ts
it("copies required shifts and attendance balance into allocation rows", () => {
  const allocation = calculateBonusAllocation(baseSummary, 1500);
  const nurse = allocation.rows.find((row) => row.staffId === "staff-nurse");

  expect(nurse).toMatchObject({
    requiredShifts: 21,
    attendanceBalance: -9
  });
});
```

Update the `createMonthlySettlement` expected rows to include `requiredShifts` and `attendanceBalance`.

- [ ] **Step 2: Write failing range bonus tests**

In `src/lib/range-bonus.test.ts`, update settlement fixture rows:

```ts
attendanceShifts: 4,
requiredShifts: 5,
attendanceBalance: -1,
overtimeShifts: 1,
```

Update the combined range test:

```ts
expect(nurse?.attendanceShifts).toBe(5);
expect(nurse?.requiredShifts).toBe(28);
expect(nurse?.attendanceBalance).toBe(-23);
expect(nurse?.overtimeShifts).toBe(1);
```

The expected `requiredShifts` combines June settlement snapshot `5` plus July live required shifts `23`.

- [ ] **Step 3: Write failing app-data normalization tests**

In `server/app-data.test.ts`, add a case for old monthly settlement rows:

```ts
it("normalizes monthly settlement rows missing required shifts and attendance balance", () => {
  const candidate = {
    ...validAppData,
    monthlySettlements: [
      {
        id: "settlement-2026-06",
        month: "2026-06",
        monthStart: "2026-06-01",
        monthEnd: "2026-06-30",
        totalDays: 30,
        bonusPool: 1000,
        coefficientTotal: 1,
        settledAt: "2026-06-30T10:00:00.000Z",
        rows: [
          {
            staffId: "staff-nurse",
            staffName: "李护士",
            staffJobId: "100001",
            staffType: "nurse",
            attendanceShifts: 4,
            overtimeShifts: 1,
            coefficientTotal: 1,
            coefficientExcludedReason: "",
            bonusAmount: 1000,
            bonusExcludedReason: ""
          }
        ]
      }
    ]
  };

  const normalized = normalizeAppData(candidate);

  expect(normalized.changed).toBe(true);
  expect(normalized.data).toMatchObject({
    monthlySettlements: [
      {
        rows: [
          {
            requiredShifts: 0,
            attendanceBalance: 0
          }
        ]
      }
    ]
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run:

```bash
npm run test -- src/lib/bonus.test.ts src/lib/range-bonus.test.ts server/app-data.test.ts
```

Expected: FAIL because settlement row models and normalization do not include new fields.

- [ ] **Step 5: Extend settlement row type**

In `src/types/domain.ts`, update `MonthlySettlementRow`:

```ts
export interface MonthlySettlementRow {
  staffId: string;
  staffName: string;
  staffJobId: string;
  staffType: StaffType;
  attendanceShifts: number;
  requiredShifts: number;
  attendanceBalance: number;
  overtimeShifts: number;
  coefficientTotal: number | null;
  coefficientExcludedReason: string;
  bonusAmount: number;
  bonusExcludedReason: string;
}
```

- [ ] **Step 6: Copy fields in bonus rows**

In `src/lib/bonus.ts`, update `createSettlementRow`:

```ts
requiredShifts: row.requiredShifts,
attendanceBalance: row.attendanceBalance,
```

- [ ] **Step 7: Merge fields in range bonus**

In `src/lib/range-bonus.ts`, update `addRows`:

```ts
existing.attendanceShifts += row.attendanceShifts;
existing.requiredShifts += row.requiredShifts;
existing.attendanceBalance += row.attendanceBalance;
existing.overtimeShifts += row.overtimeShifts;
```

Update `settlementRowsToSummaryRows`:

```ts
requiredShifts: row.requiredShifts,
attendanceBalance: row.attendanceBalance,
```

- [ ] **Step 8: Normalize old settlement rows**

In `server/app-data.ts`, update `isMonthlySettlementRow`:

```ts
isNumber(value.requiredShifts) &&
isNumber(value.attendanceBalance) &&
```

Update `normalizeMonthlySettlementRow` candidate:

```ts
const candidate = {
  ...row,
  staffJobId: "staffJobId" in row ? row.staffJobId : "",
  requiredShifts: "requiredShifts" in row ? row.requiredShifts : 0,
  attendanceBalance: "attendanceBalance" in row ? row.attendanceBalance : 0,
  overtimeShifts: "overtimeShifts" in row ? row.overtimeShifts : 0
};
```

- [ ] **Step 9: Verify tests pass**

Run:

```bash
npm run test -- src/lib/bonus.test.ts src/lib/range-bonus.test.ts server/app-data.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit bonus and normalization changes**

```bash
git add src/types/domain.ts src/lib/bonus.ts src/lib/range-bonus.ts server/app-data.ts src/lib/bonus.test.ts src/lib/range-bonus.test.ts server/app-data.test.ts
git commit -m "Carry attendance balance into settlement rows"
```

---

### Task 3: SQLite Schema And Mapper

**Files:**
- Modify: `server/sqlite/schema.ts`
- Modify: `server/sqlite/mapper.ts`
- Test: `server/sqlite-storage.test.ts`

- [ ] **Step 1: Write failing SQLite tests**

In `server/sqlite-storage.test.ts`, add assertions to the schema/table test:

```ts
const monthlySettlementColumns = db
  .prepare("pragma table_info(monthly_settlement_rows)")
  .all() as Array<{ name: string }>;
expect(monthlySettlementColumns.map((column) => column.name)).toEqual(
  expect.arrayContaining(["required_shifts", "attendance_balance"])
);
```

Add a round-trip assertion where a settlement row is written:

```ts
expect(readBack.monthlySettlements[0].rows[0]).toMatchObject({
  requiredShifts: 21,
  attendanceBalance: -3
});
```

Add a migration-style test using an old table:

```ts
it("adds attendance balance columns to an existing monthly settlement rows table", () => {
  const db = new Database(":memory:");
  db.exec(`
    create table monthly_settlement_rows (
      settlement_id text not null,
      position integer not null,
      staff_id text not null,
      staff_name text not null,
      staff_job_id text not null,
      staff_type text not null,
      attendance_shifts integer not null,
      overtime_shifts integer not null,
      coefficient_total real,
      coefficient_excluded_reason text not null,
      bonus_amount real not null,
      bonus_excluded_reason text not null,
      primary key(settlement_id, position)
    );
  `);

  initializeSqliteSchema(db);

  const columns = db.prepare("pragma table_info(monthly_settlement_rows)").all() as Array<{ name: string }>;
  expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining(["required_shifts", "attendance_balance"]));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- server/sqlite-storage.test.ts
```

Expected: FAIL because the SQLite table and mapper do not include the new fields.

- [ ] **Step 3: Add schema migration**

In `server/sqlite/schema.ts`, increment:

```ts
export const SQLITE_SCHEMA_VERSION = 5;
```

Add helper:

```ts
function ensureMonthlySettlementRowsSummarySchema(db: Database.Database): void {
  if (!tableHasColumn(db, "monthly_settlement_rows", "required_shifts")) {
    db.prepare("alter table monthly_settlement_rows add column required_shifts integer not null default 0").run();
  }

  if (!tableHasColumn(db, "monthly_settlement_rows", "attendance_balance")) {
    db.prepare("alter table monthly_settlement_rows add column attendance_balance integer not null default 0").run();
  }
}
```

Add fields to the `create table if not exists monthly_settlement_rows` block:

```sql
required_shifts integer not null default 0,
attendance_balance integer not null default 0,
```

Call the helper after table creation:

```ts
ensureMonthlySettlementRowsSummarySchema(db);
ensureUsersStaffBindingSchema(db);
```

- [ ] **Step 4: Update mapper write path**

In `server/sqlite/mapper.ts`, update `insertSettlementRow` SQL:

```sql
settlement_id, position, staff_id, staff_name, staff_job_id, staff_type, attendance_shifts, required_shifts,
attendance_balance, overtime_shifts, coefficient_total, coefficient_excluded_reason, bonus_amount, bonus_excluded_reason
) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

Update `.run(...)` arguments:

```ts
row.attendanceShifts,
row.requiredShifts,
row.attendanceBalance,
row.overtimeShifts,
```

- [ ] **Step 5: Update mapper read path**

In `MonthlySettlementDataRow`, add:

```ts
required_shifts: number;
attendance_balance: number;
```

Update the select:

```sql
attendance_shifts,
required_shifts,
attendance_balance,
overtime_shifts,
```

Update row mapping:

```ts
requiredShifts: settlementRow.required_shifts,
attendanceBalance: settlementRow.attendance_balance,
```

- [ ] **Step 6: Verify SQLite tests pass**

Run:

```bash
npm run test -- server/sqlite-storage.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit SQLite changes**

```bash
git add server/sqlite/schema.ts server/sqlite/mapper.ts server/sqlite-storage.test.ts
git commit -m "Persist settlement attendance balance"
```

---

### Task 4: Settlement Pre-Check Helper And App Flow

**Files:**
- Create: `src/lib/settlement-checks.ts`
- Test: `src/lib/settlement-checks.test.ts`
- Modify: `src/App.vue`
- Test: `src/App.test.ts`

- [ ] **Step 1: Write failing settlement-check helper tests**

Create `src/lib/settlement-checks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AppData, MonthlySummary } from "@/types/domain";
import { calculateSettlementChecks } from "./settlement-checks";

const data: AppData = {
  staff: [
    { id: "staff-a", jobId: "100001", name: "李护士", type: "nurse", isAdmin: false, enabled: true, sortOrder: 1 },
    { id: "staff-b", jobId: "100002", name: "王护士", type: "nurse", isAdmin: false, enabled: true, sortOrder: 2 },
    { id: "staff-disabled", jobId: "100003", name: "停用护士", type: "nurse", isAdmin: false, enabled: false, sortOrder: 3 }
  ],
  shifts: [
    { id: "shift-day", name: "白班", shortName: "白", color: "#2563eb", countsAttendance: true, coefficient: 1, enabled: true, sortOrder: 1 },
    { id: "shift-disabled", name: "停用班", shortName: "停", color: "#64748b", countsAttendance: true, coefficient: 1, enabled: false, sortOrder: 2 }
  ],
  holidays: [],
  scheduleEntries: [
    { id: "e1", date: "2026-06-01", staffId: "staff-a", shiftIds: ["shift-day", "shift-disabled"], note: "" },
    { id: "e2", date: "2026-06-02", staffId: "staff-disabled", shiftIds: ["shift-day"], note: "" }
  ],
  monthlySettlements: [],
  settings: { defaultRequiredShiftsPerWeek: 5, version: 1 }
};

const summary: MonthlySummary = {
  monthStart: "2026-06-01",
  monthEnd: "2026-06-30",
  totalDays: 30,
  holidayNames: [],
  rows: [
    { staffId: "staff-a", staffName: "李护士", staffJobId: "100001", staffType: "nurse", attendanceShifts: 1, requiredShifts: 21, attendanceBalance: -20, overtimeShifts: 0, coefficientTotal: 1, coefficientExcludedReason: "" },
    { staffId: "staff-b", staffName: "王护士", staffJobId: "100002", staffType: "nurse", attendanceShifts: 0, requiredShifts: 21, attendanceBalance: -21, overtimeShifts: 0, coefficientTotal: 0, coefficientExcludedReason: "" }
  ]
};

describe("calculateSettlementChecks", () => {
  it("reports non-blocking month-end data checks", () => {
    const checks = calculateSettlementChecks(data, summary);

    expect(checks.map((check) => check.type)).toEqual([
      "no-attendance",
      "attendance-deficit",
      "attendance-deficit",
      "double-shift",
      "disabled-shift",
      "disabled-staff-with-schedule"
    ]);
    expect(checks[0].message).toContain("王护士");
  });
});
```

- [ ] **Step 2: Run helper test to verify it fails**

Run:

```bash
npm run test -- src/lib/settlement-checks.test.ts
```

Expected: FAIL because `settlement-checks.ts` does not exist.

- [ ] **Step 3: Implement settlement-check helper**

Create `src/lib/settlement-checks.ts`:

```ts
import type { AppData, MonthlySummary } from "@/types/domain";

export type SettlementCheckType =
  | "no-attendance"
  | "attendance-deficit"
  | "double-shift"
  | "disabled-shift"
  | "disabled-staff-with-schedule";

export interface SettlementCheckItem {
  type: SettlementCheckType;
  message: string;
  staffId?: string;
  date?: string;
  shiftIds?: string[];
}

function isWithinRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

export function calculateSettlementChecks(data: AppData, summary: MonthlySummary): SettlementCheckItem[] {
  const checks: SettlementCheckItem[] = [];
  const rowsByStaffId = new Map(summary.rows.map((row) => [row.staffId, row]));
  const shiftById = new Map(data.shifts.map((shift) => [shift.id, shift]));
  const staffById = new Map(data.staff.map((staff) => [staff.id, staff]));
  const rangeEntries = data.scheduleEntries.filter((entry) =>
    isWithinRange(entry.date, summary.monthStart, summary.monthEnd)
  );
  const attendanceByStaffId = new Map<string, number>();

  for (const entry of rangeEntries) {
    let attendanceCount = 0;
    for (const shiftId of entry.shiftIds) {
      const shift = shiftById.get(shiftId);
      if (shift?.enabled && shift.countsAttendance) {
        attendanceCount += 1;
      }
      if (shift && !shift.enabled) {
        checks.push({
          type: "disabled-shift",
          staffId: entry.staffId,
          date: entry.date,
          shiftIds: [shiftId],
          message: `${staffById.get(entry.staffId)?.name ?? entry.staffId} 在 ${entry.date} 引用了已停用班次 ${shift.shortName}`
        });
      }
    }

    attendanceByStaffId.set(entry.staffId, (attendanceByStaffId.get(entry.staffId) ?? 0) + attendanceCount);

    if (entry.shiftIds.length >= 2) {
      checks.push({
        type: "double-shift",
        staffId: entry.staffId,
        date: entry.date,
        shiftIds: entry.shiftIds,
        message: `${staffById.get(entry.staffId)?.name ?? entry.staffId} 在 ${entry.date} 排了 ${entry.shiftIds.length} 个班次`
      });
    }

    const staff = staffById.get(entry.staffId);
    if (staff && !staff.enabled) {
      checks.push({
        type: "disabled-staff-with-schedule",
        staffId: entry.staffId,
        date: entry.date,
        shiftIds: entry.shiftIds,
        message: `停用人员 ${staff.name} 在 ${entry.date} 仍有排班`
      });
    }
  }

  for (const staff of data.staff.filter((item) => item.enabled)) {
    if ((attendanceByStaffId.get(staff.id) ?? 0) === 0) {
      checks.push({
        type: "no-attendance",
        staffId: staff.id,
        message: `${staff.name} 本月没有计出勤班次`
      });
    }
  }

  for (const row of summary.rows) {
    if (row.attendanceBalance < 0) {
      checks.push({
        type: "attendance-deficit",
        staffId: row.staffId,
        message: `${row.staffName} 出勤不足 ${Math.abs(row.attendanceBalance)} 个班次`
      });
    }
  }

  return checks.sort((left, right) => {
    const order: Record<SettlementCheckType, number> = {
      "no-attendance": 1,
      "attendance-deficit": 2,
      "double-shift": 3,
      "disabled-shift": 4,
      "disabled-staff-with-schedule": 5
    };
    return order[left.type] - order[right.type];
  });
}
```

- [ ] **Step 4: Verify helper test passes**

Run:

```bash
npm run test -- src/lib/settlement-checks.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing App settlement warning tests**

In `src/App.test.ts`, add a test near settlement confirmation tests. Mock `ElMessageBox.confirm` so the first call is the check warning and the second call is the existing final confirmation:

```ts
it("shows data check warnings before confirming monthly settlement", async () => {
  apiMocks.saveMonthlySettlement.mockResolvedValue({ ...testData, monthlySettlements: [] });
  messageBoxConfirm.mockResolvedValue(undefined);
  const wrapper = await mountApp({
    data: {
      ...testData,
      scheduleEntries: [
        { id: "double", date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1", "shift-p1"], note: "" }
      ]
    }
  });

  await wrapper.get('[data-testid="confirm-settlement"]').trigger("click");
  await flushPromises();

  expect(messageBoxConfirm).toHaveBeenCalledTimes(2);
  expect(messageBoxConfirm.mock.calls[0][1]).toBe("月结前数据检查");
  expect(apiMocks.saveMonthlySettlement).toHaveBeenCalledWith("2026-06", 1000);
});

it("does not save monthly settlement when data check warning is canceled", async () => {
  messageBoxConfirm.mockRejectedValueOnce(new Error("cancel"));
  const wrapper = await mountApp({
    data: {
      ...testData,
      scheduleEntries: [
        { id: "double", date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1", "shift-p1"], note: "" }
      ]
    }
  });

  await wrapper.get('[data-testid="confirm-settlement"]').trigger("click");
  await flushPromises();

  expect(apiMocks.saveMonthlySettlement).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Run App tests to verify they fail**

Run:

```bash
npm run test -- src/App.test.ts -t "data check"
```

Expected: FAIL because `App.vue` does not run settlement checks.

- [ ] **Step 7: Wire checks into App settlement flow**

In `src/App.vue`, import:

```ts
import { calculateSettlementChecks } from "@/lib/settlement-checks";
```

Add formatter near settlement handlers:

```ts
function formatSettlementCheckMessage(): string {
  if (!data.value || !monthlySummary.value) {
    return "";
  }

  const checks = calculateSettlementChecks(data.value, monthlySummary.value);
  if (checks.length === 0) {
    return "";
  }

  const previewLines = checks.slice(0, 8).map((check) => `· ${check.message}`);
  const tailText = checks.length > previewLines.length ? `\n另有 ${checks.length - previewLines.length} 条检查项未显示。` : "";

  return [`发现 ${checks.length} 条需要核对的信息：`, ...previewLines].join("\n") + tailText;
}
```

In `handleConfirmSettlement`, before the existing final confirmation, add:

```ts
const checkMessage = formatSettlementCheckMessage();
if (checkMessage) {
  try {
    await ElMessageBox.confirm(checkMessage, "月结前数据检查", {
      cancelButtonText: "返回核对",
      confirmButtonText: "继续月结",
      type: "warning"
    });
  } catch {
    settlementSaving.value = false;
    return;
  }
}
```

- [ ] **Step 8: Verify helper and App tests pass**

Run:

```bash
npm run test -- src/lib/settlement-checks.test.ts src/App.test.ts -t "settlement|data check|monthly settlement"
```

Expected: PASS. If `-t` filtering misses tests because of shell pattern behavior, run:

```bash
npm run test -- src/lib/settlement-checks.test.ts src/App.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit settlement check changes**

```bash
git add src/lib/settlement-checks.ts src/lib/settlement-checks.test.ts src/App.vue src/App.test.ts
git commit -m "Warn before settling suspicious monthly data"
```

---

### Task 5: UI And Print Display

**Files:**
- Modify: `src/components/WeeklySummary.vue`
- Modify: `src/components/BonusSettlementPanel.vue`
- Modify: `src/components/PrintViews.vue`
- Test: `src/components/WeeklySummary.test.ts`
- Test: `src/components/BonusSettlementPanel.test.ts`
- Test: `src/components/PrintViews.test.ts`

- [ ] **Step 1: Write failing component tests**

In `src/components/WeeklySummary.test.ts`, add `attendanceBalance` to fixture rows and assert:

```ts
expect(wrapper.text()).toContain("出勤盈亏");
expect(wrapper.text()).toContain("+1");
expect(wrapper.text()).toContain("盈亏 +1");
```

In `src/components/BonusSettlementPanel.test.ts`, add `requiredShifts` and `attendanceBalance` to summary and settlement fixtures, then assert:

```ts
expect(wrapper.text()).toContain("满勤标准");
expect(wrapper.text()).toContain("出勤盈亏");
expect(wrapper.text()).toContain("-3");
```

In `src/components/PrintViews.test.ts`, add the new fields to summary/monthly/settlement fixtures and assert:

```ts
expect(wrapper.text()).toContain("出勤盈亏");
expect(wrapper.text()).toContain("满勤标准");
```

- [ ] **Step 2: Run component tests to verify they fail**

Run:

```bash
npm run test -- src/components/WeeklySummary.test.ts src/components/BonusSettlementPanel.test.ts src/components/PrintViews.test.ts
```

Expected: FAIL because tables do not render the new columns.

- [ ] **Step 3: Add shared signed-number formatters**

In `WeeklySummary.vue`, add:

```ts
function formatSignedCount(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
```

In `BonusSettlementPanel.vue` and `PrintViews.vue`, add the same function unless a local formatter already exists.

- [ ] **Step 4: Update WeeklySummary desktop and mobile markup**

In `WeeklySummary.vue`, add header and row cell:

```vue
<th>出勤盈亏</th>
```

```vue
<td data-label="出勤盈亏">{{ formatSignedCount(row.attendanceBalance) }}</td>
```

Update compact metrics:

```vue
<span>盈亏 {{ formatSignedCount(row.attendanceBalance) }}</span>
```

- [ ] **Step 5: Update BonusSettlementPanel table**

In `BonusSettlementPanel.vue`, update `createZeroBonusRows`:

```ts
requiredShifts: row.requiredShifts,
attendanceBalance: row.attendanceBalance,
```

Update table header:

```vue
<th>满勤标准</th>
<th>出勤盈亏</th>
```

Update row cells:

```vue
<td data-label="满勤标准">{{ row.requiredShifts }}</td>
<td data-label="出勤盈亏">{{ formatSignedCount(row.attendanceBalance) }}</td>
```

Increase table width slightly:

```css
.bonus-table {
  min-width: 860px;
}
```

- [ ] **Step 6: Update PrintViews tables**

In `PrintViews.vue`, add monthly summary headers:

```vue
<th>满勤标准</th>
<th>出勤盈亏</th>
```

Add monthly row cells:

```vue
<td>{{ row.requiredShifts }}</td>
<td>{{ formatSignedCount(row.attendanceBalance) }}</td>
```

Add bonus snapshot headers and cells with the same two fields.

Add weekly summary header:

```vue
<th>出勤盈亏</th>
```

Add weekly row cell:

```vue
<td>{{ formatSignedCount(row.attendanceBalance) }}</td>
```

Do not add borders around printed shift text. Existing `.print-shift-chip` style should continue using colored text only.

- [ ] **Step 7: Verify component tests pass**

Run:

```bash
npm run test -- src/components/WeeklySummary.test.ts src/components/BonusSettlementPanel.test.ts src/components/PrintViews.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit UI and print display changes**

```bash
git add src/components/WeeklySummary.vue src/components/BonusSettlementPanel.vue src/components/PrintViews.vue src/components/WeeklySummary.test.ts src/components/BonusSettlementPanel.test.ts src/components/PrintViews.test.ts
git commit -m "Display attendance balance in summaries"
```

---

### Task 6: Full Verification And Documentation Status

**Files:**
- Modify: `docs/功能跟进清单.md`

- [ ] **Step 1: Update the feature tracking checklist**

In `docs/功能跟进清单.md`, update:

- Move “出勤盈亏展示” from partially complete to completed.
- Add a completed bullet under monthly settlement indicating month-end data checks warn before settlement.
- Remove “出勤盈亏统计列” and “月结前数据检查” from P1 pending list.

Use wording:

```md
- 支持周统计、月度汇总、月结快照、奖金试算和打印中的出勤盈亏展示。
- 支持确认月结前进行数据检查，提示未排班、出勤不足、异常双班、停用班次引用和停用人员排班；检查结果仅提醒，不阻止用户继续月结。
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
npm run test -- src/lib/calculation.test.ts src/lib/bonus.test.ts src/lib/range-bonus.test.ts src/lib/settlement-checks.test.ts src/components/WeeklySummary.test.ts src/components/BonusSettlementPanel.test.ts src/components/PrintViews.test.ts src/App.test.ts server/app-data.test.ts server/sqlite-storage.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run typecheck/build verification**

Run:

```bash
npm run build
```

Expected: PASS. Vite may still print existing chunk-size warnings; those warnings are acceptable if the build exits successfully.

- [ ] **Step 4: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 6: Commit docs and final verification changes**

```bash
git add docs/功能跟进清单.md
git commit -m "Document attendance balance settlement checks"
```

- [ ] **Step 7: Final status check**

Run:

```bash
git status --short
```

Expected: no output.

Record the final commit list and verification commands in the implementation summary.

---

## Self-Review Notes

- Spec coverage:
  - Weekly attendance balance: Task 1 and Task 5.
  - Monthly required shifts and balance: Task 1, Task 2, Task 5.
  - Monthly settlement snapshots and SQLite persistence: Task 2 and Task 3.
  - Range bonus trial accumulation: Task 2.
  - Month-end data checks: Task 4.
  - Print/PDF summary fields: Task 5.
  - Documentation status update: Task 6.

- Scope boundary:
  - This plan does not implement班次分类、护士长绩效算法、岗位系数、奖金导出、自动汇总、批量排班 or personal visibility rules.

- Type consistency:
  - Uses `requiredShifts` and `attendanceBalance` in TypeScript domain models.
  - Uses `required_shifts` and `attendance_balance` only in SQLite schema/mapper.
