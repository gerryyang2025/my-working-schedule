import { expect, test } from "@playwright/test";

test("loads the schedule workstation", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "护理排班管理系统" })).toBeVisible();
  await expect(page.getByText("班次画笔")).toBeVisible();
  await expect(page.getByRole("heading", { name: "周统计" })).toBeVisible();
});

test("enters admin mode and quick fills a shift", async ({ page, request }) => {
  await request.put("/api/data/schedule-entry", {
    headers: { "x-admin-mode": "true" },
    data: {
      date: "2026-06-01",
      staffId: "staff-nurse-001",
      shiftIds: [],
      note: ""
    }
  });

  await page.goto("/");
  page.on("dialog", async (dialog) => {
    expect(dialog.message()).toBe("请输入管理密码");
    await dialog.accept("123456");
  });

  await page.getByRole("button", { name: /输入管理密码/ }).click();
  await expect(page.getByRole("button", { name: /编辑模式/ })).toBeVisible();
  await page.getByRole("button", { name: /A1/ }).click();

  const targetCell = page.locator("tbody tr").nth(1).locator("td").first();
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
