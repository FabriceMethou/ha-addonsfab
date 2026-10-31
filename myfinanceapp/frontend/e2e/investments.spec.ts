import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("the page opens with four figures and one chart", async ({ page }) => {
  await signIn(page, "/investments");

  for (const title of ["Value", "Total return", "Income, 12 months", "Net invested"]) {
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Allocation", { exact: true })).toBeVisible();
  await expect(page.getByText("Top Holdings")).toHaveCount(0);
  await expect(page.getByText("Total Fees")).toHaveCount(0);
});

test("a sold-out holding is hidden until asked for", async ({ page }) => {
  await signIn(page, "/investments");

  await expect(page.getByText("Sold Out Fund")).toHaveCount(0);
  await page.getByText(/Show closed holdings \(1\)/).click();
  await expect(page.getByText("Sold Out Fund").first()).toBeVisible();
});

test("the tab is in the address, and there is one way to record a trade", async ({ page }) => {
  await signIn(page, "/investments?tab=trades");

  await expect(page.getByRole("tab", { name: "Trades" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Record trade" })).toHaveCount(1);
  await page.getByRole("button", { name: "Record trade" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Record trade" })).toBeVisible();
});

test("the owner filter narrows the page", async ({ page }) => {
  await signIn(page, "/investments");
  await expect(page.getByText("E2E Fund").first()).toBeVisible();

  await page.getByRole("combobox", { name: "Owner" }).click();
  await page.getByRole("option", { name: "Wife" }).click();

  await expect(page.getByText("E2E Fund")).toHaveCount(0);
  await expect(page.getByText("€0.00").first()).toBeVisible();
});

test("the page fits the screen at laptop width", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, "/investments");
  await expect(page.getByText("Total return")).toBeVisible();

  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(1280);
  await expect(page).toHaveURL(/\/investments/);
});
