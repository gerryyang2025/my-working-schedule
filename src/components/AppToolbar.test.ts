import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppToolbar from "./AppToolbar.vue";
import { getWeekRange, toDateKey } from "@/lib/date";

const ElButtonStub = defineComponent({
  name: "ElButton",
  props: ["icon", "type"],
  template: '<button type="button" v-bind="$attrs"><slot /></button>'
});

const ElDatePickerStub = defineComponent({
  name: "ElDatePicker",
  props: ["modelValue", "type", "valueFormat", "format", "placeholder", "clearable"],
  emits: ["update:modelValue"],
  template: `
    <input
      :data-placeholder="placeholder"
      :data-type="type"
      :data-format="format"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
    />
  `
});

const ElInputNumberStub = defineComponent({
  name: "ElInputNumber",
  props: ["modelValue", "min", "max", "controlsPosition"],
  emits: ["update:modelValue"],
  template: '<input data-testid="year-input" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
});

const ElOptionStub = defineComponent({
  name: "ElOption",
  props: ["label", "value"],
  template: "<option><slot />{{ label }}</option>"
});

const ElSelectStub = defineComponent({
  name: "ElSelect",
  props: ["modelValue"],
  emits: ["update:modelValue"],
  template: '<select data-testid="month-select" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>'
});

const ElTooltipStub = defineComponent({
  name: "ElTooltip",
  props: ["content", "placement"],
  template: "<span><slot /></span>"
});

function mountToolbar(selectedDate = "2026-06-17") {
  return mount(AppToolbar, {
    props: {
      selectedDate,
      adminMode: true,
      canManageConfig: true
    },
    global: {
      stubs: {
        ElButton: ElButtonStub,
        ElDatePicker: ElDatePickerStub,
        ElInputNumber: ElInputNumberStub,
        ElOption: ElOptionStub,
        ElSelect: ElSelectStub,
        ElTooltip: ElTooltipStub
      }
    }
  });
}

describe("AppToolbar", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses one date selector with an explicit Monday-to-Sunday range label", () => {
    const wrapper = mountToolbar("2026-12-30");
    const dateSelectors = wrapper.findAll('input[data-type="date"]');

    expect(dateSelectors).toHaveLength(1);
    expect(dateSelectors[0].attributes("data-placeholder")).toBe("选择日期");
    expect(wrapper.find('input[data-placeholder="选择周"]').exists()).toBe(false);
    expect(wrapper.get(".toolbar-week-range").text()).toBe("2026-12-28 至 2027-01-03");
  });

  it("does not render standalone year or month controls in the weekly toolbar", () => {
    const wrapper = mountToolbar();

    expect(wrapper.find('[data-testid="year-input"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="month-select"]').exists()).toBe(false);
  });

  it("returns to the current natural week from the today shortcut", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 18));
    const wrapper = mountToolbar();
    const buttons = wrapper.findAll("button");

    await buttons[1].trigger("click");

    expect(wrapper.emitted("update:selectedDate")).toEqual([[getWeekRange(toDateKey(new Date())).start]]);
  });

  it("moves previous and next week from the current Monday-start week", async () => {
    const wrapper = mountToolbar("2026-06-17");
    const buttons = wrapper.findAll("button");

    await buttons[0].trigger("click");
    await buttons[2].trigger("click");

    expect(wrapper.emitted("update:selectedDate")).toEqual([["2026-06-08"], ["2026-06-22"]]);
  });

  it("emits a password-change action from the user toolbar", async () => {
    const wrapper = mountToolbar("2026-06-17");

    await wrapper.get('[data-testid="open-password-change"]').trigger("click");

    expect(wrapper.emitted("openPasswordChange")).toEqual([[]]);
  });

  it("keeps account identity out of the weekly toolbar", () => {
    const wrapper = mountToolbar("2026-06-17");

    expect(wrapper.find(".toolbar-user").exists()).toBe(false);
    expect(wrapper.get(".toolbar-week-range").text()).toBe("2026-06-15 至 2026-06-21");
  });
});
