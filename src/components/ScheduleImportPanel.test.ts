import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScheduleImportPanel from "./ScheduleImportPanel.vue";
import type { PublicAppData } from "@/api/client";
import type { ScheduleImportPreview, ScheduleImportValidationError } from "@/lib/schedule-import";

const apiMocks = vi.hoisted(() => ({
  previewScheduleImport: vi.fn()
}));

vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()),
  previewScheduleImport: apiMocks.previewScheduleImport
}));

function data(): PublicAppData {
  return {
    staff: [{ id: "staff-head", jobId: "000228", name: "段鸿露", type: "head_nurse", isAdmin: true, enabled: true, sortOrder: 1 }],
    shifts: [
      { id: "shift-normal", name: "常", shortName: "常", color: "#16a34a", countsAttendance: true, coefficient: 1, enabled: true, sortOrder: 1 },
      { id: "shift-rest", name: "休息", shortName: "休", color: "#64748b", countsAttendance: false, coefficient: 0, enabled: true, sortOrder: 2 }
    ],
    holidays: [],
    scheduleEntries: [],
    monthlySettlements: [],
    settings: { defaultRequiredShiftsPerWeek: 5, version: 1 }
  };
}

const text = `当前排班周期为2026年7月20日（周一）至 7月26日（周日）：

姓名\t周一(7/20)\t周二(7/21)\t周三(7/22)\t周四(7/23)\t周五(7/24)\t周六(7/25)\t周日(7/26)
段鸿露\t常班\t常班\t常班\t常班\t常班\t休\t休`;

function serverPreview(overrides: Partial<ScheduleImportPreview> = {}): ScheduleImportPreview {
  return {
    ok: true,
    period: {
      start: "2026-07-20",
      end: "2026-07-26",
      weekNumber: 30,
      days: [
        {
          key: "2026-07-20",
          dayOfMonth: 20,
          weekday: 1,
          weekdayName: "周一",
          isWeekend: false,
          columnLabel: "周一(7/20)"
        }
      ]
    },
    rows: [
      {
        rowNumber: 3,
        staffId: "staff-server",
        staffName: "服务器人员",
        staffJobId: "server-job",
        staffType: "nurse",
        cells: [
          {
            date: "2026-07-20",
            columnLabel: "周一(7/20)",
            rawValue: "服务器班",
            shiftId: "shift-server",
            shiftName: "服务器班",
            shiftShortName: "服",
            shiftColor: "#0f766e",
            resolvedBy: "exact-name",
            aliasTarget: "",
            status: "import",
            existingShiftIds: [],
            existingShiftLabels: []
          }
        ]
      }
    ],
    summary: {
      staffCount: 1,
      importableCells: 3,
      skippedExistingCells: 2,
      aliasMappedCells: 1
    },
    noImportableCells: false,
    ...overrides
  };
}

describe("ScheduleImportPanel", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the required format example", () => {
    const wrapper = mount(ScheduleImportPanel, { props: { data: data(), saving: false } });

    expect(wrapper.text()).toContain("导入数据格式示例");
    expect(wrapper.text()).toContain("当前排班周期为2026年7月20日");
    const exampleTable = wrapper.get('[data-testid="schedule-import-example-table"]');
    expect(exampleTable.findAll("thead th").map((cell) => cell.text())).toEqual([
      "姓名",
      "周一(7/20)",
      "周二(7/21)",
      "周三(7/22)",
      "周四(7/23)",
      "周五(7/24)",
      "周六(7/25)",
      "周日(7/26)"
    ]);
    expect(exampleTable.find("tbody").text()).toContain("段鸿露");
    expect(exampleTable.find("tbody").text()).toContain("常班");
  });

  it("shows an AI prompt for generating import data from a schedule image", () => {
    const wrapper = mount(ScheduleImportPanel, { props: { data: data(), saving: false } });

    expect(wrapper.get('[data-testid="schedule-import-ai-prompt"]').text()).toContain("DeepSeek");
    expect(wrapper.get('[data-testid="schedule-import-ai-prompt"]').text()).toContain("上传排班图片");
    expect(wrapper.get('[data-testid="schedule-import-ai-prompt-text"]').text()).toContain("请提取上传图片中的排班表信息");
    expect(wrapper.get('[data-testid="schedule-import-ai-prompt-text"]').text()).toContain("忽略工号列");
    const copyButton = wrapper.get('[data-testid="schedule-import-ai-prompt-copy"]');
    expect(copyButton.text()).toContain("复制 AI 提示词");
    expect(copyButton.attributes("aria-label")).toBe("复制 AI 识别提示词");
  });

  it("validates pasted text and renders preview with derived job ID", async () => {
    apiMocks.previewScheduleImport.mockResolvedValue({ preview: serverPreview() });
    const wrapper = mount(ScheduleImportPanel, { props: { data: data(), saving: false } });

    await wrapper.get('[data-testid="schedule-import-input"]').setValue(text);
    await wrapper.get('[data-testid="schedule-import-validate"]').trigger("click");
    await flushPromises();

    expect(apiMocks.previewScheduleImport).toHaveBeenCalledWith(text);
    expect(wrapper.get('[data-testid="schedule-import-period"]').text()).toContain("第30周 2026-07-20 至 2026-07-26");
    expect(wrapper.get('[data-testid="schedule-import-summary"]').text()).toContain("待导入 3 个");
    expect(wrapper.text()).toContain("服务器人员");
    expect(wrapper.text()).toContain("server-job");
    expect(wrapper.text()).toContain("服务器班 → 服");
  });

  it("shows validation errors and does not emit confirm", async () => {
    const errors: ScheduleImportValidationError[] = [{ scope: "row", rowNumber: 3, message: "服务器返回的人员错误" }];
    apiMocks.previewScheduleImport.mockRejectedValue(Object.assign(new Error("导入数据校验失败"), { errors }));
    const wrapper = mount(ScheduleImportPanel, { props: { data: data(), saving: false } });

    await wrapper.get('[data-testid="schedule-import-input"]').setValue(text);
    await wrapper.get('[data-testid="schedule-import-validate"]').trigger("click");
    await flushPromises();

    expect(apiMocks.previewScheduleImport).toHaveBeenCalledWith(text);
    expect(wrapper.get('[data-testid="schedule-import-errors"]').text()).toContain("服务器返回的人员错误");
    expect(wrapper.find('[data-testid="schedule-import-confirm"]').exists()).toBe(false);
    expect(wrapper.emitted("confirmImport")).toBeUndefined();
  });

  it("disables confirmation when validation has no importable cells", async () => {
    apiMocks.previewScheduleImport.mockResolvedValue({
      preview: serverPreview({
        summary: {
          staffCount: 1,
          importableCells: 0,
          skippedExistingCells: 7,
          aliasMappedCells: 0
        },
        noImportableCells: true
      })
    });
    const wrapper = mount(ScheduleImportPanel, { props: { data: data(), saving: false } });

    await wrapper.get('[data-testid="schedule-import-input"]').setValue(text);
    await wrapper.get('[data-testid="schedule-import-validate"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-testid="schedule-import-noop"]').text()).toContain("没有可导入内容");
    expect(wrapper.get<HTMLButtonElement>('[data-testid="schedule-import-confirm"]').element.disabled).toBe(true);
  });

  it("emits the current raw text after successful preview confirmation", async () => {
    apiMocks.previewScheduleImport.mockResolvedValue({ preview: serverPreview() });
    const wrapper = mount(ScheduleImportPanel, { props: { data: data(), saving: false } });

    await wrapper.get('[data-testid="schedule-import-input"]').setValue(text);
    await wrapper.get('[data-testid="schedule-import-validate"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="schedule-import-confirm"]').trigger("click");

    expect(wrapper.emitted("confirmImport")).toEqual([[text]]);
  });
});
