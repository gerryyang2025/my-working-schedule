import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { AppData } from "../src/types/domain";
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

  it("rejects data writes without admin mode", async () => {
    await request(createTestApp())
      .put("/api/data/schedule-entry")
      .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" })
      .expect(401);
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
});
