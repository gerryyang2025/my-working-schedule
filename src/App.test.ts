import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, nextTick, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App.vue";
import type { PublicAppData } from "@/api/client";

const apiMocks = vi.hoisted(() => ({
  deleteHoliday: vi.fn(),
  deleteMonthlySettlement: vi.fn(),
  enterAdminMode: vi.fn(),
  loadData: vi.fn(),
  saveHoliday: vi.fn(),
  saveMonthlySettlement: vi.fn(),
  saveScheduleEntry: vi.fn(),
  saveShift: vi.fn(),
  saveStaff: vi.fn()
}));

const pdfMocks = vi.hoisted(() => ({
  createPrintPdfFile: vi.fn()
}));

const elementPlusMocks = vi.hoisted(() => ({
  ElMessage: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  },
  ElMessageBox: {
    confirm: vi.fn()
  }
}));

vi.mock("@/api/client", () => apiMocks);
vi.mock("element-plus", () => elementPlusMocks);
vi.mock("@/lib/print-pdf", () => pdfMocks);

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
    },
    {
      id: "shift-rest",
      name: "休息",
      shortName: "休",
      color: "#64748B",
      countsAttendance: false,
      coefficient: 0,
      enabled: true,
      sortOrder: 2
    }
  ],
  holidays: [],
  scheduleEntries: [],
  monthlySettlements: [],
  settings: {
    defaultRequiredShiftsPerWeek: 5,
    version: 1
  }
};

const AppToolbarStub = defineComponent({
  name: "AppToolbar",
  props: ["selectedDate", "adminMode"],
  emits: ["update:selectedDate", "enterAdmin", "printMonth", "printWeek"],
  template: `
    <section>
      <button data-testid="admin-button" type="button" @click="$emit('enterAdmin')">
        {{ adminMode ? "编辑模式" : "输入管理密码" }}
      </button>
      <button data-testid="jump-date" type="button" @click="$emit('update:selectedDate', '2026-07-01')">
        jump
      </button>
      <button data-testid="jump-same-month-date" type="button" @click="$emit('update:selectedDate', '2026-06-20')">
        jump same month
      </button>
      <button data-testid="print-week" type="button" @click="$emit('printWeek')">
        打印周表
      </button>
      <button data-testid="print-month" type="button" @click="$emit('printMonth')">
        打印月表
      </button>
    </section>
  `
});

const ScheduleGridStub = defineComponent({
  name: "ScheduleGrid",
  props: ["days"],
  template: '<section data-testid="schedule-grid">{{ days.map((day) => day.key).join(",") }}</section>'
});

const WeeklySummaryStub = defineComponent({
  name: "WeeklySummary",
  props: ["summary"],
  template: '<section data-testid="weekly-summary">{{ summary.weekStart }}-{{ summary.weekEnd }}</section>'
});

const EmptyStub = defineComponent({
  template: "<section />"
});

const PrintViewsStub = defineComponent({
  name: "PrintViews",
  props: ["monthlySummary", "monthlySettlement", "previewMode"],
  template: `
    <section class="print-views-stub">
      <div v-if="previewMode === 'week'" class="print-preview-active">周表预览</div>
      <div v-if="previewMode === 'month'" class="print-preview-active">
        月表预览
        <span v-if="monthlySummary">
          月度汇总 {{ monthlySummary.rows.map((row) => [row.staffName, row.attendanceShifts, row.coefficientTotal === null ? row.coefficientExcludedReason : row.coefficientTotal.toFixed(2)].join(":")).join("|") }}
        </span>
      </div>
      <span v-if="monthlySettlement" data-testid="print-monthly-settlement">
        月结 {{ monthlySettlement.month }} {{ monthlySettlement.bonusPool.toFixed(2) }}
      </span>
    </section>
  `
});

const BonusSettlementPanelStub = defineComponent({
  name: "BonusSettlementPanel",
  props: ["month", "monthlySummary", "settlement", "startMonth", "endMonth", "isRangeMode", "isRangeValid", "sourceMonths"],
  emits: ["confirmSettlement", "cancelSettlement", "update:startMonth", "update:endMonth"],
  setup() {
    return { draftBonusPool: ref("") };
  },
  template: `
    <section data-testid="bonus-panel">
      <span data-testid="bonus-month">{{ month }}</span>
      <span data-testid="bonus-range">{{ startMonth }}-{{ endMonth }} {{ isRangeMode ? "range" : "single" }}</span>
      <span data-testid="bonus-range-valid">{{ isRangeValid ? "valid" : "invalid" }}</span>
      <span data-testid="bonus-status">{{ settlement ? "已月结" : "未月结" }}</span>
      <span data-testid="bonus-summary">
        {{ monthlySummary.rows.map((row) => [row.staffName, row.attendanceShifts, row.coefficientTotal === null ? "null" : row.coefficientTotal.toFixed(2)].join(":")).join("|") }}
      </span>
      <input data-testid="bonus-draft-input" v-model="draftBonusPool" />
      <button data-testid="set-start-may" type="button" @click="$emit('update:startMonth', '2026-05')">set start may</button>
      <button data-testid="set-end-may" type="button" @click="$emit('update:endMonth', '2026-05')">set end may</button>
      <button data-testid="set-start-august" type="button" @click="$emit('update:startMonth', '2026-08')">set start august</button>
      <button data-testid="set-end-july" type="button" @click="$emit('update:endMonth', '2026-07')">set july</button>
      <button data-testid="confirm-settlement" type="button" @click="$emit('confirmSettlement', { month, bonusPool: 1000 })">confirm</button>
      <button data-testid="cancel-settlement" type="button" @click="$emit('cancelSettlement', month)">cancel</button>
    </section>
  `
});

const ElDialogStub = defineComponent({
  name: "ElDialog",
  props: ["modelValue", "title"],
  emits: ["update:modelValue"],
  template: '<section v-if="modelValue" class="el-dialog-stub"><h2>{{ title }}</h2><slot /><slot name="footer" /></section>'
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

function mountApp(appData: PublicAppData = testData) {
  apiMocks.loadData.mockResolvedValue(structuredClone(appData));

  return mount(App, {
    global: {
      stubs: {
        AppToolbar: AppToolbarStub,
        BonusSettlementPanel: BonusSettlementPanelStub,
        CellEditorDialog: EmptyStub,
        ElButton: ElButtonStub,
        ElDialog: ElDialogStub,
        ElInput: ElInputStub,
        ManagementDrawer: EmptyStub,
        PrintViews: PrintViewsStub,
        ScheduleGrid: ScheduleGridStub,
        ShiftPalette: EmptyStub,
        WeeklySummary: WeeklySummaryStub
      }
    }
  });
}

async function enterAdminModeForTest(wrapper: ReturnType<typeof mountApp>) {
  apiMocks.enterAdminMode.mockResolvedValue(undefined);

  await wrapper.get('[data-testid="admin-button"]').trigger("click");
  await nextTick();
  await wrapper.get('[data-testid="admin-password-input"]').setValue("admin-password");
  await wrapper.get('[data-testid="admin-submit-button"]').trigger("click");
  await flushPromises();
}

async function openBonusTab(wrapper: ReturnType<typeof mountApp>) {
  await wrapper.get('[data-testid="workbench-tab-bonus"]').trigger("click");
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function mockMobileViewport(matches = true): () => void {
  const originalMatchMedia = window.matchMedia;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });

  return () => {
    if (originalMatchMedia) {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: originalMatchMedia
      });
      return;
    }

    Reflect.deleteProperty(window, "matchMedia");
  };
}

function mockSystemPrint(): { printSpy: ReturnType<typeof vi.fn>; restore: () => void } {
  const originalPrint = window.print;
  const printSpy = vi.fn();

  Object.defineProperty(window, "print", {
    configurable: true,
    writable: true,
    value: printSpy
  });

  return {
    printSpy,
    restore: () => {
      Object.defineProperty(window, "print", {
        configurable: true,
        writable: true,
        value: originalPrint
      });
    }
  };
}

function mockNavigatorFileShare(canShareResult: boolean): {
  canShareSpy: ReturnType<typeof vi.fn>;
  restore: () => void;
  shareSpy: ReturnType<typeof vi.fn>;
} {
  const originalCanShare = "canShare" in navigator ? navigator.canShare : undefined;
  const originalShare = "share" in navigator ? navigator.share : undefined;
  const canShareSpy = vi.fn(() => canShareResult);
  const shareSpy = vi.fn().mockResolvedValue(undefined);

  Object.defineProperty(navigator, "canShare", {
    configurable: true,
    value: canShareSpy
  });
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: shareSpy
  });

  return {
    canShareSpy,
    restore: () => {
      if (originalCanShare) {
        Object.defineProperty(navigator, "canShare", { configurable: true, value: originalCanShare });
      } else {
        Reflect.deleteProperty(navigator, "canShare");
      }

      if (originalShare) {
        Object.defineProperty(navigator, "share", { configurable: true, value: originalShare });
      } else {
        Reflect.deleteProperty(navigator, "share");
      }
    },
    shareSpy
  };
}

function mockPdfDownloadUrl(): { createObjectUrlSpy: ReturnType<typeof vi.fn>; restore: () => void } {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const createObjectUrlSpy = vi.fn(() => "blob:print-pdf");
  const revokeObjectUrlSpy = vi.fn();

  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectUrlSpy
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectUrlSpy
  });

  return {
    createObjectUrlSpy,
    restore: () => {
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL });
    }
  };
}

function expectPanelVisible(wrapper: ReturnType<typeof mountApp>, testId: string) {
  expect(wrapper.get(`[data-testid="${testId}"]`).attributes("style") ?? "").not.toContain("display: none");
}

function expectPanelHidden(wrapper: ReturnType<typeof mountApp>, testId: string) {
  expect(wrapper.get(`[data-testid="${testId}"]`).attributes("style") ?? "").toContain("display: none");
}

describe("App", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    delete document.body.dataset.printMode;
  });

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
    expect(infoPanel.text()).toContain("班次系数");
    expect(infoPanel.text()).toContain("A1组长 1.50");
    expect(infoPanel.text()).toContain("休息 不计出勤");
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

  it("shows scheduling content by default and switches workbench tabs without changing the selected date", async () => {
    const wrapper = mountApp();

    await flushPromises();

    expect(wrapper.get('[data-testid="workbench-tab-schedule"]').classes()).toContain("active");
    expectPanelVisible(wrapper, "workbench-panel-schedule");
    expectPanelHidden(wrapper, "workbench-panel-weekly");

    await wrapper.get('[data-testid="jump-date"]').trigger("click");
    await wrapper.get('[data-testid="workbench-tab-weekly"]').trigger("click");
    await nextTick();

    expectPanelVisible(wrapper, "workbench-panel-weekly");
    expect(wrapper.get('[data-testid="weekly-summary"]').text()).toContain("2026-06-29-2026-07-05");
    expectPanelHidden(wrapper, "workbench-panel-schedule");
  });

  it("shows the bonus panel only in the bonus tab", async () => {
    const wrapper = mountApp();

    await flushPromises();
    expect(wrapper.find('[data-testid="bonus-panel"]').exists()).toBe(true);
    expectPanelHidden(wrapper, "workbench-panel-bonus");

    await wrapper.get('[data-testid="workbench-tab-bonus"]').trigger("click");
    await nextTick();

    expectPanelVisible(wrapper, "workbench-panel-bonus");
  });

  it("keeps an unsaved bonus draft when switching away from and back to the bonus tab", async () => {
    const wrapper = mountApp();

    await flushPromises();
    await openBonusTab(wrapper);
    await wrapper.get('[data-testid="bonus-draft-input"]').setValue("1234");
    await wrapper.get('[data-testid="workbench-tab-schedule"]').trigger("click");
    await wrapper.get('[data-testid="workbench-tab-bonus"]').trigger("click");

    expect((wrapper.get('[data-testid="bonus-draft-input"]').element as HTMLInputElement).value).toBe("1234");
  });

  it("opens a visible week print preview on mobile instead of silently invoking system print", async () => {
    const restoreMobileViewport = mockMobileViewport(true);
    const { printSpy, restore: restorePrint } = mockSystemPrint();

    try {
      const wrapper = mountApp();

      await flushPromises();
      await wrapper.get('[data-testid="print-week"]').trigger("click");
      await nextTick();

      expect(printSpy).not.toHaveBeenCalled();
      expect(wrapper.get(".print-preview-dialog").text()).toContain("周表打印预览");
      expect(wrapper.get(".print-preview-tip").text()).toContain("生成 PDF");
      expect(wrapper.get('[data-testid="print-preview-pdf-button"]').text()).toContain("生成/分享 PDF");
      expect(wrapper.get(".print-preview-active").text()).toContain("周表预览");
    } finally {
      restoreMobileViewport();
      restorePrint();
    }
  });

  it("hides the duplicate system print button in the mobile print preview", async () => {
    const restoreMobileViewport = mockMobileViewport(true);
    const { printSpy, restore: restorePrint } = mockSystemPrint();

    try {
      const wrapper = mountApp();

      await flushPromises();
      await wrapper.get('[data-testid="print-month"]').trigger("click");
      await nextTick();

      expect(printSpy).not.toHaveBeenCalled();
      expect(wrapper.get('[data-testid="print-preview-pdf-button"]').text()).toContain("生成/分享 PDF");
      expect(wrapper.find('[data-testid="print-preview-system-button"]').exists()).toBe(false);
    } finally {
      restoreMobileViewport();
      restorePrint();
    }
  });

  it("passes a monthly summary into the month print preview", async () => {
    const restoreMobileViewport = mockMobileViewport(true);
    const { printSpy, restore: restorePrint } = mockSystemPrint();
    const data: PublicAppData = {
      ...testData,
      scheduleEntries: [
        {
          id: "entry-current-month",
          date: "2026-06-15",
          staffId: "staff-nurse-001",
          shiftIds: ["shift-a1"],
          note: ""
        },
        {
          id: "entry-next-month",
          date: "2026-07-01",
          staffId: "staff-nurse-001",
          shiftIds: ["shift-a1"],
          note: ""
        }
      ]
    };

    try {
      const wrapper = mountApp(data);

      await flushPromises();
      await wrapper.get('[data-testid="print-month"]').trigger("click");
      await nextTick();

      expect(printSpy).not.toHaveBeenCalled();
      expect(wrapper.get(".print-preview-active").text()).toContain("月度汇总");
      expect(wrapper.get(".print-preview-active").text()).toContain("李护士:1:1.50");
    } finally {
      restoreMobileViewport();
      restorePrint();
    }
  });

  it("renders bonus settlement panel for the selected month", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17));
    const wrapper = mountApp();

    await flushPromises();
    await openBonusTab(wrapper);

    expect(wrapper.get('[data-testid="bonus-month"]').text()).toBe("2026-06");
    expect(wrapper.get('[data-testid="bonus-status"]').text()).toBe("未月结");
    expect(wrapper.get('[data-testid="bonus-summary"]').text()).toContain("李护士");
    vi.useRealTimers();
  });

  it("passes a custom range trial summary into the bonus panel", async () => {
    const wrapper = mountApp({
      ...testData,
      scheduleEntries: [
        { id: "2026-07-01__staff-nurse-001", date: "2026-07-01", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" }
      ]
    });

    await flushPromises();
    await wrapper.get('[data-testid="workbench-tab-bonus"]').trigger("click");
    await wrapper.get('[data-testid="set-end-july"]').trigger("click");

    expect(wrapper.get('[data-testid="bonus-range"]').text()).toContain("2026-06-2026-07 range");
    expect(wrapper.get('[data-testid="bonus-summary"]').text()).toContain("李护士:1:1.50");
  });

  it("uses single-month settlement mode for the same non-selected start and end month", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17));
    elementPlusMocks.ElMessageBox.confirm.mockResolvedValue("confirm");
    apiMocks.saveMonthlySettlement.mockResolvedValue({ ...testData, monthlySettlements: [] });
    const wrapper = mountApp({
      ...testData,
      scheduleEntries: [
        { id: "2026-05-01__staff-nurse-001", date: "2026-05-01", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" }
      ],
      monthlySettlements: [
        {
          id: "settlement-2026-06",
          month: "2026-06",
          monthStart: "2026-06-01",
          monthEnd: "2026-06-30",
          totalDays: 30,
          bonusPool: 1000,
          coefficientTotal: 1.5,
          settledAt: "2026-06-30T10:00:00.000Z",
          rows: []
        }
      ]
    });

    await flushPromises();
    await enterAdminModeForTest(wrapper);
    await openBonusTab(wrapper);
    await wrapper.get('[data-testid="set-start-may"]').trigger("click");
    await wrapper.get('[data-testid="set-end-may"]').trigger("click");
    await nextTick();

    expect(wrapper.get('[data-testid="bonus-month"]').text()).toBe("2026-05");
    expect(wrapper.get('[data-testid="bonus-range"]').text()).toContain("2026-05-2026-05 single");
    expect(wrapper.get('[data-testid="bonus-range-valid"]').text()).toBe("valid");
    expect(wrapper.get('[data-testid="bonus-status"]').text()).toBe("未月结");
    expect(wrapper.get('[data-testid="bonus-summary"]').text()).toContain("李护士:1:1.50");
    await wrapper.get('[data-testid="confirm-settlement"]').trigger("click");
    await flushPromises();

    expect(apiMocks.saveMonthlySettlement).toHaveBeenCalledWith("2026-05", 1000);
    vi.useRealTimers();
  });

  it("marks reversed bonus ranges invalid", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17));
    const wrapper = mountApp();

    await flushPromises();
    await openBonusTab(wrapper);
    await wrapper.get('[data-testid="set-start-august"]').trigger("click");
    await wrapper.get('[data-testid="set-end-july"]').trigger("click");
    await nextTick();

    expect(wrapper.get('[data-testid="bonus-range"]').text()).toContain("2026-08-2026-07 range");
    expect(wrapper.get('[data-testid="bonus-range-valid"]').text()).toBe("invalid");
    vi.useRealTimers();
  });

  it("resets the bonus range when the selected date changes within the same month", async () => {
    const wrapper = mountApp();

    await flushPromises();
    await openBonusTab(wrapper);
    await wrapper.get('[data-testid="set-end-july"]').trigger("click");

    expect(wrapper.get('[data-testid="bonus-range"]').text()).toContain("2026-06-2026-07 range");

    await wrapper.get('[data-testid="jump-same-month-date"]').trigger("click");
    await nextTick();

    expect(wrapper.get('[data-testid="bonus-range"]').text()).toContain("2026-06-2026-06 single");
  });

  it("passes selected monthly settlement into print views", async () => {
    const wrapper = mountApp({
      ...testData,
      monthlySettlements: [
        {
          id: "settlement-2026-06",
          month: "2026-06",
          monthStart: "2026-06-01",
          monthEnd: "2026-06-30",
          totalDays: 30,
          bonusPool: 1000,
          coefficientTotal: 1.5,
          settledAt: "2026-06-30T10:00:00.000Z",
          rows: []
        }
      ]
    });

    await flushPromises();

    expect(wrapper.get('[data-testid="print-monthly-settlement"]').text()).toBe("月结 2026-06 1000.00");
  });

  it("confirms before saving monthly settlement and refreshes app data", async () => {
    elementPlusMocks.ElMessageBox.confirm.mockResolvedValue("confirm");
    apiMocks.saveMonthlySettlement.mockResolvedValue({
      ...testData,
      monthlySettlements: [
        {
          id: "settlement-2026-06",
          month: "2026-06",
          monthStart: "2026-06-01",
          monthEnd: "2026-06-30",
          totalDays: 30,
          bonusPool: 1000,
          coefficientTotal: 1.5,
          settledAt: "2026-06-30T10:00:00.000Z",
          rows: []
        }
      ]
    });
    const wrapper = mountApp();

    await flushPromises();
    await enterAdminModeForTest(wrapper);
    await openBonusTab(wrapper);
    await wrapper.get('[data-testid="confirm-settlement"]').trigger("click");
    await flushPromises();

    expect(elementPlusMocks.ElMessageBox.confirm).toHaveBeenCalledTimes(1);
    const [message, title] = elementPlusMocks.ElMessageBox.confirm.mock.calls[0];
    expect(String(title)).toContain("确认月结");
    expect(String(message)).toContain("2026-06");
    expect(String(message)).toContain("1000.00");
    expect(String(message)).toContain("确认后该月排班会被锁定");
    expect(apiMocks.saveMonthlySettlement).toHaveBeenCalledWith("2026-06", 1000);
    expect(wrapper.get('[data-testid="bonus-status"]').text()).toBe("已月结");
  });

  it("does not save or show an error when monthly settlement confirmation is canceled", async () => {
    elementPlusMocks.ElMessageBox.confirm.mockRejectedValue("cancel");
    const wrapper = mountApp();

    await flushPromises();
    await enterAdminModeForTest(wrapper);
    await openBonusTab(wrapper);
    await wrapper.get('[data-testid="confirm-settlement"]').trigger("click");
    await flushPromises();

    expect(elementPlusMocks.ElMessageBox.confirm).toHaveBeenCalledTimes(1);
    expect(apiMocks.saveMonthlySettlement).not.toHaveBeenCalled();
    expect(elementPlusMocks.ElMessage.error).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="bonus-status"]').text()).toBe("未月结");
  });

  it("suppresses duplicate settlement saves while a request is in flight", async () => {
    elementPlusMocks.ElMessageBox.confirm.mockResolvedValue("confirm");
    const deferred = createDeferred<PublicAppData>();
    apiMocks.saveMonthlySettlement.mockReturnValue(deferred.promise);
    const wrapper = mountApp();

    await flushPromises();
    await enterAdminModeForTest(wrapper);
    await openBonusTab(wrapper);
    await wrapper.get('[data-testid="confirm-settlement"]').trigger("click");
    await wrapper.get('[data-testid="confirm-settlement"]').trigger("click");

    await flushPromises();

    expect(elementPlusMocks.ElMessageBox.confirm).toHaveBeenCalledTimes(1);
    expect(apiMocks.saveMonthlySettlement).toHaveBeenCalledTimes(1);

    deferred.resolve({ ...testData, monthlySettlements: [] });
    await flushPromises();
  });

  it("cancels monthly settlement and refreshes app data", async () => {
    apiMocks.deleteMonthlySettlement.mockResolvedValue({ ...testData, monthlySettlements: [] });
    const wrapper = mountApp({
      ...testData,
      monthlySettlements: [
        {
          id: "settlement-2026-06",
          month: "2026-06",
          monthStart: "2026-06-01",
          monthEnd: "2026-06-30",
          totalDays: 30,
          bonusPool: 1000,
          coefficientTotal: 1.5,
          settledAt: "2026-06-30T10:00:00.000Z",
          rows: []
        }
      ]
    });

    await flushPromises();
    await enterAdminModeForTest(wrapper);
    await openBonusTab(wrapper);
    await wrapper.get('[data-testid="cancel-settlement"]').trigger("click");
    await flushPromises();

    expect(apiMocks.deleteMonthlySettlement).toHaveBeenCalledWith("2026-06");
    expect(wrapper.get('[data-testid="bonus-status"]').text()).toBe("未月结");
  });

  it("shares a generated PDF file from the print preview when file sharing is supported", async () => {
    const restoreMobileViewport = mockMobileViewport(true);
    const { restore: restorePrint } = mockSystemPrint();
    const { canShareSpy, restore: restoreNavigatorShare, shareSpy } = mockNavigatorFileShare(true);
    const pdfFile = new File(["pdf"], "week-schedule.pdf", { type: "application/pdf" });
    pdfMocks.createPrintPdfFile.mockResolvedValue(pdfFile);

    try {
      const wrapper = mountApp();

      await flushPromises();
      await wrapper.get('[data-testid="print-week"]').trigger("click");
      await nextTick();
      await wrapper.get('[data-testid="print-preview-pdf-button"]').trigger("click");
      await flushPromises();

      expect(pdfMocks.createPrintPdfFile).toHaveBeenCalledWith({
        element: expect.any(HTMLElement),
        filename: "week-schedule.pdf"
      });
      expect(canShareSpy).toHaveBeenCalledWith({ files: [pdfFile] });
      expect(shareSpy).toHaveBeenCalledWith({
        files: [pdfFile],
        title: "周表打印预览"
      });
      expect(wrapper.find('[data-testid="print-pdf-download-link"]').exists()).toBe(false);
    } finally {
      restoreMobileViewport();
      restorePrint();
      restoreNavigatorShare();
    }
  });

  it("falls back to a PDF download link when file sharing is not supported", async () => {
    const restoreMobileViewport = mockMobileViewport(true);
    const { restore: restorePrint } = mockSystemPrint();
    const { restore: restoreNavigatorShare, shareSpy } = mockNavigatorFileShare(false);
    const { createObjectUrlSpy, restore: restorePdfDownloadUrl } = mockPdfDownloadUrl();
    const pdfFile = new File(["pdf"], "month-schedule.pdf", { type: "application/pdf" });
    pdfMocks.createPrintPdfFile.mockResolvedValue(pdfFile);

    try {
      const wrapper = mountApp();

      await flushPromises();
      await wrapper.get('[data-testid="print-month"]').trigger("click");
      await nextTick();
      await wrapper.get('[data-testid="print-preview-pdf-button"]').trigger("click");
      await flushPromises();

      expect(pdfMocks.createPrintPdfFile).toHaveBeenCalledWith({
        element: expect.any(HTMLElement),
        filename: "month-schedule.pdf"
      });
      expect(shareSpy).not.toHaveBeenCalled();
      expect(createObjectUrlSpy).toHaveBeenCalledWith(pdfFile);

      const downloadLink = wrapper.get('[data-testid="print-pdf-download-link"]');
      expect(downloadLink.attributes("href")).toBe("blob:print-pdf");
      expect(downloadLink.attributes("download")).toBe("month-schedule.pdf");
      expect(downloadLink.text()).toContain("下载 PDF");
    } finally {
      restoreMobileViewport();
      restorePrint();
      restoreNavigatorShare();
      restorePdfDownloadUrl();
    }
  });

  it("keeps a PDF download link when system sharing rejects after PDF generation", async () => {
    const restoreMobileViewport = mockMobileViewport(true);
    const { restore: restorePrint } = mockSystemPrint();
    const { restore: restoreNavigatorShare, shareSpy } = mockNavigatorFileShare(true);
    const { createObjectUrlSpy, restore: restorePdfDownloadUrl } = mockPdfDownloadUrl();
    const pdfFile = new File(["pdf"], "week-schedule.pdf", { type: "application/pdf" });
    pdfMocks.createPrintPdfFile.mockResolvedValue(pdfFile);
    shareSpy.mockRejectedValue(new DOMException("Must be handling a user gesture", "NotAllowedError"));

    try {
      const wrapper = mountApp();

      await flushPromises();
      await wrapper.get('[data-testid="print-week"]').trigger("click");
      await nextTick();
      await wrapper.get('[data-testid="print-preview-pdf-button"]').trigger("click");
      await flushPromises();

      expect(shareSpy).toHaveBeenCalledWith({
        files: [pdfFile],
        title: "周表打印预览"
      });
      expect(createObjectUrlSpy).toHaveBeenCalledWith(pdfFile);

      const downloadLink = wrapper.get('[data-testid="print-pdf-download-link"]');
      expect(downloadLink.attributes("href")).toBe("blob:print-pdf");
      expect(downloadLink.attributes("download")).toBe("week-schedule.pdf");
      expect(wrapper.get(".print-pdf-status").text()).toContain("下载 PDF");
    } finally {
      restoreMobileViewport();
      restorePrint();
      restoreNavigatorShare();
      restorePdfDownloadUrl();
    }
  });
});
