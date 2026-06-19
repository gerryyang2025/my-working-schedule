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
const scriptPath = resolve(process.cwd(), "tools/logrotate-service.sh");

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "logrotate-service-test-"));
  tempDirs.push(dir);
  return dir;
}

function runTool(args: string[], env: Record<string, string> = {}): Promise<CommandResult> {
  return new Promise((resolveResult) => {
    execFile(
      "/bin/bash",
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
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `#!/bin/sh\n${body}`, "utf8");
  await chmod(path, 0o755);
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("tools/logrotate-service.sh", () => {
  it("prints usage", async () => {
    const result = await runTool(["help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("./tools/logrotate-service.sh install");
    expect(result.stdout).toContain("./tools/logrotate-service.sh status");
    expect(result.stdout).toContain("./tools/logrotate-service.sh test");
  });

  it("installs the logrotate config", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    const confDir = join(dir, "etc", "logrotate.d");
    const confFile = join(confDir, "my-working-schedule");
    await createFakeExecutable(join(fakeBin, "logrotate"), "exit 0\n");

    const result = await runTool(["install"], {
      LOGROTATE_CONF_DIR: confDir,
      LOGROTATE_CONF_FILE: confFile,
      PATH: `${fakeBin}:/usr/bin:/bin`
    });

    expect(result.code, result.stderr).toBe(0);
    expect(await readFile(confFile, "utf8")).toContain("/var/log/my-working-schedule-backup.log");
    expect(result.stdout).toContain(`logrotate conf file: ${confFile}`);
    expect(result.stdout).toContain("logrotate install completed");
  });

  it("dry-runs the installed logrotate config", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    const confDir = join(dir, "etc", "logrotate.d");
    const confFile = join(confDir, "my-working-schedule");
    const logPath = join(dir, "commands.log");
    await mkdir(confDir, { recursive: true });
    await createFakeExecutable(join(fakeBin, "logrotate"), `printf 'logrotate %s\\n' "$*" >> "$COMMAND_LOG"\nexit 0\n`);

    await runTool(["install"], {
      LOGROTATE_CONF_DIR: confDir,
      LOGROTATE_CONF_FILE: confFile
    });

    const result = await runTool(["test"], {
      PATH: `${fakeBin}:/usr/bin:/bin`,
      COMMAND_LOG: logPath,
      LOGROTATE_CONF_DIR: confDir,
      LOGROTATE_CONF_FILE: confFile
    });

    expect(result.code, result.stderr).toBe(0);
    expect(await readFile(logPath, "utf8")).toBe(`logrotate -d ${confFile}\n`);
  });

  it("reports missing logrotate command clearly", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    await mkdir(fakeBin, { recursive: true });

    const result = await runTool(["test"], {
      PATH: fakeBin,
      LOGROTATE_CONF_DIR: join(dir, "etc", "logrotate.d"),
      LOGROTATE_CONF_FILE: join(dir, "etc", "logrotate.d", "my-working-schedule")
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("logrotate command is missing");
  });

  it("reports missing installed config from status", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    const confFile = join(dir, "missing");
    await createFakeExecutable(join(fakeBin, "logrotate"), "exit 0\n");

    const result = await runTool(["status"], {
      LOGROTATE_CONF_DIR: dir,
      LOGROTATE_CONF_FILE: confFile,
      PATH: `${fakeBin}:/usr/bin:/bin`
    });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("logrotate app config exists: no");
    expect(existsSync(confFile)).toBe(false);
  });
});
