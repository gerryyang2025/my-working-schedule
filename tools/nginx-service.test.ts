import { execFile, type ExecFileException } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

const tempDirs: string[] = [];
const bashPath = "/bin/bash";
const scriptPath = resolve(process.cwd(), "tools/nginx-service.sh");

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "nginx-service-test-"));
  tempDirs.push(dir);
  return dir;
}

function runTool(args: string[], env: Record<string, string> = {}): Promise<CommandResult> {
  return new Promise((resolveResult) => {
    execFile(
      bashPath,
      [scriptPath, ...args],
      {
        env: {
          ...process.env,
          ...env
        }
      },
      (error: ExecFileException | null, stdout, stderr) => {
        resolveResult({
          code: typeof error?.code === "number" ? error.code : error ? 1 : 0,
          stdout,
          stderr
        });
      }
    );
  });
}

async function createFakeExecutable(path: string, body: string) {
  await writeFile(path, `#!/bin/sh\n${body}`);
  await chmod(path, 0o755);
}

async function readLog(path: string) {
  return readFile(path, "utf8");
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("tools/nginx-service.sh", () => {
  it("prints usage", async () => {
    const result = await runTool(["help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("./tools/nginx-service.sh install");
    expect(result.stdout).toContain("./tools/nginx-service.sh configure");
    expect(result.stdout).toContain("./tools/nginx-service.sh configure-https");
    expect(result.stdout).toContain("./tools/nginx-service.sh test");
    expect(result.stdout).toContain("NGINX_SERVER_NAME");
  });

  it("installs nginx when missing, creates conf.d, copies config, tests, and reloads", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    const logPath = join(dir, "commands.log");
    const confDir = join(dir, "etc", "nginx", "conf.d");
    const confFile = join(confDir, "my-working-schedule.conf");
    await mkdir(fakeBin, { recursive: true });

    await createFakeExecutable(
      join(fakeBin, "dnf"),
      `printf 'dnf %s\\n' "$*" >> "$COMMAND_LOG"
cat > "${fakeBin}/nginx" <<'NGINX'
#!/bin/sh
printf 'nginx %s\n' "$*" >> "$COMMAND_LOG"
exit 0
NGINX
chmod +x "${fakeBin}/nginx"
exit 0
`
    );
    await createFakeExecutable(join(fakeBin, "systemctl"), `printf 'systemctl %s\\n' "$*" >> "$COMMAND_LOG"\nexit 0\n`);

    const result = await runTool(["install"], {
      PATH: `${fakeBin}:/usr/bin:/bin`,
      COMMAND_LOG: logPath,
      NGINX_CONF_DIR: confDir,
      NGINX_CONF_FILE: confFile
    });

    expect(result.code, result.stderr).toBe(0);
    expect(existsSync(confDir)).toBe(true);
    expect(await readFile(confFile, "utf8")).toContain("proxy_pass http://127.0.0.1:3001/api/");
    expect((await readLog(logPath)).trimEnd().split("\n")).toEqual([
      "dnf install -y nginx",
      "nginx -t",
      "systemctl enable nginx",
      "systemctl reload nginx"
    ]);
    expect(result.stdout).toContain(`nginx conf file: ${confFile}`);
    expect(result.stdout).toContain("nginx install/configure completed");
  });

  it("uses yum when dnf is unavailable", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    const logPath = join(dir, "commands.log");
    await mkdir(fakeBin, { recursive: true });
    await createFakeExecutable(
      join(fakeBin, "yum"),
      `printf 'yum %s\\n' "$*" >> "$COMMAND_LOG"
cat > "${fakeBin}/nginx" <<'NGINX'
#!/bin/sh
printf 'nginx %s\n' "$*" >> "$COMMAND_LOG"
exit 0
NGINX
chmod +x "${fakeBin}/nginx"
exit 0
`
    );
    await createFakeExecutable(join(fakeBin, "systemctl"), `printf 'systemctl %s\\n' "$*" >> "$COMMAND_LOG"\nexit 0\n`);

    const result = await runTool(["install"], {
      PATH: `${fakeBin}:/usr/bin:/bin`,
      COMMAND_LOG: logPath,
      NGINX_CONF_DIR: join(dir, "conf.d"),
      NGINX_CONF_FILE: join(dir, "conf.d", "my-working-schedule.conf")
    });

    expect(result.code, result.stderr).toBe(0);
    expect((await readLog(logPath)).trimEnd().split("\n")[0]).toBe("yum install -y nginx");
  });

  it("fails with clear guidance when no supported package manager exists", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    await mkdir(fakeBin, { recursive: true });

    const result = await runTool(["install"], {
      PATH: fakeBin,
      NGINX_CONF_DIR: join(dir, "conf.d"),
      NGINX_CONF_FILE: join(dir, "conf.d", "my-working-schedule.conf")
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("nginx command is missing");
    expect(result.stderr).toContain("supported package manager not found");
  });

  it("supports configure without reloading services", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    const logPath = join(dir, "commands.log");
    const confFile = join(dir, "conf.d", "my-working-schedule.conf");
    await mkdir(fakeBin, { recursive: true });
    await createFakeExecutable(join(fakeBin, "nginx"), `printf 'nginx %s\\n' "$*" >> "$COMMAND_LOG"\nexit 0\n`);
    await createFakeExecutable(join(fakeBin, "systemctl"), `printf 'systemctl %s\\n' "$*" >> "$COMMAND_LOG"\nexit 0\n`);

    const result = await runTool(["configure", "--no-reload"], {
      PATH: `${fakeBin}:/usr/bin:/bin`,
      COMMAND_LOG: logPath,
      NGINX_CONF_DIR: join(dir, "conf.d"),
      NGINX_CONF_FILE: confFile
    });

    expect(result.code, result.stderr).toBe(0);
    expect(await readFile(confFile, "utf8")).toContain("root /opt/my-working-schedule/dist");
    expect((await readLog(logPath)).trimEnd().split("\n")).toEqual(["nginx -t"]);
  });

  it("supports HTTPS configure without reloading services", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    const logPath = join(dir, "commands.log");
    const confFile = join(dir, "conf.d", "my-working-schedule.conf");
    const certFile = join(dir, "certs", "fullchain.pem");
    const keyFile = join(dir, "certs", "privkey.pem");
    await mkdir(fakeBin, { recursive: true });
    await mkdir(join(dir, "certs"), { recursive: true });
    await writeFile(certFile, "cert\n", "utf8");
    await writeFile(keyFile, "key\n", "utf8");
    await createFakeExecutable(join(fakeBin, "nginx"), `printf 'nginx %s\\n' "$*" >> "$COMMAND_LOG"\nexit 0\n`);
    await createFakeExecutable(join(fakeBin, "systemctl"), `printf 'systemctl %s\\n' "$*" >> "$COMMAND_LOG"\nexit 0\n`);

    const result = await runTool(["configure-https", "--no-reload"], {
      PATH: `${fakeBin}:/usr/bin:/bin`,
      COMMAND_LOG: logPath,
      NGINX_CONF_DIR: join(dir, "conf.d"),
      NGINX_CONF_FILE: confFile,
      NGINX_SERVER_NAME: "schedule.example.test",
      NGINX_SSL_CERTIFICATE: certFile,
      NGINX_SSL_CERTIFICATE_KEY: keyFile
    });

    expect(result.code, result.stderr).toBe(0);
    const conf = await readFile(confFile, "utf8");
    expect(conf).toContain("listen 443 ssl http2;");
    expect(conf).toContain("server_name schedule.example.test;");
    expect(conf).toContain(`ssl_certificate ${certFile};`);
    expect(conf).toContain(`ssl_certificate_key ${keyFile};`);
    expect(conf).toContain("proxy_pass http://127.0.0.1:3001/api/");
    expect((await readLog(logPath)).trimEnd().split("\n")).toEqual(["nginx -t"]);
    expect(result.stdout).toContain("nginx HTTPS configure completed");
  });

  it("fails HTTPS configure when certificate files are missing", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    const logPath = join(dir, "commands.log");
    const confFile = join(dir, "conf.d", "my-working-schedule.conf");
    await mkdir(fakeBin, { recursive: true });
    await createFakeExecutable(join(fakeBin, "nginx"), `printf 'nginx %s\\n' "$*" >> "$COMMAND_LOG"\nexit 0\n`);

    const result = await runTool(["configure-https", "--no-reload"], {
      PATH: `${fakeBin}:/usr/bin:/bin`,
      COMMAND_LOG: logPath,
      NGINX_CONF_DIR: join(dir, "conf.d"),
      NGINX_CONF_FILE: confFile,
      NGINX_SERVER_NAME: "schedule.example.test",
      NGINX_SSL_CERTIFICATE: join(dir, "missing-fullchain.pem"),
      NGINX_SSL_CERTIFICATE_KEY: join(dir, "missing-privkey.pem")
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("NGINX_SSL_CERTIFICATE does not exist");
    expect(existsSync(confFile)).toBe(false);
    expect(existsSync(logPath)).toBe(false);
  });
});
