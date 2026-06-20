import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import BonusSettlementPanel from "./BonusSettlementPanel.vue";
import type { MonthlySettlement, MonthlySummary } from "@/types/domain";

const monthlySummary: MonthlySummary = {
  monthStart: "2026-06-01",
  monthEnd: "2026-06-30",
  totalDays: 30,
  holidayNames: [],
  rows: [
    {
      staffId: "staff-head",
      staffName: "段护士长",
      staffJobId: "000228",
      staffType: "head_nurse",
      attendanceShifts: 10,
      requiredShifts: 20,
      attendanceBalance: -10,
      overtimeShifts: 0,
      coefficientTotal: null,
      coefficientExcludedReason: "护士长绩效单独核算"
    },
    {
      staffId: "staff-nurse",
      staffName: "李护士",
      staffJobId: "100001",
      staffType: "nurse",
      attendanceShifts: 12,
      requiredShifts: 20,
      attendanceBalance: -8,
      overtimeShifts: 2,
      coefficientTotal: 10,
      coefficientExcludedReason: ""
    }
  ]
};

const settledSnapshot: MonthlySettlement = {
  id: "settlement-2026-06",
  month: "2026-06",
  monthStart: "2026-06-01",
  monthEnd: "2026-06-30",
  totalDays: 30,
  bonusPool: 1000,
  coefficientTotal: 10,
  settledAt: "2026-06-30T10:00:00.000Z",
  rows: [
    {
      staffId: "staff-head",
      staffName: "段护士长",
      staffJobId: "000228",
      staffType: "head_nurse",
      attendanceShifts: 10,
      requiredShifts: 20,
      attendanceBalance: -10,
      overtimeShifts: 0,
      coefficientTotal: null,
      coefficientExcludedReason: "护士长绩效单独核算",
      bonusAmount: 0,
      bonusExcludedReason: "护士长绩效单独核算"
    },
    {
      staffId: "staff-nurse",
      staffName: "李护士",
      staffJobId: "100001",
      staffType: "nurse",
      attendanceShifts: 12,
      requiredShifts: 20,
      attendanceBalance: -8,
      overtimeShifts: 2,
      coefficientTotal: 10,
      coefficientExcludedReason: "",
      bonusAmount: 1000,
      bonusExcludedReason: ""
    }
  ]
};

function mountPanel(overrides: Partial<InstanceType<typeof BonusSettlementPanel>["$props"]> = {}) {
  return mount(BonusSettlementPanel, {
    props: {
      canOperateSettlement: true,
      canceling: false,
      month: "2026-06",
      monthlySummary,
      saving: false,
      settlement: null,
      startMonth: "2026-06",
      endMonth: "2026-06",
      isRangeMode: false,
      isRangeValid: true,
      sourceMonths: [],
      ...overrides
    }
  });
}

async function expectConfirmBlocked(wrapper: ReturnType<typeof mountPanel>): Promise<void> {
  const confirmButton = wrapper.get('[data-testid="confirm-settlement-button"]');

  expect((confirmButton.element as HTMLButtonElement).disabled).toBe(true);

  await confirmButton.trigger("click");

  expect(wrapper.emitted("confirmSettlement")).toBeUndefined();
}

async function expectCancelBlocked(wrapper: ReturnType<typeof mountPanel>): Promise<void> {
  const cancelButton = wrapper.get('[data-testid="cancel-settlement-button"]');

  expect((cancelButton.element as HTMLButtonElement).disabled).toBe(true);

  await cancelButton.trigger("click");

  expect(wrapper.emitted("cancelSettlement")).toBeUndefined();
}

describe("BonusSettlementPanel", () => {
  it("uses the shared stats panel class", () => {
    const wrapper = mountPanel();

    expect(wrapper.get(".bonus-settlement-panel").classes()).toContain("stats-panel");
  });

  it("previews an unsettled month after entering the bonus pool", async () => {
    const wrapper = mountPanel();

    await wrapper.get('[data-testid="bonus-pool-input"]').setValue("1000");

    expect(wrapper.text()).toContain("2026-06");
    expect(wrapper.text()).toContain("未月结");
    expect(wrapper.text()).toContain("李护士");
    expect(wrapper.text()).toContain("1000.00");
    expect(wrapper.text()).toContain("段护士长");
    expect(wrapper.text()).toContain("护士长绩效单独核算");
  });

  it("renders staff job IDs in the bonus person column", async () => {
    const wrapper = mountPanel();

    await wrapper.get('[data-testid="bonus-pool-input"]').setValue("1000");

    const personCells = wrapper.findAll('tbody td[data-label="人员"]');

    expect(personCells[0].text()).toContain("段护士长");
    expect(personCells[0].text()).toContain("000228");
    expect(personCells[1].text()).toContain("李护士");
    expect(personCells[1].text()).toContain("100001");
  });

  it("shows required shifts and signed attendance balance in bonus rows", async () => {
    const wrapper = mountPanel();

    await wrapper.get('[data-testid="bonus-pool-input"]').setValue("1000");

    expect(wrapper.get("thead").text()).toContain("满勤标准");
    expect(wrapper.get("thead").text()).toContain("出勤盈亏");

    const firstRowCells = wrapper.findAll("tbody tr")[0].findAll("td");
    expect(firstRowCells.map((cell) => cell.text())).toEqual([
      "段护士长000228",
      "护士长",
      "10",
      "20",
      "-10",
      "0",
      "单独核算",
      "0.00",
      "护士长绩效单独核算"
    ]);
  });

  it("emits the confirmed settlement payload", async () => {
    const wrapper = mountPanel();

    await wrapper.get('[data-testid="bonus-pool-input"]').setValue("1000");
    await wrapper.get('[data-testid="confirm-settlement-button"]').trigger("click");

    expect(wrapper.emitted("confirmSettlement")).toEqual([[{ month: "2026-06", bonusPool: 1000 }]]);
  });

  it("disables confirmation outside settlement operation mode", async () => {
    const wrapper = mountPanel({ canOperateSettlement: false });

    await wrapper.get('[data-testid="bonus-pool-input"]').setValue("1000");

    expect(wrapper.get('[data-testid="confirm-settlement-button"]').attributes("disabled")).toBeDefined();
  });

  it("blocks settlement actions when the current account cannot operate the whole settlement", async () => {
    const wrapper = mountPanel({ canOperateSettlement: false });

    await wrapper.get('[data-testid="bonus-pool-input"]').setValue("1000");

    expect(wrapper.get('[data-testid="confirm-settlement-button"]').attributes("disabled")).toBeDefined();
    expect(wrapper.emitted("confirmSettlement")).toBeUndefined();
  });

  it("shows a settled snapshot and emits the canceled month", async () => {
    const wrapper = mountPanel({ settlement: settledSnapshot });

    expect(wrapper.text()).toContain("已月结");
    expect(wrapper.text()).toContain("2026-06-30 18:00");
    expect(wrapper.text()).toContain("1000.00");

    await wrapper.get('[data-testid="cancel-settlement-button"]').trigger("click");

    expect(wrapper.emitted("cancelSettlement")).toEqual([["2026-06"]]);
  });

  it("hides stale bonus pool errors when a settled snapshot is shown", async () => {
    const wrapper = mountPanel();

    await wrapper.get('[data-testid="bonus-pool-input"]').setValue("-1");

    expect(wrapper.text()).toContain("奖金总额格式不正确");

    await wrapper.setProps({ settlement: settledSnapshot });

    expect(wrapper.text()).toContain("已月结");
    expect(wrapper.text()).not.toContain("奖金总额格式不正确");
  });

  it("blocks settlement when ordinary coefficient total is zero", async () => {
    const wrapper = mountPanel({
      monthlySummary: {
        ...monthlySummary,
        rows: monthlySummary.rows.map((row) =>
          row.staffType === "head_nurse"
            ? row
            : {
                ...row,
                coefficientTotal: 0
              }
        )
      }
    });

    await wrapper.get('[data-testid="bonus-pool-input"]').setValue("1000");

    expect(wrapper.text()).toContain("普通人员月总系数合计为 0，无法按系数分配奖金");
    expect(wrapper.get('[data-testid="confirm-settlement-button"]').attributes("disabled")).toBeDefined();
  });

  it("blocks confirmation for invalid bonus pools and busy or settled states", async () => {
    const invalidBonusPool = mountPanel();

    await invalidBonusPool.get('[data-testid="bonus-pool-input"]').setValue("-1");
    await expectConfirmBlocked(invalidBonusPool);

    const saving = mountPanel();

    await saving.get('[data-testid="bonus-pool-input"]').setValue("1000");
    await saving.setProps({ saving: true });
    await expectConfirmBlocked(saving);

    const canceling = mountPanel();

    await canceling.get('[data-testid="bonus-pool-input"]').setValue("1000");
    await canceling.setProps({ canceling: true });
    await expectConfirmBlocked(canceling);

    await expectConfirmBlocked(mountPanel({ settlement: settledSnapshot }));
  });

  it("blocks cancellation for settled snapshots while saving or canceling", async () => {
    await expectCancelBlocked(mountPanel({ saving: true, settlement: settledSnapshot }));
    await expectCancelBlocked(mountPanel({ canceling: true, settlement: settledSnapshot }));
  });

  it("renders range controls and hides settlement actions in multi-month trial mode", async () => {
    const wrapper = mountPanel({
      startMonth: "2026-06",
      endMonth: "2026-07",
      isRangeMode: true,
      sourceMonths: [
        { month: "2026-06", source: "settlement" },
        { month: "2026-07", source: "live" }
      ]
    });

    expect(wrapper.get("#bonus-settlement-title").text()).toBe("2026-06 至 2026-07");
    expect(wrapper.get(".settlement-status").text()).toBe("临时试算");
    expect(wrapper.text()).not.toContain("未月结");
    expect(wrapper.text()).toContain("临时试算，不会保存或锁定排班");
    expect(wrapper.text()).toContain("2026-06 使用月结快照");
    expect(wrapper.text()).toContain("2026-07 使用实时排班");
    expect(wrapper.find('[data-testid="confirm-settlement-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="cancel-settlement-button"]').exists()).toBe(false);
  });

  it("renders an invalid range warning without settlement actions or bonus rows", async () => {
    const wrapper = mountPanel({
      startMonth: "2026-08",
      endMonth: "2026-07",
      isRangeMode: true,
      isRangeValid: false,
      sourceMonths: []
    });

    expect(wrapper.get("#bonus-settlement-title").text()).toBe("2026-08 至 2026-07");
    expect(wrapper.get(".settlement-status").text()).toBe("范围无效");
    expect(wrapper.get('[data-testid="bonus-range-error"]').text()).toBe("月份范围不正确，请调整开始月份和结束月份。");
    expect(wrapper.text()).not.toContain("临时试算，不会保存或锁定排班");
    expect(wrapper.find('[data-testid="bonus-pool-input"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="confirm-settlement-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="cancel-settlement-button"]').exists()).toBe(false);
    expect(wrapper.find(".settlement-meta").exists()).toBe(false);
    expect(wrapper.find(".bonus-table").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("奖金总额格式不正确");
    expect(wrapper.text()).not.toContain("普通人员月总系数合计为 0，无法按系数分配奖金");
    expect(wrapper.text()).not.toContain("李护士");
    expect(wrapper.text()).not.toContain("段护士长");
  });

  it("emits month range updates", async () => {
    const wrapper = mountPanel();

    await wrapper.get('[data-testid="bonus-start-month"]').setValue("2026-05");
    await wrapper.get('[data-testid="bonus-end-month"]').setValue("2026-07");

    expect(wrapper.emitted("update:startMonth")).toEqual([["2026-05"]]);
    expect(wrapper.emitted("update:endMonth")).toEqual([["2026-07"]]);
  });

  it("shows cumulative overtime shifts", async () => {
    const wrapper = mountPanel();

    expect(wrapper.text()).toContain("累计加班班次");
    expect(wrapper.text()).toContain("1");
  });
});
