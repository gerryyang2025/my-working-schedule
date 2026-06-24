# Favicon Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight SVG favicon so browser tabs show a dedicated icon for the nursing schedule system.

**Architecture:** Use Vite's `public/` static asset convention and a single `<link rel="icon">` in `index.html`. Keep the icon as hand-authored SVG so no image generation, binary asset pipeline, or extra dependency is needed. Add a root-level Vitest test that verifies the HTML declaration and favicon asset contract.

**Tech Stack:** Vite static assets, HTML, SVG, Vitest, Node `fs` reads.

---

## File Structure

- Create `public/favicon.svg`: browser favicon asset served by Vite at `/favicon.svg`.
- Modify `index.html`: declare the SVG favicon in the document head.
- Create `favicon.test.ts`: root-level static asset test for the favicon declaration and SVG contract.

## Task 1: Favicon Declaration And Asset

**Files:**
- Create: `favicon.test.ts`
- Create: `public/favicon.svg`
- Modify: `index.html`

- [ ] **Step 1: Write the failing favicon test**

Create `favicon.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the favicon test to verify RED**

Run:

```bash
npm run test -- favicon.test.ts
```

Expected: FAIL with both of these missing-contract signals:

- `index.html` does not contain the favicon `<link>`.
- `public/favicon.svg` does not exist.

- [ ] **Step 3: Add the SVG favicon asset**

Create `public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="title">
  <title id="title">护理排班管理系统</title>
  <rect width="64" height="64" rx="14" fill="#2563eb" />
  <rect x="14" y="13" width="36" height="38" rx="6" fill="#eff6ff" />
  <path d="M14 22h36" stroke="#bfdbfe" stroke-width="4" />
  <path d="M24 10v8M40 10v8" stroke="#ffffff" stroke-width="4" stroke-linecap="round" />
  <text
    x="32"
    y="43"
    fill="#1d4ed8"
    font-family="PingFang SC, Microsoft YaHei, Arial, sans-serif"
    font-size="28"
    font-weight="900"
    text-anchor="middle"
  >护</text>
</svg>
```

This keeps the small-size favicon readable: blue shell, simple calendar body, and a single “护” glyph.

- [ ] **Step 4: Declare the favicon in index.html**

Modify `index.html` so the `<head>` becomes:

```html
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>国际医学部护理排班管理系统</title>
  </head>
```

- [ ] **Step 5: Run the favicon test to verify GREEN**

Run:

```bash
npm run test -- favicon.test.ts
```

Expected: PASS with `1` test file and `2` tests passing.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add favicon.test.ts public/favicon.svg index.html
git commit -m "feat: add svg favicon"
```

## Task 2: Final Verification

**Files:**
- Verify: `favicon.test.ts`
- Verify: `public/favicon.svg`
- Verify: `index.html`

- [ ] **Step 1: Run the focused favicon test**

Run:

```bash
npm run test -- favicon.test.ts
```

Expected: PASS with `1` test file and `2` tests passing.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
npm run test
```

Expected: PASS.

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS. Vite output should include `favicon.svg` in `dist/` because it is served from `public/`.

- [ ] **Step 4: Verify the built favicon file**

Run:

```bash
test -f dist/favicon.svg
```

Expected: exit code `0`.

- [ ] **Step 5: Browser verification**

Start the local dev server:

```bash
npm run dev
```

Open the local URL shown by Vite. Verify:

- Browser tab requests `/favicon.svg`.
- The page still loads normally.
- The tab displays a dedicated icon after refresh. If the browser has cached the old empty state, hard refresh the page once.

- [ ] **Step 6: Inspect git diff**

Run:

```bash
git diff --stat HEAD
git diff HEAD -- favicon.test.ts public/favicon.svg index.html
```

Expected: no uncommitted changes after Task 1. If browser verification creates temporary files, leave them untracked only when they are outside the repository; repository status must stay clean.
