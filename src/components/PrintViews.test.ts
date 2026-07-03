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

function expectPersonCellText(text: string, name: string, jobId: string): void {
  const normalizedText = text.replace(/\s+/g, "");

  expect(normalizedText).toContain(`${name}${jobId}`);
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
      staffJobId: "N001",
      staffType: "nurse",
      attendanceShifts: 5,
      requiredShifts: 4,
      attendanceBalance: 1,
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
      staffJobId: "N001",
      staffType: "nurse",
      attendanceShifts: 5,
      requiredShifts: 20,
      attendanceBalance: -15,
      overtimeShifts: 1,
      coefficientTotal: 5.5,
      coefficientExcludedReason: ""
    },
    {
      staffId: "staff-clerk",
      staffName: "李文员",
      staffJobId: "C001",
      staffType: "clerk",
      attendanceShifts: 2,
      requiredShifts: 20,
      attendanceBalance: -18,
      overtimeShifts: 0,
      coefficientTotal: 2.4,
      coefficientExcludedReason: ""
    },
    {
      staffId: "staff-head",
      staffName: "段护士长",
      staffJobId: "H001",
      staffType: "head_nurse",
      attendanceShifts: 6,
      requiredShifts: 20,
      attendanceBalance: -14,
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
      staffJobId: "N001",
      staffType: "nurse",
      attendanceShifts: 5,
      requiredShifts: 20,
      attendanceBalance: -15,
      overtimeShifts: 3,
      coefficientTotal: 5.5,
      coefficientExcludedReason: "",
      bonusAmount: 1392.41,
      bonusExcludedReason: ""
    },
    {
      staffId: "staff-clerk",
      staffName: "李文员",
      staffJobId: "C001",
      staffType: "clerk",
      attendanceShifts: 2,
      requiredShifts: 20,
      attendanceBalance: -18,
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

    const monthHeader = wrapper.get(".print-month-detail-table thead .print-day-col");
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

  it("prints staff job IDs in a separate month schedule detail column", () => {
    const wrapper = mount(PrintViews, {
      props: {
        data: createData([]),
        days,
        summary
      }
    });

    const firstRow = wrapper.get(".print-month-detail-table tbody tr");

    expect(wrapper.findAll(".print-month-detail-table thead th").slice(0, 4).map((cell) => cell.text())).toEqual([
      "排序ID",
      "人员",
      "工号",
      "类型"
    ]);
    expect(firstRow.get(".print-person-col").text()).toBe("王护士");
    expect(firstRow.get(".print-job-col").text()).toBe("N001");
  });

  it("prints sort id and staff type in month schedule detail rows", () => {
    const wrapper = mount(PrintViews, {
      props: {
        data: createData([]),
        days,
        summary
      }
    });

    const monthDetailHeaders = wrapper.findAll(".print-month-detail-table thead th").map((cell) => cell.text());
    expect(monthDetailHeaders.slice(0, 4)).toEqual(["排序ID", "人员", "工号", "类型"]);

    const firstMonthDetailRow = wrapper.get(".print-month-detail-table tbody tr");
    expect(firstMonthDetailRow.get(".print-sort-col").text()).toBe("1");
    expect(firstMonthDetailRow.get(".print-person-col").text()).toBe("王护士");
    expect(firstMonthDetailRow.get(".print-job-col").text()).toBe("N001");
    expect(firstMonthDetailRow.get(".print-type-col").text()).toBe("护士");
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
      "工号",
      "人员类型",
      "月出勤班次",
      "满勤标准",
      "出勤盈亏",
      "累计加班班次",
      "月总系数",
      "备注"
    ]);
    const monthSummaryRows = monthSummary.findAll("tbody tr");
    const firstMonthSummaryRowCells = monthSummaryRows[0].findAll("td");
    expect(firstMonthSummaryRowCells[0].text()).toBe("王护士");
    expect(firstMonthSummaryRowCells[1].text()).toBe("N001");
    expect(firstMonthSummaryRowCells.slice(2).map((cell) => cell.text())).toEqual([
      "护士",
      "5",
      "20",
      "-15",
      "1",
      "5.50",
      ""
    ]);
    expect(monthSummaryRows[1].findAll("td")[0].text()).toBe("李文员");
    expect(monthSummaryRows[1].findAll("td")[1].text()).toBe("C001");
    expect(monthSummaryRows[2].findAll("td")[0].text()).toBe("段护士长");
    expect(monthSummaryRows[2].findAll("td")[1].text()).toBe("H001");
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
      "工号",
      "人员类型",
      "月出勤班次",
      "满勤标准",
      "出勤盈亏",
      "累计加班班次",
      "月总系数",
      "分配金额",
      "备注"
    ]);
    const bonusSummaryRows = bonusSummary.findAll("tbody tr");
    const firstBonusSummaryRowCells = bonusSummaryRows[0].findAll("td");
    expect(firstBonusSummaryRowCells[0].text()).toBe("王护士");
    expect(firstBonusSummaryRowCells[1].text()).toBe("N001");
    expect(firstBonusSummaryRowCells.slice(2).map((cell) => cell.text())).toEqual([
      "护士",
      "5",
      "20",
      "-15",
      "3",
      "5.50",
      "1392.41",
      ""
    ]);
    expect(bonusSummaryRows[1].findAll("td")[0].text()).toBe("李文员");
    expect(bonusSummaryRows[1].findAll("td")[1].text()).toBe("C001");
    expect(bonusSummary.text()).toContain("奖金分配");
    expect(bonusSummary.text()).toContain("奖金总额 2000.00");
    expect(bonusSummary.text()).toContain("护士与文员总系数 7.90");
    expect(bonusSummary.text()).not.toContain("普通人员总系数");
    expect(bonusSummary.text()).toContain("月结时间 2026-06-30 18:00");
    expect(bonusSummary.text()).toContain("王护士");
    expect(bonusSummary.text()).toContain("1392.41");
    expect(bonusSummary.text()).toContain("李文员");
    expect(bonusSummary.text()).toContain("607.59");
  });

  it("separates month schedule, monthly summary and bonus summary into logical PDF pages", () => {
    const wrapper = mount(PrintViews, {
      props: {
        data: createData([]),
        days,
        summary,
        monthlySummary,
        monthlySettlement
      }
    });

    const pages = wrapper.findAll(".print-month > .print-pdf-page");

    expect(pages).toHaveLength(3);
    expect(pages[0].classes()).toContain("print-pdf-schedule-page");
    expect(pages[0].find(".print-month-detail-table").exists()).toBe(true);
    expect(pages[0].text()).toContain("国际医学部护理月排班表");
    expect(pages[0].text()).not.toContain("月度汇总");
    expect(pages[1].classes()).toContain("print-month-summary");
    expect(pages[1].text()).toContain("月度汇总");
    expect(pages[1].find(".print-month-detail-table").exists()).toBe(false);
    expect(pages[2].classes()).toContain("print-bonus-summary");
    expect(pages[2].text()).toContain("奖金分配");
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
    expect(weeklyPrint.text()).toContain("出勤盈亏");
    expect(weeklyPrint.text()).toContain("+1");
    expect(weeklyPrint.text()).toContain("5.50");
    expectPersonCellText(weeklyPrint.text(), "王护士", "N001");
  });

  it("separates weekly schedule detail and weekly summary into logical PDF pages", () => {
    const wrapper = mount(PrintViews, {
      props: {
        data: createData([]),
        days,
        summary
      }
    });

    const pages = wrapper.findAll(".print-week > .print-pdf-page");

    expect(pages).toHaveLength(2);
    expect(pages[0].classes()).toContain("print-pdf-schedule-page");
    expect(pages[0].find(".print-week-detail-table").exists()).toBe(true);
    expect(pages[0].text()).toContain("国际医学部护理周统计表");
    expect(pages[0].text()).not.toContain("出勤班次");
    expect(pages[1].classes()).toContain("print-week-summary");
    expect(pages[1].text()).toContain("周统计汇总");
    expect(pages[1].text()).toContain("出勤班次");
    expect(pages[1].find(".print-week-detail-table").exists()).toBe(false);
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
    const personnelHeader = detailTable.get("tbody .print-person-col");
    expect(personnelHeader.text()).toBe("王护士");
    expect(detailTable.get("tbody .print-job-col").text()).toBe("N001");
    expect(detailTable.findAll("thead th").slice(0, 4).map((cell) => cell.text())).toEqual(["排序ID", "人员", "工号", "类型"]);
    const firstDetailRow = detailTable.get("tbody tr");
    expect(firstDetailRow.get(".print-sort-col").text()).toBe("1");
    expect(firstDetailRow.get(".print-person-col").text()).toBe("王护士");
    expect(firstDetailRow.get(".print-job-col").text()).toBe("N001");
    expect(firstDetailRow.get(".print-type-col").text()).toBe("护士");
  });

  it("prints staff job IDs in separate weekly summary cells", () => {
    const wrapper = mount(PrintViews, {
      props: {
        data: createData([]),
        days,
        summary
      }
    });

    const weeklySummaryRow = wrapper.get(".print-week-summary .print-table tbody tr");
    const weeklySummaryCells = weeklySummaryRow.findAll("td");

    expect(wrapper.findAll(".print-week-summary .print-table thead th").slice(0, 2).map((cell) => cell.text())).toEqual([
      "人员",
      "工号"
    ]);
    expect(weeklySummaryCells[0].text()).toBe("王护士");
    expect(weeklySummaryCells[1].text()).toBe("N001");
  });

  it("prints shift markers as plain text elements", () => {
    const wrapper = mount(PrintViews, {
      props: {
        data: createData([createEntry(["shift-day"])]),
        days,
        summary
      }
    });

    const marker = wrapper.get(".print-month tbody td .print-shift-chip");

    expect(marker.text()).toBe("白");
    expect(marker.classes()).toContain("print-shift-chip");
  });
});
