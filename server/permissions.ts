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
