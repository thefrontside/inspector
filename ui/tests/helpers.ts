import { expect, type Page } from "@playwright/test";

export async function startAtHome(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Start Connection" })).toBeVisible();
}

export async function uploadRecording(page: Page) {
  await page.getByLabel("Upload recording file").setInputFiles({
    name: "recording.json",
    mimeType: "application/json",
    buffer: Buffer.from("[]"),
  });
}
