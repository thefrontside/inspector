import { test, expect } from "@playwright/test";
import { startAtHome } from "./helpers";

test.describe("demo route", () => {
  test("smoke: renders playback controls", async ({ page }) => {
    await startAtHome(page);

    await page.getByRole("button", { name: "Launch Demo" }).click();
    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.getByText("Offset:")).toBeVisible();
  });
});
