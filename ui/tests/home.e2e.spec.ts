import { test, expect } from "@playwright/test";
import { startAtHome } from "./helpers";

test.describe("home route", () => {
  test("renders home content", async ({ page }) => {
    await startAtHome(page);

    await expect(page.getByText("Connect to Live Process")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start Connection" })).toBeVisible();

    await expect(page.getByText("Load Recording")).toBeVisible();
    await expect(page.getByText("Try Demo")).toBeVisible();
    await expect(page.getByRole("button", { name: "Launch Demo" })).toBeVisible();
  });
});
