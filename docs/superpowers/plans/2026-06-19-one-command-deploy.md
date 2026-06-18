# One Command Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add `./optools.sh deploy` so production deployment runs from the source directory without manual directory switching, while detecting API port conflicts before service restart.

**Architecture:** Extend the existing `optools.sh` orchestration layer rather than adding a new script. Reuse existing `build`, `app`, `data`, and `nginx` helpers, add npm auto-resolution, dependency installation via `npm --prefix`, and a fail-fast port availability check before starting the systemd service.

**Tech Stack:** Bash, systemd, npm, Vitest, Markdown deployment docs.

---

### Task 1: Update Design Scope for Port Conflict Guard

**Files:**
- Modify: `docs/superpowers/specs/2026-06-19-one-command-deploy-design.md`

- [x] **Step 1: Add port conflict behavior to the design**

Add a short section stating that `deploy` stops the app service, checks port `3001`, and fails with listener diagnostics if another process still owns the port.

- [x] **Step 2: Review the design**

Run: `rg "端口|EADDRINUSE|deploy" docs/superpowers/specs/2026-06-19-one-command-deploy-design.md`

Expected: The design mentions the user-facing `EADDRINUSE` failure and the deployment guard.

### Task 2: Test npm Auto-Resolution

**Files:**
- Modify: `optools.test.ts`
- Modify: `optools.sh`

- [x] **Step 1: Write failing test for npm auto-resolution**

Add a Vitest case where `command -v npm` resolves to a fake `/root/.nvm/.../npm` that `runuser` rejects, while `/opt/node-v22.22.0/bin/npm` is accepted. Assert `app init` writes `ExecStart=/opt/node-v22.22.0/bin/npm run start:api`.

- [x] **Step 2: Run test and verify failure**

Run: `npm run test -- optools.test.ts -t "selects a service-user runnable npm candidate"`

Expected: FAIL because `resolve_npm_bin` currently stops at `command -v npm`.

- [x] **Step 3: Implement npm auto-resolution**

Update `optools.sh` so `resolve_npm_bin` tries explicit `OPTOOLS_NPM_BIN`, then `command -v npm`, then common candidate paths from `OPTOOLS_NPM_CANDIDATES`. It should skip candidates the app user cannot execute.

- [x] **Step 4: Run test and verify pass**

Run: `npm run test -- optools.test.ts -t "selects a service-user runnable npm candidate"`

Expected: PASS.

### Task 3: Test and Implement `deploy` Orchestration

**Files:**
- Modify: `optools.test.ts`
- Modify: `optools.sh`

- [x] **Step 1: Write failing test for deploy sequence**

Add a Vitest case for `./optools.sh deploy` using fake `npm`, `systemctl`, `runuser`, `getent`, `chown`, data helper, nginx helper, and port command. Assert it calls build, installs dependencies with `npm --prefix "$INSTALL_DIR" ci --include=dev`, checks data/nginx, stops the app, starts it, and runs health checks without `cd /opt`.

- [x] **Step 2: Run test and verify failure**

Run: `npm run test -- optools.test.ts -t "runs one-command production deploy"`

Expected: FAIL because `deploy` is not implemented.

- [x] **Step 3: Implement `run_deploy`**

Add a `deploy` scope to `main`, usage text, and `run_deploy` that performs `app init`, `build_static_assets`, dependency install, `data status`, `data check`, `nginx test`, `app stop`, port check, `app start`, `app doctor`, and `app health`.

- [x] **Step 4: Run test and verify pass**

Run: `npm run test -- optools.test.ts -t "runs one-command production deploy"`

Expected: PASS.

### Task 4: Test and Implement Port Conflict Guard

**Files:**
- Modify: `optools.test.ts`
- Modify: `optools.sh`

- [x] **Step 1: Write failing test for occupied API port**

Add a Vitest case where fake `ss` reports a listener on port `3001` after `app stop`. Assert `deploy` exits non-zero, prints `API port is already in use`, and does not call `systemctl start`.

- [x] **Step 2: Run test and verify failure**

Run: `npm run test -- optools.test.ts -t "stops deploy when the API port is already occupied"`

Expected: FAIL because no port check exists.

- [x] **Step 3: Implement port diagnostics**

Add `list_port_listeners` and `ensure_api_port_available` helpers. Prefer `ss`, fall back to `lsof`, then `netstat`. Treat any listener after `app stop` as a conflict.

- [x] **Step 4: Run test and verify pass**

Run: `npm run test -- optools.test.ts -t "stops deploy when the API port is already occupied"`

Expected: PASS.

### Task 5: Update Docs and Documentation Tests

**Files:**
- Modify: `README.md`
- Modify: `docs/正式部署运行手册.md`
- Modify: `deployment-docs.test.ts`

- [x] **Step 1: Write failing docs test**

Update `deployment-docs.test.ts` to require `./optools.sh deploy`, `EADDRINUSE`, and `ss -ltnp` in the runbook.

- [x] **Step 2: Run test and verify failure**

Run: `npm run test -- deployment-docs.test.ts`

Expected: FAIL until docs mention the new deploy flow and port troubleshooting.

- [x] **Step 3: Update documentation**

Make `./optools.sh deploy` the main deployment path. Keep manual commands as troubleshooting reference. Add a section for `EADDRINUSE 127.0.0.1:3001`.

- [x] **Step 4: Run docs test and verify pass**

Run: `npm run test -- deployment-docs.test.ts`

Expected: PASS.

### Task 6: Final Verification

**Files:**
- Modify: no production files unless verification reveals an issue.

- [x] **Step 1: Run shell syntax check**

Run: `bash -n optools.sh`

Expected: Exit code 0.

- [x] **Step 2: Run focused tests**

Run: `npm run test -- optools.test.ts deployment-docs.test.ts`

Expected: All tests pass.

- [x] **Step 3: Run production build**

Run: `npm run build`

Expected: TypeScript and Vite build complete successfully.

- [x] **Step 4: Run full test suite**

Run: `npm run test`

Expected: All tests pass. If sandbox blocks server listen with `EPERM`, rerun with approved non-sandbox execution and report both results.

- [x] **Step 5: Run diff check**

Run: `git diff --check`

Expected: No whitespace errors.
