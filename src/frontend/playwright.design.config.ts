import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "design.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://admin.localhost:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
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
      name: "chromium-design",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1_280, height: 900 },
      },
    },
  ],
});
