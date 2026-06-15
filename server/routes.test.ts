import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { AppData, Holiday, Shift, StaffMember } from "../src/types/domain";
import { createRoutes } from "./routes";
import { createSeedData } from "./seed";

function createTestApp(initialData: AppData = createSeedData()) {
  let data = structuredClone(initialData);
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createRoutes({
      load: async () => data,
      save: async (next) => {
        data = structuredClone(next);
      }
    })
  );
  return app;
}

function createStaffPayload(overrides: Partial<StaffMember> = {}) {
  return {
    jobId: "100099",
    name: "赵护士",
    type: "nurse",
    isAdmin: false,
    enabled: true,
    sortOrder: 99,
    ...overrides
  };
}

function createShiftPayload(overrides: Partial<Shift> = {}) {
  return {
    name: "测试班",
    shortName: "测",
    color: "#111827",
    countsAttendance: true,
    coefficient: 1,
    enabled: true,
    sortOrder: 99,
    ...overrides
  };
}

function createHolidayPayload(overrides: Partial<Holiday> = {}) {
  return {
    date: "2026-10-01",
    name: "国庆节",
    affectsRequiredAttendance: true,
    ...overrides
  };
}

describe("API routes", () => {
  it("returns health", async () => {
    await request(createTestApp()).get("/api/health").expect(200, { ok: true });
  });

  it("returns app data without leaking the admin password", async () => {
    const response = await request(createTestApp()).get("/api/data").expect(200);
    expect(response.body.staff).toHaveLength(3);
    expect(response.body.settings.adminPassword).toBeUndefined();
  });

  it("enters admin mode with the configured password", async () => {
    await request(createTestApp()).post("/api/admin/session").send({ password: "123456" }).expect(200, { ok: true });
  });

  it("rejects admin mode with the wrong password", async () => {
    const response = await request(createTestApp()).post("/api/admin/session").send({ password: "wrong" }).expect(401);
    expect(response.body).toEqual({ ok: false, message: "管理密码不正确" });
  });

  it("rejects data writes without admin mode", async () => {
    await request(createTestApp())
      .put("/api/data/schedule-entry")
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" })
      .expect(401);
  });

  it("upserts staff and returns public data", async () => {
    const response = await request(createTestApp())
      .put("/api/data/staff/staff-nurse-099")
      .set("x-admin-mode", "true")
      .send(createStaffPayload({ id: "ignored-id" }))
      .expect(200);
    expect(response.body.staff).toContainEqual({ id: "staff-nurse-099", ...createStaffPayload() });
    expect(response.body.settings.adminPassword).toBeUndefined();
  });

  it("upserts shifts", async () => {
    const response = await request(createTestApp())
      .put("/api/data/shift/shift-test")
      .set("x-admin-mode", "true")
      .send(createShiftPayload({ id: "ignored-id" }))
      .expect(200);
    expect(response.body.shifts).toContainEqual({ id: "shift-test", ...createShiftPayload() });
  });

  it("upserts holidays", async () => {
    const response = await request(createTestApp())
      .put("/api/data/holiday/holiday-2026-10-01")
      .set("x-admin-mode", "true")
      .send(createHolidayPayload({ id: "ignored-id" }))
      .expect(200);
    expect(response.body.holidays).toContainEqual({ id: "holiday-2026-10-01", ...createHolidayPayload() });
  });

  it("rejects duplicate holiday dates", async () => {
    const response = await request(createTestApp())
      .put("/api/data/holiday/holiday-duplicate")
      .set("x-admin-mode", "true")
      .send(createHolidayPayload({ date: "2026-06-19" }))
      .expect(400);
    expect(response.body.message).toBe("节假日日期不能重复");
  });

  it("saves a schedule entry with admin header", async () => {
    const response = await request(createTestApp())
      .put("/api/data/schedule-entry")
      .set("x-admin-mode", "true")
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" })
      .expect(200);
    expect(response.body.scheduleEntries).toHaveLength(1);
    expect(response.body.scheduleEntries[0].id).toBe("2026-06-15__staff-nurse-001");
  });

  it("normalizes omitted schedule entry notes to an empty string", async () => {
    const response = await request(createTestApp())
      .put("/api/data/schedule-entry")
      .set("x-admin-mode", "true")
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"] })
      .expect(200);
    expect(response.body.scheduleEntries[0].note).toBe("");
  });

  it("rejects unknown staff in schedule entries", async () => {
    const response = await request(createTestApp())
      .put("/api/data/schedule-entry")
      .set("x-admin-mode", "true")
      .send({ date: "2026-06-15", staffId: "staff-missing", shiftIds: ["shift-a1"], note: "" })
      .expect(400);
    expect(response.body.message).toBe("人员不存在：staff-missing");
  });

  it("rejects unknown shifts in schedule entries", async () => {
    const response = await request(createTestApp())
      .put("/api/data/schedule-entry")
      .set("x-admin-mode", "true")
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-missing"], note: "" })
      .expect(400);
    expect(response.body.message).toBe("班次不存在：shift-missing");
  });

  it("rejects disabled shifts in schedule entries", async () => {
    const initialData = createSeedData();
    initialData.shifts = initialData.shifts.map((shift) => (shift.id === "shift-a1" ? { ...shift, enabled: false } : shift));
    const response = await request(createTestApp(initialData))
      .put("/api/data/schedule-entry")
      .set("x-admin-mode", "true")
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" })
      .expect(400);
    expect(response.body.message).toBe("班次已禁用：A1组长");
  });

  it("rejects duplicate shifts in schedule entries", async () => {
    const response = await request(createTestApp())
      .put("/api/data/schedule-entry")
      .set("x-admin-mode", "true")
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1", "shift-a1"], note: "" })
      .expect(400);
    expect(response.body.message).toBe("同一天不能重复保存同一个班次");
  });

  it("rejects a third shift for the same person and date", async () => {
    const response = await request(createTestApp())
      .put("/api/data/schedule-entry")
      .set("x-admin-mode", "true")
      .send({
        date: "2026-06-15",
        staffId: "staff-nurse-001",
        shiftIds: ["shift-a1", "shift-p1", "shift-n1"],
        note: ""
      })
      .expect(400);
    expect(response.body.message).toBe("单人单日最多两个班次");
  });

  it("deletes existing schedule entries when shiftIds is empty", async () => {
    const initialData = createSeedData();
    initialData.scheduleEntries = [
      {
        id: "2026-06-15__staff-nurse-001",
        date: "2026-06-15",
        staffId: "staff-nurse-001",
        shiftIds: ["shift-a1"],
        note: "old"
      }
    ];
    const response = await request(createTestApp(initialData))
      .put("/api/data/schedule-entry")
      .set("x-admin-mode", "true")
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: [], note: "" })
      .expect(200);
    expect(response.body.scheduleEntries).toEqual([]);
  });

  it("rejects malformed schedule-entry payloads", async () => {
    const response = await request(createTestApp())
      .put("/api/data/schedule-entry")
      .set("x-admin-mode", "true")
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", note: "" })
      .expect(400);
    expect(response.body.message).toBe("排班信息不完整");
  });

  it("rejects invalid schedule-entry note formats", async () => {
    const response = await request(createTestApp())
      .put("/api/data/schedule-entry")
      .set("x-admin-mode", "true")
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: 123 })
      .expect(400);
    expect(response.body.message).toBe("备注格式不正确");
  });

  it("rejects malformed staff payloads", async () => {
    const response = await request(createTestApp())
      .put("/api/data/staff/staff-bad")
      .set("x-admin-mode", "true")
      .send({ name: "缺字段" })
      .expect(400);
    expect(response.body.message).toBe("人员信息不完整");
  });

  it("rejects malformed shift payloads", async () => {
    const response = await request(createTestApp())
      .put("/api/data/shift/shift-bad")
      .set("x-admin-mode", "true")
      .send({ name: "缺字段" })
      .expect(400);
    expect(response.body.message).toBe("班次信息不完整");
  });

  it("rejects malformed holiday payloads", async () => {
    const response = await request(createTestApp())
      .put("/api/data/holiday/holiday-bad")
      .set("x-admin-mode", "true")
      .send({ name: "缺字段" })
      .expect(400);
    expect(response.body.message).toBe("节假日信息不完整");
  });
});
