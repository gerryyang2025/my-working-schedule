# Mobile PDF Share Print Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile-friendly PDF output path for week/month schedules so users can save or share the printed form when mobile `window.print()` is unavailable.

**Architecture:** Keep the existing print preview as the source of truth. Add a small frontend PDF utility that captures the active preview DOM with `html2canvas`, writes it into a paged PDF with `jspdf`, and returns a `File`. The App layer uses Web Share when supported and falls back to object-URL download.

**Tech Stack:** Vue 3, TypeScript, Element Plus, Vitest, `html2canvas`, `jspdf`, browser `navigator.share` / `navigator.canShare`.

---

### Task 1: PDF Utility

**Files:**
- Create: `src/lib/print-pdf.ts`
- Test: `src/lib/print-pdf.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/print-pdf.test.ts` with tests that mock `html2canvas` and `jspdf`, assert a selected preview element is captured, a PDF file is returned, and an empty/invalid element fails with a clear error.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm run test -- src/lib/print-pdf.test.ts`
Expected: fails because `src/lib/print-pdf.ts` does not exist.

- [ ] **Step 3: Install dependencies**

Run: `npm install html2canvas jspdf`
Expected: `package.json` and `package-lock.json` include the dependencies.

- [ ] **Step 4: Implement the PDF utility**

Implement `createPrintPdfFile(options)` in `src/lib/print-pdf.ts`:
- Input: `{ element: HTMLElement; filename: string }`
- Use `html2canvas(element, { backgroundColor: "#ffffff", scale: 2 })`
- Create A4 landscape PDF with `new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })`
- Fit the rendered canvas image into one or more pages.
- Return `new File([pdfBlob], filename, { type: "application/pdf" })`

- [ ] **Step 5: Run the focused test to verify it passes**

Run: `npm run test -- src/lib/print-pdf.test.ts`
Expected: pass.

### Task 2: App Preview Actions

**Files:**
- Modify: `src/App.vue`
- Modify: `src/App.test.ts`
- Modify: `src/styles/main.css`

- [ ] **Step 1: Write failing App tests**

Extend `src/App.test.ts` to mock the PDF utility and test:
- Mobile preview shows a primary “生成/分享 PDF” action.
- When `navigator.canShare({ files })` succeeds, the action calls `navigator.share({ files, title })`.
- When file sharing is unsupported, it creates a downloadable PDF link instead of silently failing.

- [ ] **Step 2: Run App tests to verify failure**

Run: `npm run test -- src/App.test.ts`
Expected: fails because the action is missing.

- [ ] **Step 3: Implement preview action state**

In `src/App.vue`:
- Add `pdfGenerating`, `pdfDownloadUrl`, and `pdfDownloadName` state.
- Add `handlePreviewPdfShare()` that finds `.print-preview-content .print-preview-active`, calls `createPrintPdfFile`, shares it when supported, and falls back to object URL download.
- Revoke stale object URLs when generating a new PDF or closing the dialog.
- Replace the mobile-oriented primary footer action with “生成/分享 PDF”; keep “调用系统打印” as a secondary action when useful.

- [ ] **Step 4: Style the actions**

In `src/styles/main.css`, add compact mobile footer layout and a visible download link style.

- [ ] **Step 5: Run focused tests**

Run: `npm run test -- src/App.test.ts src/lib/print-pdf.test.ts`
Expected: pass.

### Task 3: Verification

**Files:**
- No production files unless verification exposes an issue.

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: TypeScript and Vite build pass.

- [ ] **Step 2: Full test suite**

Run: `npm run test`
Expected: all tests pass. If sandbox blocks server route tests with `listen EPERM`, rerun the same command with escalated execution.

- [ ] **Step 3: Browser check**

Use the in-app browser at 390px width:
- Open `http://127.0.0.1:5173/`
- Open week print preview.
- Verify the PDF action is visible.
- Click it.
- Verify a download link appears when Web Share file support is unavailable in the test browser.

