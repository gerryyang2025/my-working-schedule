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
});
