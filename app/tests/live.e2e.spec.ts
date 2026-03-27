import { test, expect } from "@playwright/test";
import { startAtHome } from "./helpers";

test.describe("live route", () => {
  test("smoke: renders live status", async ({ page }) => {
    await startAtHome(page);

    await page.getByRole("button", { name: "Start Connection" }).click();
    await expect(page).toHaveURL(/\/live$/);
    await expect(page.getByText("connection")).toBeVisible();
  });
});
