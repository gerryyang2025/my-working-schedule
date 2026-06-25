import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, nextTick, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App.vue";
import type { AuditLogEntry, AuditLogListResponse, AuthUser, ManagedAuthUser, PublicAppData } from "@/api/client";

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

const mixedCaseStaffData: PublicAppData = {
  ...twoStaffData,
  staff: [
    ...twoStaffData.staff,
    {
      id: "staff-clerk-abc",
      jobId: "AbC003",
      name: "陈文员",
      type: "clerk",
      isAdmin: false,
      enabled: true,
      sortOrder: 3
    }
  ]
};

const queryStaffData: PublicAppData = {
  ...mixedCaseStaffData,
  staff: [
    ...mixedCaseStaffData.staff,
    {
      id: "staff-retired-004",
      jobId: "900004",
      name: "赵历史",
      type: "nurse",
      isAdmin: false,
      enabled: false,
      sortOrder: 4
    }
  ],
  scheduleEntries: [
    {
      id: "2026-06-18__staff-nurse-001",
      date: "2026-06-18",
      staffId: "staff-nurse-001",
      shiftIds: ["shift-a1"],
      note: ""
    },
    {
      id: "2026-06-24__staff-nurse-002",
      date: "2026-06-24",
      staffId: "staff-nurse-002",
      shiftIds: ["shift-a1"],
      note: ""
    },
    {
      id: "2026-06-24__staff-retired-004",
      date: "2026-06-24",
      staffId: "staff-retired-004",
      shiftIds: ["shift-rest"],
      note: "historical"
    },
    {
      id: "2026-07-01__staff-retired-004",
      date: "2026-07-01",
      staffId: "staff-retired-004",
      shiftIds: ["shift-a1"],
      note: "outside first query"
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
  props: ["selectedDate"],
  emits: ["update:selectedDate"],
  template: `
    <section data-testid="schedule-week-controls">
      <span class="schedule-week-number">第26周</span>
      <span class="schedule-week-range">2026-06-22 - 2026-06-28</span>
      <button data-testid="jump-date" type="button" @click="$emit('update:selectedDate', '2026-07-01')">
        jump
      </button>
      <button data-testid="jump-same-month-date" type="button" @click="$emit('update:selectedDate', '2026-06-20')">
        jump same month
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

const ScheduleQueryResultsStub = defineComponent({
  name: "ScheduleQueryResults",
  props: ["weekGroups", "staff", "entries"],
  emits: ["quickFill", "editCell"],
  template: `
    <section data-testid="schedule-query-results">
      <span data-testid="query-week-groups">
        {{ weekGroups.map((group) => group.start + '-' + group.end + ':' + group.days.map((day) => day.key).join('|')).join(';') }}
      </span>
      <span data-testid="query-staff-ids">{{ staff.map((person) => person.id).join(",") }}</span>
      <span data-testid="query-entry-count">{{ entries.length }}</span>
      <button
        data-testid="emit-query-quick-fill"
        type="button"
        @click="$emit('quickFill', 'staff-nurse-001', '2026-06-18')"
      >
        query quick fill
      </button>
      <button
        data-testid="emit-query-edit-cell"
        type="button"
        @click="$emit('editCell', 'staff-nurse-001', '2026-06-18')"
      >
        query edit
      </button>
    </section>
  `
});

const WeeklySummaryStub = defineComponent({
  name: "WeeklySummary",
  props: ["summary"],
  template: '<section data-testid="weekly-summary">{{ summary.weekStart }}-{{ summary.weekEnd }}</section>'
});

const LoginPageStub = defineComponent({
  name: "LoginPage",
  emits: ["login"],
  template: `
    <section data-testid="login-page">
      <button
        data-testid="login-submit"
        type="button"
        @click="$emit('login', { username: 'admin', password: 'admin-password' })"
      >
        login
      </button>
    </section>
  `
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
  props: [
    "modelValue",
    "mode",
    "users",
    "auditLogs",
    "auditTotal",
    "adminMode",
    "staffSaving",
    "shiftSaving",
    "holidaySaving",
    "userSaving"
  ],
  emits: [
    "saveStaff",
    "deleteStaff",
    "saveShift",
    "saveHoliday",
    "deleteHoliday",
    "saveUser",
    "deleteUser",
    "refreshAuditLogs"
  ],
  template: `
    <section
      v-if="modelValue"
      :data-testid="mode === 'inline' ? 'management-inline-panel' : 'management-drawer'"
    >
      <span data-testid="management-mode">{{ mode }}</span>
      <span v-if="!adminMode" data-testid="management-permission">无配置权限</span>
      <span data-testid="drawer-users">{{ users.map((user) => user.username).join(",") }}</span>
      <span data-testid="drawer-audit">{{ auditLogs.map((entry) => entry.summary).join(",") }}</span>
      <span data-testid="drawer-audit-total">{{ auditTotal }}</span>
      <span data-testid="drawer-staff-saving">{{ staffSaving ? "saving" : "idle" }}</span>
      <span data-testid="drawer-shift-saving">{{ shiftSaving ? "saving" : "idle" }}</span>
      <span data-testid="drawer-holiday-saving">{{ holidaySaving ? "saving" : "idle" }}</span>
      <span data-testid="drawer-user-saving">{{ userSaving ? "saving" : "idle" }}</span>
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
        data-testid="drawer-save-shift"
        type="button"
        @click="$emit('saveShift', { id: 'shift-a1', name: 'A1组长', shortName: 'A1', color: '#2563EB', countsAttendance: true, coefficient: 1.5, enabled: true, sortOrder: 1 })"
      >
        save shift
      </button>
      <button
        data-testid="drawer-save-holiday"
        type="button"
        @click="$emit('saveHoliday', { id: 'holiday-dragon', date: '2026-06-19', name: '端午节', affectsRequiredAttendance: true })"
      >
        save holiday
      </button>
      <button
        data-testid="drawer-delete-holiday"
        type="button"
        @click="$emit('deleteHoliday', 'holiday-dragon')"
      >
        delete holiday
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
        @click="$emit('refreshAuditLogs', { username: 'admin', action: 'user.save', keyword: 'scheduler', page: 2, pageSize: 50 })"
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

const mountedWrappers: Array<{ unmount: () => void }> = [];

function createAuditLogResponse(rows: AuditLogEntry[], total = rows.length): AuditLogListResponse {
  return {
    rows,
    total,
    page: 1,
    pageSize: 20
  };
}

function mountApp(
  appData: PublicAppData = testData,
  authUser: AuthUser | null = testAuthUser,
  options: { attachTo?: HTMLElement } = {}
) {
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
  apiMocks.listAuditLogs.mockResolvedValue(
    createAuditLogResponse([
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
    ])
  );

  const wrapper = mount(App, {
    attachTo: options.attachTo,
    global: {
      stubs: {
        AppToolbar: AppToolbarStub,
        BonusSettlementPanel: BonusSettlementPanelStub,
        CellEditorDialog: CellEditorDialogStub,
        ElButton: ElButtonStub,
        ElDialog: ElDialogStub,
        ElInput: ElInputStub,
        LoginPage: LoginPageStub,
        ManagementDrawer: ManagementDrawerStub,
        PasswordChangeDialog: PasswordChangeDialogStub,
        PrintViews: PrintViewsStub,
        ScheduleGrid: ScheduleGridStub,
        ScheduleQueryResults: ScheduleQueryResultsStub,
        ShiftPalette: ShiftPaletteStub,
        WeeklySummary: WeeklySummaryStub
      }
    }
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

async function enterAdminModeForTest(wrapper: ReturnType<typeof mountApp>) {
  await flushPromises();
  expect(wrapper.get('[data-testid="header-user-menu-button"]').text()).toContain("admin");
}

async function openBonusTab(wrapper: ReturnType<typeof mountApp>) {
  await wrapper.get('[data-testid="workbench-tab-bonus"]').trigger("click");
}

async function openQueryTab(wrapper: ReturnType<typeof mountApp>) {
  await wrapper.get('[data-testid="workbench-tab-query"]').trigger("click");
}

async function openPrintTab(wrapper: ReturnType<typeof mountApp>) {
  await wrapper.get('[data-testid="workbench-tab-print"]').trigger("click");
}

async function openPrintWeekTab(wrapper: ReturnType<typeof mountApp>) {
  await openPrintTab(wrapper);
  await wrapper.get('[data-testid="print-mode-week"]').trigger("click");
}

async function openPrintMonthTab(wrapper: ReturnType<typeof mountApp>) {
  await openPrintTab(wrapper);
  await wrapper.get('[data-testid="print-mode-month"]').trigger("click");
}

function createDeferred<T>(): { promise: Promise<T>; reject: (reason?: unknown) => void; resolve: (value: T) => void } {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });

  return { promise, reject, resolve };
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
    for (const wrapper of mountedWrappers.splice(0).reverse()) {
      wrapper.unmount();
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    delete document.body.dataset.printMode;
    document.body.innerHTML = "";
  });

  it("moves usage, permission, and calculation guidance into the help tab", async () => {
    const wrapper = mountApp();

    await flushPromises();

    expect(wrapper.find(".app-info-panel").exists()).toBe(false);
    expect(wrapper.find(".admin-mode-banner").exists()).toBe(false);
    expect(wrapper.find('[data-testid="workbench-panel-help"]').exists()).toBe(true);
    expectPanelHidden(wrapper, "workbench-panel-help");

    await wrapper.get('[data-testid="workbench-tab-help"]').trigger("click");
    await nextTick();

    expectPanelVisible(wrapper, "workbench-panel-help");
    const helpPanel = wrapper.get('[data-testid="workbench-panel-help"]');
    expect(helpPanel.text()).toContain("快速上手");
    expect(helpPanel.text()).toContain("通过日期选择或上一周、本周、下一周定位自然周");
    expect(helpPanel.text()).toContain("选择画笔班次");
    expect(helpPanel.text()).toContain("人员权限");
    expect(helpPanel.text()).toContain("系统管理员：可查看全科排班，可维护人员、班次、节假日、账号、排班和月结");
    expect(helpPanel.text()).toContain("排班管理员：可查看全科排班，只能维护账号可管理人员范围内的排班和月结");
    expect(helpPanel.text()).toContain("只读查看：可查看排班、查询、周统计和月结结果，不能保存修改");
    expect(helpPanel.text()).toContain("绑定人员只用于标识账号本人");
    expect(helpPanel.text()).toContain("核算规则");
    expect(helpPanel.text()).toContain("按班次而不是自然日计出勤");
    expect(helpPanel.text()).toContain("加班 = max(0, 出勤班次 - 满勤标准)");
    expect(helpPanel.text()).toContain("护士长绩效系数单独核算");
    expect(helpPanel.text()).toContain("班次系数");
    expect(helpPanel.text()).toContain("A1组长 1.50");
    expect(helpPanel.text()).toContain("休息 不计出勤");
  });

  it("shows the current user in the header and supports logging out", async () => {
    apiMocks.logout.mockResolvedValue(undefined);
    const wrapper = mountApp();

    await flushPromises();
    const userButton = wrapper.get('[data-testid="header-user-menu-button"]');
    expect(userButton.text()).toBe("当前用户：admin");
    expect(userButton.text()).not.toContain("系统管理员");
    expect(wrapper.find(".week-chip").exists()).toBe(false);
    expect(wrapper.find('[data-testid="current-user"]').exists()).toBe(false);

    await userButton.trigger("click");
    await nextTick();
    await wrapper.get('[data-testid="logout-button"]').trigger("click");
    await flushPromises();

    expect(apiMocks.logout).toHaveBeenCalled();
    expect(wrapper.find(".app-shell").exists()).toBe(false);
  });

  it("returns to the schedule panel after logout from config and login again", async () => {
    apiMocks.logout.mockResolvedValueOnce(undefined);
    apiMocks.login.mockResolvedValueOnce(testAuthUser);
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await flushPromises();
    const listUsersCallCountBeforeLogout = apiMocks.listUsers.mock.calls.length;
    const listAuditLogsCallCountBeforeLogout = apiMocks.listAuditLogs.mock.calls.length;

    expectPanelVisible(wrapper, "workbench-panel-config");
    expect(wrapper.get('[data-testid="drawer-users"]').text()).toContain("admin");
    expect(wrapper.get('[data-testid="drawer-audit"]').text()).toContain("保存账号：scheduler");

    await wrapper.get('[data-testid="header-user-menu-button"]').trigger("click");
    await nextTick();
    await wrapper.get('[data-testid="logout-button"]').trigger("click");
    await flushPromises();

    expect(wrapper.find(".app-shell").exists()).toBe(false);
    expect(wrapper.find('[data-testid="login-page"]').exists()).toBe(true);

    await wrapper.get('[data-testid="login-submit"]').trigger("click");
    await flushPromises();

    expect(apiMocks.login).toHaveBeenCalledWith("admin", "admin-password");
    expectPanelVisible(wrapper, "workbench-panel-schedule");
    expectPanelHidden(wrapper, "workbench-panel-config");
    expect(wrapper.find('[data-testid="management-inline-panel"]').exists()).toBe(false);
    expect(apiMocks.listUsers).toHaveBeenCalledTimes(listUsersCallCountBeforeLogout);
    expect(apiMocks.listAuditLogs).toHaveBeenCalledTimes(listAuditLogsCallCountBeforeLogout);
  });

  it("shows only the scheduler account in the header identity", async () => {
    const wrapper = mountApp(testData, createSchedulerUser(["staff-nurse-001"]));

    await flushPromises();

    const userButtonText = wrapper.get('[data-testid="header-user-menu-button"]').text();
    expect(userButtonText).toBe("当前用户：scheduler");
    expect(userButtonText).not.toContain("排班员");
    expect(userButtonText).not.toContain("排班管理员");
  });

  it("shows only the current user trigger in the header actions", async () => {
    const wrapper = mountApp();

    await flushPromises();

    const headerActions = wrapper.get(".app-header-actions");
    expect(headerActions.find('[data-testid="open-management"]').exists()).toBe(false);
    expect(headerActions.find('[data-testid="print-week"]').exists()).toBe(false);
    expect(headerActions.find('[data-testid="print-month"]').exists()).toBe(false);
    expect(headerActions.get('[data-testid="header-user-menu-button"]').text()).toBe("当前用户：admin");
    expect(headerActions.text()).not.toContain("全屏");
    expect(wrapper.find('[data-testid="fullscreen-button"]').exists()).toBe(false);
    expect(wrapper.get(".app-header").text()).not.toContain("系统管理员");
    expect(wrapper.get(".app-header").text()).not.toContain("排班管理员");
  });

  it("opens user menu with password change and logout actions", async () => {
    const wrapper = mountApp();

    await flushPromises();
    expect(wrapper.get(".app-header").classes()).not.toContain("user-menu-open");
    expect(wrapper.find(".header-user-dropdown").exists()).toBe(false);

    await wrapper.get('[data-testid="header-user-menu-button"]').trigger("click");
    await nextTick();

    expect(wrapper.get(".app-header").classes()).not.toContain("user-menu-open");
    const dropdown = wrapper.get(".header-user-dropdown");
    expect(dropdown.attributes("role")).toBe("menu");
    expect(dropdown.get('[data-testid="open-password-change"]').text()).toContain("修改密码");
    expect(dropdown.get('[data-testid="logout-button"]').text()).toContain("退出登录");
  });

  it("closes the user menu with Escape and returns focus to the user button", async () => {
    const wrapper = mountApp(testData, testAuthUser, { attachTo: document.body });

    await flushPromises();
    const userButton = wrapper.get('[data-testid="header-user-menu-button"]');
    await userButton.trigger("click");
    await nextTick();
    expect(userButton.attributes("aria-expanded")).toBe("true");

    await wrapper.get(".header-user-menu").trigger("keydown", { key: "Escape" });
    await nextTick();

    expect(wrapper.find(".header-user-dropdown").exists()).toBe(false);
    expect(wrapper.get(".app-header").classes()).not.toContain("user-menu-open");
    expect(userButton.attributes("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(userButton.element);
  });

  it("closes the user menu when clicking outside it", async () => {
    const wrapper = mountApp();

    await flushPromises();
    const userButton = wrapper.get('[data-testid="header-user-menu-button"]');
    await userButton.trigger("click");
    await nextTick();
    expect(userButton.attributes("aria-expanded")).toBe("true");

    document.body.click();
    await nextTick();

    expect(wrapper.find(".header-user-dropdown").exists()).toBe(false);
    expect(wrapper.get(".app-header").classes()).not.toContain("user-menu-open");
    expect(userButton.attributes("aria-expanded")).toBe("false");
  });

  it("loads users and audit logs when opening the config tab", async () => {
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await flushPromises();

    expect(apiMocks.loadData).toHaveBeenCalledTimes(2);
    expect(apiMocks.listUsers).toHaveBeenCalled();
    expect(apiMocks.listAuditLogs).toHaveBeenCalledWith(
      { page: 1, pageSize: 20 },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expectPanelVisible(wrapper, "workbench-panel-config");
    expect(wrapper.find('[data-testid="management-inline-panel"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="management-mode"]').text()).toBe("inline");
    expect(wrapper.get('[data-testid="drawer-users"]').text()).toContain("admin");
    expect(wrapper.get('[data-testid="drawer-audit"]').text()).toContain("保存账号：scheduler");
  });

  it("passes abort signals to config read requests", async () => {
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await flushPromises();

    expect(apiMocks.loadData.mock.calls[1][0]).toEqual(
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(apiMocks.listUsers.mock.calls[0][0]).toEqual(
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(apiMocks.listAuditLogs.mock.calls[0][1]).toEqual(
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("aborts an in-flight config data request when leaving the config tab", async () => {
    const configLoad = createDeferred<PublicAppData>();
    const wrapper = mountApp();

    await flushPromises();
    apiMocks.loadData.mockReturnValueOnce(configLoad.promise);
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await nextTick();

    const configLoadSignal = apiMocks.loadData.mock.calls[1][0]?.signal as AbortSignal;
    expect(configLoadSignal.aborted).toBe(false);

    await wrapper.get('[data-testid="workbench-tab-schedule"]').trigger("click");

    expect(configLoadSignal.aborted).toBe(true);
  });

  it("aborts an in-flight config data request on logout", async () => {
    const configLoad = createDeferred<PublicAppData>();
    apiMocks.logout.mockResolvedValue(undefined);
    const wrapper = mountApp();

    await flushPromises();
    apiMocks.loadData.mockReturnValueOnce(configLoad.promise);
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await nextTick();

    const configLoadSignal = apiMocks.loadData.mock.calls[1][0]?.signal as AbortSignal;
    expect(configLoadSignal.aborted).toBe(false);

    await wrapper.get('[data-testid="header-user-menu-button"]').trigger("click");
    await nextTick();
    await wrapper.get('[data-testid="logout-button"]').trigger("click");

    expect(configLoadSignal.aborted).toBe(true);
  });

  it("aborts in-flight management data requests when leaving the config tab", async () => {
    const usersRequest = createDeferred<{ rows: ManagedAuthUser[] }>();
    const auditRequest = createDeferred<AuditLogListResponse>();
    const wrapper = mountApp();

    await flushPromises();
    apiMocks.listUsers.mockReturnValueOnce(usersRequest.promise);
    apiMocks.listAuditLogs.mockReturnValueOnce(auditRequest.promise);
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await flushPromises();

    const usersSignal = apiMocks.listUsers.mock.calls[0][0]?.signal as AbortSignal;
    const auditSignal = apiMocks.listAuditLogs.mock.calls[0][1]?.signal as AbortSignal;
    expect(usersSignal.aborted).toBe(false);
    expect(auditSignal.aborted).toBe(false);

    await wrapper.get('[data-testid="workbench-tab-schedule"]').trigger("click");

    expect(usersSignal.aborted).toBe(true);
    expect(auditSignal.aborted).toBe(true);
  });

  it("shows configuration permission state for non-admin users", async () => {
    const wrapper = mountApp(testData, createSchedulerUser(["staff-nurse-001"]));

    await flushPromises();
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await flushPromises();

    expect(apiMocks.listUsers).not.toHaveBeenCalled();
    expect(apiMocks.listAuditLogs).not.toHaveBeenCalled();
    expectPanelVisible(wrapper, "workbench-panel-config");
    expect(wrapper.find('[data-testid="management-inline-panel"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="management-permission"]').text()).toContain("无配置权限");
  });

  it("blocks non-admin audit refresh events from calling privileged APIs", async () => {
    const wrapper = mountApp(testData, createSchedulerUser(["staff-nurse-001"]));

    await flushPromises();
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="drawer-refresh-audit"]').trigger("click");
    await flushPromises();

    expect(apiMocks.listUsers).not.toHaveBeenCalled();
    expect(apiMocks.listAuditLogs).not.toHaveBeenCalled();
  });

  it("allows admins to refresh audit logs from the config panel", async () => {
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await flushPromises();
    const listAuditLogsCallCountBeforeRefresh = apiMocks.listAuditLogs.mock.calls.length;

    await wrapper.get('[data-testid="drawer-refresh-audit"]').trigger("click");
    await flushPromises();

    expect(apiMocks.listAuditLogs).toHaveBeenCalledTimes(listAuditLogsCallCountBeforeRefresh + 1);
    expect(apiMocks.listAuditLogs).toHaveBeenLastCalledWith(
      {
        username: "admin",
        action: "user.save",
        keyword: "scheduler",
        page: 2,
        pageSize: 50
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("blocks non-admin config mutation events from calling privileged APIs", async () => {
    apiMocks.saveStaff.mockResolvedValue(structuredClone(testData));
    apiMocks.deleteStaff.mockResolvedValue(structuredClone(testData));
    apiMocks.saveShift.mockResolvedValue(structuredClone(testData));
    apiMocks.saveHoliday.mockResolvedValue(structuredClone(testData));
    apiMocks.deleteHoliday.mockResolvedValue(structuredClone(testData));
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
    apiMocks.deleteUser.mockResolvedValue({ ok: true });
    const wrapper = mountApp(testData, createSchedulerUser(["staff-nurse-001"]));

    await flushPromises();
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await flushPromises();

    for (const testId of [
      "drawer-save-staff",
      "drawer-delete-staff",
      "drawer-save-shift",
      "drawer-save-holiday",
      "drawer-delete-holiday",
      "drawer-save-user",
      "drawer-delete-user"
    ]) {
      await wrapper.get(`[data-testid="${testId}"]`).trigger("click");
    }
    await flushPromises();

    expect(apiMocks.saveStaff).not.toHaveBeenCalled();
    expect(apiMocks.deleteStaff).not.toHaveBeenCalled();
    expect(apiMocks.saveShift).not.toHaveBeenCalled();
    expect(apiMocks.saveHoliday).not.toHaveBeenCalled();
    expect(apiMocks.deleteHoliday).not.toHaveBeenCalled();
    expect(apiMocks.saveUser).not.toHaveBeenCalled();
    expect(apiMocks.deleteUser).not.toHaveBeenCalled();
    expect(apiMocks.listUsers).not.toHaveBeenCalled();
    expect(apiMocks.listAuditLogs).not.toHaveBeenCalled();
  });

  it("allows admins to save and delete shift and holiday configuration", async () => {
    apiMocks.saveShift.mockResolvedValue(structuredClone(testData));
    apiMocks.saveHoliday.mockResolvedValue(structuredClone(testData));
    apiMocks.deleteHoliday.mockResolvedValue(structuredClone(testData));
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="drawer-save-shift"]').trigger("click");
    await wrapper.get('[data-testid="drawer-save-holiday"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="drawer-delete-holiday"]').trigger("click");
    await flushPromises();

    expect(apiMocks.saveShift).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "shift-a1",
        name: "A1组长",
        shortName: "A1"
      })
    );
    expect(apiMocks.saveHoliday).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "holiday-dragon",
        date: "2026-06-19",
        name: "端午节"
      })
    );
    expect(apiMocks.deleteHoliday).toHaveBeenCalledWith("holiday-dragon");
  });

  it("ignores stale config data after leaving the config tab", async () => {
    const staleConfigLoad = createDeferred<PublicAppData>();
    const staleConfigData = structuredClone(testData);
    staleConfigData.staff = [
      {
        id: "staff-stale-config",
        jobId: "999999",
        name: "过期人员",
        type: "nurse",
        isAdmin: false,
        enabled: true,
        sortOrder: 99
      }
    ];
    const wrapper = mountApp();

    await flushPromises();
    apiMocks.loadData.mockReturnValueOnce(staleConfigLoad.promise);
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await nextTick();
    await wrapper.get('[data-testid="workbench-tab-schedule"]').trigger("click");

    staleConfigLoad.resolve(staleConfigData);
    await flushPromises();

    expectPanelVisible(wrapper, "workbench-panel-schedule");
    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).toContain("staff-nurse-001");
    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).not.toContain("staff-stale-config");
  });

  it("ignores a stale config load after a newer config mutation applies", async () => {
    const staleConfigLoad = createDeferred<PublicAppData>();
    const staleConfigData = structuredClone(testData);
    const newerMutationData = structuredClone(testData);
    staleConfigData.staff = [
      {
        id: "staff-stale-config-load",
        jobId: "333333",
        name: "过期配置加载人员",
        type: "nurse",
        isAdmin: false,
        enabled: true,
        sortOrder: 33
      }
    ];
    newerMutationData.staff = [
      {
        id: "staff-newer-mutation",
        jobId: "222222",
        name: "较新保存人员",
        type: "nurse",
        isAdmin: false,
        enabled: true,
        sortOrder: 22
      }
    ];
    apiMocks.saveStaff.mockResolvedValueOnce(newerMutationData);
    const wrapper = mountApp();

    await flushPromises();
    apiMocks.loadData.mockReturnValueOnce(staleConfigLoad.promise);
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await nextTick();

    const configLoadSignal = apiMocks.loadData.mock.calls[1][0]?.signal as AbortSignal;
    expect(configLoadSignal.aborted).toBe(false);

    await wrapper.get('[data-testid="drawer-save-staff"]').trigger("click");
    await flushPromises();

    expect(configLoadSignal.aborted).toBe(true);
    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).toContain("staff-newer-mutation");

    staleConfigLoad.resolve(staleConfigData);
    await flushPromises();

    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).toContain("staff-newer-mutation");
    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).not.toContain("staff-stale-config-load");
  });

  it("does not apply an in-flight staff save after leaving the config tab", async () => {
    const saveStaffRequest = createDeferred<PublicAppData>();
    const staleSaveData = structuredClone(testData);
    staleSaveData.staff = [
      {
        id: "staff-stale-save",
        jobId: "888888",
        name: "保存后过期人员",
        type: "nurse",
        isAdmin: false,
        enabled: true,
        sortOrder: 88
      }
    ];
    apiMocks.saveStaff.mockReturnValueOnce(saveStaffRequest.promise);
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="drawer-save-staff"]').trigger("click");
    await nextTick();
    await wrapper.get('[data-testid="workbench-tab-schedule"]').trigger("click");

    saveStaffRequest.resolve(staleSaveData);
    await flushPromises();

    expectPanelVisible(wrapper, "workbench-panel-schedule");
    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).toContain("staff-nurse-001");
    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).not.toContain("staff-stale-save");
  });

  it("clears stale staff save loading on config exit without clearing a newer save", async () => {
    const staleSaveRequest = createDeferred<PublicAppData>();
    const currentSaveRequest = createDeferred<PublicAppData>();
    const staleSaveData = structuredClone(testData);
    const currentSaveData = structuredClone(testData);
    staleSaveData.staff = [
      {
        id: "staff-stale-save",
        jobId: "888888",
        name: "保存后过期人员",
        type: "nurse",
        isAdmin: false,
        enabled: true,
        sortOrder: 88
      }
    ];
    currentSaveData.staff = [
      {
        id: "staff-current-save",
        jobId: "777777",
        name: "当前保存人员",
        type: "nurse",
        isAdmin: false,
        enabled: true,
        sortOrder: 77
      }
    ];
    apiMocks.saveStaff.mockReturnValueOnce(staleSaveRequest.promise);
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="drawer-save-staff"]').trigger("click");
    await nextTick();

    expect(wrapper.get('[data-testid="drawer-staff-saving"]').text()).toBe("saving");

    await wrapper.get('[data-testid="workbench-tab-schedule"]').trigger("click");
    await nextTick();
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-testid="drawer-staff-saving"]').text()).toBe("idle");

    apiMocks.saveStaff.mockReturnValueOnce(currentSaveRequest.promise);
    await wrapper.get('[data-testid="drawer-save-staff"]').trigger("click");
    await nextTick();

    expect(wrapper.get('[data-testid="drawer-staff-saving"]').text()).toBe("saving");

    staleSaveRequest.resolve(staleSaveData);
    await flushPromises();

    expect(wrapper.get('[data-testid="drawer-staff-saving"]').text()).toBe("saving");

    currentSaveRequest.resolve(currentSaveData);
    await flushPromises();

    expect(wrapper.get('[data-testid="drawer-staff-saving"]').text()).toBe("idle");

    await wrapper.get('[data-testid="workbench-tab-schedule"]').trigger("click");
    await nextTick();

    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).toContain("staff-current-save");
    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).not.toContain("staff-stale-save");
  });

  it("ignores an older staff save after a newer config mutation starts", async () => {
    const olderStaffSaveRequest = createDeferred<PublicAppData>();
    const newerShiftSaveRequest = createDeferred<PublicAppData>();
    const olderStaffData = structuredClone(testData);
    const newerShiftData = structuredClone(testData);
    olderStaffData.staff = [
      {
        id: "staff-older-overlap",
        jobId: "666666",
        name: "较早保存人员",
        type: "nurse",
        isAdmin: false,
        enabled: true,
        sortOrder: 66
      }
    ];
    newerShiftData.staff = [
      {
        id: "staff-newer-overlap",
        jobId: "555555",
        name: "较新保存人员",
        type: "nurse",
        isAdmin: false,
        enabled: true,
        sortOrder: 55
      }
    ];
    apiMocks.saveStaff.mockReturnValueOnce(olderStaffSaveRequest.promise);
    apiMocks.saveShift.mockReturnValueOnce(newerShiftSaveRequest.promise);
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="drawer-save-staff"]').trigger("click");
    await nextTick();

    expect(wrapper.get('[data-testid="drawer-staff-saving"]').text()).toBe("saving");

    await wrapper.get('[data-testid="drawer-save-shift"]').trigger("click");
    await nextTick();

    expect(wrapper.get('[data-testid="drawer-staff-saving"]').text()).toBe("idle");
    expect(wrapper.get('[data-testid="drawer-shift-saving"]').text()).toBe("saving");

    const listAuditLogsCallCountBeforeOlderResolve = apiMocks.listAuditLogs.mock.calls.length;
    olderStaffSaveRequest.resolve(olderStaffData);
    await flushPromises();

    expect(apiMocks.listAuditLogs).toHaveBeenCalledTimes(listAuditLogsCallCountBeforeOlderResolve);
    expect(wrapper.get('[data-testid="drawer-shift-saving"]').text()).toBe("saving");
    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).toContain("staff-nurse-001");
    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).not.toContain("staff-older-overlap");

    newerShiftSaveRequest.resolve(newerShiftData);
    await flushPromises();

    expect(wrapper.get('[data-testid="drawer-shift-saving"]').text()).toBe("idle");
    expect(apiMocks.listAuditLogs).toHaveBeenCalledTimes(listAuditLogsCallCountBeforeOlderResolve + 1);
    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).toContain("staff-newer-overlap");
    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).not.toContain("staff-older-overlap");
  });

  it("ignores an older mutation audit refresh after a newer config mutation starts", async () => {
    const olderAuditRefresh = createDeferred<AuditLogListResponse>();
    const newerShiftSaveRequest = createDeferred<PublicAppData>();
    const newerAuditRefresh = createDeferred<AuditLogListResponse>();
    const newerShiftData = structuredClone(testData);
    const olderAuditRows: AuditLogEntry[] = [
      {
        id: "audit-older-mutation-refresh",
        occurredAt: "2026-06-19T00:00:00.000Z",
        userId: "user-admin",
        username: "admin",
        action: "staff.save",
        targetType: "staff",
        targetId: "staff-nurse-001",
        summary: "较早保存后的审计日志",
        ip: "127.0.0.1",
        userAgent: "vitest"
      }
    ];
    const newerAuditRows: AuditLogEntry[] = [
      {
        id: "audit-newer-mutation-refresh",
        occurredAt: "2026-06-19T00:01:00.000Z",
        userId: "user-admin",
        username: "admin",
        action: "shift.save",
        targetType: "shift",
        targetId: "shift-a1",
        summary: "较新保存后的审计日志",
        ip: "127.0.0.1",
        userAgent: "vitest"
      }
    ];
    newerShiftData.staff = [
      {
        id: "staff-newer-refresh",
        jobId: "444444",
        name: "较新刷新人员",
        type: "nurse",
        isAdmin: false,
        enabled: true,
        sortOrder: 44
      }
    ];
    apiMocks.saveStaff.mockResolvedValueOnce(structuredClone(testData));
    apiMocks.saveShift.mockReturnValueOnce(newerShiftSaveRequest.promise);
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await flushPromises();
    apiMocks.listAuditLogs.mockReturnValueOnce(olderAuditRefresh.promise);
    await wrapper.get('[data-testid="drawer-save-staff"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-testid="drawer-staff-saving"]').text()).toBe("saving");

    await wrapper.get('[data-testid="drawer-save-shift"]').trigger("click");
    await nextTick();

    expect(wrapper.get('[data-testid="drawer-shift-saving"]').text()).toBe("saving");

    olderAuditRefresh.resolve(createAuditLogResponse(olderAuditRows));
    await flushPromises();

    expect(wrapper.get('[data-testid="drawer-shift-saving"]').text()).toBe("saving");
    expect(wrapper.get('[data-testid="drawer-audit"]').text()).toContain("保存账号：scheduler");
    expect(wrapper.get('[data-testid="drawer-audit"]').text()).not.toContain("较早保存后的审计日志");

    apiMocks.listAuditLogs.mockReturnValueOnce(newerAuditRefresh.promise);
    newerShiftSaveRequest.resolve(newerShiftData);
    await flushPromises();

    expect(wrapper.get('[data-testid="drawer-shift-saving"]').text()).toBe("saving");

    newerAuditRefresh.resolve(createAuditLogResponse(newerAuditRows));
    await flushPromises();

    expect(wrapper.get('[data-testid="drawer-shift-saving"]').text()).toBe("idle");
    expect(wrapper.get('[data-testid="drawer-audit"]').text()).toContain("较新保存后的审计日志");
    expect(wrapper.get('[data-testid="drawer-audit"]').text()).not.toContain("较早保存后的审计日志");
    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).toContain("staff-newer-refresh");
  });

  it("does not refresh management users or show success after an in-flight config user save resolves post-logout", async () => {
    const saveUserRequest = createDeferred<{ user: ManagedAuthUser }>();
    const logoutRequest = createDeferred<void>();
    apiMocks.logout.mockReturnValueOnce(logoutRequest.promise);
    apiMocks.saveUser.mockReturnValueOnce(saveUserRequest.promise);
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await flushPromises();
    const listUsersCallCountBeforeSave = apiMocks.listUsers.mock.calls.length;
    const listAuditLogsCallCountBeforeSave = apiMocks.listAuditLogs.mock.calls.length;

    await wrapper.get('[data-testid="drawer-save-user"]').trigger("click");
    await nextTick();
    await wrapper.get('[data-testid="header-user-menu-button"]').trigger("click");
    await nextTick();
    await wrapper.get('[data-testid="logout-button"]').trigger("click");
    await nextTick();

    saveUserRequest.resolve({
      user: {
        id: "user-stale-save",
        username: "stale-save",
        displayName: "保存后过期账号",
        role: "admin",
        staffId: null,
        managedStaffIds: [],
        enabled: true,
        createdAt: "2026-06-19T00:00:00.000Z",
        updatedAt: "2026-06-19T00:00:00.000Z"
      }
    });
    await flushPromises();

    expect(apiMocks.listUsers).toHaveBeenCalledTimes(listUsersCallCountBeforeSave);
    expect(apiMocks.listAuditLogs).toHaveBeenCalledTimes(listAuditLogsCallCountBeforeSave);
    expect(elementPlusMocks.ElMessage.success).not.toHaveBeenCalledWith("账号已保存");

    logoutRequest.resolve();
    await flushPromises();
  });

  it("ignores stale management users and audit logs after leaving the config tab", async () => {
    const staleUsersRequest = createDeferred<{ rows: ManagedAuthUser[] }>();
    const staleAuditRequest = createDeferred<AuditLogListResponse>();
    const nextUsersRequest = createDeferred<{ rows: ManagedAuthUser[] }>();
    const nextAuditRequest = createDeferred<AuditLogListResponse>();
    const staleUsers: ManagedAuthUser[] = [
      {
        id: "user-stale",
        username: "stale-user",
        displayName: "过期账号",
        role: "admin",
        staffId: null,
        managedStaffIds: [],
        enabled: true,
        createdAt: "2026-06-19T00:00:00.000Z",
        updatedAt: "2026-06-19T00:00:00.000Z"
      }
    ];
    const staleAuditLogs: AuditLogEntry[] = [
      {
        id: "audit-stale",
        occurredAt: "2026-06-19T00:00:00.000Z",
        userId: "user-stale",
        username: "stale-user",
        action: "user.save",
        targetType: "user",
        targetId: "user-stale",
        summary: "过期审计日志",
        ip: "127.0.0.1",
        userAgent: "vitest"
      }
    ];
    const wrapper = mountApp();

    await flushPromises();
    apiMocks.listUsers.mockReturnValueOnce(staleUsersRequest.promise);
    apiMocks.listAuditLogs.mockReturnValueOnce(staleAuditRequest.promise);
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="workbench-tab-schedule"]').trigger("click");

    staleUsersRequest.resolve({ rows: staleUsers });
    staleAuditRequest.resolve(createAuditLogResponse(staleAuditLogs));
    await flushPromises();

    apiMocks.listUsers.mockReturnValueOnce(nextUsersRequest.promise);
    apiMocks.listAuditLogs.mockReturnValueOnce(nextAuditRequest.promise);
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await nextTick();

    expect(wrapper.get('[data-testid="drawer-users"]').text()).not.toContain("stale-user");
    expect(wrapper.get('[data-testid="drawer-audit"]').text()).not.toContain("过期审计日志");
  });

  it("keeps management users when a standalone audit refresh wins the audit race", async () => {
    const managementUsersRequest = createDeferred<{ rows: ManagedAuthUser[] }>();
    const managementAuditRequest = createDeferred<AuditLogListResponse>();
    const standaloneAuditRequest = createDeferred<AuditLogListResponse>();
    const loadedUsers: ManagedAuthUser[] = [
      {
        id: "user-loaded",
        username: "loaded-user",
        displayName: "已加载账号",
        role: "admin",
        staffId: null,
        managedStaffIds: [],
        enabled: true,
        createdAt: "2026-06-19T00:00:00.000Z",
        updatedAt: "2026-06-19T00:00:00.000Z"
      }
    ];
    const olderManagementAudit: AuditLogEntry[] = [
      {
        id: "audit-older-management",
        occurredAt: "2026-06-19T00:00:00.000Z",
        userId: "user-admin",
        username: "admin",
        action: "config.load",
        targetType: "config",
        targetId: "management",
        summary: "older audit",
        ip: "127.0.0.1",
        userAgent: "vitest"
      }
    ];
    const newerStandaloneAudit: AuditLogEntry[] = [
      {
        id: "audit-newer-standalone",
        occurredAt: "2026-06-19T00:01:00.000Z",
        userId: "user-admin",
        username: "admin",
        action: "audit.refresh",
        targetType: "audit",
        targetId: "standalone",
        summary: "newer audit",
        ip: "127.0.0.1",
        userAgent: "vitest"
      }
    ];
    const wrapper = mountApp();

    await flushPromises();
    apiMocks.listUsers.mockReturnValueOnce(managementUsersRequest.promise);
    apiMocks.listAuditLogs.mockReturnValueOnce(managementAuditRequest.promise);
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await flushPromises();

    apiMocks.listAuditLogs.mockReturnValueOnce(standaloneAuditRequest.promise);
    await wrapper.get('[data-testid="drawer-refresh-audit"]').trigger("click");
    await nextTick();

    standaloneAuditRequest.resolve(createAuditLogResponse(newerStandaloneAudit));
    await flushPromises();

    expect(wrapper.get('[data-testid="drawer-audit"]').text()).toContain("newer audit");

    managementUsersRequest.resolve({ rows: loadedUsers });
    managementAuditRequest.resolve(createAuditLogResponse(olderManagementAudit));
    await flushPromises();

    expect(wrapper.get('[data-testid="drawer-users"]').text()).toContain("loaded-user");
    expect(wrapper.get('[data-testid="drawer-audit"]').text()).toContain("newer audit");
    expect(wrapper.get('[data-testid="drawer-audit"]').text()).not.toContain("older audit");
  });

  it("keeps the latest audit refresh results when older requests resolve later", async () => {
    const olderAuditRequest = createDeferred<AuditLogListResponse>();
    const newerAuditRequest = createDeferred<AuditLogListResponse>();
    const olderAuditLogs: AuditLogEntry[] = [
      {
        id: "audit-older",
        occurredAt: "2026-06-19T00:00:00.000Z",
        userId: "user-admin",
        username: "admin",
        action: "user.save",
        targetType: "user",
        targetId: "user-older",
        summary: "较早审计日志",
        ip: "127.0.0.1",
        userAgent: "vitest"
      }
    ];
    const newerAuditLogs: AuditLogEntry[] = [
      {
        id: "audit-newer",
        occurredAt: "2026-06-19T00:01:00.000Z",
        userId: "user-admin",
        username: "admin",
        action: "user.save",
        targetType: "user",
        targetId: "user-newer",
        summary: "最新审计日志",
        ip: "127.0.0.1",
        userAgent: "vitest"
      }
    ];
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await flushPromises();
    apiMocks.listAuditLogs.mockReturnValueOnce(olderAuditRequest.promise);
    apiMocks.listAuditLogs.mockReturnValueOnce(newerAuditRequest.promise);

    await wrapper.get('[data-testid="drawer-refresh-audit"]').trigger("click");
    await wrapper.get('[data-testid="drawer-refresh-audit"]').trigger("click");
    newerAuditRequest.resolve(createAuditLogResponse(newerAuditLogs));
    await flushPromises();

    expect(wrapper.get('[data-testid="drawer-audit"]').text()).toContain("最新审计日志");

    olderAuditRequest.resolve(createAuditLogResponse(olderAuditLogs));
    await flushPromises();

    expect(wrapper.get('[data-testid="drawer-audit"]').text()).toContain("最新审计日志");
    expect(wrapper.get('[data-testid="drawer-audit"]').text()).not.toContain("较早审计日志");
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
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
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
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
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
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await flushPromises();
    const listUsersCallCountBeforeDelete = apiMocks.listUsers.mock.calls.length;
    const listAuditLogsCallCountBeforeDelete = apiMocks.listAuditLogs.mock.calls.length;

    await wrapper.get('[data-testid="drawer-delete-user"]').trigger("click");
    await flushPromises();

    expect(apiMocks.deleteUser).toHaveBeenCalledWith("user-scheduler");
    expect(apiMocks.listUsers).toHaveBeenCalledTimes(listUsersCallCountBeforeDelete + 1);
    expect(apiMocks.listAuditLogs).toHaveBeenCalledTimes(listAuditLogsCallCountBeforeDelete + 1);
  });

  it("refreshes latest audit logs after saving management configuration", async () => {
    apiMocks.saveStaff.mockResolvedValue(structuredClone(testData));
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
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
    expect(apiMocks.listAuditLogs).toHaveBeenLastCalledWith(
      { page: 1, pageSize: 20 },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(apiMocks.listAuditLogs).toHaveBeenCalledTimes(2);
  });

  it("refreshes latest audit logs after deleting a staff member", async () => {
    apiMocks.deleteStaff.mockResolvedValue(structuredClone({ ...testData, staff: [] }));
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="drawer-delete-staff"]').trigger("click");
    await flushPromises();

    expect(apiMocks.deleteStaff).toHaveBeenCalledWith("staff-nurse-001");
    expect(apiMocks.listAuditLogs).toHaveBeenLastCalledWith(
      { page: 1, pageSize: 20 },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(apiMocks.listAuditLogs).toHaveBeenCalledTimes(2);
  });

  it("changes the current password and returns to the login page", async () => {
    apiMocks.changePassword.mockResolvedValue({ ok: true });
    apiMocks.logout.mockResolvedValue(undefined);
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="header-user-menu-button"]').trigger("click");
    await nextTick();
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
    expect(wrapper.find(".admin-mode-banner").exists()).toBe(false);
  });

  it("lets a scheduler with no managed staff view the full schedule without editable cells", async () => {
    const wrapper = mountApp(twoStaffData, createSchedulerUser([]));

    await flushPromises();

    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).toBe("staff-nurse-001,staff-nurse-002");
    expect(wrapper.get('[data-testid="schedule-editable-staff-ids"]').text()).toBe("");
  });

  it("filters schedule staff by name and restores all staff when cleared", async () => {
    const wrapper = mountApp(twoStaffData);

    await flushPromises();

    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).toBe("staff-nurse-001,staff-nurse-002");

    await wrapper.get('[data-testid="schedule-staff-search"]').setValue("王护士");
    await nextTick();

    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).toBe("staff-nurse-002");
    expect(wrapper.get('[data-testid="schedule-staff-search-count"]').text()).toBe("已显示 1 / 2 人");

    await wrapper.get('[data-testid="clear-schedule-staff-search"]').trigger("click");
    await nextTick();

    expect((wrapper.get('[data-testid="schedule-staff-search"]').element as HTMLInputElement).value).toBe("");
    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).toBe("staff-nurse-001,staff-nurse-002");
    expect(wrapper.get('[data-testid="schedule-staff-search-count"]').text()).toBe("已显示 2 / 2 人");
  });

  it("places week controls, schedule search, count, and batch actions in one operation row", async () => {
    const wrapper = mountApp(twoStaffData);

    await flushPromises();

    const operationRow = wrapper.get(".schedule-operation-row");
    expect(operationRow.find('[data-testid="schedule-week-controls"]').exists()).toBe(true);
    expect(operationRow.text()).toContain("搜索人员");
    expect(operationRow.get('[data-testid="schedule-staff-search-count"]').text()).toBe("已显示 2 / 2 人");
    expect(operationRow.find('[data-testid="copy-previous-week-button"]').exists()).toBe(true);
    expect(operationRow.find('[data-testid="batch-rest-week-button"]').exists()).toBe(true);
    expect(operationRow.find('[data-testid="batch-office-week-button"]').exists()).toBe(true);
    expect(operationRow.find('[data-testid="clear-week-button"]').exists()).toBe(true);

    const rowElement = operationRow.element;
    const weekControls = operationRow.get('[data-testid="schedule-week-controls"]').element;
    const search = operationRow.get(".schedule-search").element;
    expect(rowElement.compareDocumentPosition(weekControls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(weekControls.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("filters schedule staff by trimmed case-insensitive job id", async () => {
    const wrapper = mountApp(mixedCaseStaffData);

    await flushPromises();
    await wrapper.get('[data-testid="schedule-staff-search"]').setValue(" abc003 ");
    await nextTick();

    expect(wrapper.get('[data-testid="schedule-staff-ids"]').text()).toBe("staff-clerk-abc");
    expect(wrapper.get('[data-testid="schedule-staff-search-count"]').text()).toBe("已显示 1 / 3 人");
  });

  it("shows an empty state when schedule staff search has no matches", async () => {
    const wrapper = mountApp(twoStaffData);

    await flushPromises();
    await wrapper.get('[data-testid="schedule-staff-search"]').setValue("不存在");
    await nextTick();

    expect(wrapper.find('[data-testid="schedule-staff-ids"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="schedule-staff-search-empty"]').text()).toBe("未找到匹配人员");
    expect(wrapper.get('[data-testid="schedule-staff-search-count"]').text()).toBe("已显示 0 / 2 人");
  });

  it("keeps weekly summary available when schedule staff search has no matches", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17));
    const wrapper = mountApp(twoStaffData);

    await flushPromises();
    await wrapper.get('[data-testid="schedule-staff-search"]').setValue("不存在");
    await wrapper.get('[data-testid="workbench-tab-weekly"]').trigger("click");
    await nextTick();

    expectPanelVisible(wrapper, "workbench-panel-weekly");
    expect(wrapper.get('[data-testid="weekly-summary"]').text()).toContain("2026-06-15-2026-06-21");
    vi.useRealTimers();
  });

  it("adds the query tab between schedule and weekly with the current week selected by default", async () => {
    const wrapper = mountApp(twoStaffData);

    await flushPromises();

    expect(wrapper.findAll(".workbench-tabs button").map((button) => button.text())).toEqual([
      "排班",
      "查询",
      "周统计",
      "月结与奖金",
      "打印",
      "配置",
      "使用说明"
    ]);

    await openQueryTab(wrapper);
    await nextTick();

    expectPanelVisible(wrapper, "workbench-panel-query");
    expectPanelHidden(wrapper, "workbench-panel-weekly");
    expect(wrapper.get('[data-testid="schedule-query-summary"]').text()).toBe("已显示 2 / 2 人；日期 7 天；共 1 周");
    expect(wrapper.find('[data-testid="schedule-query-results"]').exists()).toBe(true);
  });

  it("groups week and month print previews under a single print tab", async () => {
    const wrapper = mountApp();

    await flushPromises();

    expect(wrapper.find('[data-testid="workbench-tab-printWeek"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="workbench-tab-printMonth"]').exists()).toBe(false);

    await openPrintTab(wrapper);
    await nextTick();

    const panel = wrapper.get('[data-testid="workbench-panel-print"]');
    expectPanelVisible(wrapper, "workbench-panel-print");
    expect(panel.get('[data-testid="print-mode-week"]').classes()).toContain("active");
    expect(panel.text()).toContain("周表打印预览");
    expect(panel.get(".print-preview-active").text()).toContain("周表预览");

    await panel.get('[data-testid="print-mode-month"]').trigger("click");
    await nextTick();

    expect(panel.get('[data-testid="print-mode-month"]').classes()).toContain("active");
    expect(panel.text()).toContain("月表打印预览");
    expect(panel.get(".print-preview-active").text()).toContain("月表预览");
  });

  it("splits a custom query range by natural week", async () => {
    const wrapper = mountApp(twoStaffData);

    await flushPromises();
    await openQueryTab(wrapper);
    await wrapper.get('[data-testid="schedule-query-start-date"]').setValue("2026-06-18");
    await wrapper.get('[data-testid="schedule-query-end-date"]').setValue("2026-06-24");
    await nextTick();

    expect(wrapper.get('[data-testid="query-week-groups"]').text()).toBe(
      "2026-06-18-2026-06-21:2026-06-18|2026-06-19|2026-06-20|2026-06-21;" +
        "2026-06-22-2026-06-24:2026-06-22|2026-06-23|2026-06-24"
    );
    expect(wrapper.get('[data-testid="schedule-query-summary"]').text()).toBe("已显示 2 / 2 人；日期 7 天；共 2 周");
  });

  it("filters query staff by trimmed case-insensitive name or job id", async () => {
    const wrapper = mountApp(mixedCaseStaffData);

    await flushPromises();
    await openQueryTab(wrapper);
    await wrapper.get('[data-testid="schedule-query-staff-search"]').setValue(" abc003 ");
    await nextTick();

    expect(wrapper.get('[data-testid="query-staff-ids"]').text()).toBe("staff-clerk-abc");
    expect(wrapper.get('[data-testid="schedule-query-summary"]').text()).toBe("已显示 1 / 3 人；日期 7 天；共 1 周");

    await wrapper.get('[data-testid="schedule-query-staff-search"]').setValue(" 王护士 ");
    await nextTick();

    expect(wrapper.get('[data-testid="query-staff-ids"]').text()).toBe("staff-nurse-002");

    await wrapper.get('[data-testid="schedule-query-staff-search"]').setValue("不存在");
    await nextTick();

    expect(wrapper.find('[data-testid="schedule-query-results"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="schedule-query-empty"]').text()).toBe("未找到匹配人员");
  });

  it("shows disabled historical staff only when the query range contains their entries", async () => {
    const wrapper = mountApp(queryStaffData);

    await flushPromises();
    await openQueryTab(wrapper);
    await wrapper.get('[data-testid="schedule-query-start-date"]').setValue("2026-06-18");
    await wrapper.get('[data-testid="schedule-query-end-date"]').setValue("2026-06-24");
    await nextTick();

    expect(wrapper.get('[data-testid="query-staff-ids"]').text()).toBe(
      "staff-nurse-001,staff-nurse-002,staff-clerk-abc,staff-retired-004"
    );
    expect(wrapper.get('[data-testid="query-entry-count"]').text()).toBe("3");

    await wrapper.get('[data-testid="schedule-query-end-date"]').setValue("2026-06-23");
    await nextTick();

    expect(wrapper.get('[data-testid="query-staff-ids"]').text()).toBe("staff-nurse-001,staff-nurse-002,staff-clerk-abc");
    expect(wrapper.get('[data-testid="query-entry-count"]').text()).toBe("1");
  });

  it("warns for long query ranges while still rendering results", async () => {
    const wrapper = mountApp(twoStaffData);

    await flushPromises();
    await openQueryTab(wrapper);
    await wrapper.get('[data-testid="schedule-query-start-date"]').setValue("2026-01-01");
    await wrapper.get('[data-testid="schedule-query-end-date"]').setValue("2026-07-01");
    await nextTick();

    expect(wrapper.get('[data-testid="schedule-query-warning"]').text()).toBe(
      "当前查询范围较长，结果较多，加载和滚动可能变慢。"
    );
    expect(wrapper.get('[data-testid="schedule-query-summary"]').text()).toBe("已显示 2 / 2 人；日期 182 天；共 27 周");
    expect(wrapper.find('[data-testid="schedule-query-results"]').exists()).toBe(true);
  });

  it("shows range errors and hides stale query results", async () => {
    const wrapper = mountApp(twoStaffData);

    await flushPromises();
    await openQueryTab(wrapper);
    expect(wrapper.find('[data-testid="schedule-query-results"]').exists()).toBe(true);

    await wrapper.get('[data-testid="schedule-query-start-date"]').setValue("2026-06-24");
    await wrapper.get('[data-testid="schedule-query-end-date"]').setValue("2026-06-18");
    await nextTick();

    expect(wrapper.get('[data-testid="schedule-query-error"]').text()).toBe("开始日期不能晚于结束日期");
    expect(wrapper.find('[data-testid="schedule-query-results"]').exists()).toBe(false);
  });

  it("clears query conditions and resumes syncing the query range with the selected week", async () => {
    const wrapper = mountApp(twoStaffData);

    await flushPromises();
    await openQueryTab(wrapper);
    const defaultQueryStartDate = (wrapper.get('[data-testid="schedule-query-start-date"]').element as HTMLInputElement)
      .value;
    const defaultQueryEndDate = (wrapper.get('[data-testid="schedule-query-end-date"]').element as HTMLInputElement).value;
    await wrapper.get('[data-testid="schedule-query-start-date"]').setValue("2026-06-01");
    await wrapper.get('[data-testid="schedule-query-end-date"]').setValue("2026-06-30");
    await wrapper.get('[data-testid="schedule-query-staff-search"]').setValue("王护士");
    await wrapper.get('[data-testid="clear-schedule-query"]').trigger("click");
    await nextTick();

    expect((wrapper.get('[data-testid="schedule-query-start-date"]').element as HTMLInputElement).value).toBe(
      defaultQueryStartDate
    );
    expect((wrapper.get('[data-testid="schedule-query-end-date"]').element as HTMLInputElement).value).toBe(
      defaultQueryEndDate
    );
    expect((wrapper.get('[data-testid="schedule-query-staff-search"]').element as HTMLInputElement).value).toBe("");

    await wrapper.get('[data-testid="jump-date"]').trigger("click");
    await nextTick();

    expect((wrapper.get('[data-testid="schedule-query-start-date"]').element as HTMLInputElement).value).toBe("2026-06-29");
    expect((wrapper.get('[data-testid="schedule-query-end-date"]').element as HTMLInputElement).value).toBe("2026-07-05");
  });

  it("keeps query results read-only even if the child emits edit events", async () => {
    apiMocks.saveScheduleEntry.mockResolvedValue(structuredClone(twoStaffData));
    const wrapper = mountApp(twoStaffData);

    await flushPromises();
    await openQueryTab(wrapper);
    await wrapper.get('[data-testid="select-shift-a1"]').trigger("click");
    await wrapper.get('[data-testid="emit-query-quick-fill"]').trigger("click");
    await flushPromises();

    expect(apiMocks.saveScheduleEntry).not.toHaveBeenCalled();

    await wrapper.get('[data-testid="emit-query-edit-cell"]').trigger("click");
    await nextTick();

    expect(wrapper.find('[data-testid="cell-editor"]').exists()).toBe(false);
  });

  it("keeps query range changes from changing current-week batch office operations", async () => {
    apiMocks.bulkUpdateWeekSchedule.mockResolvedValue({
      data: structuredClone(officeShiftData),
      result: { updated: 7, skipped: 0 }
    });
    const wrapper = mountApp(officeShiftData);

    await flushPromises();
    await wrapper.get('[data-testid="jump-same-month-date"]').trigger("click");
    await openQueryTab(wrapper);
    await wrapper.get('[data-testid="schedule-query-start-date"]').setValue("2026-06-01");
    await wrapper.get('[data-testid="schedule-query-end-date"]').setValue("2026-06-30");
    await wrapper.get('[data-testid="workbench-tab-schedule"]').trigger("click");
    await wrapper.get('[data-testid="batch-office-week-button"]').trigger("click");
    await flushPromises();

    expect(apiMocks.bulkUpdateWeekSchedule).toHaveBeenCalledWith({
      weekStart: "2026-06-15",
      operation: "set-shift",
      shiftId: "shift-office",
      mode: "overwrite"
    });
  });

  it("does not narrow batch week operations to the staff search result", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17));
    apiMocks.bulkUpdateWeekSchedule.mockResolvedValue({
      data: structuredClone(twoStaffData),
      result: { updated: 14, skipped: 0 }
    });
    const wrapper = mountApp(twoStaffData);

    await flushPromises();
    await wrapper.get('[data-testid="schedule-staff-search"]').setValue("王护士");
    await wrapper.get('[data-testid="batch-rest-week-button"]').trigger("click");
    await flushPromises();

    expect(apiMocks.bulkUpdateWeekSchedule).toHaveBeenCalledWith({
      weekStart: "2026-06-15",
      operation: "set-shift",
      shiftId: "shift-rest",
      mode: "overwrite"
    });
    vi.useRealTimers();
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

  it("opens the config tab as an inline workbench panel", async () => {
    const wrapper = mountApp();

    await flushPromises();
    expectPanelVisible(wrapper, "workbench-panel-schedule");

    await wrapper.get('[data-testid="workbench-tab-config"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="management-drawer"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="management-inline-panel"]').exists()).toBe(true);
    expectPanelVisible(wrapper, "workbench-panel-config");
    expectPanelHidden(wrapper, "workbench-panel-schedule");
    expectPanelHidden(wrapper, "workbench-panel-help");
    expect(wrapper.get('[data-testid="workbench-tab-schedule"]').classes()).not.toContain("active");
    expect(wrapper.get('[data-testid="workbench-tab-config"]').classes()).toContain("active");
  });

  it("opens a visible week print preview on mobile instead of silently invoking system print", async () => {
    const restoreMobileViewport = mockMobileViewport(true);
    const { printSpy, restore: restorePrint } = mockSystemPrint();

    try {
      const wrapper = mountApp();

      await flushPromises();
      await openPrintWeekTab(wrapper);
      await nextTick();

      const panel = wrapper.get('[data-testid="workbench-panel-print"]');
      expect(printSpy).not.toHaveBeenCalled();
      expectPanelVisible(wrapper, "workbench-panel-print");
      expect(panel.text()).toContain("周表打印预览");
      expect(panel.get('[data-testid="print-panel-pdf-button"]').text()).toContain("生成/分享 PDF");
      expect(panel.get(".print-preview-active").text()).toContain("周表预览");
      expect(wrapper.find(".print-preview-dialog").exists()).toBe(false);
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
      await openPrintMonthTab(wrapper);
      await nextTick();

      const panel = wrapper.get('[data-testid="workbench-panel-print"]');
      expect(printSpy).not.toHaveBeenCalled();
      expect(panel.get('[data-testid="print-panel-pdf-button"]').text()).toContain("生成/分享 PDF");
      expect(panel.find('[data-testid="print-panel-system-button"]').exists()).toBe(false);
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
      await openPrintMonthTab(wrapper);
      await nextTick();

      const panel = wrapper.get('[data-testid="workbench-panel-print"]');
      expect(printSpy).not.toHaveBeenCalled();
      expect(panel.get(".print-preview-active").text()).toContain("月度汇总");
      expect(panel.get(".print-preview-active").text()).toContain("李护士:1:1.50");
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
      await openPrintWeekTab(wrapper);
      await nextTick();
      const panel = wrapper.get('[data-testid="workbench-panel-print"]');
      await panel.get('[data-testid="print-panel-pdf-button"]').trigger("click");
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

  it("ignores a stale week PDF result after switching to the month print panel", async () => {
    const restoreMobileViewport = mockMobileViewport(true);
    const { restore: restorePrint } = mockSystemPrint();
    const { restore: restoreNavigatorShare, shareSpy } = mockNavigatorFileShare(true);
    const weekPdfFile = new File(["week pdf"], "week-schedule.pdf", { type: "application/pdf" });
    const monthPdfFile = new File(["month pdf"], "month-schedule.pdf", { type: "application/pdf" });
    const deferredWeekPdf = createDeferred<File>();
    pdfMocks.createPrintPdfFile.mockReturnValueOnce(deferredWeekPdf.promise);

    try {
      const wrapper = mountApp();

      await flushPromises();
      await openPrintWeekTab(wrapper);
      await nextTick();
      const weekPanel = wrapper.get('[data-testid="workbench-panel-print"]');
      await weekPanel.get('[data-testid="print-panel-pdf-button"]').trigger("click");

      await openPrintMonthTab(wrapper);
      await nextTick();
      const monthPanel = wrapper.get('[data-testid="workbench-panel-print"]');
      deferredWeekPdf.resolve(weekPdfFile);
      await flushPromises();

      expect(shareSpy).not.toHaveBeenCalled();
      expect(monthPanel.find('[data-testid="print-pdf-download-link"]').exists()).toBe(false);
      expect(monthPanel.find(".print-pdf-status").exists()).toBe(false);

      pdfMocks.createPrintPdfFile.mockResolvedValueOnce(monthPdfFile);
      await monthPanel.get('[data-testid="print-panel-pdf-button"]').trigger("click");
      await flushPromises();

      expect(pdfMocks.createPrintPdfFile).toHaveBeenLastCalledWith({
        element: expect.any(HTMLElement),
        filename: "month-schedule.pdf"
      });
      expect(shareSpy).toHaveBeenCalledWith({
        files: [monthPdfFile],
        title: "月表打印预览"
      });
    } finally {
      restoreMobileViewport();
      restorePrint();
      restoreNavigatorShare();
    }
  });

  it("ignores a stale PDF generation error after switching print panels", async () => {
    const restoreMobileViewport = mockMobileViewport(true);
    const { restore: restorePrint } = mockSystemPrint();
    const { restore: restoreNavigatorShare, shareSpy } = mockNavigatorFileShare(true);
    const deferredWeekPdf = createDeferred<File>();
    pdfMocks.createPrintPdfFile.mockReturnValueOnce(deferredWeekPdf.promise);

    try {
      const wrapper = mountApp();

      await flushPromises();
      await openPrintWeekTab(wrapper);
      await nextTick();
      const weekPanel = wrapper.get('[data-testid="workbench-panel-print"]');
      await weekPanel.get('[data-testid="print-panel-pdf-button"]').trigger("click");

      await openPrintMonthTab(wrapper);
      await nextTick();
      const monthPanel = wrapper.get('[data-testid="workbench-panel-print"]');
      deferredWeekPdf.reject(new Error("week pdf failed"));
      await flushPromises();

      expect(elementPlusMocks.ElMessage.error).not.toHaveBeenCalled();
      expect(shareSpy).not.toHaveBeenCalled();
      expect(monthPanel.find('[data-testid="print-pdf-download-link"]').exists()).toBe(false);
      expect(monthPanel.find(".print-pdf-status").exists()).toBe(false);
    } finally {
      restoreMobileViewport();
      restorePrint();
      restoreNavigatorShare();
    }
  });

  it("ignores a stale PDF share rejection after switching print panels", async () => {
    const restoreMobileViewport = mockMobileViewport(true);
    const { restore: restorePrint } = mockSystemPrint();
    const { restore: restoreNavigatorShare, shareSpy } = mockNavigatorFileShare(true);
    const { createObjectUrlSpy, restore: restorePdfDownloadUrl } = mockPdfDownloadUrl();
    const pdfFile = new File(["pdf"], "week-schedule.pdf", { type: "application/pdf" });
    const deferredShare = createDeferred<void>();
    pdfMocks.createPrintPdfFile.mockResolvedValue(pdfFile);
    shareSpy.mockReturnValue(deferredShare.promise);

    try {
      const wrapper = mountApp();

      await flushPromises();
      await openPrintWeekTab(wrapper);
      await nextTick();
      const weekPanel = wrapper.get('[data-testid="workbench-panel-print"]');
      await weekPanel.get('[data-testid="print-panel-pdf-button"]').trigger("click");
      await flushPromises();

      expect(shareSpy).toHaveBeenCalledWith({
        files: [pdfFile],
        title: "周表打印预览"
      });

      await openPrintMonthTab(wrapper);
      await nextTick();
      const monthPanel = wrapper.get('[data-testid="workbench-panel-print"]');
      deferredShare.reject(new DOMException("share canceled", "AbortError"));
      await flushPromises();

      expect(createObjectUrlSpy).not.toHaveBeenCalled();
      expect(elementPlusMocks.ElMessage.warning).not.toHaveBeenCalled();
      expect(monthPanel.find('[data-testid="print-pdf-download-link"]').exists()).toBe(false);
      expect(monthPanel.find(".print-pdf-status").exists()).toBe(false);
    } finally {
      restoreMobileViewport();
      restorePrint();
      restoreNavigatorShare();
      restorePdfDownloadUrl();
    }
  });

  it("ignores a stale PDF result after logging out from a print panel", async () => {
    const restoreMobileViewport = mockMobileViewport(true);
    const { restore: restorePrint } = mockSystemPrint();
    const { restore: restoreNavigatorShare, shareSpy } = mockNavigatorFileShare(true);
    const { createObjectUrlSpy, restore: restorePdfDownloadUrl } = mockPdfDownloadUrl();
    const pdfFile = new File(["pdf"], "week-schedule.pdf", { type: "application/pdf" });
    const deferredWeekPdf = createDeferred<File>();
    apiMocks.logout.mockResolvedValue(undefined);
    pdfMocks.createPrintPdfFile.mockReturnValueOnce(deferredWeekPdf.promise);

    try {
      const wrapper = mountApp();

      await flushPromises();
      await openPrintWeekTab(wrapper);
      await nextTick();
      const panel = wrapper.get('[data-testid="workbench-panel-print"]');
      await panel.get('[data-testid="print-panel-pdf-button"]').trigger("click");

      await wrapper.get('[data-testid="header-user-menu-button"]').trigger("click");
      await nextTick();
      await wrapper.get('[data-testid="logout-button"]').trigger("click");
      await flushPromises();

      deferredWeekPdf.resolve(pdfFile);
      await flushPromises();

      expect(apiMocks.logout).toHaveBeenCalled();
      expect(wrapper.find(".app-shell").exists()).toBe(false);
      expect(shareSpy).not.toHaveBeenCalled();
      expect(createObjectUrlSpy).not.toHaveBeenCalled();
      expect(elementPlusMocks.ElMessage.warning).not.toHaveBeenCalled();
      expect(elementPlusMocks.ElMessage.error).not.toHaveBeenCalled();
    } finally {
      restoreMobileViewport();
      restorePrint();
      restoreNavigatorShare();
      restorePdfDownloadUrl();
    }
  });

  it("ignores a stale PDF result after password change logout from a print panel", async () => {
    const restoreMobileViewport = mockMobileViewport(true);
    const { restore: restorePrint } = mockSystemPrint();
    const { restore: restoreNavigatorShare, shareSpy } = mockNavigatorFileShare(true);
    const { createObjectUrlSpy, restore: restorePdfDownloadUrl } = mockPdfDownloadUrl();
    const pdfFile = new File(["pdf"], "week-schedule.pdf", { type: "application/pdf" });
    const deferredWeekPdf = createDeferred<File>();
    apiMocks.changePassword.mockResolvedValue({ ok: true });
    apiMocks.logout.mockResolvedValue(undefined);
    pdfMocks.createPrintPdfFile.mockReturnValueOnce(deferredWeekPdf.promise);

    try {
      const wrapper = mountApp();

      await flushPromises();
      await openPrintWeekTab(wrapper);
      await nextTick();
      const panel = wrapper.get('[data-testid="workbench-panel-print"]');
      await panel.get('[data-testid="print-panel-pdf-button"]').trigger("click");

      await wrapper.get('[data-testid="header-user-menu-button"]').trigger("click");
      await nextTick();
      await wrapper.get('[data-testid="open-password-change"]').trigger("click");
      await flushPromises();
      await wrapper.get('[data-testid="submit-password-change"]').trigger("click");
      await flushPromises();

      deferredWeekPdf.resolve(pdfFile);
      await flushPromises();

      expect(apiMocks.changePassword).toHaveBeenCalled();
      expect(apiMocks.logout).toHaveBeenCalled();
      expect(wrapper.find(".app-shell").exists()).toBe(false);
      expect(shareSpy).not.toHaveBeenCalled();
      expect(createObjectUrlSpy).not.toHaveBeenCalled();
      expect(wrapper.find('[data-testid="print-pdf-download-link"]').exists()).toBe(false);
      expect(wrapper.find(".print-pdf-status").exists()).toBe(false);
    } finally {
      restoreMobileViewport();
      restorePrint();
      restoreNavigatorShare();
      restorePdfDownloadUrl();
    }
  });

  it("cancels a pending PDF request before invoking system print", async () => {
    const restoreDesktopViewport = mockMobileViewport(false);
    const { printSpy, restore: restorePrint } = mockSystemPrint();
    const { restore: restoreNavigatorShare, shareSpy } = mockNavigatorFileShare(true);
    const { createObjectUrlSpy, restore: restorePdfDownloadUrl } = mockPdfDownloadUrl();
    const pdfFile = new File(["pdf"], "week-schedule.pdf", { type: "application/pdf" });
    const deferredWeekPdf = createDeferred<File>();
    pdfMocks.createPrintPdfFile.mockReturnValueOnce(deferredWeekPdf.promise);

    try {
      const wrapper = mountApp();

      await flushPromises();
      await openPrintWeekTab(wrapper);
      await nextTick();
      const panel = wrapper.get('[data-testid="workbench-panel-print"]');
      await panel.get('[data-testid="print-panel-pdf-button"]').trigger("click");
      await nextTick();

      const systemPrintButton = panel.get('[data-testid="print-panel-system-button"]');
      expect(systemPrintButton.attributes("disabled")).toBeUndefined();
      await systemPrintButton.trigger("click");

      deferredWeekPdf.resolve(pdfFile);
      await flushPromises();

      expect(printSpy).toHaveBeenCalledTimes(1);
      expect(shareSpy).not.toHaveBeenCalled();
      expect(createObjectUrlSpy).not.toHaveBeenCalled();
      expect(panel.find('[data-testid="print-pdf-download-link"]').exists()).toBe(false);
      expect(panel.find(".print-pdf-status").exists()).toBe(false);
    } finally {
      restoreDesktopViewport();
      restorePrint();
      restoreNavigatorShare();
      restorePdfDownloadUrl();
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
      await openPrintMonthTab(wrapper);
      await nextTick();
      const panel = wrapper.get('[data-testid="workbench-panel-print"]');
      await panel.get('[data-testid="print-panel-pdf-button"]').trigger("click");
      await flushPromises();

      expect(pdfMocks.createPrintPdfFile).toHaveBeenCalledWith({
        element: expect.any(HTMLElement),
        filename: "month-schedule.pdf"
      });
      expect(shareSpy).not.toHaveBeenCalled();
      expect(createObjectUrlSpy).toHaveBeenCalledWith(pdfFile);

      const downloadLink = panel.get('[data-testid="print-pdf-download-link"]');
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
      await openPrintWeekTab(wrapper);
      await nextTick();
      const panel = wrapper.get('[data-testid="workbench-panel-print"]');
      await panel.get('[data-testid="print-panel-pdf-button"]').trigger("click");
      await flushPromises();

      expect(shareSpy).toHaveBeenCalledWith({
        files: [pdfFile],
        title: "周表打印预览"
      });
      expect(createObjectUrlSpy).toHaveBeenCalledWith(pdfFile);

      const downloadLink = panel.get('[data-testid="print-pdf-download-link"]');
      expect(downloadLink.attributes("href")).toBe("blob:print-pdf");
      expect(downloadLink.attributes("download")).toBe("week-schedule.pdf");
      expect(panel.get(".print-pdf-status").text()).toContain("下载 PDF");
    } finally {
      restoreMobileViewport();
      restorePrint();
      restoreNavigatorShare();
      restorePdfDownloadUrl();
    }
  });
});
