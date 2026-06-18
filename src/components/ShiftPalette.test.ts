import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ShiftPalette from "./ShiftPalette.vue";
import type { Shift } from "@/types/domain";

const shifts: Shift[] = [
  {
    id: "shift-a1",
    name: "A1组长",
    shortName: "A1",
    color: "#2563EB",
    countsAttendance: true,
    coefficient: 1.5,
    enabled: true,
    sortOrder: 2
  },
  {
    id: "shift-office",
    name: "办公班",
    shortName: "办公",
    color: "#7C3AED",
    countsAttendance: true,
    coefficient: 1.2,
    enabled: true,
    sortOrder: 1
  }
];

describe("ShiftPalette", () => {
  it("renders a compact one-line brush label without color dots", () => {
    const wrapper = mount(ShiftPalette, {
      props: {
        selectedShiftId: "shift-a1",
        shifts
      }
    });

    expect(wrapper.get("h2").text()).toBe("画笔");
    expect(wrapper.find(".shift-dot").exists()).toBe(false);
    expect(wrapper.findAll(".shift-button").map((button) => button.text())).toEqual(["办公", "A1"]);
    expect(wrapper.find(".shift-button.active").text()).toBe("A1");
  });
});
