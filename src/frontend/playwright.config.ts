import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // `list` is the readable one while working, one line per test.
  //
  // CI uses `dot` instead, and the reason is not taste. Five browser projects × 46 tests makes `list`
  // produce a 1000+ line log, and GitHub's viewer virtualises long logs — it renders roughly the first
  // half, which is precisely the half without the failure summary in it. The run becomes unreadable
  // from outside exactly when it fails. `dot` collapses the per-test lines to single characters and
  // still prints every failure in full at the end, so the whole log fits in what the viewer renders.
  // The HTML report is added for the artifact upload; without it `playwright-report/` never exists.
  reporter: process.env.CI ? [["dot"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://menu.localhost:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node e2e/start-backend.mjs",
      url: "http://127.0.0.1:5279/api/v1/public/menu",
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: "node e2e/api-proxy.mjs",
      port: 5290,
      timeout: 30_000,
      reuseExistingServer: false,
    },
    {
      command: "OMNI_REST_API_BASE_URL=http://127.0.0.1:5290 npm run start -- -p 3000 -H 0.0.0.0",
      url: "http://127.0.0.1:3000",
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1_440, height: 900 } },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], viewport: { width: 1_024, height: 768 } },
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        baseURL: "http://127.0.0.1:3000",
        viewport: { width: 375, height: 812 },
      },
    },
    {
      name: "chromium-minimum",
      use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 568 } },
    },
    {
      name: "chromium-tablet",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1_024 } },
    },
  ],
});
