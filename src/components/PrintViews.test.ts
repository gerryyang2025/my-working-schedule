import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PrintViews from "./PrintViews.vue";
import type { PublicAppData } from "@/api/client";
import type { CalendarDay } from "@/lib/date";
import type { WeeklySummary } from "@/types/domain";

const days: CalendarDay[] = [
  {
    key: "2026-06-19",
    dayOfMonth: 19,
    weekday: 5,
    weekdayName: "周五",
    isWeekend: false
  }
];

const data: PublicAppData = {
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
  shifts: [
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
    }
  ],
  holidays: [{ id: "holiday-dragon", date: "2026-06-19", name: "端午节", affectsRequiredAttendance: true }],
  scheduleEntries: [
    {
      id: "entry-1",
      date: "2026-06-19",
      staffId: "staff-1",
      shiftIds: ["shift-day", "shift-night", "shift-extra"],
      note: ""
    }
  ],
  settings: {
    defaultRequiredShiftsPerWeek: 5,
    version: 1
  }
};

const summary: WeeklySummary = {
  weekStart: "2026-06-15",
  weekEnd: "2026-06-21",
  requiredShifts: 4,
  holidayDeduction: 1,
  holidayNames: ["端午节"],
  rows: []
};

describe("PrintViews", () => {
  it("prints holiday labels and the first two colored shift markers in month cells", () => {
    const wrapper = mount(PrintViews, {
      props: {
        data,
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
});
