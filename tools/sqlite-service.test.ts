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
const tempFiles: string[] = [];
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

async function createNodeProxyExecutable(path: string) {
  await createFakeExecutable(path, `exec "${process.execPath}" "$@"\n`);
}

async function createFakeNpmBin(dir: string) {
  const fakeBin = join(dir, "bin");
  await mkdir(fakeBin);
  await createNodeProxyExecutable(join(fakeBin, "node"));
  await createFakeExecutable(
    join(fakeBin, "npm"),
    `{
  printf 'cwd=%s\\n' "$PWD"
  printf 'SCHEDULE_SQLITE_PATH=%s\\n' "$SCHEDULE_SQLITE_PATH"
  printf 'SCHEDULE_BACKUP_PATH=%s\\n' "$SCHEDULE_BACKUP_PATH"
  printf 'argc=%s\\n' "$#"
  index=1
  for arg in "$@"; do
    printf 'arg%s=%s\\n' "$index" "$arg"
    index=$((index + 1))
  done
} >> "$NPM_LOG"
if [ "$#" -ge 2 ] && [ "$1" = "run" ] && [ "$2" = "data:preflight" ]; then
  printf '{\\n  "ok": true,\\n  "command": "preflight"\\n}\\n'
fi
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
  await Promise.all(tempFiles.splice(0).map((file) => rm(file, { force: true })));
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

  it("reports modified time when the sqlite file exists", async () => {
    const dir = await createTempDir();
    const sqlitePath = join(dir, "schedule.db");
    await createValidSqliteBackup(sqlitePath);

    const result = await runTool(["status"], {
      SCHEDULE_SQLITE_PATH: sqlitePath,
      SCHEDULE_BACKUP_PATH: join(dir, "backups")
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("sqlite exists: yes");
    expect(result.stdout).toContain("sqlite size:");
    expect(result.stdout).toMatch(/^sqlite modified time: .+$/m);
  });

  it("fails status when the sqlite path already exists as a directory", async () => {
    const dir = await createTempDir();
    const sqlitePath = join(dir, "schedule.db");
    await mkdir(sqlitePath);

    const result = await runTool(["status"], {
      SCHEDULE_SQLITE_PATH: sqlitePath,
      SCHEDULE_BACKUP_PATH: join(dir, "backups")
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`sqlite path is not ready: ${sqlitePath}`);
    expect(result.stderr).toContain("path exists but is not a regular file");
  });

  it("warns but does not fail install when sqlite3 is missing", async () => {
    const dir = await createTempDir();
    const fakeBin = await createFakeNpmBin(dir);
    await createNodeProxyExecutable(join(fakeBin, "node"));

    const result = await runTool(["install"], {
      PATH: fakeBin,
      NPM_LOG: join(dir, "install.log"),
      SCHEDULE_SQLITE_PATH: join(dir, "schedule.db"),
      SCHEDULE_BACKUP_PATH: join(dir, "backups")
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toContain("sqlite3 command is missing");
    expect(result.stderr).toContain("sudo apt install -y sqlite3");
  });

  it("prints install guidance when node is missing", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    await mkdir(fakeBin);
    await createFakeExecutable(join(fakeBin, "sqlite3"), "exit 0\n");

    const result = await runTool(["install"], {
      PATH: fakeBin,
      SCHEDULE_SQLITE_PATH: join(dir, "schedule.db"),
      SCHEDULE_BACKUP_PATH: join(dir, "backups")
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("node command is missing");
  });

  it("prints install guidance when npm is missing", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    await mkdir(fakeBin);
    await createFakeExecutable(join(fakeBin, "sqlite3"), "exit 0\n");
    await createNodeProxyExecutable(join(fakeBin, "node"));

    const result = await runTool(["install"], {
      PATH: fakeBin,
      SCHEDULE_SQLITE_PATH: join(dir, "schedule.db"),
      SCHEDULE_BACKUP_PATH: join(dir, "backups")
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("npm command is missing");
  });

  it("does not create configured dirs during install preflight", async () => {
    const dir = await createTempDir();
    const fakeBin = await createFakeNpmBin(dir);
    const sqliteDir = join(dir, "sqlite");
    const backupDir = join(dir, "backups");
    const logPath = join(dir, "install.log");
    await createFakeExecutable(join(fakeBin, "sqlite3"), "exit 0\n");
    await createNodeProxyExecutable(join(fakeBin, "node"));

    const result = await runTool(["install"], {
      PATH: fakeBin,
      NPM_LOG: logPath,
      SCHEDULE_SQLITE_PATH: join(sqliteDir, "schedule.db"),
      SCHEDULE_BACKUP_PATH: backupDir
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`sqlite path: ${join(sqliteDir, "schedule.db")}`);
    expect((await readLog(logPath)).trimEnd().split("\n")).toEqual([
      `cwd=${process.cwd()}`,
      `SCHEDULE_SQLITE_PATH=${join(sqliteDir, "schedule.db")}`,
      `SCHEDULE_BACKUP_PATH=${backupDir}`,
      "argc=2",
      "arg1=run",
      "arg2=data:preflight"
    ]);
    expect(existsSync(sqliteDir)).toBe(false);
    expect(existsSync(backupDir)).toBe(false);
  });

  it("passes root-level sqlite and backup parents through init without empty mkdir args", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    const logPath = join(dir, "mkdir.log");
    await mkdir(fakeBin);
    await createFakeExecutable(
      join(fakeBin, "mkdir"),
      `{
  printf 'argc=%s\\n' "$#"
  index=1
  for arg in "$@"; do
    printf 'arg%s=%s\\n' "$index" "$arg"
    index=$((index + 1))
  done
} > "$MKDIR_LOG"
exit 0
`
    );
    await createFakeExecutable(
      join(fakeBin, "npm"),
      `{
  printf 'npm=%s\\n' "$0"
} > "$NPM_LOG"
exit 0
`
    );

    const result = await runTool(["init"], {
      PATH: fakeBin,
      MKDIR_LOG: logPath,
      NPM_LOG: join(dir, "npm.log"),
      SCHEDULE_SQLITE_PATH: "/schedule.db",
      SCHEDULE_BACKUP_PATH: "/backups"
    });

    expect(result.code).toBe(0);
    expect((await readLog(logPath)).trimEnd().split("\n")).toEqual([
      "argc=3",
      "arg1=-p",
      "arg2=/",
      "arg3=/backups"
    ]);
  });

  it("passes install when sqlite and backup targets are creatable but still absent", async () => {
    const dir = await createTempDir();
    const fakeBin = await createFakeNpmBin(dir);
    const parentDir = join(dir, "existing-parent");
    const sqliteDir = join(parentDir, "sqlite");
    const backupDir = join(parentDir, "backups");
    const sqlitePath = join(sqliteDir, "schedule.db");
    const logPath = join(dir, "install-creatable.log");
    await mkdir(parentDir);
    await createFakeExecutable(join(fakeBin, "sqlite3"), "exit 0\n");
    await createNodeProxyExecutable(join(fakeBin, "node"));

    const result = await runTool(["install"], {
      PATH: fakeBin,
      NPM_LOG: logPath,
      SCHEDULE_SQLITE_PATH: sqlitePath,
      SCHEDULE_BACKUP_PATH: backupDir
    });

    expect(result.code).toBe(0);
    expect((await readLog(logPath)).trimEnd().split("\n")).toEqual([
      `cwd=${process.cwd()}`,
      `SCHEDULE_SQLITE_PATH=${sqlitePath}`,
      `SCHEDULE_BACKUP_PATH=${backupDir}`,
      "argc=2",
      "arg1=run",
      "arg2=data:preflight"
    ]);
    expect(existsSync(sqliteDir)).toBe(false);
    expect(existsSync(backupDir)).toBe(false);
  });

  it("fails install when the nearest sqlite parent is not a directory", async () => {
    const dir = await createTempDir();
    const fakeBin = await createFakeNpmBin(dir);
    const blockedParent = join(dir, "sqlite-parent-blocker");
    const sqlitePath = join(blockedParent, "nested", "schedule.db");
    const logPath = join(dir, "install-sqlite-parent.log");
    await writeFile(blockedParent, "not a directory");
    await createFakeExecutable(join(fakeBin, "sqlite3"), "exit 0\n");
    await createNodeProxyExecutable(join(fakeBin, "node"));

    const result = await runTool(["install"], {
      PATH: fakeBin,
      NPM_LOG: logPath,
      SCHEDULE_SQLITE_PATH: sqlitePath,
      SCHEDULE_BACKUP_PATH: join(dir, "backups")
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`sqlite path is not ready: ${sqlitePath}`);
    expect(result.stderr).toContain(`nearest existing parent is not a directory: ${blockedParent}`);
    expect((await readLog(logPath)).trimEnd().split("\n")).toEqual([
      `cwd=${process.cwd()}`,
      `SCHEDULE_SQLITE_PATH=${sqlitePath}`,
      `SCHEDULE_BACKUP_PATH=${join(dir, "backups")}`,
      "argc=2",
      "arg1=run",
      "arg2=data:preflight"
    ]);
  });

  it("fails install when the sqlite path already exists as a directory", async () => {
    const dir = await createTempDir();
    const fakeBin = await createFakeNpmBin(dir);
    const sqlitePath = join(dir, "schedule.db");
    const logPath = join(dir, "install-sqlite-dir.log");
    await mkdir(sqlitePath);
    await createFakeExecutable(join(fakeBin, "sqlite3"), "exit 0\n");
    await createNodeProxyExecutable(join(fakeBin, "node"));

    const result = await runTool(["install"], {
      PATH: fakeBin,
      NPM_LOG: logPath,
      SCHEDULE_SQLITE_PATH: sqlitePath,
      SCHEDULE_BACKUP_PATH: join(dir, "backups")
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`sqlite path is not ready: ${sqlitePath}`);
    expect(result.stderr).toContain("path exists but is a directory");
    expect((await readLog(logPath)).trimEnd().split("\n")).toEqual([
      `cwd=${process.cwd()}`,
      `SCHEDULE_SQLITE_PATH=${sqlitePath}`,
      `SCHEDULE_BACKUP_PATH=${join(dir, "backups")}`,
      "argc=2",
      "arg1=run",
      "arg2=data:preflight"
    ]);
  });

  it("fails install when an existing sqlite file has a non-writable parent directory", async () => {
    const dir = await createTempDir();
    const fakeBin = await createFakeNpmBin(dir);
    const sqliteParent = join(dir, "sqlite-parent");
    const sqlitePath = join(sqliteParent, "schedule.db");
    const logPath = join(dir, "install-sqlite-parent-perms.log");
    await mkdir(sqliteParent);
    await writeFile(sqlitePath, "sqlite");
    await chmod(sqliteParent, 0o500);
    await createFakeExecutable(join(fakeBin, "sqlite3"), "exit 0\n");
    await createNodeProxyExecutable(join(fakeBin, "node"));

    const result = await runTool(["install"], {
      PATH: fakeBin,
      NPM_LOG: logPath,
      SCHEDULE_SQLITE_PATH: sqlitePath,
      SCHEDULE_BACKUP_PATH: join(dir, "backups")
    });

    await chmod(sqliteParent, 0o700);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`sqlite path is not ready: ${sqlitePath}`);
    expect(result.stderr).toContain(`sqlite path parent is not writable/traversable: ${sqliteParent}`);
    expect((await readLog(logPath)).trimEnd().split("\n")).toEqual([
      `cwd=${process.cwd()}`,
      `SCHEDULE_SQLITE_PATH=${sqlitePath}`,
      `SCHEDULE_BACKUP_PATH=${join(dir, "backups")}`,
      "argc=2",
      "arg1=run",
      "arg2=data:preflight"
    ]);
  });

  it("fails install when an existing sqlite file is write-only and unreadable", async () => {
    const dir = await createTempDir();
    const fakeBin = await createFakeNpmBin(dir);
    const sqliteParent = join(dir, "sqlite-parent");
    const sqlitePath = join(sqliteParent, "schedule.db");
    const logPath = join(dir, "install-sqlite-unreadable.log");
    await mkdir(sqliteParent);
    await writeFile(sqlitePath, "sqlite");
    await chmod(sqlitePath, 0o200);
    await createFakeExecutable(join(fakeBin, "sqlite3"), "exit 0\n");
    await createNodeProxyExecutable(join(fakeBin, "node"));

    const result = await runTool(["install"], {
      PATH: fakeBin,
      NPM_LOG: logPath,
      SCHEDULE_SQLITE_PATH: sqlitePath,
      SCHEDULE_BACKUP_PATH: join(dir, "backups")
    });

    await chmod(sqlitePath, 0o600);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`sqlite path is not ready: ${sqlitePath}`);
    expect(result.stderr).toContain("path exists but is not readable/writable");
    expect((await readLog(logPath)).trimEnd().split("\n")).toEqual([
      `cwd=${process.cwd()}`,
      `SCHEDULE_SQLITE_PATH=${sqlitePath}`,
      `SCHEDULE_BACKUP_PATH=${join(dir, "backups")}`,
      "argc=2",
      "arg1=run",
      "arg2=data:preflight"
    ]);
  });

  it("fails status explicitly when the sqlite file is unreadable", async () => {
    const dir = await createTempDir();
    const sqliteParent = join(dir, "sqlite-parent");
    const sqlitePath = join(sqliteParent, "schedule.db");
    await mkdir(sqliteParent);
    await writeFile(sqlitePath, "sqlite");
    await chmod(sqlitePath, 0o200);

    const result = await runTool(["status"], {
      SCHEDULE_SQLITE_PATH: sqlitePath,
      SCHEDULE_BACKUP_PATH: join(dir, "backups")
    });

    await chmod(sqlitePath, 0o600);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`sqlite file is not readable: ${sqlitePath}`);
  });

  it("fails install when the nearest backup parent is not a directory", async () => {
    const dir = await createTempDir();
    const fakeBin = await createFakeNpmBin(dir);
    const blockedParent = join(dir, "backup-parent-blocker");
    const backupPath = join(blockedParent, "nested-backups");
    const logPath = join(dir, "install-backup-parent.log");
    await writeFile(blockedParent, "not a directory");
    await createFakeExecutable(join(fakeBin, "sqlite3"), "exit 0\n");
    await createNodeProxyExecutable(join(fakeBin, "node"));

    const result = await runTool(["install"], {
      PATH: fakeBin,
      NPM_LOG: logPath,
      SCHEDULE_SQLITE_PATH: join(dir, "sqlite", "schedule.db"),
      SCHEDULE_BACKUP_PATH: backupPath
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`backup path is not ready: ${backupPath}`);
    expect(result.stderr).toContain(`nearest existing parent is not a directory: ${blockedParent}`);
    expect((await readLog(logPath)).trimEnd().split("\n")).toEqual([
      `cwd=${process.cwd()}`,
      `SCHEDULE_SQLITE_PATH=${join(dir, "sqlite", "schedule.db")}`,
      `SCHEDULE_BACKUP_PATH=${backupPath}`,
      "argc=2",
      "arg1=run",
      "arg2=data:preflight"
    ]);
  });

  it("fails install when the backup path already exists as a file", async () => {
    const dir = await createTempDir();
    const fakeBin = await createFakeNpmBin(dir);
    const backupPath = join(dir, "backups");
    const logPath = join(dir, "install-backup-file.log");
    await writeFile(backupPath, "not a directory");
    await createFakeExecutable(join(fakeBin, "sqlite3"), "exit 0\n");
    await createNodeProxyExecutable(join(fakeBin, "node"));

    const result = await runTool(["install"], {
      PATH: fakeBin,
      NPM_LOG: logPath,
      SCHEDULE_SQLITE_PATH: join(dir, "sqlite", "schedule.db"),
      SCHEDULE_BACKUP_PATH: backupPath
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`backup path is not ready: ${backupPath}`);
    expect(result.stderr).toContain("path exists but is not a directory");
    expect((await readLog(logPath)).trimEnd().split("\n")).toEqual([
      `cwd=${process.cwd()}`,
      `SCHEDULE_SQLITE_PATH=${join(dir, "sqlite", "schedule.db")}`,
      `SCHEDULE_BACKUP_PATH=${backupPath}`,
      "argc=2",
      "arg1=run",
      "arg2=data:preflight"
    ]);
  });

  it("fails install when the delegated maintenance runtime preflight fails", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    await mkdir(fakeBin);
    await createFakeExecutable(join(fakeBin, "sqlite3"), "exit 0\n");
    await createNodeProxyExecutable(join(fakeBin, "node"));
    await createFakeExecutable(join(fakeBin, "npm"), "echo maintenance runtime preflight failed >&2\nexit 23\n");

    const result = await runTool(["install"], {
      PATH: fakeBin,
      SCHEDULE_SQLITE_PATH: join(dir, "schedule.db"),
      SCHEDULE_BACKUP_PATH: join(dir, "backups")
    });

    expect(result.code).toBe(23);
    expect(result.stderr).toContain("maintenance runtime preflight failed");
  });

  it("fails install when the delegated maintenance runtime preflight exits 0 but prints no JSON", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    const logPath = join(dir, "install-empty-preflight.log");
    await mkdir(fakeBin);
    await createFakeExecutable(join(fakeBin, "sqlite3"), "exit 0\n");
    await createNodeProxyExecutable(join(fakeBin, "node"));
    await createFakeExecutable(
      join(fakeBin, "npm"),
      `{
  printf 'cwd=%s\\n' "$PWD"
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

    const result = await runTool(["install"], {
      PATH: fakeBin,
      NPM_LOG: logPath,
      SCHEDULE_SQLITE_PATH: join(dir, "schedule.db"),
      SCHEDULE_BACKUP_PATH: join(dir, "backups")
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("maintenance runtime preflight output was empty");
    expect((await readLog(logPath)).trimEnd().split("\n")).toEqual([
      `cwd=${process.cwd()}`,
      "argc=2",
      "arg1=run",
      "arg2=data:preflight"
    ]);
  });

  it("passes install when runtime preflight emits compact JSON within npm output", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    const logPath = join(dir, "install-compact-preflight.log");
    await mkdir(fakeBin);
    await createFakeExecutable(join(fakeBin, "sqlite3"), "exit 0\n");
    await createNodeProxyExecutable(join(fakeBin, "node"));
    await createFakeExecutable(
      join(fakeBin, "npm"),
      `{
  printf 'cwd=%s\\n' "$PWD"
  printf 'argc=%s\\n' "$#"
  index=1
  for arg in "$@"; do
    printf 'arg%s=%s\\n' "$index" "$arg"
    index=$((index + 1))
  done
} > "$NPM_LOG"
if [ "$#" -ge 2 ] && [ "$1" = "run" ] && [ "$2" = "data:preflight" ]; then
  printf 'npm notice mock banner\\n'
  printf '{"ok":true,"command":"preflight","sqlitePath":"x"}\\n'
fi
exit 0
`
    );

    const result = await runTool(["install"], {
      PATH: fakeBin,
      NPM_LOG: logPath,
      SCHEDULE_SQLITE_PATH: join(dir, "schedule.db"),
      SCHEDULE_BACKUP_PATH: join(dir, "backups")
    });

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain(`sqlite path: ${join(dir, "schedule.db")}`);
    expect((await readLog(logPath)).trimEnd().split("\n")).toEqual([
      `cwd=${process.cwd()}`,
      "argc=2",
      "arg1=run",
      "arg2=data:preflight"
    ]);
  });

  it("fails install when runtime preflight output contains brace noise around valid JSON", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    const logPath = join(dir, "install-brace-noise-preflight.log");
    await mkdir(fakeBin);
    await createFakeExecutable(join(fakeBin, "sqlite3"), "exit 0\n");
    await createNodeProxyExecutable(join(fakeBin, "node"));
    await createFakeExecutable(
      join(fakeBin, "npm"),
      `{
  printf 'cwd=%s\\n' "$PWD"
  printf 'argc=%s\\n' "$#"
  index=1
  for arg in "$@"; do
    printf 'arg%s=%s\\n' "$index" "$arg"
    index=$((index + 1))
  done
} > "$NPM_LOG"
if [ "$#" -ge 2 ] && [ "$1" = "run" ] && [ "$2" = "data:preflight" ]; then
  printf 'npm notice {warning}\\n'
  printf '{\\n  "ok": true,\\n  "command": "preflight",\\n  "sqlitePath": "x"\\n}\\n'
  printf 'tail noise {still-not-json}\\n'
fi
exit 0
`
    );

    const result = await runTool(["install"], {
      PATH: fakeBin,
      NPM_LOG: logPath,
      SCHEDULE_SQLITE_PATH: join(dir, "schedule.db"),
      SCHEDULE_BACKUP_PATH: join(dir, "backups")
    });

    expect(result.code, result.stderr).toBe(1);
    expect(result.stderr).toContain("maintenance runtime preflight output was not valid JSON");
    expect(result.stderr).toContain("npm notice {warning}");
    expect(result.stderr).toContain("tail noise {still-not-json}");
    expect((await readLog(logPath)).trimEnd().split("\n")).toEqual([
      `cwd=${process.cwd()}`,
      "argc=2",
      "arg1=run",
      "arg2=data:preflight"
    ]);
  });

  it("fails install when runtime preflight output contains field fragments but is not valid JSON", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    const logPath = join(dir, "install-invalid-preflight.log");
    const invalidOutput = 'npm notice {warning}\n{"ok": true, "command": "preflight"';
    await mkdir(fakeBin);
    await createFakeExecutable(join(fakeBin, "sqlite3"), "exit 0\n");
    await createNodeProxyExecutable(join(fakeBin, "node"));
    await createFakeExecutable(
      join(fakeBin, "npm"),
      `{
  printf 'cwd=%s\\n' "$PWD"
  printf 'argc=%s\\n' "$#"
  index=1
  for arg in "$@"; do
    printf 'arg%s=%s\\n' "$index" "$arg"
    index=$((index + 1))
  done
} > "$NPM_LOG"
if [ "$#" -ge 2 ] && [ "$1" = "run" ] && [ "$2" = "data:preflight" ]; then
  printf '${invalidOutput}\\n'
fi
exit 0
`
    );

    const result = await runTool(["install"], {
      PATH: fakeBin,
      NPM_LOG: logPath,
      SCHEDULE_SQLITE_PATH: join(dir, "schedule.db"),
      SCHEDULE_BACKUP_PATH: join(dir, "backups")
    });

    expect(result.code, result.stderr).toBe(1);
    expect(result.stderr).toContain("maintenance runtime preflight output was not valid JSON");
    expect(result.stderr).toContain(invalidOutput);
    expect((await readLog(logPath)).trimEnd().split("\n")).toEqual([
      `cwd=${process.cwd()}`,
      "argc=2",
      "arg1=run",
      "arg2=data:preflight"
    ]);
  });

  it.each([
    {
      name: "install",
      args: ["install"],
      preserveSystemPath: false
    },
    {
      name: "check",
      args: ["check"],
      preserveSystemPath: true
    }
  ])('fails %s when runtime preflight JSON omits required fields', async ({ args, preserveSystemPath }) => {
    const cases = [
      {
        label: 'missing "ok": true',
        preflightOutput: '{\n  "command": "preflight"\n}\n',
        expectedMessage: "maintenance runtime preflight output did not report ok=true"
      },
      {
        label: 'missing "command": "preflight"',
        preflightOutput: '{\n  "ok": true\n}\n',
        expectedMessage: 'maintenance runtime preflight output did not report command="preflight"'
      }
    ] as const;

    for (const testCase of cases) {
      const dir = await createTempDir();
      const fakeBin = join(dir, "bin");
      const logPath = join(dir, `${args[0]}-${testCase.label}.log`);
      await mkdir(fakeBin);
      await createFakeExecutable(join(fakeBin, "sqlite3"), "exit 0\n");
      await createNodeProxyExecutable(join(fakeBin, "node"));
      await createFakeExecutable(
        join(fakeBin, "npm"),
        `{
  printf 'cwd=%s\\n' "$PWD"
  printf 'argc=%s\\n' "$#"
  index=1
  for arg in "$@"; do
    printf 'arg%s=%s\\n' "$index" "$arg"
    index=$((index + 1))
  done
} > "$NPM_LOG"
if [ "$#" -ge 2 ] && [ "$1" = "run" ] && [ "$2" = "data:preflight" ]; then
  printf '${testCase.preflightOutput}'
fi
exit 0
`
      );

      const result = await runTool(args, {
        PATH: preserveSystemPath ? `${fakeBin}:${process.env.PATH ?? ""}` : fakeBin,
        NPM_LOG: logPath,
        SCHEDULE_SQLITE_PATH: join(dir, "schedule.db"),
        SCHEDULE_BACKUP_PATH: join(dir, "backups")
      });

      expect(result.code, `${args[0]} ${testCase.label} stderr: ${result.stderr}`).toBe(1);
      expect(result.stderr).toContain(testCase.expectedMessage);
      expect(result.stderr).toContain(testCase.preflightOutput.trim());
      expect((await readLog(logPath)).trimEnd().split("\n")).toEqual([
        `cwd=${process.cwd()}`,
        "argc=2",
        "arg1=run",
        "arg2=data:preflight"
      ]);
    }
  });

  it("delegates maintenance commands to npm with configured env", async () => {
    const cases = [
      {
        name: "init",
        args: ["init"],
        expectedNpmCalls: [["run", "data:init:sqlite"]],
        preserveSystemPath: true
      },
      {
        name: "backup",
        args: ["backup"],
        expectedNpmCalls: [["run", "data:backup"]],
        preserveSystemPath: true
      },
      {
        name: "check",
        args: ["check"],
        expectedNpmCalls: [
          ["run", "data:preflight"],
          ["run", "data:check:sqlite"]
        ],
        preserveSystemPath: false
      },
      {
        name: "restore",
        args: ["restore", "backup file with spaces.db"],
        expectedNpmCalls: (backupPath: string) => [[
          "run",
          "data:restore",
          "--",
          join(backupPath, "backup file with spaces.db")
        ]],
        preserveSystemPath: true,
        confirmRestore: true
      },
      {
        name: "check-fails-fast-on-empty-preflight",
        args: ["check"],
        expectedNpmCalls: [["run", "data:preflight"]],
        preserveSystemPath: false,
        confirmRestore: false,
        npmBody: `{
  printf 'cwd=%s\\n' "$PWD"
  printf 'SCHEDULE_SQLITE_PATH=%s\\n' "$SCHEDULE_SQLITE_PATH"
  printf 'SCHEDULE_BACKUP_PATH=%s\\n' "$SCHEDULE_BACKUP_PATH"
  printf 'argc=%s\\n' "$#"
  index=1
  for arg in "$@"; do
    printf 'arg%s=%s\\n' "$index" "$arg"
    index=$((index + 1))
  done
} >> "$NPM_LOG"
exit 0
`
      }
    ] as const;

    for (const testCase of cases) {
      const dir = await createTempDir();
      const fakeBin = testCase.npmBody ? join(dir, "bin") : await createFakeNpmBin(dir);
      const logPath = join(dir, `${testCase.name}.log`);
      const sqlitePath = join(dir, "sqlite", "schedule.db");
      const backupPath = join(dir, "backups");

      if (testCase.npmBody) {
        await mkdir(fakeBin);
        await createFakeExecutable(join(fakeBin, "npm"), testCase.npmBody);
      }

      const result = await runTool(testCase.args, {
        PATH: testCase.preserveSystemPath ? `${fakeBin}:${process.env.PATH ?? ""}` : fakeBin,
        NPM_LOG: logPath,
        SCHEDULE_SQLITE_PATH: sqlitePath,
        SCHEDULE_BACKUP_PATH: backupPath,
        CONFIRM_RESTORE: testCase.confirmRestore ? "yes" : ""
      });

      if (testCase.name === "check-fails-fast-on-empty-preflight") {
        expect(result.code, `${testCase.name} stderr: ${result.stderr}`).toBe(1);
        expect(result.stderr).toContain("maintenance runtime preflight output was empty");
      } else {
        expect(result.code, `${testCase.name} stderr: ${result.stderr}`).toBe(0);
      }

      const log = await readLog(logPath);
      const expectedNpmCalls =
        typeof testCase.expectedNpmCalls === "function" ? testCase.expectedNpmCalls(backupPath) : testCase.expectedNpmCalls;
      const expectedLogLines = expectedNpmCalls.flatMap((expectedNpmArgs) => [
        `cwd=${process.cwd()}`,
        `SCHEDULE_SQLITE_PATH=${sqlitePath}`,
        `SCHEDULE_BACKUP_PATH=${backupPath}`,
        `argc=${expectedNpmArgs.length}`,
        ...expectedNpmArgs.map((arg, index) => `arg${index + 1}=${arg}`)
      ]);

      expect(log.trimEnd().split("\n")).toEqual(expectedLogLines);
    }
  });

  it("rejects the removed JSON migration command before invoking npm", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    await mkdir(fakeBin);
    await createFakeExecutable(join(fakeBin, "npm"), "echo npm should not be invoked >&2\nexit 64\n");

    const result = await runTool(["migrate"], {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      SCHEDULE_SQLITE_PATH: join(dir, "sqlite", "schedule.db"),
      SCHEDULE_BACKUP_PATH: join(dir, "backups")
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Unknown command: migrate");
    expect(result.stderr).not.toContain("npm should not be invoked");
  });

  it("passes absolute restore backup paths through unchanged", async () => {
    const dir = await createTempDir();
    const fakeBin = await createFakeNpmBin(dir);
    const logPath = join(dir, "restore-absolute.log");
    const sqlitePath = join(dir, "sqlite", "schedule.db");
    const backupPath = join(dir, "backups");
    const backupFile = join(dir, "absolute backup file.db");

    const result = await runTool(["restore", backupFile], {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      NPM_LOG: logPath,
      SCHEDULE_SQLITE_PATH: sqlitePath,
      SCHEDULE_BACKUP_PATH: backupPath,
      CONFIRM_RESTORE: "yes"
    });

    expect(result.code, `restore stderr: ${result.stderr}`).toBe(0);
    expect((await readLog(logPath)).trimEnd().split("\n")).toEqual([
      `cwd=${process.cwd()}`,
      `SCHEDULE_SQLITE_PATH=${sqlitePath}`,
      `SCHEDULE_BACKUP_PATH=${backupPath}`,
      "argc=4",
      "arg1=run",
      "arg2=data:restore",
      "arg3=--",
      `arg4=${backupFile}`
    ]);
  });

  it("rejects the root path for restore before invoking npm", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    const sqliteDir = join(dir, "sqlite");
    const backupDir = join(dir, "backups");
    await mkdir(fakeBin);
    await createFakeExecutable(join(fakeBin, "npm"), "echo npm should not be invoked >&2\nexit 64\n");

    const result = await runTool(["restore", "/"], {
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
  });

  it("resolves dotted restore backup filenames under the backup path", async () => {
    const dir = await createTempDir();
    const fakeBin = await createFakeNpmBin(dir);
    const logPath = join(dir, "restore-dotted.log");
    const sqlitePath = join(dir, "sqlite", "schedule.db");
    const backupPath = join(dir, "backups");
    const backupFilename = "backup..db";

    const result = await runTool(["restore", backupFilename], {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      NPM_LOG: logPath,
      SCHEDULE_SQLITE_PATH: sqlitePath,
      SCHEDULE_BACKUP_PATH: backupPath,
      CONFIRM_RESTORE: "yes"
    });

    expect(result.code, `restore stderr: ${result.stderr}`).toBe(0);
    expect((await readLog(logPath)).trimEnd().split("\n")).toEqual([
      `cwd=${process.cwd()}`,
      `SCHEDULE_SQLITE_PATH=${sqlitePath}`,
      `SCHEDULE_BACKUP_PATH=${backupPath}`,
      "argc=4",
      "arg1=run",
      "arg2=data:restore",
      "arg3=--",
      `arg4=${join(backupPath, backupFilename)}`
    ]);
  });

  it("rejects unsafe relative restore paths before invoking npm", async () => {
    for (const backupFile of ["../escape.db", "nested/backup.db", "nested\\backup.db", ".", ".."]) {
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

  it("rejects windows-style absolute restore paths before invoking npm", async () => {
    for (const backupFile of ["C:\\tmp\\backup.db", "\\\\server\\share\\backup.db"]) {
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
      expect(result.stderr).not.toContain(restoreGuidance);
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

  it("runs the real data preflight script end to end", async () => {
    const dir = await createTempDir();
    const sqlitePath = join(dir, "sqlite", "schedule.db");
    const backupPath = join(dir, "backups");

    const result = await runDataCli(["preflight"], {
      SCHEDULE_SQLITE_PATH: sqlitePath,
      SCHEDULE_BACKUP_PATH: backupPath
    });

    expect(result.code, `preflight stderr: ${result.stderr}`).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout.trim())).toEqual({
      ok: true,
      command: "preflight",
      sqlitePath,
      backupPath
    });
  });

  it("rejects unsafe relative paths for direct data restore", async () => {
    for (const backupFile of ["nested/backup.db", "../escape.db", "nested\\backup.db", ".", ".."]) {
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

  it("rejects windows-style absolute paths for direct data restore", async () => {
    for (const backupFile of ["C:\\tmp\\backup.db", "\\\\server\\share\\backup.db"]) {
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
      expect(result.stderr).not.toContain(restoreGuidance);
      expect(existsSync(sqliteDir)).toBe(false);
      expect(existsSync(backupDir)).toBe(false);
    }
  });

  it("resolves bare filenames under the backup path for direct data restore", async () => {
    const dir = await createTempDir();
    const sqlitePath = join(dir, "sqlite", "schedule.db");
    const backupPath = join(dir, "backups");
    const backupFilename = "backup..db";
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

  it("rejects the root path for direct data restore before restore", async () => {
    const dir = await createTempDir();
    const sqliteDir = join(dir, "sqlite");
    const backupDir = join(dir, "backups");

    const result = await runDataCli(["restore", "/"], {
      SCHEDULE_SQLITE_PATH: join(sqliteDir, "schedule.db"),
      SCHEDULE_BACKUP_PATH: backupDir,
      CONFIRM_RESTORE: "yes"
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(invalidRestoreFilenameMessage);
    expect(existsSync(sqliteDir)).toBe(false);
    expect(existsSync(backupDir)).toBe(false);
  });
});
