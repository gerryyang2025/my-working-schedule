import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "./client";
import type { ScheduleImportValidationError } from "@/lib/schedule-import";

describe("requestJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("preserves validation errors from non-OK JSON responses", async () => {
    const errors: ScheduleImportValidationError[] = [
      {
        scope: "cell",
        rowNumber: 3,
        columnLabel: "周一(7/20)",
        message: "第3行 周一(7/20) 班次不存在或未启用：夜班"
      }
    ];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "导入数据校验失败", errors }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestJson("/api/data/schedule-import", { method: "POST" })).rejects.toMatchObject({
      message: "导入数据校验失败",
      errors
    });
  });
});
