import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4174",
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "msedge",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
