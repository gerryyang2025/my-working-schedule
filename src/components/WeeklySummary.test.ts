import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import WeeklySummary from "./WeeklySummary.vue";
import type { WeeklySummary as WeeklySummaryModel } from "@/types/domain";

const summary: WeeklySummaryModel = {
  weekStart: "2026-06-15",
  weekEnd: "2026-06-21",
  requiredShifts: 4,
  holidayDeduction: 1,
  holidayNames: ["端午节"],
  rows: [
    {
      staffId: "staff-head",
      staffName: "段鸿露",
      staffJobId: "000228",
      staffType: "head_nurse",
      attendanceShifts: 0,
      requiredShifts: 4,
      overtimeShifts: 0,
      coefficientTotal: null,
      coefficientExcludedReason: "护士长绩效单独核算"
    },
    {
      staffId: "staff-nurse",
      staffName: "李护士",
      staffJobId: "100001",
      staffType: "nurse",
      attendanceShifts: 4,
      requiredShifts: 4,
      overtimeShifts: 0,
      coefficientTotal: 4.9,
      coefficientExcludedReason: ""
    }
  ]
};

describe("WeeklySummary", () => {
  it("uses shared stats panel classes", () => {
    const wrapper = mount(WeeklySummary, {
      props: { summary }
    });

    expect(wrapper.get(".weekly-summary").classes()).toContain("stats-panel");
    expect(wrapper.get("header").classes()).toContain("stats-panel-header");
  });

  it("renders one compact mobile row per staff member", () => {
    const wrapper = mount(WeeklySummary, {
      props: { summary }
    });

    const rows = wrapper.findAll(".summary-compact-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain("段鸿露");
    expect(rows[0].text()).toContain("000228");
    expect(rows[0].text()).toContain("护士长");
    expect(rows[0].text()).toContain("出勤 0/4");
    expect(rows[0].text()).toContain("加班 0");
    expect(rows[0].text()).toContain("单独核算");
    expect(rows[1].text()).toContain("李护士");
    expect(rows[1].text()).toContain("100001");
    expect(rows[1].text()).toContain("护士");
    expect(rows[1].text()).toContain("出勤 4/4");
    expect(rows[1].text()).toContain("系数 4.90");
  });

  it("renders staff job IDs in the table person column", () => {
    const wrapper = mount(WeeklySummary, {
      props: { summary }
    });

    const personCells = wrapper.findAll('tbody td[data-label="人员"]');

    expect(personCells[0].text()).toContain("段鸿露");
    expect(personCells[0].text()).toContain("000228");
    expect(personCells[1].text()).toContain("李护士");
    expect(personCells[1].text()).toContain("100001");
  });
});
