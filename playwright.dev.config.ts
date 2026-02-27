import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./ui/tests",
  testMatch: "**/*.e2e.spec.ts",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // using a different port than the default Vite port to
    // avoid conflicts with the dev server when running tests locally
    command: "pnpm exec vite --host 127.0.0.1 --port 4173 ui",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
