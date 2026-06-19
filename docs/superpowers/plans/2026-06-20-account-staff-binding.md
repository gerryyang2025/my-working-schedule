# Account Staff Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional one-to-one binding between login accounts and staff records without changing existing role permissions.

**Architecture:** Store the binding on `users.staff_id` in SQLite, expose it through auth/user APIs, and maintain the binding from the existing “系统配置 > 账号” tab. Route-level validation checks whether the selected staff record exists and is enabled; the auth store and SQLite unique index enforce that one staff record cannot be bound to multiple accounts.

**Tech Stack:** TypeScript, Vue 3, Element Plus, Express, better-sqlite3, Vitest, Supertest.

---

## File Structure

- `server/auth.ts`: extend public auth user models with `staffId`.
- `server/auth-store.ts`: extend auth store input/output types and memory auth store behavior.
- `server/sqlite/schema.ts`: migrate SQLite schema from version 2 to version 3 and create `users.staff_id`.
- `server/sqlite/auth-store.ts`: persist and enforce unique `staff_id` in SQLite auth store.
- `server/routes.ts`: parse/validate account binding payloads and write binding-aware audit summaries.
- `src/api/client.ts`: extend frontend account types and save payloads with `staffId`.
- `src/components/ManagementDrawer.vue`: display and edit account-to-staff binding.
- `server/auth.test.ts`: verify memory store defaults and binding persistence.
- `server/sqlite-auth-store.test.ts`: verify schema migration, persistence, and duplicate binding errors.
- `server/routes.test.ts`: verify API validation, login/current-user response shape, audit summaries, and unchanged role permissions.
- `src/components/ManagementDrawer.test.ts`: verify account binding display and emitted save payloads.
- `docs/功能跟进清单.md`: update P0-B status after implementation.
- `docs/正式部署运行手册.md`: document how administrators bind accounts to staff records.
- `deployment-docs.test.ts`: guard the runbook text for account-staff binding operations.

## Task 1: Auth Types And Memory Store

**Files:**
- Modify: `server/auth.ts`
- Modify: `server/auth-store.ts`
- Modify: `server/auth.test.ts`

- [ ] **Step 1: Write failing memory auth store tests**

Add this assertion to the first `memory auth store` test after the authenticated admin assertion:

```ts
expect(authenticated).toEqual(
  expect.objectContaining({
    username: "admin",
    displayName: "系统管理员",
    role: "admin",
    enabled: true,
    staffId: null
  })
);
```

Replace the existing authenticated assertion if it already checks the same fields.

In `server/auth.test.ts`, add this test inside `describe("memory auth store", () => { ... })`:

```ts
it("stores optional staff bindings and prevents duplicate staff bindings", async () => {
  const store = createMemoryAuthStore();
  await store.ensureBootstrapAdmin({ username: "admin", password: "admin-password" });

  const viewer = await store.saveUser({
    id: "user-viewer",
    username: "viewer",
    displayName: "只读用户",
    role: "viewer",
    enabled: true,
    password: "viewer-password",
    staffId: "staff-nurse-001"
  });

  expect(viewer).toEqual(
    expect.objectContaining({
      id: "user-viewer",
      username: "viewer",
      staffId: "staff-nurse-001"
    })
  );
  await expect(store.authenticate("viewer", "viewer-password")).resolves.toEqual(
    expect.objectContaining({ username: "viewer", staffId: "staff-nurse-001" })
  );
  await expect(store.listUsers()).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ username: "admin", staffId: null }),
      expect.objectContaining({ username: "viewer", staffId: "staff-nurse-001" })
    ])
  );

  await expect(
    store.saveUser({
      id: "user-second-viewer",
      username: "viewer2",
      displayName: "只读用户2",
      role: "viewer",
      enabled: true,
      password: "viewer2-password",
      staffId: "staff-nurse-001"
    })
  ).rejects.toThrow("该人员已绑定其他账号");

  await expect(
    store.saveUser({
      id: "user-viewer",
      username: "viewer",
      displayName: "只读用户",
      role: "viewer",
      enabled: true,
      staffId: null
    })
  ).resolves.toEqual(expect.objectContaining({ username: "viewer", staffId: null }));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- server/auth.test.ts
```

Expected: FAIL because `staffId` is not present on auth users and duplicate staff binding is not checked.

- [ ] **Step 3: Extend auth types**

In `server/auth.ts`, add `staffId` to both user interfaces:

```ts
export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  staffId: string | null;
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
}
```

Update `toPublicAuthUser()`:

```ts
export function toPublicAuthUser(user: AuthUser): PublicAuthUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    staffId: user.staffId
  };
}
```

- [ ] **Step 4: Extend auth store input and memory store**

In `server/auth-store.ts`, update `SaveAuthUserInput`:

```ts
export interface SaveAuthUserInput {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  enabled: boolean;
  password?: string | null;
  staffId?: string | null;
}
```

Update `createUser()` so bootstrap admin users are unbound:

```ts
function createUser(username: string, password: string, role: UserRole): StoredUser {
  const timestamp = nowIso();
  return {
    id: randomUUID(),
    username,
    displayName: username === "admin" ? "系统管理员" : username,
    role,
    staffId: null,
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    passwordHash: hashPassword(password)
  };
}
```

Add this helper near `getStoredUserById()`:

```ts
function getUserByStaffId(staffId: string): StoredUser | null {
  for (const user of users.values()) {
    if (user.staffId === staffId) {
      return user;
    }
  }
  return null;
}
```

In `saveUser()`, normalize and validate `staffId` after duplicate username validation:

```ts
const staffId = input.staffId?.trim() || null;
if (staffId) {
  const duplicateStaffUser = getUserByStaffId(staffId);
  if (duplicateStaffUser && duplicateStaffUser.id !== existingUser?.id) {
    throw new AuthStoreError(400, "该人员已绑定其他账号");
  }
}
```

When updating an existing user, assign:

```ts
existingUser.staffId = staffId;
```

When creating a new user, include:

```ts
staffId,
```

- [ ] **Step 5: Run the memory auth tests**

Run:

```bash
npm run test -- server/auth.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add server/auth.ts server/auth-store.ts server/auth.test.ts
git commit -m "feat: add staff binding to auth models"
```

## Task 2: SQLite Schema And Auth Store Persistence

**Files:**
- Modify: `server/sqlite/schema.ts`
- Modify: `server/sqlite/auth-store.ts`
- Modify: `server/sqlite-auth-store.test.ts`

- [ ] **Step 1: Write failing SQLite schema and persistence tests**

In `server/sqlite-auth-store.test.ts`, add this helper near `createTempDbPath()`:

```ts
function createLegacyVersion2AuthSchema(db: Database.Database): void {
  db.exec(`
    create table schema_migrations (
      version integer primary key,
      applied_at text not null
    );

    create table users (
      id text primary key,
      username text not null unique,
      display_name text not null,
      role text not null check (role in ('admin', 'scheduler', 'viewer')),
      password_hash text not null,
      enabled integer not null check (enabled in (0, 1)),
      created_at text not null,
      updated_at text not null
    );

    insert into schema_migrations (version, applied_at)
    values (2, '2026-06-19T00:00:00.000Z');
  `);
}
```

Add this test inside `describe("SQLite auth store", () => { ... })`:

```ts
it("adds staff binding columns and indexes when migrating a version 2 auth schema", async () => {
  const sqlitePath = await createTempDbPath();
  const db = new Database(sqlitePath);

  try {
    createLegacyVersion2AuthSchema(db);
    initializeSqliteSchema(db);

    const userColumns = db.prepare("pragma table_info(users)").all() as Array<{ name: string }>;
    expect(userColumns.map((column) => column.name)).toContain("staff_id");

    const indexes = db.prepare("pragma index_list(users)").all() as Array<{ name: string; unique: number }>;
    expect(indexes).toEqual(expect.arrayContaining([expect.objectContaining({ name: "idx_users_staff_id_unique", unique: 1 })]));

    const migration = db.prepare("select version from schema_migrations where version = 3").get();
    expect(migration).toEqual(expect.objectContaining({ version: 3 }));
  } finally {
    db.close();
  }
});
```

Add this test:

```ts
it("persists staff bindings and rejects duplicate staff bindings", async () => {
  const sqlitePath = await createTempDbPath();
  const db = new Database(sqlitePath);
  try {
    initializeSqliteSchema(db);
    db.prepare(
      `
        insert into staff (id, job_id, name, type, is_admin, enabled, sort_order)
        values (?, ?, ?, ?, ?, ?, ?)
      `
    ).run("staff-nurse-001", "100001", "李护士", "nurse", 0, 1, 1);
  } finally {
    db.close();
  }

  const store = createSqliteAuthStore(sqlitePath);
  await store.ensureBootstrapAdmin({ username: "admin", password: "admin-password" });
  const viewer = await store.saveUser({
    id: "user-viewer",
    username: "viewer",
    displayName: "只读用户",
    role: "viewer",
    enabled: true,
    password: "viewer-password",
    staffId: "staff-nurse-001"
  });

  expect(viewer.staffId).toBe("staff-nurse-001");
  await expect(store.authenticate("viewer", "viewer-password")).resolves.toEqual(
    expect.objectContaining({ username: "viewer", staffId: "staff-nurse-001" })
  );
  await expect(
    store.saveUser({
      id: "user-second-viewer",
      username: "viewer2",
      displayName: "只读用户2",
      role: "viewer",
      enabled: true,
      password: "viewer2-password",
      staffId: "staff-nurse-001"
    })
  ).rejects.toThrow("该人员已绑定其他账号");
});
```

- [ ] **Step 2: Run the SQLite auth tests to verify they fail**

Run:

```bash
npm run test -- server/sqlite-auth-store.test.ts
```

Expected: FAIL because `users.staff_id`, version `3`, and duplicate binding behavior do not exist.

- [ ] **Step 3: Update SQLite schema migration**

In `server/sqlite/schema.ts`, change the schema version:

```ts
export const SQLITE_SCHEMA_VERSION = 3;
```

Update the `users` table definition inside `initializeSqliteSchema()`:

```sql
create table if not exists users (
  id text primary key,
  username text not null unique,
  display_name text not null,
  role text not null check (role in ('admin', 'scheduler', 'viewer')),
  staff_id text references staff(id),
  password_hash text not null,
  enabled integer not null check (enabled in (0, 1)),
  created_at text not null,
  updated_at text not null
);
```

Add these helpers above `initializeSqliteSchema()`:

```ts
function tableHasColumn(db: Database.Database, tableName: string, columnName: string): boolean {
  const rows = db.prepare(`pragma table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}

function ensureUsersStaffBindingSchema(db: Database.Database): void {
  if (!tableHasColumn(db, "users", "staff_id")) {
    db.prepare("alter table users add column staff_id text").run();
  }

  db.prepare(
    `
      create unique index if not exists idx_users_staff_id_unique
      on users(staff_id)
      where staff_id is not null
    `
  ).run();
}
```

Call the helper after the `db.exec(...)` block and before inserting `schema_migrations`:

```ts
ensureUsersStaffBindingSchema(db);
```

Do not change `listMissingCoreTables()` for this task. It tracks table presence, and the existing expected table list already includes `users`.

- [ ] **Step 4: Update SQLite auth store row mapping and SQL**

In `server/sqlite/auth-store.ts`, extend `UserRow`:

```ts
type UserRow = {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  staff_id: string | null;
  password_hash: string;
  enabled: number;
  created_at: string;
  updated_at: string;
};
```

Update `mapUser()`:

```ts
function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    staffId: row.staff_id,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
```

Replace each user select column list with:

```sql
select id, username, display_name, role, staff_id, password_hash, enabled, created_at, updated_at
```

Add this helper near `readUserById()`:

```ts
function readUserByStaffId(db: Database.Database, staffId: string): (AuthUser & { passwordHash: string }) | null {
  const row = db
    .prepare(
      `
        select id, username, display_name, role, staff_id, password_hash, enabled, created_at, updated_at
        from users
        where staff_id = ?
      `
    )
    .get(staffId) as UserRow | undefined;

  return row ? { ...mapUser(row), passwordHash: row.password_hash } : null;
}
```

In `saveUser()`, normalize and validate `staffId`:

```ts
const staffId = input.staffId?.trim() || null;
if (staffId) {
  const duplicateStaffUser = readUserByStaffId(db, staffId);
  if (duplicateStaffUser && duplicateStaffUser.id !== existingUser?.id) {
    throw new AuthStoreError(400, "该人员已绑定其他账号");
  }
}
```

Update the existing-user update SQL:

```sql
update users
set username = ?, display_name = ?, role = ?, staff_id = ?, password_hash = ?, enabled = ?, updated_at = ?
where id = ?
```

Run it with:

```ts
).run(username, displayName, input.role, staffId, passwordHash, input.enabled ? 1 : 0, timestamp, existingUser.id);
```

Update the returned object for existing users:

```ts
staffId,
```

Update the insert SQL:

```sql
insert into users (id, username, display_name, role, staff_id, password_hash, enabled, created_at, updated_at)
values (?, ?, ?, ?, ?, ?, ?, ?, ?)
```

Run it with:

```ts
input.id,
username,
displayName,
input.role,
staffId,
hashPassword(input.password),
input.enabled ? 1 : 0,
timestamp,
timestamp
```

Include `staffId` in the returned new user.

Update `ensureBootstrapAdmin()` so existing and new bootstrap admin rows keep `staff_id` as `null`:

```sql
update users
set display_name = ?, role = ?, staff_id = null, password_hash = ?, enabled = 1, updated_at = ?
where username = ?
```

and:

```sql
insert into users (id, username, display_name, role, staff_id, password_hash, enabled, created_at, updated_at)
values (?, ?, ?, ?, null, ?, ?, ?, ?)
```

- [ ] **Step 5: Run SQLite auth tests**

Run:

```bash
npm run test -- server/sqlite-auth-store.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run auth tests together**

Run:

```bash
npm run test -- server/auth.test.ts server/sqlite-auth-store.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

Run:

```bash
git add server/sqlite/schema.ts server/sqlite/auth-store.ts server/sqlite-auth-store.test.ts
git commit -m "feat: persist account staff bindings in sqlite"
```

## Task 3: API Validation And Audit Summaries

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/routes.test.ts`

- [ ] **Step 1: Write failing API tests for account binding**

In `server/routes.test.ts`, add this test near the existing account management tests:

```ts
it("lets admins bind accounts to enabled staff records and returns the binding in auth responses", async () => {
  const app = createTestApp();
  const headers = await adminHeaders(app);

  await request(app)
    .put("/api/users/user-viewer")
    .set(headers)
    .send({
      username: "viewer",
      displayName: "只读用户",
      role: "viewer",
      enabled: true,
      password: "viewer-password",
      staffId: "staff-nurse-001"
    })
    .expect(200);

  const usersResponse = await request(app).get("/api/users").set(headers).expect(200);
  expect(usersResponse.body.rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ username: "viewer", role: "viewer", staffId: "staff-nurse-001" })
    ])
  );

  const loginResponse = await request(app)
    .post("/api/auth/login")
    .send({ username: "viewer", password: "viewer-password" })
    .expect(200);
  expect(loginResponse.body.user).toEqual(
    expect.objectContaining({ username: "viewer", role: "viewer", staffId: "staff-nurse-001" })
  );

  const meResponse = await request(app)
    .get("/api/auth/me")
    .set({ Authorization: `Bearer ${loginResponse.body.token}` })
    .expect(200);
  expect(meResponse.body.user).toEqual(expect.objectContaining({ username: "viewer", staffId: "staff-nurse-001" }));

  const auditResponse = await request(app)
    .get("/api/audit-logs")
    .query({ action: "user.save", keyword: "李护士", limit: "20" })
    .set(headers)
    .expect(200);
  expect(auditResponse.body.rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        action: "user.save",
        summary: "保存账号：viewer，绑定人员：李护士(100001)"
      })
    ])
  );
});
```

Add this test:

```ts
it("rejects account bindings to missing, disabled, or already-bound staff records", async () => {
  const data = createSeedData();
  data.staff = data.staff.map((staff) => (staff.id === "staff-clerk-001" ? { ...staff, enabled: false } : staff));
  const app = createTestApp(data);
  const headers = await adminHeaders(app);

  await request(app)
    .put("/api/users/user-viewer")
    .set(headers)
    .send({
      username: "viewer",
      displayName: "只读用户",
      role: "viewer",
      enabled: true,
      password: "viewer-password",
      staffId: "missing-staff"
    })
    .expect(400, { message: "绑定人员不存在" });

  await request(app)
    .put("/api/users/user-viewer")
    .set(headers)
    .send({
      username: "viewer",
      displayName: "只读用户",
      role: "viewer",
      enabled: true,
      password: "viewer-password",
      staffId: "staff-clerk-001"
    })
    .expect(400, { message: "只能绑定启用人员" });

  await request(app)
    .put("/api/users/user-viewer")
    .set(headers)
    .send({
      username: "viewer",
      displayName: "只读用户",
      role: "viewer",
      enabled: true,
      password: "viewer-password",
      staffId: "staff-nurse-001"
    })
    .expect(200);

  await request(app)
    .put("/api/users/user-second-viewer")
    .set(headers)
    .send({
      username: "viewer2",
      displayName: "只读用户2",
      role: "viewer",
      enabled: true,
      password: "viewer2-password",
      staffId: "staff-nurse-001"
    })
    .expect(400, { message: "该人员已绑定其他账号" });
});
```

Add this test:

```ts
it("allows an account to keep its original staff binding after that staff record is disabled", async () => {
  const app = createTestApp();
  const headers = await adminHeaders(app);

  await request(app)
    .put("/api/users/user-viewer")
    .set(headers)
    .send({
      username: "viewer",
      displayName: "只读用户",
      role: "viewer",
      enabled: true,
      password: "viewer-password",
      staffId: "staff-nurse-001"
    })
    .expect(200);

  await request(app)
    .put("/api/data/staff/staff-nurse-001")
    .set(headers)
    .send(createStaffPayload({ jobId: "100001", name: "李护士", enabled: false }))
    .expect(200);

  await request(app)
    .put("/api/users/user-viewer")
    .set(headers)
    .send({
      username: "viewer",
      displayName: "只读用户",
      role: "viewer",
      enabled: true,
      staffId: "staff-nurse-001"
    })
    .expect(200);
});
```

- [ ] **Step 2: Run API tests to verify they fail**

Run:

```bash
npm run test -- server/routes.test.ts -t "bind accounts|account bindings|original staff binding"
```

Expected: FAIL because route payload parsing ignores `staffId` and validation/audit summaries do not exist.

- [ ] **Step 3: Parse `staffId` in user payloads**

In `server/routes.ts`, update `parseUserPayload()`:

```ts
const { username, displayName, role, enabled, password, staffId } = body;
```

Before returning, normalize `staffId`:

```ts
let parsedStaffId: string | null;
if (staffId === undefined || staffId === null || staffId === "") {
  parsedStaffId = null;
} else if (isString(staffId) && staffId.trim().length > 0) {
  parsedStaffId = staffId.trim();
} else {
  return null;
}
```

Return it:

```ts
return {
  id,
  username: username.trim(),
  displayName: displayName.trim(),
  role,
  enabled,
  password: parsedPassword,
  staffId: parsedStaffId
};
```

Update `toManagedAuthUser()`:

```ts
function toManagedAuthUser(user: AuthUser) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    staffId: user.staffId,
    enabled: user.enabled,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}
```

- [ ] **Step 4: Add route-level staff binding validation and audit summary**

Add these helpers near `parseUserPayload()`:

```ts
function formatStaffBindingLabel(staff: StaffMember): string {
  const disabledSuffix = staff.enabled ? "" : "，已停用";
  return `${staff.name}(${staff.jobId}${disabledSuffix})`;
}

function formatUserSaveSummary(user: AuthUser, staff: StaffMember | null): string {
  if (!user.staffId) {
    return `保存账号：${user.username}，未绑定人员`;
  }

  return staff ? `保存账号：${user.username}，绑定人员：${formatStaffBindingLabel(staff)}` : `保存账号：${user.username}，绑定人员：${user.staffId}`;
}

async function validateUserStaffBinding(storage: StorageAdapter, authStore: AuthStore, payload: SaveAuthUserInput): Promise<StaffMember | null> {
  if (!payload.staffId) {
    return null;
  }

  const [data, users] = await Promise.all([storage.load(), authStore.listUsers()]);
  const staff = data.staff.find((item) => item.id === payload.staffId);
  if (!staff) {
    throw new HttpResponseError(400, "绑定人员不存在");
  }

  const existingUser = users.find((user) => user.id === payload.id || user.username === payload.username);
  const keepsOriginalBinding = existingUser?.staffId === payload.staffId;
  if (!staff.enabled && !keepsOriginalBinding) {
    throw new HttpResponseError(400, "只能绑定启用人员");
  }

  return staff;
}
```

Update the `/users/:id` route:

```ts
const bindingStaff = await validateUserStaffBinding(storage, authStore, payload);
const user = await authStore.saveUser(payload);
await recordAudit(request, "user.save", "user", user.id, formatUserSaveSummary(user, bindingStaff));
response.json({ user: toManagedAuthUser(user) });
```

Keep the `AuthStoreError` handling path unchanged so duplicate staff binding errors from the auth store return `400`.

- [ ] **Step 5: Run focused API tests**

Run:

```bash
npm run test -- server/routes.test.ts -t "bind accounts|account bindings|original staff binding"
```

Expected: PASS.

- [ ] **Step 6: Run all route tests**

Run:

```bash
npm run test -- server/routes.test.ts
```

Expected: PASS. If the local sandbox blocks test server sockets with `listen EPERM`, rerun with approved escalation for `npm run test`.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add server/routes.ts server/routes.test.ts
git commit -m "feat: validate account staff bindings"
```

## Task 4: Frontend Account Binding UI

**Files:**
- Modify: `src/api/client.ts`
- Modify: `src/components/ManagementDrawer.vue`
- Modify: `src/components/ManagementDrawer.test.ts`

- [ ] **Step 1: Write failing ManagementDrawer tests**

In `src/components/ManagementDrawer.test.ts`, update `ElSelectStub` so test code can target select controls:

```ts
const ElSelectStub = defineComponent({
  name: "ElSelect",
  props: ["modelValue", "placeholder", "disabled"],
  emits: ["update:modelValue"],
  template: '<select :data-placeholder="placeholder" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>'
});
```

Update `ElOptionStub` so native select values are testable:

```ts
const ElOptionStub = defineComponent({
  name: "ElOption",
  props: ["label", "value"],
  template: '<option :value="value">{{ label }}</option>'
});
```

Update the `data.staff` fixture to include one disabled staff member:

```ts
{
  id: "staff-disabled",
  jobId: "100002",
  name: "停用护士",
  type: "nurse",
  isAdmin: false,
  enabled: false,
  sortOrder: 2
}
```

Update the `users` fixture:

```ts
{
  id: "user-admin",
  username: "admin",
  displayName: "系统管理员",
  role: "admin",
  staffId: null,
  enabled: true,
  createdAt: "2026-06-19T00:00:00.000Z",
  updatedAt: "2026-06-19T00:00:00.000Z"
},
{
  id: "user-scheduler",
  username: "scheduler",
  displayName: "排班管理员",
  role: "scheduler",
  staffId: "staff-head",
  enabled: true,
  createdAt: "2026-06-19T00:00:00.000Z",
  updatedAt: "2026-06-19T00:00:00.000Z"
},
{
  id: "user-disabled-staff",
  username: "disabled-staff",
  displayName: "停用绑定账号",
  role: "viewer",
  staffId: "staff-disabled",
  enabled: true,
  createdAt: "2026-06-19T00:00:00.000Z",
  updatedAt: "2026-06-19T00:00:00.000Z"
}
```

Add this test:

```ts
it("shows account staff bindings and emits selected staff ids", async () => {
  const wrapper = mountDrawer();

  expect(wrapper.text()).toContain("段鸿露 / 000228");
  expect(wrapper.text()).toContain("未绑定");
  expect(wrapper.text()).toContain("停用护士 / 100002（已停用）");

  await wrapper
    .findAll(".management-mobile-user")
    .find((item) => item.text().includes("系统管理员"))!
    .trigger("click");

  const bindingSelect = wrapper.get('select[data-placeholder="绑定人员"]');
  await bindingSelect.setValue("staff-head");
  await wrapper.get('[data-testid="save-user-button"]').trigger("click");

  expect(wrapper.emitted("saveUser")).toEqual([
    [
      expect.objectContaining({
        username: "admin",
        displayName: "系统管理员",
        role: "admin",
        enabled: true,
        staffId: "staff-head"
      })
    ]
  ]);
});
```

- [ ] **Step 2: Run the component test to verify it fails**

Run:

```bash
npm run test -- src/components/ManagementDrawer.test.ts
```

Expected: FAIL because the account UI does not render or emit `staffId`.

- [ ] **Step 3: Extend frontend API types**

In `src/api/client.ts`, add `staffId`:

```ts
export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  staffId: string | null;
}

export interface SaveAuthUserInput {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  enabled: boolean;
  staffId?: string | null;
  password?: string;
}
```

- [ ] **Step 4: Add account binding helpers in ManagementDrawer**

In `src/components/ManagementDrawer.vue`, update `userDraft`:

```ts
const userDraft = reactive<SaveAuthUserInput>({
  id: "",
  username: "",
  displayName: "",
  role: "viewer",
  enabled: true,
  staffId: null,
  password: ""
});
```

Add these computed helpers after `isExistingUserDraft`:

```ts
const staffById = computed(() => new Map(props.data.staff.map((staff) => [staff.id, staff])));

const bindableStaff = computed(() =>
  props.data.staff.filter((staff) => staff.enabled || staff.id === userDraft.staffId)
);

function staffBindingLabel(staffId: string | null | undefined): string {
  if (!staffId) {
    return "未绑定";
  }

  const staff = staffById.value.get(staffId);
  if (!staff) {
    return `未知人员 / ${staffId}`;
  }

  return `${staff.name} / ${staff.jobId}${staff.enabled ? "" : "（已停用）"}`;
}
```

Update `resetUserDraft()`:

```ts
function resetUserDraft(): void {
  Object.assign(userDraft, {
    id: `user-${Date.now()}`,
    username: "",
    displayName: "",
    role: "viewer",
    enabled: true,
    staffId: null,
    password: ""
  });
}
```

Update `loadUserDraft()`:

```ts
staffId: user.staffId,
```

Update `emitSaveUser()`:

```ts
const payload: SaveAuthUserInput = {
  id: userDraft.id,
  username: userDraft.username,
  displayName: userDraft.displayName,
  role: userDraft.role,
  enabled: userDraft.enabled,
  staffId: userDraft.staffId || null
};
```

- [ ] **Step 5: Render binding in the account tab**

In the account table, add a binding column after display name:

```vue
<el-table-column label="绑定人员" width="150">
  <template #default="{ row }">
    {{ staffBindingLabel(row.staffId) }}
  </template>
</el-table-column>
```

In the mobile user item meta, add:

```vue
<span>{{ staffBindingLabel(user.staffId) }}</span>
```

In the user form after display name, add:

```vue
<el-select v-model="userDraft.staffId" placeholder="绑定人员" clearable :disabled="userSaving">
  <el-option label="未绑定" :value="null" />
  <el-option
    v-for="staff in bindableStaff"
    :key="staff.id"
    :label="`${staff.name} / ${staff.jobId} / ${staffTypeLabel(staff.type)}${staff.enabled ? '' : '（已停用）'}`"
    :value="staff.id"
  />
</el-select>
<p class="management-help-text">当前仅建立身份绑定，不会改变账号权限。</p>
```

Keep the explicit “未绑定” option so clearing can be represented as `null` or an empty string and normalized in `emitSaveUser()`.

- [ ] **Step 6: Add helper text styling**

Add this rule to the component style block or existing stylesheet section that owns management drawer styles:

```css
.management-help-text {
  margin: -4px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
}
```

- [ ] **Step 7: Run component tests**

Run:

```bash
npm run test -- src/components/ManagementDrawer.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

Run:

```bash
git add src/api/client.ts src/components/ManagementDrawer.vue src/components/ManagementDrawer.test.ts
git commit -m "feat: manage account staff bindings"
```

## Task 5: Documentation And Regression Verification

**Files:**
- Modify: `docs/功能跟进清单.md`
- Modify: `docs/正式部署运行手册.md`
- Modify: `deployment-docs.test.ts`

- [ ] **Step 1: Write failing documentation test**

In `deployment-docs.test.ts`, add these expectations to the deployment runbook test:

```ts
expect(runbook).toContain("账号与人员档案绑定");
expect(runbook).toContain("系统配置 > 账号");
expect(runbook).toContain("绑定人员");
expect(runbook).toContain("本阶段不会改变账号角色权限");
```

- [ ] **Step 2: Run documentation test to verify it fails**

Run:

```bash
npm run test -- deployment-docs.test.ts
```

Expected: FAIL because the runbook does not yet document account-staff binding.

- [ ] **Step 3: Update feature tracking docs**

In `docs/功能跟进清单.md`, under `### 1.8 账号权限与审计基础`, add:

```md
- 支持账号与人员档案一对一可选绑定，绑定入口位于“系统配置 > 账号”；本阶段绑定关系不改变现有 `admin`、`scheduler`、`viewer` 权限范围。
```

Under `### 2.6 细粒度账号权限`, replace the sentence saying accounts are not bound to staff with:

```md
当前已具备账号与人员档案的一对一可选绑定，为后续个人排班可见性和护士长辖区权限提供基础；尚未实现按本人或辖区限制可见数据。
```

Under `### 3.1 P0：正式化基础能力`, remove `账号与人员档案绑定` from the remaining P0 list and leave finer-grained role/scope work as pending.

- [ ] **Step 4: Update deployment runbook account maintenance section**

In `docs/正式部署运行手册.md`, under `## 账号维护`, add after the account creation steps:

```md
### 账号与人员档案绑定

管理员可以在“系统配置 > 账号”中为账号选择“绑定人员”。绑定规则如下：

- 一个账号最多绑定一个人员档案。
- 一个人员最多被一个账号绑定。
- 默认 `admin` 等系统账号可以保持未绑定。
- 新绑定时只能选择启用人员。
- 如果人员后续被停用，原绑定关系保留，并在账号页面显示“已停用”。
- 本阶段不会改变账号角色权限，`admin`、`scheduler`、`viewer` 的可见范围和可操作范围保持不变。

绑定完成后，新登录会话和 `/api/auth/me` 会返回当前账号的 `staffId`，供后续个人排班可见性和护士长辖区权限使用。
```

- [ ] **Step 5: Run documentation test**

Run:

```bash
npm run test -- deployment-docs.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run focused regression tests**

Run:

```bash
npm run test -- server/auth.test.ts server/sqlite-auth-store.test.ts server/routes.test.ts src/components/ManagementDrawer.test.ts deployment-docs.test.ts
```

Expected: PASS. If the local sandbox blocks route tests with `listen EPERM`, rerun with approved escalation for `npm run test`.

- [ ] **Step 7: Run build and full test suite**

Run:

```bash
npm run build
npm run test
git diff --check
```

Expected:

- `npm run build`: exits `0`.
- `npm run test`: all test files pass.
- `git diff --check`: no whitespace errors.

- [ ] **Step 8: Commit Task 5**

Run:

```bash
git add docs/功能跟进清单.md docs/正式部署运行手册.md deployment-docs.test.ts
git commit -m "docs: document account staff binding"
```

## Implementation Notes

- Do not change role permissions in this phase. Existing tests that prove `viewer` is read-only and `scheduler` can edit schedules/monthly settlement must keep passing.
- Do not add organization, department, ward, or head nurse scope tables in this phase.
- Do not delete JSON storage in this phase. The design records it as a later cleanup item.
- Use route-level validation for staff existence and enabled-state rules because routes already have access to scheduling data through `StorageAdapter`.
- Use auth-store-level validation for duplicate `staffId` because uniqueness belongs to account persistence and must work consistently for memory and SQLite stores.
- Use SQLite unique index as the durable production guard against duplicate staff bindings.

## Final Verification Checklist

- [ ] Existing accounts migrate with `staffId: null`.
- [ ] Bootstrap `admin` remains unbound.
- [ ] Admin can bind an account to an enabled staff member.
- [ ] Admin can clear a binding.
- [ ] Admin cannot bind missing staff.
- [ ] Admin cannot newly bind disabled staff.
- [ ] Admin cannot bind a staff member already bound to another account.
- [ ] Account can keep its original binding when that staff member is later disabled.
- [ ] Login and `/api/auth/me` return `staffId`.
- [ ] `/api/users` returns `staffId` and never returns password hashes.
- [ ] Account tab displays bound staff on desktop and mobile.
- [ ] This phase does not restrict schedule visibility by current user.
