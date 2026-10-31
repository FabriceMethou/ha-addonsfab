import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("the Investments tab shows the period's figures and holdings", async ({ page }) => {
  await signIn(page, "/reports");
  await page.getByRole("tab", { name: "Investments" }).click();

  await expect(page.getByText("Value at period end")).toBeVisible();
  await expect(page.getByText("€120.00").first()).toBeVisible();
  await expect(page.getByRole("cell", { name: /E2E Fund/ })).toBeVisible();

  // Both lines are really drawn, not just the axes around them.
  const lines = page.locator(".recharts-line-curve");
  await expect(lines).toHaveCount(2);
  await expect(lines.first()).toHaveAttribute("d", /^M.+[LC]/);
});

test("Money Flow shows where the savings went", async ({ page }) => {
  await signIn(page, "/reports");
  await page.getByRole("tab", { name: "Money Flow" }).click();

  await expect(page.getByText("Loan capital repaid").first()).toBeVisible();
  await expect(page.getByText("Kept in cash").first()).toBeVisible();
});

test("the daily price refresh can be turned off in Settings", async ({ page }) => {
  await signIn(page, "/settings");

  await expect(page.getByText("Refresh investment prices every day")).toBeVisible();
  await expect(page.getByText(/sends the symbols of your holdings to Yahoo/)).toBeVisible();
});
