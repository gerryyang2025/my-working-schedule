import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import App from "./App.vue";
import type { PublicAppData } from "@/api/client";

const apiMocks = vi.hoisted(() => ({
  deleteHoliday: vi.fn(),
  enterAdminMode: vi.fn(),
  loadData: vi.fn(),
  saveHoliday: vi.fn(),
  saveScheduleEntry: vi.fn(),
  saveShift: vi.fn(),
  saveStaff: vi.fn()
}));

vi.mock("@/api/client", () => apiMocks);

const testData: PublicAppData = {
  staff: [
    {
      id: "staff-nurse-001",
      jobId: "100001",
      name: "李护士",
      type: "nurse",
      isAdmin: false,
      enabled: true,
      sortOrder: 1
    }
  ],
  shifts: [
    {
      id: "shift-a1",
      name: "A1组长",
      shortName: "A1",
      color: "#2563EB",
      countsAttendance: true,
      coefficient: 1.5,
      enabled: true,
      sortOrder: 1
    }
  ],
  holidays: [],
  scheduleEntries: [],
  settings: {
    defaultRequiredShiftsPerWeek: 5,
    version: 1
  }
};

const AppToolbarStub = defineComponent({
  name: "AppToolbar",
  props: ["selectedDate"],
  emits: ["update:selectedDate"],
  template: `
    <button data-testid="jump-date" type="button" @click="$emit('update:selectedDate', '2026-07-01')">
      jump
    </button>
  `
});

const ScheduleGridStub = defineComponent({
  name: "ScheduleGrid",
  props: ["days"],
  template: '<section data-testid="schedule-grid">{{ days.map((day) => day.key).join(",") }}</section>'
});

const EmptyStub = defineComponent({
  template: "<section />"
});

function mountApp() {
  apiMocks.loadData.mockResolvedValue(structuredClone(testData));

  return mount(App, {
    global: {
      stubs: {
        AppToolbar: AppToolbarStub,
        CellEditorDialog: EmptyStub,
        ManagementDrawer: EmptyStub,
        PrintViews: EmptyStub,
        ScheduleGrid: ScheduleGridStub,
        ShiftPalette: EmptyStub,
        WeeklySummary: EmptyStub
      }
    }
  });
}

describe("App", () => {
  it("passes only the selected natural week to the schedule grid", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17));
    const wrapper = mountApp();

    await flushPromises();

    expect(wrapper.get('[data-testid="schedule-grid"]').text()).toBe(
      "2026-06-15,2026-06-16,2026-06-17,2026-06-18,2026-06-19,2026-06-20,2026-06-21"
    );
    vi.useRealTimers();
  });

  it("updates the schedule grid to the week containing the selected date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17));
    const wrapper = mountApp();

    await flushPromises();
    await wrapper.get('[data-testid="jump-date"]').trigger("click");
    await nextTick();

    expect(wrapper.get('[data-testid="schedule-grid"]').text()).toBe(
      "2026-06-29,2026-06-30,2026-07-01,2026-07-02,2026-07-03,2026-07-04,2026-07-05"
    );
    vi.useRealTimers();
  });
});
