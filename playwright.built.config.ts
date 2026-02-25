import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./ui/tests",
  testMatch: "**/*.e2e.spec.ts",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:41000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      "pnpm run build && node --import tsx --import ./dist/loader.js examples/example.ts --suspend",
    url: "http://127.0.0.1:41000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
