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
  props: ["modelValue", "placeholder", "disabled"],
  emits: ["update:modelValue"],
  template: '<select :data-placeholder="placeholder" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>'
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
  template: "<span><slot name=\"reference\" /></span>"
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
    enabled: true,
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z"
  }
];

const auditLogs: AuditLogEntry[] = [
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
];

function mountDrawer() {
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
      userSaving: false,
      auditLoading: false
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

  it("renders audit logs and emits audit filter requests", async () => {
    const wrapper = mountDrawer();

    expect(wrapper.text()).toContain("审计");
    expect(wrapper.text()).toContain("保存账号：scheduler");

    await wrapper.get('[data-testid="refresh-audit-logs"]').trigger("click");

    expect(wrapper.emitted("refreshAuditLogs")).toEqual([
      [
        expect.objectContaining({
          limit: 100
        })
      ]
    ]);
  });
});
