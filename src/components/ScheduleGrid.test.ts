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

const reorderableStaff: StaffMember[] = [
  {
    id: "staff-a",
    jobId: "N001",
    name: "甲护士",
    type: "nurse",
    isAdmin: false,
    enabled: true,
    sortOrder: 1
  },
  {
    id: "staff-b",
    jobId: "N002",
    name: "乙护士",
    type: "nurse",
    isAdmin: false,
    enabled: true,
    sortOrder: 2
  },
  {
    id: "staff-c",
    jobId: "N003",
    name: "丙护士",
    type: "nurse",
    isAdmin: false,
    enabled: true,
    sortOrder: 3
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
      editableStaffIds: ["staff-enabled"],
      ...overrides
    }
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ScheduleGrid", () => {
  it("shows sort id, person and type as the fixed schedule columns", () => {
    const wrapper = mountGrid([]);

    expect(
      wrapper
        .findAll("thead th")
        .slice(0, 3)
        .map((cell) => cell.text())
    ).toEqual(["排序ID", "人员", "类型"]);

    const firstRow = wrapper.get("tbody tr");
    expect(firstRow.get(".sort-col").text()).toBe("1");
    expect(firstRow.get(".person-col").text()).toContain("在职护士");
    expect(firstRow.get(".person-col").text()).toContain("N001");
    expect(firstRow.get(".type-col").text()).toBe("护士");
  });

  it("emits selected staff row changes and marks the selected row", async () => {
    const wrapper = mountGrid([], {
      staff: reorderableStaff,
      editableStaffIds: reorderableStaff.map((person) => person.id),
      canReorderStaff: true,
      selectedStaffId: "staff-b"
    });

    const rows = wrapper.findAll("tbody tr");
    expect(rows[0].classes()).not.toContain("selected-staff-row");
    expect(rows[0].attributes("tabindex")).toBe("0");
    expect(rows[0].attributes("aria-selected")).toBe("false");
    expect(rows[1].classes()).toContain("selected-staff-row");
    expect(rows[1].attributes("tabindex")).toBe("0");
    expect(rows[1].attributes("aria-selected")).toBe("true");
    expect(rows[2].classes()).not.toContain("selected-staff-row");
    expect(rows[2].attributes("tabindex")).toBe("0");
    expect(rows[2].attributes("aria-selected")).toBe("false");

    await rows[2].trigger("click");
    await rows[0].trigger("keydown.enter");
    await rows[1].trigger("keydown.space");
    expect(wrapper.emitted("selectStaff")).toEqual([["staff-c"], ["staff-a"], ["staff-b"]]);
  });

  it("only emits selected staff row changes when staff reordering is enabled", async () => {
    const wrapper = mountGrid([], {
      staff: reorderableStaff,
      editableStaffIds: reorderableStaff.map((person) => person.id),
      selectedStaffId: "staff-b"
    });

    await wrapper.get("tbody tr").trigger("click");

    expect(wrapper.emitted("selectStaff")).toBeUndefined();
    for (const row of wrapper.findAll("tbody tr")) {
      expect(row.attributes("tabindex")).toBeUndefined();
      expect(row.attributes("aria-selected")).toBeUndefined();
      expect(row.classes()).not.toContain("selected-staff-row");
    }
  });

  it("removes per-row staff move controls from schedule rows", () => {
    const wrapper = mountGrid([], {
      staff: reorderableStaff,
      editableStaffIds: reorderableStaff.map((person) => person.id),
      canReorderStaff: true,
      selectedStaffId: "staff-b"
    });

    expect(wrapper.find('[data-testid="move-staff-up-staff-a"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="move-staff-down-staff-a"]').exists()).toBe(false);
    expect(wrapper.find(".staff-reorder-controls").exists()).toBe(false);
    expect(wrapper.find(".staff-reorder-button").exists()).toBe(false);
  });

  it("emits reordered visible staff ids from the shared staff toolbar", async () => {
    const upWrapper = mountGrid([], {
      staff: reorderableStaff,
      editableStaffIds: reorderableStaff.map((person) => person.id),
      canReorderStaff: true,
      selectedStaffId: "staff-b"
    });

    expect(upWrapper.get('[data-testid="schedule-reorder-label"]').text()).toBe("人员排序");
    expect(upWrapper.get('[data-testid="schedule-reorder-selected"]').text()).toBe("已选：乙护士 N002");

    await upWrapper.get('[data-testid="schedule-reorder-up"]').trigger("click");
    expect(upWrapper.emitted("reorderStaff")).toEqual([[["staff-b", "staff-a", "staff-c"]]]);

    const downWrapper = mountGrid([], {
      staff: reorderableStaff,
      editableStaffIds: reorderableStaff.map((person) => person.id),
      canReorderStaff: true,
      selectedStaffId: "staff-b"
    });

    await downWrapper.get('[data-testid="schedule-reorder-down"]').trigger("click");
    expect(downWrapper.emitted("reorderStaff")).toEqual([[["staff-a", "staff-c", "staff-b"]]]);
  });

  it("disables shared staff toolbar actions with no selection or edge selections", () => {
    const noSelectionWrapper = mountGrid([], {
      staff: reorderableStaff,
      editableStaffIds: reorderableStaff.map((person) => person.id),
      canReorderStaff: true
    });

    expect(noSelectionWrapper.get('[data-testid="schedule-reorder-selected"]').text()).toBe("请选择人员");
    expect(noSelectionWrapper.get('[data-testid="schedule-reorder-up"]').attributes("disabled")).toBeDefined();
    expect(noSelectionWrapper.get('[data-testid="schedule-reorder-down"]').attributes("disabled")).toBeDefined();

    const firstWrapper = mountGrid([], {
      staff: reorderableStaff,
      editableStaffIds: reorderableStaff.map((person) => person.id),
      canReorderStaff: true,
      selectedStaffId: "staff-a"
    });

    expect(firstWrapper.get('[data-testid="schedule-reorder-up"]').attributes("disabled")).toBeDefined();
    expect(firstWrapper.get('[data-testid="schedule-reorder-down"]').attributes("disabled")).toBeUndefined();

    const lastWrapper = mountGrid([], {
      staff: reorderableStaff,
      editableStaffIds: reorderableStaff.map((person) => person.id),
      canReorderStaff: true,
      selectedStaffId: "staff-c"
    });

    expect(lastWrapper.get('[data-testid="schedule-reorder-up"]').attributes("disabled")).toBeUndefined();
    expect(lastWrapper.get('[data-testid="schedule-reorder-down"]').attributes("disabled")).toBeDefined();
  });

  it("hides the shared staff toolbar unless staff reordering is available", () => {
    const wrapper = mountGrid([], {
      staff: reorderableStaff,
      editableStaffIds: reorderableStaff.map((person) => person.id)
    });

    expect(wrapper.find('[data-testid="schedule-reorder-toolbar"]').exists()).toBe(false);

    const singleStaffWrapper = mountGrid([], {
      staff: [reorderableStaff[0]],
      editableStaffIds: ["staff-a"],
      canReorderStaff: true,
      selectedStaffId: "staff-a"
    });

    expect(singleStaffWrapper.find('[data-testid="schedule-reorder-toolbar"]').exists()).toBe(false);
    expect(singleStaffWrapper.get("tbody tr").attributes("tabindex")).toBeUndefined();
    expect(singleStaffWrapper.get("tbody tr").attributes("aria-selected")).toBeUndefined();
    expect(singleStaffWrapper.get("tbody tr").classes()).not.toContain("selected-staff-row");
  });

  it("shows all configured staff type labels and keeps rows sorted by sort id", () => {
    const wrapper = mountGrid([], {
      staff: [
        {
          id: "staff-head",
          jobId: "H001",
          name: "段护士长",
          type: "head_nurse",
          isAdmin: true,
          enabled: true,
          sortOrder: 3
        },
        {
          id: "staff-clerk",
          jobId: "C001",
          name: "王文员",
          type: "clerk",
          isAdmin: false,
          enabled: true,
          sortOrder: 1
        },
        {
          id: "staff-nurse",
          jobId: "N001",
          name: "李护士",
          type: "nurse",
          isAdmin: false,
          enabled: true,
          sortOrder: 2
        }
      ],
      editableStaffIds: ["staff-head", "staff-clerk", "staff-nurse"]
    });

    const rows = wrapper.findAll("tbody tr");

    expect(rows.map((row) => row.get(".sort-col").text())).toEqual(["1", "2", "3"]);
    expect(rows.map((row) => row.get(".type-col").text())).toEqual(["文员", "护士", "护士长"]);
    expect(rows[0].get(".person-col").text()).toContain("王文员");
    expect(rows[1].get(".person-col").text()).toContain("李护士");
    expect(rows[2].get(".person-col").text()).toContain("段护士长");
  });

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
    expect(tableStyle.getPropertyValue("--sort-col-width")).toBe("68px");
    expect(tableStyle.getPropertyValue("--type-col-width")).toBe("58px");
    expect(tableStyle.getPropertyValue("--person-col-left")).toBe("68px");
    expect(tableStyle.getPropertyValue("--type-col-left")).toBe("156px");
    expect(tableStyle.getPropertyValue("--sort-col-mobile-width")).toBe("58px");
    expect(tableStyle.getPropertyValue("--type-col-mobile-width")).toBe("46px");
    expect(tableStyle.getPropertyValue("--person-col-mobile-left")).toBe("58px");
    expect(tableStyle.getPropertyValue("--type-col-mobile-left")).toBe("138px");
  });

  it("emits quick fill when an enabled cell is clicked with a selected shift", async () => {
    vi.useFakeTimers();
    const wrapper = mountGrid([]);
    const cell = wrapper.get('[data-testid="schedule-cell-staff-enabled-2026-06-19"]');

    await cell.trigger("click");
    vi.advanceTimersByTime(200);

    expect(wrapper.emitted("quickFill")).toEqual([["staff-enabled", "2026-06-19"]]);
  });

  it("selects the staff row immediately and quick-fills after the editable cell click timer", async () => {
    vi.useFakeTimers();
    const wrapper = mountGrid([], {
      staff: reorderableStaff,
      editableStaffIds: reorderableStaff.map((person) => person.id),
      canReorderStaff: true
    });
    const cell = wrapper.get('[data-testid="schedule-cell-staff-a-2026-06-19"]');

    await cell.trigger("click");

    expect(wrapper.emitted("selectStaff")).toEqual([["staff-a"]]);
    expect(wrapper.emitted("quickFill")).toBeUndefined();

    vi.advanceTimersByTime(200);

    expect(wrapper.emitted("quickFill")).toEqual([["staff-a", "2026-06-19"]]);
  });

  it("selects the staff row and cancels quick-fill when an editable cell is double-clicked", async () => {
    vi.useFakeTimers();
    const wrapper = mountGrid([], {
      staff: reorderableStaff,
      editableStaffIds: reorderableStaff.map((person) => person.id),
      canReorderStaff: true
    });
    const cell = wrapper.get('[data-testid="schedule-cell-staff-a-2026-06-19"]');

    await cell.trigger("click");
    await cell.trigger("click");
    await cell.trigger("dblclick");
    vi.advanceTimersByTime(200);

    expect(wrapper.emitted("selectStaff")).toEqual([["staff-a"], ["staff-a"]]);
    expect(wrapper.emitted("quickFill")).toBeUndefined();
    expect(wrapper.emitted("editCell")).toEqual([["staff-a", "2026-06-19"]]);
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
    const cell = wrapper.get('[data-testid="schedule-cell-staff-disabled-2026-06-19"]');
    expect(cell.classes()).not.toContain("editable");

    await cell.trigger("click");
    vi.advanceTimersByTime(200);
    await cell.trigger("dblclick");

    expect(wrapper.emitted("quickFill")).toBeUndefined();
    expect(wrapper.emitted("editCell")).toBeUndefined();
  });

  it("keeps unmanaged enabled staff cells read-only", async () => {
    vi.useFakeTimers();
    const wrapper = mountGrid([], {
      editableStaffIds: []
    });
    const cell = wrapper.get('[data-testid="schedule-cell-staff-enabled-2026-06-19"]');

    expect(cell.classes()).not.toContain("editable");

    await cell.trigger("click");
    vi.advanceTimersByTime(200);
    await cell.trigger("dblclick");

    expect(wrapper.emitted("quickFill")).toBeUndefined();
    expect(wrapper.emitted("editCell")).toBeUndefined();
  });
});
