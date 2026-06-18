import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScheduleGrid from "./ScheduleGrid.vue";
import type { CalendarDay } from "@/lib/date";
import type { Holiday, ScheduleEntry, Shift, StaffMember } from "@/types/domain";

const days: CalendarDay[] = [
  {
    key: "2026-06-19",
    dayOfMonth: 19,
    weekday: 5,
    weekdayName: "周五",
    isWeekend: false
  }
];

const staff: StaffMember[] = [
  {
    id: "staff-enabled",
    jobId: "N001",
    name: "在职护士",
    type: "nurse",
    isAdmin: false,
    enabled: true,
    sortOrder: 1
  },
  {
    id: "staff-disabled",
    jobId: "N099",
    name: "停用护士",
    type: "nurse",
    isAdmin: false,
    enabled: false,
    sortOrder: 2
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
  }
];

const holidays: Holiday[] = [];

function mountGrid(entries: ScheduleEntry[], overrides: Partial<InstanceType<typeof ScheduleGrid>["$props"]> = {}) {
  return mount(ScheduleGrid, {
    props: {
      staff,
      days,
      holidays,
      shifts,
      entries,
      selectedShiftId: "shift-day",
      adminMode: true,
      ...overrides
    }
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ScheduleGrid", () => {
  it("shows disabled staff with historical entries in the visible days and marks them", () => {
    const wrapper = mountGrid([
      {
        id: "entry-disabled",
        date: "2026-06-19",
        staffId: "staff-disabled",
        shiftIds: ["shift-day"],
        note: ""
      }
    ]);

    const bodyText = wrapper.get("tbody").text();
    expect(bodyText).toContain("在职护士");
    expect(bodyText).toContain("停用护士");
    expect(bodyText).toContain("停用历史");
    expect(bodyText).toContain("白");
  });

  it("hides disabled staff without entries in the visible days", () => {
    const wrapper = mountGrid([
      {
        id: "entry-disabled-outside-days",
        date: "2026-07-01",
        staffId: "staff-disabled",
        shiftIds: ["shift-day"],
        note: ""
      }
    ]);

    const bodyText = wrapper.get("tbody").text();
    expect(bodyText).toContain("在职护士");
    expect(bodyText).not.toContain("停用护士");
  });

  it("adds stable test ids to schedule cells", () => {
    const wrapper = mountGrid([]);

    expect(wrapper.find('[data-testid="schedule-cell-staff-enabled-2026-06-19"]').exists()).toBe(true);
  });

  it("sizes the person column from the longest visible staff name", () => {
    const wrapper = mountGrid([], {
      staff: [
        {
          id: "staff-short",
          jobId: "N001",
          name: "王丽",
          type: "nurse",
          isAdmin: false,
          enabled: true,
          sortOrder: 1
        },
        {
          id: "staff-long",
          jobId: "N002",
          name: "段护士长",
          type: "head_nurse",
          isAdmin: true,
          enabled: true,
          sortOrder: 2
        }
      ]
    });

    const tableStyle = (wrapper.get(".schedule-grid").element as HTMLElement).style;

    expect(tableStyle.getPropertyValue("--person-col-width")).toBe("88px");
    expect(tableStyle.getPropertyValue("--person-col-mobile-width")).toBe("80px");
  });

  it("emits quick fill when an enabled cell is clicked with a selected shift", async () => {
    vi.useFakeTimers();
    const wrapper = mountGrid([]);
    const cell = wrapper.get('[data-testid="schedule-cell-staff-enabled-2026-06-19"]');

    await cell.trigger("click");
    vi.advanceTimersByTime(200);

    expect(wrapper.emitted("quickFill")).toEqual([["staff-enabled", "2026-06-19"]]);
  });

  it("does not emit quick-fill or edit events for disabled historical cells", async () => {
    vi.useFakeTimers();
    const wrapper = mountGrid([
      {
        id: "entry-disabled",
        date: "2026-06-19",
        staffId: "staff-disabled",
        shiftIds: ["shift-day"],
        note: ""
      }
    ]);
    const disabledRow = wrapper.findAll("tbody tr").find((row) => row.text().includes("停用护士"));
    expect(disabledRow).toBeDefined();
    const cell = disabledRow?.find("td");
    expect(cell?.classes()).not.toContain("editable");

    await cell?.trigger("click");
    vi.advanceTimersByTime(200);
    await cell?.trigger("dblclick");

    expect(wrapper.emitted("quickFill")).toBeUndefined();
    expect(wrapper.emitted("editCell")).toBeUndefined();
  });
});
