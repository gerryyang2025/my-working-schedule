# Bonus Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ordinary-staff bonus allocation and monthly settlement locking on top of the existing monthly summary workflow.

**Architecture:** Keep monthly schedule calculation as the source of truth, add a focused bonus helper for allocation and settlement snapshots, persist monthly settlement snapshots in `AppData`, and enforce month locks in the API before schedule-entry writes. The Vue app shows live trial allocation for unlocked months, shows stored snapshots for locked months, and extends month print/PDF output with settlement data only after settlement.

**Tech Stack:** Vue 3, TypeScript, Element Plus, Express, JSON storage, Vitest, Vue Test Utils, Supertest, Playwright.

---

## File Structure

- Create: `src/lib/bonus.ts`
  - Owns `calculateBonusAllocation()` and `createMonthlySettlement()`.
  - Does not read or write API/storage state.
- Create: `src/lib/bonus.test.ts`
  - Covers allocation, head nurse exclusion, zero coefficient handling, rounding tail adjustment, and settlement snapshot creation.
- Create: `src/components/BonusSettlementPanel.vue`
  - Displays current month bonus trial or settled snapshot.
  - Emits confirm/cancel events; it does not call APIs directly.
- Create: `src/components/BonusSettlementPanel.test.ts`
  - Covers unlocked trial display, locked snapshot display, admin button state, confirm payload, cancel payload, and zero-coefficient guard.
- Modify: `src/types/domain.ts`
  - Adds monthly settlement row/snapshot interfaces.
  - Adds `monthlySettlements` to `AppData`.
- Modify: `server/seed.ts`
  - Initializes `monthlySettlements: []`.
- Modify: `server/seed.test.ts`
  - Verifies seed data includes an empty settlement collection.
- Modify: `server/storage.ts`
  - Validates settlement arrays and normalizes older local data missing `monthlySettlements` to `[]`.
- Modify: `server/storage.test.ts`
  - Verifies missing `monthlySettlements` is repaired on load and persisted.
- Modify: `server/routes.ts`
  - Adds monthly-settlement save/delete routes.
  - Rejects schedule entry changes for locked months.
- Modify: `server/routes.test.ts`
  - Covers confirm settlement, duplicate settlement failure, cancel settlement, missing cancel failure, invalid bonus pool failure, zero coefficient failure, and locked schedule write failure.
- Modify: `src/api/client.ts`
  - Adds `saveMonthlySettlement()` and `deleteMonthlySettlement()`.
- Modify: `src/App.vue`
  - Computes current month key, current settlement, and monthly summary.
  - Wires `BonusSettlementPanel` to API calls.
  - Passes monthly settlement snapshot to `PrintViews`.
- Modify: `src/App.test.ts`
  - Extends API mocks and verifies App renders settlement panel, saves settlement, cancels settlement, and passes snapshot to print preview.
- Modify: `src/components/PrintViews.vue`
  - Renders settlement snapshot in monthly print output.
  - Uses snapshot rows for printed monthly summary when the month is locked.
- Modify: `src/components/PrintViews.test.ts`
  - Covers month print bonus snapshot and snapshot-over-live display.
- Modify: `tests/e2e/schedule.spec.ts`
  - Adds browser-level settlement lock workflow.

---

### Task 1: Domain Model, Seed Data, and Storage Contract

**Files:**
- Modify: `src/types/domain.ts`
- Modify: `server/seed.ts`
- Modify: `server/seed.test.ts`
- Modify: `server/storage.ts`
- Modify: `server/storage.test.ts`

- [ ] **Step 1: Write failing type and seed tests**

Add this test to `server/seed.test.ts`:

```ts
it("starts without monthly settlement snapshots", () => {
  const data = createSeedData();

  expect(data.monthlySettlements).toEqual([]);
});
```

Add this test to `server/storage.test.ts`:

```ts
it("repairs older local data that does not have monthly settlements", async () => {
  const path = await createTempDataPath();
  const legacyData = {
    staff: [],
    shifts: [],
    holidays: [],
    scheduleEntries: [],
    settings: {
      defaultRequiredShiftsPerWeek: 5,
      version: 1
    }
  };
  await writeFile(path, `${JSON.stringify(legacyData, null, 2)}\n`, "utf8");

  const storage = createJsonStorage(path);
  const data = await storage.load();
  const persisted = JSON.parse(await readFile(path, "utf8"));

  expect(data.monthlySettlements).toEqual([]);
  expect(persisted.monthlySettlements).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- server/seed.test.ts server/storage.test.ts`

Expected: FAIL because `monthlySettlements` is missing from `AppData` and seed/storage output.

- [ ] **Step 3: Add settlement domain types**

In `src/types/domain.ts`, add these interfaces after `MonthlySummary` and add `monthlySettlements` to `AppData`:

```ts
export interface MonthlySettlementRow {
  staffId: string;
  staffName: string;
  staffType: StaffType;
  attendanceShifts: number;
  coefficientTotal: number | null;
  coefficientExcludedReason: string;
  bonusAmount: number;
  bonusExcludedReason: string;
}

export interface MonthlySettlement {
  id: string;
  month: string;
  monthStart: string;
  monthEnd: string;
  totalDays: number;
  bonusPool: number;
  coefficientTotal: number;
  settledAt: string;
  rows: MonthlySettlementRow[];
}
```

Update `AppData` to:

```ts
export interface AppData {
  staff: StaffMember[];
  shifts: Shift[];
  holidays: Holiday[];
  scheduleEntries: ScheduleEntry[];
  monthlySettlements: MonthlySettlement[];
  settings: Settings;
}
```

- [ ] **Step 4: Initialize seed data**

In `server/seed.ts`, add `monthlySettlements: []` beside `scheduleEntries`.

The returned object shape must include:

```ts
return {
  staff,
  shifts,
  holidays,
  scheduleEntries: [],
  monthlySettlements: [],
  settings: {
    defaultRequiredShiftsPerWeek: 5,
    version: 1
  }
};
```

- [ ] **Step 5: Normalize and validate storage data**

In `server/storage.ts`, introduce a normalizer before `assertAppData()` validates array fields:

```ts
function normalizeAppData(candidate: unknown): unknown {
  if (!candidate || typeof candidate !== "object") {
    return candidate;
  }

  const record = candidate as Partial<AppData>;
  return {
    ...record,
    monthlySettlements: Array.isArray(record.monthlySettlements) ? record.monthlySettlements : []
  };
}
```

Use it inside load:

```ts
const normalized = normalizeAppData(JSON.parse(content));
assertAppData(normalized);
await writeFile(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
return normalized;
```

Extend `assertAppData()` so it requires these arrays:

```ts
if (
  !Array.isArray(data.staff) ||
  !Array.isArray(data.shifts) ||
  !Array.isArray(data.holidays) ||
  !Array.isArray(data.scheduleEntries) ||
  !Array.isArray(data.monthlySettlements)
) {
  throw new Error("数据文件结构不正确");
}
```

- [ ] **Step 6: Run focused tests**

Run: `npm run test -- server/seed.test.ts server/storage.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types/domain.ts server/seed.ts server/seed.test.ts server/storage.ts server/storage.test.ts
git commit -m "feat: add monthly settlement data model"
```

---

### Task 2: Bonus Allocation and Settlement Snapshot Helper

**Files:**
- Create: `src/lib/bonus.ts`
- Create: `src/lib/bonus.test.ts`

- [ ] **Step 1: Write failing allocation tests**

Create `src/lib/bonus.test.ts` with these tests:

```ts
import { describe, expect, it } from "vitest";
import type { MonthlySummary } from "@/types/domain";
import { calculateBonusAllocation, createMonthlySettlement } from "./bonus";

const baseSummary: MonthlySummary = {
  monthStart: "2026-06-01",
  monthEnd: "2026-06-30",
  totalDays: 30,
  holidayNames: ["端午节"],
  rows: [
    {
      staffId: "staff-head",
      staffName: "段护士长",
      staffType: "head_nurse",
      attendanceShifts: 10,
      coefficientTotal: null,
      coefficientExcludedReason: "护士长绩效单独核算"
    },
    {
      staffId: "staff-nurse",
      staffName: "李护士",
      staffType: "nurse",
      attendanceShifts: 12,
      coefficientTotal: 10,
      coefficientExcludedReason: ""
    },
    {
      staffId: "staff-clerk",
      staffName: "王文员",
      staffType: "clerk",
      attendanceShifts: 8,
      coefficientTotal: 5,
      coefficientExcludedReason: ""
    }
  ]
};

describe("calculateBonusAllocation", () => {
  it("allocates bonus by monthly coefficient and excludes the head nurse", () => {
    const allocation = calculateBonusAllocation(baseSummary, 1500);

    expect(allocation.canSettle).toBe(true);
    expect(allocation.coefficientTotal).toBe(15);
    expect(allocation.rows.map((row) => [row.staffName, row.bonusAmount, row.bonusExcludedReason])).toEqual([
      ["段护士长", 0, "护士长绩效单独核算"],
      ["李护士", 1000, ""],
      ["王文员", 500, ""]
    ]);
  });

  it("keeps zero-coefficient ordinary staff in the result with zero bonus", () => {
    const allocation = calculateBonusAllocation(
      {
        ...baseSummary,
        rows: [
          baseSummary.rows[0],
          { ...baseSummary.rows[1], coefficientTotal: 0 },
          baseSummary.rows[2]
        ]
      },
      500
    );

    expect(allocation.canSettle).toBe(true);
    expect(allocation.rows[1].bonusAmount).toBe(0);
    expect(allocation.rows[2].bonusAmount).toBe(500);
  });

  it("puts the rounding tail on the last positive-coefficient participant", () => {
    const allocation = calculateBonusAllocation(
      {
        ...baseSummary,
        rows: [
          { ...baseSummary.rows[1], staffId: "one", staffName: "一", coefficientTotal: 1 },
          { ...baseSummary.rows[1], staffId: "two", staffName: "二", coefficientTotal: 1 },
          { ...baseSummary.rows[1], staffId: "three", staffName: "三", coefficientTotal: 1 }
        ]
      },
      100
    );

    expect(allocation.rows.map((row) => row.bonusAmount)).toEqual([33.33, 33.33, 33.34]);
  });

  it("does not allow settlement when ordinary coefficient total is zero", () => {
    const allocation = calculateBonusAllocation(
      {
        ...baseSummary,
        rows: [
          baseSummary.rows[0],
          { ...baseSummary.rows[1], coefficientTotal: 0 },
          { ...baseSummary.rows[2], coefficientTotal: 0 }
        ]
      },
      100
    );

    expect(allocation.canSettle).toBe(false);
    expect(allocation.message).toBe("普通人员月总系数合计为 0，无法按系数分配奖金");
    expect(allocation.rows.map((row) => row.bonusAmount)).toEqual([0, 0, 0]);
  });
});

describe("createMonthlySettlement", () => {
  it("creates a settlement snapshot with rounded pool and server settlement time", () => {
    const settlement = createMonthlySettlement({
      month: "2026-06",
      monthlySummary: baseSummary,
      bonusPool: 1500.129,
      settledAt: "2026-06-30T10:00:00.000Z"
    });

    expect(settlement).toMatchObject({
      id: "settlement-2026-06",
      month: "2026-06",
      monthStart: "2026-06-01",
      monthEnd: "2026-06-30",
      totalDays: 30,
      bonusPool: 1500.13,
      coefficientTotal: 15,
      settledAt: "2026-06-30T10:00:00.000Z"
    });
    expect(settlement.rows.map((row) => row.bonusAmount)).toEqual([0, 1000.09, 500.04]);
  });

  it("throws when trying to snapshot a month with zero ordinary coefficient", () => {
    expect(() =>
      createMonthlySettlement({
        month: "2026-06",
        monthlySummary: {
          ...baseSummary,
          rows: [baseSummary.rows[0], { ...baseSummary.rows[1], coefficientTotal: 0 }]
        },
        bonusPool: 100,
        settledAt: "2026-06-30T10:00:00.000Z"
      })
    ).toThrow("普通人员月总系数合计为 0，无法按系数分配奖金");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/bonus.test.ts`

Expected: FAIL with import error for `./bonus`.

- [ ] **Step 3: Implement the bonus helper**

Create `src/lib/bonus.ts`:

```ts
import type { MonthlySettlement, MonthlySettlementRow, MonthlySummary } from "@/types/domain";

export interface BonusAllocation {
  bonusPool: number;
  coefficientTotal: number;
  canSettle: boolean;
  message: string;
  rows: MonthlySettlementRow[];
}

interface SettlementInput {
  month: string;
  monthlySummary: MonthlySummary;
  bonusPool: number;
  settledAt: string;
}

const ZERO_COEFFICIENT_MESSAGE = "普通人员月总系数合计为 0，无法按系数分配奖金";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeMoney(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("奖金总额格式不正确");
  }

  return roundMoney(value);
}

function isPositiveParticipant(row: { coefficientTotal: number | null }): row is { coefficientTotal: number } {
  return typeof row.coefficientTotal === "number" && row.coefficientTotal > 0;
}

export function calculateBonusAllocation(monthlySummary: MonthlySummary, bonusPoolInput: number): BonusAllocation {
  const bonusPool = normalizeMoney(bonusPoolInput);
  const coefficientTotal = roundMoney(
    monthlySummary.rows.reduce((total, row) => total + (isPositiveParticipant(row) ? row.coefficientTotal : 0), 0)
  );
  const positiveParticipants = monthlySummary.rows.filter(isPositiveParticipant);
  const lastPositiveParticipantId = positiveParticipants.at(-1)?.staffId ?? "";
  let allocated = 0;

  const rows = monthlySummary.rows.map((row) => {
    const isExcluded = row.coefficientTotal === null;
    const isPositive = isPositiveParticipant(row);
    let bonusAmount = 0;

    if (coefficientTotal > 0 && isPositive) {
      bonusAmount =
        row.staffId === lastPositiveParticipantId
          ? roundMoney(bonusPool - allocated)
          : roundMoney((bonusPool * row.coefficientTotal) / coefficientTotal);
      allocated = roundMoney(allocated + bonusAmount);
    }

    return {
      staffId: row.staffId,
      staffName: row.staffName,
      staffType: row.staffType,
      attendanceShifts: row.attendanceShifts,
      coefficientTotal: row.coefficientTotal,
      coefficientExcludedReason: row.coefficientExcludedReason,
      bonusAmount,
      bonusExcludedReason: isExcluded ? row.coefficientExcludedReason : ""
    };
  });

  return {
    bonusPool,
    coefficientTotal,
    canSettle: coefficientTotal > 0,
    message: coefficientTotal > 0 ? "" : ZERO_COEFFICIENT_MESSAGE,
    rows
  };
}

export function createMonthlySettlement(input: SettlementInput): MonthlySettlement {
  const allocation = calculateBonusAllocation(input.monthlySummary, input.bonusPool);

  if (!allocation.canSettle) {
    throw new Error(allocation.message);
  }

  return {
    id: `settlement-${input.month}`,
    month: input.month,
    monthStart: input.monthlySummary.monthStart,
    monthEnd: input.monthlySummary.monthEnd,
    totalDays: input.monthlySummary.totalDays,
    bonusPool: allocation.bonusPool,
    coefficientTotal: allocation.coefficientTotal,
    settledAt: input.settledAt,
    rows: allocation.rows
  };
}
```

- [ ] **Step 4: Run focused tests**

Run: `npm run test -- src/lib/bonus.test.ts`

Expected: PASS.

- [ ] **Step 5: Run calculation tests to catch type regressions**

Run: `npm run test -- src/lib/calculation.test.ts src/lib/bonus.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/bonus.ts src/lib/bonus.test.ts
git commit -m "feat: calculate monthly bonus allocation"
```

---

### Task 3: Monthly Settlement API and Schedule Lock Enforcement

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/routes.test.ts`

- [ ] **Step 1: Write failing API tests**

Append these tests inside `describe("API routes", () => {})` in `server/routes.test.ts`:

```ts
it("creates a monthly settlement snapshot", async () => {
  const initialData = createSeedData();
  initialData.scheduleEntries = [
    { id: "2026-06-15__staff-nurse-001", date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" },
    { id: "2026-06-16__staff-clerk-001", date: "2026-06-16", staffId: "staff-clerk-001", shiftIds: ["shift-office"], note: "" }
  ];
  const app = createTestApp(initialData);

  const response = await request(app)
    .put("/api/data/monthly-settlement")
    .set(await adminHeaders(app))
    .send({ month: "2026-06", bonusPool: 1000 })
    .expect(200);

  expect(response.body.monthlySettlements).toHaveLength(1);
  expect(response.body.monthlySettlements[0]).toMatchObject({
    id: "settlement-2026-06",
    month: "2026-06",
    monthStart: "2026-06-01",
    monthEnd: "2026-06-30",
    bonusPool: 1000
  });
  expect(response.body.monthlySettlements[0].settledAt).toEqual(expect.any(String));
});

it("rejects duplicate monthly settlements", async () => {
  const initialData = createSeedData();
  initialData.scheduleEntries = [
    { id: "2026-06-15__staff-nurse-001", date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" }
  ];
  const app = createTestApp(initialData);
  const headers = await adminHeaders(app);

  await request(app).put("/api/data/monthly-settlement").set(headers).send({ month: "2026-06", bonusPool: 1000 }).expect(200);
  const response = await request(app)
    .put("/api/data/monthly-settlement")
    .set(headers)
    .send({ month: "2026-06", bonusPool: 1000 })
    .expect(400);

  expect(response.body.message).toBe("该月份已月结");
});

it("cancels a monthly settlement snapshot", async () => {
  const initialData = createSeedData();
  initialData.scheduleEntries = [
    { id: "2026-06-15__staff-nurse-001", date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" }
  ];
  const app = createTestApp(initialData);
  const headers = await adminHeaders(app);

  await request(app).put("/api/data/monthly-settlement").set(headers).send({ month: "2026-06", bonusPool: 1000 }).expect(200);
  const response = await request(app).delete("/api/data/monthly-settlement/2026-06").set(headers).expect(200);

  expect(response.body.monthlySettlements).toEqual([]);
});

it("rejects cancelling a month that is not settled", async () => {
  const app = createTestApp();
  const response = await request(app).delete("/api/data/monthly-settlement/2026-06").set(await adminHeaders(app)).expect(404);

  expect(response.body.message).toBe("该月份未月结");
});

it("rejects invalid monthly settlement payloads", async () => {
  const app = createTestApp();
  const response = await request(app)
    .put("/api/data/monthly-settlement")
    .set(await adminHeaders(app))
    .send({ month: "2026-13", bonusPool: -1 })
    .expect(400);

  expect(response.body.message).toBe("月结信息不完整");
});

it("rejects monthly settlement when ordinary coefficient total is zero", async () => {
  const app = createTestApp();
  const response = await request(app)
    .put("/api/data/monthly-settlement")
    .set(await adminHeaders(app))
    .send({ month: "2026-06", bonusPool: 1000 })
    .expect(400);

  expect(response.body.message).toBe("普通人员月总系数合计为 0，无法按系数分配奖金");
});

it("rejects schedule writes in a settled month", async () => {
  const initialData = createSeedData();
  initialData.scheduleEntries = [
    { id: "2026-06-15__staff-nurse-001", date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" }
  ];
  const app = createTestApp(initialData);
  const headers = await adminHeaders(app);

  await request(app).put("/api/data/monthly-settlement").set(headers).send({ month: "2026-06", bonusPool: 1000 }).expect(200);
  const response = await request(app)
    .put("/api/data/schedule-entry")
    .set(headers)
    .send({ date: "2026-06-16", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" })
    .expect(400);

  expect(response.body.message).toBe("该月份已月结，不能修改排班");
});
```

- [ ] **Step 2: Run API tests to verify they fail**

Run: `npm run test -- server/routes.test.ts`

Expected: FAIL with 404 for `/api/data/monthly-settlement`.

- [ ] **Step 3: Add route helpers**

In `server/routes.ts`, import:

```ts
import { createMonthlySettlement } from "../src/lib/bonus";
import { calculateMonthlySummary } from "../src/lib/calculation";
import { getMonthDays } from "../src/lib/date";
```

Add helpers near existing payload parsers:

```ts
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function getMonthKey(date: string): string {
  return date.slice(0, 7);
}

function isMonthSettled(data: AppData, month: string): boolean {
  return data.monthlySettlements.some((settlement) => settlement.month === month);
}

function parseMonthlySettlementPayload(body: unknown): { month: string; bonusPool: number } {
  if (!body || typeof body !== "object") {
    throw new ApiError(400, "月结信息不完整");
  }

  const payload = body as { month?: unknown; bonusPool?: unknown };
  if (typeof payload.month !== "string" || !MONTH_PATTERN.test(payload.month)) {
    throw new ApiError(400, "月结信息不完整");
  }
  if (typeof payload.bonusPool !== "number" || !Number.isFinite(payload.bonusPool) || payload.bonusPool < 0) {
    throw new ApiError(400, "月结信息不完整");
  }

  return {
    month: payload.month,
    bonusPool: payload.bonusPool
  };
}
```

- [ ] **Step 4: Enforce lock before schedule-entry writes**

In `PUT /data/schedule-entry`, after `parseScheduleEntryPayload(req.body)` returns `payload`, add:

```ts
if (isMonthSettled(data, getMonthKey(payload.date))) {
  throw new ApiError(400, "该月份已月结，不能修改排班");
}
```

This check must run before the code mutates `data.scheduleEntries`.

- [ ] **Step 5: Add settlement routes**

Add these routes after schedule-entry route:

```ts
router.put("/data/monthly-settlement", asyncHandler(async (req, res) => {
  const payload = parseMonthlySettlementPayload(req.body);
  const next = await storage.update((data) => {
    if (isMonthSettled(data, payload.month)) {
      throw new ApiError(400, "该月份已月结");
    }

    const [yearText, monthText] = payload.month.split("-");
    const days = getMonthDays(Number(yearText), Number(monthText));
    const monthlySummary = calculateMonthlySummary(data, days);
    const settlement = createMonthlySettlement({
      month: payload.month,
      monthlySummary,
      bonusPool: payload.bonusPool,
      settledAt: new Date().toISOString()
    });

    return {
      ...data,
      monthlySettlements: [...data.monthlySettlements, settlement]
    };
  });

  res.json(toPublicData(next));
}));

router.delete("/data/monthly-settlement/:month", asyncHandler(async (req, res) => {
  const month = req.params.month;
  if (!MONTH_PATTERN.test(month)) {
    throw new ApiError(400, "月结信息不完整");
  }

  const next = await storage.update((data) => {
    if (!isMonthSettled(data, month)) {
      throw new ApiError(404, "该月份未月结");
    }

    return {
      ...data,
      monthlySettlements: data.monthlySettlements.filter((settlement) => settlement.month !== month)
    };
  });

  res.json(toPublicData(next));
}));
```

- [ ] **Step 6: Run API tests**

Run: `npm run test -- server/routes.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/routes.ts server/routes.test.ts
git commit -m "feat: add monthly settlement api"
```

---

### Task 4: API Client and App-Level State Wiring

**Files:**
- Modify: `src/api/client.ts`
- Modify: `src/App.vue`
- Modify: `src/App.test.ts`

- [ ] **Step 1: Extend App test API mocks**

In `src/App.test.ts`, add these mock functions to `apiMocks`:

```ts
deleteMonthlySettlement: vi.fn(),
saveMonthlySettlement: vi.fn(),
```

Add `monthlySettlements: []` to `testData`.

- [ ] **Step 2: Write failing App wiring tests**

Add these stubs and tests to `src/App.test.ts`:

```ts
const BonusSettlementPanelStub = defineComponent({
  name: "BonusSettlementPanel",
  props: ["adminMode", "monthlySummary", "month", "settlement"],
  emits: ["confirmSettlement", "cancelSettlement"],
  template: `
    <section data-testid="bonus-panel">
      <span data-testid="bonus-month">{{ month }}</span>
      <span data-testid="bonus-status">{{ settlement ? "已月结" : "未月结" }}</span>
      <span data-testid="bonus-summary">{{ monthlySummary.rows.map((row) => row.staffName).join(",") }}</span>
      <button data-testid="confirm-settlement" type="button" @click="$emit('confirmSettlement', { month, bonusPool: 1000 })">confirm</button>
      <button data-testid="cancel-settlement" type="button" @click="$emit('cancelSettlement', month)">cancel</button>
    </section>
  `
});
```

Register the stub in `mountApp()`:

```ts
BonusSettlementPanel: BonusSettlementPanelStub,
```

Add tests:

```ts
it("renders bonus settlement panel for the selected month", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 17));
  const wrapper = mountApp();

  await flushPromises();

  expect(wrapper.get('[data-testid="bonus-month"]').text()).toBe("2026-06");
  expect(wrapper.get('[data-testid="bonus-status"]').text()).toBe("未月结");
  expect(wrapper.get('[data-testid="bonus-summary"]').text()).toContain("李护士");
  vi.useRealTimers();
});

it("saves monthly settlement and refreshes app data", async () => {
  apiMocks.saveMonthlySettlement.mockResolvedValue({
    ...testData,
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
        rows: []
      }
    ]
  });
  const wrapper = mountApp();

  await flushPromises();
  await wrapper.get('[data-testid="confirm-settlement"]').trigger("click");
  await flushPromises();

  expect(apiMocks.saveMonthlySettlement).toHaveBeenCalledWith("2026-06", 1000);
});

it("cancels monthly settlement and refreshes app data", async () => {
  apiMocks.deleteMonthlySettlement.mockResolvedValue({ ...testData, monthlySettlements: [] });
  const wrapper = mountApp({
    ...testData,
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
        rows: []
      }
    ]
  });

  await flushPromises();
  await wrapper.get('[data-testid="cancel-settlement"]').trigger("click");
  await flushPromises();

  expect(apiMocks.deleteMonthlySettlement).toHaveBeenCalledWith("2026-06");
});
```

- [ ] **Step 3: Run App tests to verify they fail**

Run: `npm run test -- src/App.test.ts`

Expected: FAIL because `BonusSettlementPanel` is not mounted and client methods are missing.

- [ ] **Step 4: Add client methods**

In `src/api/client.ts`, export:

```ts
export async function saveMonthlySettlement(month: string, bonusPool: number): Promise<PublicAppData> {
  return requestJson<PublicAppData>("/api/data/monthly-settlement", {
    method: "PUT",
    body: JSON.stringify({ month, bonusPool }),
    headers: {
      "Content-Type": "application/json",
      ...authHeaders()
    }
  });
}

export async function deleteMonthlySettlement(month: string): Promise<PublicAppData> {
  return requestJson<PublicAppData>(`/api/data/monthly-settlement/${encodeURIComponent(month)}`, {
    method: "DELETE",
    headers: authHeaders()
  });
}
```

- [ ] **Step 5: Wire App state**

In `src/App.vue`, import:

```ts
import BonusSettlementPanel from "@/components/BonusSettlementPanel.vue";
import { deleteMonthlySettlement, saveMonthlySettlement } from "@/api/client";
import type { MonthlySettlement } from "@/types/domain";
```

Add computed values:

```ts
const selectedMonth = computed(() => selectedDate.value.slice(0, 7));
const currentMonthlySettlement = computed<MonthlySettlement | null>(() => {
  return data.value?.monthlySettlements.find((settlement) => settlement.month === selectedMonth.value) ?? null;
});
```

Add state and handlers:

```ts
const settlementSaving = ref(false);
const settlementCanceling = ref(false);

async function handleConfirmSettlement(payload: { month: string; bonusPool: number }) {
  if (!adminMode.value) {
    ElMessage.warning("请先进入编辑模式");
    return;
  }

  try {
    settlementSaving.value = true;
    data.value = await saveMonthlySettlement(payload.month, payload.bonusPool);
    ElMessage.success("月结已完成");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "月结失败");
  } finally {
    settlementSaving.value = false;
  }
}

async function handleCancelSettlement(month: string) {
  if (!adminMode.value) {
    ElMessage.warning("请先进入编辑模式");
    return;
  }

  try {
    settlementCanceling.value = true;
    data.value = await deleteMonthlySettlement(month);
    ElMessage.success("月结已取消");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "取消月结失败");
  } finally {
    settlementCanceling.value = false;
  }
}
```

Mount the panel near the existing weekly summary area:

```vue
<BonusSettlementPanel
  v-if="data && monthlySummary"
  :admin-mode="adminMode"
  :month="selectedMonth"
  :monthly-summary="monthlySummary"
  :settlement="currentMonthlySettlement"
  :saving="settlementSaving"
  :canceling="settlementCanceling"
  @confirm-settlement="handleConfirmSettlement"
  @cancel-settlement="handleCancelSettlement"
/>
```

Pass the settlement to print:

```vue
<PrintViews
  :data="data"
  :days="printDays"
  :summary="weeklySummary"
  :monthly-summary="monthlySummary"
  :monthly-settlement="currentMonthlySettlement"
  :preview-mode="printPreviewMode"
/>
```

- [ ] **Step 6: Run App tests**

Run: `npm run test -- src/App.test.ts`

Expected: PASS after the real component exists in Task 5. If the import fails before Task 5, create a minimal `src/components/BonusSettlementPanel.vue` component with valid props and empty `<section class="bonus-settlement-panel" />`, then Task 5 replaces it.

- [ ] **Step 7: Commit**

```bash
git add src/api/client.ts src/App.vue src/App.test.ts src/components/BonusSettlementPanel.vue
git commit -m "feat: wire monthly settlement state"
```

---

### Task 5: Bonus Settlement Panel UI

**Files:**
- Create: `src/components/BonusSettlementPanel.vue`
- Create: `src/components/BonusSettlementPanel.test.ts`

- [ ] **Step 1: Write failing component tests**

Create `src/components/BonusSettlementPanel.test.ts`:

```ts
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import BonusSettlementPanel from "./BonusSettlementPanel.vue";
import type { MonthlySettlement, MonthlySummary } from "@/types/domain";

const monthlySummary: MonthlySummary = {
  monthStart: "2026-06-01",
  monthEnd: "2026-06-30",
  totalDays: 30,
  holidayNames: ["端午节"],
  rows: [
    {
      staffId: "staff-nurse",
      staffName: "李护士",
      staffType: "nurse",
      attendanceShifts: 12,
      coefficientTotal: 10,
      coefficientExcludedReason: ""
    },
    {
      staffId: "staff-head",
      staffName: "段护士长",
      staffType: "head_nurse",
      attendanceShifts: 10,
      coefficientTotal: null,
      coefficientExcludedReason: "护士长绩效单独核算"
    }
  ]
};

const settlement: MonthlySettlement = {
  id: "settlement-2026-06",
  month: "2026-06",
  monthStart: "2026-06-01",
  monthEnd: "2026-06-30",
  totalDays: 30,
  bonusPool: 1000,
  coefficientTotal: 10,
  settledAt: "2026-06-30T10:00:00.000Z",
  rows: [
    {
      staffId: "staff-nurse",
      staffName: "李护士",
      staffType: "nurse",
      attendanceShifts: 12,
      coefficientTotal: 10,
      coefficientExcludedReason: "",
      bonusAmount: 1000,
      bonusExcludedReason: ""
    },
    {
      staffId: "staff-head",
      staffName: "段护士长",
      staffType: "head_nurse",
      attendanceShifts: 10,
      coefficientTotal: null,
      coefficientExcludedReason: "护士长绩效单独核算",
      bonusAmount: 0,
      bonusExcludedReason: "护士长绩效单独核算"
    }
  ]
};

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(BonusSettlementPanel, {
    props: {
      adminMode: true,
      canceling: false,
      month: "2026-06",
      monthlySummary,
      saving: false,
      settlement: null,
      ...props
    }
  });
}

describe("BonusSettlementPanel", () => {
  it("shows trial allocation for an unlocked month", async () => {
    const wrapper = mountPanel();

    await wrapper.get('[data-testid="bonus-pool-input"]').setValue("1000");

    expect(wrapper.text()).toContain("2026-06");
    expect(wrapper.text()).toContain("未月结");
    expect(wrapper.text()).toContain("李护士");
    expect(wrapper.text()).toContain("1000.00");
    expect(wrapper.text()).toContain("段护士长");
    expect(wrapper.text()).toContain("护士长绩效单独核算");
  });

  it("emits confirm payload with month and bonus pool", async () => {
    const wrapper = mountPanel();

    await wrapper.get('[data-testid="bonus-pool-input"]').setValue("1000");
    await wrapper.get('[data-testid="confirm-settlement-button"]').trigger("click");

    expect(wrapper.emitted("confirmSettlement")).toEqual([[{ month: "2026-06", bonusPool: 1000 }]]);
  });

  it("disables settlement action outside admin mode", () => {
    const wrapper = mountPanel({ adminMode: false });

    expect(wrapper.get('[data-testid="confirm-settlement-button"]').attributes("disabled")).toBeDefined();
  });

  it("shows stored snapshot and emits cancel for a settled month", async () => {
    const wrapper = mountPanel({ settlement });

    expect(wrapper.text()).toContain("已月结");
    expect(wrapper.text()).toContain("2026-06-30 10:00");
    expect(wrapper.text()).toContain("1000.00");

    await wrapper.get('[data-testid="cancel-settlement-button"]').trigger("click");

    expect(wrapper.emitted("cancelSettlement")).toEqual([["2026-06"]]);
  });

  it("disables confirm when ordinary coefficient total is zero", async () => {
    const wrapper = mountPanel({
      monthlySummary: {
        ...monthlySummary,
        rows: [
          { ...monthlySummary.rows[0], coefficientTotal: 0 },
          monthlySummary.rows[1]
        ]
      }
    });

    await wrapper.get('[data-testid="bonus-pool-input"]').setValue("1000");

    expect(wrapper.text()).toContain("普通人员月总系数合计为 0，无法按系数分配奖金");
    expect(wrapper.get('[data-testid="confirm-settlement-button"]').attributes("disabled")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run component tests to verify they fail**

Run: `npm run test -- src/components/BonusSettlementPanel.test.ts`

Expected: FAIL because the component is empty or missing behavior.

- [ ] **Step 3: Implement component logic**

Use these script definitions in `src/components/BonusSettlementPanel.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import type { MonthlySettlement, MonthlySettlementRow, MonthlySummary } from "@/types/domain";
import { calculateBonusAllocation } from "@/lib/bonus";

const props = defineProps<{
  adminMode: boolean;
  canceling: boolean;
  month: string;
  monthlySummary: MonthlySummary;
  saving: boolean;
  settlement: MonthlySettlement | null;
}>();

const emit = defineEmits<{
  confirmSettlement: [payload: { month: string; bonusPool: number }];
  cancelSettlement: [month: string];
}>();

const bonusPoolText = ref("0");

const parsedBonusPool = computed(() => {
  const value = Number(bonusPoolText.value);
  return Number.isFinite(value) && value >= 0 ? value : null;
});

const allocation = computed(() => {
  return calculateBonusAllocation(props.monthlySummary, parsedBonusPool.value ?? 0);
});

const displayRows = computed<MonthlySettlementRow[]>(() => {
  return props.settlement?.rows ?? allocation.value.rows;
});

const displayBonusPool = computed(() => props.settlement?.bonusPool ?? allocation.value.bonusPool);
const displayCoefficientTotal = computed(() => props.settlement?.coefficientTotal ?? allocation.value.coefficientTotal);
const isSettled = computed(() => Boolean(props.settlement));
const invalidBonusPool = computed(() => parsedBonusPool.value === null);
const canConfirm = computed(() => {
  return props.adminMode && !isSettled.value && !props.saving && !invalidBonusPool.value && allocation.value.canSettle;
});

function formatMoney(value: number): string {
  return value.toFixed(2);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function confirmSettlement() {
  if (parsedBonusPool.value === null || !canConfirm.value) {
    return;
  }

  emit("confirmSettlement", {
    month: props.month,
    bonusPool: parsedBonusPool.value
  });
}

function cancelSettlement() {
  if (!props.adminMode || !props.settlement || props.canceling) {
    return;
  }

  emit("cancelSettlement", props.month);
}
</script>
```

The template must include these stable selectors:

```vue
<section class="bonus-settlement-panel">
  <div class="bonus-settlement-header">
    <div>
      <h2>月结与奖金</h2>
      <p>{{ month }} · {{ isSettled ? "已月结" : "未月结" }}</p>
    </div>
    <div class="bonus-settlement-total">
      <span>普通人员总系数</span>
      <strong>{{ displayCoefficientTotal.toFixed(2) }}</strong>
    </div>
  </div>

  <div class="bonus-settlement-controls" v-if="!isSettled">
    <label>
      <span>奖金总额</span>
      <input data-testid="bonus-pool-input" v-model="bonusPoolText" inputmode="decimal" type="number" min="0" step="0.01" />
    </label>
    <button
      data-testid="confirm-settlement-button"
      type="button"
      :disabled="!canConfirm"
      @click="confirmSettlement"
    >
      {{ saving ? "月结中" : "确认月结" }}
    </button>
  </div>

  <div class="bonus-settlement-controls" v-else>
    <span>奖金总额 {{ formatMoney(displayBonusPool) }}</span>
    <span>月结时间 {{ formatDateTime(settlement!.settledAt) }}</span>
    <button
      data-testid="cancel-settlement-button"
      type="button"
      :disabled="!adminMode || canceling"
      @click="cancelSettlement"
    >
      {{ canceling ? "取消中" : "取消月结" }}
    </button>
  </div>

  <p v-if="invalidBonusPool" class="bonus-settlement-warning">奖金总额格式不正确</p>
  <p v-else-if="!allocation.canSettle" class="bonus-settlement-warning">{{ allocation.message }}</p>

  <table class="bonus-settlement-table">
    <thead>
      <tr>
        <th>人员</th>
        <th>类型</th>
        <th>出勤班次</th>
        <th>月总系数</th>
        <th>分配金额</th>
        <th>备注</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in displayRows" :key="row.staffId">
        <td>{{ row.staffName }}</td>
        <td>{{ row.staffType === "head_nurse" ? "护士长" : row.staffType === "clerk" ? "文员" : "护士" }}</td>
        <td>{{ row.attendanceShifts }}</td>
        <td>{{ row.coefficientTotal === null ? "单独核算" : row.coefficientTotal.toFixed(2) }}</td>
        <td>{{ formatMoney(row.bonusAmount) }}</td>
        <td>{{ row.bonusExcludedReason || row.coefficientExcludedReason }}</td>
      </tr>
    </tbody>
  </table>
</section>
```

Add responsive styles that keep each mobile summary row to one line:

```css
.bonus-settlement-panel {
  border: 1px solid #d8e0ea;
  border-radius: 8px;
  background: #fff;
  padding: 16px;
}

.bonus-settlement-header,
.bonus-settlement-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.bonus-settlement-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
}

.bonus-settlement-table th,
.bonus-settlement-table td {
  border: 1px solid #d8e0ea;
  padding: 8px;
  text-align: center;
  white-space: nowrap;
}

.bonus-settlement-warning {
  margin: 10px 0 0;
  color: #b42318;
}

@media (max-width: 720px) {
  .bonus-settlement-panel {
    padding: 12px;
  }

  .bonus-settlement-table {
    display: block;
    overflow-x: auto;
  }

  .bonus-settlement-table th,
  .bonus-settlement-table td {
    padding: 6px;
    font-size: 12px;
  }
}
```

- [ ] **Step 4: Run component tests**

Run: `npm run test -- src/components/BonusSettlementPanel.test.ts`

Expected: PASS.

- [ ] **Step 5: Run App tests now that the real component exists**

Run: `npm run test -- src/App.test.ts src/components/BonusSettlementPanel.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/BonusSettlementPanel.vue src/components/BonusSettlementPanel.test.ts src/App.test.ts
git commit -m "feat: add monthly settlement panel"
```

---

### Task 6: Month Print and PDF Settlement Snapshot Output

**Files:**
- Modify: `src/components/PrintViews.vue`
- Modify: `src/components/PrintViews.test.ts`
- Modify: `src/App.test.ts`

- [ ] **Step 1: Write failing PrintViews tests**

In `src/components/PrintViews.test.ts`, import `MonthlySettlement`:

```ts
import type { MonthlySettlement, MonthlySummary, ScheduleEntry, Shift, StaffMember, WeeklySummary } from "@/types/domain";
```

Add this fixture near `monthlySummary`:

```ts
const monthlySettlement: MonthlySettlement = {
  id: "settlement-2026-06",
  month: "2026-06",
  monthStart: "2026-06-01",
  monthEnd: "2026-06-30",
  totalDays: 30,
  bonusPool: 2000,
  coefficientTotal: 7.9,
  settledAt: "2026-06-30T10:00:00.000Z",
  rows: [
    {
      staffId: "staff-1",
      staffName: "王护士",
      staffType: "nurse",
      attendanceShifts: 5,
      coefficientTotal: 5.5,
      coefficientExcludedReason: "",
      bonusAmount: 1392.41,
      bonusExcludedReason: ""
    },
    {
      staffId: "staff-clerk",
      staffName: "李文员",
      staffType: "clerk",
      attendanceShifts: 2,
      coefficientTotal: 2.4,
      coefficientExcludedReason: "",
      bonusAmount: 607.59,
      bonusExcludedReason: ""
    }
  ]
};
```

Add tests:

```ts
it("prints bonus settlement snapshot below the monthly summary", () => {
  const wrapper = mount(PrintViews, {
    props: {
      data: createData([]),
      days,
      summary,
      monthlySummary,
      monthlySettlement
    }
  });

  const bonusSummary = wrapper.get(".print-bonus-summary");
  expect(bonusSummary.text()).toContain("奖金分配");
  expect(bonusSummary.text()).toContain("奖金总额 2000.00");
  expect(bonusSummary.text()).toContain("月结时间 2026-06-30 10:00");
  expect(bonusSummary.text()).toContain("王护士");
  expect(bonusSummary.text()).toContain("1392.41");
  expect(bonusSummary.text()).toContain("李文员");
  expect(bonusSummary.text()).toContain("607.59");
});

it("uses settled snapshot rows for printed monthly totals", () => {
  const wrapper = mount(PrintViews, {
    props: {
      data: createData([]),
      days,
      summary,
      monthlySummary,
      monthlySettlement: {
        ...monthlySettlement,
        rows: [
          {
            ...monthlySettlement.rows[0],
            attendanceShifts: 99,
            coefficientTotal: 88.88
          }
        ]
      }
    }
  });

  const monthSummary = wrapper.get(".print-month-summary");
  expect(monthSummary.text()).toContain("99");
  expect(monthSummary.text()).toContain("88.88");
  expect(monthSummary.text()).not.toContain("李文员");
});
```

- [ ] **Step 2: Run PrintViews tests to verify they fail**

Run: `npm run test -- src/components/PrintViews.test.ts`

Expected: FAIL because `monthlySettlement` prop and `.print-bonus-summary` do not exist.

- [ ] **Step 3: Add PrintViews prop and snapshot rows**

In `src/components/PrintViews.vue`, add `MonthlySettlement` to type imports and prop definition:

```ts
monthlySettlement?: MonthlySettlement | null;
```

Add computed rows:

```ts
const printedMonthlyRows = computed(() => props.monthlySettlement?.rows ?? props.monthlySummary?.rows ?? []);
```

Update the existing monthly summary table to render `printedMonthlyRows` instead of `monthlySummary.rows`.

- [ ] **Step 4: Render bonus snapshot section**

Add helpers:

```ts
function formatMoney(value: number): string {
  return value.toFixed(2);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
```

Add this section below `.print-month-summary`:

```vue
<section v-if="monthlySettlement" class="print-bonus-summary">
  <h2>奖金分配</h2>
  <p>
    奖金总额 {{ formatMoney(monthlySettlement.bonusPool) }}；普通人员总系数
    {{ monthlySettlement.coefficientTotal.toFixed(2) }}；月结时间
    {{ formatDateTime(monthlySettlement.settledAt) }}。
  </p>
  <table>
    <thead>
      <tr>
        <th>人员</th>
        <th>人员类型</th>
        <th>月总系数</th>
        <th>分配金额</th>
        <th>备注</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in monthlySettlement.rows" :key="row.staffId">
        <td>{{ row.staffName }}</td>
        <td>{{ formatStaffType(row.staffType) }}</td>
        <td>{{ row.coefficientTotal === null ? "单独核算" : row.coefficientTotal.toFixed(2) }}</td>
        <td>{{ formatMoney(row.bonusAmount) }}</td>
        <td>{{ row.bonusExcludedReason || row.coefficientExcludedReason }}</td>
      </tr>
    </tbody>
  </table>
</section>
```

Reuse the same print table border styles as `.print-month-summary` by extending selectors:

```css
.print-month-summary table,
.print-bonus-summary table {
  width: 100%;
  border-collapse: collapse;
}
```

- [ ] **Step 5: Extend App print-preview test**

In `src/App.test.ts`, update `PrintViewsStub` props to include `monthlySettlement` and show it:

```ts
props: ["monthlySummary", "monthlySettlement", "previewMode"],
template: `
  <section class="print-views-stub">
    <div v-if="previewMode === 'week'" class="print-preview-active">周表预览</div>
    <div v-if="previewMode === 'month'" class="print-preview-active">
      月表预览
      <span v-if="monthlySummary">
        月度汇总 {{ monthlySummary.rows.map((row) => [row.staffName, row.attendanceShifts, row.coefficientTotal === null ? row.coefficientExcludedReason : row.coefficientTotal.toFixed(2)].join(":")).join("|") }}
      </span>
      <span v-if="monthlySettlement">月结 {{ monthlySettlement.month }} {{ monthlySettlement.bonusPool.toFixed(2) }}</span>
    </div>
  </section>
`
```

Add this App test:

```ts
it("passes the selected monthly settlement into the month print preview", async () => {
  const restoreMobileViewport = mockMobileViewport(true);
  const { printSpy, restore: restorePrint } = mockSystemPrint();

  try {
    const wrapper = mountApp({
      ...testData,
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
          rows: []
        }
      ]
    });

    await flushPromises();
    await wrapper.get('[data-testid="print-month"]').trigger("click");
    await nextTick();

    expect(printSpy).not.toHaveBeenCalled();
    expect(wrapper.get(".print-preview-active").text()).toContain("月结 2026-06 1000.00");
  } finally {
    restoreMobileViewport();
    restorePrint();
  }
});
```

- [ ] **Step 6: Run print and App tests**

Run: `npm run test -- src/components/PrintViews.test.ts src/App.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/PrintViews.vue src/components/PrintViews.test.ts src/App.test.ts
git commit -m "feat: print monthly settlement snapshots"
```

---

### Task 7: Browser Workflow and E2E Lock Validation

**Files:**
- Modify: `tests/e2e/schedule.spec.ts`

- [ ] **Step 1: Write failing E2E test**

Add this test to `tests/e2e/schedule.spec.ts`:

```ts
test("locks schedule editing after monthly settlement", async ({ page, request }) => {
  await page.clock.setFixedTime("2026-06-16T08:00:00+08:00");

  const session = await request.post("/api/admin/session", {
    data: { password: "123456" }
  });
  expect(session.ok()).toBeTruthy();
  const { token } = (await session.json()) as { token: string };
  await request.put("/api/data/schedule-entry", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      date: quickFillDate,
      staffId: quickFillStaffId,
      shiftIds: ["shift-a1"],
      note: ""
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: /输入管理密码/ }).click();
  await page.getByPlaceholder("管理密码").fill("123456");
  await page.getByRole("button", { name: "进入编辑模式" }).click();
  await page.getByTestId("bonus-pool-input").fill("1000");
  await page.getByTestId("confirm-settlement-button").click();
  await expect(page.getByText("月结已完成")).toBeVisible();

  await page.getByRole("button", { name: /A1/ }).click();
  await page.getByTestId(`schedule-cell-${quickFillStaffId}-2026-06-16`).click();

  await expect(page.getByText("该月份已月结，不能修改排班")).toBeVisible();
});
```

- [ ] **Step 2: Run E2E test to verify it fails before UI/API completion**

Run: `npm run test:e2e -- tests/e2e/schedule.spec.ts`

Expected before Tasks 3-6: FAIL because the settlement controls or API behavior are absent. Expected after Tasks 3-6: PASS.

- [ ] **Step 3: Run the E2E test after implementation**

Run: `npm run test:e2e -- tests/e2e/schedule.spec.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/schedule.spec.ts
git commit -m "test: cover monthly settlement lock workflow"
```

---

### Task 8: Full Verification and Documentation Check

**Files:**
- Read: `docs/superpowers/specs/2026-06-17-bonus-settlement-design.md`
- Read: `docs/superpowers/plans/2026-06-17-bonus-settlement-implementation.md`

- [ ] **Step 1: Run full unit and component tests**

Run: `npm run test`

Expected: PASS.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: PASS with Vite build output and no TypeScript errors.

- [ ] **Step 3: Run E2E suite**

Run: `npm run test:e2e`

Expected: PASS.

- [ ] **Step 4: Search for accidental unfinished markers**

Run: `rg -n "TO[D]O|TB[D]|implement\\slater|fill\\sin\\sdetails|类[似]|待[定]" docs/superpowers/plans/2026-06-17-bonus-settlement-implementation.md src server tests`

Expected: no matches introduced by this feature.

- [ ] **Step 5: Confirm spec coverage manually**

Check these requirements from `docs/superpowers/specs/2026-06-17-bonus-settlement-design.md` against the implemented UI/API:

```text
按月总系数分配奖金
护士长排除普通奖金池
保存月结快照
月结后禁止修改当月排班
取消月结后恢复可编辑
已月结月份展示快照结果
未月结月份展示实时月度汇总和试算结果
已月结月表打印显示奖金分配快照
```

Expected: every line maps to a passing test or a verified UI/API behavior.

- [ ] **Step 6: Final commit if verification changed files**

Run: `git status --short`

Expected: clean. If test snapshots, formatting, or docs changed during verification, commit them:

```bash
git add docs/superpowers/plans/2026-06-17-bonus-settlement-implementation.md src server tests
git commit -m "chore: verify monthly settlement workflow"
```

---

## Self-Review Notes

- Spec coverage: Tasks 2, 3, 5, 6, and 7 cover bonus allocation, snapshot persistence, month lock, cancellation, locked/unlocked display, and print/PDF output.
- Type consistency: `MonthlySettlement`, `MonthlySettlementRow`, `BonusAllocation`, `calculateBonusAllocation()`, `createMonthlySettlement()`, `saveMonthlySettlement()`, and `deleteMonthlySettlement()` use the same names across tasks.
- Execution order: Tasks are ordered so tests can fail for a clear reason and then pass after the smallest coherent implementation.
