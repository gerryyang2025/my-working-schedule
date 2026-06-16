import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const e2eDataPath = join(tmpdir(), `my-working-schedule-e2e-${process.pid}.json`);
const e2eApiPort = 3101;
const e2eWebPort = 5174;
const e2eApiUrl = `http://127.0.0.1:${e2eApiPort}`;
const e2eWebUrl = `http://127.0.0.1:${e2eWebPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: e2eWebUrl,
    trace: "on-first-retry"
  },
  webServer: [
    {
      command: "npm run dev:api",
      url: `${e2eApiUrl}/api/health`,
      env: {
        PORT: String(e2eApiPort),
        SCHEDULE_DATA_PATH: e2eDataPath,
        SCHEDULE_ADMIN_PASSWORD: "123456"
      },
      reuseExistingServer: false
    },
    {
      command: `npm run dev:web -- --port ${e2eWebPort}`,
      url: e2eWebUrl,
      env: {
        VITE_API_PROXY_TARGET: e2eApiUrl
      },
      reuseExistingServer: false
    }
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
