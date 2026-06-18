import { execFile, type ExecFileException } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function runDevApiWatchDryRun(): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolveResult) => {
    execFile(
      process.execPath,
      [resolve(process.cwd(), "server/dev-api-watch.mjs")],
      {
        env: {
          ...process.env,
          DEV_API_WATCH_DRY_RUN: "1"
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

describe("package scripts", () => {
  it("binds the Vite dev server to all interfaces by default", async () => {
    const packageJson = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["dev:web"]).toContain("--host ${WEB_HOST:-0.0.0.0}");
    expect(packageJson.scripts["dev:web"]).toContain("--port ${WEB_PORT:-5173}");
  });

  it("starts the API through the dedicated watcher script", async () => {
    const packageJson = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["dev:api"]).toBe("node server/dev-api-watch.mjs");
    expect(packageJson.scripts["dev:api"]).not.toContain("--watch");
    expect(packageJson.scripts["dev:api"]).not.toContain("--watch-path");
    expect(packageJson.scripts["dev:api"]).not.toContain("tsx watch");
  });

  it("configures the API watcher to spawn node with the tsx loader and only watch server directories", async () => {
    const result = await runDevApiWatchDryRun();

    expect(result.code, result.stderr).toBe(0);
    expect(result.stderr).toBe("");

    const dryRun = JSON.parse(result.stdout) as {
      childCommand: string;
      childArgs: string[];
      watchDirs: string[];
    };

    expect(dryRun.childCommand).toBe(process.execPath);
    expect(dryRun.childArgs).toEqual(["--import", "tsx", "server/index.ts"]);
    expect(dryRun.watchDirs.length).toBeGreaterThan(0);
    expect(dryRun.watchDirs.every((dir) => dir.startsWith(resolve(process.cwd(), "server")))).toBe(true);
    expect(dryRun.watchDirs.some((dir) => dir === resolve(process.cwd(), "server"))).toBe(true);
    expect(dryRun.watchDirs.some((dir) => dir.includes("node_modules"))).toBe(false);
    expect(dryRun.watchDirs.some((dir) => dir.endsWith("/dist"))).toBe(false);
  });

  it("exposes SQLite data maintenance scripts", async () => {
    const packageJson = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["data:init:sqlite"]).toBe("node --import tsx server/data-cli.ts init");
    expect(packageJson.scripts["data:migrate:sqlite"]).toBe("node --import tsx server/data-cli.ts migrate");
    expect(packageJson.scripts["data:export:json"]).toBe("node --import tsx server/data-cli.ts export-json");
    expect(packageJson.scripts["data:backup"]).toBe("node --import tsx server/data-cli.ts backup");
    expect(packageJson.scripts["data:restore"]).toBe("node --import tsx server/data-cli.ts restore");
    expect(packageJson.scripts["data:check:sqlite"]).toBe("node --import tsx server/data-cli.ts check");
    expect(packageJson.scripts["data:preflight"]).toBe("node --import tsx server/data-cli.ts preflight");
  });
});
