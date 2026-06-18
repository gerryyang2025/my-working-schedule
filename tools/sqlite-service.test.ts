import { execFile, type ExecFileException } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initSqliteDatabase } from "../server/sqlite/maintenance";

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

const tempDirs: string[] = [];
const bashPath = "/bin/bash";
const scriptPath = resolve(process.cwd(), "tools/sqlite-service.sh");
const restoreGuidance = "Restore is a high-risk operation. Set CONFIRM_RESTORE=yes to continue.";
const invalidRestoreFilenameMessage = "restore backup filename must be a simple filename under backup path";

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

async function createFakeExecutable(path: string, body: string) {
  await writeFile(path, `#!/bin/sh\n${body}`);
  await chmod(path, 0o755);
}

async function createFakeNpmBin(dir: string) {
  const fakeBin = join(dir, "bin");
  await mkdir(fakeBin);
  await createFakeExecutable(
    join(fakeBin, "npm"),
    `{
  printf 'cwd=%s\\n' "$PWD"
  printf 'SCHEDULE_DATA_PATH=%s\\n' "$SCHEDULE_DATA_PATH"
  printf 'SCHEDULE_SQLITE_PATH=%s\\n' "$SCHEDULE_SQLITE_PATH"
  printf 'SCHEDULE_BACKUP_PATH=%s\\n' "$SCHEDULE_BACKUP_PATH"
  printf 'argc=%s\\n' "$#"
  index=1
  for arg in "$@"; do
    printf 'arg%s=%s\\n' "$index" "$arg"
    index=$((index + 1))
  done
} > "$NPM_LOG"
exit 0
`
  );
  return fakeBin;
}

async function readLog(path: string) {
  return readFile(path, "utf8");
}

async function createValidSqliteBackup(path: string) {
  await mkdir(dirname(path), { recursive: true });
  await initSqliteDatabase({ sqlitePath: path });
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

  it("does not create configured dirs during install preflight", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    const sqliteDir = join(dir, "sqlite");
    const backupDir = join(dir, "backups");
    await mkdir(fakeBin);
    await createFakeExecutable(join(fakeBin, "sqlite3"), "exit 0\n");

    const result = await runTool(["install"], {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      SCHEDULE_SQLITE_PATH: join(sqliteDir, "schedule.db"),
      SCHEDULE_BACKUP_PATH: backupDir
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`sqlite path: ${join(sqliteDir, "schedule.db")}`);
    expect(existsSync(sqliteDir)).toBe(false);
    expect(existsSync(backupDir)).toBe(false);
  });

  it("delegates maintenance commands to npm with configured env", async () => {
    const cases = [
      {
        name: "init",
        args: ["init"],
        expectedNpmArgs: ["run", "data:init:sqlite"],
        preserveSystemPath: true
      },
      {
        name: "migrate",
        args: ["migrate"],
        expectedNpmArgs: ["run", "data:migrate:sqlite"],
        preserveSystemPath: true
      },
      {
        name: "backup",
        args: ["backup"],
        expectedNpmArgs: ["run", "data:backup"],
        preserveSystemPath: true
      },
      {
        name: "check",
        args: ["check"],
        expectedNpmArgs: ["run", "data:check:sqlite"],
        preserveSystemPath: false
      },
      {
        name: "restore",
        args: ["restore", "backup file with spaces.db"],
        expectedNpmArgs: (backupPath: string) => [
          "run",
          "data:restore",
          "--",
          join(backupPath, "backup file with spaces.db")
        ],
        preserveSystemPath: true,
        confirmRestore: true
      }
    ];

    for (const testCase of cases) {
      const dir = await createTempDir();
      const fakeBin = await createFakeNpmBin(dir);
      const logPath = join(dir, `${testCase.name}.log`);
      const dataPath = join(dir, "data", "app-data.local.json");
      const sqlitePath = join(dir, "sqlite", "schedule.db");
      const backupPath = join(dir, "backups");

      const result = await runTool(testCase.args, {
        PATH: testCase.preserveSystemPath ? `${fakeBin}:${process.env.PATH ?? ""}` : fakeBin,
        NPM_LOG: logPath,
        SCHEDULE_DATA_PATH: dataPath,
        SCHEDULE_SQLITE_PATH: sqlitePath,
        SCHEDULE_BACKUP_PATH: backupPath,
        CONFIRM_RESTORE: testCase.confirmRestore ? "yes" : ""
      });

      expect(result.code, `${testCase.name} stderr: ${result.stderr}`).toBe(0);
      const log = await readLog(logPath);
      const expectedNpmArgs =
        typeof testCase.expectedNpmArgs === "function" ? testCase.expectedNpmArgs(backupPath) : testCase.expectedNpmArgs;

      expect(log.trimEnd().split("\n")).toEqual([
        `cwd=${process.cwd()}`,
        `SCHEDULE_DATA_PATH=${dataPath}`,
        `SCHEDULE_SQLITE_PATH=${sqlitePath}`,
        `SCHEDULE_BACKUP_PATH=${backupPath}`,
        `argc=${expectedNpmArgs.length}`,
        ...expectedNpmArgs.map((arg, index) => `arg${index + 1}=${arg}`)
      ]);
    }
  });

  it("passes absolute restore backup paths through unchanged", async () => {
    const dir = await createTempDir();
    const fakeBin = await createFakeNpmBin(dir);
    const logPath = join(dir, "restore-absolute.log");
    const dataPath = join(dir, "data", "app-data.local.json");
    const sqlitePath = join(dir, "sqlite", "schedule.db");
    const backupPath = join(dir, "backups");
    const backupFile = join(dir, "absolute backup file.db");

    const result = await runTool(["restore", backupFile], {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      NPM_LOG: logPath,
      SCHEDULE_DATA_PATH: dataPath,
      SCHEDULE_SQLITE_PATH: sqlitePath,
      SCHEDULE_BACKUP_PATH: backupPath,
      CONFIRM_RESTORE: "yes"
    });

    expect(result.code, `restore stderr: ${result.stderr}`).toBe(0);
    expect((await readLog(logPath)).trimEnd().split("\n")).toEqual([
      `cwd=${process.cwd()}`,
      `SCHEDULE_DATA_PATH=${dataPath}`,
      `SCHEDULE_SQLITE_PATH=${sqlitePath}`,
      `SCHEDULE_BACKUP_PATH=${backupPath}`,
      "argc=4",
      "arg1=run",
      "arg2=data:restore",
      "arg3=--",
      `arg4=${backupFile}`
    ]);
  });

  it("rejects unsafe relative restore paths before invoking npm", async () => {
    for (const backupFile of ["../escape.db", "nested/backup.db"]) {
      const dir = await createTempDir();
      const fakeBin = join(dir, "bin");
      const sqliteDir = join(dir, "sqlite");
      const backupDir = join(dir, "backups");
      await mkdir(fakeBin);
      await createFakeExecutable(join(fakeBin, "npm"), "echo npm should not be invoked >&2\nexit 64\n");

      const result = await runTool(["restore", backupFile], {
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        SCHEDULE_SQLITE_PATH: join(sqliteDir, "schedule.db"),
        SCHEDULE_BACKUP_PATH: backupDir,
        CONFIRM_RESTORE: "yes"
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(invalidRestoreFilenameMessage);
      expect(result.stderr).not.toContain("npm should not be invoked");
      expect(existsSync(sqliteDir)).toBe(false);
      expect(existsSync(backupDir)).toBe(false);
    }
  });

  it("does not invoke npm or create dirs for restore without confirmation", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    const sqliteDir = join(dir, "sqlite");
    const backupDir = join(dir, "backups");
    await mkdir(fakeBin);
    await createFakeExecutable(join(fakeBin, "npm"), "echo npm should not be invoked >&2\nexit 64\n");

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

  it("rejects unsafe relative paths for direct data restore", async () => {
    for (const backupFile of ["nested/backup.db", "../escape.db"]) {
      const dir = await createTempDir();
      const sqliteDir = join(dir, "sqlite");
      const backupDir = join(dir, "backups");

      const result = await runDataCli(["restore", backupFile], {
        SCHEDULE_SQLITE_PATH: join(sqliteDir, "schedule.db"),
        SCHEDULE_BACKUP_PATH: backupDir,
        CONFIRM_RESTORE: "yes"
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(invalidRestoreFilenameMessage);
      expect(existsSync(sqliteDir)).toBe(false);
      expect(existsSync(backupDir)).toBe(false);
    }
  });

  it("resolves bare filenames under the backup path for direct data restore", async () => {
    const dir = await createTempDir();
    const sqlitePath = join(dir, "sqlite", "schedule.db");
    const backupPath = join(dir, "backups");
    const backupFilename = "backup file.db";
    await createValidSqliteBackup(join(backupPath, backupFilename));

    const result = await runDataCli(["restore", backupFilename], {
      SCHEDULE_SQLITE_PATH: sqlitePath,
      SCHEDULE_BACKUP_PATH: backupPath,
      CONFIRM_RESTORE: "yes"
    });

    expect(result.code, `restore stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout).toContain(sqlitePath);
    expect(existsSync(sqlitePath)).toBe(true);
  });

  it("passes absolute backup paths through for direct data restore", async () => {
    const dir = await createTempDir();
    const sqlitePath = join(dir, "sqlite", "schedule.db");
    const backupPath = join(dir, "backups");
    const backupFile = join(dir, "absolute backup.db");
    await createValidSqliteBackup(backupFile);

    const result = await runDataCli(["restore", backupFile], {
      SCHEDULE_SQLITE_PATH: sqlitePath,
      SCHEDULE_BACKUP_PATH: backupPath,
      CONFIRM_RESTORE: "yes"
    });

    expect(result.code, `restore stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout).toContain(sqlitePath);
    expect(existsSync(sqlitePath)).toBe(true);
  });
});
