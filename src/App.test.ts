import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, nextTick, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App.vue";
import type { AuthUser, PublicAppData } from "@/api/client";

const apiMocks = vi.hoisted(() => ({
  bulkUpdateWeekSchedule: vi.fn(),
  copyPreviousWeekSchedule: vi.fn(),
  deleteUser: vi.fn(),
  deleteStaff: vi.fn(),
  deleteHoliday: vi.fn(),
  deleteMonthlySettlement: vi.fn(),
  enterAdminMode: vi.fn(),
  getCurrentUser: vi.fn(),
  listAuditLogs: vi.fn(),
  listUsers: vi.fn(),
  loadData: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  changePassword: vi.fn(),
  saveHoliday: vi.fn(),
  saveMonthlySettlement: vi.fn(),
  saveScheduleEntry: vi.fn(),
  saveShift: vi.fn(),
  saveStaff: vi.fn(),
  saveUser: vi.fn()
}));

const pdfMocks = vi.hoisted(() => ({
  createPrintPdfFile: vi.fn()
}));

const elementPlusMocks = vi.hoisted(() => ({
  ElMessage: {
    error: vi.fn(),
    info: vi.fn(),
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

const officeShiftData: PublicAppData = {
  ...testData,
  shifts: [
    ...testData.shifts,
    {
      id: "shift-office",
      name: "办公班",
      shortName: "办公",
      color: "#7C3AED",
      countsAttendance: true,
      coefficient: 1.2,
      enabled: true,
      sortOrder: 3
    }
  ]
};

const twoStaffData: PublicAppData = {
  ...testData,
  staff: [
    ...testData.staff,
    {
      id: "staff-nurse-002",
      jobId: "100002",
      name: "王护士",
      type: "nurse",
      isAdmin: false,
      enabled: true,
      sortOrder: 2
    }
  ]
};

const managedSettlementRow: PublicAppData["monthlySettlements"][number]["rows"][number] = {
  staffId: "staff-nurse-001",
  staffName: "李护士",
  staffJobId: "100001",
  staffType: "nurse",
  attendanceShifts: 12,
  requiredShifts: 20,
  attendanceBalance: -8,
  overtimeShifts: 0,
  coefficientTotal: 12,
  coefficientExcludedReason: "",
  bonusAmount: 1000,
  bonusExcludedReason: ""
};

const unmanagedSettlementRow: PublicAppData["monthlySettlements"][number]["rows"][number] = {
  staffId: "staff-nurse-002",
  staffName: "王护士",
  staffJobId: "100002",
  staffType: "nurse",
  attendanceShifts: 8,
  requiredShifts: 20,
  attendanceBalance: -12,
  overtimeShifts: 0,
  coefficientTotal: 8,
  coefficientExcludedReason: "",
  bonusAmount: 500,
  bonusExcludedReason: ""
};

function createMonthlySettlement(
  rows: PublicAppData["monthlySettlements"][number]["rows"]
): PublicAppData["monthlySettlements"][number] {
  return {
    id: "settlement-2026-06",
    month: "2026-06",
    monthStart: "2026-06-01",
    monthEnd: "2026-06-30",
    totalDays: 30,
    bonusPool: rows.reduce((total, row) => total + row.bonusAmount, 0),
    coefficientTotal: rows.reduce((total, row) => total + (row.coefficientTotal ?? 0), 0),
    settledAt: "2026-06-30T10:00:00.000Z",
    rows
  };
}

function juneWeekdayAttendanceEntries(): PublicAppData["scheduleEntries"] {
  return [
    "2026-06-01",
    "2026-06-02",
    "2026-06-03",
    "2026-06-04",
    "2026-06-05",
    "2026-06-08",
    "2026-06-09",
    "2026-06-10",
    "2026-06-11",
    "2026-06-12",
    "2026-06-15",
    "2026-06-16",
    "2026-06-17",
    "2026-06-18",
    "2026-06-19",
    "2026-06-22",
    "2026-06-23",
    "2026-06-24",
    "2026-06-25",
    "2026-06-26",
    "2026-06-29",
    "2026-06-30"
  ].map((date) => ({
    id: `${date}__staff-nurse-001`,
    date,
    staffId: "staff-nurse-001",
    shiftIds: ["shift-a1"],
    note: ""
  }));
}

const testAuthUser: AuthUser = {
  id: "user-admin",
  username: "admin",
  displayName: "系统管理员",
  role: "admin" as const,
  staffId: null,
  managedStaffIds: []
};

function createSchedulerUser(managedStaffIds: string[]): AuthUser {
  return {
    id: "user-scheduler",
    username: "scheduler",
    displayName: "排班员",
    role: "scheduler",
    staffId: null,
    managedStaffIds
  };
}

const AppToolbarStub = defineComponent({
  name: "AppToolbar",
  props: ["selectedDate", "adminMode", "currentUser"],
  emits: ["update:selectedDate", "logout", "openManagement", "openPasswordChange", "printMonth", "printWeek"],
  template: `
    <section>
      <span data-testid="current-user">{{ currentUser?.displayName }}</span>
      <button data-testid="open-management" type="button" @click="$emit('openManagement')">配置</button>
      <button data-testid="open-password-change" type="button" @click="$emit('openPasswordChange')">修改密码</button>
      <button data-testid="logout-button" type="button" @click="$emit('logout')">
        退出登录
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
  props: ["staff", "days", "editableStaffIds"],
  emits: ["quickFill", "editCell"],
  template: `
    <section>
      <span data-testid="schedule-grid">{{ days.map((day) => day.key).join(",") }}</span>
      <span data-testid="schedule-staff-ids">{{ staff.map((person) => person.id).join(",") }}</span>
      <span data-testid="schedule-editable-staff-ids">{{ editableStaffIds?.join(",") }}</span>
      <button
        data-testid="emit-unmanaged-quick-fill"
        type="button"
        @click="$emit('quickFill', 'staff-nurse-002', '2026-06-15')"
      >
        unmanaged quick fill
      </button>
      <button
        data-testid="emit-unmanaged-edit-cell"
        type="button"
        @click="$emit('editCell', 'staff-nurse-002', '2026-06-15')"
      >
        unmanaged edit
      </button>
    </section>
  `
});

const WeeklySummaryStub = defineComponent({
  name: "WeeklySummary",
  props: ["summary"],
  template: '<section data-testid="weekly-summary">{{ summary.weekStart }}-{{ summary.weekEnd }}</section>'
});

const EmptyStub = defineComponent({
  template: "<section />"
});

const CellEditorDialogStub = defineComponent({
  name: "CellEditorDialog",
  props: ["modelValue", "staff"],
  emits: ["save"],
  template: `
    <section v-if="modelValue" data-testid="cell-editor">
      <span data-testid="editing-staff-id">{{ staff?.id }}</span>
      <button data-testid="save-editor" type="button" @click="$emit('save', ['shift-a1'], 'note')">save editor</button>
    </section>
  `
});

const ManagementDrawerStub = defineComponent({
  name: "ManagementDrawer",
  props: ["modelValue", "users", "auditLogs"],
  emits: ["saveStaff", "deleteStaff", "saveUser", "deleteUser", "refreshAuditLogs"],
  template: `
    <section v-if="modelValue" data-testid="management-drawer">
      <span data-testid="drawer-users">{{ users.map((user) => user.username).join(",") }}</span>
      <span data-testid="drawer-audit">{{ auditLogs.map((entry) => entry.summary).join(",") }}</span>
      <button
        data-testid="drawer-save-staff"
        type="button"
        @click="$emit('saveStaff', { id: 'staff-nurse-001', jobId: '100001', name: '李护士', type: 'nurse', isAdmin: false, enabled: true, sortOrder: 1 })"
      >
        save staff
      </button>
      <button
        data-testid="drawer-delete-staff"
        type="button"
        @click="$emit('deleteStaff', 'staff-nurse-001')"
      >
        delete staff
      </button>
      <button
        data-testid="drawer-save-user"
        type="button"
        @click="$emit('saveUser', { id: 'user-scheduler', username: 'scheduler', displayName: '排班管理员', role: 'scheduler', enabled: true, password: 'secret123' })"
      >
        save user
      </button>
      <button
        data-testid="drawer-save-managed-user"
        type="button"
        @click="$emit('saveUser', { id: 'user-scheduler', username: 'scheduler', displayName: '排班管理员', role: 'scheduler', enabled: true, staffId: null, managedStaffIds: ['staff-head'] })"
      >
        save managed user
      </button>
      <button
        data-testid="drawer-delete-user"
        type="button"
        @click="$emit('deleteUser', 'user-scheduler')"
      >
        delete user
      </button>
      <button
        data-testid="drawer-refresh-audit"
        type="button"
        @click="$emit('refreshAuditLogs', { username: 'admin', action: 'user.save', keyword: 'scheduler', limit: 50 })"
      >
        refresh audit
      </button>
    </section>
  `
});

const PasswordChangeDialogStub = defineComponent({
  name: "PasswordChangeDialog",
  props: ["modelValue"],
  emits: ["changePassword"],
  template: `
    <section v-if="modelValue" data-testid="password-dialog">
      <button
        data-testid="submit-password-change"
        type="button"
        @click="$emit('changePassword', { currentPassword: 'old-password', newPassword: 'new-password' })"
      >
        change password
      </button>
    </section>
  `
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
  props: [
    "month",
    "monthlySummary",
    "settlement",
    "startMonth",
    "endMonth",
    "isRangeMode",
    "isRangeValid",
    "sourceMonths",
    "canOperateSettlement"
  ],
  emits: ["confirmSettlement", "cancelSettlement", "update:startMonth", "update:endMonth"],
  setup() {
    return { draftBonusPool: ref("") };
  },
  template: `
    <section data-testid="bonus-panel">
      <span data-testid="bonus-month">{{ month }}</span>
      <span data-testid="bonus-range">{{ startMonth }}-{{ endMonth }} {{ isRangeMode ? "range" : "single" }}</span>
      <span data-testid="bonus-range-valid">{{ isRangeValid ? "valid" : "invalid" }}</span>
      <span data-testid="bonus-can-operate">{{ canOperateSettlement ? "true" : "false" }}</span>
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

const ShiftPaletteStub = defineComponent({
  name: "ShiftPalette",
  emits: ["select"],
  template: '<button data-testid="select-shift-a1" type="button" @click="$emit(\'select\', \'shift-a1\')">select shift</button>'
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

function mountApp(appData: PublicAppData = testData, authUser: AuthUser | null = testAuthUser) {
  apiMocks.getCurrentUser.mockResolvedValue(authUser);
  apiMocks.loadData.mockResolvedValue(structuredClone(appData));
  apiMocks.listUsers.mockResolvedValue({
    rows: [
      {
        id: "user-admin",
        username: "admin",
        displayName: "系统管理员",
        role: "admin",
        staffId: null,
        managedStaffIds: [],
        enabled: true,
        createdAt: "2026-06-19T00:00:00.000Z",
        updatedAt: "2026-06-19T00:00:00.000Z"
      }
    ]
  });
  apiMocks.listAuditLogs.mockResolvedValue({
    rows: [
      {
        id: "audit-1",
        occurredAt: "2026-06-19T00:00:00.000Z",
        userId: "user-admin",
        username: "admin",
        action: "user.save",
        targetType: "user",
        targetId: "user-scheduler",
        summary: "保存账号：scheduler",
        ip: "127.0.0.1",
        userAgent: "vitest"
      }
    ]
  });

  return mount(App, {
    global: {
      stubs: {
        AppToolbar: AppToolbarStub,
        BonusSettlementPanel: BonusSettlementPanelStub,
        CellEditorDialog: CellEditorDialogStub,
        ElButton: ElButtonStub,
        ElDialog: ElDialogStub,
        ElInput: ElInputStub,
        LoginPage: EmptyStub,
        ManagementDrawer: ManagementDrawerStub,
        PasswordChangeDialog: PasswordChangeDialogStub,
        PrintViews: PrintViewsStub,
        ScheduleGrid: ScheduleGridStub,
        ShiftPalette: ShiftPaletteStub,
        WeeklySummary: WeeklySummaryStub
      }
    }
  });
}

async function enterAdminModeForTest(wrapper: ReturnType<typeof mountApp>) {
  await flushPromises();
  expect(wrapper.get('[data-testid="current-user"]').text()).toContain("系统管理员");
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
    expect(infoPanel.text()).toContain("所有登录账号可查看全科排班");
    expect(infoPanel.text()).toContain("排班员只能编辑账号可管理人员范围内的格子");
    expect(infoPanel.text()).toContain("绑定人员只用于标识账号本人");
    expect(infoPanel.text()).toContain("不会自动授予排班权限");
    expect(infoPanel.text()).toContain("编辑范围由账号可管理人员决定");
    expect(infoPanel.text()).toContain("核算规则");
    expect(infoPanel.text()).toContain("按班次而不是自然日计出勤");
    expect(infoPanel.text()).toContain("加班 = max(0, 出勤班次 - 满勤标准)");
    expect(infoPanel.text()).toContain("护士长绩效系数单独核算");
    expect(infoPanel.text()).toContain("班次系数");
    expect(infoPanel.text()).toContain("A1组长 1.50");
    expect(infoPanel.text()).toContain("休息 不计出勤");
  });

  it("shows the current user and supports logging out", async () => {
    apiMocks.logout.mockResolvedValue(undefined);
    const wrapper = mountApp();

    await flushPromises();
    expect(wrapper.get('[data-testid="current-user"]').text()).toContain("系统管理员");
    expect(wrapper.get(".admin-mode-banner").text()).toContain("当前账号可查看全科排班");
    expect(wrapper.get(".admin-mode-banner").text()).toContain("并可维护人员、班次、节假日和账号");

    await wrapper.get('[data-testid="logout-button"]').trigger("click");
    await flushPromises();

    expect(apiMocks.logout).toHaveBeenCalled();
    expect(wrapper.find(".app-shell").exists()).toBe(false);
  });

  it("loads users and audit logs when opening system management", async () => {
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="open-management"]').trigger("click");
    await flushPromises();

    expect(apiMocks.listUsers).toHaveBeenCalled();
    expect(apiMocks.listAuditLogs).toHaveBeenCalledWith({ limit: 100 });
    expect(wrapper.get('[data-testid="drawer-users"]').text()).toContain("admin");
    expect(wrapper.get('[data-testid="drawer-audit"]').text()).toContain("保存账号：scheduler");
  });

  it("saves users from the management drawer and refreshes the user list", async () => {
    apiMocks.saveUser.mockResolvedValue({
      user: {
        id: "user-scheduler",
        username: "scheduler",
        displayName: "排班管理员",
        role: "scheduler",
        staffId: null,
        managedStaffIds: [],
        enabled: true,
        createdAt: "2026-06-19T00:00:00.000Z",
        updatedAt: "2026-06-19T00:00:00.000Z"
      }
    });
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="open-management"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="drawer-save-user"]').trigger("click");
    await flushPromises();

    expect(apiMocks.saveUser).toHaveBeenCalledWith({
      id: "user-scheduler",
      username: "scheduler",
      displayName: "排班管理员",
      role: "scheduler",
      enabled: true,
      password: "secret123"
    });
    expect(apiMocks.listUsers).toHaveBeenCalledTimes(2);
  });

  it("preserves managed staff ids when saving scheduler users", async () => {
    apiMocks.saveUser.mockResolvedValue({
      user: {
        id: "user-scheduler",
        username: "scheduler",
        displayName: "排班管理员",
        role: "scheduler",
        staffId: null,
        managedStaffIds: ["staff-head"],
        enabled: true,
        createdAt: "2026-06-19T00:00:00.000Z",
        updatedAt: "2026-06-19T00:00:00.000Z"
      }
    });
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="open-management"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="drawer-save-managed-user"]').trigger("click");
    await flushPromises();

    expect(apiMocks.saveUser).toHaveBeenCalledWith({
      id: "user-scheduler",
      username: "scheduler",
      displayName: "排班管理员",
      role: "scheduler",
      enabled: true,
      staffId: null,
      managedStaffIds: ["staff-head"]
    });
  });

  it("deletes users from the management drawer and refreshes users and audit logs", async () => {
    apiMocks.deleteUser.mockResolvedValue({ ok: true });
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="open-management"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="drawer-delete-user"]').trigger("click");
    await flushPromises();

    expect(apiMocks.deleteUser).toHaveBeenCalledWith("user-scheduler");
    expect(apiMocks.listUsers).toHaveBeenCalledTimes(2);
    expect(apiMocks.listAuditLogs).toHaveBeenCalledWith({ limit: 100 });
  });

  it("refreshes latest audit logs after saving management configuration", async () => {
    apiMocks.saveStaff.mockResolvedValue(structuredClone(testData));
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="open-management"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="drawer-save-staff"]').trigger("click");
    await flushPromises();

    expect(apiMocks.saveStaff).toHaveBeenCalledWith({
      id: "staff-nurse-001",
      jobId: "100001",
      name: "李护士",
      type: "nurse",
      isAdmin: false,
      enabled: true,
      sortOrder: 1
    });
    expect(apiMocks.listAuditLogs).toHaveBeenLastCalledWith({ limit: 100 });
    expect(apiMocks.listAuditLogs).toHaveBeenCalledTimes(2);
  });

  it("refreshes latest audit logs after deleting a staff member", async () => {
    apiMocks.deleteStaff.mockResolvedValue(structuredClone({ ...testData, staff: [] }));
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="open-management"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="drawer-delete-staff"]').trigger("click");
    await flushPromises();

    expect(apiMocks.deleteStaff).toHaveBeenCalledWith("staff-nurse-001");
    expect(apiMocks.listAuditLogs).toHaveBeenLastCalledWith({ limit: 100 });
    expect(apiMocks.listAuditLogs).toHaveBeenCalledTimes(2);
  });

  it("changes the current password and returns to the login page", async () => {
    apiMocks.changePassword.mockResolvedValue({ ok: true });
    apiMocks.logout.mockResolvedValue(undefined);
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="open-password-change"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="submit-password-change"]').trigger("click");
    await flushPromises();

    expect(apiMocks.changePassword).toHaveBeenCalledWith({
      currentPassword: "old-password",
      newPassword: "new-password"
    });
    expect(apiMocks.logout).toHaveBeenCalled();
    expect(wrapper.find(".app-shell").exists()).toBe(false);
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

  it("passes only scheduler-managed enabled staff ids to the schedule grid", async () => {
    const wrapper = mountApp(twoStaffData, createSchedulerUser(["staff-nurse-001"]));

    await flushPromises();

    expect(wrapper.get('[data-testid="schedule-editable-staff-ids"]').text()).toBe("staff-nurse-001");
    expect(wrapper.get(".admin-mode-banner").text()).toContain("可编辑范围由账号可管理人员决定");
  });

  it("lets a scheduler with no managed staff view the full schedule without editable cells", async () => {
    const wrapper = mountApp(twoStaffData, createSchedulerUser([]));

    await flushPromises();

    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).toBe("staff-nurse-001,staff-nurse-002");
    expect(wrapper.get('[data-testid="schedule-editable-staff-ids"]').text()).toBe("");
  });

  it("blocks unmanaged scheduler schedule edits even if the grid emits them", async () => {
    apiMocks.saveScheduleEntry.mockResolvedValue(structuredClone(twoStaffData));
    const wrapper = mountApp(twoStaffData, createSchedulerUser(["staff-nurse-001"]));

    await flushPromises();
    await wrapper.get('[data-testid="select-shift-a1"]').trigger("click");
    await wrapper.get('[data-testid="emit-unmanaged-quick-fill"]').trigger("click");
    await flushPromises();

    expect(apiMocks.saveScheduleEntry).not.toHaveBeenCalled();

    await wrapper.get('[data-testid="emit-unmanaged-edit-cell"]').trigger("click");
    await nextTick();

    expect(wrapper.find('[data-testid="cell-editor"]').exists()).toBe(false);
  });

  it("copies the previous week in skip mode without confirmation when the current week is empty", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17));
    apiMocks.copyPreviousWeekSchedule.mockResolvedValue({
      data: structuredClone(testData),
      result: { copied: 1, skipped: 0 }
    });
    const wrapper = mountApp({
      ...testData,
      scheduleEntries: [
        {
          id: "2026-06-08__staff-nurse-001",
          date: "2026-06-08",
          staffId: "staff-nurse-001",
          shiftIds: ["shift-a1"],
          note: ""
        }
      ]
    });

    await flushPromises();
    await wrapper.get('[data-testid="copy-previous-week-button"]').trigger("click");
    await flushPromises();

    expect(elementPlusMocks.ElMessageBox.confirm).not.toHaveBeenCalled();
    expect(apiMocks.copyPreviousWeekSchedule).toHaveBeenCalledWith({ weekStart: "2026-06-15", mode: "skip" });
    expect(elementPlusMocks.ElMessage.success).toHaveBeenCalledWith("已复制 1 个排班");
    vi.useRealTimers();
  });

  it("asks before copying previous week over existing current week entries", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17));
    elementPlusMocks.ElMessageBox.confirm.mockResolvedValue("confirm");
    apiMocks.copyPreviousWeekSchedule.mockResolvedValue({
      data: structuredClone(testData),
      result: { copied: 1, skipped: 0 }
    });
    const wrapper = mountApp({
      ...testData,
      scheduleEntries: [
        {
          id: "2026-06-08__staff-nurse-001",
          date: "2026-06-08",
          staffId: "staff-nurse-001",
          shiftIds: ["shift-a1"],
          note: ""
        },
        {
          id: "2026-06-15__staff-nurse-001",
          date: "2026-06-15",
          staffId: "staff-nurse-001",
          shiftIds: ["shift-rest"],
          note: "keep or overwrite"
        }
      ]
    });

    await flushPromises();
    await wrapper.get('[data-testid="copy-previous-week-button"]').trigger("click");
    await flushPromises();

    expect(elementPlusMocks.ElMessageBox.confirm).toHaveBeenCalled();
    expect(apiMocks.copyPreviousWeekSchedule).toHaveBeenCalledWith({ weekStart: "2026-06-15", mode: "overwrite" });
    vi.useRealTimers();
  });

  it("batch sets rest shifts for the selected week when the current week is empty", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17));
    apiMocks.bulkUpdateWeekSchedule.mockResolvedValue({
      data: structuredClone(testData),
      result: { updated: 7, skipped: 0 }
    });
    const wrapper = mountApp(testData);

    await flushPromises();
    await wrapper.get('[data-testid="batch-rest-week-button"]').trigger("click");
    await flushPromises();

    expect(elementPlusMocks.ElMessageBox.confirm).not.toHaveBeenCalled();
    expect(apiMocks.bulkUpdateWeekSchedule).toHaveBeenCalledWith({
      weekStart: "2026-06-15",
      operation: "set-shift",
      shiftId: "shift-rest",
      mode: "overwrite"
    });
    expect(elementPlusMocks.ElMessage.success).toHaveBeenCalledWith("已批量更新 7 个排班");
    vi.useRealTimers();
  });

  it("batch sets office shifts using the configured office shift", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17));
    apiMocks.bulkUpdateWeekSchedule.mockResolvedValue({
      data: structuredClone(officeShiftData),
      result: { updated: 7, skipped: 0 }
    });
    const wrapper = mountApp(officeShiftData);

    await flushPromises();
    await wrapper.get('[data-testid="batch-office-week-button"]').trigger("click");
    await flushPromises();

    expect(apiMocks.bulkUpdateWeekSchedule).toHaveBeenCalledWith({
      weekStart: "2026-06-15",
      operation: "set-shift",
      shiftId: "shift-office",
      mode: "overwrite"
    });
    vi.useRealTimers();
  });

  it("asks before overwriting current week entries during batch shift setting", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17));
    elementPlusMocks.ElMessageBox.confirm.mockResolvedValue("confirm");
    apiMocks.bulkUpdateWeekSchedule.mockResolvedValue({
      data: structuredClone(testData),
      result: { updated: 7, skipped: 0 }
    });
    const wrapper = mountApp({
      ...testData,
      scheduleEntries: [
        {
          id: "2026-06-15__staff-nurse-001",
          date: "2026-06-15",
          staffId: "staff-nurse-001",
          shiftIds: ["shift-a1"],
          note: "existing"
        }
      ]
    });

    await flushPromises();
    await wrapper.get('[data-testid="batch-rest-week-button"]').trigger("click");
    await flushPromises();

    expect(elementPlusMocks.ElMessageBox.confirm).toHaveBeenCalled();
    expect(apiMocks.bulkUpdateWeekSchedule).toHaveBeenCalledWith({
      weekStart: "2026-06-15",
      operation: "set-shift",
      shiftId: "shift-rest",
      mode: "overwrite"
    });
    vi.useRealTimers();
  });

  it("confirms before clearing the selected week", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17));
    elementPlusMocks.ElMessageBox.confirm.mockResolvedValue("confirm");
    apiMocks.bulkUpdateWeekSchedule.mockResolvedValue({
      data: structuredClone(testData),
      result: { updated: 1, skipped: 0 }
    });
    const wrapper = mountApp({
      ...testData,
      scheduleEntries: [
        {
          id: "2026-06-15__staff-nurse-001",
          date: "2026-06-15",
          staffId: "staff-nurse-001",
          shiftIds: ["shift-a1"],
          note: ""
        }
      ]
    });

    await flushPromises();
    await wrapper.get('[data-testid="clear-week-button"]').trigger("click");
    await flushPromises();

    expect(elementPlusMocks.ElMessageBox.confirm).toHaveBeenCalled();
    expect(apiMocks.bulkUpdateWeekSchedule).toHaveBeenCalledWith({
      weekStart: "2026-06-15",
      operation: "clear"
    });
    expect(elementPlusMocks.ElMessage.success).toHaveBeenCalledWith("已批量清空 1 个排班");
    vi.useRealTimers();
  });

  it("does not render current week schedule anomaly reminders", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17));
    const dataWithFormerReminder = structuredClone(testData);
    dataWithFormerReminder.scheduleEntries = [
      {
        id: "2026-06-15__staff-nurse-001",
        date: "2026-06-15",
        staffId: "staff-nurse-001",
        shiftIds: ["shift-a1", "shift-rest"],
        note: ""
      }
    ];
    const wrapper = mountApp(dataWithFormerReminder);

    await flushPromises();

    expect(wrapper.find('[data-testid="schedule-anomaly-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="schedule-anomaly-item-staff-nurse-001-2026-06-16"]').exists()).toBe(false);
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

  it("allows scheduler settlement operations only when every bonus row is managed", async () => {
    const managedOnly = mountApp(testData, createSchedulerUser(["staff-nurse-001"]));

    await flushPromises();
    await openBonusTab(managedOnly);

    expect(managedOnly.get('[data-testid="bonus-can-operate"]').text()).toBe("true");

    const withUnmanagedRow = mountApp(twoStaffData, createSchedulerUser(["staff-nurse-001"]));

    await flushPromises();
    await openBonusTab(withUnmanagedRow);

    expect(withUnmanagedRow.get('[data-testid="bonus-can-operate"]').text()).toBe("false");
  });

  it("allows canceling a settled month when saved snapshot rows are managed even if live summary has unmanaged staff", async () => {
    const wrapper = mountApp(
      {
        ...twoStaffData,
        monthlySettlements: [createMonthlySettlement([managedSettlementRow])]
      },
      createSchedulerUser(["staff-nurse-001"])
    );

    await flushPromises();
    await openBonusTab(wrapper);

    expect(wrapper.get('[data-testid="bonus-status"]').text()).toBe("已月结");
    expect(wrapper.get('[data-testid="bonus-can-operate"]').text()).toBe("true");
  });

  it("blocks canceling a settled month when saved snapshot rows include unmanaged staff", async () => {
    const wrapper = mountApp(
      {
        ...testData,
        monthlySettlements: [createMonthlySettlement([managedSettlementRow, unmanagedSettlementRow])]
      },
      createSchedulerUser(["staff-nurse-001"])
    );

    await flushPromises();
    await openBonusTab(wrapper);

    expect(wrapper.get('[data-testid="bonus-status"]').text()).toBe("已月结");
    expect(wrapper.get('[data-testid="bonus-can-operate"]').text()).toBe("false");
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

  it("keeps the bonus range when the selected date changes within the same month", async () => {
    const wrapper = mountApp();

    await flushPromises();
    await openBonusTab(wrapper);
    await wrapper.get('[data-testid="set-end-july"]').trigger("click");

    expect(wrapper.get('[data-testid="bonus-range"]').text()).toContain("2026-06-2026-07 range");

    await wrapper.get('[data-testid="jump-same-month-date"]').trigger("click");
    await nextTick();

    expect(wrapper.get('[data-testid="bonus-range"]').text()).toContain("2026-06-2026-07 range");
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
    const wrapper = mountApp({ ...testData, scheduleEntries: juneWeekdayAttendanceEntries() });

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

  it("shows settlement pre-check warnings before final confirmation and saves after continuing", async () => {
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
          coefficientTotal: 0,
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

    expect(elementPlusMocks.ElMessageBox.confirm).toHaveBeenCalledTimes(2);
    expect(elementPlusMocks.ElMessageBox.confirm.mock.calls[0][1]).toBe("月结前数据检查");
    expect(String(elementPlusMocks.ElMessageBox.confirm.mock.calls[0][0])).toContain("李护士");
    expect(elementPlusMocks.ElMessageBox.confirm.mock.calls[0][2]).toMatchObject({
      cancelButtonText: "返回核对",
      confirmButtonText: "继续月结",
      type: "warning"
    });
    expect(elementPlusMocks.ElMessageBox.confirm.mock.calls[1][1]).toBe("确认月结");
    expect(apiMocks.saveMonthlySettlement).toHaveBeenCalledWith("2026-06", 1000);
  });

  it("does not save monthly settlement when pre-check warning is canceled", async () => {
    elementPlusMocks.ElMessageBox.confirm.mockRejectedValueOnce("cancel");
    const wrapper = mountApp();

    await flushPromises();
    await enterAdminModeForTest(wrapper);
    await openBonusTab(wrapper);
    await wrapper.get('[data-testid="confirm-settlement"]').trigger("click");
    await flushPromises();

    expect(elementPlusMocks.ElMessageBox.confirm).toHaveBeenCalledTimes(1);
    expect(elementPlusMocks.ElMessageBox.confirm.mock.calls[0][1]).toBe("月结前数据检查");
    expect(apiMocks.saveMonthlySettlement).not.toHaveBeenCalled();
  });

  it("skips settlement pre-check warning when no check items exist", async () => {
    elementPlusMocks.ElMessageBox.confirm.mockResolvedValue("confirm");
    apiMocks.saveMonthlySettlement.mockResolvedValue({ ...testData, monthlySettlements: [] });
    const wrapper = mountApp({ ...testData, scheduleEntries: juneWeekdayAttendanceEntries() });

    await flushPromises();
    await enterAdminModeForTest(wrapper);
    await openBonusTab(wrapper);
    await wrapper.get('[data-testid="confirm-settlement"]').trigger("click");
    await flushPromises();

    expect(elementPlusMocks.ElMessageBox.confirm).toHaveBeenCalledTimes(1);
    expect(elementPlusMocks.ElMessageBox.confirm.mock.calls[0][1]).toBe("确认月结");
    expect(apiMocks.saveMonthlySettlement).toHaveBeenCalledWith("2026-06", 1000);
  });

  it("does not save or show an error when monthly settlement confirmation is canceled", async () => {
    elementPlusMocks.ElMessageBox.confirm.mockRejectedValue("cancel");
    const wrapper = mountApp({ ...testData, scheduleEntries: juneWeekdayAttendanceEntries() });

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
    const wrapper = mountApp({ ...testData, scheduleEntries: juneWeekdayAttendanceEntries() });

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
