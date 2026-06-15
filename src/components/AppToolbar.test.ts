import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { describe, expect, it } from "vitest";
import AppToolbar from "./AppToolbar.vue";

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
      year: 2026,
      month: 6,
      selectedDate,
      adminMode: false
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
  it("uses a date-based week selector with an explicit Monday-to-Sunday range label", () => {
    const wrapper = mountToolbar("2026-12-30");
    const weekSelector = wrapper.get('input[data-placeholder="选择周"]');

    expect(weekSelector.attributes("data-type")).toBe("date");
    expect(weekSelector.attributes("data-format")).toBeUndefined();
    expect(wrapper.get(".toolbar-week-range").text()).toBe("2026-12-28 至 2027-01-03");
  });

  it("selects the Monday-start week for the chosen date without relying on week picker semantics", async () => {
    const wrapper = mountToolbar();
    const weekSelector = wrapper.get('input[data-placeholder="选择周"]');

    await weekSelector.setValue("2026-06-14");

    expect(wrapper.emitted("update:selectedDate")).toEqual([["2026-06-08"]]);
  });

  it("moves previous and next week from the current Monday-start week", async () => {
    const wrapper = mountToolbar("2026-06-17");
    const buttons = wrapper.findAll("button");

    await buttons[0].trigger("click");
    await buttons[1].trigger("click");

    expect(wrapper.emitted("update:selectedDate")).toEqual([["2026-06-08"], ["2026-06-22"]]);
  });
});
