import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PrintViews from "./PrintViews.vue";
import type { PublicAppData } from "@/api/client";
import type { CalendarDay } from "@/lib/date";
import type { ScheduleEntry, Shift, WeeklySummary } from "@/types/domain";

const days: CalendarDay[] = [
  {
    key: "2026-06-19",
    dayOfMonth: 19,
    weekday: 5,
    weekdayName: "周五",
    isWeekend: false
  }
];

const shifts: Shift[] = [
  {
    id: "shift-day",
    name: "白班",
    shortName: "白",
    color: "#2563EB",
    countsAttendance: true,
    coefficient: 1,
    enabled: true,
    sortOrder: 1
  },
  {
    id: "shift-night",
    name: "夜班",
    shortName: "夜",
    color: "#DC2626",
    countsAttendance: true,
    coefficient: 1,
    enabled: true,
    sortOrder: 2
  },
  {
    id: "shift-extra",
    name: "加班",
    shortName: "加",
    color: "#16A34A",
    countsAttendance: true,
    coefficient: 1,
    enabled: true,
    sortOrder: 3
  },
  {
    id: "shift-disabled",
    name: "停用班",
    shortName: "停",
    color: "#64748B",
    countsAttendance: true,
    coefficient: 1,
    enabled: false,
    sortOrder: 4
  }
];

function createEntry(shiftIds: string[]): ScheduleEntry {
  return {
    id: "entry-1",
    date: "2026-06-19",
    staffId: "staff-1",
    shiftIds,
    note: ""
  };
}

function createData(scheduleEntries: ScheduleEntry[]): PublicAppData {
  return {
    staff: [
      {
        id: "staff-1",
        jobId: "N001",
        name: "王护士",
        type: "nurse",
        isAdmin: false,
        enabled: true,
        sortOrder: 1
      }
    ],
    shifts,
    holidays: [{ id: "holiday-dragon", date: "2026-06-19", name: "端午节", affectsRequiredAttendance: true }],
    scheduleEntries,
    settings: {
      defaultRequiredShiftsPerWeek: 5,
      version: 1
    }
  };
}

const summary: WeeklySummary = {
  weekStart: "2026-06-15",
  weekEnd: "2026-06-21",
  requiredShifts: 4,
  holidayDeduction: 1,
  holidayNames: ["端午节"],
  rows: [
    {
      staffId: "staff-1",
      staffName: "王护士",
      staffType: "nurse",
      attendanceShifts: 5,
      requiredShifts: 4,
      overtimeShifts: 1,
      coefficientTotal: 5.5,
      coefficientExcludedReason: ""
    }
  ]
};

describe("PrintViews", () => {
  it("prints holiday labels and the first two colored shift markers in month cells", () => {
    const wrapper = mount(PrintViews, {
      props: {
        data: createData([createEntry(["shift-day", "shift-night", "shift-extra"])]),
        days,
        summary
      }
    });

    const monthHeader = wrapper.get(".print-month thead th:nth-child(2)");
    expect(monthHeader.text()).toContain("19");
    expect(monthHeader.text()).toContain("周五");
    expect(monthHeader.text()).toContain("端午节");

    const shiftChips = wrapper.findAll(".print-month tbody td .print-shift-chip");
    expect(shiftChips).toHaveLength(2);
    expect(shiftChips.map((chip) => chip.text())).toEqual(["白", "夜"]);
    expect((shiftChips[0].element as HTMLElement).style.color).toBe("rgb(37, 99, 235)");
    expect((shiftChips[0].element as HTMLElement).style.borderColor).toBe("rgb(37, 99, 235)");
    expect((shiftChips[1].element as HTMLElement).style.color).toBe("rgb(220, 38, 38)");
    expect((shiftChips[1].element as HTMLElement).style.borderColor).toBe("rgb(220, 38, 38)");
  });

  it("ignores missing shift IDs before applying the two-shift print cap", () => {
    const wrapper = mount(PrintViews, {
      props: {
        data: createData([createEntry(["shift-missing", "shift-day", "shift-night"])]),
        days,
        summary
      }
    });

    const shiftChips = wrapper.findAll(".print-month tbody td .print-shift-chip");
    expect(shiftChips).toHaveLength(2);
    expect(shiftChips.map((chip) => chip.text())).toEqual(["白", "夜"]);
  });

  it("ignores disabled shifts before applying the two-shift print cap", () => {
    const wrapper = mount(PrintViews, {
      props: {
        data: createData([createEntry(["shift-disabled", "shift-day", "shift-night"])]),
        days,
        summary
      }
    });

    const shiftChips = wrapper.findAll(".print-month tbody td .print-shift-chip");
    expect(shiftChips).toHaveLength(2);
    expect(shiftChips.map((chip) => chip.text())).toEqual(["白", "夜"]);
    expect(wrapper.find(".print-month tbody td").text()).not.toContain("停");
  });

  it("keeps weekly print content present", () => {
    const wrapper = mount(PrintViews, {
      props: {
        data: createData([]),
        days,
        summary
      }
    });

    const weeklyPrint = wrapper.get(".print-week");
    expect(weeklyPrint.text()).toContain("国际医学部护理周统计表");
    expect(weeklyPrint.text()).toContain("2026-06-15 至 2026-06-21");
    expect(weeklyPrint.text()).toContain("节假日：端午节");
    expect(weeklyPrint.text()).toContain("王护士");
    expect(weeklyPrint.text()).toContain("5.50");
  });
});
