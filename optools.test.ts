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
    expect(result.stdout).toContain("HOST");
    expect(result.stdout).toContain("WEB_HOST");
    expect(result.stdout).toContain("PUBLIC_HOST");
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
