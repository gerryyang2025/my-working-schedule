import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PrintViews from "./PrintViews.vue";
import type { PublicAppData } from "@/api/client";
import type { CalendarDay } from "@/lib/date";
import type {
  MonthlySettlement,
  MonthlySummary,
  ScheduleEntry,
  Shift,
  StaffMember,
  WeeklySummary
} from "@/types/domain";

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

function createEntry(shiftIds: string[], overrides: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return {
    id: "entry-1",
    date: "2026-06-19",
    staffId: "staff-1",
    shiftIds,
    note: "",
    ...overrides
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
    monthlySettlements: [],
    settings: {
      defaultRequiredShiftsPerWeek: 5,
      version: 1
    }
  };
}

function disabledStaff(overrides: Partial<StaffMember> = {}): StaffMember {
  return {
    id: "staff-disabled",
    jobId: "N099",
    name: "停用护士",
    type: "nurse",
    isAdmin: false,
    enabled: false,
    sortOrder: 2,
    ...overrides
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

const monthlySummary: MonthlySummary = {
  monthStart: "2026-06-01",
  monthEnd: "2026-06-30",
  totalDays: 30,
  holidayNames: ["端午节"],
  rows: [
    {
      staffId: "staff-1",
      staffName: "王护士",
      staffType: "nurse",
      attendanceShifts: 5,
      overtimeShifts: 1,
      coefficientTotal: 5.5,
      coefficientExcludedReason: ""
    },
    {
      staffId: "staff-clerk",
      staffName: "李文员",
      staffType: "clerk",
      attendanceShifts: 2,
      overtimeShifts: 0,
      coefficientTotal: 2.4,
      coefficientExcludedReason: ""
    },
    {
      staffId: "staff-head",
      staffName: "段护士长",
      staffType: "head_nurse",
      attendanceShifts: 6,
      overtimeShifts: 0,
      coefficientTotal: null,
      coefficientExcludedReason: "护士长绩效单独核算"
    }
  ]
};

const monthlySettlement: MonthlySettlement = {
  id: "settlement-2026-06",
  month: "2026-06",
  monthStart: "2026-06-01",
  monthEnd: "2026-06-30",
  totalDays: 30,
  bonusPool: 2000,
  coefficientTotal: 7.9,
  settledAt: "2026-06-30T10:00:00.000Z",
  rows: [
    {
      staffId: "staff-1",
      staffName: "王护士",
      staffType: "nurse",
      attendanceShifts: 5,
      overtimeShifts: 3,
      coefficientTotal: 5.5,
      coefficientExcludedReason: "",
      bonusAmount: 1392.41,
      bonusExcludedReason: ""
    },
    {
      staffId: "staff-clerk",
      staffName: "李文员",
      staffType: "clerk",
      attendanceShifts: 2,
      overtimeShifts: 0,
      coefficientTotal: 2.4,
      coefficientExcludedReason: "",
      bonusAmount: 607.59,
      bonusExcludedReason: ""
    }
  ]
};

describe("PrintViews", () => {
  it("prints month schedule period and holiday details", () => {
    const monthDays: CalendarDay[] = [
      days[0],
      {
        key: "2026-06-20",
        dayOfMonth: 20,
        weekday: 6,
        weekdayName: "周六",
        isWeekend: true
      },
      {
        key: "2026-06-21",
        dayOfMonth: 21,
        weekday: 0,
        weekdayName: "周日",
        isWeekend: true
      }
    ];
    const wrapper = mount(PrintViews, {
      props: {
        data: createData([]),
        days: monthDays,
        summary
      }
    });

    const monthPrint = wrapper.get(".print-month");
    expect(monthPrint.text()).toContain("国际医学部护理月排班表");
    expect(monthPrint.text()).toContain("2026-06-19 至 2026-06-21");
    expect(monthPrint.text()).toContain("共 3 天");
    expect(monthPrint.text()).toContain("节假日 1 个");
    expect(monthPrint.text()).toContain("节假日：2026-06-19 端午节");
  });

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

  it("prints disabled staff with historical entries in the printed month", () => {
    const data = createData([
      {
        id: "entry-disabled",
        date: "2026-06-19",
        staffId: "staff-disabled",
        shiftIds: ["shift-day"],
        note: ""
      }
    ]);
    data.staff.push(disabledStaff());

    const wrapper = mount(PrintViews, {
      props: {
        data,
        days,
        summary
      }
    });

    const monthRows = wrapper.findAll(".print-month tbody tr");
    expect(monthRows.map((row) => row.text())).toEqual(expect.arrayContaining([expect.stringContaining("停用护士")]));
    expect(wrapper.get(".print-month tbody").text()).toContain("停用历史");
    expect(wrapper.get(".print-month tbody").text()).toContain("白");
  });

  it("prints monthly attendance and coefficient summary below the month schedule", () => {
    const wrapper = mount(PrintViews, {
      props: {
        data: createData([]),
        days,
        summary,
        monthlySummary
      }
    });

    const monthSummary = wrapper.get(".print-month-summary");
    expect(monthSummary.findAll("thead th").map((cell) => cell.text())).toEqual([
      "人员",
      "人员类型",
      "月出勤班次",
      "累计加班班次",
      "月总系数",
      "备注"
    ]);
    expect(monthSummary.findAll("tbody tr")[0].findAll("td").map((cell) => cell.text())).toEqual([
      "王护士",
      "护士",
      "5",
      "1",
      "5.50",
      ""
    ]);
    expect(monthSummary.text()).toContain("月度汇总");
    expect(monthSummary.text()).toContain("王护士");
    expect(monthSummary.text()).toContain("护士");
    expect(monthSummary.text()).toContain("5");
    expect(monthSummary.text()).toContain("5.50");
    expect(monthSummary.text()).toContain("李文员");
    expect(monthSummary.text()).toContain("文员");
    expect(monthSummary.text()).toContain("2.40");
    expect(monthSummary.text()).toContain("段护士长");
    expect(monthSummary.text()).toContain("护士长");
    expect(monthSummary.text()).toContain("6");
    expect(monthSummary.text()).toContain("单独核算");
    expect(monthSummary.text()).toContain("护士长绩效单独核算");
  });

  it("prints bonus settlement snapshot below the monthly summary", () => {
    const wrapper = mount(PrintViews, {
      props: {
        data: createData([]),
        days,
        summary,
        monthlySummary,
        monthlySettlement
      }
    });

    const bonusSummary = wrapper.get(".print-bonus-summary");
    expect(bonusSummary.findAll("thead th").map((cell) => cell.text())).toEqual([
      "人员",
      "人员类型",
      "月出勤班次",
      "累计加班班次",
      "月总系数",
      "分配金额",
      "备注"
    ]);
    expect(bonusSummary.findAll("tbody tr")[0].findAll("td").map((cell) => cell.text())).toEqual([
      "王护士",
      "护士",
      "5",
      "3",
      "5.50",
      "1392.41",
      ""
    ]);
    expect(bonusSummary.text()).toContain("奖金分配");
    expect(bonusSummary.text()).toContain("奖金总额 2000.00");
    expect(bonusSummary.text()).toContain("月结时间 2026-06-30 18:00");
    expect(bonusSummary.text()).toContain("王护士");
    expect(bonusSummary.text()).toContain("1392.41");
    expect(bonusSummary.text()).toContain("李文员");
    expect(bonusSummary.text()).toContain("607.59");
  });

  it("uses settled snapshot rows for printed monthly totals", () => {
    const wrapper = mount(PrintViews, {
      props: {
        data: createData([]),
        days,
        summary,
        monthlySummary,
        monthlySettlement: {
          ...monthlySettlement,
          rows: [
            {
              ...monthlySettlement.rows[0],
              attendanceShifts: 99,
              coefficientTotal: 88.88,
              bonusAmount: 2000
            }
          ]
        }
      }
    });

    const monthSummary = wrapper.get(".print-month-summary");
    expect(monthSummary.text()).toContain("99");
    expect(monthSummary.text()).toContain("88.88");
    expect(monthSummary.text()).not.toContain("李文员");
  });

  it("hides disabled staff without entries in the printed month", () => {
    const data = createData([
      {
        id: "entry-disabled-outside-month",
        date: "2026-07-01",
        staffId: "staff-disabled",
        shiftIds: ["shift-day"],
        note: ""
      }
    ]);
    data.staff.push(disabledStaff());

    const wrapper = mount(PrintViews, {
      props: {
        data,
        days,
        summary
      }
    });

    expect(wrapper.get(".print-month tbody").text()).not.toContain("停用护士");
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

  it("marks only the selected print view as active in preview mode", () => {
    const wrapper = mount(PrintViews, {
      props: {
        data: createData([]),
        days,
        summary,
        previewMode: "week"
      }
    });

    expect(wrapper.get(".print-week").classes()).toContain("print-preview-active");
    expect(wrapper.get(".print-month").classes()).not.toContain("print-preview-active");
  });

  it("prints weekly schedule details by weekday", () => {
    const wrapper = mount(PrintViews, {
      props: {
        data: createData([
          createEntry(["shift-day"], { id: "entry-week-tuesday", date: "2026-06-16" }),
          createEntry(["shift-night"], { id: "entry-week-friday", date: "2026-06-19" })
        ]),
        days,
        summary
      }
    });

    const detailTable = wrapper.get(".print-week-detail");
    expect(detailTable.text()).toContain("周排班明细");
    expect(detailTable.text()).toContain("周一");
    expect(detailTable.text()).toContain("周日");
    expect(detailTable.text()).toContain("王护士");
    expect(detailTable.text()).toContain("白");
    expect(detailTable.text()).toContain("夜");
  });
});
