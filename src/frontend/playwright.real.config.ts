import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-real",
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3010", screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: [
    { command: "node e2e-real/start-real-backend.mjs", url: "http://127.0.0.1:5281/api/v1/public/restaurant", timeout: 180_000, reuseExistingServer: false, gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 } },
    { command: "OMNI_REST_API_BASE_URL=http://127.0.0.1:5281 OMNI_REST_FORWARDED_PROTO=https npm run start -- -p 3010 -H 0.0.0.0", url: "http://127.0.0.1:3010", timeout: 60_000, reuseExistingServer: false },
  ],
});
