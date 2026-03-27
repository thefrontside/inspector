import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./app/tests",
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
    // use "forever" example program that sleeps indefinitely so that
    // the loader process never exits.
    command:
      "pnpm run build && node --experimental-strip-types --import ./dist/loader.js examples/forever.ts --suspend",
    url: "http://127.0.0.1:41000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
