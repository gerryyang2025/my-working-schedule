import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry"
  },
  webServer: [
    {
      command: "npm run dev:api",
      url: "http://127.0.0.1:3001/api/health",
      env: {
        SCHEDULE_DATA_PATH: "data/e2e.local.json"
      },
      reuseExistingServer: true
    },
    {
      command: "npm run dev:web",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true
    }
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
