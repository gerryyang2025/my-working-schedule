import { execFile, type ExecFileException } from "node:child_process";
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
  });

  it("reports stopped when no dev pid exists", async () => {
    const stateDir = await createStateDir();
    const result = await runOptools(["dev", "status"], {
      OPTOOLS_STATE_DIR: stateDir,
      OPTOOLS_LOG_DIR: stateDir
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("dev service: stopped");
    expect(result.stdout).toContain(`pid file: ${join(stateDir, "dev.pid")}`);
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

  it("keeps daemonized dev command alive after start returns and stops it", async () => {
    const stateDir = await createStateDir();
    const fakeBinDir = join(stateDir, "bin");
    const fakeNpmPath = join(fakeBinDir, "npm");
    const env = {
      OPTOOLS_STATE_DIR: stateDir,
      OPTOOLS_LOG_DIR: stateDir,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
    };

    await mkdir(fakeBinDir, { recursive: true });
    await writeFile(
      fakeNpmPath,
      '#!/usr/bin/env bash\nprintf "fake npm %s\\n" "$*"\nsleep 30\n',
      "utf8"
    );
    await chmod(fakeNpmPath, 0o755);

    try {
      const start = await runOptools(["dev", "start"], env);
      expect(start.code).toBe(0);
      expect(start.stdout).toContain("dev service: started");

      const status = await runOptools(["dev", "status"], env);
      expect(status.code).toBe(0);
      expect(status.stdout).toContain("dev service: running");
    } finally {
      const stop = await runOptools(["dev", "stop"], env);
      expect(stop.code).toBe(0);
      expect(stop.stdout).toContain("dev service:");
    }

    const statusAfterStop = await runOptools(["dev", "status"], env);
    expect(statusAfterStop.stdout).toContain("dev service: stopped");
  });
});
