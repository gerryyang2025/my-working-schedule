# Schedule Import Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a left-side `导入` tab that imports one week of historical schedule data from pasted text after strict validation and preview confirmation.

**Architecture:** Put parsing, matching, validation, and apply logic in a shared TypeScript helper so the frontend preview and backend confirmation use the same rules. Add one backend import endpoint that revalidates before writing and never overwrites existing schedule entries. Add a focused Vue panel for the three-step import flow, then wire it into `App.vue` behind schedule-edit permission.

**Tech Stack:** Vue 3, TypeScript, Element Plus message APIs, Express routes, existing SQLite-backed storage adapter, Vitest, Vue Test Utils, Supertest.

## Global Constraints

- No implementation starts until this plan is approved.
- No new npm dependencies.
- Import page is a left-side `导入` tab placed after `查询`.
- Import text must include the period line and table together.
- The import page does not provide a date picker; the period is parsed from pasted text.
- Staff matching uses exact enabled staff name matching only.
- Imported text does not include job ID; job ID is derived from the matched staff record.
- Shift matching uses enabled shift `name` or `shortName`, then controlled aliases.
- Controlled aliases for the first version: `常班 -> 常`, `办公班 -> 办公`, `备班1 -> 备1`.
- `/` is a normal shift value and must resolve to an enabled `/` shift.
- Whole-batch validation: any blocking error prevents import.
- Existing schedule entries are skipped and never overwritten.
- Dates in settled months block the entire import.
- Preview is required before confirmation.
- Users without schedule edit permission cannot see the tab and cannot call the API successfully.

---

## File Structure

- Create `src/lib/schedule-import.ts`: shared parser, validator, preview model, and apply function.
- Create `src/lib/schedule-import.test.ts`: unit tests for period parsing, staff matching, shift matching, existing-data skipping, settled-month blocking, and no-op preview.
- Modify `server/routes.ts`: add payload parser and `POST /api/data/schedule-import`.
- Modify `server/routes.test.ts`: API tests for import success, validation failure, permission failure, and audit log.
- Modify `src/api/client.ts`: add request/response types and `importScheduleText()`.
- Create `src/components/ScheduleImportPanel.vue`: render format guide, textarea, validation result, preview table, and confirm action.
- Create `src/components/ScheduleImportPanel.test.ts`: component tests for validation, preview, disabled no-op, and confirm event.
- Modify `src/App.vue`: add `导入` tab, permission filtering, saving state, and API handler.
- Modify `src/App.test.ts`: integration tests for tab visibility and successful import flow.
- Modify `src/styles/main.css`: add import panel, preview table, and mobile-friendly styles.

---

### Task 1: Shared Import Parser And Validator

**Files:**
- Create: `src/lib/schedule-import.ts`
- Create: `src/lib/schedule-import.test.ts`

**Interfaces:**
- Consumes: `AppData`, `StaffMember`, `StaffType`, `Shift`, `ScheduleEntry` from `src/types/domain.ts`; `CalendarDay`, `getScheduleWeekNumber`, `listDateKeys`, `parseDateKey`, `toDateKey` from `src/lib/date.ts`.
- Produces:
  - `DEFAULT_SCHEDULE_IMPORT_ALIASES: Record<string, string>`
  - `ScheduleImportValidationResult`
  - `ScheduleImportPreview`
  - `validateScheduleImportText(input: ScheduleImportValidationInput): ScheduleImportValidationResult`
  - `applyScheduleImportPreview(data: AppData, preview: ScheduleImportPreview): ScheduleImportApplyResult`

- [ ] **Step 1: Write failing parser and validation tests**

Create `src/lib/schedule-import.test.ts` with these test fixtures and assertions:

```ts
import { describe, expect, it } from "vitest";
import type { AppData } from "@/types/domain";
import {
  applyScheduleImportPreview,
  validateScheduleImportText,
  type ScheduleImportPreview
} from "./schedule-import";

function baseData(overrides: Partial<AppData> = {}): AppData {
  return {
    staff: [
      { id: "staff-head", jobId: "000228", name: "段鸿露", type: "head_nurse", isAdmin: true, enabled: true, sortOrder: 1 },
      { id: "staff-nurse", jobId: "001351", name: "张曼曼", type: "nurse", isAdmin: false, enabled: true, sortOrder: 2 },
      { id: "staff-disabled", jobId: "009999", name: "停用人员", type: "nurse", isAdmin: false, enabled: false, sortOrder: 3 }
    ],
    shifts: [
      { id: "shift-normal", name: "常", shortName: "常", color: "#16a34a", countsAttendance: true, coefficient: 1, enabled: true, sortOrder: 1 },
      { id: "shift-rest", name: "休息", shortName: "休", color: "#64748b", countsAttendance: false, coefficient: 0, enabled: true, sortOrder: 2 },
      { id: "shift-n1", name: "N1", shortName: "N1", color: "#dc2626", countsAttendance: true, coefficient: 1.3, enabled: true, sortOrder: 3 },
      { id: "shift-p3", name: "P3", shortName: "P3", color: "#0f766e", countsAttendance: true, coefficient: 1.2, enabled: true, sortOrder: 4 },
      { id: "shift-a4", name: "A4", shortName: "A4", color: "#2563eb", countsAttendance: true, coefficient: 1.2, enabled: true, sortOrder: 5 },
      { id: "shift-slash", name: "/", shortName: "/", color: "#6b7280", countsAttendance: false, coefficient: 0, enabled: true, sortOrder: 6 }
    ],
    holidays: [],
    scheduleEntries: [],
    monthlySettlements: [],
    settings: { defaultRequiredShiftsPerWeek: 5, version: 1 },
    ...overrides
  };
}

const validText = `当前排班周期为2026年7月20日（周一）至 7月26日（周日）：

姓名\t周一(7/20)\t周二(7/21)\t周三(7/22)\t周四(7/23)\t周五(7/24)\t周六(7/25)\t周日(7/26)
段鸿露\t常班\t常班\t常班\t常班\t常班\t休\t休
张曼曼\tN1\t/\t休\tP3\tA4\tA4\tN1`;

function expectPreview(result: ReturnType<typeof validateScheduleImportText>): ScheduleImportPreview {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected import preview");
  }
  return result;
}

describe("validateScheduleImportText", () => {
  it("parses the standard weekly import text and resolves staff, job IDs, shifts, and aliases", () => {
    const preview = expectPreview(validateScheduleImportText({ rawText: validText, data: baseData() }));

    expect(preview.period).toMatchObject({
      start: "2026-07-20",
      end: "2026-07-26",
      weekNumber: 30
    });
    expect(preview.rows).toHaveLength(2);
    expect(preview.rows[0]).toMatchObject({
      staffId: "staff-head",
      staffName: "段鸿露",
      staffJobId: "000228",
      staffType: "head_nurse"
    });
    expect(preview.rows[0].cells[0]).toMatchObject({
      date: "2026-07-20",
      rawValue: "常班",
      shiftId: "shift-normal",
      resolvedBy: "alias",
      aliasTarget: "常",
      status: "import"
    });
    expect(preview.rows[1].cells[1]).toMatchObject({
      rawValue: "/",
      shiftId: "shift-slash",
      resolvedBy: "exact-name",
      status: "import"
    });
    expect(preview.summary).toEqual({
      staffCount: 2,
      importableCells: 14,
      skippedExistingCells: 0,
      aliasMappedCells: 5
    });
  });

  it("rejects malformed or inconsistent period and header data", () => {
    const text = validText.replace("2026年7月20日（周一）", "2026年7月21日（周一）");
    const result = validateScheduleImportText({ rawText: text, data: baseData() });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.message)).toContain("周期开始日期与星期不一致：2026-07-21 不是周一");
    }
  });

  it("rejects unknown, disabled, duplicated imported, and ambiguous system staff names", () => {
    const unknown = validateScheduleImportText({
      rawText: validText.replace("张曼曼", "不存在"),
      data: baseData()
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.errors.map((error) => error.message)).toContain("第4行人员不存在或未启用：不存在");
    }

    const duplicatedImport = validateScheduleImportText({
      rawText: `${validText}\n张曼曼\tN1\t/\t休\tP3\tA4\tA4\tN1`,
      data: baseData()
    });
    expect(duplicatedImport.ok).toBe(false);
    if (!duplicatedImport.ok) {
      expect(duplicatedImport.errors.map((error) => error.message)).toContain("导入数据中人员重复：张曼曼");
    }

    const ambiguousSystem = validateScheduleImportText({
      rawText: validText,
      data: baseData({
        staff: [
          ...baseData().staff,
          { id: "staff-duplicate", jobId: "008888", name: "张曼曼", type: "nurse", isAdmin: false, enabled: true, sortOrder: 4 }
        ]
      })
    });
    expect(ambiguousSystem.ok).toBe(false);
    if (!ambiguousSystem.ok) {
      expect(ambiguousSystem.errors.map((error) => error.message)).toContain("系统中存在重复启用人员姓名：张曼曼");
    }
  });

  it("rejects unknown shift values and treats empty cells as errors", () => {
    const unknown = validateScheduleImportText({
      rawText: validText.replace("P3", "未知班次"),
      data: baseData()
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.errors.map((error) => error.message)).toContain("第4行 周四(7/23) 班次不存在或未启用：未知班次");
    }

    const emptyCell = validateScheduleImportText({
      rawText: validText.replace("张曼曼\tN1", "张曼曼\t"),
      data: baseData()
    });
    expect(emptyCell.ok).toBe(false);
    if (!emptyCell.ok) {
      expect(emptyCell.errors.map((error) => error.message)).toContain("第4行 周一(7/20) 班次不能为空");
    }
  });

  it("marks existing entries as skipped and reports no-op previews", () => {
    const oneExisting = validateScheduleImportText({
      rawText: validText,
      data: baseData({
        scheduleEntries: [
          { id: "2026-07-20__staff-head", date: "2026-07-20", staffId: "staff-head", shiftIds: ["shift-rest"], note: "" }
        ]
      })
    });
    const preview = expectPreview(oneExisting);
    expect(preview.rows[0].cells[0]).toMatchObject({ status: "skip-existing", existingShiftIds: ["shift-rest"] });
    expect(preview.summary.importableCells).toBe(13);
    expect(preview.summary.skippedExistingCells).toBe(1);

    const entries = preview.rows.flatMap((row) =>
      row.cells.map((cell) => ({
        id: `${cell.date}__${row.staffId}`,
        date: cell.date,
        staffId: row.staffId,
        shiftIds: [cell.shiftId],
        note: ""
      }))
    );
    const noOp = expectPreview(validateScheduleImportText({ rawText: validText, data: baseData({ scheduleEntries: entries }) }));
    expect(noOp.summary.importableCells).toBe(0);
    expect(noOp.noImportableCells).toBe(true);
  });

  it("rejects imports into settled months", () => {
    const result = validateScheduleImportText({
      rawText: validText,
      data: baseData({
        monthlySettlements: [
          {
            id: "settlement-2026-07",
            month: "2026-07",
            monthStart: "2026-07-01",
            monthEnd: "2026-07-31",
            totalDays: 31,
            bonusPool: 0,
            coefficientTotal: 0,
            settledAt: "2026-08-01T00:00:00.000Z",
            rows: []
          }
        ]
      })
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.message)).toContain("2026-07 已月结，不能导入排班");
    }
  });
});

describe("applyScheduleImportPreview", () => {
  it("adds only importable entries and preserves skipped existing entries", () => {
    const data = baseData({
      scheduleEntries: [
        { id: "2026-07-20__staff-head", date: "2026-07-20", staffId: "staff-head", shiftIds: ["shift-rest"], note: "" }
      ]
    });
    const preview = expectPreview(validateScheduleImportText({ rawText: validText, data }));

    const result = applyScheduleImportPreview(data, preview);

    expect(result.imported).toBe(13);
    expect(result.skipped).toBe(1);
    expect(result.data.scheduleEntries).toEqual(
      expect.arrayContaining([
        { id: "2026-07-20__staff-head", date: "2026-07-20", staffId: "staff-head", shiftIds: ["shift-rest"], note: "" },
        { id: "2026-07-21__staff-head", date: "2026-07-21", staffId: "staff-head", shiftIds: ["shift-normal"], note: "" },
        { id: "2026-07-21__staff-nurse", date: "2026-07-21", staffId: "staff-nurse", shiftIds: ["shift-slash"], note: "" }
      ])
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/schedule-import.test.ts`

Expected: FAIL with an import error for `./schedule-import`.

- [ ] **Step 3: Implement shared types, parser, validator, and apply function**

Create `src/lib/schedule-import.ts` with these exports and behavior:

```ts
import type { AppData, ScheduleEntry, Shift, StaffMember, StaffType } from "@/types/domain";
import type { CalendarDay } from "./date";
import { getScheduleWeekNumber, listDateKeys, parseDateKey, toDateKey } from "./date";

export const DEFAULT_SCHEDULE_IMPORT_ALIASES: Record<string, string> = {
  "常班": "常",
  "办公班": "办公",
  "备班1": "备1"
};

export type ScheduleImportErrorScope = "period" | "header" | "row" | "cell";
export type ScheduleImportResolveMode = "exact-name" | "exact-short-name" | "alias";
export type ScheduleImportCellStatus = "import" | "skip-existing";

export interface ScheduleImportValidationError {
  scope: ScheduleImportErrorScope;
  rowNumber?: number;
  columnLabel?: string;
  value?: string;
  message: string;
}

export interface ScheduleImportDay extends CalendarDay {
  columnLabel: string;
}

export interface ScheduleImportPeriod {
  start: string;
  end: string;
  weekNumber: number;
  days: ScheduleImportDay[];
}

export interface ScheduleImportCellPreview {
  date: string;
  columnLabel: string;
  rawValue: string;
  shiftId: string;
  shiftName: string;
  shiftShortName: string;
  shiftColor: string;
  resolvedBy: ScheduleImportResolveMode;
  aliasTarget: string;
  status: ScheduleImportCellStatus;
  existingShiftIds: string[];
  existingShiftLabels: string[];
}

export interface ScheduleImportRowPreview {
  rowNumber: number;
  staffId: string;
  staffName: string;
  staffJobId: string;
  staffType: StaffType;
  cells: ScheduleImportCellPreview[];
}

export interface ScheduleImportPreviewSummary {
  staffCount: number;
  importableCells: number;
  skippedExistingCells: number;
  aliasMappedCells: number;
}

export interface ScheduleImportPreview {
  ok: true;
  period: ScheduleImportPeriod;
  rows: ScheduleImportRowPreview[];
  summary: ScheduleImportPreviewSummary;
  noImportableCells: boolean;
}

export interface ScheduleImportFailure {
  ok: false;
  errors: ScheduleImportValidationError[];
}

export type ScheduleImportValidationResult = ScheduleImportPreview | ScheduleImportFailure;

export interface ScheduleImportValidationInput {
  rawText: string;
  data: AppData;
  aliases?: Record<string, string>;
}

export interface ScheduleImportApplyResult {
  data: AppData;
  imported: number;
  skipped: number;
  aliasMapped: number;
  staffCount: number;
  periodStart: string;
  periodEnd: string;
}

const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const EXPECTED_HEADER_WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const PERIOD_PATTERN =
  /当前排班周期为\s*(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日\s*[（(](周[一二三四五六日])[）)]\s*至\s*(?:(\d{4})年\s*)?(\d{1,2})月\s*(\d{1,2})日\s*[（(](周[一二三四五六日])[）)]/;
const HEADER_DAY_PATTERN = /^(周[一二三四五六日])\((\d{1,2})\/(\d{1,2})\)$/;

export function validateScheduleImportText(input: ScheduleImportValidationInput): ScheduleImportValidationResult {
  const aliases = input.aliases ?? DEFAULT_SCHEDULE_IMPORT_ALIASES;
  const errors: ScheduleImportValidationError[] = [];
  const lines = input.rawText
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 3) {
    return failure([{ scope: "period", message: "导入内容不完整，请粘贴周期说明和排班表格" }]);
  }

  const period = parsePeriodLine(lines[0], errors);
  const tableRows = lines.slice(1).map((line) => line.split("\t").map((cell) => cell.trim()));
  const header = tableRows[0] ?? [];
  const days = period ? parseHeader(header, period, errors) : [];
  const bodyRows = tableRows.slice(1);

  const staffByName = buildStaffByName(input.data.staff, errors);
  const shiftResolver = createShiftResolver(input.data.shifts, aliases, errors);
  const entryByKey = new Map(input.data.scheduleEntries.map((entry) => [entry.id, entry]));

  if (period && input.data.monthlySettlements.some((settlement) => dateRangesOverlap(period.start, period.end, settlement.monthStart, settlement.monthEnd))) {
    errors.push({ scope: "period", message: `${period.start.slice(0, 7)} 已月结，不能导入排班` });
  }

  const seenImportNames = new Set<string>();
  const rows: ScheduleImportRowPreview[] = [];

  bodyRows.forEach((row, index) => {
    const rowNumber = index + 3;
    if (row.length !== 8) {
      errors.push({ scope: "row", rowNumber, message: `第${rowNumber}行列数不正确，应为 8 列` });
      return;
    }

    const staffName = row[0]?.trim() ?? "";
    if (!staffName) {
      errors.push({ scope: "row", rowNumber, message: `第${rowNumber}行人员姓名不能为空` });
      return;
    }
    if (seenImportNames.has(staffName)) {
      errors.push({ scope: "row", rowNumber, value: staffName, message: `导入数据中人员重复：${staffName}` });
      return;
    }
    seenImportNames.add(staffName);

    const staff = staffByName.get(staffName);
    if (!staff) {
      errors.push({ scope: "row", rowNumber, value: staffName, message: `第${rowNumber}行人员不存在或未启用：${staffName}` });
      return;
    }

    const cells = days.map((day, dayIndex) => {
      const rawValue = row[dayIndex + 1]?.trim() ?? "";
      if (!rawValue) {
        errors.push({ scope: "cell", rowNumber, columnLabel: day.columnLabel, message: `第${rowNumber}行 ${day.columnLabel} 班次不能为空` });
        return null;
      }

      const resolved = shiftResolver(rawValue, rowNumber, day.columnLabel);
      if (!resolved) {
        return null;
      }

      const existing = entryByKey.get(`${day.key}__${staff.id}`);
      return {
        date: day.key,
        columnLabel: day.columnLabel,
        rawValue,
        shiftId: resolved.shift.id,
        shiftName: resolved.shift.name,
        shiftShortName: resolved.shift.shortName,
        shiftColor: resolved.shift.color,
        resolvedBy: resolved.mode,
        aliasTarget: resolved.aliasTarget,
        status: existing && (existing.shiftIds.length > 0 || existing.note.trim().length > 0) ? "skip-existing" : "import",
        existingShiftIds: existing?.shiftIds ?? [],
        existingShiftLabels: existing?.shiftIds.map((shiftId) => shiftLabel(input.data.shifts, shiftId)) ?? []
      } satisfies ScheduleImportCellPreview;
    });

    if (cells.every(Boolean)) {
      rows.push({
        rowNumber,
        staffId: staff.id,
        staffName: staff.name,
        staffJobId: staff.jobId,
        staffType: staff.type,
        cells: cells.filter((cell): cell is ScheduleImportCellPreview => Boolean(cell))
      });
    }
  });

  if (errors.length > 0 || !period || days.length !== 7) {
    return failure(errors);
  }

  const flatCells = rows.flatMap((row) => row.cells);
  const summary = {
    staffCount: rows.length,
    importableCells: flatCells.filter((cell) => cell.status === "import").length,
    skippedExistingCells: flatCells.filter((cell) => cell.status === "skip-existing").length,
    aliasMappedCells: flatCells.filter((cell) => cell.resolvedBy === "alias").length
  };

  return {
    ok: true,
    period: { ...period, days },
    rows,
    summary,
    noImportableCells: summary.importableCells === 0
  };
}

export function applyScheduleImportPreview(data: AppData, preview: ScheduleImportPreview): ScheduleImportApplyResult {
  const existingIds = new Set(data.scheduleEntries.map((entry) => entry.id));
  const additions: ScheduleEntry[] = [];

  for (const row of preview.rows) {
    for (const cell of row.cells) {
      const id = `${cell.date}__${row.staffId}`;
      if (cell.status !== "import" || existingIds.has(id)) {
        continue;
      }
      additions.push({ id, date: cell.date, staffId: row.staffId, shiftIds: [cell.shiftId], note: "" });
      existingIds.add(id);
    }
  }

  return {
    data: { ...data, scheduleEntries: [...data.scheduleEntries, ...additions] },
    imported: additions.length,
    skipped: preview.summary.skippedExistingCells,
    aliasMapped: preview.summary.aliasMappedCells,
    staffCount: preview.summary.staffCount,
    periodStart: preview.period.start,
    periodEnd: preview.period.end
  };
}
```

Implement these private functions in the same file:

```ts
function failure(errors: ScheduleImportValidationError[]): ScheduleImportFailure;
function parsePeriodLine(line: string, errors: ScheduleImportValidationError[]): Omit<ScheduleImportPeriod, "days"> | null;
function parseHeader(header: string[], period: Omit<ScheduleImportPeriod, "days">, errors: ScheduleImportValidationError[]): ScheduleImportDay[];
function buildStaffByName(staff: StaffMember[], errors: ScheduleImportValidationError[]): Map<string, StaffMember>;
function createShiftResolver(shifts: Shift[], aliases: Record<string, string>, errors: ScheduleImportValidationError[]): (rawValue: string, rowNumber: number, columnLabel: string) => { shift: Shift; mode: ScheduleImportResolveMode; aliasTarget: string } | null;
function shiftLabel(shifts: Shift[], shiftId: string): string;
function dateRangesOverlap(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string): boolean;
```

Implementation requirements for the private functions:

- `parsePeriodLine()` must use `PERIOD_PATTERN`, normalize dates through `new Date(year, month - 1, day)`, then compare `toDateKey(date)` to catch impossible dates such as `2026-02-31`.
- `parsePeriodLine()` must infer the end year from the start year unless the line includes an explicit end year; if inferred end month/day is before start month/day, add one year.
- `parsePeriodLine()` must verify actual weekday text with `WEEKDAY_NAMES[date.getDay()]`.
- `parsePeriodLine()` must verify `listDateKeys(start, end).length === 7`, start weekday is Monday, and end weekday is Sunday.
- `parseHeader()` must require 8 columns, first column `姓名`, and exact ordered weekday labels `周一` through `周日`.
- `parseHeader()` must compare each header month/day to the corresponding parsed period day.
- `buildStaffByName()` must include enabled staff only and add an error for duplicated enabled names.
- `createShiftResolver()` must only use enabled shifts.
- `createShiftResolver()` must detect ambiguous exact matches and ambiguous alias targets.
- `createShiftResolver()` must push `第${rowNumber}行 ${columnLabel} 班次不存在或未启用：${rawValue}` for unknown values.

- [ ] **Step 4: Run parser and validation tests**

Run: `npm run test -- src/lib/schedule-import.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schedule-import.ts src/lib/schedule-import.test.ts
git commit -m "feat: add schedule import validation"
```

---

### Task 2: Backend Import Endpoint

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/routes.test.ts`

**Interfaces:**
- Consumes:
  - `validateScheduleImportText(input)` from `src/lib/schedule-import.ts`
  - `applyScheduleImportPreview(data, preview)` from `src/lib/schedule-import.ts`
  - Existing `requireScheduler`, `canManageStaff`, `denyStaffScope`, `recordAudit`, `storage.update()`
- Produces:
  - `POST /api/data/schedule-import`
  - Response shape: `{ data: PublicAppData; result: ScheduleImportApplyResult without data }`

- [ ] **Step 1: Write failing API tests**

Append tests inside `describe.sequential("API routes", () => { ... })` in `server/routes.test.ts`:

```ts
function createImportData(): AppData {
  const data = createSeedData();
  data.staff = [
    { id: "staff-head", jobId: "000228", name: "段鸿露", type: "head_nurse", isAdmin: true, enabled: true, sortOrder: 1 },
    { id: "staff-nurse", jobId: "001351", name: "张曼曼", type: "nurse", isAdmin: false, enabled: true, sortOrder: 2 }
  ];
  data.shifts = [
    { id: "shift-normal", name: "常", shortName: "常", color: "#16a34a", countsAttendance: true, coefficient: 1, enabled: true, sortOrder: 1 },
    { id: "shift-rest", name: "休息", shortName: "休", color: "#64748b", countsAttendance: false, coefficient: 0, enabled: true, sortOrder: 2 },
    { id: "shift-n1", name: "N1", shortName: "N1", color: "#dc2626", countsAttendance: true, coefficient: 1.3, enabled: true, sortOrder: 3 },
    { id: "shift-p3", name: "P3", shortName: "P3", color: "#0f766e", countsAttendance: true, coefficient: 1.2, enabled: true, sortOrder: 4 },
    { id: "shift-a4", name: "A4", shortName: "A4", color: "#2563eb", countsAttendance: true, coefficient: 1.2, enabled: true, sortOrder: 5 },
    { id: "shift-slash", name: "/", shortName: "/", color: "#6b7280", countsAttendance: false, coefficient: 0, enabled: true, sortOrder: 6 }
  ];
  data.scheduleEntries = [
    { id: "2026-07-20__staff-head", date: "2026-07-20", staffId: "staff-head", shiftIds: ["shift-rest"], note: "" }
  ];
  return data;
}

const importText = `当前排班周期为2026年7月20日（周一）至 7月26日（周日）：

姓名\t周一(7/20)\t周二(7/21)\t周三(7/22)\t周四(7/23)\t周五(7/24)\t周六(7/25)\t周日(7/26)
段鸿露\t常班\t常班\t常班\t常班\t常班\t休\t休
张曼曼\tN1\t/\t休\tP3\tA4\tA4\tN1`;

it("imports schedule text without overwriting existing entries and records an audit log", async () => {
  const app = createTestApp(createImportData());
  const headers = await adminHeaders(app);

  const response = await request(app)
    .post("/api/data/schedule-import")
    .set(headers)
    .send({ rawText: importText })
    .expect(200);

  expect(response.body.result).toEqual({
    imported: 13,
    skipped: 1,
    aliasMapped: 5,
    staffCount: 2,
    periodStart: "2026-07-20",
    periodEnd: "2026-07-26"
  });
  expect(response.body.data.scheduleEntries).toEqual(
    expect.arrayContaining([
      { id: "2026-07-20__staff-head", date: "2026-07-20", staffId: "staff-head", shiftIds: ["shift-rest"], note: "" },
      { id: "2026-07-21__staff-head", date: "2026-07-21", staffId: "staff-head", shiftIds: ["shift-normal"], note: "" },
      { id: "2026-07-21__staff-nurse", date: "2026-07-21", staffId: "staff-nurse", shiftIds: ["shift-slash"], note: "" }
    ])
  );

  const auditResponse = await request(app).get("/api/audit-logs").set(headers).expect(200);
  expect(auditResponse.body.rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        action: "data.schedule_import",
        targetType: "schedule_import",
        targetId: "2026-07-20__2026-07-26",
        summary: "导入排班：2026-07-20 至 2026-07-26，2 人，写入 13 个，跳过 1 个，别名 5 个"
      })
    ])
  );
});

it("rejects invalid schedule import text without writing data", async () => {
  const app = createTestApp(createImportData());
  const headers = await adminHeaders(app);

  const response = await request(app)
    .post("/api/data/schedule-import")
    .set(headers)
    .send({ rawText: importText.replace("张曼曼", "不存在") })
    .expect(400);

  expect(response.body.message).toBe("导入数据校验失败");
  expect(response.body.errors).toEqual(
    expect.arrayContaining([expect.objectContaining({ message: "第4行人员不存在或未启用：不存在" })])
  );

  const dataResponse = await request(app).get("/api/data").set(headers).expect(200);
  expect(dataResponse.body.scheduleEntries).toHaveLength(1);
});

it("rejects schedule import when no cells are importable", async () => {
  const data = createImportData();
  data.scheduleEntries = [];
  const previewApp = createTestApp(data);
  const headers = await adminHeaders(previewApp);

  await request(previewApp).post("/api/data/schedule-import").set(headers).send({ rawText: importText }).expect(200);
  const secondResponse = await request(previewApp)
    .post("/api/data/schedule-import")
    .set(headers)
    .send({ rawText: importText })
    .expect(400);

  expect(secondResponse.body.message).toBe("没有可导入内容");
});

it("enforces managed staff permissions for schedule import", async () => {
  const app = createTestApp(createImportData());
  const schedulerHeaders = await createUserAndLogin(app, {
    id: "user-limited-importer",
    username: "limited-importer",
    displayName: "部分导入员",
    role: "scheduler",
    managedStaffIds: ["staff-head"]
  });

  await request(app)
    .post("/api/data/schedule-import")
    .set(schedulerHeaders)
    .send({ rawText: importText })
    .expect(403, { message: "当前账号没有该人员操作权限" });
});
```

- [ ] **Step 2: Run API tests to verify they fail**

Run: `npm run test -- server/routes.test.ts -t "schedule import|导入排班|imports schedule text|invalid schedule import|managed staff permissions for schedule import"`

Expected: FAIL with 404 for `/api/data/schedule-import`.

- [ ] **Step 3: Add route payload parser and endpoint**

Modify `server/routes.ts`:

```ts
import { applyScheduleImportPreview, validateScheduleImportText } from "../src/lib/schedule-import";
```

Add near the other payload parsers:

```ts
function parseScheduleImportPayload(body: unknown): { rawText: string } {
  if (!isRecord(body) || !isNonEmptyString(body.rawText)) {
    throw new HttpResponseError(400, "导入内容不能为空");
  }
  return { rawText: body.rawText };
}
```

Add this route before `/data/schedule-copy-previous-week`:

```ts
router.post("/data/schedule-import", requireScheduler, async (request: AuthenticatedRequest, response, next) => {
  try {
    const payload = parseScheduleImportPayload(request.body);
    const initialData = await storage.load();
    const initialPreview = validateScheduleImportText({ rawText: payload.rawText, data: initialData });

    if (!initialPreview.ok) {
      response.status(400).json({ message: "导入数据校验失败", errors: initialPreview.errors });
      return;
    }

    const deniedStaff = initialPreview.rows.find((row) => !canManageStaff(request.authUser, row.staffId));
    if (deniedStaff) {
      await denyStaffScope(request, response, deniedStaff.staffId);
      return;
    }

    if (initialPreview.noImportableCells) {
      response.status(400).json({ message: "没有可导入内容" });
      return;
    }

    let responseResult: {
      imported: number;
      skipped: number;
      aliasMapped: number;
      staffCount: number;
      periodStart: string;
      periodEnd: string;
    } | null = null;

    const nextData = await storage.update((data) => {
      const preview = validateScheduleImportText({ rawText: payload.rawText, data });
      if (!preview.ok) {
        throw new HttpResponseError(400, "导入数据校验失败");
      }

      const scopedDeniedStaff = preview.rows.find((row) => !canManageStaff(request.authUser, row.staffId));
      if (scopedDeniedStaff) {
        throw new HttpResponseError(403, "当前账号没有该人员操作权限");
      }

      if (preview.noImportableCells) {
        throw new HttpResponseError(400, "没有可导入内容");
      }

      const applied = applyScheduleImportPreview(data, preview);
      responseResult = {
        imported: applied.imported,
        skipped: applied.skipped,
        aliasMapped: applied.aliasMapped,
        staffCount: applied.staffCount,
        periodStart: applied.periodStart,
        periodEnd: applied.periodEnd
      };
      return applied.data;
    });

    if (!responseResult) {
      throw new HttpResponseError(400, "没有可导入内容");
    }

    await recordAudit(
      request,
      "data.schedule_import",
      "schedule_import",
      `${responseResult.periodStart}__${responseResult.periodEnd}`,
      `导入排班：${responseResult.periodStart} 至 ${responseResult.periodEnd}，${responseResult.staffCount} 人，写入 ${responseResult.imported} 个，跳过 ${responseResult.skipped} 个，别名 ${responseResult.aliasMapped} 个`
    );

    response.json({ data: toPublicData(nextData), result: responseResult });
  } catch (error) {
    handleRouteError(error, response, next);
  }
});
```

- [ ] **Step 4: Run API tests**

Run: `npm run test -- server/routes.test.ts -t "schedule import|导入排班|imports schedule text|invalid schedule import|managed staff permissions for schedule import"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts server/routes.test.ts
git commit -m "feat: add schedule import api"
```

---

### Task 3: API Client Contract

**Files:**
- Modify: `src/api/client.ts`

**Interfaces:**
- Consumes: backend `POST /api/data/schedule-import`.
- Produces:
  - `ScheduleImportApiResult`
  - `ScheduleImportApiResponse`
  - `importScheduleText(rawText: string): Promise<ScheduleImportApiResponse>`

- [ ] **Step 1: Add client types and function**

Modify `src/api/client.ts` near the other schedule operation types:

```ts
export interface ScheduleImportApiResult {
  imported: number;
  skipped: number;
  aliasMapped: number;
  staffCount: number;
  periodStart: string;
  periodEnd: string;
}

export interface ScheduleImportApiResponse {
  data: PublicAppData;
  result: ScheduleImportApiResult;
}
```

Add near `saveScheduleEntry()`:

```ts
export function importScheduleText(rawText: string): Promise<ScheduleImportApiResponse> {
  return requestJson<ScheduleImportApiResponse>("/api/data/schedule-import", {
    method: "POST",
    body: JSON.stringify({ rawText })
  });
}
```

- [ ] **Step 2: Type-check client change**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/api/client.ts
git commit -m "feat: add schedule import client"
```

---

### Task 4: Import Panel Component

**Files:**
- Create: `src/components/ScheduleImportPanel.vue`
- Create: `src/components/ScheduleImportPanel.test.ts`
- Modify: `src/styles/main.css`

**Interfaces:**
- Consumes:
  - `PublicAppData` from `src/api/client.ts`
  - `validateScheduleImportText(rawText, data)` from `src/lib/schedule-import.ts`
- Produces:
  - Component props: `{ data: PublicAppData; saving: boolean }`
  - Emits: `confirmImport(rawText: string)`

- [ ] **Step 1: Write failing component tests**

Create `src/components/ScheduleImportPanel.test.ts`:

```ts
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ScheduleImportPanel from "./ScheduleImportPanel.vue";
import type { PublicAppData } from "@/api/client";

function data(): PublicAppData {
  return {
    staff: [
      { id: "staff-head", jobId: "000228", name: "段鸿露", type: "head_nurse", isAdmin: true, enabled: true, sortOrder: 1 }
    ],
    shifts: [
      { id: "shift-normal", name: "常", shortName: "常", color: "#16a34a", countsAttendance: true, coefficient: 1, enabled: true, sortOrder: 1 },
      { id: "shift-rest", name: "休息", shortName: "休", color: "#64748b", countsAttendance: false, coefficient: 0, enabled: true, sortOrder: 2 }
    ],
    holidays: [],
    scheduleEntries: [],
    monthlySettlements: [],
    settings: { defaultRequiredShiftsPerWeek: 5, version: 1 }
  };
}

const text = `当前排班周期为2026年7月20日（周一）至 7月26日（周日）：

姓名\t周一(7/20)\t周二(7/21)\t周三(7/22)\t周四(7/23)\t周五(7/24)\t周六(7/25)\t周日(7/26)
段鸿露\t常班\t常班\t常班\t常班\t常班\t休\t休`;

describe("ScheduleImportPanel", () => {
  it("shows the required format example", () => {
    const wrapper = mount(ScheduleImportPanel, { props: { data: data(), saving: false } });

    expect(wrapper.text()).toContain("导入数据格式示例");
    expect(wrapper.text()).toContain("当前排班周期为2026年7月20日");
    expect(wrapper.text()).toContain("姓名");
    expect(wrapper.text()).toContain("周一(7/20)");
  });

  it("validates pasted text and renders preview with derived job ID", async () => {
    const wrapper = mount(ScheduleImportPanel, { props: { data: data(), saving: false } });

    await wrapper.get('[data-testid="schedule-import-input"]').setValue(text);
    await wrapper.get('[data-testid="schedule-import-validate"]').trigger("click");

    expect(wrapper.get('[data-testid="schedule-import-period"]').text()).toContain("第30周 2026-07-20 至 2026-07-26");
    expect(wrapper.get('[data-testid="schedule-import-summary"]').text()).toContain("待导入 7 个");
    expect(wrapper.text()).toContain("段鸿露");
    expect(wrapper.text()).toContain("000228");
    expect(wrapper.text()).toContain("常班 → 常");
  });

  it("shows validation errors and does not emit confirm", async () => {
    const wrapper = mount(ScheduleImportPanel, { props: { data: data(), saving: false } });

    await wrapper.get('[data-testid="schedule-import-input"]').setValue(text.replace("段鸿露", "不存在"));
    await wrapper.get('[data-testid="schedule-import-validate"]').trigger("click");

    expect(wrapper.get('[data-testid="schedule-import-errors"]').text()).toContain("第3行人员不存在或未启用：不存在");
    expect(wrapper.find('[data-testid="schedule-import-confirm"]').exists()).toBe(false);
    expect(wrapper.emitted("confirmImport")).toBeUndefined();
  });

  it("disables confirmation when validation has no importable cells", async () => {
    const existingData = data();
    existingData.scheduleEntries = [
      { id: "2026-07-20__staff-head", date: "2026-07-20", staffId: "staff-head", shiftIds: ["shift-normal"], note: "" },
      { id: "2026-07-21__staff-head", date: "2026-07-21", staffId: "staff-head", shiftIds: ["shift-normal"], note: "" },
      { id: "2026-07-22__staff-head", date: "2026-07-22", staffId: "staff-head", shiftIds: ["shift-normal"], note: "" },
      { id: "2026-07-23__staff-head", date: "2026-07-23", staffId: "staff-head", shiftIds: ["shift-normal"], note: "" },
      { id: "2026-07-24__staff-head", date: "2026-07-24", staffId: "staff-head", shiftIds: ["shift-normal"], note: "" },
      { id: "2026-07-25__staff-head", date: "2026-07-25", staffId: "staff-head", shiftIds: ["shift-rest"], note: "" },
      { id: "2026-07-26__staff-head", date: "2026-07-26", staffId: "staff-head", shiftIds: ["shift-rest"], note: "" }
    ];
    const wrapper = mount(ScheduleImportPanel, { props: { data: existingData, saving: false } });

    await wrapper.get('[data-testid="schedule-import-input"]').setValue(text);
    await wrapper.get('[data-testid="schedule-import-validate"]').trigger("click");

    expect(wrapper.get('[data-testid="schedule-import-noop"]').text()).toContain("没有可导入内容");
    expect(wrapper.get<HTMLButtonElement>('[data-testid="schedule-import-confirm"]').element.disabled).toBe(true);
  });

  it("emits the current raw text after successful preview confirmation", async () => {
    const wrapper = mount(ScheduleImportPanel, { props: { data: data(), saving: false } });

    await wrapper.get('[data-testid="schedule-import-input"]').setValue(text);
    await wrapper.get('[data-testid="schedule-import-validate"]').trigger("click");
    await wrapper.get('[data-testid="schedule-import-confirm"]').trigger("click");

    expect(wrapper.emitted("confirmImport")).toEqual([[text]]);
  });
});
```

- [ ] **Step 2: Run component tests to verify they fail**

Run: `npm run test -- src/components/ScheduleImportPanel.test.ts`

Expected: FAIL with missing component.

- [ ] **Step 3: Implement component**

Create `src/components/ScheduleImportPanel.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import type { PublicAppData } from "@/api/client";
import { validateScheduleImportText, type ScheduleImportValidationResult } from "@/lib/schedule-import";

const props = defineProps<{
  data: PublicAppData;
  saving: boolean;
}>();

const emit = defineEmits<{
  confirmImport: [rawText: string];
}>();

const rawText = ref("");
const validation = ref<ScheduleImportValidationResult | null>(null);
const validatedRawText = ref("");

const canConfirm = computed(
  () =>
    validation.value?.ok === true &&
    !validation.value.noImportableCells &&
    validatedRawText.value === rawText.value &&
    !props.saving
);

function validateInput(): void {
  validation.value = validateScheduleImportText({ rawText: rawText.value, data: props.data });
  validatedRawText.value = rawText.value;
}

function clearInput(): void {
  rawText.value = "";
  validation.value = null;
  validatedRawText.value = "";
}

function confirmImport(): void {
  if (!canConfirm.value) {
    return;
  }
  emit("confirmImport", rawText.value);
}
</script>

<template>
  <section class="schedule-import-panel" data-testid="schedule-import-panel">
    <section class="schedule-import-guide">
      <h2>导入排班</h2>
      <p>请从表格复制完整的周期说明和排班内容。系统会先校验格式、人员和班次，确认预览后才会写入。</p>
      <h3>导入数据格式示例</h3>
      <pre class="schedule-import-example">当前排班周期为2026年7月20日（周一）至 7月26日（周日）：

姓名	周一(7/20)	周二(7/21)	周三(7/22)	周四(7/23)	周五(7/24)	周六(7/25)	周日(7/26)
段鸿露	常班	常班	常班	常班	常班	休	休
张曼曼	N1	/	休	P3	A4	A4	N1
陈佩燕	N2	/	休	P2	A5	A2	N2
王亚婷	A5	N1	/	休	P2	A3组长	休
李丹青	P2	N2	/	休	婚假	婚假	婚假
时银丽	A4	A4	N1	/	休	P2	A3组长</pre>
      <p class="schedule-import-note">已有排班会自动跳过，不会覆盖；人员按姓名精确匹配，工号由系统自动反查。</p>
    </section>

    <section class="schedule-import-input-card">
      <label class="schedule-import-input-label" for="schedule-import-input">粘贴排班数据</label>
      <textarea
        id="schedule-import-input"
        v-model="rawText"
        class="schedule-import-input"
        data-testid="schedule-import-input"
        rows="10"
        placeholder="请粘贴周期说明和排班表格"
      />
      <div class="schedule-import-actions">
        <button data-testid="schedule-import-validate" type="button" @click="validateInput">校验数据</button>
        <button data-testid="schedule-import-clear" type="button" @click="clearInput">清空</button>
      </div>
    </section>

    <p v-if="validation && !validation.ok" class="schedule-import-errors" data-testid="schedule-import-errors">
      <span v-for="error in validation.errors" :key="`${error.scope}-${error.rowNumber ?? 0}-${error.columnLabel ?? ''}-${error.message}`">
        {{ error.message }}
      </span>
    </p>

    <section v-if="validation?.ok" class="schedule-import-preview" data-testid="schedule-import-preview">
      <h3 data-testid="schedule-import-period">
        第{{ validation.period.weekNumber }}周 {{ validation.period.start }} 至 {{ validation.period.end }}
      </h3>
      <p class="schedule-import-summary" data-testid="schedule-import-summary">
        识别 {{ validation.summary.staffCount }} 人；待导入 {{ validation.summary.importableCells }} 个；跳过已有
        {{ validation.summary.skippedExistingCells }} 个；别名 {{ validation.summary.aliasMappedCells }} 个。
      </p>
      <p v-if="validation.noImportableCells" class="schedule-import-noop" data-testid="schedule-import-noop">没有可导入内容</p>
      <section class="schedule-grid-wrap schedule-import-preview-wrap">
        <table class="schedule-import-preview-table">
          <thead>
            <tr>
              <th>行号</th>
              <th>姓名</th>
              <th>工号</th>
              <th>类型</th>
              <th v-for="day in validation.period.days" :key="day.key">{{ day.columnLabel }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in validation.rows" :key="row.staffId">
              <th>{{ row.rowNumber }}</th>
              <th>{{ row.staffName }}</th>
              <td>{{ row.staffJobId }}</td>
              <td>{{ row.staffType }}</td>
              <td v-for="cell in row.cells" :key="`${row.staffId}-${cell.date}`" :class="`schedule-import-cell-${cell.status}`">
                <strong :style="{ color: cell.shiftColor }">{{ cell.shiftShortName }}</strong>
                <small v-if="cell.resolvedBy === 'alias'">{{ cell.rawValue }} → {{ cell.aliasTarget }}</small>
                <small v-if="cell.status === 'skip-existing'">跳过已有</small>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
      <button data-testid="schedule-import-confirm" type="button" :disabled="!canConfirm" @click="confirmImport">
        {{ saving ? "导入中..." : "确认导入" }}
      </button>
    </section>
  </section>
</template>
```

Use a local label helper in the final component to display staff type as `护士长 / 护士 / 文员` instead of raw enum values.

- [ ] **Step 4: Add styles**

Modify `src/styles/main.css`:

```css
.schedule-import-panel {
  display: grid;
  gap: 16px;
  max-width: 1120px;
}

.schedule-import-guide,
.schedule-import-input-card,
.schedule-import-preview {
  border: 1px solid #dbe3ef;
  background: #fff;
  padding: 16px;
}

.schedule-import-example {
  overflow-x: auto;
  border: 1px solid #dbe3ef;
  background: #f8fafc;
  padding: 12px;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre;
}

.schedule-import-input {
  width: 100%;
  min-height: 220px;
  resize: vertical;
  border: 1px solid #cfd8e3;
  padding: 12px;
  font-size: 14px;
  line-height: 1.6;
}

.schedule-import-actions,
.schedule-import-preview > button {
  margin-top: 12px;
}

.schedule-import-errors {
  display: grid;
  gap: 6px;
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #991b1b;
  padding: 12px;
}

.schedule-import-summary,
.schedule-import-note,
.schedule-import-noop {
  color: #475569;
}

.schedule-import-preview-table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
}

.schedule-import-preview-table th,
.schedule-import-preview-table td {
  border: 1px solid #dbe3ef;
  padding: 8px;
  text-align: center;
  white-space: nowrap;
}

.schedule-import-preview-table th {
  background: #f8fafc;
}

.schedule-import-cell-skip-existing {
  background: #f8fafc;
  color: #64748b;
}

.schedule-import-preview-table small {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: #64748b;
}

@media (max-width: 768px) {
  .schedule-import-panel {
    gap: 12px;
  }

  .schedule-import-guide,
  .schedule-import-input-card,
  .schedule-import-preview {
    padding: 12px;
  }

  .schedule-import-input {
    min-height: 260px;
  }
}
```

- [ ] **Step 5: Run component tests**

Run: `npm run test -- src/components/ScheduleImportPanel.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/ScheduleImportPanel.vue src/components/ScheduleImportPanel.test.ts src/styles/main.css
git commit -m "feat: add schedule import panel"
```

---

### Task 5: App Integration

**Files:**
- Modify: `src/App.vue`
- Modify: `src/App.test.ts`

**Interfaces:**
- Consumes:
  - `ScheduleImportPanel` component
  - `importScheduleText(rawText)` from `src/api/client.ts`
  - existing `canEditSchedule`
- Produces:
  - Visible `导入` tab for admins and schedulers with editable staff.
  - `handleConfirmScheduleImport(rawText: string): Promise<void>`

- [ ] **Step 1: Update App test mocks and write failing integration tests**

In `src/App.test.ts`, add `importScheduleText: vi.fn()` to `apiMocks`.

Add tests:

```ts
it("shows the import tab to users who can edit schedules", async () => {
  apiMocks.loadData.mockResolvedValue(structuredClone(testData));
  apiMocks.getCurrentUser.mockResolvedValue({
    user: { id: "admin", username: "admin", displayName: "系统管理员", role: "admin", staffId: null, managedStaffIds: [] }
  });

  const wrapper = mount(App);
  await flushPromises();

  expect(wrapper.get('[data-testid="workbench-tab-import"]').text()).toBe("导入");
});

it("hides the import tab from viewers", async () => {
  apiMocks.loadData.mockResolvedValue(structuredClone(testData));
  apiMocks.getCurrentUser.mockResolvedValue({
    user: { id: "viewer", username: "viewer", displayName: "只读", role: "viewer", staffId: null, managedStaffIds: [] }
  });

  const wrapper = mount(App);
  await flushPromises();

  expect(wrapper.find('[data-testid="workbench-tab-import"]').exists()).toBe(false);
});

it("imports pasted schedule text from the import tab and refreshes data", async () => {
  const importableData = {
    ...testData,
    shifts: [
      ...testData.shifts,
      { id: "shift-normal", name: "常", shortName: "常", color: "#16a34a", countsAttendance: true, coefficient: 1, enabled: true, sortOrder: 3 }
    ]
  };
  const importedData = {
    ...importableData,
    scheduleEntries: [
      { id: "2026-07-20__staff-nurse-001", date: "2026-07-20", staffId: "staff-nurse-001", shiftIds: ["shift-normal"], note: "" }
    ]
  };
  apiMocks.loadData.mockResolvedValue(structuredClone(importableData));
  apiMocks.getCurrentUser.mockResolvedValue({
    user: { id: "admin", username: "admin", displayName: "系统管理员", role: "admin", staffId: null, managedStaffIds: [] }
  });
  apiMocks.importScheduleText.mockResolvedValue({
    data: importedData,
    result: {
      imported: 7,
      skipped: 0,
      aliasMapped: 5,
      staffCount: 1,
      periodStart: "2026-07-20",
      periodEnd: "2026-07-26"
    }
  });

  const wrapper = mount(App);
  await flushPromises();

  await wrapper.get('[data-testid="workbench-tab-import"]').trigger("click");
  await wrapper.get('[data-testid="schedule-import-input"]').setValue(`当前排班周期为2026年7月20日（周一）至 7月26日（周日）：

姓名\t周一(7/20)\t周二(7/21)\t周三(7/22)\t周四(7/23)\t周五(7/24)\t周六(7/25)\t周日(7/26)
李护士\t常\t常\t常\t常\t常\t休\t休`);
  await wrapper.get('[data-testid="schedule-import-validate"]').trigger("click");
  await wrapper.get('[data-testid="schedule-import-confirm"]').trigger("click");
  await flushPromises();

  expect(apiMocks.importScheduleText).toHaveBeenCalledWith(expect.stringContaining("当前排班周期为2026年7月20日"));
  expect(elementPlusMocks.ElMessage.success).toHaveBeenCalledWith("已导入 7 个排班");
});
```

- [ ] **Step 2: Run App tests to verify they fail**

Run: `npm run test -- src/App.test.ts -t "import tab|imports pasted schedule"`

Expected: FAIL because the import tab and API mock wiring do not exist.

- [ ] **Step 3: Wire imports, tab, state, and handler**

Modify `src/App.vue` imports:

```ts
import ScheduleImportPanel from "@/components/ScheduleImportPanel.vue";
import { importScheduleText } from "@/api/client";
```

Extend the tab type:

```ts
type WorkbenchTab = "schedule" | "query" | "import" | "weekly" | "bonus" | "print" | "config" | "help";
```

Replace `workbenchTabs` with base and visible tabs:

```ts
const baseWorkbenchTabs: Array<{ key: WorkbenchTab; label: string }> = [
  { key: "schedule", label: "排班" },
  { key: "query", label: "查询" },
  { key: "import", label: "导入" },
  { key: "weekly", label: "周统计" },
  { key: "bonus", label: "月结与奖金" },
  { key: "print", label: "打印" },
  { key: "config", label: "配置" },
  { key: "help", label: "使用说明" }
];

const workbenchTabs = computed(() =>
  baseWorkbenchTabs.filter((tab) => tab.key !== "import" || canEditSchedule.value)
);
```

Add state:

```ts
const scheduleImportSaving = ref(false);
```

Add handler near other schedule handlers:

```ts
async function handleConfirmScheduleImport(rawText: string): Promise<void> {
  if (!canEditSchedule.value || scheduleImportSaving.value) {
    return;
  }

  scheduleImportSaving.value = true;
  try {
    const response = await importScheduleText(rawText);
    data.value = response.data;
    const skippedText = response.result.skipped > 0 ? `，跳过 ${response.result.skipped} 个已有排班` : "";
    ElMessage.success(`已导入 ${response.result.imported} 个排班${skippedText}`);
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "导入排班失败");
  } finally {
    scheduleImportSaving.value = false;
  }
}
```

Add a watch or guard so a user who loses edit permission while on `导入` returns to `排班`:

```ts
watch(canEditSchedule, (canEdit) => {
  if (!canEdit && activeWorkbenchTab.value === "import") {
    activeWorkbenchTab.value = "schedule";
  }
});
```

Add the panel after the `query` panel:

```vue
<section v-show="activeWorkbenchTab === 'import'" class="workbench-tab-panel" data-testid="workbench-panel-import">
  <ScheduleImportPanel
    v-if="data && canEditSchedule"
    :data="data"
    :saving="scheduleImportSaving"
    @confirm-import="handleConfirmScheduleImport"
  />
</section>
```

- [ ] **Step 4: Run App integration tests**

Run: `npm run test -- src/App.test.ts -t "import tab|imports pasted schedule"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.vue src/App.test.ts
git commit -m "feat: integrate schedule import tab"
```

---

### Task 6: End-To-End Verification And Final Polish

**Files:**
- Modify only if verification exposes a defect in files touched by Tasks 1-5.

**Interfaces:**
- Consumes all earlier task outputs.
- Produces a verified feature branch ready for code review or merge.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test -- src/lib/schedule-import.test.ts src/components/ScheduleImportPanel.test.ts
npm run test -- server/routes.test.ts -t "schedule import|导入排班|imports schedule text|invalid schedule import|managed staff permissions for schedule import"
npm run test -- src/App.test.ts -t "import tab|imports pasted schedule"
```

Expected: all selected tests PASS.

- [ ] **Step 2: Run full test suite**

Run: `npm run test`

Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Manual browser verification**

Start local dev if it is not already running:

```bash
./optools.sh dev start
./optools.sh dev status
```

Expected: dev service running and web URL available.

Manual checks:

1. Log in as `admin`.
2. Confirm left tabs show `排班 / 查询 / 导入 / 周统计 / 月结与奖金 / 打印 / 配置 / 使用说明`.
3. Open `导入`.
4. Confirm format example is visible.
5. Paste the standard example from the spec.
6. Click `校验数据`.
7. Confirm preview shows parsed period, staff names, derived job IDs, staff types, aliases, and skip/import statuses.
8. Click `确认导入`.
9. Confirm success message reports imported and skipped counts.
10. Go to `排班` and select a date inside the imported week.
11. Confirm imported shifts appear and existing entries were not overwritten.
12. Log in as a viewer account and confirm `导入` tab is hidden.

- [ ] **Step 5: Commit any verification fixes**

If Step 1-4 required fixes:

```bash
git add src/lib/schedule-import.ts src/lib/schedule-import.test.ts server/routes.ts server/routes.test.ts src/api/client.ts src/components/ScheduleImportPanel.vue src/components/ScheduleImportPanel.test.ts src/App.vue src/App.test.ts src/styles/main.css
git commit -m "fix: polish schedule import flow"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review

Spec coverage:

- Left-side `导入` tab: Task 5.
- Required format example: Task 4.
- Period parsed from pasted text, no date picker: Task 1 and Task 4.
- Exact enabled staff name matching and job ID derivation: Task 1 and Task 4.
- Shift exact matching plus controlled aliases: Task 1.
- `/` as normal shift: Task 1.
- Whole-batch validation: Task 1 and Task 2.
- Preview before confirmation: Task 4 and Task 5.
- Existing entries skipped without overwrite: Task 1 and Task 2.
- Settled month blocking: Task 1 and Task 2.
- Permission enforcement: Task 2 and Task 5.
- Audit log: Task 2.
- Tests and manual verification: Tasks 1-6.

Placeholder scan:

- No task depends on unspecified files.
- No task asks for generic validation without naming concrete rules.
- No task contains postponed feature work.

Type consistency:

- `ScheduleImportPreview`, `ScheduleImportValidationResult`, and `ScheduleImportApplyResult` are produced by Task 1 and consumed by Tasks 2 and 4.
- `importScheduleText(rawText: string)` is produced by Task 3 and consumed by Task 5.
- `confirmImport(rawText: string)` is produced by Task 4 and consumed by Task 5.
