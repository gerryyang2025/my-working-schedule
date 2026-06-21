# Account Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe “删除账号” operation for unused or test login accounts, including UI button, API endpoint, session cleanup, binding cleanup, and audit retention.

**Architecture:** Extend the existing auth store contract with `deleteUser`, implement identical rules in memory and SQLite stores, expose `DELETE /api/users/:id`, then wire the management drawer and app API flow. Deletion is intentionally conservative: target accounts must be disabled, cannot be current/bootstrap accounts, and audit logs are retained.

**Tech Stack:** Vue 3, Element Plus, TypeScript, Express, Vitest, Supertest, better-sqlite3.

---

## File Structure

- `server/auth-store.ts`
  - Owns auth-store shared types and memory implementation.
  - Add `DeleteAuthUserInput`, `deleteUser`, and memory deletion rules.
- `server/sqlite/auth-store.ts`
  - Owns SQLite auth-store implementation.
  - Add transactional delete with `user_sessions`, `user_managed_staff`, `created_by`, and `users` updates.
- `server/auth.test.ts`
  - Covers memory delete behavior and safety rules.
- `server/sqlite-auth-store.test.ts`
  - Covers SQLite cleanup, foreign-key-safe deletion, and audit retention.
- `server/routes.ts`
  - Add `DELETE /api/users/:id`, audit summary, and bootstrap username rule.
- `server/routes.test.ts`
  - Covers HTTP delete success, error cases, and audit record.
- `src/api/client.ts`
  - Add `deleteUser(id)`.
- `src/components/ManagementDrawer.vue`
  - Add `deleteUser` emit and dangerous button in the account form.
- `src/components/ManagementDrawer.test.ts`
  - Covers button visibility and emitted event.
- `src/App.vue`
  - Add `handleDeleteUser`, refresh users and audit logs after delete.
- `src/App.test.ts`
  - Covers App wiring to the API and refresh behavior.
- `docs/功能跟进清单.md`
  - Record account deletion as completed after implementation.

---

### Task 1: Add AuthStore Delete Contract And Memory Behavior

**Files:**
- Modify: `server/auth-store.ts`
- Test: `server/auth.test.ts`

- [ ] **Step 1: Write failing memory-store tests**

Append these tests inside the existing `describe("memory auth store", () => {` block in `server/auth.test.ts`, before that block's final closing `});`:

```ts
  it("deletes disabled memory users and clears their sessions while keeping audit logs", async () => {
    const store = createMemoryAuthStore();
    await store.ensureBootstrapAdmin({ username: "admin", password: "admin-password" });
    const admin = await store.authenticate("admin", "admin-password");
    expect(admin).not.toBeNull();

    const viewer = await store.saveUser({
      id: "user-viewer",
      username: "viewer",
      displayName: "测试账号",
      role: "viewer",
      enabled: true,
      password: "viewer-password",
      staffId: "staff-nurse-001",
      managedStaffIds: ["staff-nurse-001"]
    });
    const session = await store.createSession(viewer.id);
    await store.recordAudit({
      action: "auth.login.success",
      actor: viewer,
      targetType: "user",
      targetId: viewer.id,
      summary: "用户 viewer 登录成功",
      ip: "127.0.0.1",
      userAgent: "vitest"
    });
    await store.saveUser({
      id: viewer.id,
      username: "viewer",
      displayName: "测试账号",
      role: "viewer",
      enabled: false,
      staffId: "staff-nurse-001",
      managedStaffIds: ["staff-nurse-001"]
    });

    const deleted = await store.deleteUser({
      userId: viewer.id,
      actorUserId: admin!.id,
      bootstrapUsername: "admin"
    });

    expect(deleted).toEqual(
      expect.objectContaining({
        id: viewer.id,
        username: "viewer",
        displayName: "测试账号",
        role: "viewer",
        enabled: false,
        staffId: "staff-nurse-001",
        managedStaffIds: ["staff-nurse-001"]
      })
    );
    await expect(store.getSession(session.token)).resolves.toBeNull();
    await expect(store.listUsers()).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: viewer.id })])
    );
    await expect(store.listAuditLogs({ username: "viewer", limit: 10 })).resolves.toEqual([
      expect.objectContaining({
        action: "auth.login.success",
        username: "viewer",
        targetId: viewer.id
      })
    ]);
  });

  it("protects current, bootstrap, enabled, missing, and last-admin memory users from deletion", async () => {
    const store = createMemoryAuthStore();
    await store.ensureBootstrapAdmin({ username: "admin", password: "admin-password" });
    const admin = await store.authenticate("admin", "admin-password");
    expect(admin).not.toBeNull();

    await expect(
      store.deleteUser({ userId: admin!.id, actorUserId: admin!.id, bootstrapUsername: "admin" })
    ).rejects.toThrow("不能删除当前登录账号");

    await expect(
      store.deleteUser({ userId: "missing-user", actorUserId: admin!.id, bootstrapUsername: "admin" })
    ).rejects.toThrow("账号不存在");

    const enabledViewer = await store.saveUser({
      id: "user-enabled-viewer",
      username: "enabled-viewer",
      displayName: "启用账号",
      role: "viewer",
      enabled: true,
      password: "viewer-password"
    });
    await expect(
      store.deleteUser({ userId: enabledViewer.id, actorUserId: admin!.id, bootstrapUsername: "admin" })
    ).rejects.toThrow("请先停用账号后再删除");

    const backupAdmin = await store.saveUser({
      id: "user-backup-admin",
      username: "backup-admin",
      displayName: "备用管理员",
      role: "admin",
      enabled: true,
      password: "backup-password"
    });
    await store.saveUser({
      id: backupAdmin.id,
      username: "backup-admin",
      displayName: "备用管理员",
      role: "admin",
      enabled: false
    });
    await expect(
      store.deleteUser({ userId: backupAdmin.id, actorUserId: admin!.id, bootstrapUsername: "admin" })
    ).resolves.toEqual(expect.objectContaining({ username: "backup-admin" }));

    const secondStore = createMemoryAuthStore();
    await secondStore.ensureBootstrapAdmin({ username: "root-admin", password: "admin-password" });
    const rootAdmin = await secondStore.authenticate("root-admin", "admin-password");
    expect(rootAdmin).not.toBeNull();
    const bootstrapAdmin = await secondStore.saveUser({
      id: "user-admin",
      username: "admin",
      displayName: "默认管理员",
      role: "admin",
      enabled: false,
      password: "admin-password"
    });
    await expect(
      secondStore.deleteUser({
        userId: bootstrapAdmin.id,
        actorUserId: rootAdmin!.id,
        bootstrapUsername: "admin"
      })
    ).rejects.toThrow("默认管理员账号不能删除");
  });
```

- [ ] **Step 2: Run memory-store tests and verify they fail**

Run:

```bash
npm run test -- server/auth.test.ts
```

Expected: FAIL with TypeScript errors because `deleteUser` is not defined on `AuthStore`.

- [ ] **Step 3: Add delete types to the auth-store contract**

In `server/auth-store.ts`, add this interface after `ChangePasswordInput`:

```ts
export interface DeleteAuthUserInput {
  userId: string;
  actorUserId: string;
  bootstrapUsername: string;
}
```

Then update `AuthStore`:

```ts
export interface AuthStore {
  ensureBootstrapAdmin(options: BootstrapAdminOptions): Promise<void>;
  listUsers(): Promise<AuthUser[]>;
  saveUser(input: SaveAuthUserInput): Promise<AuthUser>;
  deleteUser(input: DeleteAuthUserInput): Promise<AuthUser>;
  authenticate(username: string, password: string): Promise<AuthUser | null>;
  changePassword(input: ChangePasswordInput): Promise<boolean>;
  createSession(userId: string): Promise<AuthSession>;
  getSession(token: string): Promise<AuthSession | null>;
  revokeSession(token: string): Promise<void>;
  recordAudit(entry: AuditLogInput): Promise<void>;
  listAuditLogs(query?: number | AuditLogQuery): Promise<AuditLogEntry[]>;
}
```

- [ ] **Step 4: Add memory-store delete helpers**

In `createMemoryAuthStore()` in `server/auth-store.ts`, add these helpers near `assertCanSaveUser`:

```ts
  function countOtherEnabledAdmins(userId: string): number {
    return Array.from(users.values()).filter((user) => user.id !== userId && user.enabled && user.role === "admin").length;
  }

  function assertCanDeleteUser(input: DeleteAuthUserInput, user: StoredUser | null): StoredUser {
    if (!user) {
      throw new AuthStoreError(404, "账号不存在");
    }
    if (user.id === input.actorUserId) {
      throw new AuthStoreError(400, "不能删除当前登录账号");
    }
    if (user.username === input.bootstrapUsername.trim()) {
      throw new AuthStoreError(400, "默认管理员账号不能删除");
    }
    if (user.enabled) {
      throw new AuthStoreError(400, "请先停用账号后再删除");
    }
    if (user.role === "admin" && countOtherEnabledAdmins(user.id) === 0) {
      throw new AuthStoreError(400, "至少需要保留一个启用的系统管理员");
    }
    return user;
  }
```

- [ ] **Step 5: Implement memory-store deleteUser**

In the returned object from `createMemoryAuthStore()`, add `deleteUser` immediately after `saveUser`:

```ts
    async deleteUser(input) {
      const user = assertCanDeleteUser(input, getStoredUserById(input.userId));
      const deletedUser = toAuthUser(user);
      users.delete(user.id);
      for (const [tokenHash, session] of sessions.entries()) {
        if (session.userId === user.id) {
          sessions.delete(tokenHash);
        }
      }
      return deletedUser;
    },
```

- [ ] **Step 6: Run memory-store tests and verify they pass**

Run:

```bash
npm run test -- server/auth.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add server/auth-store.ts server/auth.test.ts
git commit -m "feat: add auth store account deletion"
```

---

### Task 2: Add SQLite Account Deletion

**Files:**
- Modify: `server/sqlite/auth-store.ts`
- Test: `server/sqlite-auth-store.test.ts`

- [ ] **Step 1: Write failing SQLite cleanup test**

Append this test in `server/sqlite-auth-store.test.ts` inside the main `describe` block:

```ts
  it("deletes disabled SQLite users while cleaning sessions and user staff relations", async () => {
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
    await store.ensureBootstrapAdmin({ username: "admin", password: "admin-password" });
    const admin = await store.authenticate("admin", "admin-password");
    expect(admin).not.toBeNull();

    const viewer = await store.saveUser({
      id: "user-viewer",
      username: "viewer",
      displayName: "测试账号",
      role: "viewer",
      enabled: true,
      staffId: "staff-nurse-001",
      managedStaffIds: ["staff-nurse-002"],
      managedStaffUpdatedBy: admin!.id,
      password: "viewer-password"
    });
    const session = await store.createSession(viewer.id);
    await store.recordAudit({
      action: "auth.login.success",
      actor: viewer,
      targetType: "user",
      targetId: viewer.id,
      summary: "用户 viewer 登录成功",
      ip: "127.0.0.1",
      userAgent: "vitest"
    });
    await store.saveUser({
      id: viewer.id,
      username: "viewer",
      displayName: "测试账号",
      role: "viewer",
      enabled: false,
      staffId: "staff-nurse-001",
      managedStaffIds: ["staff-nurse-002"],
      managedStaffUpdatedBy: admin!.id
    });

    const deleted = await store.deleteUser({
      userId: viewer.id,
      actorUserId: admin!.id,
      bootstrapUsername: "admin"
    });

    expect(deleted).toEqual(
      expect.objectContaining({
        id: viewer.id,
        username: "viewer",
        staffId: "staff-nurse-001",
        managedStaffIds: ["staff-nurse-002"],
        enabled: false
      })
    );
    await expect(store.getSession(session.token)).resolves.toBeNull();
    await expect(store.listUsers()).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: viewer.id })])
    );
    await expect(store.listAuditLogs({ username: "viewer", limit: 10 })).resolves.toEqual([
      expect.objectContaining({
        action: "auth.login.success",
        username: "viewer",
        targetId: viewer.id
      })
    ]);

    const checkDb = new Database(sqlitePath);
    try {
      expect(checkDb.prepare("select count(*) as count from user_sessions where user_id = ?").get(viewer.id)).toEqual({
        count: 0
      });
      expect(checkDb.prepare("select count(*) as count from user_managed_staff where user_id = ?").get(viewer.id)).toEqual({
        count: 0
      });
      expect(checkDb.prepare("pragma foreign_key_check").all()).toEqual([]);
    } finally {
      checkDb.close();
    }
  });
```

- [ ] **Step 2: Write failing SQLite `created_by` cleanup test**

Append this second test:

```ts
  it("clears SQLite managed-staff created_by references before deleting users", async () => {
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
    await store.ensureBootstrapAdmin({ username: "admin", password: "admin-password" });
    const admin = await store.authenticate("admin", "admin-password");
    expect(admin).not.toBeNull();

    const testAdmin = await store.saveUser({
      id: "user-test-admin",
      username: "test-admin",
      displayName: "测试管理员",
      role: "admin",
      enabled: true,
      password: "test-admin-password"
    });
    await store.saveUser({
      id: "user-scheduler",
      username: "scheduler",
      displayName: "排班管理员",
      role: "scheduler",
      enabled: true,
      managedStaffIds: ["staff-nurse-001"],
      managedStaffUpdatedBy: testAdmin.id,
      password: "scheduler-password"
    });
    await store.saveUser({
      id: testAdmin.id,
      username: "test-admin",
      displayName: "测试管理员",
      role: "admin",
      enabled: false
    });

    await expect(
      store.deleteUser({ userId: testAdmin.id, actorUserId: admin!.id, bootstrapUsername: "admin" })
    ).resolves.toEqual(expect.objectContaining({ username: "test-admin" }));

    const checkDb = new Database(sqlitePath);
    try {
      expect(
        checkDb.prepare("select created_by from user_managed_staff where user_id = ?").get("user-scheduler")
      ).toEqual({ created_by: null });
      expect(checkDb.prepare("pragma foreign_key_check").all()).toEqual([]);
    } finally {
      checkDb.close();
    }
  });
```

- [ ] **Step 3: Write failing SQLite safety-rule test**

Append this third test:

```ts
  it("protects current, bootstrap, enabled, missing, and last-admin SQLite users from deletion", async () => {
    const sqlitePath = await createTempDbPath();
    const store = createSqliteAuthStore(sqlitePath);
    await store.ensureBootstrapAdmin({ username: "admin", password: "admin-password" });
    const admin = await store.authenticate("admin", "admin-password");
    expect(admin).not.toBeNull();

    await expect(
      store.deleteUser({ userId: admin!.id, actorUserId: admin!.id, bootstrapUsername: "admin" })
    ).rejects.toThrow("不能删除当前登录账号");
    await expect(
      store.deleteUser({ userId: "missing-user", actorUserId: admin!.id, bootstrapUsername: "admin" })
    ).rejects.toThrow("账号不存在");

    const enabledViewer = await store.saveUser({
      id: "user-enabled-viewer",
      username: "enabled-viewer",
      displayName: "启用账号",
      role: "viewer",
      enabled: true,
      password: "viewer-password"
    });
    await expect(
      store.deleteUser({ userId: enabledViewer.id, actorUserId: admin!.id, bootstrapUsername: "admin" })
    ).rejects.toThrow("请先停用账号后再删除");

    const secondStore = createSqliteAuthStore(await createTempDbPath());
    await secondStore.ensureBootstrapAdmin({ username: "root-admin", password: "admin-password" });
    const rootAdmin = await secondStore.authenticate("root-admin", "admin-password");
    expect(rootAdmin).not.toBeNull();
    const bootstrapAdmin = await secondStore.saveUser({
      id: "user-admin",
      username: "admin",
      displayName: "默认管理员",
      role: "admin",
      enabled: false,
      password: "admin-password"
    });
    await expect(
      secondStore.deleteUser({
        userId: bootstrapAdmin.id,
        actorUserId: rootAdmin!.id,
        bootstrapUsername: "admin"
      })
    ).rejects.toThrow("默认管理员账号不能删除");
  });
```

- [ ] **Step 4: Run SQLite auth-store tests and verify they fail**

Run:

```bash
npm run test -- server/sqlite-auth-store.test.ts
```

Expected: FAIL because the object returned by `createSqliteAuthStore(sqlitePath)` does not implement `deleteUser`.

- [ ] **Step 5: Add SQLite delete helpers**

In `server/sqlite/auth-store.ts`, import the new type:

```ts
  type DeleteAuthUserInput,
```

Add this helper near `readEnabledUserById`:

```ts
  function countOtherEnabledAdmins(db: Database.Database, userId: string): number {
    const row = db
      .prepare("select count(*) as count from users where id <> ? and role = 'admin' and enabled = 1")
      .get(userId) as { count: number };
    return row.count;
  }

  function assertCanDeleteUser(
    db: Database.Database,
    input: DeleteAuthUserInput,
    user: (AuthUser & { passwordHash: string }) | null
  ): AuthUser & { passwordHash: string } {
    if (!user) {
      throw new AuthStoreError(404, "账号不存在");
    }
    if (user.id === input.actorUserId) {
      throw new AuthStoreError(400, "不能删除当前登录账号");
    }
    if (user.username === input.bootstrapUsername.trim()) {
      throw new AuthStoreError(400, "默认管理员账号不能删除");
    }
    if (user.enabled) {
      throw new AuthStoreError(400, "请先停用账号后再删除");
    }
    if (user.role === "admin" && countOtherEnabledAdmins(db, user.id) === 0) {
      throw new AuthStoreError(400, "至少需要保留一个启用的系统管理员");
    }
    return user;
  }
```

- [ ] **Step 6: Implement SQLite deleteUser**

In the returned object from `createSqliteAuthStore()`, add `deleteUser` immediately after `saveUser`:

```ts
    async deleteUser(input: DeleteAuthUserInput) {
      const db = openDatabase();
      try {
        const user = assertCanDeleteUser(db, input, readUserById(db, input.userId));
        const deletedUser = sanitizeUser(user);
        db.transaction(() => {
          db.prepare("delete from user_sessions where user_id = ?").run(user.id);
          db.prepare("delete from user_managed_staff where user_id = ?").run(user.id);
          db.prepare("update user_managed_staff set created_by = null where created_by = ?").run(user.id);
          db.prepare("delete from users where id = ?").run(user.id);
        })();
        return deletedUser;
      } finally {
        db.close();
      }
    },
```

- [ ] **Step 7: Run SQLite auth-store tests and verify they pass**

Run:

```bash
npm run test -- server/sqlite-auth-store.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add server/sqlite/auth-store.ts server/sqlite-auth-store.test.ts
git commit -m "feat: delete sqlite auth users safely"
```

---

### Task 3: Add DELETE /api/users/:id

**Files:**
- Modify: `server/routes.ts`
- Test: `server/routes.test.ts`

- [ ] **Step 1: Write failing route success test**

Append this test in `server/routes.test.ts` near the existing user-management tests:

```ts
  it("deletes disabled users, refreshes bindings, and records an audit log", async () => {
    const app = createTestApp();
    const headers = await adminHeaders(app);

    await request(app)
      .put("/api/users/user-delete-target")
      .set(headers)
      .send({
        username: "delete-target",
        displayName: "删除测试账号",
        role: "viewer",
        enabled: true,
        password: "delete-password"
      })
      .expect(200);
    await request(app)
      .put("/api/users/user-delete-target")
      .set(headers)
      .send({
        username: "delete-target",
        displayName: "删除测试账号",
        role: "viewer",
        enabled: false
      })
      .expect(200);

    await request(app).delete("/api/users/user-delete-target").set(headers).expect(200, { ok: true });

    const usersResponse = await request(app).get("/api/users").set(headers).expect(200);
    expect(usersResponse.body.rows).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "user-delete-target" })])
    );

    const auditResponse = await request(app)
      .get("/api/audit-logs")
      .query({ action: "user.delete", keyword: "delete-target", limit: "20" })
      .set(headers)
      .expect(200);
    expect(auditResponse.body.rows).toEqual([
      expect.objectContaining({
        username: "admin",
        action: "user.delete",
        targetType: "user",
        targetId: "user-delete-target",
        summary: "删除账号：delete-target，显示名：删除测试账号，角色：viewer"
      })
    ]);
  });
```

- [ ] **Step 2: Write failing route safety tests**

Append this test:

```ts
  it("rejects unsafe user deletion requests", async () => {
    const app = createTestApp();
    const headers = await adminHeaders(app);

    await request(app).delete("/api/users/missing-user").set(headers).expect(404, { message: "账号不存在" });

    await request(app)
      .put("/api/users/user-enabled-delete")
      .set(headers)
      .send({
        username: "enabled-delete",
        displayName: "启用账号",
        role: "viewer",
        enabled: true,
        password: "viewer-password"
      })
      .expect(200);
    await request(app)
      .delete("/api/users/user-enabled-delete")
      .set(headers)
      .expect(400, { message: "请先停用账号后再删除" });

    const loginResponse = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "123456" })
      .expect(200);
    await request(app)
      .delete(`/api/users/${loginResponse.body.user.id}`)
      .set({ Authorization: `Bearer ${loginResponse.body.token}` })
      .expect(400, { message: "不能删除当前登录账号" });

    await request(app)
      .put("/api/users/user-second-admin")
      .set(headers)
      .send({
        username: "second-admin",
        displayName: "第二管理员",
        role: "admin",
        enabled: true,
        password: "second-password"
      })
      .expect(200);
    const secondAdminLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: "second-admin", password: "second-password" })
      .expect(200);
    await request(app)
      .delete(`/api/users/${loginResponse.body.user.id}`)
      .set({ Authorization: `Bearer ${secondAdminLogin.body.token}` })
      .expect(400, { message: "默认管理员账号不能删除" });
  });
```

- [ ] **Step 3: Run route tests and verify they fail**

Run:

```bash
npm run test -- server/routes.test.ts
```

Expected: FAIL with 404 for `DELETE /api/users/:id`.

- [ ] **Step 4: Add route summary helper**

In `server/routes.ts`, add this helper after `formatUserSaveSummary`:

```ts
function formatUserDeleteSummary(user: AuthUser): string {
  return `删除账号：${user.username}，显示名：${user.displayName}，角色：${user.role}`;
}
```

- [ ] **Step 5: Add the delete route**

In `server/routes.ts`, add this route immediately after the existing `router.put("/users/:id", requireAdmin, async (request: AuthenticatedRequest, response, next) => {` route block:

```ts
  router.delete("/users/:id", requireAdmin, async (request: AuthenticatedRequest, response, next) => {
    try {
      const userId = getRouteParam(request, "id");
      const deletedUser = await authStore.deleteUser({
        userId,
        actorUserId: request.authUser.id,
        bootstrapUsername: bootstrapAdminUsername
      });
      await recordAudit(
        request,
        "user.delete",
        "user",
        deletedUser.id,
        formatUserDeleteSummary(deletedUser)
      );
      response.json({ ok: true });
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });
```

- [ ] **Step 6: Run route tests and verify they pass**

Run:

```bash
npm run test -- server/routes.test.ts
```

Expected: PASS. If sandbox blocks port binding with `listen EPERM`, rerun the same command with escalated execution.

- [ ] **Step 7: Commit Task 3**

```bash
git add server/routes.ts server/routes.test.ts
git commit -m "feat: add user deletion api"
```

---

### Task 4: Add Frontend API And Management Drawer Button

**Files:**
- Modify: `src/api/client.ts`
- Modify: `src/components/ManagementDrawer.vue`
- Test: `src/components/ManagementDrawer.test.ts`

- [ ] **Step 1: Write failing ManagementDrawer test**

Append this test in `src/components/ManagementDrawer.test.ts`:

```ts
it("emits deleteUser for existing account deletion", async () => {
  const wrapper = mountDrawer();

  await wrapper.get(".management-mobile-user").trigger("click");
  await wrapper.get('[data-testid="delete-user-button"]').trigger("click");

  expect(wrapper.emitted("deleteUser")).toEqual([["user-admin"]]);
});
```

Append this second test:

```ts
it("does not show delete user button for new account drafts", () => {
  const wrapper = mountDrawer();

  expect(wrapper.find('[data-testid="delete-user-button"]').exists()).toBe(false);
});
```

- [ ] **Step 2: Run ManagementDrawer tests and verify they fail**

Run:

```bash
npm run test -- src/components/ManagementDrawer.test.ts
```

Expected: FAIL because the component does not emit `deleteUser` and the button does not exist.

- [ ] **Step 3: Add client deleteUser function**

In `src/api/client.ts`, add this function after `saveUser`:

```ts
export function deleteUser(id: string): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(`/api/users/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}
```

- [ ] **Step 4: Add ManagementDrawer emit**

In `src/components/ManagementDrawer.vue`, update `defineEmits`:

```ts
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  saveStaff: [staff: StaffMember];
  deleteStaff: [staffId: string];
  saveShift: [shift: Shift];
  saveHoliday: [holiday: Holiday];
  deleteHoliday: [holidayId: string];
  saveUser: [user: SaveAuthUserInput];
  deleteUser: [userId: string];
  refreshAuditLogs: [query: AuditLogQuery];
}>();
```

- [ ] **Step 5: Add delete button to account actions**

In `src/components/ManagementDrawer.vue`, inside the account `management-actions` block after “保存账号”, add:

```vue
            <el-popconfirm
              title="确认删除该账号？仅建议删除误建或测试账号。删除后会清理登录会话、人员绑定和可管理人员关系，审计日志将保留。"
              @confirm="emit('deleteUser', userDraft.id)"
            >
              <template #reference>
                <el-button
                  v-if="isExistingUserDraft"
                  data-testid="delete-user-button"
                  type="danger"
                  :disabled="userSaving || !adminMode"
                >
                  删除账号
                </el-button>
              </template>
            </el-popconfirm>
```

- [ ] **Step 6: Run ManagementDrawer tests and verify they pass**

Run:

```bash
npm run test -- src/components/ManagementDrawer.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/api/client.ts src/components/ManagementDrawer.vue src/components/ManagementDrawer.test.ts
git commit -m "feat: add account delete button"
```

---

### Task 5: Wire Account Deletion In App

**Files:**
- Modify: `src/App.vue`
- Modify: `src/App.test.ts`

- [ ] **Step 1: Update App test API mock**

In `src/App.test.ts`, add `deleteUser` to the object returned from `vi.mock("@/api/client", () => ({`:

```ts
  deleteUser: vi.fn(),
```

Update `apiMocks` type inference automatically by reusing the existing mocked module object.

- [ ] **Step 2: Update ManagementDrawer test stub**

In `src/App.test.ts`, update `ManagementDrawerStub` emits:

```ts
  emits: ["saveStaff", "deleteStaff", "saveUser", "deleteUser", "refreshAuditLogs"],
```

Add this button inside the stub template near the existing save-user buttons:

```vue
      <button
        data-testid="drawer-delete-user"
        type="button"
        @click="$emit('deleteUser', 'user-scheduler')"
      >
        delete user
      </button>
```

- [ ] **Step 3: Write failing App wiring test**

Append this test near the existing user-save tests in `src/App.test.ts`:

```ts
  it("deletes users from the management drawer and refreshes users and audit logs", async () => {
    apiMocks.deleteUser.mockResolvedValue({ ok: true });
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="open-management"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="drawer-delete-user"]').trigger("click");
    await flushPromises();

    expect(apiMocks.deleteUser).toHaveBeenCalledWith("user-scheduler");
    expect(apiMocks.listUsers).toHaveBeenCalledTimes(2);
    expect(apiMocks.listAuditLogs).toHaveBeenCalledWith({ limit: 100 });
  });
```

- [ ] **Step 4: Run App tests and verify they fail**

Run:

```bash
npm run test -- src/App.test.ts
```

Expected: FAIL because `deleteUser` is not imported or handled in `App.vue`.

- [ ] **Step 5: Import deleteUser in App**

In `src/App.vue`, update the API import list to include:

```ts
  deleteUser,
```

- [ ] **Step 6: Add handleDeleteUser**

In `src/App.vue`, add this function after `handleSaveUser`:

```ts
async function handleDeleteUser(userId: string): Promise<void> {
  if (userSaving.value) {
    return;
  }

  userSaving.value = true;
  try {
    await deleteUser(userId);
    await refreshUsers();
    await refreshLatestAuditLogs();
    ElMessage.success("账号已删除");
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "账号删除失败");
  } finally {
    userSaving.value = false;
  }
}
```

- [ ] **Step 7: Wire ManagementDrawer event**

In the `ManagementDrawer` usage in `src/App.vue`, add:

```vue
      @delete-user="handleDeleteUser"
```

- [ ] **Step 8: Run App tests and verify they pass**

Run:

```bash
npm run test -- src/App.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 5**

```bash
git add src/App.vue src/App.test.ts
git commit -m "feat: wire account deletion in app"
```

---

### Task 6: Update Docs And Run Full Verification

**Files:**
- Modify: `docs/功能跟进清单.md`
- Optional Modify: `docs/SQLite常用命令.md`

- [ ] **Step 1: Update feature follow-up checklist**

In `docs/功能跟进清单.md`, add a completed item under the account/permission formalization section:

```md
- 支持在“系统配置 > 账号”删除误建或测试账号：仅管理员可操作，账号需先停用；删除时自动清理登录会话、人员绑定和可管理人员关系，审计日志保留并记录 `user.delete`。
```

If the document has a “最近完成” or date marker, update the date to `2026-06-21`.

- [ ] **Step 2: Optionally add SQLite inspection commands**

If `docs/SQLite常用命令.md` has an account section, add this text and commands:

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db \
"select id, username, display_name, role, staff_id, enabled from users order by username;"

sqlite3 /var/lib/my-working-schedule/schedule.db \
"select user_id, staff_id, created_at, created_by from user_managed_staff order by user_id, staff_id;"

sqlite3 /var/lib/my-working-schedule/schedule.db \
"select username, action, target_type, target_id, summary from audit_logs where action = 'user.delete' order by occurred_at desc limit 20;"
```

- [ ] **Step 3: Run focused verification**

Run:

```bash
npm run test -- server/auth.test.ts server/sqlite-auth-store.test.ts server/routes.test.ts src/components/ManagementDrawer.test.ts src/App.test.ts
```

Expected: PASS. If `server/routes.test.ts` fails in the sandbox with `listen EPERM`, rerun this exact command with escalated execution.

- [ ] **Step 4: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Run full test suite**

Run:

```bash
npm run test
```

Expected: PASS. If route tests fail only due to sandbox port binding, rerun with escalated execution and record that reason in the final response.

- [ ] **Step 6: Run production type/build verification**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add docs/功能跟进清单.md docs/SQLite常用命令.md
git commit -m "docs: document account deletion"
```

If `docs/SQLite常用命令.md` is unchanged, commit only `docs/功能跟进清单.md`.

---

## Manual Acceptance

After implementation is merged, verify in the browser:

1. Log in as `admin`.
2. Open `系统配置 > 账号`.
3. Create a test viewer account with password.
4. Save it as enabled.
5. Attempt to delete it while enabled.
6. Confirm the server rejects it with `请先停用账号后再删除`.
7. Disable the test account and save.
8. Select the disabled account and click `删除账号`.
9. Confirm the popconfirm.
10. Verify the account disappears from the account list.
11. Verify the account can no longer log in.
12. Open `审计`.
13. Verify `user.delete` appears with the deleted username.
14. Verify the deleted account’s historical audit rows remain visible when querying by username.
15. Verify default `admin` cannot be deleted.

## Notes For Implementation

- Do not delete `audit_logs`.
- Do not delete any `staff`, schedule, monthly settlement, shift, holiday, or app setting data.
- Keep the existing “停用账号” path as the recommended way to handle formal accounts that should no longer log in.
- Do not touch the existing unrelated worktree deletion marker for `docs/superpowers/specs/2026-06-21-staff-job-id-ordering-design.md`.
