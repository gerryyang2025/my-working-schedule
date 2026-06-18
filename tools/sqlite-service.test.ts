import { execFile, type ExecFileException } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
const scriptPath = resolve(process.cwd(), "tools/sqlite-service.sh");
const restoreGuidance = "Restore is a high-risk operation. Set CONFIRM_RESTORE=yes to continue.";

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "sqlite-service-test-"));
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

function runDataCli(args: string[], env: Record<string, string> = {}): Promise<CommandResult> {
  return new Promise((resolveResult) => {
    execFile(
      process.execPath,
      ["--import", "tsx", "server/data-cli.ts", ...args],
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

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("tools/sqlite-service.sh", () => {
  it("prints usage", async () => {
    const result = await runTool(["help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("./tools/sqlite-service.sh install");
    expect(result.stdout).toContain("./tools/sqlite-service.sh restore <backup-file>");
  });

  it("reports status using configured paths", async () => {
    const dir = await createTempDir();
    const result = await runTool(["status"], {
      SCHEDULE_SQLITE_PATH: join(dir, "schedule.db"),
      SCHEDULE_BACKUP_PATH: join(dir, "backups")
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`sqlite path: ${join(dir, "schedule.db")}`);
    expect(result.stdout).toContain(`backup path: ${join(dir, "backups")}`);
  });

  it("prints install guidance when sqlite3 is missing", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    await mkdir(fakeBin);

    const result = await runTool(["install"], {
      PATH: fakeBin,
      SCHEDULE_SQLITE_PATH: join(dir, "schedule.db"),
      SCHEDULE_BACKUP_PATH: join(dir, "backups")
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("sqlite3 command is missing");
    expect(result.stderr).toContain("sudo apt install -y sqlite3");
  });

  it("does not invoke npm or create dirs for restore without confirmation", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    const sqliteDir = join(dir, "sqlite");
    const backupDir = join(dir, "backups");
    await mkdir(fakeBin);
    await writeFile(join(fakeBin, "npm"), "#!/usr/bin/env sh\necho npm should not be invoked >&2\nexit 64\n");
    await chmod(join(fakeBin, "npm"), 0o755);

    const result = await runTool(["restore", join(dir, "backup.db")], {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      SCHEDULE_SQLITE_PATH: join(sqliteDir, "schedule.db"),
      SCHEDULE_BACKUP_PATH: backupDir,
      CONFIRM_RESTORE: ""
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(restoreGuidance);
    expect(result.stderr).not.toContain("npm should not be invoked");
    expect(existsSync(sqliteDir)).toBe(false);
    expect(existsSync(backupDir)).toBe(false);
  });

  it("requires confirmation for direct data restore", async () => {
    const dir = await createTempDir();
    const result = await runDataCli(["restore", join(dir, "backup.db")], {
      SCHEDULE_SQLITE_PATH: join(dir, "sqlite", "schedule.db"),
      SCHEDULE_BACKUP_PATH: join(dir, "backups"),
      CONFIRM_RESTORE: ""
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(restoreGuidance);
  });
});
