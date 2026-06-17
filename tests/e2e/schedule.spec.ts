import { expect, test, type APIRequestContext } from "@playwright/test";

const quickFillDate = "2026-06-15";
const quickFillStaffId = "staff-nurse-001";
const settlementMonth = "2026-06";
const lockedEditDate = "2026-06-16";

async function deleteMonthlySettlementIfPresent(request: APIRequestContext, token: string): Promise<void> {
  const response = await request.delete(`/api/data/monthly-settlement/${settlementMonth}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  expect([200, 404]).toContain(response.status());
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
  await request.put("/api/data/schedule-entry", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      date: quickFillDate,
      staffId: quickFillStaffId,
      shiftIds: [],
      note: ""
    }
  });

  await page.goto("/");

  await page.getByRole("button", { name: /输入管理密码/ }).click();
  await page.getByPlaceholder("管理密码").fill("123456");
  await page.getByRole("button", { name: "进入编辑模式" }).click();
  await expect(page.getByRole("button", { name: "编辑模式", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "进入编辑模式" })).toBeHidden();
  await page.getByRole("button", { name: /A1/ }).click();

  const targetCell = page.getByTestId(`schedule-cell-${quickFillStaffId}-${quickFillDate}`);
  await expect(targetCell).toBeEmpty();
  await targetCell.click();

  await expect(targetCell).toContainText("A1");
});

test("opens management drawer", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /配置/ }).click();

  await expect(page.getByRole("heading", { name: "系统配置" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "人员" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "班次" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "节假日" })).toBeVisible();
});

test("locks schedule editing after monthly settlement", async ({ page, request }) => {
  await page.clock.setFixedTime("2026-06-16T08:00:00+08:00");

  const session = await request.post("/api/admin/session", {
    data: { password: "123456" }
  });
  expect(session.ok()).toBeTruthy();
  const { token } = (await session.json()) as { token: string };

  await deleteMonthlySettlementIfPresent(request, token);
  await request.put("/api/data/schedule-entry", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      date: quickFillDate,
      staffId: quickFillStaffId,
      shiftIds: ["shift-a1"],
      note: ""
    }
  });

  try {
    await page.goto("/");
    await page.getByRole("button", { name: /输入管理密码/ }).click();
    await page.getByPlaceholder("管理密码").fill("123456");
    await page.getByRole("button", { name: "进入编辑模式" }).click();
    await page.getByTestId("bonus-pool-input").fill("1000");
    await page.getByTestId("confirm-settlement-button").click();
    await expect(page.getByText("月结已完成")).toBeVisible();

    await page.getByRole("button", { name: /A1/ }).click();
    await page.getByTestId(`schedule-cell-${quickFillStaffId}-${lockedEditDate}`).click();

    await expect(page.getByText("该月份已月结，不能修改排班")).toBeVisible();
  } finally {
    await deleteMonthlySettlementIfPresent(request, token);
  }
});
