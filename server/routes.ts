import { Router } from "express";
import { validateScheduleShiftIds } from "../src/lib/validation";
import type { AppData, Holiday, Shift, StaffMember } from "./types";
import type { StorageAdapter } from "./storage";

type PublicAppData = Omit<AppData, "settings"> & {
  settings: Omit<AppData["settings"], "adminPassword">;
};

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
      const data = await storage.load();
      const staffMember = { ...(request.body as StaffMember), id: request.params.id };
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
      const data = await storage.load();
      const shift = { ...(request.body as Shift), id: request.params.id };
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
      const data = await storage.load();
      const holiday = { ...(request.body as Holiday), id: request.params.id };
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
      const data = await storage.load();
      const { date, staffId, shiftIds, note } = request.body as {
        date: string;
        staffId: string;
        shiftIds: string[];
        note: string;
      };

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
                note
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
