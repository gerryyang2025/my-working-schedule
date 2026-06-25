import type { AppData, Holiday, ScheduleEntry, Shift, StaffMember } from "@/types/domain";

export type PublicAppData = AppData;
export type UserRole = "admin" | "scheduler" | "viewer";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  staffId: string | null;
  managedStaffIds: string[];
}

export interface ManagedAuthUser extends AuthUser {
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
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

export interface PasswordChangeInput {
  currentPassword: string;
  newPassword: string;
}

export type CopyPreviousWeekMode = "skip" | "overwrite";

export interface CopyPreviousWeekScheduleResult {
  copied: number;
  skipped: number;
}

export type BulkWeekScheduleOperation = "set-shift" | "clear";

export interface BulkWeekScheduleResult {
  updated: number;
  skipped: number;
}

export type BulkWeekSchedulePayload =
  | {
      weekStart: string;
      operation: "set-shift";
      shiftId: string;
      mode: CopyPreviousWeekMode;
    }
  | {
      weekStart: string;
      operation: "clear";
    };

export interface AuditLogEntry {
  id: string;
  occurredAt: string;
  userId: string | null;
  username: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  ip: string;
  userAgent: string;
}

export interface AuditLogQuery {
  username?: string;
  action?: string;
  keyword?: string;
  limit?: number;
  page?: number;
  pageSize?: number;
}

export interface AuditLogListResponse {
  rows: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

const AUTH_TOKEN_STORAGE_KEY = "schedule-auth-token";

let adminMode = false;
let adminToken: string | null = readStoredAuthToken();
let currentUser: AuthUser | null = null;

interface ApiErrorResponse {
  message?: string;
}

export async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (adminToken) {
    headers.set("Authorization", `Bearer ${adminToken}`);
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  if (!response.ok) {
    let errorBody: ApiErrorResponse | null = null;

    try {
      errorBody = (await response.json()) as ApiErrorResponse;
    } catch {
      errorBody = null;
    }

    throw new Error(errorBody?.message || response.statusText || `HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

function readStoredAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredAuthToken(token: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (token) {
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
      return;
    }

    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    // Browsers can block storage in private contexts; in-memory auth still works.
  }
}

function setAuthSession(token: string | null, user: AuthUser | null): void {
  adminToken = token;
  currentUser = user;
  adminMode = Boolean(token && user && (user.role === "admin" || user.role === "scheduler"));
  writeStoredAuthToken(token);
}

export function setAdminMode(enabled: boolean): void {
  adminMode = enabled;
  if (!enabled) {
    setAuthSession(null, null);
  }
}

export function loadData(options: { signal?: AbortSignal } = {}): Promise<PublicAppData> {
  return requestJson<PublicAppData>("/api/data", { signal: options.signal });
}

function authHeaders(): HeadersInit {
  if (!adminMode || !adminToken) {
    return {};
  }

  return {
    Authorization: `Bearer ${adminToken}`
  };
}

export async function enterAdminMode(password: string): Promise<void> {
  const session = await requestJson<{ ok: true; token: string; user: AuthUser }>("/api/admin/session", {
    method: "POST",
    body: JSON.stringify({ password })
  });
  setAuthSession(session.token, session.user);
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const session = await requestJson<{ ok: true; token: string; user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  setAuthSession(session.token, session.user);
  return session.user;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!adminToken) {
    return null;
  }

  try {
    const session = await requestJson<{ user: AuthUser }>("/api/auth/me");
    currentUser = session.user;
    adminMode = currentUser.role === "admin" || currentUser.role === "scheduler";
    return currentUser;
  } catch {
    setAuthSession(null, null);
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    if (adminToken) {
      await requestJson<{ ok: true }>("/api/auth/logout", { method: "POST" });
    }
  } catch {
    // The session may already be revoked, for example after a password change.
  } finally {
    setAuthSession(null, null);
  }
}

export function getCachedCurrentUser(): AuthUser | null {
  return currentUser;
}

export function listUsers(options: { signal?: AbortSignal } = {}): Promise<{ rows: ManagedAuthUser[] }> {
  return requestJson<{ rows: ManagedAuthUser[] }>("/api/users", { signal: options.signal });
}

export function saveUser(user: SaveAuthUserInput): Promise<{ user: ManagedAuthUser }> {
  return requestJson<{ user: ManagedAuthUser }>(`/api/users/${encodeURIComponent(user.id)}`, {
    method: "PUT",
    body: JSON.stringify(user)
  });
}

export function deleteUser(id: string): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>(`/api/users/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

export function changePassword(payload: PasswordChangeInput): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>("/api/auth/password", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function listAuditLogs(
  query: AuditLogQuery = {},
  options: { signal?: AbortSignal } = {}
): Promise<AuditLogListResponse> {
  const params = new URLSearchParams();
  if (query.username) {
    params.set("username", query.username);
  }
  if (query.action) {
    params.set("action", query.action);
  }
  if (query.keyword) {
    params.set("keyword", query.keyword);
  }
  if (query.limit) {
    params.set("limit", String(query.limit));
  }
  if (query.page) {
    params.set("page", String(query.page));
  }
  if (query.pageSize) {
    params.set("pageSize", String(query.pageSize));
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestJson<AuditLogListResponse>(`/api/audit-logs${suffix}`, { signal: options.signal });
}

export function saveStaff(staff: StaffMember): Promise<PublicAppData> {
  return requestJson<PublicAppData>(`/api/data/staff/${staff.id}`, {
    method: "PUT",
    body: JSON.stringify(staff)
  });
}

export function deleteStaff(id: string): Promise<PublicAppData> {
  return requestJson<PublicAppData>(`/api/data/staff/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

export function saveShift(shift: Shift): Promise<PublicAppData> {
  return requestJson<PublicAppData>(`/api/data/shift/${shift.id}`, {
    method: "PUT",
    body: JSON.stringify(shift)
  });
}

export function saveHoliday(holiday: Holiday): Promise<PublicAppData> {
  return requestJson<PublicAppData>(`/api/data/holiday/${holiday.id}`, {
    method: "PUT",
    body: JSON.stringify(holiday)
  });
}

export function deleteHoliday(id: string): Promise<PublicAppData> {
  return requestJson<PublicAppData>(`/api/data/holiday/${id}`, {
    method: "DELETE"
  });
}

export function saveScheduleEntry(entry: Omit<ScheduleEntry, "id">): Promise<PublicAppData> {
  return requestJson<PublicAppData>("/api/data/schedule-entry", {
    method: "PUT",
    body: JSON.stringify(entry)
  });
}

export function copyPreviousWeekSchedule(payload: {
  weekStart: string;
  mode: CopyPreviousWeekMode;
}): Promise<{ data: PublicAppData; result: CopyPreviousWeekScheduleResult }> {
  return requestJson<{ data: PublicAppData; result: CopyPreviousWeekScheduleResult }>(
    "/api/data/schedule-copy-previous-week",
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
}

export function bulkUpdateWeekSchedule(
  payload: BulkWeekSchedulePayload
): Promise<{ data: PublicAppData; result: BulkWeekScheduleResult }> {
  return requestJson<{ data: PublicAppData; result: BulkWeekScheduleResult }>("/api/data/schedule-bulk-week", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function saveMonthlySettlement(month: string, bonusPool: number): Promise<PublicAppData> {
  return requestJson<PublicAppData>("/api/data/monthly-settlement", {
    method: "PUT",
    body: JSON.stringify({ month, bonusPool }),
    headers: {
      "Content-Type": "application/json",
      ...authHeaders()
    }
  });
}

export async function deleteMonthlySettlement(month: string): Promise<PublicAppData> {
  return requestJson<PublicAppData>(`/api/data/monthly-settlement/${encodeURIComponent(month)}`, {
    method: "DELETE",
    headers: authHeaders()
  });
}
