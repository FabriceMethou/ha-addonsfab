import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("a loan row points to its page instead of offering Edit and Delete", async ({ page }) => {
  await signIn(page, "/transactions");
  const row = page.getByText("Loan payment", { exact: true }).first();
  await expect(row).toBeVisible();
  await row.click();

  const link = page.getByRole("link", { name: /Payment History/ }).first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/debts/);
});

test("a payment is corrected from Payment History and the loan follows", async ({ page }) => {
  await signIn(page, "/debts");
  await page.getByText("Payment History").first().click();
  await page.getByRole("button", { name: "Correct this payment" }).first().click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount").fill("200");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Payment corrected").first()).toBeVisible();
  await expect(page.getByRole("cell", { name: /200\.00/ }).first()).toBeVisible();
});

test("the Data check shows a clean database", async ({ page }) => {
  await signIn(page, "/backup");
  await page.getByRole("tab", { name: "Data check" }).click();
  await expect(page.getByText("Everything agrees. Nothing to repair.")).toBeVisible();
});
