# Account Staff Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make account-to-staff binding enforce real edit permissions through explicit managed staff lists while keeping whole-department schedule visibility.

**Architecture:** Add `managedStaffIds` to auth users and persist it in SQLite through a `user_managed_staff` relation. Centralize permission checks in a small server module, enforce them in API routes, and mirror the same editability in Vue components so unauthorized cells are silently read-only. Because monthly settlements are currently month-level snapshots, scheduler accounts can create or delete a settlement only when their managed staff list covers every staff row included in that settlement operation.

**Tech Stack:** Vue 3, TypeScript, Express, better-sqlite3, Vitest, Supertest, Element Plus.

---

## File Structure

- Modify `server/auth.ts`: expose `managedStaffIds` on `AuthUser` and `PublicAuthUser`.
- Modify `server/auth-store.ts`: extend memory auth store with managed staff lists.
- Modify `server/sqlite/schema.ts`: add schema version 4 and `user_managed_staff`.
- Modify `server/sqlite/auth-store.ts`: read and write managed staff relations.
- Create `server/permissions.ts`: central permission helpers.
- Create `server/permissions.test.ts`: unit tests for role and managed staff decisions.
- Modify `server/routes.ts`: parse managed staff IDs, validate account saves, require login for `/api/data`, enforce staff-scoped writes.
- Modify `server/auth.test.ts`, `server/sqlite-auth-store.test.ts`, and `server/routes.test.ts`: cover auth store, schema, and API behavior.
- Modify `src/api/client.ts`: expose `managedStaffIds` in client auth types and save payloads.
- Modify `src/components/ManagementDrawer.vue`: add managed staff column and multi-select.
- Modify `src/components/ScheduleGrid.vue`: replace coarse edit mode with explicit editable staff IDs.
- Modify `src/components/BonusSettlementPanel.vue`: replace coarse edit mode with explicit settlement-operation flag.
- Modify `src/App.vue`: compute editable staff IDs and settlement permissions from current user.
- Modify Vue component tests under `src/components/*.test.ts` and `src/App.test.ts`.
- Modify `docs/功能跟进清单.md` and `docs/正式部署运行手册.md`: document the new permission behavior.

---

### Task 1: Shared Auth Types And Memory Store

**Files:**
- Modify: `server/auth.ts`
- Modify: `server/auth-store.ts`
- Modify: `server/auth.test.ts`

- [ ] **Step 1: Write failing memory auth store tests**

Add this test in `server/auth.test.ts` inside the existing auth store describe block:

```ts
it("stores managed staff ids on users and public sessions", async () => {
  const store = createMemoryAuthStore();
  await store.ensureBootstrapAdmin({ username: "admin", password: "123456" });

  const user = await store.saveUser({
    id: "user-scheduler",
    username: "scheduler",
    displayName: "排班管理员",
    role: "scheduler",
    enabled: true,
    staffId: null,
    managedStaffIds: ["staff-nurse-001", "staff-nurse-002"],
    password: "scheduler-password"
  });

  expect(user.managedStaffIds).toEqual(["staff-nurse-001", "staff-nurse-002"]);
  await expect(
    store.saveUser({
      id: "user-scheduler",
      username: "scheduler",
      displayName: "排班管理员",
      role: "scheduler",
      enabled: true,
      staffId: null,
      managedStaffIds: ["staff-nurse-002", "staff-nurse-001", "staff-nurse-001"]
    })
  ).resolves.toEqual(expect.objectContaining({ managedStaffIds: ["staff-nurse-001", "staff-nurse-002"] }));

  const session = await store.createSession("user-scheduler");
  expect(session.user.managedStaffIds).toEqual(["staff-nurse-001", "staff-nurse-002"]);
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test -- server/auth.test.ts -t "stores managed staff ids"
```

Expected: TypeScript or runtime failure because `managedStaffIds` is not part of auth users yet.

- [ ] **Step 3: Add managed staff IDs to auth types**

In `server/auth.ts`, update the interfaces and public mapper:

```ts
export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  staffId: string | null;
  managedStaffIds: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicAuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  staffId: string | null;
  managedStaffIds: string[];
}

export function toPublicAuthUser(user: AuthUser): PublicAuthUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    staffId: user.staffId,
    managedStaffIds: [...user.managedStaffIds]
  };
}
```

- [ ] **Step 4: Extend the memory auth store**

In `server/auth-store.ts`, add `managedStaffIds` to `SaveAuthUserInput`:

```ts
export interface SaveAuthUserInput {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  enabled: boolean;
  password?: string | null;
  staffId?: string | null;
  managedStaffIds?: string[];
  managedStaffUpdatedBy?: string | null;
}
```

Add this helper near `sortUsers`:

```ts
function normalizeManagedStaffIds(staffIds: string[] | undefined): string[] {
  return Array.from(new Set((staffIds ?? []).map((staffId) => staffId.trim()).filter(Boolean))).sort();
}
```

Update `createUser`, `toAuthUser`, and `saveUser` paths:

```ts
function createUser(username: string, password: string, role: UserRole): StoredUser {
  const timestamp = nowIso();
  return {
    id: randomUUID(),
    username,
    displayName: username === "admin" ? "系统管理员" : username,
    role,
    staffId: null,
    managedStaffIds: [],
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    passwordHash: hashPassword(password)
  };
}

function toAuthUser(user: StoredUser): AuthUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    staffId: user.staffId,
    managedStaffIds: [...user.managedStaffIds],
    enabled: user.enabled,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}
```

Inside `saveUser`, compute once and write it:

```ts
const managedStaffIds = normalizeManagedStaffIds(input.managedStaffIds);
```

For an existing user:

```ts
existingUser.managedStaffIds = managedStaffIds;
```

For a new user:

```ts
managedStaffIds,
```

For `ensureBootstrapAdmin`, clear the list:

```ts
existingUser.managedStaffIds = [];
```

- [ ] **Step 5: Run the focused test**

Run:

```bash
npm run test -- server/auth.test.ts -t "stores managed staff ids"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/auth.ts server/auth-store.ts server/auth.test.ts
git commit -m "feat: add managed staff ids to auth users"
```

---

### Task 2: SQLite Managed Staff Persistence

**Files:**
- Modify: `server/sqlite/schema.ts`
- Modify: `server/sqlite/auth-store.ts`
- Modify: `server/sqlite-auth-store.test.ts`
- Modify: `docs/SQLite常用命令.md`

- [ ] **Step 1: Write failing SQLite schema and store tests**

In `server/sqlite-auth-store.test.ts`, add:

```ts
it("adds managed staff relation table when initializing schema", async () => {
  const sqlitePath = await createTempDbPath();
  const db = new Database(sqlitePath);

  try {
    initializeSqliteSchema(db);

    const tables = db.prepare("select name from sqlite_master where type = 'table'").all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name)).toContain("user_managed_staff");

    const indexes = db.prepare("pragma index_list(user_managed_staff)").all() as Array<{ name: string; unique: number }>;
    expect(indexes).toEqual(expect.arrayContaining([expect.objectContaining({ name: "sqlite_autoindex_user_managed_staff_1" })]));

    const migration = db.prepare("select version from schema_migrations where version = 4").get();
    expect(migration).toEqual(expect.objectContaining({ version: 4 }));
  } finally {
    db.close();
  }
});

it("persists managed staff ids in SQLite users", async () => {
  const sqlitePath = await createTempDbPath();
  const db = new Database(sqlitePath);

  try {
    initializeSqliteSchema(db);
    db.prepare(
      "insert into staff (id, job_id, name, type, is_admin, enabled, sort_order) values (?, ?, ?, ?, ?, ?, ?)"
    ).run("staff-nurse-001", "100001", "李护士", "nurse", 0, 1, 1);
    db.prepare(
      "insert into staff (id, job_id, name, type, is_admin, enabled, sort_order) values (?, ?, ?, ?, ?, ?, ?)"
    ).run("staff-nurse-002", "100002", "王护士", "nurse", 0, 1, 2);
  } finally {
    db.close();
  }

  const store = createSqliteAuthStore(sqlitePath);
  await store.ensureBootstrapAdmin({ username: "admin", password: "123456" });
  await store.saveUser({
    id: "user-scheduler",
    username: "scheduler",
    displayName: "排班管理员",
    role: "scheduler",
    enabled: true,
    staffId: null,
    managedStaffIds: ["staff-nurse-002", "staff-nurse-001"],
    managedStaffUpdatedBy: "user-admin",
    password: "scheduler-password"
  });

  await expect(store.listUsers()).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "user-scheduler",
        managedStaffIds: ["staff-nurse-001", "staff-nurse-002"]
      })
    ])
  );
});
```

- [ ] **Step 2: Run the failing SQLite tests**

Run:

```bash
npm run test -- server/sqlite-auth-store.test.ts -t "managed staff"
```

Expected: FAIL because the relation table and mapper do not exist.

- [ ] **Step 3: Add schema version 4 and relation table**

In `server/sqlite/schema.ts`, update the version:

```ts
export const SQLITE_SCHEMA_VERSION = 4;
```

Add this table inside the schema `db.exec` block after `users`:

```sql
create table if not exists user_managed_staff (
  user_id text not null references users(id) on delete cascade,
  staff_id text not null references staff(id),
  created_at text not null,
  created_by text references users(id),
  primary key(user_id, staff_id)
);

create index if not exists idx_user_managed_staff_staff_id
on user_managed_staff(staff_id);
```

Add `"user_managed_staff"` to `listMissingCoreTables`.

- [ ] **Step 4: Read managed staff IDs in SQLite auth store**

In `server/sqlite/auth-store.ts`, add:

```ts
function normalizeManagedStaffIds(staffIds: string[] | undefined): string[] {
  return Array.from(new Set((staffIds ?? []).map((staffId) => staffId.trim()).filter(Boolean))).sort();
}

function readManagedStaffIds(db: Database.Database, userId: string): string[] {
  const rows = db
    .prepare("select staff_id from user_managed_staff where user_id = ? order by staff_id asc")
    .all(userId) as Array<{ staff_id: string }>;
  return rows.map((row) => row.staff_id);
}

function attachManagedStaffIds(db: Database.Database, user: AuthUser): AuthUser {
  return {
    ...user,
    managedStaffIds: readManagedStaffIds(db, user.id)
  };
}
```

Update `mapUser` to initialize the field:

```ts
function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    staffId: row.staff_id,
    managedStaffIds: [],
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
```

Update all read paths that return users:

```ts
return row ? { ...attachManagedStaffIds(db, mapUser(row)), passwordHash: row.password_hash } : null;
```

Use the same `attachManagedStaffIds` call in `readEnabledUserById`, `listUsers`, and `sanitizeUser`.

- [ ] **Step 5: Write managed staff IDs when saving users**

In `saveUser`, compute:

```ts
const managedStaffIds = normalizeManagedStaffIds(input.managedStaffIds);
const managedStaffUpdatedBy = input.managedStaffUpdatedBy?.trim() || null;
```

Wrap the existing insert/update plus relation replacement in a transaction:

```ts
function replaceManagedStaffIds(
  db: Database.Database,
  userId: string,
  staffIds: string[],
  createdBy: string | null,
  timestamp: string
): void {
  db.prepare("delete from user_managed_staff where user_id = ?").run(userId);
  const insertRelation = db.prepare(
    "insert into user_managed_staff (user_id, staff_id, created_at, created_by) values (?, ?, ?, ?)"
  );
  for (const staffId of staffIds) {
    insertRelation.run(userId, staffId, timestamp, createdBy);
  }
}
```

Call `replaceManagedStaffIds` for both existing and new users. Return the saved user with `managedStaffIds`.

- [ ] **Step 6: Update SQLite command documentation**

In `docs/SQLite常用命令.md`, add these commands near the user binding section:

```md
查看账号可管理人员关系：

    sqlite3 /var/lib/my-working-schedule/schedule.db "select user_id, staff_id, created_at, created_by from user_managed_staff order by user_id, staff_id;"

查看可管理人员表结构：

    sqlite3 /var/lib/my-working-schedule/schedule.db "pragma table_info(user_managed_staff);"
    sqlite3 /var/lib/my-working-schedule/schedule.db "pragma foreign_key_list(user_managed_staff);"
    sqlite3 /var/lib/my-working-schedule/schedule.db "pragma index_list(user_managed_staff);"
```

- [ ] **Step 7: Run SQLite tests**

Run:

```bash
npm run test -- server/sqlite-auth-store.test.ts server/sqlite-storage.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/sqlite/schema.ts server/sqlite/auth-store.ts server/sqlite-auth-store.test.ts docs/SQLite常用命令.md
git commit -m "feat: persist managed staff permissions in sqlite"
```

---

### Task 3: Central Permission Service And API Enforcement

**Files:**
- Create: `server/permissions.ts`
- Create: `server/permissions.test.ts`
- Modify: `server/routes.ts`
- Modify: `server/routes.test.ts`

- [ ] **Step 1: Write permission service tests**

Create `server/permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AuthUser } from "./auth";
import { canManageAllStaff, canManageStaff, canReadAppData } from "./permissions";

function user(overrides: Partial<AuthUser>): AuthUser {
  return {
    id: "user-test",
    username: "test",
    displayName: "测试账号",
    role: "viewer",
    staffId: null,
    managedStaffIds: [],
    enabled: true,
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    ...overrides
  };
}

describe("permissions", () => {
  it("allows only authenticated enabled users to read app data", () => {
    expect(canReadAppData(null)).toBe(false);
    expect(canReadAppData(user({ enabled: false }))).toBe(false);
    expect(canReadAppData(user({ enabled: true }))).toBe(true);
  });

  it("allows admins to manage every staff member", () => {
    expect(canManageStaff(user({ role: "admin" }), "staff-any")).toBe(true);
    expect(canManageAllStaff(user({ role: "admin" }), ["staff-a", "staff-b"])).toBe(true);
  });

  it("limits schedulers to managed staff ids", () => {
    const scheduler = user({ role: "scheduler", managedStaffIds: ["staff-a"] });

    expect(canManageStaff(scheduler, "staff-a")).toBe(true);
    expect(canManageStaff(scheduler, "staff-b")).toBe(false);
    expect(canManageAllStaff(scheduler, ["staff-a"])).toBe(true);
    expect(canManageAllStaff(scheduler, ["staff-a", "staff-b"])).toBe(false);
  });

  it("keeps viewers read-only even when managed ids are present", () => {
    expect(canManageStaff(user({ role: "viewer", managedStaffIds: ["staff-a"] }), "staff-a")).toBe(false);
  });
});
```

- [ ] **Step 2: Run failing permission tests**

Run:

```bash
npm run test -- server/permissions.test.ts
```

Expected: FAIL because `server/permissions.ts` does not exist.

- [ ] **Step 3: Implement permission service**

Create `server/permissions.ts`:

```ts
import type { AuthUser } from "./auth";

export function canReadAppData(user: AuthUser | null | undefined): user is AuthUser {
  return Boolean(user?.enabled);
}

export function canManageSystem(user: AuthUser | null | undefined): boolean {
  return user?.enabled === true && user.role === "admin";
}

export function canManageStaff(user: AuthUser | null | undefined, staffId: string): boolean {
  if (!user?.enabled) {
    return false;
  }

  if (user.role === "admin") {
    return true;
  }

  if (user.role !== "scheduler") {
    return false;
  }

  return user.managedStaffIds.includes(staffId);
}

export function canManageAllStaff(user: AuthUser | null | undefined, staffIds: string[]): boolean {
  return staffIds.every((staffId) => canManageStaff(user, staffId));
}
```

- [ ] **Step 4: Add API tests for login-required data and scoped writes**

In `server/routes.test.ts`, update the old unauthenticated data test to expect `401` and add authenticated data coverage:

```ts
it("requires login to read app data", async () => {
  await request(createTestApp()).get("/api/data").expect(401, { message: "请先登录" });
});

it("returns app data to authenticated users without leaking the admin password", async () => {
  const app = createTestApp();
  const headers = await adminHeaders(app);

  const response = await request(app).get("/api/data").set(headers).expect(200);

  expect(response.body.staff).toHaveLength(3);
  expect(response.body.settings.adminPassword).toBeUndefined();
});
```

Add helpers near `adminHeaders`:

```ts
async function createUserAndLogin(
  app: express.Express,
  payload: {
    id: string;
    username: string;
    displayName: string;
    role: "admin" | "scheduler" | "viewer";
    managedStaffIds?: string[];
  }
) {
  const password = `${payload.username}-password`;
  await request(app)
    .put(`/api/users/${payload.id}`)
    .set(await adminHeaders(app))
    .send({
      username: payload.username,
      displayName: payload.displayName,
      role: payload.role,
      enabled: true,
      staffId: null,
      managedStaffIds: payload.managedStaffIds ?? [],
      password
    })
    .expect(200);

  const loginResponse = await request(app)
    .post("/api/auth/login")
    .send({ username: payload.username, password })
    .expect(200);
  return { Authorization: `Bearer ${loginResponse.body.token}` };
}
```

Add route behavior tests:

```ts
it("enforces managed staff permissions for schedule writes", async () => {
  const app = createTestApp();
  const headers = await createUserAndLogin(app, {
    id: "user-scheduler",
    username: "scheduler",
    displayName: "排班员",
    role: "scheduler",
    managedStaffIds: ["staff-head"]
  });

  await request(app)
    .put("/api/data/schedule-entry")
    .set(headers)
    .send({ date: "2026-06-15", staffId: "staff-head", shiftIds: ["shift-a1"], note: "" })
    .expect(200);

  await request(app)
    .put("/api/data/schedule-entry")
    .set(headers)
    .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" })
    .expect(403, { message: "当前账号没有该人员操作权限" });
});

it("blocks viewers from schedule writes", async () => {
  const app = createTestApp();
  const headers = await createUserAndLogin(app, {
    id: "user-viewer",
    username: "viewer",
    displayName: "只读账号",
    role: "viewer",
    managedStaffIds: ["staff-head"]
  });

  await request(app)
    .put("/api/data/schedule-entry")
    .set(headers)
    .send({ date: "2026-06-15", staffId: "staff-head", shiftIds: ["shift-a1"], note: "" })
    .expect(403);
});

it("requires schedulers to cover every settlement row before creating or deleting month settlements", async () => {
  const app = createTestApp();
  const limitedHeaders = await createUserAndLogin(app, {
    id: "user-limited-scheduler",
    username: "limited-scheduler",
    displayName: "部分排班员",
    role: "scheduler",
    managedStaffIds: ["staff-head"]
  });

  await request(app)
    .put("/api/data/monthly-settlement")
    .set(limitedHeaders)
    .send({ month: "2026-06", bonusPool: 1000 })
    .expect(403, { message: "当前账号没有该人员操作权限" });

  const fullHeaders = await createUserAndLogin(app, {
    id: "user-full-scheduler",
    username: "full-scheduler",
    displayName: "全量排班员",
    role: "scheduler",
    managedStaffIds: ["staff-head", "staff-nurse-001", "staff-clerk-001"]
  });

  await request(app)
    .put("/api/data/monthly-settlement")
    .set(fullHeaders)
    .send({ month: "2026-06", bonusPool: 1000 })
    .expect(200);
  await request(app).delete("/api/data/monthly-settlement/2026-06").set(fullHeaders).expect(200);
});
```

- [ ] **Step 5: Implement route enforcement**

In `server/routes.ts`, import:

```ts
import { canManageAllStaff, canManageStaff } from "./permissions";
```

Add all-role middleware:

```ts
const requireAuthenticated = requireRoles(["admin", "scheduler", "viewer"]);
```

Change data route:

```ts
router.get("/data", requireAuthenticated, async (_request, response, next) => {
  try {
    const data = await storage.load();
    response.json(toPublicData(data));
  } catch (error) {
    handleRouteError(error, response, next);
  }
});
```

Add denial helper inside `createRoutes`:

```ts
async function denyStaffScope(request: Request, response: Response, staffId: string): Promise<void> {
  await recordAudit(
    request,
    "auth.permission.denied",
    "staff",
    staffId,
    `越权操作人员：${staffId}`
  );
  response.status(403).json({ message: "当前账号没有该人员操作权限" });
}
```

In `/data/schedule-entry`, after parsing `staffId` and date, before `storage.update`:

```ts
if (!canManageStaff(request.authUser, staffId)) {
  await denyStaffScope(request, response, staffId);
  return;
}
```

In monthly create, compute target staff IDs inside `storage.update` before writing:

```ts
const settlementStaffIds = monthlySummary.rows.map((row) => row.staffId);
if (!canManageAllStaff(request.authUser, settlementStaffIds)) {
  throw new HttpResponseError(403, "当前账号没有该人员操作权限");
}
```

In monthly delete, load the settlement and check rows:

```ts
const settlement = data.monthlySettlements.find((item) => item.month === month);
if (!settlement) {
  throw new HttpResponseError(404, "该月份未月结");
}
if (!canManageAllStaff(request.authUser, settlement.rows.map((row) => row.staffId))) {
  throw new HttpResponseError(403, "当前账号没有该人员操作权限");
}
```

- [ ] **Step 6: Run route and permission tests**

Run:

```bash
npm run test -- server/permissions.test.ts server/routes.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/permissions.ts server/permissions.test.ts server/routes.ts server/routes.test.ts
git commit -m "feat: enforce staff scoped write permissions"
```

---

### Task 4: Account Management UI For Managed Staff

**Files:**
- Modify: `src/api/client.ts`
- Modify: `src/components/ManagementDrawer.vue`
- Modify: `src/components/ManagementDrawer.test.ts`
- Modify: `src/App.vue`
- Modify: `src/App.test.ts`

- [ ] **Step 1: Write failing drawer tests**

In `src/components/ManagementDrawer.test.ts`, update the `users` fixture to include `managedStaffIds`, then add:

```ts
it("renders and emits managed staff ids for scheduler accounts", async () => {
  const wrapper = mountDrawer();

  expect(wrapper.text()).toContain("可管理人员");

  await wrapper
    .findAll(".management-mobile-user")
    .find((item) => item.text().includes("排班管理员"))!
    .trigger("click");

  const managedSelect = wrapper.get('select[data-placeholder="可管理人员"]');
  await managedSelect.setValue("staff-head");
  await wrapper.get('[data-testid="save-user-button"]').trigger("click");

  expect(wrapper.emitted("saveUser")).toEqual([
    [
      expect.objectContaining({
        username: "scheduler",
        managedStaffIds: ["staff-head"]
      })
    ]
  ]);
});
```

Update `ElSelectStub` to support multiple select:

```ts
const ElSelectStub = defineComponent({
  name: "ElSelect",
  props: ["modelValue", "placeholder", "disabled", "multiple"],
  emits: ["update:modelValue"],
  template:
    '<select :multiple="multiple" :data-placeholder="placeholder" :value="modelValue" @change="$emit(\'update:modelValue\', multiple ? Array.from($event.target.selectedOptions).map(option => option.value) : $event.target.value)"><slot /></select>'
});
```

- [ ] **Step 2: Run failing drawer test**

Run:

```bash
npm run test -- src/components/ManagementDrawer.test.ts -t "managed staff ids"
```

Expected: FAIL because the component does not render or emit managed staff IDs.

- [ ] **Step 3: Update client auth types**

In `src/api/client.ts`, add `managedStaffIds`:

```ts
export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  staffId: string | null;
  managedStaffIds: string[];
}

export interface SaveAuthUserInput {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  enabled: boolean;
  staffId?: string | null;
  managedStaffIds?: string[];
  password?: string;
}
```

- [ ] **Step 4: Update management drawer draft and labels**

In `src/components/ManagementDrawer.vue`, initialize and reset `managedStaffIds`:

```ts
const userDraft = reactive<SaveAuthUserInput>({
  id: "",
  username: "",
  displayName: "",
  role: "viewer",
  enabled: true,
  staffId: null,
  managedStaffIds: [],
  password: ""
});
```

Add:

```ts
const manageableStaff = computed(() =>
  props.data.staff.filter((staff) => staff.enabled || userDraft.managedStaffIds?.includes(staff.id))
);

function managedStaffLabel(staffIds: string[] | undefined): string {
  const ids = staffIds ?? [];
  if (ids.length === 0) {
    return "未配置";
  }

  const labels = ids.map((staffId) => staffBindingLabel(staffId));
  return labels.length > 2 ? `${labels.slice(0, 2).join("、")} 等 ${labels.length} 人` : labels.join("、");
}
```

Update `loadUserDraft`:

```ts
managedStaffIds: [...user.managedStaffIds],
```

Update `emitSaveUser`:

```ts
managedStaffIds: userDraft.role === "scheduler" ? [...(userDraft.managedStaffIds ?? [])] : []
```

In the account table, add:

```vue
<el-table-column label="可管理人员" width="170">
  <template #default="{ row }">
    {{ row.role === "admin" ? "全部人员" : managedStaffLabel(row.managedStaffIds) }}
  </template>
</el-table-column>
```

In the mobile account metadata, add:

```vue
<span>{{ user.role === "admin" ? "管理全部人员" : managedStaffLabel(user.managedStaffIds) }}</span>
```

Replace the old help text with:

```vue
<p class="management-help-text">
  绑定人员用于标识账号本人；可管理人员决定排班和月结可操作范围。
</p>
```

Add the scheduler-only multi-select after role selection:

```vue
<el-select
  v-if="userDraft.role === 'scheduler'"
  v-model="userDraft.managedStaffIds"
  placeholder="可管理人员"
  multiple
  clearable
  :disabled="userSaving"
>
  <el-option
    v-for="staff in manageableStaff"
    :key="staff.id"
    :label="`${staff.name} / ${staff.jobId} / ${staffTypeLabel(staff.type)}${staff.enabled ? '' : '（已停用）'}`"
    :value="staff.id"
  />
</el-select>
<p v-else-if="userDraft.role === 'admin'" class="management-help-text">系统管理员默认可管理全部人员。</p>
<p v-else class="management-help-text">只读账号可以查看全科排班，但不能编辑排班和月结。</p>
```

- [ ] **Step 5: Update App user save flow**

In `src/App.vue`, ensure `handleSaveUser` preserves the new field by passing `SaveAuthUserInput` unchanged. Add a regression test in `src/App.test.ts` where the mocked management drawer emits:

```ts
emit("saveUser", {
  id: "user-scheduler",
  username: "scheduler",
  displayName: "排班管理员",
  role: "scheduler",
  enabled: true,
  staffId: null,
  managedStaffIds: ["staff-head"]
});
```

Assert the mocked `saveUser` API receives `managedStaffIds: ["staff-head"]`.

- [ ] **Step 6: Run frontend account tests**

Run:

```bash
npm run test -- src/components/ManagementDrawer.test.ts src/App.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/api/client.ts src/components/ManagementDrawer.vue src/components/ManagementDrawer.test.ts src/App.vue src/App.test.ts
git commit -m "feat: configure managed staff in account drawer"
```

---

### Task 5: Frontend Editability For Schedule And Settlement

**Files:**
- Modify: `src/components/ScheduleGrid.vue`
- Modify: `src/components/ScheduleGrid.test.ts`
- Modify: `src/components/BonusSettlementPanel.vue`
- Modify: `src/components/BonusSettlementPanel.test.ts`
- Modify: `src/App.vue`
- Modify: `src/App.test.ts`

- [ ] **Step 1: Write failing ScheduleGrid test**

In `src/components/ScheduleGrid.test.ts`, change `mountGrid` default props from `adminMode: true` to:

```ts
editableStaffIds: ["staff-enabled"]
```

Add:

```ts
it("keeps unmanaged enabled staff cells read-only", async () => {
  vi.useFakeTimers();
  const wrapper = mountGrid([], {
    editableStaffIds: []
  });
  const cell = wrapper.get('[data-testid="schedule-cell-staff-enabled-2026-06-19"]');

  expect(cell.classes()).not.toContain("editable");

  await cell.trigger("click");
  vi.advanceTimersByTime(200);
  await cell.trigger("dblclick");

  expect(wrapper.emitted("quickFill")).toBeUndefined();
  expect(wrapper.emitted("editCell")).toBeUndefined();
});
```

- [ ] **Step 2: Update ScheduleGrid props and edit check**

In `src/components/ScheduleGrid.vue`, replace the prop:

```ts
editableStaffIds: string[];
```

Add:

```ts
const editableStaffIdSet = computed(() => new Set(props.editableStaffIds));
```

Replace `canEditStaff`:

```ts
function canEditStaff(staff: StaffMember): boolean {
  return staff.enabled && editableStaffIdSet.value.has(staff.id);
}
```

- [ ] **Step 3: Write failing BonusSettlementPanel test**

In `src/components/BonusSettlementPanel.test.ts`, rename the prop from `adminMode` to `canOperateSettlement` in `mountPanel`, then add:

```ts
it("blocks settlement actions when the current account cannot operate the whole settlement", async () => {
  const wrapper = mountPanel({ canOperateSettlement: false });

  await wrapper.get('[data-testid="bonus-pool-input"]').setValue("1000");

  expect(wrapper.get('[data-testid="confirm-settlement-button"]').attributes("disabled")).toBeDefined();
  expect(wrapper.emitted("confirmSettlement")).toBeUndefined();
});
```

- [ ] **Step 4: Update BonusSettlementPanel prop**

In `src/components/BonusSettlementPanel.vue`, replace:

```ts
adminMode: boolean;
```

with:

```ts
canOperateSettlement: boolean;
```

Update `canConfirm` and `canCancel`:

```ts
props.canOperateSettlement &&
```

- [ ] **Step 5: Compute editability in App.vue**

In `src/App.vue`, replace `canEditSchedule` with explicit helpers:

```ts
const managedStaffIdSet = computed(() => new Set(currentUser.value?.managedStaffIds ?? []));
const editableStaffIds = computed(() => {
  if (!data.value || !currentUser.value) {
    return [];
  }

  if (currentUser.value.role === "admin") {
    return data.value.staff.filter((staff) => staff.enabled).map((staff) => staff.id);
  }

  if (currentUser.value.role === "scheduler") {
    return data.value.staff
      .filter((staff) => staff.enabled && managedStaffIdSet.value.has(staff.id))
      .map((staff) => staff.id);
  }

  return [];
});
const canEditSchedule = computed(() => editableStaffIds.value.length > 0);
const canOperateCurrentSettlement = computed(() => {
  if (!currentUser.value || !displayedBonusSummary.value) {
    return false;
  }

  if (currentUser.value.role === "admin") {
    return true;
  }

  if (currentUser.value.role !== "scheduler") {
    return false;
  }

  return displayedBonusSummary.value.rows.every((row) => managedStaffIdSet.value.has(row.staffId));
});
```

Update `ScheduleGrid` usage:

```vue
:editable-staff-ids="editableStaffIds"
```

Update `BonusSettlementPanel` usage:

```vue
:can-operate-settlement="canOperateCurrentSettlement"
```

Update banner text:

```vue
<section v-if="currentUser.role === 'admin' || currentUser.role === 'scheduler'" class="admin-mode-banner" role="status">
  当前账号可查看全科排班{{ canManageConfig ? "，并可维护人员、班次、节假日和账号" : "；可编辑范围由账号可管理人员决定" }}。
</section>
```

Update the info panel quick-start text:

```vue
<p>所有登录账号可查看全科排班；排班员只能编辑账号可管理人员范围内的格子，其他格子为只读。</p>
```

- [ ] **Step 6: Guard App save handlers by staff ID**

Update `handleQuickFill`, `handleEditCell`, and `handleEditorSave`:

```ts
function canEditStaffId(staffId: string): boolean {
  return editableStaffIds.value.includes(staffId);
}

async function handleQuickFill(staffId: string, date: string): Promise<void> {
  if (!canEditStaffId(staffId) || !selectedShiftId.value) {
    return;
  }

  await saveEntry(staffId, date, [selectedShiftId.value], "");
}

function handleEditCell(staffId: string, date: string): void {
  if (!canEditStaffId(staffId)) {
    return;
  }

  editingStaffId.value = staffId;
  editingDate.value = date;
  editorOpen.value = true;
}

async function handleEditorSave(shiftIds: string[], note: string): Promise<void> {
  if (!canEditStaffId(editingStaffId.value)) {
    editorOpen.value = false;
    return;
  }

  if (await saveEntry(editingStaffId.value, editingDate.value, shiftIds, note)) {
    editorOpen.value = false;
  }
}
```

- [ ] **Step 7: Run frontend permission tests**

Run:

```bash
npm run test -- src/components/ScheduleGrid.test.ts src/components/BonusSettlementPanel.test.ts src/App.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/ScheduleGrid.vue src/components/ScheduleGrid.test.ts src/components/BonusSettlementPanel.vue src/components/BonusSettlementPanel.test.ts src/App.vue src/App.test.ts
git commit -m "feat: reflect staff scoped permissions in frontend"
```

---

### Task 6: User Save Validation, Audit Summaries, And Docs

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/routes.test.ts`
- Modify: `docs/功能跟进清单.md`
- Modify: `docs/正式部署运行手册.md`

- [ ] **Step 1: Write route validation tests**

In `server/routes.test.ts`, add:

```ts
it("validates managed staff ids when saving accounts", async () => {
  const app = createTestApp();
  const headers = await adminHeaders(app);

  await request(app)
    .put("/api/users/user-scheduler")
    .set(headers)
    .send({
      username: "scheduler",
      displayName: "排班管理员",
      role: "scheduler",
      enabled: true,
      staffId: null,
      managedStaffIds: ["missing-staff"],
      password: "scheduler-password"
    })
    .expect(400, { message: "可管理人员不存在" });

  await request(app)
    .put("/api/users/user-scheduler")
    .set(headers)
    .send({
      username: "scheduler",
      displayName: "排班管理员",
      role: "scheduler",
      enabled: true,
      staffId: null,
      managedStaffIds: ["staff-head", "staff-head"],
      password: "scheduler-password"
    })
    .expect(400, { message: "可管理人员不能重复" });
});

it("records managed staff summaries in account audit logs", async () => {
  const app = createTestApp();
  const headers = await adminHeaders(app);

  await request(app)
    .put("/api/users/user-scheduler")
    .set(headers)
    .send({
      username: "scheduler",
      displayName: "排班管理员",
      role: "scheduler",
      enabled: true,
      staffId: null,
      managedStaffIds: ["staff-head"],
      password: "scheduler-password"
    })
    .expect(200);

  const response = await request(app).get("/api/audit-logs").set(headers).expect(200);
  expect(response.body.rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        action: "user.save",
        summary: expect.stringContaining("可管理人员：段鸿露(000228)")
      })
    ])
  );
});
```

- [ ] **Step 2: Parse and validate managed staff IDs**

In `server/routes.ts`, update `parseUserPayload`:

```ts
const { username, displayName, role, enabled, password, staffId, managedStaffIds } = body;
```

Add parsing:

```ts
let parsedManagedStaffIds: string[];
if (managedStaffIds === undefined || managedStaffIds === null) {
  parsedManagedStaffIds = [];
} else if (isStringArray(managedStaffIds)) {
  parsedManagedStaffIds = managedStaffIds.map((id) => id.trim()).filter(Boolean);
} else {
  return null;
}
```

Return:

```ts
managedStaffIds: parsedManagedStaffIds
```

Add helper:

```ts
function validateManagedStaffIds(
  data: AppData,
  existingUser: AuthUser | undefined,
  payload: SaveAuthUserInput
): StaffMember[] {
  const ids = payload.role === "scheduler" ? payload.managedStaffIds ?? [] : [];
  if (new Set(ids).size !== ids.length) {
    throw new HttpResponseError(400, "可管理人员不能重复");
  }

  return ids.map((staffId) => {
    const staff = data.staff.find((item) => item.id === staffId);
    if (!staff) {
      throw new HttpResponseError(400, "可管理人员不存在");
    }

    const keepsOriginalManagedStaff = existingUser?.managedStaffIds.includes(staffId) ?? false;
    if (!staff.enabled && !keepsOriginalManagedStaff) {
      throw new HttpResponseError(400, "只能选择启用人员作为可管理人员");
    }

    return staff;
  });
}
```

Update the account save route:

```ts
const saveResult: { bindingStaff: StaffMember | null; managedStaff: StaffMember[]; user: AuthUser | null } = {
  bindingStaff: null,
  managedStaff: [],
  user: null
};
await storage.update(async (data) => {
  const users = await authStore.listUsers();
  const existingUser = users.find((user) => user.id === payload.id || user.username === payload.username);
  saveResult.bindingStaff = validateUserStaffBinding(data, users, payload);
  saveResult.managedStaff = validateManagedStaffIds(data, existingUser, payload);
  saveResult.user = await authStore.saveUser({
    ...payload,
    managedStaffIds: payload.role === "scheduler" ? payload.managedStaffIds : [],
    managedStaffUpdatedBy: request.authUser?.id ?? null
  });
  return data;
});
```

- [ ] **Step 3: Format audit summary**

In `server/routes.ts`, add:

```ts
function formatManagedStaffSummary(user: AuthUser, managedStaff: StaffMember[]): string {
  if (user.role === "admin") {
    return "可管理人员：全部人员";
  }

  if (user.role === "viewer") {
    return "可管理人员：只读账号不配置";
  }

  if (managedStaff.length === 0) {
    return "可管理人员：未配置";
  }

  return `可管理人员：${managedStaff.map(formatStaffBindingLabel).join("、")}`;
}
```

Update `formatUserSaveSummary` signature and body:

```ts
function formatUserSaveSummary(user: AuthUser, staff: StaffMember | null, managedStaff: StaffMember[]): string {
  const bindingText = user.staffId
    ? staff
      ? `绑定人员：${formatStaffBindingLabel(staff)}`
      : `绑定人员：${user.staffId}`
    : "未绑定人员";
  return `保存账号：${user.username}，${bindingText}，${formatManagedStaffSummary(user, managedStaff)}`;
}
```

Update the call:

```ts
await recordAudit(
  request,
  "user.save",
  "user",
  user.id,
  formatUserSaveSummary(user, saveResult.bindingStaff, saveResult.managedStaff)
);
```

- [ ] **Step 4: Update docs**

In `docs/功能跟进清单.md`, update `### 1.8 账号权限与审计基础` to include:

```md
- 支持排班管理员账号配置可管理人员名单；排班和月结写入按名单做后端权限校验。
- 支持所有登录账号查看全科排班，`viewer` 保持只读。
```

Update `### 2.6 细粒度账号权限` to say:

```md
当前已实现账号绑定人员和排班管理员可管理人员名单；个人只看自己排班、科室或小组模型仍未实现。
```

In `docs/正式部署运行手册.md`, replace the old sentence saying binding does not change permissions with:

```md
绑定人员用于标识账号本人；可管理人员名单用于限制 `scheduler` 对排班和月结的写入范围。所有登录账号可以查看全科排班；`viewer` 只能查看；`admin` 默认可管理全部人员。
```

Add account setup steps:

```md
配置排班管理员时，进入“系统配置 > 账号”，将角色设为“排班管理员”，然后在“可管理人员”中选择该账号可以维护的人员。新账号默认不管理任何人员，需要管理员显式选择。
```

- [ ] **Step 5: Run route tests and doc checks**

Run:

```bash
npm run test -- server/routes.test.ts deployment-docs.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes.ts server/routes.test.ts docs/功能跟进清单.md docs/正式部署运行手册.md
git commit -m "feat: validate managed staff account saves"
```

---

### Task 7: Full Verification

**Files:**
- All files touched by Tasks 1-6

- [ ] **Step 1: Run backend and frontend tests**

Run:

```bash
npm run test
```

Expected: all Vitest suites pass.

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: `vue-tsc`, `tsc`, and `vite build` all complete successfully.

- [ ] **Step 3: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 4: Manual browser verification**

Run:

```bash
./optools.sh dev start
```

Open the dev URL shown by the script and verify:

1. Log in as `admin`.
2. Open “系统配置 > 账号”.
3. Create a `scheduler` account with one managed staff member.
4. Log out and log in as that `scheduler`.
5. Confirm the full schedule is visible.
6. Confirm managed staff cells can be edited.
7. Confirm unmanaged staff cells do not open the editor and do not quick-fill.
8. Open “月结与奖金”; confirm settlement action is disabled unless the scheduler manages every settlement row.
9. Log back in as `admin` and confirm audit logs show account save and any permission-denied attempts.

Stop dev service:

```bash
./optools.sh dev stop
```

- [ ] **Step 5: Final status check**

Run:

```bash
git status --short --branch
```

Expected: branch contains only intentional commits and no unstaged changes.
