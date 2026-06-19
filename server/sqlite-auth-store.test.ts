import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteAuthStore } from "./sqlite/auth-store";
import { initializeSqliteSchema, listMissingCoreTables } from "./sqlite/schema";

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

      const migration = db.prepare("select version from schema_migrations where version = 3").get();
      expect(migration).toEqual(expect.objectContaining({ version: 3 }));
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
});
