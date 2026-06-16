import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { describe, expect, it } from "vitest";
import ManagementDrawer from "./ManagementDrawer.vue";
import type { PublicAppData } from "@/api/client";

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
  template: '<div class="el-table"><button v-for="item in data" :key="item.id" type="button" @click="$emit(\'rowClick\', item)">{{ item.name || item.shortName }}</button><slot /></div>'
});

const ElTableColumnStub = defineComponent({
  name: "ElTableColumn",
  template: "<span />"
});

const InputStub = defineComponent({
  props: ["modelValue", "placeholder", "disabled"],
  emits: ["update:modelValue"],
  template: '<input :placeholder="placeholder" :value="modelValue" />'
});

const ElSelectStub = defineComponent({
  name: "ElSelect",
  template: '<select><slot /></select>'
});

const ElOptionStub = defineComponent({
  name: "ElOption",
  props: ["label", "value"],
  template: "<option>{{ label }}</option>"
});

const ElCheckboxStub = defineComponent({
  name: "ElCheckbox",
  template: "<label><slot /></label>"
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
      holidaySaving: false
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
});
