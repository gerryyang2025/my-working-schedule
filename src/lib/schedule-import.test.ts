import { describe, expect, it } from "vitest";
import type { AppData } from "@/types/domain";
import {
  applyScheduleImportPreview,
  validateScheduleImportText,
  type ScheduleImportPreview
} from "./schedule-import";

function baseData(overrides: Partial<AppData> = {}): AppData {
  return {
    staff: [
      { id: "staff-head", jobId: "000228", name: "段鸿露", type: "head_nurse", isAdmin: true, enabled: true, sortOrder: 1 },
      { id: "staff-nurse", jobId: "001351", name: "张曼曼", type: "nurse", isAdmin: false, enabled: true, sortOrder: 2 },
      { id: "staff-disabled", jobId: "009999", name: "停用人员", type: "nurse", isAdmin: false, enabled: false, sortOrder: 3 }
    ],
    shifts: [
      { id: "shift-normal", name: "常", shortName: "常", color: "#16a34a", countsAttendance: true, coefficient: 1, enabled: true, sortOrder: 1 },
      { id: "shift-rest", name: "休息", shortName: "休", color: "#64748b", countsAttendance: false, coefficient: 0, enabled: true, sortOrder: 2 },
      { id: "shift-n1", name: "N1", shortName: "N1", color: "#dc2626", countsAttendance: true, coefficient: 1.3, enabled: true, sortOrder: 3 },
      { id: "shift-p3", name: "P3", shortName: "P3", color: "#0f766e", countsAttendance: true, coefficient: 1.2, enabled: true, sortOrder: 4 },
      { id: "shift-a4", name: "A4", shortName: "A4", color: "#2563eb", countsAttendance: true, coefficient: 1.2, enabled: true, sortOrder: 5 },
      { id: "shift-slash", name: "/", shortName: "/", color: "#6b7280", countsAttendance: false, coefficient: 0, enabled: true, sortOrder: 6 }
    ],
    holidays: [],
    scheduleEntries: [],
    monthlySettlements: [],
    settings: { defaultRequiredShiftsPerWeek: 5, version: 1 },
    ...overrides
  };
}

const validText = `当前排班周期为2026年7月20日（周一）至 7月26日（周日）：

姓名\t周一(7/20)\t周二(7/21)\t周三(7/22)\t周四(7/23)\t周五(7/24)\t周六(7/25)\t周日(7/26)
段鸿露\t常班\t常班\t常班\t常班\t常班\t休\t休
张曼曼\tN1\t/\t休\tP3\tA4\tA4\tN1`;

function expectPreview(result: ReturnType<typeof validateScheduleImportText>): ScheduleImportPreview {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected import preview");
  }
  return result;
}

function messages(result: ReturnType<typeof validateScheduleImportText>): string[] {
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.errors.map((error) => error.message);
}

describe("validateScheduleImportText", () => {
  it("parses the standard weekly import text and resolves staff, job IDs, shifts, and aliases", () => {
    const preview = expectPreview(validateScheduleImportText({ rawText: validText, data: baseData() }));

    expect(preview.period).toMatchObject({
      start: "2026-07-20",
      end: "2026-07-26",
      weekNumber: 30
    });
    expect(preview.rows).toHaveLength(2);
    expect(preview.rows[0]).toMatchObject({
      staffId: "staff-head",
      staffName: "段鸿露",
      staffJobId: "000228",
      staffType: "head_nurse"
    });
    expect(preview.rows[0].cells[0]).toMatchObject({
      date: "2026-07-20",
      rawValue: "常班",
      shiftId: "shift-normal",
      resolvedBy: "alias",
      aliasTarget: "常",
      status: "import"
    });
    expect(preview.rows[1].cells[1]).toMatchObject({
      rawValue: "/",
      shiftId: "shift-slash",
      resolvedBy: "exact-name",
      status: "import"
    });
    expect(preview.summary).toEqual({
      staffCount: 2,
      importableCells: 14,
      skippedExistingCells: 0,
      aliasMappedCells: 5
    });
  });

  it("rejects malformed or inconsistent period and header data", () => {
    const text = validText.replace("2026年7月20日（周一）", "2026年7月21日（周一）");
    const result = validateScheduleImportText({ rawText: text, data: baseData() });

    expect(messages(result)).toContain("周期开始日期与星期不一致：2026-07-21 不是周一");
  });

  it("rejects unknown, disabled, duplicated imported, and ambiguous system staff names", () => {
    const unknown = validateScheduleImportText({
      rawText: validText.replace("张曼曼", "不存在"),
      data: baseData()
    });
    expect(messages(unknown)).toContain("第4行人员不存在或未启用：不存在");

    const disabled = validateScheduleImportText({
      rawText: validText.replace("张曼曼", "停用人员"),
      data: baseData()
    });
    expect(messages(disabled)).toContain("第4行人员不存在或未启用：停用人员");

    const duplicatedImport = validateScheduleImportText({
      rawText: `${validText}\n张曼曼\tN1\t/\t休\tP3\tA4\tA4\tN1`,
      data: baseData()
    });
    expect(messages(duplicatedImport)).toContain("导入数据中人员重复：张曼曼");

    const ambiguousSystem = validateScheduleImportText({
      rawText: validText,
      data: baseData({
        staff: [
          ...baseData().staff,
          { id: "staff-duplicate", jobId: "008888", name: "张曼曼", type: "nurse", isAdmin: false, enabled: true, sortOrder: 4 }
        ]
      })
    });
    expect(messages(ambiguousSystem)).toContain("系统中存在重复启用人员姓名：张曼曼");
  });

  it("rejects unknown and disabled shift values and treats empty cells as errors", () => {
    const unknown = validateScheduleImportText({
      rawText: validText.replace("P3", "未知班次"),
      data: baseData()
    });
    expect(messages(unknown)).toContain("第4行 周四(7/23) 班次不存在或未启用：未知班次");

    const disabled = validateScheduleImportText({
      rawText: validText.replace("P3", "办公"),
      data: baseData({
        shifts: [
          ...baseData().shifts,
          { id: "shift-office", name: "办公", shortName: "办公", color: "#0891b2", countsAttendance: true, coefficient: 1, enabled: false, sortOrder: 7 }
        ]
      })
    });
    expect(messages(disabled)).toContain("第4行 周四(7/23) 班次不存在或未启用：办公");

    const emptyCell = validateScheduleImportText({
      rawText: validText.replace("张曼曼\tN1", "张曼曼\t"),
      data: baseData()
    });
    expect(messages(emptyCell)).toContain("第4行 周一(7/20) 班次不能为空");
  });

  it("rejects missing or extra table columns", () => {
    const missing = validateScheduleImportText({
      rawText: validText.replace("\t周日(7/26)", ""),
      data: baseData()
    });
    expect(messages(missing)).toContain("表头列数不正确，应为 8 列");

    const extra = validateScheduleImportText({
      rawText: validText.replace("周日(7/26)", "周日(7/26)\t多余列"),
      data: baseData()
    });
    expect(messages(extra)).toContain("表头列数不正确，应为 8 列");
  });

  it("rejects empty input and non-week ranges", () => {
    expect(messages(validateScheduleImportText({ rawText: "", data: baseData() }))).toContain("导入内容不能为空");

    const nonWeek = validText.replace("7月26日（周日）", "7月27日（周一）");
    expect(messages(validateScheduleImportText({ rawText: nonWeek, data: baseData() }))).toContain(
      "排班周期必须为周一至周日的 7 天"
    );
  });

  it("marks existing entries as skipped and reports no-op previews", () => {
    const oneExisting = validateScheduleImportText({
      rawText: validText,
      data: baseData({
        scheduleEntries: [
          { id: "2026-07-20__staff-head", date: "2026-07-20", staffId: "staff-head", shiftIds: ["shift-rest"], note: "" }
        ]
      })
    });
    const preview = expectPreview(oneExisting);
    expect(preview.rows[0].cells[0]).toMatchObject({ status: "skip-existing", existingShiftIds: ["shift-rest"] });
    expect(preview.summary.importableCells).toBe(13);
    expect(preview.summary.skippedExistingCells).toBe(1);

    const entries = preview.rows.flatMap((row) =>
      row.cells.map((cell) => ({
        id: `${cell.date}__${row.staffId}`,
        date: cell.date,
        staffId: row.staffId,
        shiftIds: [cell.shiftId],
        note: ""
      }))
    );
    const noOp = expectPreview(validateScheduleImportText({ rawText: validText, data: baseData({ scheduleEntries: entries }) }));
    expect(noOp.summary.importableCells).toBe(0);
    expect(noOp.noImportableCells).toBe(true);
  });

  it("treats empty existing entries as importable placeholders", () => {
    const result = validateScheduleImportText({
      rawText: validText,
      data: baseData({
        scheduleEntries: [
          { id: "2026-07-20__staff-head", date: "2026-07-20", staffId: "staff-head", shiftIds: [], note: "" }
        ]
      })
    });

    const preview = expectPreview(result);
    expect(preview.rows[0].cells[0]).toMatchObject({
      status: "import",
      existingShiftIds: [],
      existingShiftLabels: []
    });
    expect(preview.summary.importableCells).toBe(14);
    expect(preview.summary.skippedExistingCells).toBe(0);
  });

  it("treats note-only existing entries as occupied", () => {
    const result = validateScheduleImportText({
      rawText: validText,
      data: baseData({
        scheduleEntries: [
          { id: "2026-07-20__staff-head", date: "2026-07-20", staffId: "staff-head", shiftIds: [], note: "已手动备注" }
        ]
      })
    });

    const preview = expectPreview(result);
    expect(preview.rows[0].cells[0]).toMatchObject({
      status: "skip-existing",
      existingShiftIds: [],
      existingShiftLabels: []
    });
    expect(preview.summary.importableCells).toBe(13);
    expect(preview.summary.skippedExistingCells).toBe(1);
  });

  it("rejects imports into settled months", () => {
    const result = validateScheduleImportText({
      rawText: validText,
      data: baseData({
        monthlySettlements: [
          {
            id: "settlement-2026-07",
            month: "2026-07",
            monthStart: "2026-07-01",
            monthEnd: "2026-07-31",
            totalDays: 31,
            bonusPool: 0,
            coefficientTotal: 0,
            settledAt: "2026-08-01T00:00:00.000Z",
            rows: []
          }
        ]
      })
    });

    expect(messages(result)).toContain("2026-07 已月结，不能导入排班");
  });
});

describe("applyScheduleImportPreview", () => {
  it("adds only importable entries and preserves skipped existing entries", () => {
    const data = baseData({
      scheduleEntries: [
        { id: "2026-07-20__staff-head", date: "2026-07-20", staffId: "staff-head", shiftIds: ["shift-rest"], note: "" }
      ]
    });
    const preview = expectPreview(validateScheduleImportText({ rawText: validText, data }));

    const result = applyScheduleImportPreview(data, preview);

    expect(result.imported).toBe(13);
    expect(result.skipped).toBe(1);
    expect(result.data.scheduleEntries).toEqual(
      expect.arrayContaining([
        { id: "2026-07-20__staff-head", date: "2026-07-20", staffId: "staff-head", shiftIds: ["shift-rest"], note: "" },
        { id: "2026-07-21__staff-head", date: "2026-07-21", staffId: "staff-head", shiftIds: ["shift-normal"], note: "" },
        { id: "2026-07-21__staff-nurse", date: "2026-07-21", staffId: "staff-nurse", shiftIds: ["shift-slash"], note: "" }
      ])
    );
  });

  it("replaces apply-time empty placeholders with imported entries", () => {
    const preview = expectPreview(validateScheduleImportText({ rawText: validText, data: baseData() }));
    const result = applyScheduleImportPreview(
      baseData({
        scheduleEntries: [
          { id: "2026-07-20__staff-head", date: "2026-07-20", staffId: "staff-head", shiftIds: [], note: "" }
        ]
      }),
      preview
    );

    expect(result.imported).toBe(14);
    expect(result.skipped).toBe(0);
    expect(result.data.scheduleEntries.filter((entry) => entry.id === "2026-07-20__staff-head")).toHaveLength(1);
    expect(result.data.scheduleEntries).toContainEqual({
      id: "2026-07-20__staff-head",
      date: "2026-07-20",
      staffId: "staff-head",
      shiftIds: ["shift-normal"],
      note: ""
    });
  });
});
