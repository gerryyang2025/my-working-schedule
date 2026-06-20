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
    expect(runbook).toContain("./optools.sh deploy");
    expect(runbook).toContain("安装并 dry-run 验证 logrotate");
    expect(runbook).toContain("OPTOOLS_HEALTH_RETRIES=60 OPTOOLS_HEALTH_RETRY_DELAY=1 ./optools.sh deploy");
    expect(runbook).toContain("./optools.sh build");
    expect(runbook).toContain("npm run start:api");
    expect(runbook).toContain("./optools.sh app init");
    expect(runbook).toContain("./optools.sh app doctor");
    expect(runbook).toContain("status=203/EXEC");
    expect(runbook).toContain("OPTOOLS_NPM_BIN");
    expect(runbook).toContain("./optools.sh app status");
    expect(runbook).toContain("./optools.sh nginx install");
    expect(runbook).toContain("当前阶段尚未申请正式域名，推荐继续使用 **HTTP + 服务器公网 IP** 访问");
    expect(runbook).toContain("当前 HTTP + IP 阶段");
    expect(runbook).toContain("[skip] nginx https config");
    expect(runbook).toContain("后续申请正式域名并完成 DNS 解析后，再启用 HTTPS");
    expect(runbook).toContain("./optools.sh nginx configure-https");
    expect(runbook).toContain("NGINX_SERVER_NAME");
    expect(runbook).toContain("NGINX_SSL_CERTIFICATE");
    expect(runbook).toContain("./optools.sh logrotate install");
    expect(runbook).toContain("./optools.sh logrotate test");
    expect(runbook).toContain("./optools.sh firewall status");
    expect(runbook).toContain("./optools.sh firewall guide");
    expect(runbook).toContain("./optools.sh data backup");
    expect(runbook).toContain("./optools.sh data check");
    expect(runbook).toContain("./optools.sh app status");
    expect(runbook).toContain("./optools.sh doctor");
    expect(runbook).toContain("账号与人员档案绑定");
    expect(runbook).toContain("系统配置 > 账号");
    expect(runbook).toContain("绑定人员");
    expect(runbook).toContain("系统管理员");
    expect(runbook).toContain("排班管理员");
    expect(runbook).toContain("只读查看");
    expect(runbook).toContain("护士长需要参与排班管理时");
    expect(runbook).toContain("绑定人员只用于标识账号本人，不会自动授予排班权限；可管理人员决定排班和月结可操作范围。");
    expect(runbook).toContain("排班管理员：使用 `scheduler` 角色，并显式选择可管理人员；未选择时只能查看，不能编辑任何人员。");
    expect(runbook).toContain("护士长需要参与排班管理时，账号角色使用 `scheduler`");
    expect(runbook).toContain("EADDRINUSE");
    expect(runbook).toContain("ss -ltnp | grep ':3001'");
    expect(runbook).toContain("/api/health");
  });

  it("keeps production config examples on SQLite without committed secrets", async () => {
    const config = JSON.parse(await readProjectFile("config/server.production.example.json")) as Record<string, unknown>;

    expect(config).toMatchObject({
      host: "127.0.0.1",
      port: 3001,
      storageDriver: "sqlite",
      sqlitePath: "/var/lib/my-working-schedule/schedule.db",
      backupPath: "/var/backups/my-working-schedule"
    });
    expect(config.storagePath).toBeUndefined();
    expect(config.adminPassword).toBe("change-me-via-env-or-local-config");
    expect(JSON.stringify(config)).not.toContain("123456");
  });

  it("provides systemd, nginx, logrotate, and backup schedule examples wired to production commands", async () => {
    const service = await readProjectFile("deploy/systemd/my-working-schedule.service.example");
    const nginx = await readProjectFile("deploy/nginx/my-working-schedule.conf.example");
    const nginxHttps = await readProjectFile("deploy/nginx/my-working-schedule-https.conf.example");
    const logrotate = await readProjectFile("deploy/logrotate/my-working-schedule.example");
    const cron = await readProjectFile("deploy/cron/my-working-schedule-backup.cron.example");

    expect(service).toContain("WorkingDirectory=/opt/my-working-schedule");
    expect(service).toContain("Environment=SCHEDULE_STORAGE_DRIVER=sqlite");
    expect(service).toContain("Environment=SCHEDULE_SQLITE_PATH=/var/lib/my-working-schedule/schedule.db");
    expect(service).not.toContain("SCHEDULE_DATA_PATH");
    expect(service).toContain("ExecStart=/usr/bin/npm run start:api");
    expect(service).not.toContain("npm run dev");

    expect(nginx).toContain("root /opt/my-working-schedule/dist");
    expect(nginx).toContain("proxy_pass http://127.0.0.1:3001/api/");
    expect(nginx).toContain("try_files $uri $uri/ /index.html");

    expect(nginxHttps).toContain("listen 443 ssl http2");
    expect(nginxHttps).toContain("ssl_certificate __SSL_CERTIFICATE__");
    expect(nginxHttps).toContain("ssl_certificate_key __SSL_CERTIFICATE_KEY__");
    expect(nginxHttps).toContain("return 301 https://$host$request_uri");

    expect(logrotate).toContain("/var/log/my-working-schedule-backup.log");
    expect(logrotate).toContain("copytruncate");

    expect(cron).toContain("SCHEDULE_STORAGE_DRIVER=sqlite");
    expect(cron).not.toContain("SCHEDULE_DATA_PATH");
    expect(cron).toContain("/opt/my-working-schedule/tools/sqlite-service.sh backup");
  });
});
