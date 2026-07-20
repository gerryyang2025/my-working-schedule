import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ScheduleImportPanel from "./ScheduleImportPanel.vue";
import type { PublicAppData } from "@/api/client";

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

describe("ScheduleImportPanel", () => {
  it("shows the required format example", () => {
    const wrapper = mount(ScheduleImportPanel, { props: { data: data(), saving: false } });

    expect(wrapper.text()).toContain("导入数据格式示例");
    expect(wrapper.text()).toContain("当前排班周期为2026年7月20日");
    expect(wrapper.text()).toContain("姓名");
    expect(wrapper.text()).toContain("周一(7/20)");
  });

  it("validates pasted text and renders preview with derived job ID", async () => {
    const wrapper = mount(ScheduleImportPanel, { props: { data: data(), saving: false } });

    await wrapper.get('[data-testid="schedule-import-input"]').setValue(text);
    await wrapper.get('[data-testid="schedule-import-validate"]').trigger("click");

    expect(wrapper.get('[data-testid="schedule-import-period"]').text()).toContain("第30周 2026-07-20 至 2026-07-26");
    expect(wrapper.get('[data-testid="schedule-import-summary"]').text()).toContain("待导入 7 个");
    expect(wrapper.text()).toContain("段鸿露");
    expect(wrapper.text()).toContain("000228");
    expect(wrapper.text()).toContain("常班 → 常");
  });

  it("shows validation errors and does not emit confirm", async () => {
    const wrapper = mount(ScheduleImportPanel, { props: { data: data(), saving: false } });

    await wrapper.get('[data-testid="schedule-import-input"]').setValue(text.replace("段鸿露", "不存在"));
    await wrapper.get('[data-testid="schedule-import-validate"]').trigger("click");

    expect(wrapper.get('[data-testid="schedule-import-errors"]').text()).toContain("第3行人员不存在或未启用：不存在");
    expect(wrapper.find('[data-testid="schedule-import-confirm"]').exists()).toBe(false);
    expect(wrapper.emitted("confirmImport")).toBeUndefined();
  });

  it("disables confirmation when validation has no importable cells", async () => {
    const existingData = data();
    existingData.scheduleEntries = [
      { id: "2026-07-20__staff-head", date: "2026-07-20", staffId: "staff-head", shiftIds: ["shift-normal"], note: "" },
      { id: "2026-07-21__staff-head", date: "2026-07-21", staffId: "staff-head", shiftIds: ["shift-normal"], note: "" },
      { id: "2026-07-22__staff-head", date: "2026-07-22", staffId: "staff-head", shiftIds: ["shift-normal"], note: "" },
      { id: "2026-07-23__staff-head", date: "2026-07-23", staffId: "staff-head", shiftIds: ["shift-normal"], note: "" },
      { id: "2026-07-24__staff-head", date: "2026-07-24", staffId: "staff-head", shiftIds: ["shift-normal"], note: "" },
      { id: "2026-07-25__staff-head", date: "2026-07-25", staffId: "staff-head", shiftIds: ["shift-rest"], note: "" },
      { id: "2026-07-26__staff-head", date: "2026-07-26", staffId: "staff-head", shiftIds: ["shift-rest"], note: "" }
    ];
    const wrapper = mount(ScheduleImportPanel, { props: { data: existingData, saving: false } });

    await wrapper.get('[data-testid="schedule-import-input"]').setValue(text);
    await wrapper.get('[data-testid="schedule-import-validate"]').trigger("click");

    expect(wrapper.get('[data-testid="schedule-import-noop"]').text()).toContain("没有可导入内容");
    expect(wrapper.get<HTMLButtonElement>('[data-testid="schedule-import-confirm"]').element.disabled).toBe(true);
  });

  it("emits the current raw text after successful preview confirmation", async () => {
    const wrapper = mount(ScheduleImportPanel, { props: { data: data(), saving: false } });

    await wrapper.get('[data-testid="schedule-import-input"]').setValue(text);
    await wrapper.get('[data-testid="schedule-import-validate"]').trigger("click");
    await wrapper.get('[data-testid="schedule-import-confirm"]').trigger("click");

    expect(wrapper.emitted("confirmImport")).toEqual([[text]]);
  });
});
