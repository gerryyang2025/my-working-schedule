import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ScheduleQueryResults from "./ScheduleQueryResults.vue";
import type { ScheduleQueryWeekGroup } from "@/lib/schedule-query";
import type { Holiday, ScheduleEntry, Shift, StaffMember } from "@/types/domain";

const weekGroups: ScheduleQueryWeekGroup[] = [
  {
    id: "2026-06-15",
    start: "2026-06-18",
    end: "2026-06-21",
    days: [
      { key: "2026-06-18", dayOfMonth: 18, weekday: 4, weekdayName: "周四", isWeekend: false },
      { key: "2026-06-19", dayOfMonth: 19, weekday: 5, weekdayName: "周五", isWeekend: false },
      { key: "2026-06-20", dayOfMonth: 20, weekday: 6, weekdayName: "周六", isWeekend: true },
      { key: "2026-06-21", dayOfMonth: 21, weekday: 0, weekdayName: "周日", isWeekend: true }
    ]
  },
  {
    id: "2026-06-22",
    start: "2026-06-22",
    end: "2026-06-24",
    days: [
      { key: "2026-06-22", dayOfMonth: 22, weekday: 1, weekdayName: "周一", isWeekend: false },
      { key: "2026-06-23", dayOfMonth: 23, weekday: 2, weekdayName: "周二", isWeekend: false },
      { key: "2026-06-24", dayOfMonth: 24, weekday: 3, weekdayName: "周三", isWeekend: false }
    ]
  }
];

const staff: StaffMember[] = [
  {
    id: "staff-nurse",
    jobId: "N001",
    name: "李护士",
    type: "nurse",
    isAdmin: false,
    enabled: true,
    sortOrder: 2
  },
  {
    id: "staff-head",
    jobId: "H001",
    name: "段护士长",
    type: "head_nurse",
    isAdmin: true,
    enabled: true,
    sortOrder: 1
  },
  {
    id: "staff-disabled",
    jobId: "D001",
    name: "停用护士",
    type: "nurse",
    isAdmin: false,
    enabled: false,
    sortOrder: 3
  }
];

const shifts: Shift[] = [
  {
    id: "shift-a1",
    name: "A1",
    shortName: "A1",
    color: "#2563EB",
    countsAttendance: true,
    coefficient: 1.2,
    enabled: true,
    sortOrder: 1
  }
];

const holidays: Holiday[] = [
  {
    id: "holiday-dragon",
    date: "2026-06-19",
    name: "端午节",
    affectsRequiredAttendance: true
  }
];

const entries: ScheduleEntry[] = [
  {
    id: "entry-nurse",
    date: "2026-06-19",
    staffId: "staff-nurse",
    shiftIds: ["shift-a1"],
    note: ""
  },
  {
    id: "entry-disabled",
    date: "2026-06-23",
    staffId: "staff-disabled",
    shiftIds: ["shift-a1"],
    note: ""
  }
];

function mountResults(overrides: Partial<InstanceType<typeof ScheduleQueryResults>["$props"]> = {}) {
  return mount(ScheduleQueryResults, {
    props: {
      weekGroups,
      staff,
      holidays,
      shifts,
      entries,
      ...overrides
    }
  });
}

describe("ScheduleQueryResults", () => {
  it("renders natural week blocks with partial date ranges", () => {
    const wrapper = mountResults();
    const blocks = wrapper.findAll('[data-testid="schedule-query-week-block"]');

    expect(wrapper.findAll('[data-testid="schedule-query-week-title"]').map((item) => item.text())).toEqual([
      "2026-06-18 至 2026-06-21",
      "2026-06-22 至 2026-06-24"
    ]);
    expect(blocks[0].findAll("thead th").slice(3).map((item) => item.text())).toEqual([
      "18周四",
      "19周五端午节",
      "20周六",
      "21周日"
    ]);
    expect(blocks[1].findAll("thead th").slice(3).map((item) => item.text())).toEqual(["22周一", "23周二", "24周三"]);
  });

  it("uses schedule columns, staff ordering, staff type labels, and disabled historical labels", () => {
    const wrapper = mountResults();

    const firstBlockRows = wrapper.findAll('[data-testid="schedule-query-week-block"]')[0].findAll("tbody tr");

    expect(firstBlockRows.map((row) => row.get(".sort-col").text())).toEqual(["1", "2", "3"]);
    expect(firstBlockRows.map((row) => row.get(".type-col").text())).toEqual(["护士长", "护士", "护士"]);
    expect(firstBlockRows[0].get(".person-col").text()).toContain("段护士长");
    expect(firstBlockRows[0].get(".person-col").text()).toContain("H001");
    expect(firstBlockRows[2].text()).toContain("停用历史");
  });

  it("renders holidays and shift text without editable cell affordances", async () => {
    const wrapper = mountResults();

    expect(wrapper.get('[data-testid="schedule-query-cell-staff-nurse-2026-06-19"]').text()).toContain("A1");
    expect(wrapper.get('[data-testid="schedule-query-week-block"]').text()).toContain("端午节");
    expect(wrapper.find(".editable").exists()).toBe(false);

    await wrapper.get('[data-testid="schedule-query-cell-staff-nurse-2026-06-19"]').trigger("click");

    expect(wrapper.emitted()).toEqual({});
  });
});
