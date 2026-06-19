import { describe, expect, it } from "vitest";
import { createMemoryAuthStore } from "./auth-store";
import { hashPassword, verifyPassword } from "./auth";

describe("password hashing", () => {
  it("hashes passwords with a random salt and verifies only the original password", () => {
    const firstHash = hashPassword("secret-password");
    const secondHash = hashPassword("secret-password");

    expect(firstHash).not.toBe(secondHash);
    expect(verifyPassword("secret-password", firstHash)).toBe(true);
    expect(verifyPassword("wrong-password", firstHash)).toBe(false);
  });
});

describe("memory auth store", () => {
  it("bootstraps an admin account, creates sessions, revokes sessions, and records audit logs", async () => {
    const store = createMemoryAuthStore();

    await store.ensureBootstrapAdmin({ username: "admin", password: "admin-password" });
    await store.ensureBootstrapAdmin({ username: "admin", password: "new-admin-password" });

    await expect(store.authenticate("admin", "admin-password")).resolves.toBeNull();
    const authenticated = await store.authenticate("admin", "new-admin-password");
    expect(authenticated).toEqual(
      expect.objectContaining({
        username: "admin",
        displayName: "系统管理员",
        role: "admin",
        enabled: true,
        staffId: null
      })
    );
    await expect(store.authenticate("admin", "wrong-password")).resolves.toBeNull();

    const session = await store.createSession(authenticated!.id);
    expect(session.token.length).toBeGreaterThan(20);
    expect(session.user.username).toBe("admin");
    await expect(store.getSession(session.token)).resolves.toEqual(expect.objectContaining({ user: session.user }));

    await store.revokeSession(session.token);
    await expect(store.getSession(session.token)).resolves.toBeNull();

    await store.recordAudit({
      action: "auth.login.success",
      actor: authenticated!,
      targetType: "user",
      targetId: authenticated!.id,
      summary: "用户 admin 登录成功",
      ip: "127.0.0.1",
      userAgent: "vitest"
    });

    await expect(store.listAuditLogs(10)).resolves.toEqual([
      expect.objectContaining({
        action: "auth.login.success",
        username: "admin",
        targetType: "user",
        targetId: authenticated!.id,
        summary: "用户 admin 登录成功"
      })
    ]);
  });

  it("saves users, changes passwords, protects the last admin, and filters audit logs", async () => {
    const store = createMemoryAuthStore();
    await store.ensureBootstrapAdmin({ username: "admin", password: "admin-password" });

    const scheduler = await store.saveUser({
      id: "user-scheduler",
      username: "scheduler",
      displayName: "排班管理员",
      role: "scheduler",
      enabled: true,
      password: "scheduler-password"
    });

    expect(scheduler).toEqual(
      expect.objectContaining({
        id: "user-scheduler",
        username: "scheduler",
        displayName: "排班管理员",
        role: "scheduler",
        enabled: true
      })
    );
    await expect(store.authenticate("scheduler", "scheduler-password")).resolves.toEqual(
      expect.objectContaining({ username: "scheduler", role: "scheduler" })
    );

    await expect(
      store.changePassword({ userId: scheduler.id, currentPassword: "wrong-password", newPassword: "new-password" })
    ).resolves.toBe(false);
    await expect(
      store.changePassword({
        userId: scheduler.id,
        currentPassword: "scheduler-password",
        newPassword: "new-password"
      })
    ).resolves.toBe(true);
    await expect(store.authenticate("scheduler", "scheduler-password")).resolves.toBeNull();
    await expect(store.authenticate("scheduler", "new-password")).resolves.toEqual(
      expect.objectContaining({ username: "scheduler" })
    );

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
      action: "user.save",
      actor: scheduler,
      targetType: "user",
      targetId: scheduler.id,
      summary: "保存账号：scheduler",
      ip: "127.0.0.1",
      userAgent: "vitest"
    });
    await store.recordAudit({
      action: "auth.password.change",
      actor: scheduler,
      targetType: "user",
      targetId: scheduler.id,
      summary: "用户 scheduler 修改密码",
      ip: "127.0.0.1",
      userAgent: "vitest"
    });

    await expect(store.listUsers()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ username: "admin", role: "admin" }),
        expect.objectContaining({ username: "scheduler", role: "scheduler" })
      ])
    );
    await expect(store.listAuditLogs({ action: "auth.password.change", keyword: "scheduler", limit: 10 })).resolves.toEqual([
      expect.objectContaining({
        action: "auth.password.change",
        username: "scheduler",
        summary: "用户 scheduler 修改密码"
      })
    ]);
  });

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
});
