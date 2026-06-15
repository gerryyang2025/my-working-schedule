import { Router } from "express";
import { validateScheduleShiftIds } from "../src/lib/validation";
import type { AppData, Holiday, Shift, StaffMember } from "./types";
import type { StorageAdapter } from "./storage";

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

  router.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  router.get("/data", async (_request, response, next) => {
    try {
      const data = await storage.load();
      response.json(toPublicData(data));
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/session", async (request, response, next) => {
    try {
      const data = await storage.load();
      if (request.body?.password === data.settings.adminPassword) {
        response.json({ ok: true });
        return;
      }

      response.status(401).json({ ok: false, message: "管理密码不正确" });
    } catch (error) {
      next(error);
    }
  });

  router.use("/data", (request, response, next) => {
    if (request.header("x-admin-mode") === "true") {
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

      const data = await storage.load();
      const nextData = {
        ...data,
        staff: upsertById(data.staff, staffMember)
      };
      await storage.save(nextData);
      response.json(toPublicData(nextData));
    } catch (error) {
      next(error);
    }
  });

  router.put("/data/shift/:id", async (request, response, next) => {
    try {
      const shift = parseShiftPayload(request.body, request.params.id);
      if (!shift) {
        response.status(400).json({ message: "班次信息不完整" });
        return;
      }

      const data = await storage.load();
      const nextData = {
        ...data,
        shifts: upsertById(data.shifts, shift)
      };
      await storage.save(nextData);
      response.json(toPublicData(nextData));
    } catch (error) {
      next(error);
    }
  });

  router.put("/data/holiday/:id", async (request, response, next) => {
    try {
      const holiday = parseHolidayPayload(request.body, request.params.id);
      if (!holiday) {
        response.status(400).json({ message: "节假日信息不完整" });
        return;
      }

      const data = await storage.load();
      const hasDuplicateDate = data.holidays.some((item) => item.id !== holiday.id && item.date === holiday.date);
      if (hasDuplicateDate) {
        response.status(400).json({ message: "节假日日期不能重复" });
        return;
      }

      const nextData = {
        ...data,
        holidays: upsertById(data.holidays, holiday)
      };
      await storage.save(nextData);
      response.json(toPublicData(nextData));
    } catch (error) {
      next(error);
    }
  });

  router.put("/data/schedule-entry", async (request, response, next) => {
    try {
      const payload = parseScheduleEntryPayload(request.body);
      if (payload.ok === false) {
        response.status(400).json({ message: payload.message });
        return;
      }

      const data = await storage.load();
      const { date, staffId, shiftIds, note } = payload.value;

      if (!data.staff.some((staffMember) => staffMember.id === staffId)) {
        response.status(400).json({ message: `人员不存在：${staffId}` });
        return;
      }

      const validation = validateScheduleShiftIds(shiftIds, data.shifts);
      if (!validation.ok) {
        response.status(400).json({ message: validation.message });
        return;
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
      const nextData = {
        ...data,
        scheduleEntries
      };

      await storage.save(nextData);
      response.json(toPublicData(nextData));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
