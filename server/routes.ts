import { randomBytes } from "node:crypto";
import { Router, type NextFunction, type Response } from "express";
import { validateScheduleShiftIds } from "../src/lib/validation";
import type { AppData, Holiday, Shift, StaffMember } from "./types";
import type { StorageAdapter } from "./storage";
import { getNonBlankAdminPassword } from "./seed";

type PublicAppData = Omit<AppData, "settings"> & {
  settings: Omit<AppData["settings"], "adminPassword">;
};

interface ScheduleEntryPayload {
  date: string;
  staffId: string;
  shiftIds: string[];
  note: string | null | undefined;
}

type PayloadResult<T> = { ok: true; value: T } | { ok: false; message: string };

const staffTypes = new Set(["nurse", "clerk", "head_nurse"]);

class HttpResponseError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function handleRouteError(error: unknown, response: Response, next: NextFunction): void {
  if (error instanceof HttpResponseError) {
    response.status(error.status).json({ message: error.message });
    return;
  }

  next(error);
}

function toPublicData(data: AppData): PublicAppData {
  const { adminPassword: _adminPassword, ...publicSettings } = data.settings;
  return {
    ...data,
    settings: publicSettings
  };
}

function upsertById<T extends { id: string }>(items: T[], next: T): T[] {
  const existingIndex = items.findIndex((item) => item.id === next.id);
  if (existingIndex === -1) {
    return [...items, next];
  }

  return items.map((item, index) => (index === existingIndex ? next : item));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isStaffType(value: unknown): value is StaffMember["type"] {
  return isString(value) && staffTypes.has(value);
}

function isValidDateKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function createAdminToken(): string {
  return randomBytes(32).toString("base64url");
}

function parseBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function getConfiguredAdminPassword(data: AppData): string {
  return getNonBlankAdminPassword(process.env.SCHEDULE_ADMIN_PASSWORD, data.settings.adminPassword);
}

function parseStaffPayload(body: unknown, id: string): StaffMember | null {
  if (!isRecord(body)) {
    return null;
  }

  const { jobId, name, type, isAdmin, enabled, sortOrder } = body;
  if (
    !isString(jobId) ||
    !isString(name) ||
    !isStaffType(type) ||
    !isBoolean(isAdmin) ||
    !isBoolean(enabled) ||
    !isNumber(sortOrder)
  ) {
    return null;
  }

  return { id, jobId, name, type, isAdmin, enabled, sortOrder };
}

function parseShiftPayload(body: unknown, id: string): Shift | null {
  if (!isRecord(body)) {
    return null;
  }

  const { name, shortName, color, countsAttendance, coefficient, enabled, sortOrder } = body;
  if (
    !isString(name) ||
    !isString(shortName) ||
    !isString(color) ||
    !isBoolean(countsAttendance) ||
    !isNumber(coefficient) ||
    !isBoolean(enabled) ||
    !isNumber(sortOrder)
  ) {
    return null;
  }

  return { id, name, shortName, color, countsAttendance, coefficient, enabled, sortOrder };
}

function parseHolidayPayload(body: unknown, id: string): Holiday | null {
  if (!isRecord(body)) {
    return null;
  }

  const { date, name, affectsRequiredAttendance } = body;
  if (!isString(date) || !isString(name) || !isBoolean(affectsRequiredAttendance)) {
    return null;
  }

  return { id, date, name, affectsRequiredAttendance };
}

function parseScheduleEntryPayload(body: unknown): PayloadResult<ScheduleEntryPayload> {
  if (!isRecord(body)) {
    return { ok: false, message: "排班信息不完整" };
  }

  const { date, staffId, shiftIds, note } = body;
  if (!isNonEmptyString(date) || !isNonEmptyString(staffId) || !isStringArray(shiftIds)) {
    return { ok: false, message: "排班信息不完整" };
  }

  let parsedNote: string | null | undefined;
  if (note === undefined) {
    parsedNote = undefined;
  } else if (note === null) {
    parsedNote = null;
  } else if (isString(note)) {
    parsedNote = note;
  } else {
    return { ok: false, message: "备注格式不正确" };
  }

  return { ok: true, value: { date, staffId, shiftIds, note: parsedNote } };
}

export function createRoutes(storage: StorageAdapter): Router {
  const router = Router();
  const adminTokens = new Set<string>();

  router.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  router.get("/data", async (_request, response, next) => {
    try {
      const data = await storage.load();
      response.json(toPublicData(data));
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.post("/admin/session", async (request, response, next) => {
    try {
      const data = await storage.load();
      if (request.body?.password === getConfiguredAdminPassword(data)) {
        const token = createAdminToken();
        adminTokens.add(token);
        response.json({ ok: true, token });
        return;
      }

      response.status(401).json({ ok: false, message: "管理密码不正确" });
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.use("/data", (request, response, next) => {
    const token = parseBearerToken(request.header("Authorization"));
    if (token && adminTokens.has(token)) {
      next();
      return;
    }

    response.status(401).json({ message: "请先进入编辑模式" });
  });

  router.put("/data/staff/:id", async (request, response, next) => {
    try {
      const staffMember = parseStaffPayload(request.body, request.params.id);
      if (!staffMember) {
        response.status(400).json({ message: "人员信息不完整" });
        return;
      }

      const nextData = await storage.update((data) => ({
        ...data,
        staff: upsertById(data.staff, staffMember)
      }));
      response.json(toPublicData(nextData));
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.put("/data/shift/:id", async (request, response, next) => {
    try {
      const shift = parseShiftPayload(request.body, request.params.id);
      if (!shift) {
        response.status(400).json({ message: "班次信息不完整" });
        return;
      }

      const nextData = await storage.update((data) => ({
        ...data,
        shifts: upsertById(data.shifts, shift)
      }));
      response.json(toPublicData(nextData));
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.put("/data/holiday/:id", async (request, response, next) => {
    try {
      const holiday = parseHolidayPayload(request.body, request.params.id);
      if (!holiday) {
        response.status(400).json({ message: "节假日信息不完整" });
        return;
      }
      if (!isValidDateKey(holiday.date)) {
        response.status(400).json({ message: "日期格式不正确" });
        return;
      }

      const nextData = await storage.update((data) => {
        const hasDuplicateDate = data.holidays.some((item) => item.id !== holiday.id && item.date === holiday.date);
        if (hasDuplicateDate) {
          throw new HttpResponseError(400, "节假日日期不能重复");
        }

        return {
          ...data,
          holidays: upsertById(data.holidays, holiday)
        };
      });
      response.json(toPublicData(nextData));
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.put("/data/schedule-entry", async (request, response, next) => {
    try {
      const payload = parseScheduleEntryPayload(request.body);
      if (payload.ok === false) {
        response.status(400).json({ message: payload.message });
        return;
      }

      const { date, staffId, shiftIds, note } = payload.value;
      if (!isValidDateKey(date)) {
        response.status(400).json({ message: "日期格式不正确" });
        return;
      }

      const nextData = await storage.update((data) => {
        if (!data.staff.some((staffMember) => staffMember.id === staffId)) {
          throw new HttpResponseError(400, `人员不存在：${staffId}`);
        }

        const validation = validateScheduleShiftIds(shiftIds, data.shifts);
        if (!validation.ok) {
          throw new HttpResponseError(400, validation.message);
        }

        const id = `${date}__${staffId}`;
        const remainingEntries = data.scheduleEntries.filter((entry) => entry.id !== id);
        const scheduleEntries =
          shiftIds.length === 0
            ? remainingEntries
            : [
                ...remainingEntries,
                {
                  id,
                  date,
                  staffId,
                  shiftIds,
                  note: note ?? ""
                }
              ];

        return {
          ...data,
          scheduleEntries
        };
      });
      response.json(toPublicData(nextData));
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  return router;
}
