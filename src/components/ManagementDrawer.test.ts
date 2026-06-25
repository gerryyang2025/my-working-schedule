import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { describe, expect, it } from "vitest";
import ManagementDrawer from "./ManagementDrawer.vue";
import type { AuditLogEntry, ManagedAuthUser, PublicAppData } from "@/api/client";

const ElDrawerStub = defineComponent({
  name: "ElDrawer",
  props: ["modelValue", "title", "size"],
  emits: ["update:modelValue"],
  template: '<aside class="el-drawer" v-bind="$attrs"><slot /></aside>'
});

const ElAlertStub = defineComponent({
  name: "ElAlert",
  props: ["title", "type", "closable"],
  template: '<div class="el-alert">{{ title }}</div>'
});

const ElTabsStub = defineComponent({
  name: "ElTabs",
  template: '<div class="el-tabs"><slot /></div>'
});

const ElTabPaneStub = defineComponent({
  name: "ElTabPane",
  props: ["label"],
  template: '<section class="el-tab-pane"><h3>{{ label }}</h3><slot /></section>'
});

const ElTableStub = defineComponent({
  name: "ElTable",
  props: ["data", "size"],
  emits: ["rowClick"],
  template: '<div class="el-table"><button v-for="item in data" :key="item.id" type="button" @click="$emit(\'rowClick\', item)">{{ item.name || item.shortName || item.displayName || item.summary }}</button><slot /></div>'
});

const ElTableColumnStub = defineComponent({
  name: "ElTableColumn",
  template: "<span />"
});

const InputStub = defineComponent({
  props: ["modelValue", "placeholder", "disabled"],
  emits: ["update:modelValue"],
  template: '<input :placeholder="placeholder" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
});

const ElSelectStub = defineComponent({
  name: "ElSelect",
  props: ["modelValue", "placeholder", "disabled", "multiple"],
  emits: ["update:modelValue"],
  template:
    '<select :multiple="multiple" :data-placeholder="placeholder" :value="modelValue" @change="$emit(\'update:modelValue\', multiple ? Array.from($event.target.selectedOptions).map(option => option.value) : $event.target.value)"><slot /></select>'
});

const ElOptionStub = defineComponent({
  name: "ElOption",
  props: ["label", "value"],
  template: '<option :value="value">{{ label }}</option>'
});

const ElCheckboxStub = defineComponent({
  name: "ElCheckbox",
  props: ["modelValue"],
  emits: ["update:modelValue"],
  template: '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" /><slot /></label>'
});

const ElButtonStub = defineComponent({
  name: "ElButton",
  props: ["type", "disabled", "loading"],
  template: '<button type="button"><slot /></button>'
});

const ElPopconfirmStub = defineComponent({
  name: "ElPopconfirm",
  props: ["title", "width"],
  emits: ["confirm"],
  template:
    '<span data-testid="popconfirm" :data-width="width" :data-title="title"><slot name="reference" /><button data-testid="confirm-popconfirm" type="button" @click="$emit(\'confirm\')">confirm</button></span>'
});

const ElPaginationStub = defineComponent({
  name: "ElPagination",
  props: ["currentPage", "pageSize", "pageSizes", "total"],
  emits: ["current-change", "size-change"],
  template:
    '<nav data-testid="audit-pagination" :data-page="currentPage" :data-page-size="pageSize" :data-total="total"><button data-testid="audit-page-2" type="button" @click="$emit(\'current-change\', 2)">page 2</button><button data-testid="audit-page-size-50" type="button" @click="$emit(\'size-change\', 50)">50</button></nav>'
});

const data: Pick<PublicAppData, "staff" | "shifts" | "holidays"> = {
  staff: [
    {
      id: "staff-head",
      jobId: "000228",
      name: "段鸿露",
      type: "head_nurse",
      isAdmin: true,
      enabled: true,
      sortOrder: 1
    },
    {
      id: "staff-disabled",
      jobId: "100002",
      name: "停用护士",
      type: "nurse",
      isAdmin: false,
      enabled: false,
      sortOrder: 2
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
  holidays: [
    {
      id: "holiday-dragon",
      date: "2026-06-19",
      name: "端午节",
      affectsRequiredAttendance: true
    }
  ]
};

const users: ManagedAuthUser[] = [
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
  },
  {
    id: "user-scheduler",
    username: "scheduler",
    displayName: "排班管理员",
    role: "scheduler",
    staffId: "staff-head",
    managedStaffIds: [],
    enabled: true,
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z"
  },
  {
    id: "user-disabled-staff",
    username: "disabled-staff",
    displayName: "停用绑定账号",
    role: "viewer",
    staffId: "staff-disabled",
    managedStaffIds: [],
    enabled: true,
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z"
  },
  {
    id: "user-unknown-staff",
    username: "unknown-staff",
    displayName: "未知绑定账号",
    role: "viewer",
    staffId: "staff-missing",
    managedStaffIds: [],
    enabled: true,
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z"
  }
];

const auditLogs: AuditLogEntry[] = [
  {
    id: "audit-1",
    occurredAt: "2026-06-20T02:55:24.346Z",
    userId: "user-admin",
    username: "admin",
    action: "user.save",
    targetType: "user",
    targetId: "user-scheduler",
    summary: "保存账号：scheduler",
    ip: "127.0.0.1",
    userAgent: "vitest"
  }
];

type DrawerProps = InstanceType<typeof ManagementDrawer>["$props"];

function mountDrawer(options: { props?: Partial<DrawerProps> } = {}) {
  return mount(ManagementDrawer, {
    props: {
      modelValue: true,
      data,
      adminMode: true,
      staffSaveVersion: 0,
      shiftSaveVersion: 0,
      holidaySaveVersion: 0,
      staffSaving: false,
      shiftSaving: false,
      holidaySaving: false,
      users,
      auditLogs,
      auditTotal: auditLogs.length,
      userSaving: false,
      auditLoading: false,
      ...options.props
    },
    global: {
      stubs: {
        ElAlert: ElAlertStub,
        ElButton: ElButtonStub,
        ElCheckbox: ElCheckboxStub,
        ElColorPicker: InputStub,
        ElDatePicker: InputStub,
        ElDrawer: ElDrawerStub,
        ElInput: InputStub,
        ElInputNumber: InputStub,
        ElOption: ElOptionStub,
        ElPagination: ElPaginationStub,
        ElPopconfirm: ElPopconfirmStub,
        ElSelect: ElSelectStub,
        ElTable: ElTableStub,
        ElTableColumn: ElTableColumnStub,
        ElTabPane: ElTabPaneStub,
        ElTabs: ElTabsStub
      }
    }
  });
}

function getConfirmButtonFor(wrapper: ReturnType<typeof mountDrawer>, selector: string) {
  return wrapper
    .findAll('[data-testid="confirm-popconfirm"]')
    .find((button) => button.element.parentElement?.querySelector(selector));
}

describe("ManagementDrawer", () => {
  it("adds mobile-friendly drawer and compact list hooks", () => {
    const wrapper = mountDrawer();

    expect(wrapper.find(".management-drawer").exists()).toBe(true);
    expect(wrapper.find(".management-mobile-list").exists()).toBe(true);
    expect(wrapper.get(".management-mobile-staff").text()).toContain("段鸿露");
    expect(wrapper.get(".management-mobile-staff").text()).toContain("000228");
    expect(wrapper.get(".management-mobile-shift").text()).toContain("A1");
    expect(wrapper.get(".management-mobile-shift").text()).toContain("系数 1.5");
    expect(wrapper.get(".management-mobile-holiday").text()).toContain("2026-06-19");
    expect(wrapper.get(".management-mobile-holiday").text()).toContain("端午节");
  });

  it("renders management content inline when mode is inline", () => {
    const wrapper = mountDrawer({
      props: {
        mode: "inline",
        modelValue: true
      }
    });

    expect(wrapper.find(".management-drawer").exists()).toBe(false);
    expect(wrapper.find('[data-testid="management-inline-panel"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="management-inline-panel"]').text()).toContain("人员");
    expect(wrapper.find(".management-mobile-list").exists()).toBe(true);
  });

  it("emits deleteStaff only for an existing staff draft", async () => {
    const wrapper = mountDrawer();

    expect(wrapper.find('[data-testid="delete-staff-button"]').exists()).toBe(false);

    await wrapper.get(".management-mobile-staff").trigger("click");
    expect(getConfirmButtonFor(wrapper, '[data-testid="delete-staff-button"]')!.element.parentElement?.getAttribute("data-width")).toBe("360");
    await wrapper.get('[data-testid="delete-staff-button"]').trigger("click");
    await getConfirmButtonFor(wrapper, '[data-testid="delete-staff-button"]')!.trigger("click");

    expect(wrapper.emitted("deleteStaff")).toEqual([["staff-head"]]);
  });

  it("uses readable popconfirm widths for holiday deletion", async () => {
    const wrapper = mountDrawer();

    await wrapper.get(".management-mobile-holiday").trigger("click");

    expect(getConfirmButtonFor(wrapper, '[data-testid="delete-holiday-button"]')!.element.parentElement?.getAttribute("data-width")).toBe("360");
  });

  it("renders account management and emits account saves", async () => {
    const wrapper = mountDrawer();

    expect(wrapper.text()).toContain("账号");
    expect(wrapper.text()).toContain("系统管理员");
    expect(wrapper.text()).toContain("排班管理员");

    await wrapper.get(".management-mobile-user").trigger("click");
    await wrapper.get('[data-testid="save-user-button"]').trigger("click");

    expect(wrapper.emitted("saveUser")).toEqual([
      [
        expect.objectContaining({
          username: "admin",
          displayName: "系统管理员",
          role: "admin",
          enabled: true
        })
      ]
    ]);
  });

  it("emits deleteUser for existing account deletion", async () => {
    const wrapper = mountDrawer();

    await wrapper
      .findAll(".management-mobile-user")
      .find((item) => item.text().includes("系统管理员"))!
      .trigger("click");
    expect(getConfirmButtonFor(wrapper, '[data-testid="delete-user-button"]')!.element.parentElement?.getAttribute("data-width")).toBe("360");
    await wrapper.get('[data-testid="delete-user-button"]').trigger("click");

    expect(wrapper.emitted("deleteUser")).toBeUndefined();

    await getConfirmButtonFor(wrapper, '[data-testid="delete-user-button"]')!.trigger("click");

    expect(wrapper.emitted("deleteUser")).toEqual([["user-admin"]]);
  });

  it("does not show delete user button for new account drafts", () => {
    const wrapper = mountDrawer();

    expect(wrapper.find('[data-testid="delete-user-button"]').exists()).toBe(false);
  });

  it("shows account staff bindings and emits selected staff ids", async () => {
    const wrapper = mountDrawer();

    expect(wrapper.text()).toContain("段鸿露 / 000228");
    expect(wrapper.text()).toContain("未绑定");
    expect(wrapper.text()).toContain("停用护士 / 100002（已停用）");
    expect(wrapper.text()).toContain("未知人员 / staff-missing");

    await wrapper
      .findAll(".management-mobile-user")
      .find((item) => item.text().includes("系统管理员"))!
      .trigger("click");

    const bindingSelect = wrapper.get('select[data-placeholder="绑定人员"]');
    await bindingSelect.setValue("staff-head");
    await wrapper.get('[data-testid="save-user-button"]').trigger("click");

    expect(wrapper.emitted("saveUser")).toEqual([
      [
        expect.objectContaining({
          username: "admin",
          displayName: "系统管理员",
          role: "admin",
          enabled: true,
          staffId: "staff-head"
        })
      ]
    ]);
  });

  it("renders and emits managed staff ids for scheduler accounts", async () => {
    const wrapper = mountDrawer();

    expect(wrapper.text()).toContain("可管理人员");

    await wrapper
      .findAll(".management-mobile-user")
      .find((item) => item.text().includes("排班管理员"))!
      .trigger("click");

    const managedSelect = wrapper.get('select[data-placeholder="可管理人员"]');
    await managedSelect.setValue("staff-head");
    await wrapper.get('[data-testid="save-user-button"]').trigger("click");

    expect(wrapper.emitted("saveUser")).toEqual([
      [
        expect.objectContaining({
          username: "scheduler",
          managedStaffIds: ["staff-head"]
        })
      ]
    ]);
  });

  it.each(["viewer", "admin"] as const)(
    "emits empty managed staff ids when a scheduler account changes to %s",
    async (role) => {
      const wrapper = mountDrawer();

      await wrapper
        .findAll(".management-mobile-user")
        .find((item) => item.text().includes("排班管理员"))!
        .trigger("click");

      await wrapper.get('select[data-placeholder="可管理人员"]').setValue("staff-head");
      await wrapper.get('select[data-placeholder="角色"]').setValue(role);
      await wrapper.get('[data-testid="save-user-button"]').trigger("click");

      expect(wrapper.emitted("saveUser")).toEqual([
        [
          expect.objectContaining({
            username: "scheduler",
            role,
            managedStaffIds: []
          })
        ]
      ]);
    }
  );

  it("explains staff binding and role scoped permissions", async () => {
    const wrapper = mountDrawer();
    const helpText = () => wrapper.findAll(".management-help-text").map((item) => item.text()).join(" ");
    const expectActiveRoleGuidance = (expectedCopy: string, inactiveCopies: string[]) => {
      const text = helpText();

      expect(wrapper.findAll(".management-help-text")).toHaveLength(2);
      expect(text).toContain(expectedCopy);
      inactiveCopies.forEach((copy) => expect(text).not.toContain(copy));
    };

    expect(helpText()).toContain("绑定人员只用于标识账号本人");
    expect(helpText()).toContain("不会自动授予排班权限");

    await wrapper.get('select[data-placeholder="角色"]').setValue("admin");
    expectActiveRoleGuidance("系统管理员默认管理全部人员", [
      "排班管理员需要选择可管理人员",
      "只读账号可以查看全科排班，但不能编辑排班和月结"
    ]);

    await wrapper.get('select[data-placeholder="角色"]').setValue("viewer");
    expectActiveRoleGuidance("只读账号可以查看全科排班，但不能编辑排班和月结", [
      "排班管理员需要选择可管理人员",
      "系统管理员默认管理全部人员"
    ]);

    await wrapper
      .findAll(".management-mobile-user")
      .find((item) => item.text().includes("排班管理员"))!
      .trigger("click");

    expectActiveRoleGuidance("排班管理员需要选择可管理人员", [
      "系统管理员默认管理全部人员",
      "只读账号可以查看全科排班，但不能编辑排班和月结"
    ]);
    expect(helpText()).toContain("未选择时只能查看，不能编辑任何人员");
    expect(helpText()).toContain("护士长需要参与排班管理时，请选择排班管理员");
  });

  it("renders audit logs and emits paginated audit filter requests", async () => {
    const wrapper = mountDrawer({ props: { auditTotal: 45 } });

    expect(wrapper.text()).toContain("审计");
    expect(wrapper.text()).toContain("保存账号：scheduler");
    expect(wrapper.text()).toContain("2026-06-20 10:55:24");
    expect(wrapper.text()).not.toContain("2026-06-20T02:55:24.346Z");
    expect(wrapper.get('[data-testid="audit-pagination"]').attributes("data-total")).toBe("45");
    expect(wrapper.get('[data-testid="audit-pagination"]').attributes("data-page")).toBe("1");
    expect(wrapper.get('[data-testid="audit-pagination"]').attributes("data-page-size")).toBe("20");

    await wrapper.get('[data-testid="refresh-audit-logs"]').trigger("click");

    expect(wrapper.emitted("refreshAuditLogs")).toEqual([
      [
        expect.objectContaining({
          page: 1,
          pageSize: 20
        })
      ]
    ]);

    await wrapper.get('[data-testid="audit-page-2"]').trigger("click");
    await wrapper.get('[data-testid="audit-page-size-50"]').trigger("click");

    expect(wrapper.emitted("refreshAuditLogs")).toEqual([
      [expect.objectContaining({ page: 1, pageSize: 20 })],
      [expect.objectContaining({ page: 2, pageSize: 20 })],
      [expect.objectContaining({ page: 1, pageSize: 50 })]
    ]);
  });

  it("clears audit filters when requesting the latest audit logs", async () => {
    const wrapper = mountDrawer();

    await wrapper.get('input[placeholder="账号筛选"]').setValue("admin");
    await wrapper.get('input[placeholder="操作类型"]').setValue("user.save");
    await wrapper.get('input[placeholder="关键词"]').setValue("scheduler");
    await wrapper.get('[data-testid="refresh-latest-audit-logs"]').trigger("click");

    expect(wrapper.emitted("refreshAuditLogs")).toEqual([[{ page: 1, pageSize: 20 }]]);
    expect((wrapper.get('input[placeholder="账号筛选"]').element as HTMLInputElement).value).toBe("");
    expect((wrapper.get('input[placeholder="操作类型"]').element as HTMLInputElement).value).toBe("");
    expect((wrapper.get('input[placeholder="关键词"]').element as HTMLInputElement).value).toBe("");
  });
});
