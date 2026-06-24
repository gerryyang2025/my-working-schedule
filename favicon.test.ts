import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("favicon", () => {
  it("declares the SVG favicon in the HTML entry", () => {
    const html = readFileSync("index.html", "utf8");

    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
  });

  it("ships a valid SVG favicon asset", () => {
    expect(existsSync("public/favicon.svg")).toBe(true);

    const svg = readFileSync("public/favicon.svg", "utf8");

    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<title id="title">护理排班管理系统</title>');
    expect(svg).toMatch(/<text[^>]*>护<\/text>/);
  });
});
