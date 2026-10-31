import { expect, type Locator, type Page } from "@playwright/test";

export async function signIn(page: Page, path: string) {
  const response = await page.request.post("/api/auth/token", {
    form: { username: "admin", password: "E2e-Passw0rd!" },
  });
  expect(response.ok()).toBeTruthy();
  const session = await response.json();
  await page.addInitScript((data) => {
    localStorage.setItem("access_token", data.access_token);
    if (data.refresh_token) localStorage.setItem("refresh_token", data.refresh_token);
    localStorage.setItem("user", JSON.stringify(data.user));
  }, session);
  await page.goto(path);
  return { Authorization: `Bearer ${session.access_token}` };
}

/** The Select of a form field, found by its label. */
export function selectOf(dialog: Locator, label: string) {
  return dialog
    .locator("div")
    .filter({ has: dialog.page().locator("> label", { hasText: label }) })
    .getByRole("combobox");
}

/** Pick an option in the Select of a labelled form field. */
export async function pick(dialog: Locator, label: string, option: string) {
  await selectOf(dialog, label).click();
  await dialog.page().getByRole("option", { name: option }).first().click();
}

export async function openAddWindow(page: Page) {
  await page.getByRole("button", { name: "Add transaction" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

export function amountField(dialog: Locator) {
  return dialog.locator('input[type="number"]').first();
}
