import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import App from "./App.vue";
import type { PublicAppData } from "@/api/client";

const apiMocks = vi.hoisted(() => ({
  deleteHoliday: vi.fn(),
  enterAdminMode: vi.fn(),
  loadData: vi.fn(),
  saveHoliday: vi.fn(),
  saveScheduleEntry: vi.fn(),
  saveShift: vi.fn(),
  saveStaff: vi.fn()
}));

vi.mock("@/api/client", () => apiMocks);

const testData: PublicAppData = {
  staff: [
    {
      id: "staff-nurse-001",
      jobId: "100001",
      name: "李护士",
      type: "nurse",
      isAdmin: false,
      enabled: true,
      sortOrder: 1
    }
  ],
  shifts: [
    {
      id: "shift-a1",
      name: "A1组长",
      shortName: "A1",
      color: "#2563EB",
      countsAttendance: true,
      coefficient: 1.5,
      enabled: true,
      sortOrder: 1
    }
  ],
  holidays: [],
  scheduleEntries: [],
  settings: {
    defaultRequiredShiftsPerWeek: 5,
    version: 1
  }
};

const AppToolbarStub = defineComponent({
  name: "AppToolbar",
  props: ["selectedDate", "adminMode"],
  emits: ["update:selectedDate", "enterAdmin"],
  template: `
    <section>
      <button data-testid="admin-button" type="button" @click="$emit('enterAdmin')">
        {{ adminMode ? "编辑模式" : "输入管理密码" }}
      </button>
      <button data-testid="jump-date" type="button" @click="$emit('update:selectedDate', '2026-07-01')">
        jump
      </button>
    </section>
  `
});

const ScheduleGridStub = defineComponent({
  name: "ScheduleGrid",
  props: ["days"],
  template: '<section data-testid="schedule-grid">{{ days.map((day) => day.key).join(",") }}</section>'
});

const EmptyStub = defineComponent({
  template: "<section />"
});

const ElDialogStub = defineComponent({
  name: "ElDialog",
  props: ["modelValue", "title"],
  emits: ["update:modelValue"],
  template: '<section v-if="modelValue" class="admin-login-dialog"><h2>{{ title }}</h2><slot /><slot name="footer" /></section>'
});

const ElInputStub = defineComponent({
  name: "ElInput",
  props: ["modelValue", "placeholder", "type", "disabled"],
  emits: ["update:modelValue"],
  template: '<input data-testid="admin-password-input" :type="type" :placeholder="placeholder" :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />'
});

const ElButtonStub = defineComponent({
  name: "ElButton",
  props: ["type", "disabled", "loading"],
  template: '<button type="button" :disabled="disabled" v-bind="$attrs"><slot /></button>'
});

function mountApp() {
  apiMocks.loadData.mockResolvedValue(structuredClone(testData));

  return mount(App, {
    global: {
      stubs: {
        AppToolbar: AppToolbarStub,
        CellEditorDialog: EmptyStub,
        ElButton: ElButtonStub,
        ElDialog: ElDialogStub,
        ElInput: ElInputStub,
        ManagementDrawer: EmptyStub,
        PrintViews: EmptyStub,
        ScheduleGrid: ScheduleGridStub,
        ShiftPalette: EmptyStub,
        WeeklySummary: EmptyStub
      }
    }
  });
}

describe("App", () => {
  it("renders concise usage and calculation guidance below the title", async () => {
    const wrapper = mountApp();

    await flushPromises();

    const infoPanel = wrapper.get(".app-info-panel");
    expect(infoPanel.text()).toContain("快速上手");
    expect(infoPanel.text()).toContain("选择日期查看所在周");
    expect(infoPanel.text()).toContain("点击格子快速排班");
    expect(infoPanel.text()).toContain("核算规则");
    expect(infoPanel.text()).toContain("按班次而不是自然日计出勤");
    expect(infoPanel.text()).toContain("加班 = max(0, 出勤班次 - 满勤标准)");
    expect(infoPanel.text()).toContain("护士长绩效系数单独核算");
  });

  it("uses an in-page password dialog and shows clear feedback after entering admin mode", async () => {
    apiMocks.enterAdminMode.mockResolvedValue(undefined);
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("legacy-password");
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="admin-button"]').trigger("click");
    await nextTick();

    expect(promptSpy).not.toHaveBeenCalled();
    expect(wrapper.get(".admin-login-dialog").text()).toContain("进入编辑模式");

    await wrapper.get('[data-testid="admin-password-input"]').setValue("admin-password");
    await wrapper.get('[data-testid="admin-submit-button"]').trigger("click");
    await flushPromises();

    expect(apiMocks.enterAdminMode).toHaveBeenCalledWith("admin-password");
    expect(wrapper.get(".admin-mode-banner").text()).toContain("编辑模式已开启");
    expect(wrapper.get('[data-testid="admin-button"]').text()).toContain("编辑模式");
    expect(wrapper.find(".admin-login-dialog").exists()).toBe(false);

    promptSpy.mockRestore();
  });

  it("passes only the selected natural week to the schedule grid", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17));
    const wrapper = mountApp();

    await flushPromises();

    expect(wrapper.get('[data-testid="schedule-grid"]').text()).toBe(
      "2026-06-15,2026-06-16,2026-06-17,2026-06-18,2026-06-19,2026-06-20,2026-06-21"
    );
    vi.useRealTimers();
  });

  it("updates the schedule grid to the week containing the selected date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17));
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="jump-date"]').trigger("click");
    await nextTick();

    expect(wrapper.get('[data-testid="schedule-grid"]').text()).toBe(
      "2026-06-29,2026-06-30,2026-07-01,2026-07-02,2026-07-03,2026-07-04,2026-07-05"
    );
    vi.useRealTimers();
  });
});
