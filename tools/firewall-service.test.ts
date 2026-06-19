import { execFile, type ExecFileException } from "node:child_process";
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
const scriptPath = resolve(process.cwd(), "tools/firewall-service.sh");

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "firewall-service-test-"));
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

describe("tools/firewall-service.sh", () => {
  it("prints usage", async () => {
    const result = await runTool(["help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("./tools/firewall-service.sh status");
    expect(result.stdout).toContain("./tools/firewall-service.sh guide");
  });

  it("prints firewall guide", async () => {
    const result = await runTool(["guide"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("open TCP 80");
    expect(result.stdout).toContain("open TCP 443");
    expect(result.stdout).toContain("keep API port 3001 private");
    expect(result.stdout).toContain("cloud security group");
  });

  it("detects firewalld status first", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    const logPath = join(dir, "commands.log");

    await createFakeExecutable(
      join(fakeBin, "firewall-cmd"),
      `printf 'firewall-cmd %s\\n' "$*" >> "$COMMAND_LOG"
case "$1" in
  --state) printf 'running\\n' ;;
  --list-services) printf 'ssh http https\\n' ;;
  --list-ports) printf '3001/tcp\\n' ;;
esac
`
    );

    const result = await runTool(["status"], {
      PATH: `${fakeBin}:/usr/bin:/bin`,
      COMMAND_LOG: logPath
    });

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("firewall tool: firewalld");
    expect(result.stdout).toContain("running");
    expect(result.stdout).toContain("ssh http https");
    expect(result.stdout).toContain("3001/tcp");
    expect(await readFile(logPath, "utf8")).toBe(
      ["firewall-cmd --state", "firewall-cmd --list-services", "firewall-cmd --list-ports", ""].join("\n")
    );
  });

  it("detects ufw when firewalld is unavailable", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");

    await createFakeExecutable(join(fakeBin, "ufw"), "printf 'Status: active\\n80 ALLOW Anywhere\\n'\n");

    const result = await runTool(["status"], {
      PATH: `${fakeBin}:/usr/bin:/bin`
    });

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("firewall tool: ufw");
    expect(result.stdout).toContain("Status: active");
  });

  it("prints manual check guidance when no firewall tool is detected", async () => {
    const dir = await createTempDir();
    const fakeBin = join(dir, "bin");
    await mkdir(fakeBin, { recursive: true });

    const result = await runTool(["status"], {
      PATH: fakeBin
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("firewall tool: not detected");
    expect(result.stdout).toContain("manual check required");
    expect(result.stdout).toContain("open TCP 80");
  });
});
