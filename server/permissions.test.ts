import { describe, expect, it } from "vitest";
import type { AuthUser } from "./auth";
import { canManageAllStaff, canManageStaff, canManageSystem, canReadAppData } from "./permissions";

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

  it("allows only enabled admins to manage system settings", () => {
    expect(canManageSystem(null)).toBe(false);
    expect(canManageSystem(user({ role: "admin", enabled: false }))).toBe(false);
    expect(canManageSystem(user({ role: "scheduler" }))).toBe(false);
    expect(canManageSystem(user({ role: "viewer" }))).toBe(false);
    expect(canManageSystem(user({ role: "admin" }))).toBe(true);
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

  it("treats an empty required staff list as manageable for any user", () => {
    expect(canManageAllStaff(null, [])).toBe(true);
    expect(canManageAllStaff(user({ enabled: false }), [])).toBe(true);
    expect(canManageAllStaff(user({ role: "viewer" }), [])).toBe(true);
  });
});
