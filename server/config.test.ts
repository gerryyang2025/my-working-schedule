import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveServerConfig } from "./config";

function withTempConfig(content: unknown, run: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "schedule-config-"));
  const path = join(dir, "server.local.json");
  writeFileSync(path, `${JSON.stringify(content, null, 2)}\n`, "utf8");

  try {
    run(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("server config", () => {
  it("binds to all interfaces by default for LAN access", () => {
    const config = resolveServerConfig({}, { defaultConfigPath: null });

    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(3001);
    expect(config.storagePath).toBeUndefined();
    expect(config.adminPassword).toBeUndefined();
  });

  it("uses JSON storage by default", () => {
    const config = resolveServerConfig({}, { defaultConfigPath: null });

    expect(config.storageDriver).toBe("json");
    expect(config.sqlitePath).toBeUndefined();
    expect(config.backupPath).toBeUndefined();
  });

  it("allows host, port, storage path, and admin password env overrides", () => {
    const config = resolveServerConfig({
      HOST: "127.0.0.1",
      PORT: "4100",
      SCHEDULE_DATA_PATH: "/tmp/schedule.json",
      SCHEDULE_ADMIN_PASSWORD: "env-password"
    }, { defaultConfigPath: null });

    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(4100);
    expect(config.storagePath).toBe("/tmp/schedule.json");
    expect(config.adminPassword).toBe("env-password");
  });

  it("allows SQLite storage env overrides", () => {
    const config = resolveServerConfig(
      {
        SCHEDULE_STORAGE_DRIVER: "sqlite",
        SCHEDULE_SQLITE_PATH: "/var/lib/my-working-schedule/schedule.db",
        SCHEDULE_BACKUP_PATH: "/var/backups/my-working-schedule"
      },
      { defaultConfigPath: null }
    );

    expect(config.storageDriver).toBe("sqlite");
    expect(config.sqlitePath).toBe("/var/lib/my-working-schedule/schedule.db");
    expect(config.backupPath).toBe("/var/backups/my-working-schedule");
  });

  it("loads the admin password from the server config file", () => {
    withTempConfig({ adminPassword: "file-password" }, (path) => {
      const config = resolveServerConfig({ SCHEDULE_CONFIG_PATH: path });

      expect(config.adminPassword).toBe("file-password");
    });
  });

  it("loads SQLite storage settings from the server config file", () => {
    withTempConfig(
      {
        storageDriver: "sqlite",
        sqlitePath: "data/schedule.db",
        backupPath: "backups"
      },
      (path) => {
        const config = resolveServerConfig({ SCHEDULE_CONFIG_PATH: path });

        expect(config.storageDriver).toBe("sqlite");
        expect(config.sqlitePath).toBe("data/schedule.db");
        expect(config.backupPath).toBe("backups");
      }
    );
  });

  it("rejects unsupported storage drivers", () => {
    withTempConfig({ storageDriver: "postgres" }, (path) => {
      expect(() => resolveServerConfig({ SCHEDULE_CONFIG_PATH: path })).toThrow("存储驱动配置不正确");
    });
  });

  it("lets a non-empty env admin password override the server config file", () => {
    withTempConfig({ adminPassword: "file-password" }, (path) => {
      const config = resolveServerConfig({
        SCHEDULE_CONFIG_PATH: path,
        SCHEDULE_ADMIN_PASSWORD: "env-password"
      });

      expect(config.adminPassword).toBe("env-password");
    });
  });
});
