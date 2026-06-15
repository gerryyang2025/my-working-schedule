import type { AppData, Holiday, ScheduleEntry, Settings, Shift, StaffMember } from "@/types/domain";

export type PublicAppData = Omit<AppData, "settings"> & {
  settings: Omit<Settings, "adminPassword">;
};

let adminMode = false;
let adminToken: string | null = null;

interface ApiErrorResponse {
  message?: string;
}

export async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (adminMode && adminToken) {
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

export function setAdminMode(enabled: boolean): void {
  adminMode = enabled;
  if (!enabled) {
    adminToken = null;
  }
}

export function loadData(): Promise<PublicAppData> {
  return requestJson<PublicAppData>("/api/data");
}

export async function enterAdminMode(password: string): Promise<void> {
  const session = await requestJson<{ ok: true; token: string }>("/api/admin/session", {
    method: "POST",
    body: JSON.stringify({ password })
  });
  adminToken = session.token;
  setAdminMode(true);
}

export function saveStaff(staff: StaffMember): Promise<PublicAppData> {
  return requestJson<PublicAppData>(`/api/data/staff/${staff.id}`, {
    method: "PUT",
    body: JSON.stringify(staff)
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
