import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import config from "./playwright.config";

describe("Playwright config", () => {
  it("uses an isolated temporary SQLite file for e2e API storage", () => {
    const webServers = Array.isArray(config.webServer) ? config.webServer : [config.webServer];
    const apiServer = webServers.find((server) => server?.command?.includes("dev:api"));

    expect(apiServer?.env?.SCHEDULE_STORAGE_DRIVER).toBe("sqlite");
    expect(apiServer?.env?.SCHEDULE_SQLITE_PATH).toEqual(expect.stringContaining(tmpdir()));
    expect(apiServer?.env?.SCHEDULE_SQLITE_PATH).not.toBe("data/e2e.local.json");
    expect(apiServer?.env?.SCHEDULE_DATA_PATH).toBeUndefined();
  });

  it("runs e2e servers on ports isolated from normal development", () => {
    const webServers = Array.isArray(config.webServer) ? config.webServer : [config.webServer];
    const apiServer = webServers.find((server) => server?.command?.includes("dev:api"));
    const webServer = webServers.find((server) => server?.command?.includes("dev:web"));

    expect(config.use?.baseURL).not.toBe("http://127.0.0.1:5173");
    expect(apiServer?.url).not.toBe("http://127.0.0.1:3001/api/health");
    expect(apiServer?.env?.PORT).toEqual(expect.any(String));
    expect(webServer?.env?.VITE_API_PROXY_TARGET).toBe(`http://127.0.0.1:${apiServer?.env?.PORT}`);
  });
});
