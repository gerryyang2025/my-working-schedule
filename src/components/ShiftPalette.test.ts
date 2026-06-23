import { mount, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ShiftPalette from "./ShiftPalette.vue";
import type { Shift } from "@/types/domain";

function shift(overrides: Pick<Shift, "id" | "name" | "shortName"> & Partial<Shift>): Shift {
  return {
    color: "#64748B",
    countsAttendance: true,
    coefficient: 1,
    enabled: true,
    sortOrder: 1,
    ...overrides
  };
}

const shifts: Shift[] = [
  shift({
    id: "shift-training",
    name: "培训",
    shortName: "培训",
    color: "#B45309",
    sortOrder: 16
  }),
  shift({
    id: "shift-a3",
    name: "A3组长",
    shortName: "A3",
    color: "#111827",
    sortOrder: 8
  }),
  shift({
    id: "shift-office",
    name: "办公班",
    shortName: "办公",
    color: "#7C3AED",
    sortOrder: 2
  }),
  shift({
    id: "shift-n2",
    name: "N2夜班",
    shortName: "N2",
    color: "#111827",
    sortOrder: 6
  }),
  shift({
    id: "shift-custom-low",
    name: "自定义低",
    shortName: "自低",
    color: "#0891B2",
    sortOrder: 30
  }),
  shift({
    id: "shift-a1",
    name: "A1组长",
    shortName: "A1",
    color: "#111827",
    sortOrder: 7
  }),
  shift({
    id: "shift-disabled",
    name: "停用班",
    shortName: "停",
    enabled: false,
    sortOrder: 1
  }),
  shift({
    id: "shift-p2",
    name: "P2",
    shortName: "P2",
    color: "#111827",
    sortOrder: 5
  }),
  shift({
    id: "shift-rest",
    name: "休息",
    shortName: "休",
    countsAttendance: false,
    coefficient: 0,
    sortOrder: 3
  }),
  shift({
    id: "shift-regular",
    name: "常班",
    shortName: "常班",
    color: "#334155",
    sortOrder: 9
  }),
  shift({
    id: "shift-sick",
    name: "病假",
    shortName: "病假",
    color: "#9333EA",
    countsAttendance: false,
    coefficient: 0,
    sortOrder: 14
  }),
  shift({
    id: "shift-standby-1",
    name: "备1",
    shortName: "备1",
    sortOrder: 20
  }),
  shift({
    id: "shift-custom-high",
    name: "自定义高",
    shortName: "自高",
    color: "#0E7490",
    sortOrder: 22
  })
];

function mountPalette(overrides: { selectedShiftId?: string; shifts?: Shift[] } = {}) {
  return mount(ShiftPalette, {
    props: {
      selectedShiftId: "shift-a3",
      shifts,
      ...overrides
    }
  });
}

function groupButtonTexts(wrapper: VueWrapper, testId: string) {
  return wrapper.get(`[data-testid="${testId}"]`).findAll(".shift-button").map((button) => button.text());
}

function buttonColor(wrapper: VueWrapper, shiftId: string) {
  return (wrapper.get(`[data-testid="shift-button-${shiftId}"]`).element as HTMLButtonElement).style.color;
}

describe("ShiftPalette", () => {
  it("keeps the brush heading and does not render shift dots", () => {
    const wrapper = mountPalette();

    expect(wrapper.get("h2").text()).toBe("画笔");
    expect(wrapper.find(".shift-dot").exists()).toBe(false);
  });

  it("renders common and normal groups with fixed ordering and no disabled shifts", () => {
    const wrapper = mountPalette();

    expect(wrapper.findAll(".shift-palette-group-label").map((label) => label.text())).toEqual(["常用", "普通"]);
    expect(groupButtonTexts(wrapper, "shift-palette-group-common")).toEqual([
      "常班",
      "A1",
      "A3",
      "P2",
      "N2",
      "办公",
      "休"
    ]);
    expect(groupButtonTexts(wrapper, "shift-palette-group-normal")).toEqual([
      "备1",
      "培训",
      "病假",
      "自高",
      "自低"
    ]);
    expect(wrapper.find('[data-testid="shift-button-shift-disabled"]').exists()).toBe(false);
  });

  it("uses display-only fallback colors for A/P/N series and keeps other colors", () => {
    const wrapper = mountPalette();

    expect(buttonColor(wrapper, "shift-a1")).toBe("rgb(37, 99, 235)");
    expect(buttonColor(wrapper, "shift-a3")).toBe("rgb(37, 99, 235)");
    expect(buttonColor(wrapper, "shift-p2")).toBe("rgb(15, 118, 110)");
    expect(buttonColor(wrapper, "shift-n2")).toBe("rgb(220, 38, 38)");
    expect(buttonColor(wrapper, "shift-office")).toBe("rgb(124, 58, 237)");
  });

  it("matches common shifts by contained name when the short name does not match", () => {
    const wrapper = mountPalette({
      selectedShiftId: "shift-east-a1",
      shifts: [
        shift({
          id: "shift-training",
          name: "培训",
          shortName: "培训",
          color: "#B45309",
          sortOrder: 16
        }),
        shift({
          id: "shift-east-a1",
          name: "东区A1组长",
          shortName: "东A",
          color: "#111827",
          sortOrder: 50
        }),
        shift({
          id: "shift-weekend-office",
          name: "周末办公",
          shortName: "周办",
          color: "#7C3AED",
          sortOrder: 51
        })
      ]
    });

    expect(wrapper.findAll(".shift-palette-group-label").map((label) => label.text())).toEqual(["常用", "普通"]);
    expect(groupButtonTexts(wrapper, "shift-palette-group-common")).toEqual(["东A", "周办"]);
    expect(groupButtonTexts(wrapper, "shift-palette-group-normal")).toEqual(["培训"]);
  });

  it("keeps fixed normal rest and leave shifts out of the common rest rule", () => {
    const wrapper = mountPalette({
      selectedShiftId: "shift-public-rest",
      shifts: [
        shift({
          id: "shift-maternity-rest",
          name: "产假/休",
          shortName: "产假/休",
          countsAttendance: false,
          coefficient: 0,
          sortOrder: 1
        }),
        shift({
          id: "shift-public-rest",
          name: "公休",
          shortName: "公休",
          countsAttendance: false,
          coefficient: 0,
          sortOrder: 99
        }),
        shift({
          id: "shift-rest",
          name: "休息",
          shortName: "休",
          countsAttendance: false,
          coefficient: 0,
          sortOrder: 50
        })
      ]
    });

    expect(groupButtonTexts(wrapper, "shift-palette-group-common")).toEqual(["休"]);
    expect(groupButtonTexts(wrapper, "shift-palette-group-normal")).toEqual(["公休", "产假/休"]);
  });

  it("keeps A10 in normal fallback after fixed normal shifts while preserving A-series color", () => {
    const wrapper = mountPalette({
      selectedShiftId: "shift-a10",
      shifts: [
        shift({
          id: "shift-a10",
          name: "A10",
          shortName: "A10",
          color: "#111827",
          sortOrder: 1
        }),
        shift({
          id: "shift-training",
          name: "培训",
          shortName: "培训",
          color: "#B45309",
          sortOrder: 99
        })
      ]
    });

    expect(wrapper.find('[data-testid="shift-palette-group-common"]').exists()).toBe(false);
    expect(groupButtonTexts(wrapper, "shift-palette-group-normal")).toEqual(["培训", "A10"]);
    expect(buttonColor(wrapper, "shift-a10")).toBe("rgb(37, 99, 235)");
  });

  it("uses display-only fallback colors when A/P/N series is only in the name", () => {
    const wrapper = mountPalette({
      selectedShiftId: "shift-name-a1",
      shifts: [
        shift({
          id: "shift-name-a1",
          name: "A1组长",
          shortName: "组长",
          color: "#111827",
          sortOrder: 1
        }),
        shift({
          id: "shift-name-p2",
          name: "P2晚班",
          shortName: "晚班",
          color: "#111827",
          sortOrder: 2
        }),
        shift({
          id: "shift-name-n2",
          name: "N2夜班",
          shortName: "夜班",
          color: "#111827",
          sortOrder: 3
        })
      ]
    });

    expect(groupButtonTexts(wrapper, "shift-palette-group-common")).toEqual(["组长", "晚班", "夜班"]);
    expect(buttonColor(wrapper, "shift-name-a1")).toBe("rgb(37, 99, 235)");
    expect(buttonColor(wrapper, "shift-name-p2")).toBe("rgb(15, 118, 110)");
    expect(buttonColor(wrapper, "shift-name-n2")).toBe("rgb(220, 38, 38)");
  });

  it("keeps the selected shift active and emits the clicked shift id", async () => {
    const wrapper = mountPalette();

    expect(wrapper.get(".shift-button.active").text()).toBe("A3");

    await wrapper.get('[data-testid="shift-button-shift-rest"]').trigger("click");

    expect(wrapper.emitted("select")).toEqual([["shift-rest"]]);
  });

  it("omits the common group when only normal shifts are enabled", () => {
    const wrapper = mountPalette({
      selectedShiftId: "shift-training",
      shifts: shifts.filter((shift) => ["shift-training", "shift-sick", "shift-custom-low"].includes(shift.id))
    });

    expect(wrapper.find('[data-testid="shift-palette-group-common"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="shift-palette-group-normal"]').exists()).toBe(true);
    expect(wrapper.findAll(".shift-palette-group-label").map((label) => label.text())).toEqual(["普通"]);
  });
});
