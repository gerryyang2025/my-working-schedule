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

  it("starts the API with node watch and the tsx loader", async () => {
    const packageJson = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["dev:api"]).toContain("node");
    expect(packageJson.scripts["dev:api"]).toContain("--watch");
    expect(packageJson.scripts["dev:api"]).toContain("--watch-preserve-output");
    expect(packageJson.scripts["dev:api"]).toContain("--import tsx server/index.ts");
    expect(packageJson.scripts["dev:api"]).not.toContain("--watch-path");
    expect(packageJson.scripts["dev:api"]).not.toContain("tsx watch");
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
