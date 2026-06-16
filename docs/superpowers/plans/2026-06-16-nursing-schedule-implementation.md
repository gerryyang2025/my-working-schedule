# Nursing Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the phase-one International Medical Department nursing schedule web app with editable staff, shifts, holidays, schedule entries, weekly calculations, full-screen display, and print views.

**Architecture:** Use a Vue 3 single-page app for the scheduling workstation and an Express API for persistence. The frontend talks only to API endpoints; `data/app-data.json` remains the tracked seed dataset, while development runtime data defaults to ignored `data/app-data.local.json`, keeping the storage boundary replaceable by Go/Gin/etcd later.

**Tech Stack:** Vue 3, Vite, TypeScript, Element Plus, Express, Vitest, Vue Test Utils, Supertest, Playwright, JSON file storage.

---

## Scope Check

The approved spec describes one cohesive subsystem: phase-one scheduling management. It includes frontend workflow, simple backend persistence, configurable data, weekly calculation, and print output. This plan keeps them in one implementation track because each piece is required to produce a working scheduling tool.

## File Structure

Create these files:

- `package.json`: npm scripts and dependencies for the frontend, API server, unit tests, and e2e tests.
- `tsconfig.json`: shared TypeScript settings.
- `tsconfig.node.json`: TypeScript settings for Node-side files.
- `vite.config.ts`: Vite configuration and test environment.
- `index.html`: Vite HTML entry.
- `playwright.config.ts`: Playwright configuration.
- `data/app-data.json`: tracked seed dataset used to initialize local runtime data.
- `server/types.ts`: server-side domain types.
- `server/seed.ts`: initial seed data.
- `server/storage.ts`: JSON file load/save helpers.
- `server/routes.ts`: Express routes and validation.
- `server/index.ts`: Express server entrypoint.
- `server/routes.test.ts`: API integration tests.
- `src/main.ts`: Vue bootstrap.
- `src/App.vue`: page shell and app-level state wiring.
- `src/types/domain.ts`: shared frontend domain types.
- `src/api/client.ts`: typed API client.
- `src/lib/date.ts`: month, week, weekday, and holiday date helpers.
- `src/lib/calculation.ts`: weekly attendance, overtime, and coefficient calculations.
- `src/lib/validation.ts`: schedule entry validation helpers.
- `src/lib/date.test.ts`: unit tests for week/month helpers.
- `src/lib/calculation.test.ts`: unit tests for weekly calculation rules.
- `src/lib/validation.test.ts`: unit tests for edit validation.
- `src/components/AppToolbar.vue`: month/date/week controls, full-screen, print, and admin mode controls.
- `src/components/ShiftPalette.vue`: shift brush selector.
- `src/components/ScheduleGrid.vue`: sticky schedule matrix and quick fill handling.
- `src/components/CellEditorDialog.vue`: one-cell editor for main and second shift.
- `src/components/WeeklySummary.vue`: weekly calculation summary.
- `src/components/ManagementDrawer.vue`: staff, shift, and holiday maintenance.
- `src/components/PrintViews.vue`: print-only month and week output sections.
- `src/styles/main.css`: application layout, table, color, full-screen, and print CSS.
- `tests/e2e/schedule.spec.ts`: browser-level workflow checks.

Modify these files:

- `.gitignore`: keep generated local variants ignored if implementation creates them.
- `README.md`: document install, dev, test, and data-file commands.

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `playwright.config.ts`
- Modify: `README.md`

- [ ] **Step 1: Create the npm project files**

Create `package.json`:

```json
{
  "name": "my-working-schedule",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently -k \"npm:dev:api\" \"npm:dev:web\"",
    "dev:web": "vite --host 127.0.0.1 --port 5173",
    "dev:api": "tsx watch server/index.ts",
    "build": "vue-tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "lint": "vue-tsc --noEmit"
  },
  "dependencies": {
    "@vitejs/plugin-vue": "^5.2.4",
    "element-plus": "^2.9.11",
    "express": "^4.21.2",
    "lucide-vue-next": "^0.468.0",
    "vue": "^3.5.13"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.1",
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.2",
    "@types/supertest": "^6.0.2",
    "@vitejs/plugin-vue-jsx": "^4.1.1",
    "@vue/test-utils": "^2.4.6",
    "concurrently": "^9.1.0",
    "jsdom": "^25.0.1",
    "supertest": "^7.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vite": "^6.0.3",
    "vitest": "^2.1.8",
    "vue-tsc": "^2.1.10"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vitest/globals", "node"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "server/**/*.ts", "tests/**/*.ts", "vite.config.ts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Create `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts", "server/**/*.ts", "playwright.config.ts"]
}
```

Create `vite.config.ts`:

```ts
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3001"
    }
  },
  test: {
    environment: "jsdom",
    globals: true
  }
});
```

Create `index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>国际医学部护理排班管理系统</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry"
  },
  webServer: [
    {
      command: "npm run dev:api",
      url: "http://127.0.0.1:3001/api/health",
      reuseExistingServer: true
    },
    {
      command: "npm run dev:web",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true
    }
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
```

- [ ] **Step 2: Update README with local commands**

Append this section to `README.md`:

````md
## 本地开发

```bash
npm install
npm run dev
```

默认前端地址为 `http://127.0.0.1:5173`，API 地址为 `http://127.0.0.1:3001`。

## 验证命令

```bash
npm run test
npm run build
npm run test:e2e
```
````

- [ ] **Step 3: Install dependencies**

Run:

```bash
npm install
```

Expected: command exits with code 0 and creates `package-lock.json`.

- [ ] **Step 4: Run initial checks**

Run:

```bash
npm run test
```

Expected: Vitest starts and reports no test files or a no-tests message. If Vitest exits nonzero because no tests exist, continue to Task 2 and use the first unit test as the initial passing check.

- [ ] **Step 5: Commit scaffold**

Run:

```bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts index.html playwright.config.ts README.md
git commit -m "chore: scaffold schedule app"
```

## Task 2: Domain Types and Seed Data

**Files:**
- Create: `src/types/domain.ts`
- Create: `server/types.ts`
- Create: `server/seed.ts`
- Create: `data/app-data.json`
- Test: `src/lib/validation.test.ts` starts in Task 4

- [ ] **Step 1: Create shared frontend domain types**

Create `src/types/domain.ts`:

```ts
export type StaffType = "nurse" | "clerk" | "head_nurse";

export interface StaffMember {
  id: string;
  jobId: string;
  name: string;
  type: StaffType;
  isAdmin: boolean;
  enabled: boolean;
  sortOrder: number;
}

export interface Shift {
  id: string;
  name: string;
  shortName: string;
  color: string;
  countsAttendance: boolean;
  coefficient: number;
  enabled: boolean;
  sortOrder: number;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
  affectsRequiredAttendance: boolean;
}

export interface ScheduleEntry {
  id: string;
  date: string;
  staffId: string;
  shiftIds: string[];
  note: string;
}

export interface Settings {
  adminPassword: string;
  defaultRequiredShiftsPerWeek: number;
  version: number;
}

export interface AppData {
  staff: StaffMember[];
  shifts: Shift[];
  holidays: Holiday[];
  scheduleEntries: ScheduleEntry[];
  settings: Settings;
}

export interface WeeklyStaffSummary {
  staffId: string;
  staffName: string;
  staffType: StaffType;
  attendanceShifts: number;
  requiredShifts: number;
  overtimeShifts: number;
  coefficientTotal: number | null;
  coefficientExcludedReason: string;
}

export interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  requiredShifts: number;
  holidayDeduction: number;
  holidayNames: string[];
  rows: WeeklyStaffSummary[];
}
```

- [ ] **Step 2: Create server type aliases**

Create `server/types.ts`:

```ts
export type {
  AppData,
  Holiday,
  ScheduleEntry,
  Settings,
  Shift,
  StaffMember,
  StaffType
} from "../src/types/domain";
```

- [ ] **Step 3: Create seed data factory**

Create `server/seed.ts`:

```ts
import type { AppData } from "./types";

export function createSeedData(): AppData {
  return {
    staff: [
      {
        id: "staff-head-001",
        jobId: "000228",
        name: "段鸿露",
        type: "head_nurse",
        isAdmin: true,
        enabled: true,
        sortOrder: 1
      },
      {
        id: "staff-nurse-001",
        jobId: "100001",
        name: "李护士",
        type: "nurse",
        isAdmin: false,
        enabled: true,
        sortOrder: 2
      },
      {
        id: "staff-clerk-001",
        jobId: "200001",
        name: "王文员",
        type: "clerk",
        isAdmin: false,
        enabled: true,
        sortOrder: 3
      }
    ],
    shifts: [
      {
        id: "shift-a1",
        name: "A1组长",
        shortName: "A1",
        color: "#2563EB",
        countsAttendance: true,
        coefficient: 1.5,
        enabled: true,
        sortOrder: 1
      },
      {
        id: "shift-p1",
        name: "P1",
        shortName: "P1",
        color: "#0F766E",
        countsAttendance: true,
        coefficient: 1.3,
        enabled: true,
        sortOrder: 2
      },
      {
        id: "shift-n1",
        name: "N1夜班",
        shortName: "N1",
        color: "#DC2626",
        countsAttendance: true,
        coefficient: 1.3,
        enabled: true,
        sortOrder: 3
      },
      {
        id: "shift-office",
        name: "办公班",
        shortName: "办公",
        color: "#7C3AED",
        countsAttendance: true,
        coefficient: 1.2,
        enabled: true,
        sortOrder: 4
      },
      {
        id: "shift-rest",
        name: "休息",
        shortName: "休",
        color: "#64748B",
        countsAttendance: false,
        coefficient: 0,
        enabled: true,
        sortOrder: 5
      }
    ],
    holidays: [
      {
        id: "holiday-2026-06-19",
        date: "2026-06-19",
        name: "端午节",
        affectsRequiredAttendance: true
      }
    ],
    scheduleEntries: [],
    settings: {
      adminPassword: "change-me-before-deploy",
      defaultRequiredShiftsPerWeek: 5,
      version: 1
    }
  };
}
```

- [ ] **Step 4: Create tracked initial JSON data**

Create `data/app-data.json` with the exact JSON returned by `createSeedData()`:

```json
{
  "staff": [
    {
      "id": "staff-head-001",
      "jobId": "000228",
      "name": "段鸿露",
      "type": "head_nurse",
      "isAdmin": true,
      "enabled": true,
      "sortOrder": 1
    },
    {
      "id": "staff-nurse-001",
      "jobId": "100001",
      "name": "李护士",
      "type": "nurse",
      "isAdmin": false,
      "enabled": true,
      "sortOrder": 2
    },
    {
      "id": "staff-clerk-001",
      "jobId": "200001",
      "name": "王文员",
      "type": "clerk",
      "isAdmin": false,
      "enabled": true,
      "sortOrder": 3
    }
  ],
  "shifts": [
    {
      "id": "shift-a1",
      "name": "A1组长",
      "shortName": "A1",
      "color": "#2563EB",
      "countsAttendance": true,
      "coefficient": 1.5,
      "enabled": true,
      "sortOrder": 1
    },
    {
      "id": "shift-p1",
      "name": "P1",
      "shortName": "P1",
      "color": "#0F766E",
      "countsAttendance": true,
      "coefficient": 1.3,
      "enabled": true,
      "sortOrder": 2
    },
    {
      "id": "shift-n1",
      "name": "N1夜班",
      "shortName": "N1",
      "color": "#DC2626",
      "countsAttendance": true,
      "coefficient": 1.3,
      "enabled": true,
      "sortOrder": 3
    },
    {
      "id": "shift-office",
      "name": "办公班",
      "shortName": "办公",
      "color": "#7C3AED",
      "countsAttendance": true,
      "coefficient": 1.2,
      "enabled": true,
      "sortOrder": 4
    },
    {
      "id": "shift-rest",
      "name": "休息",
      "shortName": "休",
      "color": "#64748B",
      "countsAttendance": false,
      "coefficient": 0,
      "enabled": true,
      "sortOrder": 5
    }
  ],
  "holidays": [
    {
      "id": "holiday-2026-06-19",
      "date": "2026-06-19",
      "name": "端午节",
      "affectsRequiredAttendance": true
    }
  ],
  "scheduleEntries": [],
  "settings": {
    "adminPassword": "change-me-before-deploy",
    "defaultRequiredShiftsPerWeek": 5,
    "version": 1
  }
}
```

- [ ] **Step 5: Run type check**

Run:

```bash
npm run lint
```

Expected: type check passes or reports missing Vue entry files. If missing Vue entry files are reported, continue to Task 7 where `src/main.ts` and `src/App.vue` are created.

- [ ] **Step 6: Commit domain seed**

Run:

```bash
git add src/types/domain.ts server/types.ts server/seed.ts data/app-data.json
git commit -m "feat: define schedule domain seed data"
```

## Task 3: Date and Week Utilities

**Files:**
- Create: `src/lib/date.ts`
- Test: `src/lib/date.test.ts`

- [ ] **Step 1: Write date utility tests**

Create `src/lib/date.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getMonthDays, getWeekRange, toDateKey } from "./date";

describe("date utilities", () => {
  it("formats local date keys as yyyy-mm-dd", () => {
    expect(toDateKey(new Date(2026, 5, 3))).toBe("2026-06-03");
  });

  it("returns every day in a month", () => {
    const days = getMonthDays(2026, 6);
    expect(days).toHaveLength(30);
    expect(days[0].key).toBe("2026-06-01");
    expect(days[0].weekdayName).toBe("周一");
    expect(days[29].key).toBe("2026-06-30");
  });

  it("uses Monday to Sunday week range", () => {
    expect(getWeekRange("2026-06-17")).toEqual({
      start: "2026-06-15",
      end: "2026-06-21"
    });
  });

  it("keeps Sunday in the previous Monday-start week", () => {
    expect(getWeekRange("2026-06-21")).toEqual({
      start: "2026-06-15",
      end: "2026-06-21"
    });
  });
});
```

- [ ] **Step 2: Run the failing date tests**

Run:

```bash
npm run test -- src/lib/date.test.ts
```

Expected: FAIL because `src/lib/date.ts` does not exist.

- [ ] **Step 3: Implement date helpers**

Create `src/lib/date.ts`:

```ts
export interface CalendarDay {
  key: string;
  dayOfMonth: number;
  weekday: number;
  weekdayName: string;
  isWeekend: boolean;
}

const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(key: string, offset: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + offset);
  return toDateKey(date);
}

export function getMonthDays(year: number, month: number): CalendarDay[] {
  const lastDay = new Date(year, month, 0).getDate();
  return Array.from({ length: lastDay }, (_, index) => {
    const date = new Date(year, month - 1, index + 1);
    const weekday = date.getDay();
    return {
      key: toDateKey(date),
      dayOfMonth: index + 1,
      weekday,
      weekdayName: WEEKDAY_NAMES[weekday],
      isWeekend: weekday === 0 || weekday === 6
    };
  });
}

export function getWeekRange(dateKey: string): { start: string; end: string } {
  const date = parseDateKey(dateKey);
  const weekday = date.getDay();
  const offsetToMonday = weekday === 0 ? -6 : 1 - weekday;
  const monday = new Date(date);
  monday.setDate(date.getDate() + offsetToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: toDateKey(monday),
    end: toDateKey(sunday)
  };
}

export function listDateKeys(start: string, end: string): string[] {
  const keys: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    keys.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return keys;
}
```

- [ ] **Step 4: Run date tests**

Run:

```bash
npm run test -- src/lib/date.test.ts
```

Expected: PASS with 4 tests passing.

- [ ] **Step 5: Commit date utilities**

Run:

```bash
git add src/lib/date.ts src/lib/date.test.ts
git commit -m "feat: add schedule date utilities"
```

## Task 4: Schedule Validation Rules

**Files:**
- Create: `src/lib/validation.ts`
- Test: `src/lib/validation.test.ts`

- [ ] **Step 1: Write validation tests**

Create `src/lib/validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Shift } from "../types/domain";
import { validateScheduleShiftIds } from "./validation";

const shifts: Shift[] = [
  {
    id: "shift-a1",
    name: "A1组长",
    shortName: "A1",
    color: "#2563EB",
    countsAttendance: true,
    coefficient: 1.5,
    enabled: true,
    sortOrder: 1
  },
  {
    id: "shift-rest",
    name: "休息",
    shortName: "休",
    color: "#64748B",
    countsAttendance: false,
    coefficient: 0,
    enabled: false,
    sortOrder: 2
  }
];

describe("validateScheduleShiftIds", () => {
  it("accepts zero, one, or two enabled shifts", () => {
    expect(validateScheduleShiftIds([], shifts).ok).toBe(true);
    expect(validateScheduleShiftIds(["shift-a1"], shifts).ok).toBe(true);
    expect(validateScheduleShiftIds(["shift-a1", "shift-a1"], shifts).ok).toBe(false);
  });

  it("rejects more than two shifts", () => {
    const result = validateScheduleShiftIds(["shift-a1", "shift-a1", "shift-a1"], shifts);
    expect(result).toEqual({ ok: false, message: "单人单日最多两个班次" });
  });

  it("rejects disabled shifts", () => {
    const result = validateScheduleShiftIds(["shift-rest"], shifts);
    expect(result).toEqual({ ok: false, message: "班次已禁用：休息" });
  });

  it("rejects unknown shifts", () => {
    const result = validateScheduleShiftIds(["shift-missing"], shifts);
    expect(result).toEqual({ ok: false, message: "班次不存在：shift-missing" });
  });
});
```

- [ ] **Step 2: Run the failing validation tests**

Run:

```bash
npm run test -- src/lib/validation.test.ts
```

Expected: FAIL because `src/lib/validation.ts` does not exist.

- [ ] **Step 3: Implement validation helper**

Create `src/lib/validation.ts`:

```ts
import type { Shift } from "../types/domain";

export interface ValidationResult {
  ok: boolean;
  message: string;
}

export function validateScheduleShiftIds(shiftIds: string[], shifts: Shift[]): ValidationResult {
  if (shiftIds.length > 2) {
    return { ok: false, message: "单人单日最多两个班次" };
  }

  if (new Set(shiftIds).size !== shiftIds.length) {
    return { ok: false, message: "同一天不能重复保存同一个班次" };
  }

  const shiftMap = new Map(shifts.map((shift) => [shift.id, shift]));
  for (const shiftId of shiftIds) {
    const shift = shiftMap.get(shiftId);
    if (!shift) {
      return { ok: false, message: `班次不存在：${shiftId}` };
    }
    if (!shift.enabled) {
      return { ok: false, message: `班次已禁用：${shift.name}` };
    }
  }

  return { ok: true, message: "" };
}
```

- [ ] **Step 4: Run validation tests**

Run:

```bash
npm run test -- src/lib/validation.test.ts
```

Expected: PASS with 4 tests passing.

- [ ] **Step 5: Commit validation helper**

Run:

```bash
git add src/lib/validation.ts src/lib/validation.test.ts
git commit -m "feat: validate schedule shift entries"
```

## Task 5: Weekly Calculation Engine

**Files:**
- Create: `src/lib/calculation.ts`
- Test: `src/lib/calculation.test.ts`

- [ ] **Step 1: Write calculation tests**

Create `src/lib/calculation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AppData } from "@/types/domain";
import { calculateWeeklySummary } from "./calculation";

const baseData: AppData = {
  staff: [
    {
      id: "staff-head",
      jobId: "000228",
      name: "护士长",
      type: "head_nurse",
      isAdmin: true,
      enabled: true,
      sortOrder: 1
    },
    {
      id: "staff-nurse",
      jobId: "100001",
      name: "护士",
      type: "nurse",
      isAdmin: false,
      enabled: true,
      sortOrder: 2
    },
    {
      id: "staff-clerk",
      jobId: "200001",
      name: "文员",
      type: "clerk",
      isAdmin: false,
      enabled: true,
      sortOrder: 3
    }
  ],
  shifts: [
    {
      id: "shift-day",
      name: "白班",
      shortName: "白",
      color: "#2563EB",
      countsAttendance: true,
      coefficient: 1.3,
      enabled: true,
      sortOrder: 1
    },
    {
      id: "shift-night",
      name: "夜班",
      shortName: "夜",
      color: "#DC2626",
      countsAttendance: true,
      coefficient: 1.5,
      enabled: true,
      sortOrder: 2
    },
    {
      id: "shift-rest",
      name: "休",
      shortName: "休",
      color: "#64748B",
      countsAttendance: false,
      coefficient: 0,
      enabled: true,
      sortOrder: 3
    }
  ],
  holidays: [
    {
      id: "holiday-dragon",
      date: "2026-06-19",
      name: "端午节",
      affectsRequiredAttendance: true
    }
  ],
  scheduleEntries: [
    { id: "e1", date: "2026-06-15", staffId: "staff-nurse", shiftIds: ["shift-day"], note: "" },
    { id: "e2", date: "2026-06-16", staffId: "staff-nurse", shiftIds: ["shift-day"], note: "" },
    { id: "e3", date: "2026-06-17", staffId: "staff-nurse", shiftIds: ["shift-day", "shift-night"], note: "" },
    { id: "e4", date: "2026-06-18", staffId: "staff-nurse", shiftIds: ["shift-day"], note: "" },
    { id: "e5", date: "2026-06-20", staffId: "staff-clerk", shiftIds: ["shift-day"], note: "" },
    { id: "e6", date: "2026-06-15", staffId: "staff-head", shiftIds: ["shift-day", "shift-night"], note: "" }
  ],
  settings: {
    adminPassword: "change-me-before-deploy",
    defaultRequiredShiftsPerWeek: 5,
    version: 1
  }
};

describe("calculateWeeklySummary", () => {
  it("deducts affected holidays from required shifts", () => {
    const summary = calculateWeeklySummary(baseData, "2026-06-17");
    expect(summary.requiredShifts).toBe(4);
    expect(summary.holidayDeduction).toBe(1);
    expect(summary.holidayNames).toEqual(["端午节"]);
  });

  it("calculates attendance by shift count instead of natural day", () => {
    const summary = calculateWeeklySummary(baseData, "2026-06-17");
    const nurse = summary.rows.find((row) => row.staffId === "staff-nurse");
    expect(nurse?.attendanceShifts).toBe(5);
    expect(nurse?.overtimeShifts).toBe(1);
    expect(nurse?.coefficientTotal).toBe(6.7);
  });

  it("counts clerks with the same rules as nurses", () => {
    const summary = calculateWeeklySummary(baseData, "2026-06-17");
    const clerk = summary.rows.find((row) => row.staffId === "staff-clerk");
    expect(clerk?.attendanceShifts).toBe(1);
    expect(clerk?.overtimeShifts).toBe(0);
    expect(clerk?.coefficientTotal).toBe(1.3);
  });

  it("counts head nurse attendance and overtime but excludes coefficient", () => {
    const summary = calculateWeeklySummary(baseData, "2026-06-17");
    const head = summary.rows.find((row) => row.staffId === "staff-head");
    expect(head?.attendanceShifts).toBe(2);
    expect(head?.overtimeShifts).toBe(0);
    expect(head?.coefficientTotal).toBeNull();
    expect(head?.coefficientExcludedReason).toBe("护士长绩效单独核算");
  });
});
```

- [ ] **Step 2: Run the failing calculation tests**

Run:

```bash
npm run test -- src/lib/calculation.test.ts
```

Expected: FAIL because `src/lib/calculation.ts` does not exist.

- [ ] **Step 3: Implement weekly calculation**

Create `src/lib/calculation.ts`:

```ts
import type { AppData, ScheduleEntry, Shift, StaffMember, WeeklySummary } from "@/types/domain";
import { getWeekRange } from "./date";

function isWithinRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function roundCoefficient(value: number): number {
  return Math.round(value * 100) / 100;
}

function summarizeStaff(
  staff: StaffMember,
  entries: ScheduleEntry[],
  shiftMap: Map<string, Shift>,
  requiredShifts: number
) {
  let attendanceShifts = 0;
  let coefficientTotal = 0;

  for (const entry of entries) {
    for (const shiftId of entry.shiftIds) {
      const shift = shiftMap.get(shiftId);
      if (!shift || !shift.enabled) {
        continue;
      }
      if (shift.countsAttendance) {
        attendanceShifts += 1;
      }
      coefficientTotal += shift.coefficient;
    }
  }

  const overtimeShifts = Math.max(0, attendanceShifts - requiredShifts);
  const isHeadNurse = staff.type === "head_nurse";

  return {
    staffId: staff.id,
    staffName: staff.name,
    staffType: staff.type,
    attendanceShifts,
    requiredShifts,
    overtimeShifts,
    coefficientTotal: isHeadNurse ? null : roundCoefficient(coefficientTotal),
    coefficientExcludedReason: isHeadNurse ? "护士长绩效单独核算" : ""
  };
}

export function calculateWeeklySummary(data: AppData, selectedDate: string): WeeklySummary {
  const { start, end } = getWeekRange(selectedDate);
  const affectedHolidays = data.holidays.filter(
    (holiday) => holiday.affectsRequiredAttendance && isWithinRange(holiday.date, start, end)
  );
  const holidayDeduction = affectedHolidays.length;
  const requiredShifts = Math.max(0, data.settings.defaultRequiredShiftsPerWeek - holidayDeduction);
  const enabledStaff = [...data.staff]
    .filter((staff) => staff.enabled)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const shiftMap = new Map(data.shifts.map((shift) => [shift.id, shift]));
  const weekEntries = data.scheduleEntries.filter((entry) => isWithinRange(entry.date, start, end));

  return {
    weekStart: start,
    weekEnd: end,
    requiredShifts,
    holidayDeduction,
    holidayNames: affectedHolidays.map((holiday) => holiday.name),
    rows: enabledStaff.map((staff) =>
      summarizeStaff(
        staff,
        weekEntries.filter((entry) => entry.staffId === staff.id),
        shiftMap,
        requiredShifts
      )
    )
  };
}
```

- [ ] **Step 4: Run calculation tests**

Run:

```bash
npm run test -- src/lib/calculation.test.ts
```

Expected: PASS with 4 tests passing.

- [ ] **Step 5: Run all unit tests**

Run:

```bash
npm run test
```

Expected: PASS with date, validation, and calculation tests passing.

- [ ] **Step 6: Commit calculation engine**

Run:

```bash
git add src/lib/calculation.ts src/lib/calculation.test.ts
git commit -m "feat: calculate weekly schedule summary"
```

## Task 6: JSON Storage and API Routes

**Files:**
- Create: `server/storage.ts`
- Create: `server/routes.ts`
- Create: `server/index.ts`
- Test: `server/routes.test.ts`

- [ ] **Step 1: Write API route tests**

Create `server/routes.test.ts`:

```ts
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { AppData } from "../src/types/domain";
import { createRoutes } from "./routes";
import { createSeedData } from "./seed";

function createTestApp(initialData: AppData = createSeedData()) {
  let data = structuredClone(initialData);
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createRoutes({
      load: async () => data,
      save: async (next) => {
        data = structuredClone(next);
      }
    })
  );
  return app;
}

describe("API routes", () => {
  it("returns health", async () => {
    await request(createTestApp()).get("/api/health").expect(200, { ok: true });
  });

  it("returns app data without leaking the admin password", async () => {
    const response = await request(createTestApp()).get("/api/data").expect(200);
    expect(response.body.staff).toHaveLength(3);
    expect(response.body.settings.adminPassword).toBeUndefined();
  });

  it("enters admin mode with the configured password", async () => {
    await request(createTestApp()).post("/api/admin/session").send({ password: "123456" }).expect(200, {
      ok: true
    });
  });

  it("rejects data writes without admin mode", async () => {
    await request(createTestApp())
      .put("/api/data/schedule-entry")
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" })
      .expect(401);
  });

  it("saves a schedule entry with admin header", async () => {
    const response = await request(createTestApp())
      .put("/api/data/schedule-entry")
      .set("x-admin-mode", "true")
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" })
      .expect(200);
    expect(response.body.scheduleEntries).toHaveLength(1);
    expect(response.body.scheduleEntries[0].id).toBe("2026-06-15__staff-nurse-001");
  });

  it("rejects a third shift for the same person and date", async () => {
    const response = await request(createTestApp())
      .put("/api/data/schedule-entry")
      .set("x-admin-mode", "true")
      .send({
        date: "2026-06-15",
        staffId: "staff-nurse-001",
        shiftIds: ["shift-a1", "shift-p1", "shift-n1"],
        note: ""
      })
      .expect(400);
    expect(response.body.message).toBe("单人单日最多两个班次");
  });
});
```

- [ ] **Step 2: Run failing API tests**

Run:

```bash
npm run test -- server/routes.test.ts
```

Expected: FAIL because `server/routes.ts` does not exist.

- [ ] **Step 3: Implement JSON storage**

Create `server/storage.ts`:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { AppData } from "./types";
import { createSeedData } from "./seed";

export interface StorageAdapter {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
}

export const DEFAULT_STORAGE_PATH = resolve(process.cwd(), "data/app-data.local.json");

export function createJsonStorage(path = DEFAULT_STORAGE_PATH): StorageAdapter {
  return {
    async load() {
      try {
        const raw = await readFile(path, "utf-8");
        return JSON.parse(raw) as AppData;
      } catch (error) {
        const seed = createSeedData();
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, `${JSON.stringify(seed, null, 2)}\n`, "utf-8");
        return seed;
      }
    },
    async save(data) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
    }
  };
}
```

- [ ] **Step 4: Implement Express routes**

Create `server/routes.ts`:

```ts
import { Router } from "express";
import type { AppData, Holiday, Shift, StaffMember } from "../src/types/domain";
import type { StorageAdapter } from "./storage";
import { validateScheduleShiftIds } from "../src/lib/validation";

function publicData(data: AppData): AppData {
  return {
    ...data,
    settings: {
      ...data.settings,
      adminPassword: ""
    }
  };
}

function requireAdminHeader(value: unknown): boolean {
  return value === "true";
}

function getConfiguredAdminPassword(data: AppData): string {
  return process.env.SCHEDULE_ADMIN_PASSWORD?.trim() || data.settings.adminPassword;
}

function upsertById<T extends { id: string }>(items: T[], next: T): T[] {
  const exists = items.some((item) => item.id === next.id);
  if (!exists) {
    return [...items, next];
  }
  return items.map((item) => (item.id === next.id ? next : item));
}

export function createRoutes(storage: StorageAdapter): Router {
  const router = Router();

  router.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  router.get("/data", async (_request, response) => {
    response.json(publicData(await storage.load()));
  });

  router.post("/admin/session", async (request, response) => {
    const data = await storage.load();
    if (request.body?.password === getConfiguredAdminPassword(data)) {
      response.json({ ok: true });
      return;
    }
    response.status(401).json({ ok: false, message: "管理密码不正确" });
  });

  router.use("/data", (request, response, next) => {
    if (!requireAdminHeader(request.header("x-admin-mode"))) {
      response.status(401).json({ message: "请先进入编辑模式" });
      return;
    }
    next();
  });

  router.put("/data/staff/:id", async (request, response) => {
    const data = await storage.load();
    const staff = request.body as StaffMember;
    const nextData = { ...data, staff: upsertById(data.staff, staff) };
    await storage.save(nextData);
    response.json(publicData(nextData));
  });

  router.put("/data/shift/:id", async (request, response) => {
    const data = await storage.load();
    const shift = request.body as Shift;
    const nextData = { ...data, shifts: upsertById(data.shifts, shift) };
    await storage.save(nextData);
    response.json(publicData(nextData));
  });

  router.put("/data/holiday/:id", async (request, response) => {
    const data = await storage.load();
    const holiday = request.body as Holiday;
    const duplicate = data.holidays.some((item) => item.date === holiday.date && item.id !== holiday.id);
    if (duplicate) {
      response.status(400).json({ message: "节假日日期不能重复" });
      return;
    }
    const nextData = { ...data, holidays: upsertById(data.holidays, holiday) };
    await storage.save(nextData);
    response.json(publicData(nextData));
  });

  router.put("/data/schedule-entry", async (request, response) => {
    const data = await storage.load();
    const { date, staffId, shiftIds, note } = request.body as {
      date: string;
      staffId: string;
      shiftIds: string[];
      note: string;
    };
    if (!data.staff.some((staff) => staff.id === staffId)) {
      response.status(400).json({ message: `人员不存在：${staffId}` });
      return;
    }
    const validation = validateScheduleShiftIds(shiftIds, data.shifts);
    if (!validation.ok) {
      response.status(400).json({ message: validation.message });
      return;
    }
    const id = `${date}__${staffId}`;
    const nextEntry = { id, date, staffId, shiftIds, note: note ?? "" };
    const withoutCurrent = data.scheduleEntries.filter((entry) => entry.id !== id);
    const scheduleEntries = shiftIds.length === 0 ? withoutCurrent : [...withoutCurrent, nextEntry];
    const nextData = { ...data, scheduleEntries };
    await storage.save(nextData);
    response.json(publicData(nextData));
  });

  return router;
}
```

- [ ] **Step 5: Implement server entrypoint**

Create `server/index.ts`:

```ts
import express from "express";
import { createRoutes } from "./routes";
import { createJsonStorage } from "./storage";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(express.json());
app.use("/api", createRoutes(createJsonStorage()));

app.listen(port, "127.0.0.1", () => {
  console.log(`Schedule API listening at http://127.0.0.1:${port}`);
});
```

- [ ] **Step 6: Run API tests**

Run:

```bash
npm run test -- server/routes.test.ts
```

Expected: PASS with 6 tests passing.

- [ ] **Step 7: Run all unit and API tests**

Run:

```bash
npm run test
```

Expected: PASS for all tests.

- [ ] **Step 8: Commit API**

Run:

```bash
git add server/storage.ts server/routes.ts server/index.ts server/routes.test.ts
git commit -m "feat: add json-backed schedule api"
```

## Task 7: Frontend Bootstrap and API Client

**Files:**
- Create: `src/main.ts`
- Create: `src/App.vue`
- Create: `src/api/client.ts`
- Create: `src/styles/main.css`

- [ ] **Step 1: Create API client**

Create `src/api/client.ts`:

```ts
import type { AppData, Holiday, ScheduleEntry, Shift, StaffMember } from "@/types/domain";

let adminMode = false;

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(adminMode ? { "x-admin-mode": "true" } : {}),
      ...(options.headers ?? {})
    }
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({ message: response.statusText }))) as { message: string };
    throw new Error(body.message || response.statusText);
  }
  return response.json() as Promise<T>;
}

export function setAdminMode(enabled: boolean) {
  adminMode = enabled;
}

export async function loadData(): Promise<AppData> {
  return requestJson<AppData>("/api/data");
}

export async function enterAdminMode(password: string): Promise<void> {
  await requestJson<{ ok: boolean }>("/api/admin/session", {
    method: "POST",
    body: JSON.stringify({ password })
  });
  setAdminMode(true);
}

export async function saveStaff(staff: StaffMember): Promise<AppData> {
  return requestJson<AppData>(`/api/data/staff/${staff.id}`, {
    method: "PUT",
    body: JSON.stringify(staff)
  });
}

export async function saveShift(shift: Shift): Promise<AppData> {
  return requestJson<AppData>(`/api/data/shift/${shift.id}`, {
    method: "PUT",
    body: JSON.stringify(shift)
  });
}

export async function saveHoliday(holiday: Holiday): Promise<AppData> {
  return requestJson<AppData>(`/api/data/holiday/${holiday.id}`, {
    method: "PUT",
    body: JSON.stringify(holiday)
  });
}

export async function saveScheduleEntry(entry: Omit<ScheduleEntry, "id">): Promise<AppData> {
  return requestJson<AppData>("/api/data/schedule-entry", {
    method: "PUT",
    body: JSON.stringify(entry)
  });
}
```

- [ ] **Step 2: Create Vue entry**

Create `src/main.ts`:

```ts
import { createApp } from "vue";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import "./styles/main.css";
import App from "./App.vue";

createApp(App).use(ElementPlus).mount("#app");
```

- [ ] **Step 3: Create temporary app shell**

Create `src/App.vue`:

```vue
<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { AppData } from "@/types/domain";
import { loadData } from "@/api/client";

const data = ref<AppData | null>(null);
const error = ref("");

onMounted(async () => {
  try {
    data.value = await loadData();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "系统加载失败";
  }
});
</script>

<template>
  <main class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">国际医学部</p>
        <h1>护理排班管理系统</h1>
      </div>
    </header>
    <section v-if="error" class="state-message">{{ error }}</section>
    <section v-else-if="!data" class="state-message">正在加载排班数据...</section>
    <section v-else class="state-message">已加载 {{ data.staff.length }} 名人员和 {{ data.shifts.length }} 个班次</section>
  </main>
</template>
```

- [ ] **Step 4: Create base styles**

Create `src/styles/main.css`:

```css
:root {
  font-family: "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
  color: #1f2937;
  background: #f8f9fa;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 1024px;
  background: #f8f9fa;
}

.app-shell {
  min-height: 100vh;
  padding: 16px;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.app-header h1 {
  margin: 2px 0 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0;
}

.eyebrow {
  margin: 0;
  color: #2563eb;
  font-size: 13px;
  font-weight: 600;
}

.state-message {
  display: grid;
  min-height: 260px;
  place-items: center;
  border: 1px solid #dbe3ef;
  background: #ffffff;
  color: #475569;
}
```

- [ ] **Step 5: Run build**

Run:

```bash
npm run build
```

Expected: build exits with code 0 and writes `dist/`.

- [ ] **Step 6: Commit frontend bootstrap**

Run:

```bash
git add src/main.ts src/App.vue src/api/client.ts src/styles/main.css
git commit -m "feat: bootstrap schedule web app"
```

## Task 8: Toolbar, Admin Mode, and App State

**Files:**
- Create: `src/components/AppToolbar.vue`
- Modify: `src/App.vue`

- [ ] **Step 1: Create toolbar component**

Create `src/components/AppToolbar.vue`:

```vue
<script setup lang="ts">
import { CalendarDays, Expand, Printer, Settings, ShieldCheck } from "lucide-vue-next";

defineProps<{
  year: number;
  month: number;
  selectedDate: string;
  adminMode: boolean;
}>();

const emit = defineEmits<{
  "update:year": [value: number];
  "update:month": [value: number];
  "update:selectedDate": [value: string];
  enterAdmin: [];
  openManagement: [];
  printMonth: [];
  printWeek: [];
  fullscreen: [];
}>();
</script>

<template>
  <section class="toolbar">
    <div class="toolbar-group">
      <el-input-number :model-value="year" :min="2020" :max="2035" controls-position="right" @update:model-value="emit('update:year', Number($event))" />
      <el-select :model-value="month" class="month-select" @update:model-value="emit('update:month', Number($event))">
        <el-option v-for="item in 12" :key="item" :label="`${item}月`" :value="item" />
      </el-select>
      <el-date-picker
        :model-value="selectedDate"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="选择日期"
        @update:model-value="emit('update:selectedDate', String($event))"
      />
    </div>

    <div class="toolbar-actions">
      <el-button :type="adminMode ? 'success' : 'primary'" :icon="ShieldCheck" @click="emit('enterAdmin')">
        {{ adminMode ? "编辑模式" : "输入管理密码" }}
      </el-button>
      <el-button :icon="Settings" @click="emit('openManagement')">配置</el-button>
      <el-button :icon="CalendarDays" @click="emit('printWeek')">打印周表</el-button>
      <el-button :icon="Printer" @click="emit('printMonth')">打印月表</el-button>
      <el-button :icon="Expand" @click="emit('fullscreen')">全屏</el-button>
    </div>
  </section>
</template>
```

- [ ] **Step 2: Wire toolbar into App**

Replace `src/App.vue` with:

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AppToolbar from "@/components/AppToolbar.vue";
import type { AppData } from "@/types/domain";
import { enterAdminMode, loadData } from "@/api/client";
import { getWeekRange, toDateKey } from "@/lib/date";

const today = toDateKey(new Date());
const data = ref<AppData | null>(null);
const error = ref("");
const adminMode = ref(false);
const selectedDate = ref(today);
const currentYear = ref(new Date().getFullYear());
const currentMonth = ref(new Date().getMonth() + 1);
const managementOpen = ref(false);

const selectedWeek = computed(() => getWeekRange(selectedDate.value));

async function refreshData() {
  data.value = await loadData();
}

async function handleEnterAdmin() {
  if (adminMode.value) {
    return;
  }
  const password = window.prompt("请输入管理密码");
  if (!password) {
    return;
  }
  await enterAdminMode(password);
  adminMode.value = true;
}

function handleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
    return;
  }
  document.exitFullscreen();
}

function printWithMode(mode: "month" | "week") {
  document.body.dataset.printMode = mode;
  window.print();
  window.setTimeout(() => {
    delete document.body.dataset.printMode;
  }, 200);
}

onMounted(async () => {
  try {
    await refreshData();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "系统加载失败";
  }
});
</script>

<template>
  <main class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">国际医学部</p>
        <h1>护理排班管理系统</h1>
      </div>
      <div class="week-chip">{{ selectedWeek.start }} 至 {{ selectedWeek.end }}</div>
    </header>

    <AppToolbar
      v-model:year="currentYear"
      v-model:month="currentMonth"
      v-model:selected-date="selectedDate"
      :admin-mode="adminMode"
      @enter-admin="handleEnterAdmin"
      @open-management="managementOpen = true"
      @print-month="printWithMode('month')"
      @print-week="printWithMode('week')"
      @fullscreen="handleFullscreen"
    />

    <section v-if="error" class="state-message">{{ error }}</section>
    <section v-else-if="!data" class="state-message">正在加载排班数据...</section>
    <section v-else class="state-message">
      已加载 {{ data.staff.length }} 名人员和 {{ data.shifts.length }} 个班次。配置抽屉状态：{{ managementOpen ? "打开" : "关闭" }}
    </section>
  </main>
</template>
```

- [ ] **Step 3: Add toolbar styles**

Append to `src/styles/main.css`:

```css
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px;
  border: 1px solid #dbe3ef;
  background: #ffffff;
  margin-bottom: 12px;
}

.toolbar-group,
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.month-select {
  width: 108px;
}

.week-chip {
  padding: 6px 10px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 13px;
}
```

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: build exits with code 0.

- [ ] **Step 5: Commit toolbar**

Run:

```bash
git add src/App.vue src/components/AppToolbar.vue src/styles/main.css
git commit -m "feat: add schedule toolbar controls"
```

## Task 9: Shift Palette, Schedule Grid, and Cell Editing

**Files:**
- Create: `src/components/ShiftPalette.vue`
- Create: `src/components/ScheduleGrid.vue`
- Create: `src/components/CellEditorDialog.vue`
- Modify: `src/App.vue`
- Modify: `src/styles/main.css`

- [ ] **Step 1: Create shift palette**

Create `src/components/ShiftPalette.vue`:

```vue
<script setup lang="ts">
import type { Shift } from "@/types/domain";

defineProps<{
  shifts: Shift[];
  selectedShiftId: string;
}>();

const emit = defineEmits<{
  select: [shiftId: string];
}>();
</script>

<template>
  <aside class="shift-palette">
    <h2>班次画笔</h2>
    <div class="shift-list">
      <button
        v-for="shift in shifts.filter((item) => item.enabled).sort((a, b) => a.sortOrder - b.sortOrder)"
        :key="shift.id"
        class="shift-button"
        :class="{ active: selectedShiftId === shift.id }"
        :style="{ borderColor: shift.color, color: shift.color }"
        type="button"
        @click="emit('select', shift.id)"
      >
        <span class="shift-dot" :style="{ background: shift.color }"></span>
        {{ shift.shortName }}
      </button>
    </div>
  </aside>
</template>
```

- [ ] **Step 2: Create cell editor dialog**

Create `src/components/CellEditorDialog.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ScheduleEntry, Shift, StaffMember } from "@/types/domain";

const props = defineProps<{
  modelValue: boolean;
  staff: StaffMember | null;
  date: string;
  entry: ScheduleEntry | null;
  shifts: Shift[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  save: [shiftIds: string[], note: string];
}>();

const localShiftIds = ref<string[]>([]);
const note = ref("");

const enabledShifts = computed(() =>
  props.shifts.filter((shift) => shift.enabled).sort((left, right) => left.sortOrder - right.sortOrder)
);

watch(
  () => [props.modelValue, props.entry?.id],
  () => {
    localShiftIds.value = props.entry?.shiftIds ? [...props.entry.shiftIds] : [];
    note.value = props.entry?.note ?? "";
  },
  { immediate: true }
);

function save() {
  emit("save", localShiftIds.value.filter(Boolean).slice(0, 2), note.value);
}
</script>

<template>
  <el-dialog :model-value="modelValue" width="420px" title="编辑排班" @update:model-value="emit('update:modelValue', $event)">
    <div v-if="staff" class="cell-editor">
      <p class="editor-context">{{ staff.name }} · {{ date }}</p>
      <el-select v-model="localShiftIds" multiple :multiple-limit="2" placeholder="选择最多两个班次" class="full-width">
        <el-option v-for="shift in enabledShifts" :key="shift.id" :label="shift.name" :value="shift.id" />
      </el-select>
      <el-input v-model="note" type="textarea" :rows="3" placeholder="备注" />
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>
```

- [ ] **Step 3: Create schedule grid**

Create `src/components/ScheduleGrid.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { CalendarDay } from "@/lib/date";
import type { Holiday, ScheduleEntry, Shift, StaffMember } from "@/types/domain";

const props = defineProps<{
  staff: StaffMember[];
  days: CalendarDay[];
  holidays: Holiday[];
  shifts: Shift[];
  entries: ScheduleEntry[];
  selectedShiftId: string;
  adminMode: boolean;
}>();

const emit = defineEmits<{
  quickFill: [staffId: string, date: string];
  editCell: [staffId: string, date: string];
}>();

const holidayMap = computed(() => new Map(props.holidays.map((holiday) => [holiday.date, holiday])));
const shiftMap = computed(() => new Map(props.shifts.map((shift) => [shift.id, shift])));
const entryMap = computed(() => new Map(props.entries.map((entry) => [`${entry.date}__${entry.staffId}`, entry])));
const sortedStaff = computed(() =>
  props.staff.filter((item) => item.enabled).sort((left, right) => left.sortOrder - right.sortOrder)
);

function entryFor(staffId: string, date: string) {
  return entryMap.value.get(`${date}__${staffId}`) ?? null;
}

function handleCellClick(staffId: string, date: string) {
  if (!props.adminMode) {
    return;
  }
  if (props.selectedShiftId) {
    emit("quickFill", staffId, date);
    return;
  }
  emit("editCell", staffId, date);
}
</script>

<template>
  <section class="schedule-grid-wrap">
    <table class="schedule-grid">
      <thead>
        <tr>
          <th class="sticky-col person-col">人员</th>
          <th v-for="day in days" :key="day.key" :class="{ weekend: day.isWeekend, holiday: holidayMap.has(day.key) }">
            <span>{{ day.dayOfMonth }}</span>
            <small>{{ day.weekdayName }}</small>
            <em v-if="holidayMap.has(day.key)">{{ holidayMap.get(day.key)?.name }}</em>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="person in sortedStaff" :key="person.id">
          <th class="sticky-col person-col">
            <strong>{{ person.name }}</strong>
            <small>{{ person.jobId }}</small>
          </th>
          <td
            v-for="day in days"
            :key="`${person.id}-${day.key}`"
            :class="{ editable: adminMode, weekend: day.isWeekend, holiday: holidayMap.has(day.key) }"
            @click="handleCellClick(person.id, day.key)"
            @dblclick="emit('editCell', person.id, day.key)"
          >
            <div class="cell-shifts">
              <span
                v-for="shiftId in entryFor(person.id, day.key)?.shiftIds ?? []"
                :key="shiftId"
                class="shift-chip"
                :style="{ color: shiftMap.get(shiftId)?.color, borderColor: shiftMap.get(shiftId)?.color }"
              >
                {{ shiftMap.get(shiftId)?.shortName }}
              </span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
```

- [ ] **Step 4: Wire grid and palette into App**

Replace the placeholder loaded section in `src/App.vue` with real components. Keep the script imports and add:

```ts
import CellEditorDialog from "@/components/CellEditorDialog.vue";
import ScheduleGrid from "@/components/ScheduleGrid.vue";
import ShiftPalette from "@/components/ShiftPalette.vue";
import { saveScheduleEntry } from "@/api/client";
import { getMonthDays } from "@/lib/date";

const selectedShiftId = ref("");
const editorOpen = ref(false);
const editingStaffId = ref("");
const editingDate = ref("");

const monthDays = computed(() => getMonthDays(currentYear.value, currentMonth.value));
const editingStaff = computed(() => data.value?.staff.find((staff) => staff.id === editingStaffId.value) ?? null);
const editingEntry = computed(
  () => data.value?.scheduleEntries.find((entry) => entry.staffId === editingStaffId.value && entry.date === editingDate.value) ?? null
);

async function saveEntry(staffId: string, date: string, shiftIds: string[], note = "") {
  data.value = await saveScheduleEntry({ staffId, date, shiftIds, note });
}

async function handleQuickFill(staffId: string, date: string) {
  if (!selectedShiftId.value) {
    return;
  }
  await saveEntry(staffId, date, [selectedShiftId.value], "");
}

function handleEditCell(staffId: string, date: string) {
  editingStaffId.value = staffId;
  editingDate.value = date;
  editorOpen.value = true;
}

async function handleEditorSave(shiftIds: string[], note: string) {
  await saveEntry(editingStaffId.value, editingDate.value, shiftIds, note);
  editorOpen.value = false;
}
```

Use this loaded template section:

```vue
<section v-else class="workbench">
  <ShiftPalette :shifts="data.shifts" :selected-shift-id="selectedShiftId" @select="selectedShiftId = $event" />
  <ScheduleGrid
    :staff="data.staff"
    :days="monthDays"
    :holidays="data.holidays"
    :shifts="data.shifts"
    :entries="data.scheduleEntries"
    :selected-shift-id="selectedShiftId"
    :admin-mode="adminMode"
    @quick-fill="handleQuickFill"
    @edit-cell="handleEditCell"
  />
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

- [ ] **Step 5: Add grid styles**

Append to `src/styles/main.css`:

```css
.workbench {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.shift-palette {
  position: sticky;
  top: 12px;
  border: 1px solid #dbe3ef;
  background: #ffffff;
  padding: 10px;
}

.shift-palette h2 {
  margin: 0 0 8px;
  font-size: 15px;
}

.shift-list {
  display: grid;
  gap: 8px;
}

.shift-button {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  border: 1px solid;
  background: #ffffff;
  font-weight: 700;
  cursor: pointer;
}

.shift-button.active {
  background: #eff6ff;
}

.shift-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.schedule-grid-wrap {
  overflow: auto;
  max-height: calc(100vh - 156px);
  border: 1px solid #dbe3ef;
  background: #ffffff;
}

.schedule-grid {
  border-collapse: separate;
  border-spacing: 0;
  min-width: 1280px;
  width: 100%;
  font-size: 13px;
}

.schedule-grid th,
.schedule-grid td {
  min-width: 74px;
  height: 58px;
  border-right: 1px solid #e2e8f0;
  border-bottom: 1px solid #e2e8f0;
  text-align: center;
  vertical-align: middle;
}

.schedule-grid thead th {
  position: sticky;
  top: 0;
  z-index: 3;
  background: #f8fafc;
}

.sticky-col {
  position: sticky;
  left: 0;
  z-index: 4;
  background: #ffffff;
}

.person-col {
  min-width: 132px;
  text-align: left;
  padding: 0 8px;
}

.person-col strong,
.person-col small,
.schedule-grid thead span,
.schedule-grid thead small,
.schedule-grid thead em {
  display: block;
}

.schedule-grid .weekend,
.schedule-grid .holiday {
  background: #fff1f2;
  color: #b91c1c;
}

.schedule-grid td.editable {
  cursor: pointer;
}

.schedule-grid td.editable:hover {
  outline: 2px solid #60a5fa;
  outline-offset: -2px;
}

.cell-shifts {
  display: grid;
  gap: 4px;
  place-items: center;
}

.shift-chip {
  display: inline-flex;
  min-width: 34px;
  justify-content: center;
  border: 1px solid;
  padding: 2px 4px;
  font-weight: 700;
  background: #ffffff;
}

.cell-editor {
  display: grid;
  gap: 12px;
}

.editor-context {
  margin: 0;
  color: #475569;
}

.full-width {
  width: 100%;
}
```

- [ ] **Step 6: Run build**

Run:

```bash
npm run build
```

Expected: build exits with code 0.

- [ ] **Step 7: Commit grid workflow**

Run:

```bash
git add src/App.vue src/components/ShiftPalette.vue src/components/ScheduleGrid.vue src/components/CellEditorDialog.vue src/styles/main.css
git commit -m "feat: add editable schedule grid"
```

## Task 10: Weekly Summary UI

**Files:**
- Create: `src/components/WeeklySummary.vue`
- Modify: `src/App.vue`
- Modify: `src/styles/main.css`

- [ ] **Step 1: Create weekly summary component**

Create `src/components/WeeklySummary.vue`:

```vue
<script setup lang="ts">
import type { WeeklySummary } from "@/types/domain";

defineProps<{
  summary: WeeklySummary;
}>();
</script>

<template>
  <section class="weekly-summary">
    <header>
      <h2>周统计</h2>
      <p>
        {{ summary.weekStart }} 至 {{ summary.weekEnd }} · 满勤 {{ summary.requiredShifts }} 个班次 ·
        节假日扣减 {{ summary.holidayDeduction }} 个
      </p>
      <p v-if="summary.holidayNames.length" class="summary-note">节假日：{{ summary.holidayNames.join("、") }}</p>
      <p class="summary-note">护士长绩效系数单独核算，出勤和加班仍按相同排班规则统计。</p>
    </header>

    <table class="summary-table">
      <thead>
        <tr>
          <th>人员</th>
          <th>类型</th>
          <th>出勤班次</th>
          <th>满勤标准</th>
          <th>加班班次</th>
          <th>总系数</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in summary.rows" :key="row.staffId">
          <td>{{ row.staffName }}</td>
          <td>{{ row.staffType === "head_nurse" ? "护士长" : row.staffType === "clerk" ? "文员" : "护士" }}</td>
          <td>{{ row.attendanceShifts }}</td>
          <td>{{ row.requiredShifts }}</td>
          <td>{{ row.overtimeShifts }}</td>
          <td>{{ row.coefficientTotal === null ? row.coefficientExcludedReason : row.coefficientTotal.toFixed(2) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
```

- [ ] **Step 2: Wire summary into App**

In `src/App.vue`, import the component and calculation helper:

```ts
import WeeklySummary from "@/components/WeeklySummary.vue";
import { calculateWeeklySummary } from "@/lib/calculation";
```

Add computed summary:

```ts
const weeklySummary = computed(() => (data.value ? calculateWeeklySummary(data.value, selectedDate.value) : null));
```

Add below `ScheduleGrid` in the loaded template:

```vue
<WeeklySummary v-if="weeklySummary" :summary="weeklySummary" />
```

- [ ] **Step 3: Add summary styles**

Append to `src/styles/main.css`:

```css
.weekly-summary {
  grid-column: 1 / -1;
  border: 1px solid #dbe3ef;
  background: #ffffff;
  padding: 12px;
}

.weekly-summary h2 {
  margin: 0 0 4px;
  font-size: 16px;
}

.weekly-summary p {
  margin: 0 0 4px;
  color: #475569;
}

.summary-note {
  font-size: 13px;
}

.summary-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
}

.summary-table th,
.summary-table td {
  border: 1px solid #e2e8f0;
  padding: 8px;
  text-align: center;
}

.summary-table th {
  background: #f8fafc;
}
```

- [ ] **Step 4: Run tests and build**

Run:

```bash
npm run test
npm run build
```

Expected: tests pass and build exits with code 0.

- [ ] **Step 5: Commit weekly summary UI**

Run:

```bash
git add src/App.vue src/components/WeeklySummary.vue src/styles/main.css
git commit -m "feat: show weekly schedule summary"
```

## Task 11: Management Drawer

**Files:**
- Create: `src/components/ManagementDrawer.vue`
- Modify: `src/App.vue`
- Modify: `src/styles/main.css`

- [ ] **Step 1: Create management drawer**

Create `src/components/ManagementDrawer.vue`:

```vue
<script setup lang="ts">
import { reactive, watch } from "vue";
import type { AppData, Holiday, Shift, StaffMember } from "@/types/domain";

const props = defineProps<{
  modelValue: boolean;
  data: AppData;
  adminMode: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  saveStaff: [staff: StaffMember];
  saveShift: [shift: Shift];
  saveHoliday: [holiday: Holiday];
}>();

const staffDraft = reactive<StaffMember>({
  id: "",
  jobId: "",
  name: "",
  type: "nurse",
  isAdmin: false,
  enabled: true,
  sortOrder: 99
});

const shiftDraft = reactive<Shift>({
  id: "",
  name: "",
  shortName: "",
  color: "#2563EB",
  countsAttendance: true,
  coefficient: 1,
  enabled: true,
  sortOrder: 99
});

const holidayDraft = reactive<Holiday>({
  id: "",
  date: "",
  name: "",
  affectsRequiredAttendance: true
});

watch(
  () => props.modelValue,
  () => {
    staffDraft.id = `staff-${Date.now()}`;
    shiftDraft.id = `shift-${Date.now()}`;
    holidayDraft.id = `holiday-${Date.now()}`;
  }
);
</script>

<template>
  <el-drawer :model-value="modelValue" title="系统配置" size="560px" @update:model-value="emit('update:modelValue', $event)">
    <el-alert v-if="!adminMode" title="进入编辑模式后才能保存配置" type="warning" :closable="false" />

    <el-tabs>
      <el-tab-pane label="人员">
        <el-table :data="data.staff" size="small">
          <el-table-column prop="jobId" label="工号" width="90" />
          <el-table-column prop="name" label="姓名" />
          <el-table-column prop="type" label="类型" width="100" />
          <el-table-column prop="isAdmin" label="管理员" width="90" />
        </el-table>
        <div class="management-form">
          <el-input v-model="staffDraft.jobId" placeholder="工号" />
          <el-input v-model="staffDraft.name" placeholder="姓名" />
          <el-select v-model="staffDraft.type">
            <el-option label="护士" value="nurse" />
            <el-option label="文员" value="clerk" />
            <el-option label="护士长" value="head_nurse" />
          </el-select>
          <el-checkbox v-model="staffDraft.isAdmin">指定管理员</el-checkbox>
          <el-button type="primary" :disabled="!adminMode" @click="emit('saveStaff', { ...staffDraft })">保存人员</el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="班次">
        <el-table :data="data.shifts" size="small">
          <el-table-column prop="shortName" label="简称" width="80" />
          <el-table-column prop="name" label="名称" />
          <el-table-column prop="coefficient" label="系数" width="80" />
          <el-table-column prop="countsAttendance" label="计出勤" width="90" />
        </el-table>
        <div class="management-form">
          <el-input v-model="shiftDraft.name" placeholder="班次名称" />
          <el-input v-model="shiftDraft.shortName" placeholder="简称" />
          <el-color-picker v-model="shiftDraft.color" />
          <el-input-number v-model="shiftDraft.coefficient" :min="0" :step="0.1" />
          <el-checkbox v-model="shiftDraft.countsAttendance">计出勤</el-checkbox>
          <el-button type="primary" :disabled="!adminMode" @click="emit('saveShift', { ...shiftDraft })">保存班次</el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="节假日">
        <el-table :data="data.holidays" size="small">
          <el-table-column prop="date" label="日期" width="120" />
          <el-table-column prop="name" label="名称" />
          <el-table-column prop="affectsRequiredAttendance" label="影响满勤" width="100" />
        </el-table>
        <div class="management-form">
          <el-date-picker v-model="holidayDraft.date" value-format="YYYY-MM-DD" placeholder="日期" />
          <el-input v-model="holidayDraft.name" placeholder="节假日名称" />
          <el-checkbox v-model="holidayDraft.affectsRequiredAttendance">影响满勤</el-checkbox>
          <el-button type="primary" :disabled="!adminMode" @click="emit('saveHoliday', { ...holidayDraft })">保存节假日</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-drawer>
</template>
```

- [ ] **Step 2: Wire management saves into App**

In `src/App.vue`, import management drawer and save functions:

```ts
import ManagementDrawer from "@/components/ManagementDrawer.vue";
import { saveHoliday, saveShift, saveStaff } from "@/api/client";
import type { Holiday, Shift, StaffMember } from "@/types/domain";
```

Add save handlers:

```ts
async function handleSaveStaff(staff: StaffMember) {
  data.value = await saveStaff(staff);
}

async function handleSaveShift(shift: Shift) {
  data.value = await saveShift(shift);
}

async function handleSaveHoliday(holiday: Holiday) {
  data.value = await saveHoliday(holiday);
}
```

Add to the loaded template:

```vue
<ManagementDrawer
  v-if="data"
  v-model="managementOpen"
  :data="data"
  :admin-mode="adminMode"
  @save-staff="handleSaveStaff"
  @save-shift="handleSaveShift"
  @save-holiday="handleSaveHoliday"
/>
```

- [ ] **Step 3: Add management styles**

Append to `src/styles/main.css`:

```css
.management-form {
  display: grid;
  gap: 10px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid #e2e8f0;
}
```

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: build exits with code 0.

- [ ] **Step 5: Commit management drawer**

Run:

```bash
git add src/App.vue src/components/ManagementDrawer.vue src/styles/main.css
git commit -m "feat: manage staff shifts and holidays"
```

## Task 12: Print Views and Print CSS

**Files:**
- Create: `src/components/PrintViews.vue`
- Modify: `src/App.vue`
- Modify: `src/styles/main.css`

- [ ] **Step 1: Create print views**

Create `src/components/PrintViews.vue`:

```vue
<script setup lang="ts">
import type { CalendarDay } from "@/lib/date";
import type { AppData, WeeklySummary } from "@/types/domain";

defineProps<{
  data: AppData;
  days: CalendarDay[];
  summary: WeeklySummary;
}>();
</script>

<template>
  <section class="print-view print-month">
    <h1>国际医学部护理排班表</h1>
    <table class="print-table">
      <thead>
        <tr>
          <th>人员</th>
          <th v-for="day in days" :key="day.key">
            {{ day.dayOfMonth }}<br />{{ day.weekdayName }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="staff in data.staff.filter((item) => item.enabled).sort((a, b) => a.sortOrder - b.sortOrder)" :key="staff.id">
          <th>{{ staff.name }}</th>
          <td v-for="day in days" :key="`${staff.id}-${day.key}`">
            {{
              data.scheduleEntries
                .find((entry) => entry.staffId === staff.id && entry.date === day.key)
                ?.shiftIds.map((shiftId) => data.shifts.find((shift) => shift.id === shiftId)?.shortName)
                .filter(Boolean)
                .join("/")
            }}
          </td>
        </tr>
      </tbody>
    </table>
  </section>

  <section class="print-view print-week">
    <h1>国际医学部护理周统计表</h1>
    <p>
      {{ summary.weekStart }} 至 {{ summary.weekEnd }}；满勤 {{ summary.requiredShifts }} 个班次；节假日扣减
      {{ summary.holidayDeduction }} 个。
    </p>
    <p v-if="summary.holidayNames.length">节假日：{{ summary.holidayNames.join("、") }}</p>
    <table class="print-table">
      <thead>
        <tr>
          <th>人员</th>
          <th>出勤班次</th>
          <th>满勤标准</th>
          <th>加班班次</th>
          <th>总系数</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in summary.rows" :key="row.staffId">
          <td>{{ row.staffName }}</td>
          <td>{{ row.attendanceShifts }}</td>
          <td>{{ row.requiredShifts }}</td>
          <td>{{ row.overtimeShifts }}</td>
          <td>{{ row.coefficientTotal === null ? row.coefficientExcludedReason : row.coefficientTotal.toFixed(2) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
```

- [ ] **Step 2: Wire print views into App**

In `src/App.vue`, import:

```ts
import PrintViews from "@/components/PrintViews.vue";
```

Add to the loaded template:

```vue
<PrintViews v-if="weeklySummary" :data="data" :days="monthDays" :summary="weeklySummary" />
```

- [ ] **Step 3: Add print CSS**

Append to `src/styles/main.css`:

```css
.print-view {
  display: none;
}

@media print {
  @page {
    size: A4 landscape;
    margin: 10mm;
  }

  body {
    min-width: 0;
    background: #ffffff;
  }

  .app-header,
  .toolbar,
  .workbench,
  .el-overlay,
  .el-drawer {
    display: none !important;
  }

  .print-view {
    display: none;
  }

  body[data-print-mode="month"] .print-month,
  body[data-print-mode="week"] .print-week {
    display: block;
  }

  .print-view h1 {
    margin: 0 0 8px;
    text-align: center;
    font-size: 18px;
  }

  .print-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10px;
  }

  .print-table th,
  .print-table td {
    border: 1px solid #111827;
    padding: 4px;
    text-align: center;
  }
}
```

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: build exits with code 0.

- [ ] **Step 5: Commit print views**

Run:

```bash
git add src/App.vue src/components/PrintViews.vue src/styles/main.css
git commit -m "feat: add printable schedule views"
```

## Task 13: End-to-End Workflow Tests

**Files:**
- Create: `tests/e2e/schedule.spec.ts`

- [ ] **Step 1: Write e2e tests**

Create `tests/e2e/schedule.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("loads the schedule workstation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "护理排班管理系统" })).toBeVisible();
  await expect(page.getByText("班次画笔")).toBeVisible();
  await expect(page.getByText("周统计")).toBeVisible();
});

test("enters admin mode and quick fills a shift", async ({ page }) => {
  await page.goto("/");
  page.on("dialog", async (dialog) => {
    expect(dialog.message()).toBe("请输入管理密码");
    await dialog.accept("123456");
  });
  await page.getByRole("button", { name: /输入管理密码/ }).click();
  await expect(page.getByRole("button", { name: /编辑模式/ })).toBeVisible();
  await page.getByRole("button", { name: /A1/ }).click();
  await page.locator("tbody tr").nth(1).locator("td").first().click();
  await expect(page.locator("tbody tr").nth(1).locator("td").first()).toContainText("A1");
});

test("opens management drawer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /配置/ }).click();
  await expect(page.getByRole("heading", { name: "系统配置" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "人员" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "班次" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "节假日" })).toBeVisible();
});
```

- [ ] **Step 2: Install Playwright browser if needed**

Run:

```bash
npx playwright install chromium
```

Expected: Chromium browser is installed or already present.

- [ ] **Step 3: Run e2e tests**

Run:

```bash
npm run test:e2e
```

Expected: PASS with 3 Playwright tests passing.

- [ ] **Step 4: Commit e2e tests**

Run:

```bash
git add tests/e2e/schedule.spec.ts
git commit -m "test: cover schedule workstation workflow"
```

## Task 14: Final Verification and Documentation

**Files:**
- Modify: `README.md`
- Read: `docs/superpowers/specs/2026-06-15-nursing-schedule-design.md`

- [ ] **Step 1: Update README feature status**

Add this section to `README.md`:

```md
## 一期能力

- 月视图排班表和自然周统计。
- 日期选择、年月选择和周范围定位。
- 管理密码进入编辑模式。
- 人员、班次、节假日维护。
- 班次画笔快速填班。
- 单元格弹窗支持每天最多两个班次。
- 周统计自动计算出勤班次数、加班班次数和总系数。
- 护士长绩效系数标注为单独核算。
- 月排班表和周统计表打印。
```

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run test
npm run build
npm run test:e2e
git status --short
```

Expected:

```text
Vitest exits with code 0.
Vite build exits with code 0.
Playwright exits with code 0.
git status --short shows only README.md if Step 1 is not committed yet.
```

- [ ] **Step 3: Compare implementation against spec**

Open `docs/superpowers/specs/2026-06-15-nursing-schedule-design.md` and verify each required item is represented:

```text
月视图排班表 -> ScheduleGrid + getMonthDays
日期与周查询 -> AppToolbar + getWeekRange
班次画笔 -> ShiftPalette + quickFill
单元格弹窗 -> CellEditorDialog
每天最多两个班次 -> validateScheduleShiftIds + API validation
周统计 -> calculateWeeklySummary + WeeklySummary
护士长系数排除 -> calculateWeeklySummary
人员/班次/节假日维护 -> ManagementDrawer + API routes
全屏 -> AppToolbar fullscreen action
月表/周表打印 -> PrintViews + print CSS
JSON 存储 -> server/storage.ts
```

- [ ] **Step 4: Commit final docs**

Run:

```bash
git add README.md
git commit -m "docs: document phase one schedule app"
```

- [ ] **Step 5: Report final state**

Run:

```bash
git status --short
git log --oneline -5
```

Expected: clean status and the latest commits show the completed implementation sequence.
