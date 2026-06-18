import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

async function readProjectFile(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

describe("production deployment docs and examples", () => {
  it("documents the production deployment runbook with SQLite and service operations", async () => {
    const runbook = await readProjectFile("docs/正式部署运行手册.md");

    expect(runbook).toContain("SCHEDULE_STORAGE_DRIVER=sqlite");
    expect(runbook).toContain("SCHEDULE_SQLITE_PATH=/var/lib/my-working-schedule/schedule.db");
    expect(runbook).toContain("SCHEDULE_BACKUP_PATH=/var/backups/my-working-schedule");
    expect(runbook).toContain("npm run build");
    expect(runbook).toContain("npm run start:api");
    expect(runbook).toContain("systemctl status my-working-schedule");
    expect(runbook).toContain("./tools/nginx-service.sh install");
    expect(runbook).toContain("./tools/sqlite-service.sh backup");
    expect(runbook).toContain("./tools/sqlite-service.sh check");
    expect(runbook).toContain("/api/health");
  });

  it("keeps production config examples on SQLite without committed secrets", async () => {
    const config = JSON.parse(await readProjectFile("config/server.production.example.json")) as Record<string, unknown>;

    expect(config).toMatchObject({
      host: "127.0.0.1",
      port: 3001,
      storageDriver: "sqlite",
      storagePath: "data/app-data.local.json",
      sqlitePath: "/var/lib/my-working-schedule/schedule.db",
      backupPath: "/var/backups/my-working-schedule"
    });
    expect(config.adminPassword).toBe("change-me-via-env-or-local-config");
    expect(JSON.stringify(config)).not.toContain("123456");
  });

  it("provides systemd, nginx, and backup schedule examples wired to production commands", async () => {
    const service = await readProjectFile("deploy/systemd/my-working-schedule.service.example");
    const nginx = await readProjectFile("deploy/nginx/my-working-schedule.conf.example");
    const cron = await readProjectFile("deploy/cron/my-working-schedule-backup.cron.example");

    expect(service).toContain("WorkingDirectory=/opt/my-working-schedule");
    expect(service).toContain("Environment=SCHEDULE_STORAGE_DRIVER=sqlite");
    expect(service).toContain("Environment=SCHEDULE_SQLITE_PATH=/var/lib/my-working-schedule/schedule.db");
    expect(service).toContain("ExecStart=/usr/bin/npm run start:api");
    expect(service).not.toContain("npm run dev");

    expect(nginx).toContain("root /opt/my-working-schedule/dist");
    expect(nginx).toContain("proxy_pass http://127.0.0.1:3001/api/");
    expect(nginx).toContain("try_files $uri $uri/ /index.html");

    expect(cron).toContain("SCHEDULE_STORAGE_DRIVER=sqlite");
    expect(cron).toContain("/opt/my-working-schedule/tools/sqlite-service.sh backup");
  });
});
