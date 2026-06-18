import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("package scripts", () => {
  it("binds the Vite dev server to all interfaces by default", async () => {
    const packageJson = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["dev:web"]).toContain("--host ${WEB_HOST:-0.0.0.0}");
    expect(packageJson.scripts["dev:web"]).toContain("--port ${WEB_PORT:-5173}");
  });

  it("exposes SQLite data maintenance scripts", async () => {
    const packageJson = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["data:init:sqlite"]).toBe("tsx server/data-cli.ts init");
    expect(packageJson.scripts["data:migrate:sqlite"]).toBe("tsx server/data-cli.ts migrate");
    expect(packageJson.scripts["data:export:json"]).toBe("tsx server/data-cli.ts export-json");
    expect(packageJson.scripts["data:backup"]).toBe("tsx server/data-cli.ts backup");
    expect(packageJson.scripts["data:restore"]).toBe("tsx server/data-cli.ts restore");
    expect(packageJson.scripts["data:check:sqlite"]).toBe("tsx server/data-cli.ts check");
  });
});
