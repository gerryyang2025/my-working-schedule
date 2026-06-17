import { expect, test, type APIRequestContext, type TestInfo } from "@playwright/test";

const quickFillDate = "2026-06-15";
const quickFillStaffId = "staff-nurse-001";

interface ScheduleEntryPayload {
  date: string;
  staffId: string;
  shiftIds: string[];
  note: string;
}

interface ScheduleEntry extends ScheduleEntryPayload {
  id: string;
}

interface PublicAppData {
  scheduleEntries: ScheduleEntry[];
  monthlySettlements: Array<{ month: string }>;
}

interface MonthlySettlementLockData {
  fixedTime: string;
  lockedEditDate: string;
  setupDate: string;
  settlementMonth: string;
}

function formatMonthFromOffset(offset: number): string {
  const startYear = 2026;
  const startMonthIndex = 6;
  const absoluteMonthIndex = startYear * 12 + startMonthIndex + offset;
  const year = Math.floor(absoluteMonthIndex / 12);
  const month = (absoluteMonthIndex % 12) + 1;

  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthlySettlementLockData(testInfo: TestInfo): MonthlySettlementLockData {
  const settlementMonth = formatMonthFromOffset(testInfo.repeatEachIndex * 100 + testInfo.workerIndex);

  return {
    fixedTime: `${settlementMonth}-16T08:00:00+08:00`,
    lockedEditDate: `${settlementMonth}-16`,
    setupDate: `${settlementMonth}-15`,
    settlementMonth
  };
}

function findScheduleEntry(data: PublicAppData, date: string, staffId: string): ScheduleEntry | undefined {
  return data.scheduleEntries.find((entry) => entry.date === date && entry.staffId === staffId);
}

async function saveScheduleEntry(
  request: APIRequestContext,
  token: string,
  entry: ScheduleEntryPayload
): Promise<PublicAppData> {
  const response = await request.put("/api/data/schedule-entry", {
    headers: { Authorization: `Bearer ${token}` },
    data: entry
  });

  expect(response.ok()).toBeTruthy();
  const data = (await response.json()) as PublicAppData;
  const savedEntry = findScheduleEntry(data, entry.date, entry.staffId);

  if (entry.shiftIds.length === 0) {
    expect(savedEntry).toBeUndefined();
  } else {
    expect(savedEntry).toMatchObject({
      date: entry.date,
      staffId: entry.staffId,
      shiftIds: entry.shiftIds,
      note: entry.note
    });
  }

  return data;
}

async function clearScheduleEntry(
  request: APIRequestContext,
  token: string,
  date: string,
  staffId: string
): Promise<void> {
  await saveScheduleEntry(request, token, {
    date,
    staffId,
    shiftIds: [],
    note: ""
  });
}

async function deleteMonthlySettlementIfPresent(
  request: APIRequestContext,
  token: string,
  settlementMonth: string
): Promise<void> {
  const response = await request.delete(`/api/data/monthly-settlement/${settlementMonth}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  expect([200, 404]).toContain(response.status());

  if (response.ok()) {
    const data = (await response.json()) as PublicAppData;
    expect(data.monthlySettlements.some((settlement) => settlement.month === settlementMonth)).toBe(false);
  }
}

test("loads the schedule workstation", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "护理排班管理系统" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "班次画笔" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "周统计" })).toBeVisible();
});

test("enters admin mode and quick fills a shift", async ({ page, request }) => {
  await page.clock.setFixedTime("2026-06-16T08:00:00+08:00");

  const session = await request.post("/api/admin/session", {
    data: { password: "123456" }
  });
  expect(session.ok()).toBeTruthy();
  const { token } = (await session.json()) as { token: string };

  await clearScheduleEntry(request, token, quickFillDate, quickFillStaffId);

  try {
    await page.goto("/");

    await page.getByRole("button", { name: /输入管理密码/ }).click();
    await page.getByPlaceholder("管理密码").fill("123456");
    await page.getByRole("button", { name: "进入编辑模式" }).click();
    await expect(page.getByRole("button", { name: "编辑模式", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "进入编辑模式" })).toBeHidden();
    await page.getByRole("button", { name: "A1", exact: true }).click();

    const targetCell = page.getByTestId(`schedule-cell-${quickFillStaffId}-${quickFillDate}`);
    await expect(targetCell).toBeEmpty();
    await targetCell.click();

    await expect(targetCell).toContainText("A1");
  } finally {
    await clearScheduleEntry(request, token, quickFillDate, quickFillStaffId);
  }
});

test("opens management drawer", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /配置/ }).click();

  await expect(page.getByRole("heading", { name: "系统配置" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "人员" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "班次" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "节假日" })).toBeVisible();
});

test("locks schedule editing after monthly settlement", async ({ page, request }, testInfo) => {
  const lockData = monthlySettlementLockData(testInfo);
  await page.clock.setFixedTime(lockData.fixedTime);

  const session = await request.post("/api/admin/session", {
    data: { password: "123456" }
  });
  expect(session.ok()).toBeTruthy();
  const { token } = (await session.json()) as { token: string };

  await deleteMonthlySettlementIfPresent(request, token, lockData.settlementMonth);
  await clearScheduleEntry(request, token, lockData.setupDate, quickFillStaffId);
  await clearScheduleEntry(request, token, lockData.lockedEditDate, quickFillStaffId);
  await saveScheduleEntry(request, token, {
    date: lockData.setupDate,
    staffId: quickFillStaffId,
    shiftIds: ["shift-a1"],
    note: ""
  });

  try {
    await page.goto("/");
    await page.getByRole("button", { name: /输入管理密码/ }).click();
    await page.getByPlaceholder("管理密码").fill("123456");
    await page.getByRole("button", { name: "进入编辑模式" }).click();
    await page.getByTestId("bonus-pool-input").fill("1000");
    const settlementResponsePromise = page.waitForResponse(
      (response) => response.url().endsWith("/api/data/monthly-settlement") && response.request().method() === "PUT"
    );
    await page.getByTestId("confirm-settlement-button").click();
    const settlementConfirmDialog = page.getByRole("dialog", { name: "确认月结" });
    await expect(settlementConfirmDialog).toBeVisible();
    await settlementConfirmDialog.getByRole("button", { name: "确认月结", exact: true }).click();
    const settlementResponse = await settlementResponsePromise;
    expect(settlementResponse.ok()).toBeTruthy();
    const settlementData = (await settlementResponse.json()) as PublicAppData;
    expect(settlementData.monthlySettlements.some((settlement) => settlement.month === lockData.settlementMonth)).toBe(
      true
    );
    await expect(page.getByText("月结已完成")).toBeVisible();

    await page.getByRole("button", { name: "A1", exact: true }).click();
    const targetCell = page.getByTestId(`schedule-cell-${quickFillStaffId}-${lockData.lockedEditDate}`);
    await expect(targetCell).toBeEmpty();

    const lockedSaveResponsePromise = page.waitForResponse(
      (response) => response.url().endsWith("/api/data/schedule-entry") && response.request().method() === "PUT"
    );
    await targetCell.click();
    const lockedSaveResponse = await lockedSaveResponsePromise;
    expect(lockedSaveResponse.status()).toBe(400);
    const lockedSaveBody = (await lockedSaveResponse.json()) as { message?: string };
    expect(lockedSaveBody.message).toBe("该月份已月结，不能修改排班");

    await expect(page.getByText("该月份已月结，不能修改排班")).toBeVisible();
    await expect(targetCell).not.toContainText("A1");
  } finally {
    await deleteMonthlySettlementIfPresent(request, token, lockData.settlementMonth);
    await clearScheduleEntry(request, token, lockData.setupDate, quickFillStaffId);
    await clearScheduleEntry(request, token, lockData.lockedEditDate, quickFillStaffId);
  }
});
