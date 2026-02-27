import { expect, test } from "@playwright/test";

test("mint page shows mode-specific options and pricing", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "QR Forever", exact: true }),
  ).toBeVisible();

  await expect(page.getByText(/Price:/)).toContainText("19");

  await page.locator("select").first().selectOption("updateable");
  await expect(page.getByText("Update Timelock (seconds)")).toBeVisible();
  await expect(page.getByText(/59 USDC/)).toBeVisible();

  await page.locator("select").first().selectOption("immutable");
  await page.locator("select").nth(1).selectOption("arweave");
  await expect(page.getByText(/39 USDC/)).toBeVisible();
});
