import { expect, test } from "@playwright/test";
import { amountField, openAddWindow, pick, selectOf, signIn } from "./helpers";

const rowsOf = async (request: any, headers: Record<string, string>) =>
  (await (await request.get("/api/transactions/?limit=100", { headers })).json()).transactions;

test("an expense: categories only the app writes are not offered", async ({ page }) => {
  const headers = await signIn(page, "/transactions");
  const dialog = await openAddWindow(page);

  await pick(dialog, "Account", "E2E Checking");

  await selectOf(dialog, "Category").click();
  await expect(page.getByRole("option", { name: "Debt Principal" })).toHaveCount(0);
  await page.getByRole("option", { name: "Debt", exact: true }).click();
  await selectOf(dialog, "Subcategory").click();
  await expect(page.getByRole("option", { name: "Bank Fee" })).toBeVisible();
  await expect(page.getByRole("option", { name: "E2E Loan" })).toHaveCount(0);
  await page.getByRole("option", { name: "Bank Fee" }).click();

  await amountField(dialog).fill("12.5");
  await dialog.getByRole("button", { name: "Add Transaction" }).click();
  await expect(page.getByText(/added|created/i).first()).toBeVisible();

  const row = (await rowsOf(page.request, headers)).find((t: any) => t.amount === -12.5);
  expect(row.subtype_name).toBe("Bank Fee");
});

test("a refund: starts from who was paid and lowers that expense", async ({ page }) => {
  const headers = await signIn(page, "/transactions");
  const dialog = await openAddWindow(page);

  await pick(dialog, "Account", "E2E Checking");
  await pick(dialog, "Category", "Refund / Reimbursement");
  await pick(dialog, "Refund or reimbursement", "Refund");
  await dialog.locator("#refund-paid-to").fill("E2E Market");
  await dialog.locator("li", { hasText: "E2E Market" }).first().click();
  await dialog.getByLabel("Expenses paid to E2E Market").getByRole("button").first().click();
  await amountField(dialog).fill("30");
  await dialog.getByRole("button", { name: "Add Transaction" }).click();

  await expect
    .poll(async () => (await rowsOf(page.request, headers)).find((t: any) => t.refund_of)?.amount)
    .toBe(30);
});

test("a loan payment: writes interest and capital and moves the loan", async ({ page }) => {
  const headers = await signIn(page, "/transactions");
  const dialog = await openAddWindow(page);

  await pick(dialog, "Account", "E2E Checking");
  await pick(dialog, "Category", "Loan payment");
  await pick(dialog, "Loan", "E2E Loan");
  await amountField(dialog).fill("100");
  await dialog.getByRole("button", { name: /Add Transaction|Record/ }).click();

  await expect
    .poll(async () => {
      const debts = await (await page.request.get("/api/debts/", { headers })).json();
      return debts.debts?.[0]?.current_balance ?? debts[0]?.current_balance;
    })
    .toBeLessThan(910);
});
