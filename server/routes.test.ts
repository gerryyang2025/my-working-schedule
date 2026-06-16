import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { AppData, Holiday, Shift, StaffMember } from "../src/types/domain";
import { createRoutes } from "./routes";
import { createSeedData } from "./seed";

const TEST_ADMIN_PASSWORD = "123456";

function createTestApp(initialData: AppData = createSeedData(), adminPassword = TEST_ADMIN_PASSWORD) {
  let data = structuredClone(initialData);
  let updateQueue = Promise.resolve();
  const app = express();
  const storage = {
    load: async () => data,
    save: async (next: AppData) => {
      data = structuredClone(next);
    },
    update: async (mutate: (current: AppData) => AppData | Promise<AppData>) => {
      const run = updateQueue.then(async () => {
        const nextData = await mutate(structuredClone(data));
        data = structuredClone(nextData);
        return data;
      });
      updateQueue = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    }
  };
  app.use(express.json());
  app.use("/api", createRoutes(storage, { adminPassword }));
  return app;
}

async function getAdminToken(app: express.Express): Promise<string> {
  const response = await request(app).post("/api/admin/session").send({ password: TEST_ADMIN_PASSWORD }).expect(200);
  expect(response.body.token).toEqual(expect.any(String));
  return response.body.token as string;
}

async function adminHeaders(app: express.Express) {
  const token = await getAdminToken(app);
  return { Authorization: `Bearer ${token}` };
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
    const response = await request(createTestApp()).post("/api/admin/session").send({ password: TEST_ADMIN_PASSWORD }).expect(200);
    expect(response.body.ok).toBe(true);
  });

  it("returns a server-issued admin token", async () => {
    const response = await request(createTestApp()).post("/api/admin/session").send({ password: TEST_ADMIN_PASSWORD }).expect(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.token.length).toBeGreaterThan(20);
  });

  it("rejects admin mode with the wrong password", async () => {
    const response = await request(createTestApp()).post("/api/admin/session").send({ password: "wrong" }).expect(401);
    expect(response.body).toEqual({ ok: false, message: "管理密码不正确" });
  });

  it.each(["", "   "])("rejects blank login password %j", async (password) => {
    const response = await request(createTestApp()).post("/api/admin/session").send({ password }).expect(401);
    expect(response.body).toEqual({ ok: false, message: "管理密码不正确" });
  });

  it("authenticates with the injected server admin password", async () => {
    const response = await request(createTestApp(createSeedData(), "server-config-password"))
      .post("/api/admin/session")
      .send({ password: "server-config-password" })
      .expect(200);

    expect(response.body.token).toEqual(expect.any(String));
  });

  it("does not authenticate with a legacy password stored in app data", async () => {
    const legacyData = createSeedData() as AppData & { settings: AppData["settings"] & { adminPassword: string } };
    legacyData.settings.adminPassword = "legacy-data-password";

    const response = await request(createTestApp(legacyData, "server-config-password"))
      .post("/api/admin/session")
      .send({ password: "legacy-data-password" })
      .expect(401);

    expect(response.body).toEqual({ ok: false, message: "管理密码不正确" });
  });

  it("rejects data writes without admin mode", async () => {
    await request(createTestApp())
      .put("/api/data/schedule-entry")
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" })
      .expect(401);
  });

  it("rejects forged admin mode headers", async () => {
    const response = await request(createTestApp())
      .put("/api/data/schedule-entry")
      .set("x-admin-mode", "true")
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" })
      .expect(401);
    expect(response.body.message).toBe("请先进入编辑模式");
  });

  it("rejects invalid bearer tokens", async () => {
    const response = await request(createTestApp())
      .put("/api/data/schedule-entry")
      .set("Authorization", "Bearer forged-token")
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" })
      .expect(401);
    expect(response.body.message).toBe("请先进入编辑模式");
  });

  it("upserts staff and returns public data", async () => {
    const app = createTestApp();
    const response = await request(app)
      .put("/api/data/staff/staff-nurse-099")
      .set(await adminHeaders(app))
      .send(createStaffPayload({ id: "ignored-id" }))
      .expect(200);
    expect(response.body.staff).toContainEqual({ id: "staff-nurse-099", ...createStaffPayload() });
    expect(response.body.settings.adminPassword).toBeUndefined();
  });

  it("upserts shifts", async () => {
    const app = createTestApp();
    const response = await request(app)
      .put("/api/data/shift/shift-test")
      .set(await adminHeaders(app))
      .send(createShiftPayload({ id: "ignored-id" }))
      .expect(200);
    expect(response.body.shifts).toContainEqual({ id: "shift-test", ...createShiftPayload() });
  });

  it("upserts holidays", async () => {
    const app = createTestApp();
    const response = await request(app)
      .put("/api/data/holiday/holiday-2026-10-01")
      .set(await adminHeaders(app))
      .send(createHolidayPayload({ id: "ignored-id" }))
      .expect(200);
    expect(response.body.holidays).toContainEqual({ id: "holiday-2026-10-01", ...createHolidayPayload() });
  });

  it("rejects holiday deletes without admin mode", async () => {
    await request(createTestApp()).delete("/api/data/holiday/holiday-2026-06-19").expect(401);
  });

  it("deletes an existing holiday and returns public data", async () => {
    const app = createTestApp();
    const response = await request(app)
      .delete("/api/data/holiday/holiday-2026-06-19")
      .set(await adminHeaders(app))
      .expect(200);
    expect(response.body.holidays).not.toContainEqual(
      expect.objectContaining({ id: "holiday-2026-06-19" })
    );
    expect(response.body.settings.adminPassword).toBeUndefined();
  });

  it("returns 404 when deleting a missing holiday", async () => {
    const app = createTestApp();
    const response = await request(app)
      .delete("/api/data/holiday/holiday-missing")
      .set(await adminHeaders(app))
      .expect(404);
    expect(response.body.message).toBe("节假日不存在");
  });

  it("rejects duplicate holiday dates", async () => {
    const app = createTestApp();
    const response = await request(app)
      .put("/api/data/holiday/holiday-duplicate")
      .set(await adminHeaders(app))
      .send(createHolidayPayload({ date: "2026-06-19" }))
      .expect(400);
    expect(response.body.message).toBe("节假日日期不能重复");
  });

  it("rejects holidays with invalid dates", async () => {
    const app = createTestApp();
    const response = await request(app)
      .put("/api/data/holiday/holiday-invalid")
      .set(await adminHeaders(app))
      .send(createHolidayPayload({ date: "2026-02-30" }))
      .expect(400);
    expect(response.body.message).toBe("日期格式不正确");
  });

  it("saves a schedule entry with bearer token", async () => {
    const app = createTestApp();
    const response = await request(app)
      .put("/api/data/schedule-entry")
      .set(await adminHeaders(app))
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" })
      .expect(200);
    expect(response.body.scheduleEntries).toHaveLength(1);
    expect(response.body.scheduleEntries[0].id).toBe("2026-06-15__staff-nurse-001");
  });

  it("normalizes omitted schedule entry notes to an empty string", async () => {
    const app = createTestApp();
    const response = await request(app)
      .put("/api/data/schedule-entry")
      .set(await adminHeaders(app))
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"] })
      .expect(200);
    expect(response.body.scheduleEntries[0].note).toBe("");
  });

  it("rejects unknown staff in schedule entries", async () => {
    const app = createTestApp();
    const response = await request(app)
      .put("/api/data/schedule-entry")
      .set(await adminHeaders(app))
      .send({ date: "2026-06-15", staffId: "staff-missing", shiftIds: ["shift-a1"], note: "" })
      .expect(400);
    expect(response.body.message).toBe("人员不存在：staff-missing");
  });

  it("rejects non-empty schedule entries for disabled staff", async () => {
    const initialData = createSeedData();
    initialData.staff = initialData.staff.map((staff) =>
      staff.id === "staff-nurse-001" ? { ...staff, enabled: false } : staff
    );
    const app = createTestApp(initialData);
    const response = await request(app)
      .put("/api/data/schedule-entry")
      .set(await adminHeaders(app))
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" })
      .expect(400);
    expect(response.body.message).toBe("人员已停用，不能新增排班：李护士");
  });

  it("allows clearing existing schedule entries for disabled staff", async () => {
    const initialData = createSeedData();
    initialData.staff = initialData.staff.map((staff) =>
      staff.id === "staff-nurse-001" ? { ...staff, enabled: false } : staff
    );
    initialData.scheduleEntries = [
      {
        id: "2026-06-15__staff-nurse-001",
        date: "2026-06-15",
        staffId: "staff-nurse-001",
        shiftIds: ["shift-a1"],
        note: "historical"
      }
    ];
    const app = createTestApp(initialData);
    const response = await request(app)
      .put("/api/data/schedule-entry")
      .set(await adminHeaders(app))
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: [], note: "" })
      .expect(200);
    expect(response.body.scheduleEntries).toEqual([]);
  });

  it("rejects unknown shifts in schedule entries", async () => {
    const app = createTestApp();
    const response = await request(app)
      .put("/api/data/schedule-entry")
      .set(await adminHeaders(app))
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-missing"], note: "" })
      .expect(400);
    expect(response.body.message).toBe("班次不存在：shift-missing");
  });

  it("rejects disabled shifts in schedule entries", async () => {
    const initialData = createSeedData();
    initialData.shifts = initialData.shifts.map((shift) => (shift.id === "shift-a1" ? { ...shift, enabled: false } : shift));
    const app = createTestApp(initialData);
    const response = await request(app)
      .put("/api/data/schedule-entry")
      .set(await adminHeaders(app))
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" })
      .expect(400);
    expect(response.body.message).toBe("班次已禁用：A1组长");
  });

  it("rejects duplicate shifts in schedule entries", async () => {
    const app = createTestApp();
    const response = await request(app)
      .put("/api/data/schedule-entry")
      .set(await adminHeaders(app))
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1", "shift-a1"], note: "" })
      .expect(400);
    expect(response.body.message).toBe("同一天不能重复保存同一个班次");
  });

  it("rejects a third shift for the same person and date", async () => {
    const app = createTestApp();
    const response = await request(app)
      .put("/api/data/schedule-entry")
      .set(await adminHeaders(app))
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
    const app = createTestApp(initialData);
    const response = await request(app)
      .put("/api/data/schedule-entry")
      .set(await adminHeaders(app))
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: [], note: "" })
      .expect(200);
    expect(response.body.scheduleEntries).toEqual([]);
  });

  it("rejects malformed schedule-entry payloads", async () => {
    const app = createTestApp();
    const response = await request(app)
      .put("/api/data/schedule-entry")
      .set(await adminHeaders(app))
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", note: "" })
      .expect(400);
    expect(response.body.message).toBe("排班信息不完整");
  });

  it("rejects invalid schedule-entry note formats", async () => {
    const app = createTestApp();
    const response = await request(app)
      .put("/api/data/schedule-entry")
      .set(await adminHeaders(app))
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: 123 })
      .expect(400);
    expect(response.body.message).toBe("备注格式不正确");
  });

  it("rejects schedule entries with invalid dates", async () => {
    const app = createTestApp();
    const response = await request(app)
      .put("/api/data/schedule-entry")
      .set(await adminHeaders(app))
      .send({ date: "2026-02-30", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" })
      .expect(400);
    expect(response.body.message).toBe("日期格式不正确");
  });

  it("preserves both concurrent schedule-entry saves", async () => {
    let data = createSeedData();
    let updateQueue = Promise.resolve();
    let gateLoads = false;
    let concurrentSnapshot: AppData | null = null;
    const app = express();
    const storage = {
      async load() {
        if (!gateLoads) {
          return structuredClone(data);
        }

        concurrentSnapshot ??= structuredClone(data);
        await new Promise((resolve) => setTimeout(resolve, 20));
        return structuredClone(concurrentSnapshot);
      },
      async save(next: AppData) {
        data = structuredClone(next);
      },
      async update(mutate: (current: AppData) => AppData | Promise<AppData>) {
        const run = updateQueue.then(async () => {
          const nextData = await mutate(structuredClone(data));
          data = structuredClone(nextData);
          return data;
        });
        updateQueue = run.then(
          () => undefined,
          () => undefined
        );
        return run;
      }
    };
    app.use(express.json());
    app.use("/api", createRoutes(storage, { adminPassword: TEST_ADMIN_PASSWORD }));
    const headers = await adminHeaders(app);

    gateLoads = true;
    await Promise.all([
      request(app)
        .put("/api/data/schedule-entry")
        .set(headers)
        .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" })
        .expect(200),
      request(app)
        .put("/api/data/schedule-entry")
        .set(headers)
        .send({ date: "2026-06-16", staffId: "staff-clerk-001", shiftIds: ["shift-office"], note: "" })
        .expect(200)
    ]);

    gateLoads = false;
    const response = await request(app).get("/api/data").expect(200);
    expect(response.body.scheduleEntries.map((entry: { id: string }) => entry.id).sort()).toEqual([
      "2026-06-15__staff-nurse-001",
      "2026-06-16__staff-clerk-001"
    ]);
  });

  it("rejects malformed staff payloads", async () => {
    const app = createTestApp();
    const response = await request(app)
      .put("/api/data/staff/staff-bad")
      .set(await adminHeaders(app))
      .send({ name: "缺字段" })
      .expect(400);
    expect(response.body.message).toBe("人员信息不完整");
  });

  it.each([
    ["blank job ID", { jobId: "   " }],
    ["blank name", { name: "   " }],
    ["fractional sort order", { sortOrder: 1.5 }]
  ])("rejects invalid staff payload values: %s", async (_label, overrides) => {
    const app = createTestApp();
    const response = await request(app)
      .put("/api/data/staff/staff-bad")
      .set(await adminHeaders(app))
      .send(createStaffPayload(overrides))
      .expect(400);
    expect(response.body.message).toBe("人员信息不完整");
  });

  it("rejects malformed shift payloads", async () => {
    const app = createTestApp();
    const response = await request(app)
      .put("/api/data/shift/shift-bad")
      .set(await adminHeaders(app))
      .send({ name: "缺字段" })
      .expect(400);
    expect(response.body.message).toBe("班次信息不完整");
  });

  it.each([
    ["blank name", { name: "   " }],
    ["blank short name", { shortName: "   " }],
    ["invalid color", { color: "red" }],
    ["negative coefficient", { coefficient: -0.5 }],
    ["fractional sort order", { sortOrder: 1.5 }]
  ])("rejects invalid shift payload values: %s", async (_label, overrides) => {
    const app = createTestApp();
    const response = await request(app)
      .put("/api/data/shift/shift-bad")
      .set(await adminHeaders(app))
      .send(createShiftPayload(overrides))
      .expect(400);
    expect(response.body.message).toBe("班次信息不完整");
  });

  it("rejects malformed holiday payloads", async () => {
    const app = createTestApp();
    const response = await request(app)
      .put("/api/data/holiday/holiday-bad")
      .set(await adminHeaders(app))
      .send({ name: "缺字段" })
      .expect(400);
    expect(response.body.message).toBe("节假日信息不完整");
  });

  it("rejects blank holiday names", async () => {
    const app = createTestApp();
    const response = await request(app)
      .put("/api/data/holiday/holiday-bad")
      .set(await adminHeaders(app))
      .send(createHolidayPayload({ name: "   " }))
      .expect(400);
    expect(response.body.message).toBe("节假日信息不完整");
  });
});
