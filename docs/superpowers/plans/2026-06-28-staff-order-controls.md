# Staff Order Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-only up/down controls on the schedule page so staff can be reordered visually, with actual `sortOrder` values persisted as continuous IDs.

**Implementation status:** Implemented and verified on 2026-06-28. The checklist below is the original execution plan; the delivered implementation includes additional safeguards for stale requests and overlapping full-data saves.

**Architecture:** The schedule grid emits a reordered visible staff ID list when an admin clicks up/down. `App.vue` merges that visible order back into the full staff list and calls a new admin API endpoint. The backend validates the submitted full staff ID order, rewrites every staff member's `sortOrder` to `1..N`, records an audit log, and returns refreshed public data.

**Tech Stack:** Vue 3, TypeScript, Vitest, Express routes, existing SQLite-backed `AppDataStorage`, existing `requestJson` API helper.

---

## File Structure

- Modify `src/components/ScheduleGrid.vue`: render compact up/down controls in the `排序ID` column and emit reordered visible staff IDs.
- Modify `src/components/ScheduleGrid.test.ts`: cover controls, disabled edge buttons, emitted order, and hidden controls when disabled.
- Modify `src/App.vue`: compute whether ordering is allowed, merge visible order into the full staff order, call the API, and refresh data.
- Modify `src/App.test.ts`: update the `ScheduleGrid` stub and verify the app sends the full ordered staff ID list.
- Modify `src/api/client.ts`: add `saveStaffOrder(staffIds)`.
- Modify `server/routes.ts`: add `PUT /api/data/staff-order`, validation, continuous `sortOrder` rewriting, and audit logging.
- Modify `server/routes.test.ts`: verify successful reorder, real `sortOrder` changes, continuous IDs, admin-only access, duplicate/missing ID rejection.
- Modify `src/styles/main.css` and `src/styles/main-css.test.ts`: style compact controls inside the fixed sort column.

---

### Task 1: Backend Staff Order Endpoint

**Files:**
- Modify: `server/routes.ts`
- Test: `server/routes.test.ts`

- [ ] **Step 1: Write failing route tests**

Add tests near the existing staff route tests in `server/routes.test.ts`.

```ts
it("reorders staff and rewrites continuous sort ids", async () => {
  const app = createTestApp();
  const headers = await adminHeaders(app);

  const response = await request(app)
    .put("/api/data/staff-order")
    .set(headers)
    .send({ staffIds: ["staff-clerk-001", "staff-head-001", "staff-nurse-001"] })
    .expect(200);

  expect(response.body.staff.map((staff: StaffMember) => ({
    id: staff.id,
    sortOrder: staff.sortOrder
  }))).toEqual([
    { id: "staff-clerk-001", sortOrder: 1 },
    { id: "staff-head-001", sortOrder: 2 },
    { id: "staff-nurse-001", sortOrder: 3 }
  ]);

  const auditResponse = await request(app).get("/api/audit-logs").set(headers).expect(200);
  expect(auditResponse.body.rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        action: "data.staff.order",
        targetType: "staff",
        targetId: "order"
      })
    ])
  );
});

it("rejects malformed staff order payloads", async () => {
  const app = createTestApp();
  const headers = await adminHeaders(app);

  await request(app)
    .put("/api/data/staff-order")
    .set(headers)
    .send({ staffIds: ["staff-nurse-001", "staff-nurse-001", "staff-head-001"] })
    .expect(400, { message: "人员排序信息不完整" });

  await request(app)
    .put("/api/data/staff-order")
    .set(headers)
    .send({ staffIds: ["staff-nurse-001", "staff-head-001"] })
    .expect(400, { message: "人员排序必须包含全部人员" });

  await request(app)
    .put("/api/data/staff-order")
    .set(headers)
    .send({ staffIds: ["staff-nurse-001", "staff-head-001", "staff-missing"] })
    .expect(400, { message: "人员排序包含不存在的人员" });
});

it("rejects staff order writes without admin mode", async () => {
  const app = createTestApp();

  await request(app)
    .put("/api/data/staff-order")
    .send({ staffIds: ["staff-clerk-001", "staff-head-001", "staff-nurse-001"] })
    .expect(401);
});
```

- [ ] **Step 2: Run route tests and verify RED**

Run:

```bash
npm run test -- server/routes.test.ts -t "staff order|reorders staff|rejects malformed staff order|rejects staff order"
```

Expected: fail with `404` or missing route for `/api/data/staff-order`.

- [ ] **Step 3: Implement payload parsing**

Add this helper near `parseStaffPayload` in `server/routes.ts`.

```ts
function parseStaffOrderPayload(body: unknown): string[] | null {
  if (!isRecord(body) || !Array.isArray(body.staffIds)) {
    return null;
  }

  const staffIds = body.staffIds.map((staffId) => (typeof staffId === "string" ? staffId.trim() : ""));

  if (staffIds.some((staffId) => !staffId) || new Set(staffIds).size !== staffIds.length) {
    return null;
  }

  return staffIds;
}
```

- [ ] **Step 4: Implement route**

Add the route after `router.put("/data/staff/:id", ...)` and before delete staff routes.

```ts
router.put("/data/staff-order", requireAdmin, async (request, response, next) => {
  try {
    const staffIds = parseStaffOrderPayload(request.body);
    if (!staffIds) {
      response.status(400).json({ message: "人员排序信息不完整" });
      return;
    }

    let orderedStaff: StaffMember[] = [];
    const nextData = await storage.update((data) => {
      if (staffIds.length !== data.staff.length) {
        throw new HttpResponseError(400, "人员排序必须包含全部人员");
      }

      const staffById = new Map(data.staff.map((staff) => [staff.id, staff]));
      orderedStaff = staffIds.map((staffId, index) => {
        const staff = staffById.get(staffId);
        if (!staff) {
          throw new HttpResponseError(400, "人员排序包含不存在的人员");
        }

        return { ...staff, sortOrder: index + 1 };
      });

      return {
        ...data,
        staff: orderedStaff
      };
    });

    await recordAudit(
      request,
      "data.staff.order",
      "staff",
      "order",
      `调整人员排序：${orderedStaff.map((staff) => `${staff.sortOrder}.${staff.name}`).join("、")}`
    );
    response.json(toPublicData(nextData));
  } catch (error) {
    handleRouteError(error, response, next);
  }
});
```

- [ ] **Step 5: Run route tests and verify GREEN**

Run:

```bash
npm run test -- server/routes.test.ts -t "staff order|reorders staff|rejects malformed staff order|rejects staff order"
```

Expected: tests pass. If sandbox blocks `0.0.0.0` listen with `EPERM`, rerun with unsandboxed approval because `supertest` needs a local listener.

---

### Task 2: API Client Helper

**Files:**
- Modify: `src/api/client.ts`
- Test: Covered through `src/App.test.ts` in Task 4.

- [ ] **Step 1: Add client function**

Add after `saveStaff`.

```ts
export function saveStaffOrder(staffIds: string[]): Promise<PublicAppData> {
  return requestJson<PublicAppData>("/api/data/staff-order", {
    method: "PUT",
    body: JSON.stringify({ staffIds })
  });
}
```

- [ ] **Step 2: Run type check through app tests later**

No separate client test exists. This helper is validated by App integration tests in Task 4 and `npm run build`.

---

### Task 3: ScheduleGrid Up/Down Controls

**Files:**
- Modify: `src/components/ScheduleGrid.vue`
- Test: `src/components/ScheduleGrid.test.ts`

- [ ] **Step 1: Write failing component tests**

Add tests in `ScheduleGrid.test.ts`.

```ts
it("emits reordered visible staff ids from sort column controls", async () => {
  const wrapper = mountGrid([], {
    canReorderStaff: true,
    staff: [
      { id: "staff-a", jobId: "A001", name: "甲护士", type: "nurse", isAdmin: false, enabled: true, sortOrder: 1 },
      { id: "staff-b", jobId: "B001", name: "乙护士", type: "nurse", isAdmin: false, enabled: true, sortOrder: 2 },
      { id: "staff-c", jobId: "C001", name: "丙护士", type: "nurse", isAdmin: false, enabled: true, sortOrder: 3 }
    ],
    editableStaffIds: ["staff-a", "staff-b", "staff-c"]
  });

  await wrapper.get('[data-testid="move-staff-down-staff-a"]').trigger("click");
  await wrapper.get('[data-testid="move-staff-up-staff-c"]').trigger("click");

  expect(wrapper.emitted("reorderStaff")).toEqual([
    [["staff-b", "staff-a", "staff-c"]],
    [["staff-a", "staff-c", "staff-b"]]
  ]);
});

it("disables edge reorder buttons and hides controls when reordering is unavailable", () => {
  const enabledWrapper = mountGrid([], {
    canReorderStaff: true,
    staff: [
      { id: "staff-a", jobId: "A001", name: "甲护士", type: "nurse", isAdmin: false, enabled: true, sortOrder: 1 },
      { id: "staff-b", jobId: "B001", name: "乙护士", type: "nurse", isAdmin: false, enabled: true, sortOrder: 2 }
    ],
    editableStaffIds: ["staff-a", "staff-b"]
  });

  expect(enabledWrapper.get('[data-testid="move-staff-up-staff-a"]').attributes("disabled")).toBeDefined();
  expect(enabledWrapper.get('[data-testid="move-staff-down-staff-b"]').attributes("disabled")).toBeDefined();

  const disabledWrapper = mountGrid([], { canReorderStaff: false });
  expect(disabledWrapper.find('[data-testid^="move-staff-up-"]').exists()).toBe(false);
  expect(disabledWrapper.find('[data-testid^="move-staff-down-"]').exists()).toBe(false);
});
```

- [ ] **Step 2: Run component tests and verify RED**

Run:

```bash
npm run test -- src/components/ScheduleGrid.test.ts
```

Expected: fail because `canReorderStaff`, `reorderStaff`, and buttons do not exist.

- [ ] **Step 3: Add prop, emit, and reorder helper**

Update `ScheduleGrid.vue`.

```ts
const props = withDefaults(
  defineProps<{
    staff: StaffMember[];
    days: CalendarDay[];
    holidays: Holiday[];
    shifts: Shift[];
    entries: ScheduleEntry[];
    selectedShiftId: string;
    editableStaffIds: string[];
    canReorderStaff?: boolean;
  }>(),
  {
    canReorderStaff: false
  }
);

const emit = defineEmits<{
  quickFill: [staffId: string, date: string];
  editCell: [staffId: string, date: string];
  reorderStaff: [staffIds: string[]];
}>();

const canShowReorderControls = computed(() => props.canReorderStaff && sortedStaff.value.length > 1);

function getStaffVisibleIndex(staffId: string): number {
  return sortedStaff.value.findIndex((staff) => staff.id === staffId);
}

function canMoveStaff(staffId: string, direction: "up" | "down"): boolean {
  const index = getStaffVisibleIndex(staffId);
  return direction === "up" ? index > 0 : index >= 0 && index < sortedStaff.value.length - 1;
}

function moveStaff(staffId: string, direction: "up" | "down"): void {
  if (!canMoveStaff(staffId, direction)) {
    return;
  }

  const staffIds = sortedStaff.value.map((staff) => staff.id);
  const index = staffIds.indexOf(staffId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  [staffIds[index], staffIds[targetIndex]] = [staffIds[targetIndex], staffIds[index]];
  emit("reorderStaff", staffIds);
}
```

- [ ] **Step 4: Render controls in sort column**

Replace the sort column row cell.

```vue
<th class="sticky-col sort-col">
  <span class="sort-order-value">{{ person.sortOrder }}</span>
  <span v-if="canShowReorderControls" class="staff-order-controls" aria-label="调整人员顺序">
    <button
      :data-testid="`move-staff-up-${person.id}`"
      type="button"
      :disabled="!canMoveStaff(person.id, 'up')"
      :aria-label="`${person.name} 上移`"
      @click.stop="moveStaff(person.id, 'up')"
    >
      ↑
    </button>
    <button
      :data-testid="`move-staff-down-${person.id}`"
      type="button"
      :disabled="!canMoveStaff(person.id, 'down')"
      :aria-label="`${person.name} 下移`"
      @click.stop="moveStaff(person.id, 'down')"
    >
      ↓
    </button>
  </span>
</th>
```

- [ ] **Step 5: Run component tests and verify GREEN**

Run:

```bash
npm run test -- src/components/ScheduleGrid.test.ts
```

Expected: tests pass.

---

### Task 4: App Integration And Order Persistence

**Files:**
- Modify: `src/App.vue`
- Modify: `src/App.test.ts`
- Test: `src/App.test.ts`

- [ ] **Step 1: Update the ScheduleGrid test stub**

Update the stub in `src/App.test.ts`.

```ts
const ScheduleGridStub = defineComponent({
  name: "ScheduleGrid",
  props: ["staff", "days", "editableStaffIds", "canReorderStaff"],
  emits: ["quickFill", "editCell", "reorderStaff"],
  template: `
    <section>
      <span data-testid="schedule-grid">{{ days.map((day) => day.key).join(",") }}</span>
      <span data-testid="schedule-staff-ids">{{ staff.map((person) => person.id).join(",") }}</span>
      <span data-testid="schedule-editable-staff-ids">{{ editableStaffIds?.join(",") }}</span>
      <span data-testid="schedule-can-reorder-staff">{{ String(canReorderStaff) }}</span>
      <button
        data-testid="emit-reorder-staff"
        type="button"
        @click="$emit('reorderStaff', ['staff-clerk-001', 'staff-head-001', 'staff-nurse-001'])"
      >
        reorder staff
      </button>
      <button data-testid="emit-unmanaged-quick-fill" type="button" @click="$emit('quickFill', 'staff-nurse-002', '2026-06-15')">
        unmanaged quick fill
      </button>
      <button data-testid="emit-unmanaged-edit-cell" type="button" @click="$emit('editCell', 'staff-nurse-002', '2026-06-15')">
        unmanaged edit
      </button>
    </section>
  `
});
```

- [ ] **Step 2: Write failing App tests**

Add tests near schedule page tests.

```ts
it("lets admins reorder visible staff and persists continuous sort ids", async () => {
  const wrapper = mountApp();
  await enterAdminModeForTest(wrapper);

  expect(wrapper.get('[data-testid="schedule-can-reorder-staff"]').text()).toBe("true");

  await wrapper.get('[data-testid="emit-reorder-staff"]').trigger("click");
  await flushPromises();

  const reorderRequest = fetchMock.mock.calls.find(([path, options]) => {
    return path === "/api/data/staff-order" && (options as RequestInit | undefined)?.method === "PUT";
  });
  expect(reorderRequest).toBeDefined();
  expect(JSON.parse((reorderRequest?.[1] as RequestInit).body as string)).toEqual({
    staffIds: ["staff-clerk-001", "staff-head-001", "staff-nurse-001"]
  });
});

it("hides schedule reorder controls while staff search is active", async () => {
  const wrapper = mountApp();
  await enterAdminModeForTest(wrapper);

  await wrapper.get('[data-testid="schedule-staff-search"]').setValue("李护士");

  expect(wrapper.get('[data-testid="schedule-can-reorder-staff"]').text()).toBe("false");
});
```

- [ ] **Step 3: Run App tests and verify RED**

Run:

```bash
npm run test -- src/App.test.ts -t "reorder visible staff|hides schedule reorder"
```

Expected: fail because no API helper, no handler, and `canReorderStaff` is not passed.

- [ ] **Step 4: Import API helper and add state**

Modify the imports and refs in `src/App.vue`.

```ts
import {
  ...
  saveStaff,
  saveStaffOrder,
  ...
} from "@/api/client";

const staffOrderSaving = ref(false);
```

- [ ] **Step 5: Add reorder permission and order merge helpers**

Add near schedule computed values.

```ts
const canReorderScheduleStaff = computed(
  () => canManageConfig.value && !hasScheduleStaffSearch.value && !staffOrderSaving.value
);

function mergeVisibleStaffOrder(visibleStaffIds: string[]): string[] {
  if (!data.value) {
    return [];
  }

  const visibleStaffIdSet = new Set(visibleStaffIds);
  let visibleIndex = 0;

  return [...data.value.staff]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((staff) => {
      if (!visibleStaffIdSet.has(staff.id)) {
        return staff.id;
      }

      const nextStaffId = visibleStaffIds[visibleIndex];
      visibleIndex += 1;
      return nextStaffId;
    });
}
```

- [ ] **Step 6: Add reorder handler**

Add near `handleSaveStaff`.

```ts
async function handleReorderStaff(visibleStaffIds: string[]): Promise<void> {
  if (!data.value || !canReorderScheduleStaff.value || staffOrderSaving.value) {
    return;
  }

  const staffIds = mergeVisibleStaffOrder(visibleStaffIds);
  if (staffIds.length !== data.value.staff.length) {
    ElMessage.error("人员排序保存失败");
    return;
  }

  staffOrderSaving.value = true;
  try {
    data.value = await saveStaffOrder(staffIds);
    staffSaveVersion.value += 1;
    ElMessage.success("人员顺序已更新");
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "人员排序保存失败");
  } finally {
    staffOrderSaving.value = false;
  }
}
```

- [ ] **Step 7: Pass props and event to ScheduleGrid**

Update the `ScheduleGrid` usage in the schedule tab.

```vue
<ScheduleGrid
  v-if="!hasScheduleStaffSearch || hasScheduleStaffSearchResults"
  :staff="filteredScheduleStaff"
  :days="scheduleDays"
  :holidays="data.holidays"
  :shifts="data.shifts"
  :entries="data.scheduleEntries"
  :selected-shift-id="selectedShiftId"
  :editable-staff-ids="editableStaffIds"
  :can-reorder-staff="canReorderScheduleStaff"
  @quick-fill="handleQuickFill"
  @edit-cell="handleEditCell"
  @reorder-staff="handleReorderStaff"
/>
```

- [ ] **Step 8: Run App tests and verify GREEN**

Run:

```bash
npm run test -- src/App.test.ts -t "reorder visible staff|hides schedule reorder"
```

Expected: tests pass.

---

### Task 5: Styling For Sort Controls

**Files:**
- Modify: `src/styles/main.css`
- Test: `src/styles/main-css.test.ts`

- [ ] **Step 1: Write failing style test**

Add under schedule grid layout tests in `src/styles/main-css.test.ts`.

```ts
it("styles staff reorder controls compactly inside the sort column", () => {
  const sortValue = ruleBlocks(".sort-order-value")[0] ?? "";
  const controls = ruleBlocks(".staff-order-controls")[0] ?? "";
  const buttons = ruleBlocks(".staff-order-controls button")[0] ?? "";
  const disabledButton = ruleBlocks(".staff-order-controls button:disabled")[0] ?? "";

  expect(sortValue).toContain("font-weight: 700");
  expect(controls).toContain("display: inline-flex");
  expect(controls).toContain("gap: 2px");
  expect(buttons).toContain("width: 18px");
  expect(buttons).toContain("height: 18px");
  expect(buttons).toContain("font-size: 12px");
  expect(disabledButton).toContain("opacity: 0.35");
});
```

- [ ] **Step 2: Run style test and verify RED**

Run:

```bash
npm run test -- src/styles/main-css.test.ts -t "staff reorder controls"
```

Expected: fail because classes do not exist.

- [ ] **Step 3: Add CSS**

Add near existing schedule grid fixed-column styles.

```css
.sort-order-value {
  display: block;
  font-weight: 700;
}

.staff-order-controls {
  display: inline-flex;
  justify-content: center;
  gap: 2px;
  margin-top: 3px;
}

.staff-order-controls button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
  padding: 0;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.staff-order-controls button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
```

- [ ] **Step 4: Run style test and verify GREEN**

Run:

```bash
npm run test -- src/styles/main-css.test.ts -t "staff reorder controls"
```

Expected: test passes.

---

### Task 6: Final Verification

**Files:**
- No new files.
- Validate all modified areas.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npm run test -- server/routes.test.ts src/api/client.ts src/components/ScheduleGrid.test.ts src/App.test.ts src/styles/main-css.test.ts
```

Expected: all pass. If `server/routes.test.ts` fails in sandbox with `listen EPERM`, rerun only that file with unsandboxed approval.

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build pass. Existing Vite large chunk warnings may appear.

- [ ] **Step 3: Manual verification**

1. Start dev server.
2. Login as `admin`.
3. On the schedule tab, verify reorder buttons show in the `排序ID` column when no staff search is active.
4. Click row 2 up.
5. Verify row 2 becomes row 1 and the displayed `排序ID` changes to `1`.
6. Verify the previous row becomes row 2 and displays `排序ID` as `2`.
7. Refresh the page and verify the order persists.
8. Enter a staff search query and verify reorder buttons are hidden.
9. Open query, weekly summary, and print preview to confirm they follow the updated order.

- [ ] **Step 4: Check git diff**

Run:

```bash
git diff -- src/components/ScheduleGrid.vue src/components/ScheduleGrid.test.ts src/App.vue src/App.test.ts src/api/client.ts server/routes.ts server/routes.test.ts src/styles/main.css src/styles/main-css.test.ts
```

Expected: only staff reorder related changes.

---

## Self-Review

- Spec coverage: The plan adds admin-only up/down controls, persists real `sortOrder`, rewrites IDs continuously, hides controls during search, and ensures downstream views use the persisted order.
- Placeholder scan: No `TBD`, `TODO`, or incomplete implementation steps remain.
- Type consistency: The emitted event is `reorderStaff`, the API helper is `saveStaffOrder(staffIds)`, and the server payload shape is `{ staffIds: string[] }` throughout.
