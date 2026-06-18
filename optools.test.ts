import { execFile, type ExecFileException } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

const tempDirs: string[] = [];
const scriptPath = resolve(process.cwd(), "optools.sh");

async function createStateDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "optools-test-"));
  tempDirs.push(dir);
  return dir;
}

function runOptools(args: string[], env: Record<string, string> = {}): Promise<CommandResult> {
  return new Promise((resolveResult) => {
    execFile(
      "bash",
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

async function createExecutable(path: string, body: string): Promise<void> {
  await writeFile(path, `#!/usr/bin/env bash\n${body}`, "utf8");
  await chmod(path, 0o755);
}

async function readUntilContains(path: string, expected: string): Promise<string> {
  let content = "";

  for (let attempt = 0; attempt < 20; attempt += 1) {
    content = await readFile(path, "utf8").catch(() => "");
    if (content.includes(expected)) {
      return content;
    }
    await delay(100);
  }

  return content;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("optools.sh", () => {
  it("prints development daemon usage", async () => {
    const result = await runOptools(["help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("./optools.sh dev start");
    expect(result.stdout).toContain("./optools.sh dev status");
    expect(result.stdout).toContain("./optools.sh dev stop");
    expect(result.stdout).toContain("./optools.sh build");
    expect(result.stdout).toContain("./optools.sh deploy");
    expect(result.stdout).toContain("./optools.sh nginx install");
    expect(result.stdout).toContain("./optools.sh nginx status");
    expect(result.stdout).toContain("./optools.sh data check");
    expect(result.stdout).toContain("./optools.sh app init");
    expect(result.stdout).toContain("./optools.sh app doctor");
    expect(result.stdout).toContain("./optools.sh app status");
    expect(result.stdout).toContain("./optools.sh doctor");
    expect(result.stdout).toContain("HOST");
    expect(result.stdout).toContain("WEB_HOST");
    expect(result.stdout).toContain("PUBLIC_HOST");
    expect(result.stdout).toContain("OPTOOLS_INSTALL_DIR");
    expect(result.stdout).toContain("OPTOOLS_NGINX_SERVICE_SCRIPT");
    expect(result.stdout).toContain("OPTOOLS_SQLITE_SERVICE_SCRIPT");
    expect(result.stdout).toContain("OPTOOLS_APP_SERVICE_NAME");
    expect(result.stdout).toContain("OPTOOLS_APP_USER");
    expect(result.stdout).toContain("OPTOOLS_APP_GROUP");
    expect(result.stdout).toContain("OPTOOLS_SYSTEMD_SERVICE_FILE");
  });

  it("builds frontend assets and installs the API runtime files to the configured deployment directory", async () => {
    const stateDir = await createStateDir();
    const fakeBinDir = join(stateDir, "bin");
    const installDir = join(stateDir, "install");
    const fakeNpmPath = join(fakeBinDir, "npm");
    const commandLogPath = join(stateDir, "commands.log");

    await mkdir(fakeBinDir, { recursive: true });
    await writeFile(
      fakeNpmPath,
      `#!/usr/bin/env bash
printf 'npm %s\\n' "$*" >> "$COMMAND_LOG"
mkdir -p dist/assets
printf '<html>built</html>\\n' > dist/index.html
printf 'asset\\n' > dist/assets/app.js
`,
      "utf8"
    );
    await chmod(fakeNpmPath, 0o755);

    const result = await runOptools(["build"], {
      OPTOOLS_INSTALL_DIR: installDir,
      COMMAND_LOG: commandLogPath,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    });

    expect(result.code, result.stderr).toBe(0);
    expect(await readFile(commandLogPath, "utf8")).toBe("npm run build\n");
    expect(await readFile(join(installDir, "dist", "index.html"), "utf8")).toBe("<html>built</html>\n");
    expect(await readFile(join(installDir, "dist", "assets", "app.js"), "utf8")).toBe("asset\n");
    expect(await readFile(join(installDir, "package.json"), "utf8")).toContain('"start:api"');
    expect(await readFile(join(installDir, "package-lock.json"), "utf8")).toContain('"lockfileVersion"');
    expect(await readFile(join(installDir, "server", "index.ts"), "utf8")).toContain("Schedule API");
    expect(await readFile(join(installDir, "src", "types", "domain.ts"), "utf8")).toContain("export interface StaffMember");
    expect(await readFile(join(installDir, "tsconfig.node.json"), "utf8")).toContain('"compilerOptions"');
    expect(await readFile(join(installDir, "config", "server.production.example.json"), "utf8")).toContain(
      '"storageDriver"'
    );
    await expect(readFile(join(installDir, "config", "server.local.json"), "utf8")).rejects.toThrow();
    expect(result.stdout).toContain("build: completed");
    expect(result.stdout).toContain(`installed dist: ${join(installDir, "dist")}`);
    expect(result.stdout).toContain(`installed runtime: ${installDir}`);
  });

  it("delegates nginx operations to the nginx helper script", async () => {
    const stateDir = await createStateDir();
    const fakeNginxHelper = join(stateDir, "nginx-service.sh");
    const logPath = join(stateDir, "nginx.log");

    await writeFile(
      fakeNginxHelper,
      `#!/usr/bin/env bash
{
  printf 'cwd=%s\\n' "$PWD"
  printf 'argc=%s\\n' "$#"
  index=1
  for arg in "$@"; do
    printf 'arg%s=%s\\n' "$index" "$arg"
    index=$((index + 1))
  done
} >> "$NGINX_LOG"
`,
      "utf8"
    );
    await chmod(fakeNginxHelper, 0o755);

    const result = await runOptools(["nginx", "configure", "--no-reload"], {
      OPTOOLS_NGINX_SERVICE_SCRIPT: fakeNginxHelper,
      NGINX_LOG: logPath
    });

    expect(result.code, result.stderr).toBe(0);
    expect(await readFile(logPath, "utf8")).toBe(
      [
        `cwd=${process.cwd()}`,
        "argc=2",
        "arg1=configure",
        "arg2=--no-reload",
        ""
      ].join("\n")
    );
  });

  it("delegates SQLite data operations to the data helper script", async () => {
    const stateDir = await createStateDir();
    const fakeDataHelper = join(stateDir, "sqlite-service.sh");
    const logPath = join(stateDir, "data.log");

    await createExecutable(
      fakeDataHelper,
      `{
  printf 'cwd=%s\\n' "$PWD"
  printf 'argc=%s\\n' "$#"
  index=1
  for arg in "$@"; do
    printf 'arg%s=%s\\n' "$index" "$arg"
    index=$((index + 1))
  done
} >> "$DATA_LOG"
`
    );

    const result = await runOptools(["data", "restore", "schedule.db"], {
      OPTOOLS_SQLITE_SERVICE_SCRIPT: fakeDataHelper,
      DATA_LOG: logPath
    });

    expect(result.code, result.stderr).toBe(0);
    expect(await readFile(logPath, "utf8")).toBe(
      [
        `cwd=${process.cwd()}`,
        "argc=2",
        "arg1=restore",
        "arg2=schedule.db",
        ""
      ].join("\n")
    );
  });

  it("runs data export-json through npm from the project root", async () => {
    const stateDir = await createStateDir();
    const fakeBinDir = join(stateDir, "bin");
    const fakeNpmPath = join(fakeBinDir, "npm");
    const commandLogPath = join(stateDir, "commands.log");

    await mkdir(fakeBinDir, { recursive: true });
    await createExecutable(
      fakeNpmPath,
      `printf 'cwd=%s\\n' "$PWD" >> "$COMMAND_LOG"
printf 'npm %s\\n' "$*" >> "$COMMAND_LOG"
`
    );

    const result = await runOptools(["data", "export-json"], {
      COMMAND_LOG: commandLogPath,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    });

    expect(result.code, result.stderr).toBe(0);
    expect(await readFile(commandLogPath, "utf8")).toBe(
      [`cwd=${process.cwd()}`, "npm run data:export:json", ""].join("\n")
    );
  });

  it("delegates production app operations to systemd and journalctl", async () => {
    const stateDir = await createStateDir();
    const fakeBinDir = join(stateDir, "bin");
    const logPath = join(stateDir, "app.log");

    await mkdir(fakeBinDir, { recursive: true });
    await createExecutable(join(fakeBinDir, "systemctl"), `printf 'systemctl %s\\n' "$*" >> "$APP_LOG"\n`);
    await createExecutable(join(fakeBinDir, "journalctl"), `printf 'journalctl %s\\n' "$*" >> "$APP_LOG"\n`);

    const status = await runOptools(["app", "status"], {
      APP_LOG: logPath,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`,
      OPTOOLS_APP_SERVICE_NAME: "schedule-api"
    });
    const logs = await runOptools(["app", "logs"], {
      APP_LOG: logPath,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`,
      OPTOOLS_APP_SERVICE_NAME: "schedule-api"
    });

    expect(status.code, status.stderr).toBe(0);
    expect(logs.code, logs.stderr).toBe(0);
    expect(await readFile(logPath, "utf8")).toBe(
      [
        "systemctl status schedule-api",
        "journalctl -u schedule-api -n 80 --no-pager",
        ""
      ].join("\n")
    );
  });

  it("runs one-command production deploy from the source directory", async () => {
    const stateDir = await createStateDir();
    const fakeBinDir = join(stateDir, "bin");
    const installDir = join(stateDir, "opt", "my-working-schedule");
    const dataDir = join(stateDir, "var", "lib", "my-working-schedule");
    const backupDir = join(stateDir, "var", "backups", "my-working-schedule");
    const systemdFile = join(stateDir, "etc", "systemd", "system", "my-working-schedule.service");
    const sourceFile = join(stateDir, "source.service");
    const fakeDataHelper = join(stateDir, "sqlite-service.sh");
    const fakeNginxHelper = join(stateDir, "nginx-service.sh");
    const commandLogPath = join(stateDir, "deploy.log");
    const fakeNpmPath = join(fakeBinDir, "npm");

    await mkdir(fakeBinDir, { recursive: true });
    await mkdir(join(stateDir, "etc", "systemd", "system"), { recursive: true });
    await writeFile(sourceFile, "[Service]\nExecStart=/usr/bin/npm run start:api\n", "utf8");
    await createExecutable(
      fakeNpmPath,
      `printf 'npm cwd=%s args=%s\\n' "$PWD" "$*" >> "$DEPLOY_LOG"
if [ "$1" = "run" ] && [ "$2" = "build" ]; then
  mkdir -p dist/assets
  printf '<html>built</html>\\n' > dist/index.html
  printf 'asset\\n' > dist/assets/app.js
fi
`
    );
    await createExecutable(join(fakeBinDir, "getent"), "exit 0\n");
    await createExecutable(join(fakeBinDir, "chown"), `printf 'chown %s\\n' "$*" >> "$DEPLOY_LOG"\n`);
    await createExecutable(join(fakeBinDir, "systemctl"), `printf 'systemctl %s\\n' "$*" >> "$DEPLOY_LOG"\n`);
    await createExecutable(join(fakeBinDir, "runuser"), `printf 'runuser %s\\n' "$*" >> "$DEPLOY_LOG"\n`);
    await createExecutable(join(fakeBinDir, "ss"), `printf 'ss %s\\n' "$*" >> "$DEPLOY_LOG"\n`);
    await createExecutable(join(fakeBinDir, "curl"), `printf 'curl %s\\n' "$*" >> "$DEPLOY_LOG"\n`);
    await createExecutable(fakeDataHelper, `printf 'data %s\\n' "$*" >> "$DEPLOY_LOG"\n`);
    await createExecutable(fakeNginxHelper, `printf 'nginx %s\\n' "$*" >> "$DEPLOY_LOG"\n`);

    const result = await runOptools(["deploy"], {
      DEPLOY_LOG: commandLogPath,
      OPTOOLS_INSTALL_DIR: installDir,
      OPTOOLS_DATA_DIR: dataDir,
      OPTOOLS_BACKUP_DIR: backupDir,
      OPTOOLS_SYSTEMD_SOURCE_FILE: sourceFile,
      OPTOOLS_SYSTEMD_SERVICE_FILE: systemdFile,
      OPTOOLS_SQLITE_SERVICE_SCRIPT: fakeDataHelper,
      OPTOOLS_NGINX_SERVICE_SCRIPT: fakeNginxHelper,
      OPTOOLS_APP_SERVICE_NAME: "schedule-api",
      OPTOOLS_API_HEALTH_URL: "http://127.0.0.1:3001/api/health",
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    });

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("deploy: completed");
    const log = await readFile(commandLogPath, "utf8");
    expect(log).toContain("systemctl daemon-reload");
    expect(log).toContain("systemctl enable schedule-api");
    expect(log).toContain(`npm cwd=${process.cwd()} args=run build`);
    expect(log).toContain(`npm cwd=${process.cwd()} args=--prefix ${installDir} ci --include=dev`);
    expect(log).toContain("data status");
    expect(log).toContain("data check");
    expect(log).toContain("nginx test");
    expect(log).toContain("systemctl stop schedule-api");
    expect(log).toContain("ss -ltnp sport = :3001");
    expect(log).toContain("systemctl start schedule-api");
    expect(log).toContain("systemctl status schedule-api");
    expect(log).toContain("curl -fsS --max-time 2 http://127.0.0.1:3001/api/health");
  });

  it("stops deploy when the API port is already occupied after stopping the app service", async () => {
    const stateDir = await createStateDir();
    const fakeBinDir = join(stateDir, "bin");
    const installDir = join(stateDir, "opt", "my-working-schedule");
    const dataDir = join(stateDir, "var", "lib", "my-working-schedule");
    const backupDir = join(stateDir, "var", "backups", "my-working-schedule");
    const systemdFile = join(stateDir, "etc", "systemd", "system", "my-working-schedule.service");
    const sourceFile = join(stateDir, "source.service");
    const fakeDataHelper = join(stateDir, "sqlite-service.sh");
    const fakeNginxHelper = join(stateDir, "nginx-service.sh");
    const commandLogPath = join(stateDir, "deploy.log");
    const fakeNpmPath = join(fakeBinDir, "npm");

    await mkdir(fakeBinDir, { recursive: true });
    await mkdir(join(stateDir, "etc", "systemd", "system"), { recursive: true });
    await writeFile(sourceFile, "[Service]\nExecStart=/usr/bin/npm run start:api\n", "utf8");
    await createExecutable(
      fakeNpmPath,
      `printf 'npm %s\\n' "$*" >> "$DEPLOY_LOG"
if [ "$1" = "run" ] && [ "$2" = "build" ]; then
  mkdir -p dist/assets
  printf '<html>built</html>\\n' > dist/index.html
  printf 'asset\\n' > dist/assets/app.js
fi
`
    );
    await createExecutable(join(fakeBinDir, "getent"), "exit 0\n");
    await createExecutable(join(fakeBinDir, "chown"), "exit 0\n");
    await createExecutable(join(fakeBinDir, "systemctl"), `printf 'systemctl %s\\n' "$*" >> "$DEPLOY_LOG"\n`);
    await createExecutable(join(fakeBinDir, "runuser"), "exit 0\n");
    await createExecutable(
      join(fakeBinDir, "ss"),
      `printf 'ss %s\\n' "$*" >> "$DEPLOY_LOG"
printf 'State Recv-Q Send-Q Local Address:Port Peer Address:Port Process\\n'
printf 'LISTEN 0 511 127.0.0.1:3001 0.0.0.0:* users:(("node",pid=123,fd=18))\\n'
`
    );
    await createExecutable(join(fakeBinDir, "curl"), `printf 'curl %s\\n' "$*" >> "$DEPLOY_LOG"\n`);
    await createExecutable(fakeDataHelper, `printf 'data %s\\n' "$*" >> "$DEPLOY_LOG"\n`);
    await createExecutable(fakeNginxHelper, `printf 'nginx %s\\n' "$*" >> "$DEPLOY_LOG"\n`);

    const result = await runOptools(["deploy"], {
      DEPLOY_LOG: commandLogPath,
      OPTOOLS_INSTALL_DIR: installDir,
      OPTOOLS_DATA_DIR: dataDir,
      OPTOOLS_BACKUP_DIR: backupDir,
      OPTOOLS_SYSTEMD_SOURCE_FILE: sourceFile,
      OPTOOLS_SYSTEMD_SERVICE_FILE: systemdFile,
      OPTOOLS_SQLITE_SERVICE_SCRIPT: fakeDataHelper,
      OPTOOLS_NGINX_SERVICE_SCRIPT: fakeNginxHelper,
      OPTOOLS_APP_SERVICE_NAME: "schedule-api",
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("API port is already in use: 3001");
    expect(result.stderr).toContain("node");
    const log = await readFile(commandLogPath, "utf8");
    expect(log).toContain("systemctl stop schedule-api");
    expect(log).not.toContain("systemctl start schedule-api");
    expect(log).not.toContain("curl -fsS --max-time 2");
  });

  it("initializes the production app user, directories, and systemd service", async () => {
    const stateDir = await createStateDir();
    const fakeBinDir = join(stateDir, "bin");
    const logPath = join(stateDir, "init.log");
    const installDir = join(stateDir, "opt", "my-working-schedule");
    const dataDir = join(stateDir, "var", "lib", "my-working-schedule");
    const backupDir = join(stateDir, "var", "backups", "my-working-schedule");
    const systemdFile = join(stateDir, "etc", "systemd", "system", "my-working-schedule.service");
    const sourceFile = join(stateDir, "source.service");
    const fakeNpmPath = join(fakeBinDir, "npm");

    await mkdir(fakeBinDir, { recursive: true });
    await mkdir(join(stateDir, "etc", "systemd", "system"), { recursive: true });
    await writeFile(sourceFile, "[Service]\nExecStart=/usr/bin/npm run start:api\n", "utf8");
    await createExecutable(fakeNpmPath, "exit 0\n");
    await createExecutable(join(fakeBinDir, "getent"), `printf 'getent %s\\n' "$*" >> "$INIT_LOG"\nexit 2\n`);
    await createExecutable(join(fakeBinDir, "groupadd"), `printf 'groupadd %s\\n' "$*" >> "$INIT_LOG"\n`);
    await createExecutable(join(fakeBinDir, "useradd"), `printf 'useradd %s\\n' "$*" >> "$INIT_LOG"\n`);
    await createExecutable(join(fakeBinDir, "chown"), `printf 'chown %s\\n' "$*" >> "$INIT_LOG"\n`);
    await createExecutable(join(fakeBinDir, "systemctl"), `printf 'systemctl %s\\n' "$*" >> "$INIT_LOG"\n`);
    await createExecutable(join(fakeBinDir, "runuser"), `printf 'runuser %s\\n' "$*" >> "$INIT_LOG"\n`);

    const result = await runOptools(["app", "init"], {
      INIT_LOG: logPath,
      OPTOOLS_INSTALL_DIR: installDir,
      OPTOOLS_DATA_DIR: dataDir,
      OPTOOLS_BACKUP_DIR: backupDir,
      OPTOOLS_SYSTEMD_SOURCE_FILE: sourceFile,
      OPTOOLS_SYSTEMD_SERVICE_FILE: systemdFile,
      OPTOOLS_APP_USER: "schedule-user",
      OPTOOLS_APP_GROUP: "schedule-group",
      OPTOOLS_APP_SERVICE_NAME: "schedule-api",
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    });

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("app init: completed");
    expect(await readFile(systemdFile, "utf8")).toBe(
      [
        "[Service]",
        `Environment=PATH=${fakeBinDir}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
        `ExecStart=${fakeNpmPath} run start:api`,
        ""
      ].join("\n")
    );
    expect(await readFile(logPath, "utf8")).toBe(
      [
        "getent group schedule-group",
        "groupadd --system schedule-group",
        "getent passwd schedule-user",
        `useradd --system --gid schedule-group --home-dir ${dataDir} --shell /sbin/nologin schedule-user`,
        `runuser -u schedule-user -- ${fakeNpmPath} --version`,
        `chown -R schedule-user:schedule-group ${installDir} ${dataDir} ${backupDir}`,
        "systemctl daemon-reload",
        "systemctl enable schedule-api",
        ""
      ].join("\n")
    );
  });

  it("rejects npm executables that the production app user cannot run", async () => {
    const stateDir = await createStateDir();
    const fakeBinDir = join(stateDir, "bin");
    const installDir = join(stateDir, "opt", "my-working-schedule");
    const dataDir = join(stateDir, "var", "lib", "my-working-schedule");
    const backupDir = join(stateDir, "var", "backups", "my-working-schedule");
    const systemdFile = join(stateDir, "etc", "systemd", "system", "my-working-schedule.service");
    const sourceFile = join(stateDir, "source.service");
    const rootOnlyNpm = join(stateDir, "root", ".nvm", "versions", "node", "v22", "bin", "npm");

    await mkdir(fakeBinDir, { recursive: true });
    await mkdir(join(stateDir, "etc", "systemd", "system"), { recursive: true });
    await mkdir(join(rootOnlyNpm, ".."), { recursive: true });
    await writeFile(sourceFile, "[Service]\nExecStart=/usr/bin/npm run start:api\n", "utf8");
    await createExecutable(rootOnlyNpm, "exit 0\n");
    await createExecutable(join(fakeBinDir, "getent"), "exit 0\n");
    await createExecutable(join(fakeBinDir, "systemctl"), "exit 0\n");
    await createExecutable(join(fakeBinDir, "chown"), "exit 0\n");
    await createExecutable(join(fakeBinDir, "runuser"), "exit 126\n");

    const result = await runOptools(["app", "init"], {
      OPTOOLS_INSTALL_DIR: installDir,
      OPTOOLS_DATA_DIR: dataDir,
      OPTOOLS_BACKUP_DIR: backupDir,
      OPTOOLS_SYSTEMD_SOURCE_FILE: sourceFile,
      OPTOOLS_SYSTEMD_SERVICE_FILE: systemdFile,
      OPTOOLS_NPM_BIN: rootOnlyNpm,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("npm executable cannot be run by service user");
    expect(result.stderr).toContain("OPTOOLS_NPM_BIN");
  });

  it("selects a service-user runnable npm candidate when PATH npm is not runnable", async () => {
    const stateDir = await createStateDir();
    const fakeBinDir = join(stateDir, "bin");
    const installDir = join(stateDir, "opt", "my-working-schedule");
    const dataDir = join(stateDir, "var", "lib", "my-working-schedule");
    const backupDir = join(stateDir, "var", "backups", "my-working-schedule");
    const systemdFile = join(stateDir, "etc", "systemd", "system", "my-working-schedule.service");
    const sourceFile = join(stateDir, "source.service");
    const rootNpmDir = join(stateDir, "root", ".nvm", "versions", "node", "v22.22.0", "bin");
    const rootNpm = join(rootNpmDir, "npm");
    const optNpmDir = join(stateDir, "opt", "node-v22.22.0", "bin");
    const optNpm = join(optNpmDir, "npm");
    const logPath = join(stateDir, "init.log");

    await mkdir(fakeBinDir, { recursive: true });
    await mkdir(join(stateDir, "etc", "systemd", "system"), { recursive: true });
    await mkdir(rootNpmDir, { recursive: true });
    await mkdir(optNpmDir, { recursive: true });
    await writeFile(sourceFile, "[Service]\nExecStart=/usr/bin/npm run start:api\n", "utf8");
    await createExecutable(rootNpm, "exit 0\n");
    await createExecutable(optNpm, "exit 0\n");
    await createExecutable(join(fakeBinDir, "getent"), "exit 0\n");
    await createExecutable(join(fakeBinDir, "systemctl"), `printf 'systemctl %s\\n' "$*" >> "$INIT_LOG"\n`);
    await createExecutable(join(fakeBinDir, "chown"), "exit 0\n");
    await createExecutable(
      join(fakeBinDir, "runuser"),
      `printf 'runuser %s\\n' "$*" >> "$INIT_LOG"
case "$*" in
  *"/root/.nvm/"*) exit 126 ;;
  *) exit 0 ;;
esac
`
    );

    const result = await runOptools(["app", "init"], {
      INIT_LOG: logPath,
      OPTOOLS_INSTALL_DIR: installDir,
      OPTOOLS_DATA_DIR: dataDir,
      OPTOOLS_BACKUP_DIR: backupDir,
      OPTOOLS_SYSTEMD_SOURCE_FILE: sourceFile,
      OPTOOLS_SYSTEMD_SERVICE_FILE: systemdFile,
      OPTOOLS_NPM_CANDIDATES: optNpm,
      PATH: `${rootNpmDir}:${fakeBinDir}:${process.env.PATH ?? ""}`
    });

    expect(result.code, result.stderr).toBe(0);
    expect(await readFile(systemdFile, "utf8")).toContain(`ExecStart=${optNpm} run start:api`);
    expect(await readFile(systemdFile, "utf8")).toContain(`Environment=PATH=${optNpmDir}:`);
    expect(await readFile(logPath, "utf8")).toContain(`runuser -u my-working-schedule -- ${rootNpm} --version`);
    expect(await readFile(logPath, "utf8")).toContain(`runuser -u my-working-schedule -- ${optNpm} --version`);
  });

  it("reports app doctor failures when the service user is missing", async () => {
    const stateDir = await createStateDir();
    const fakeBinDir = join(stateDir, "bin");
    const installDir = join(stateDir, "opt", "my-working-schedule");
    const dataDir = join(stateDir, "var", "lib", "my-working-schedule");
    const backupDir = join(stateDir, "var", "backups", "my-working-schedule");
    const systemdFile = join(stateDir, "etc", "systemd", "system", "my-working-schedule.service");

    await mkdir(installDir, { recursive: true });
    await mkdir(dataDir, { recursive: true });
    await mkdir(backupDir, { recursive: true });
    await mkdir(join(stateDir, "etc", "systemd", "system"), { recursive: true });
    await writeFile(systemdFile, "[Service]\n", "utf8");
    await mkdir(fakeBinDir, { recursive: true });
    await createExecutable(
      join(fakeBinDir, "getent"),
      `if [ "$1" = "group" ]; then
  exit 0
fi
exit 2
`
    );
    await createExecutable(join(fakeBinDir, "systemctl"), "exit 0\n");

    const result = await runOptools(["app", "doctor"], {
      OPTOOLS_INSTALL_DIR: installDir,
      OPTOOLS_DATA_DIR: dataDir,
      OPTOOLS_BACKUP_DIR: backupDir,
      OPTOOLS_SYSTEMD_SERVICE_FILE: systemdFile,
      OPTOOLS_APP_USER: "schedule-user",
      OPTOOLS_APP_GROUP: "schedule-group",
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("[ok] app group");
    expect(result.stdout).toContain("[fail] app user");
    expect(result.stdout).toContain("[ok] app install dir");
    expect(result.stdout).toContain("app doctor: failed");
  });

  it("reports app doctor failures when systemd ExecStart is not executable", async () => {
    const stateDir = await createStateDir();
    const fakeBinDir = join(stateDir, "bin");
    const installDir = join(stateDir, "opt", "my-working-schedule");
    const dataDir = join(stateDir, "var", "lib", "my-working-schedule");
    const backupDir = join(stateDir, "var", "backups", "my-working-schedule");
    const systemdFile = join(stateDir, "etc", "systemd", "system", "my-working-schedule.service");

    await mkdir(installDir, { recursive: true });
    await mkdir(dataDir, { recursive: true });
    await mkdir(backupDir, { recursive: true });
    await mkdir(join(stateDir, "etc", "systemd", "system"), { recursive: true });
    await writeFile(systemdFile, "[Service]\nExecStart=/missing/npm run start:api\n", "utf8");
    await mkdir(fakeBinDir, { recursive: true });
    await createExecutable(join(fakeBinDir, "getent"), "exit 0\n");
    await createExecutable(join(fakeBinDir, "systemctl"), "exit 0\n");

    const result = await runOptools(["app", "doctor"], {
      OPTOOLS_INSTALL_DIR: installDir,
      OPTOOLS_DATA_DIR: dataDir,
      OPTOOLS_BACKUP_DIR: backupDir,
      OPTOOLS_SYSTEMD_SERVICE_FILE: systemdFile,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("[fail] systemd exec start");
    expect(result.stdout).toContain("app doctor: failed");
  });

  it("reports app doctor failures when the service user cannot run systemd ExecStart", async () => {
    const stateDir = await createStateDir();
    const fakeBinDir = join(stateDir, "bin");
    const installDir = join(stateDir, "opt", "my-working-schedule");
    const dataDir = join(stateDir, "var", "lib", "my-working-schedule");
    const backupDir = join(stateDir, "var", "backups", "my-working-schedule");
    const systemdFile = join(stateDir, "etc", "systemd", "system", "my-working-schedule.service");
    const rootOnlyNpm = join(stateDir, "root", ".nvm", "versions", "node", "v22", "bin", "npm");

    await mkdir(installDir, { recursive: true });
    await mkdir(dataDir, { recursive: true });
    await mkdir(backupDir, { recursive: true });
    await mkdir(join(stateDir, "etc", "systemd", "system"), { recursive: true });
    await mkdir(join(rootOnlyNpm, ".."), { recursive: true });
    await createExecutable(rootOnlyNpm, "exit 0\n");
    await writeFile(
      systemdFile,
      [
        "[Service]",
        `Environment=PATH=${join(rootOnlyNpm, "..")}:/usr/local/bin:/usr/bin`,
        `ExecStart=${rootOnlyNpm} run start:api`,
        ""
      ].join("\n"),
      "utf8"
    );
    await mkdir(fakeBinDir, { recursive: true });
    await createExecutable(join(fakeBinDir, "getent"), "exit 0\n");
    await createExecutable(join(fakeBinDir, "systemctl"), "exit 0\n");
    await createExecutable(join(fakeBinDir, "runuser"), "exit 126\n");

    const result = await runOptools(["app", "doctor"], {
      OPTOOLS_INSTALL_DIR: installDir,
      OPTOOLS_DATA_DIR: dataDir,
      OPTOOLS_BACKUP_DIR: backupDir,
      OPTOOLS_SYSTEMD_SERVICE_FILE: systemdFile,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("[fail] systemd exec start");
    expect(result.stdout).toContain("app doctor: failed");
  });

  it("returns a failing status when production API health is unavailable", async () => {
    const stateDir = await createStateDir();
    const fakeBinDir = join(stateDir, "bin");
    const logPath = join(stateDir, "health.log");

    await mkdir(fakeBinDir, { recursive: true });
    await createExecutable(
      join(fakeBinDir, "curl"),
      `printf 'curl %s\\n' "$*" >> "$HEALTH_LOG"
exit 7
`
    );

    const result = await runOptools(["app", "health"], {
      HEALTH_LOG: logPath,
      OPTOOLS_API_HEALTH_URL: "http://127.0.0.1:3001/api/health",
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("api health: unavailable");
    expect(await readFile(logPath, "utf8")).toContain("curl -fsS --max-time 2 http://127.0.0.1:3001/api/health");
  });

  it("runs doctor checks and returns non-zero when any check fails", async () => {
    const stateDir = await createStateDir();
    const installDir = join(stateDir, "install");
    const fakeBinDir = join(stateDir, "bin");
    const fakeDataHelper = join(stateDir, "sqlite-service.sh");
    const fakeNginxHelper = join(stateDir, "nginx-service.sh");
    const logPath = join(stateDir, "doctor.log");

    await mkdir(join(installDir, "dist"), { recursive: true });
    await writeFile(join(installDir, "dist", "index.html"), "<html></html>\n", "utf8");
    await mkdir(fakeBinDir, { recursive: true });
    await createExecutable(join(fakeBinDir, "systemctl"), `printf 'systemctl %s\\n' "$*" >> "$DOCTOR_LOG"\n`);
    await createExecutable(
      fakeDataHelper,
      `printf 'data %s\\n' "$*" >> "$DOCTOR_LOG"
if [ "$1" = "check" ]; then
  exit 1
fi
`
    );
    await createExecutable(fakeNginxHelper, `printf 'nginx %s\\n' "$*" >> "$DOCTOR_LOG"\n`);

    const result = await runOptools(["doctor"], {
      DOCTOR_LOG: logPath,
      OPTOOLS_INSTALL_DIR: installDir,
      OPTOOLS_SQLITE_SERVICE_SCRIPT: fakeDataHelper,
      OPTOOLS_NGINX_SERVICE_SCRIPT: fakeNginxHelper,
      OPTOOLS_API_HEALTH_URL: "disabled",
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("[ok] node");
    expect(result.stdout).toContain("[ok] static dist");
    expect(result.stdout).toContain("[fail] data check");
    expect(result.stdout).toContain("doctor: failed");
    expect(await readFile(logPath, "utf8")).toContain("data check");
  });

  it("reports stopped when no dev pid exists", async () => {
    const stateDir = await createStateDir();
    const result = await runOptools(["dev", "status"], {
      OPTOOLS_STATE_DIR: stateDir,
      OPTOOLS_LOG_DIR: stateDir,
      PUBLIC_HOST: "10.10.10.10"
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("dev service: stopped");
    expect(result.stdout).toContain(`pid file: ${join(stateDir, "dev.pid")}`);
    expect(result.stdout).toContain("bind host: 0.0.0.0");
    expect(result.stdout).toContain("web url: http://10.10.10.10:5173");
    expect(result.stdout).toContain("api url: http://10.10.10.10:3001");
  });

  it("reports running when the stored dev pid is alive", async () => {
    const stateDir = await createStateDir();
    await writeFile(join(stateDir, "dev.pid"), `${process.pid}\n`, "utf8");

    const result = await runOptools(["dev", "status"], {
      OPTOOLS_STATE_DIR: stateDir,
      OPTOOLS_LOG_DIR: stateDir
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("dev service: running");
    expect(result.stdout).toContain(`pid: ${process.pid}`);
  });

  it("rejects unknown commands with usage", async () => {
    const result = await runOptools(["dev", "dance"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Unknown command");
    expect(result.stdout).toContain("Usage:");
  });

  it("fails early with install guidance when local development dependencies are missing", async () => {
    const stateDir = await createStateDir();
    const fakeBinDir = join(stateDir, "bin");
    const emptyNodeBinDir = join(stateDir, "empty-node-bin");
    const fakeNpmPath = join(fakeBinDir, "npm");

    await mkdir(fakeBinDir, { recursive: true });
    await mkdir(emptyNodeBinDir, { recursive: true });
    await writeFile(fakeNpmPath, "#!/usr/bin/env bash\nprintf 'npm should not run\\n'\n", "utf8");
    await chmod(fakeNpmPath, 0o755);

    const result = await runOptools(["dev", "start"], {
      OPTOOLS_STATE_DIR: stateDir,
      OPTOOLS_LOG_DIR: stateDir,
      OPTOOLS_NODE_MODULES_BIN_DIR: emptyNodeBinDir,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("missing local development dependencies");
    expect(result.stderr).toContain("concurrently");
    expect(result.stderr).toContain("npm ci --include=dev");
    expect(result.stdout).not.toContain("dev service: started");
    const log = await readFile(join(stateDir, "dev.log"), "utf8").catch(() => "");
    expect(log).not.toContain("starting npm run dev");
  });

  it("fails early with install guidance when required npm packages are missing", async () => {
    const stateDir = await createStateDir();
    const fakeBinDir = join(stateDir, "bin");
    const fakeNodeBinDir = join(stateDir, "node-bin");
    const fakeNpmPath = join(fakeBinDir, "npm");
    const fakeNodePath = join(fakeBinDir, "node");

    await mkdir(fakeBinDir, { recursive: true });
    await mkdir(fakeNodeBinDir, { recursive: true });
    await writeFile(fakeNpmPath, "#!/usr/bin/env bash\nprintf 'npm should not run\\n'\n", "utf8");
    await writeFile(fakeNodePath, "#!/usr/bin/env bash\nexit 1\n", "utf8");
    await chmod(fakeNpmPath, 0o755);
    await chmod(fakeNodePath, 0o755);

    for (const binary of ["concurrently", "vite", "tsx"]) {
      const binaryPath = join(fakeNodeBinDir, binary);
      await writeFile(binaryPath, "#!/usr/bin/env bash\nexit 0\n", "utf8");
      await chmod(binaryPath, 0o755);
    }

    const result = await runOptools(["dev", "start"], {
      OPTOOLS_STATE_DIR: stateDir,
      OPTOOLS_LOG_DIR: stateDir,
      OPTOOLS_NODE_MODULES_BIN_DIR: fakeNodeBinDir,
      OPTOOLS_REQUIRED_NODE_PACKAGES: "html2canvas jspdf",
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("missing local npm packages");
    expect(result.stderr).toContain("html2canvas");
    expect(result.stderr).toContain("jspdf");
    expect(result.stderr).toContain("npm install --include=dev");
    expect(result.stdout).not.toContain("dev service: started");
    const log = await readFile(join(stateDir, "dev.log"), "utf8").catch(() => "");
    expect(log).not.toContain("starting npm run dev");
  });

  it("keeps daemonized dev command alive after start returns and stops it", async () => {
    const stateDir = await createStateDir();
    const fakeBinDir = join(stateDir, "bin");
    const fakeNpmPath = join(fakeBinDir, "npm");
    const env = {
      OPTOOLS_STATE_DIR: stateDir,
      OPTOOLS_LOG_DIR: stateDir,
      PUBLIC_HOST: "10.10.10.10",
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    };

    await mkdir(fakeBinDir, { recursive: true });
    await writeFile(
      fakeNpmPath,
      '#!/usr/bin/env bash\nprintf "fake npm %s\\n" "$*"\nprintf "HOST=%s WEB_HOST=%s WEB_PORT=%s PORT=%s VITE_API_PROXY_TARGET=%s\\n" "$HOST" "$WEB_HOST" "$WEB_PORT" "$PORT" "$VITE_API_PROXY_TARGET"\nsleep 30\n',
      "utf8"
    );
    await chmod(fakeNpmPath, 0o755);

    try {
      const start = await runOptools(["dev", "start"], env);
      expect(start.code).toBe(0);
      expect(start.stdout).toContain("dev service: started");
      expect(start.stdout).toContain("web: http://10.10.10.10:5173");
      expect(start.stdout).toContain("api: http://10.10.10.10:3001");

      const status = await runOptools(["dev", "status"], env);
      expect(status.code).toBe(0);
      expect(status.stdout).toContain("dev service: running");

      const log = await readUntilContains(
        join(stateDir, "dev.log"),
        "HOST=0.0.0.0 WEB_HOST=0.0.0.0 WEB_PORT=5173 PORT=3001 VITE_API_PROXY_TARGET=http://127.0.0.1:3001"
      );
      expect(log).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] starting npm run dev/);
      expect(log).toContain(
        "HOST=0.0.0.0 WEB_HOST=0.0.0.0 WEB_PORT=5173 PORT=3001 VITE_API_PROXY_TARGET=http://127.0.0.1:3001"
      );
    } finally {
      const stop = await runOptools(["dev", "stop"], env);
      expect(stop.code).toBe(0);
      expect(stop.stdout).toContain("dev service:");
    }

    const statusAfterStop = await runOptools(["dev", "status"], env);
    expect(statusAfterStop.stdout).toContain("dev service: stopped");
  });
});
