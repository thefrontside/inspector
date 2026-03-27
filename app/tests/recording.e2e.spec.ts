import { test, expect } from "@playwright/test";
import { uploadRecording, startAtHome } from "./helpers";

test.describe("recording route", () => {
  test("smoke: renders uploaded recording", async ({ page }) => {
    await startAtHome(page);
    // this also navigates to the recording page, so we can assert that the URL changes as expected
    await uploadRecording(page);

    await expect(page).toHaveURL(/\/recording$/);
    await expect(page.getByText("Offset:")).toBeVisible();
  });
});
