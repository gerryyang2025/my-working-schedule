import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteAuthStore } from "./sqlite/auth-store";
import { initializeSqliteSchema, listMissingCoreTables, SQLITE_SCHEMA_VERSION } from "./sqlite/schema";

const tempDirs: string[] = [];

async function createTempDbPath() {
  const dir = await mkdtemp(join(tmpdir(), "schedule-sqlite-auth-"));
  tempDirs.push(dir);
  return join(dir, "schedule.db");
}

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

function createVersion3AuthSchemaWithStaffIdWithoutForeignKey(db: Database.Database): void {
  db.exec(`
    create table schema_migrations (
      version integer primary key,
      applied_at text not null
    );

    create table staff (
      id text primary key,
      job_id text not null unique,
      name text not null,
      type text not null check (type in ('nurse', 'clerk', 'head_nurse')),
      is_admin integer not null check (is_admin in (0, 1)),
      enabled integer not null check (enabled in (0, 1)),
      sort_order integer not null
    );

    create table users (
      id text primary key,
      username text not null unique,
      display_name text not null,
      role text not null check (role in ('admin', 'scheduler', 'viewer')),
      staff_id text,
      password_hash text not null,
      enabled integer not null check (enabled in (0, 1)),
      created_at text not null,
      updated_at text not null
    );

    create unique index idx_users_staff_id_unique
    on users(staff_id)
    where staff_id is not null;

    create table user_sessions (
      id text primary key,
      user_id text not null references users(id),
      token_hash text not null unique,
      created_at text not null,
      expires_at text not null,
      revoked_at text
    );

    insert into schema_migrations (version, applied_at)
    values (3, '2026-06-19T00:00:00.000Z');

    insert into staff (id, job_id, name, type, is_admin, enabled, sort_order)
    values ('staff-nurse-003', '100003', '赵护士', 'nurse', 0, 1, 1);

    insert into users (id, username, display_name, role, staff_id, password_hash, enabled, created_at, updated_at)
    values (
      'user-viewer',
      'viewer',
      '只读用户',
      'viewer',
      'staff-nurse-003',
      'hash',
      1,
      '2026-06-19T00:00:00.000Z',
      '2026-06-19T00:00:00.000Z'
    );

    insert into users (id, username, display_name, role, staff_id, password_hash, enabled, created_at, updated_at)
    values (
      'user-dangling-viewer',
      'dangling-viewer',
      '悬空绑定用户',
      'viewer',
      'missing-staff',
      'hash',
      1,
      '2026-06-19T00:00:00.000Z',
      '2026-06-19T00:00:00.000Z'
    );

    insert into user_sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
    values (
      'session-viewer',
      'user-viewer',
      'session-hash',
      '2026-06-19T00:00:00.000Z',
      '2026-06-20T00:00:00.000Z',
      null
    );
  `);
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("SQLite auth store", () => {
  it("adds staff binding columns and indexes when migrating a version 2 auth schema", async () => {
    const sqlitePath = await createTempDbPath();
    const db = new Database(sqlitePath);

    try {
      createLegacyVersion2AuthSchema(db);
      initializeSqliteSchema(db);

      const userColumns = db.prepare("pragma table_info(users)").all() as Array<{ name: string }>;
      expect(userColumns.map((column) => column.name)).toContain("staff_id");

      const indexes = db.prepare("pragma index_list(users)").all() as Array<{ name: string; unique: number }>;
      expect(indexes).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "idx_users_staff_id_unique", unique: 1 })])
      );

      const foreignKeys = db.prepare("pragma foreign_key_list(users)").all() as Array<{
        table: string;
        from: string;
        to: string;
      }>;
      expect(foreignKeys).toEqual(
        expect.arrayContaining([expect.objectContaining({ table: "staff", from: "staff_id", to: "id" })])
      );

      const migration = db.prepare("select version from schema_migrations where version = ?").get(SQLITE_SCHEMA_VERSION);
      expect(migration).toEqual(expect.objectContaining({ version: SQLITE_SCHEMA_VERSION }));
    } finally {
      db.close();
    }
  });

  it("repairs existing staff binding columns that are missing the foreign key", async () => {
    const sqlitePath = await createTempDbPath();
    const db = new Database(sqlitePath);

    try {
      createVersion3AuthSchemaWithStaffIdWithoutForeignKey(db);
      initializeSqliteSchema(db);

      const foreignKeys = db.prepare("pragma foreign_key_list(users)").all() as Array<{
        table: string;
        from: string;
        to: string;
      }>;
      expect(foreignKeys).toEqual(
        expect.arrayContaining([expect.objectContaining({ table: "staff", from: "staff_id", to: "id" })])
      );

      expect(db.prepare("select staff_id from users where id = ?").get("user-viewer")).toEqual({
        staff_id: "staff-nurse-003"
      });
      expect(db.prepare("select staff_id from users where id = ?").get("user-dangling-viewer")).toEqual({
        staff_id: null
      });
      expect(db.prepare("select user_id from user_sessions where id = ?").get("session-viewer")).toEqual({
        user_id: "user-viewer"
      });
      expect(db.prepare("pragma foreign_key_check").all()).toEqual([]);
      expect(() =>
        db
          .prepare(
            `
              insert into users (id, username, display_name, role, staff_id, password_hash, enabled, created_at, updated_at)
              values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
          )
          .run(
            "user-invalid-staff",
            "invalid-staff",
            "无效人员",
            "viewer",
            "missing-staff",
            "hash",
            1,
            "2026-06-19T00:00:00.000Z",
            "2026-06-19T00:00:00.000Z"
          )
      ).toThrow("FOREIGN KEY constraint failed");
    } finally {
      db.close();
    }
  });

  it("initializes auth and audit tables as core SQLite tables", async () => {
    const sqlitePath = await createTempDbPath();
    const db = new Database(sqlitePath);

    try {
      initializeSqliteSchema(db);
      expect(listMissingCoreTables(db)).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("adds managed staff relation table when initializing schema", async () => {
    const sqlitePath = await createTempDbPath();
    const db = new Database(sqlitePath);

    try {
      initializeSqliteSchema(db);

      const tables = db.prepare("select name from sqlite_master where type = 'table'").all() as Array<{ name: string }>;
      expect(tables.map((row) => row.name)).toContain("user_managed_staff");

      const indexes = db.prepare("pragma index_list(user_managed_staff)").all() as Array<{ name: string; unique: number }>;
      expect(indexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "sqlite_autoindex_user_managed_staff_1" }),
          expect.objectContaining({ name: "idx_user_managed_staff_staff_id" })
        ])
      );

      const migration = db.prepare("select version from schema_migrations where version = ?").get(SQLITE_SCHEMA_VERSION);
      expect(migration).toEqual(expect.objectContaining({ version: SQLITE_SCHEMA_VERSION }));
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
    const admin = await store.authenticate("admin", "123456");
    expect(admin).not.toBeNull();
    await store.saveUser({
      id: "user-scheduler",
      username: "scheduler",
      displayName: "排班管理员",
      role: "scheduler",
      enabled: true,
      staffId: null,
      managedStaffIds: ["staff-nurse-002", "staff-nurse-001"],
      managedStaffUpdatedBy: ` ${admin!.id} `,
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

  it("rejects non-existing managed staff updater ids", async () => {
    const sqlitePath = await createTempDbPath();
    const db = new Database(sqlitePath);

    try {
      initializeSqliteSchema(db);
      db.prepare(
        "insert into staff (id, job_id, name, type, is_admin, enabled, sort_order) values (?, ?, ?, ?, ?, ?, ?)"
      ).run("staff-nurse-001", "100001", "李护士", "nurse", 0, 1, 1);
    } finally {
      db.close();
    }

    const store = createSqliteAuthStore(sqlitePath);
    await store.ensureBootstrapAdmin({ username: "admin", password: "123456" });

    await expect(
      store.saveUser({
        id: "user-scheduler",
        username: "scheduler",
        displayName: "排班管理员",
        role: "scheduler",
        enabled: true,
        staffId: null,
        managedStaffIds: ["staff-nurse-001"],
        managedStaffUpdatedBy: " missing-user ",
        password: "scheduler-password"
      })
    ).rejects.toThrow("FOREIGN KEY constraint failed");
  });

  it("persists users, sessions, and audit logs", async () => {
    const sqlitePath = await createTempDbPath();
    const db = new Database(sqlitePath);
    db.close();

    const store = createSqliteAuthStore(sqlitePath);
    await store.ensureBootstrapAdmin({ username: "admin", password: "admin-password" });
    await store.ensureBootstrapAdmin({ username: "admin", password: "new-admin-password" });

    await expect(store.authenticate("admin", "admin-password")).resolves.toBeNull();
    const authenticated = await store.authenticate("admin", "new-admin-password");
    expect(authenticated?.role).toBe("admin");
    const session = await store.createSession(authenticated!.id);
    await store.recordAudit({
      action: "auth.login.success",
      actor: authenticated!,
      targetType: "user",
      targetId: authenticated!.id,
      summary: "用户 admin 登录成功",
      ip: "127.0.0.1",
      userAgent: "vitest"
    });

    const reopenedStore = createSqliteAuthStore(sqlitePath);
    await expect(reopenedStore.getSession(session.token)).resolves.toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ username: "admin", role: "admin" })
      })
    );
    await expect(reopenedStore.listAuditLogs(10)).resolves.toEqual([
      expect.objectContaining({
        action: "auth.login.success",
        username: "admin",
        summary: "用户 admin 登录成功"
      })
    ]);
  });

  it("persists managed users, password changes, last-admin protection, and filtered audit queries", async () => {
    const sqlitePath = await createTempDbPath();
    const store = createSqliteAuthStore(sqlitePath);
    await store.ensureBootstrapAdmin({ username: "admin", password: "admin-password" });

    const scheduler = await store.saveUser({
      id: "user-scheduler",
      username: "scheduler",
      displayName: "排班管理员",
      role: "scheduler",
      enabled: true,
      password: "scheduler-password"
    });
    await expect(store.changePassword({ userId: scheduler.id, currentPassword: "wrong", newPassword: "new-password" })).resolves.toBe(
      false
    );
    await expect(
      store.changePassword({ userId: scheduler.id, currentPassword: "scheduler-password", newPassword: "new-password" })
    ).resolves.toBe(true);

    await expect(
      store.saveUser({
        id: "admin",
        username: "admin",
        displayName: "系统管理员",
        role: "viewer",
        enabled: true
      })
    ).rejects.toThrow("至少需要保留一个启用的系统管理员");

    await store.recordAudit({
      action: "auth.password.change",
      actor: scheduler,
      targetType: "user",
      targetId: scheduler.id,
      summary: "用户 scheduler 修改密码",
      ip: "127.0.0.1",
      userAgent: "vitest"
    });

    const reopenedStore = createSqliteAuthStore(sqlitePath);
    await expect(reopenedStore.authenticate("scheduler", "scheduler-password")).resolves.toBeNull();
    await expect(reopenedStore.authenticate("scheduler", "new-password")).resolves.toEqual(
      expect.objectContaining({ username: "scheduler", role: "scheduler" })
    );
    await expect(reopenedStore.listUsers()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ username: "admin", role: "admin" }),
        expect.objectContaining({ username: "scheduler", role: "scheduler" })
      ])
    );
    await expect(reopenedStore.listAuditLogs({ username: "scheduler", keyword: "密码", limit: 10 })).resolves.toEqual([
      expect.objectContaining({
        action: "auth.password.change",
        username: "scheduler",
        summary: "用户 scheduler 修改密码"
      })
    ]);
  });

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
    const authenticatedViewer = await store.authenticate("viewer", "viewer-password");
    expect(authenticatedViewer).toEqual(expect.objectContaining({ username: "viewer", staffId: "staff-nurse-001" }));
    expect(authenticatedViewer).not.toHaveProperty("passwordHash");
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

  it("returns sanitized users when saving an existing SQLite user", async () => {
    const sqlitePath = await createTempDbPath();
    const store = createSqliteAuthStore(sqlitePath);
    await store.ensureBootstrapAdmin({ username: "admin", password: "admin-password" });
    const viewer = await store.saveUser({
      id: "user-viewer",
      username: "viewer",
      displayName: "只读用户",
      role: "viewer",
      enabled: true,
      password: "viewer-password"
    });

    const updatedViewer = await store.saveUser({
      id: viewer.id,
      username: "viewer",
      displayName: "只读用户",
      role: "viewer",
      enabled: true
    });

    expect(updatedViewer).toEqual(expect.objectContaining({ username: "viewer", role: "viewer" }));
    expect(updatedViewer).not.toHaveProperty("passwordHash");
  });

  it("unbinds staff bindings and allows the staff member to be rebound", async () => {
    const sqlitePath = await createTempDbPath();
    const db = new Database(sqlitePath);
    try {
      initializeSqliteSchema(db);
      db.prepare(
        `
          insert into staff (id, job_id, name, type, is_admin, enabled, sort_order)
          values (?, ?, ?, ?, ?, ?, ?)
        `
      ).run("staff-nurse-002", "100002", "王护士", "nurse", 0, 1, 1);
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
      staffId: "staff-nurse-002"
    });

    const unboundViewer = await store.saveUser({
      id: viewer.id,
      username: "viewer",
      displayName: "只读用户",
      role: "viewer",
      enabled: true,
      staffId: null
    });
    expect(unboundViewer.staffId).toBeNull();
    await expect(store.authenticate("viewer", "viewer-password")).resolves.toEqual(
      expect.objectContaining({ username: "viewer", staffId: null })
    );

    const reboundViewer = await store.saveUser({
      id: "user-second-viewer",
      username: "viewer2",
      displayName: "只读用户2",
      role: "viewer",
      enabled: true,
      password: "viewer2-password",
      staffId: "staff-nurse-002"
    });
    expect(reboundViewer.staffId).toBe("staff-nurse-002");
  });

  it("clears staff bindings when refreshing the bootstrap admin", async () => {
    const sqlitePath = await createTempDbPath();
    const db = new Database(sqlitePath);
    try {
      initializeSqliteSchema(db);
      db.prepare(
        `
          insert into staff (id, job_id, name, type, is_admin, enabled, sort_order)
          values (?, ?, ?, ?, ?, ?, ?)
        `
      ).run("staff-admin-001", "900001", "管理员", "head_nurse", 1, 1, 1);
    } finally {
      db.close();
    }

    const store = createSqliteAuthStore(sqlitePath);
    await store.ensureBootstrapAdmin({ username: "admin", password: "admin-password" });
    const admin = await store.authenticate("admin", "admin-password");
    expect(admin).not.toBeNull();

    await expect(
      store.saveUser({
        id: admin!.id,
        username: "admin",
        displayName: "系统管理员",
        role: "admin",
        enabled: true,
        staffId: "staff-admin-001"
      })
    ).resolves.toEqual(expect.objectContaining({ username: "admin", staffId: "staff-admin-001" }));

    await store.ensureBootstrapAdmin({ username: "admin", password: "new-admin-password" });
    await expect(store.authenticate("admin", "new-admin-password")).resolves.toEqual(
      expect.objectContaining({ username: "admin", role: "admin", staffId: null })
    );
  });

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
      displayName: "只读用户",
      role: "viewer",
      enabled: true,
      password: "viewer-password",
      staffId: "staff-nurse-001",
      managedStaffIds: ["staff-nurse-002"]
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
      displayName: "只读用户",
      role: "viewer",
      enabled: false,
      staffId: "staff-nurse-001",
      managedStaffIds: ["staff-nurse-002"]
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

    const verificationDb = new Database(sqlitePath);
    try {
      expect(verificationDb.prepare("select count(*) as count from user_sessions where user_id = ?").get(viewer.id)).toEqual({
        count: 0
      });
      expect(
        verificationDb.prepare("select count(*) as count from user_managed_staff where user_id = ?").get(viewer.id)
      ).toEqual({ count: 0 });
      expect(verificationDb.prepare("pragma foreign_key_check").all()).toEqual([]);
    } finally {
      verificationDb.close();
    }
  });

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
      password: "scheduler-password",
      managedStaffIds: ["staff-nurse-001"],
      managedStaffUpdatedBy: testAdmin.id
    });
    await store.saveUser({
      id: testAdmin.id,
      username: "test-admin",
      displayName: "测试管理员",
      role: "admin",
      enabled: false
    });

    await store.deleteUser({
      userId: testAdmin.id,
      actorUserId: admin!.id,
      bootstrapUsername: "admin"
    });

    const verificationDb = new Database(sqlitePath);
    try {
      expect(
        verificationDb.prepare("select created_by from user_managed_staff where user_id = ?").get("user-scheduler")
      ).toEqual({ created_by: null });
      expect(verificationDb.prepare("pragma foreign_key_check").all()).toEqual([]);
    } finally {
      verificationDb.close();
    }
  });

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

    const lastAdminStore = createSqliteAuthStore(await createTempDbPath());
    const viewerActor = await lastAdminStore.saveUser({
      id: "user-viewer-actor",
      username: "viewer-actor",
      displayName: "只读操作员",
      role: "viewer",
      enabled: true,
      password: "viewer-password"
    });
    const lastAdmin = await lastAdminStore.saveUser({
      id: "user-last-admin",
      username: "last-admin",
      displayName: "最后管理员",
      role: "admin",
      enabled: false,
      password: "last-admin-password"
    });
    await expect(
      lastAdminStore.deleteUser({
        userId: lastAdmin.id,
        actorUserId: viewerActor.id,
        bootstrapUsername: "admin"
      })
    ).rejects.toThrow("至少需要保留一个启用的系统管理员");

    const secondStore = createSqliteAuthStore(await createTempDbPath());
    await secondStore.ensureBootstrapAdmin({ username: "root-admin", password: "admin-password" });
    const rootAdmin = await secondStore.authenticate("root-admin", "admin-password");
    expect(rootAdmin).not.toBeNull();
    const bootstrapNamedAdmin = await secondStore.saveUser({
      id: "user-admin",
      username: "admin",
      displayName: "默认管理员",
      role: "viewer",
      enabled: false,
      password: "admin-password"
    });
    await expect(
      secondStore.deleteUser({
        userId: bootstrapNamedAdmin.id,
        actorUserId: rootAdmin!.id,
        bootstrapUsername: "admin"
      })
    ).rejects.toThrow("默认管理员账号不能删除");
  });
});
