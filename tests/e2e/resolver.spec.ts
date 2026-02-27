import { expect, test } from "@playwright/test";

test("resolver renders verification page with on-chain data", async ({ page }) => {
  await page.goto("http://127.0.0.1:8787/r/1?redirect=0");

  await expect(page.getByText("Verified on-chain")).toBeVisible();
  await expect(page.getByText("QR #1")).toBeVisible();
  await expect(page.getByText(/https:\/\/example\.com/)).toBeVisible();
  await expect(page.getByText(/0xabc123/)).toBeVisible();
});

test("resolver cancel prevents auto redirect", async ({ page }) => {
  await page.goto("http://127.0.0.1:8787/r/1");
  await page.getByRole("button", { name: "Cancel auto-redirect" }).click();
  await expect(page.getByText("Redirect canceled")).toBeVisible();
  await page.waitForTimeout(1800);
  await expect(page).toHaveURL(/127\.0\.0\.1:8787\/r\/1/);
});
