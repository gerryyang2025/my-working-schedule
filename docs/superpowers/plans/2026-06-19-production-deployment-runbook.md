# Production Deployment Runbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close P0-A by documenting and testing a formal single-machine deployment path with SQLite, production API startup, systemd, Nginx, backups, and health checks.

**Architecture:** Keep application code behavior unchanged except for adding a non-watching production API start script. Treat deployment examples as versioned artifacts and verify them with Vitest so future script/config changes do not silently drift away from the runbook.

**Tech Stack:** Vue 3/Vite frontend build, Express API, TypeScript via `tsx`, SQLite maintenance scripts, systemd, Nginx, cron, Vitest.

---

### Task 1: Lock Deployment Expectations With Tests

**Files:**
- Create: `deployment-docs.test.ts`
- Modify: `package-scripts.test.ts`

- [x] **Step 1: Add tests for production docs and examples**

Create tests asserting that the runbook, production config, systemd unit, Nginx config and cron backup example exist and contain the required SQLite deployment commands.

- [x] **Step 2: Add test for production API start script**

Assert `package.json` exposes `start:api` as `node --import tsx server/index.ts` and does not use the development watcher.

- [x] **Step 3: Verify tests fail before implementation**

Run:

```bash
npm run test -- deployment-docs.test.ts
npm run test -- package-scripts.test.ts
```

Expected before implementation: missing runbook/example files and missing `start:api`.

### Task 2: Add Production Deployment Artifacts

**Files:**
- Modify: `package.json`
- Create: `config/server.production.example.json`
- Create: `deploy/systemd/my-working-schedule.service.example`
- Create: `deploy/nginx/my-working-schedule.conf.example`
- Create: `deploy/cron/my-working-schedule-backup.cron.example`

- [x] **Step 1: Add `start:api`**

Add:

```json
"start:api": "node --import tsx server/index.ts"
```

- [x] **Step 2: Add production config and Linux examples**

Use SQLite by default, bind API to `127.0.0.1`, point static files to `dist`, proxy `/api/`, and schedule daily SQLite backup.

### Task 3: Add Runbook and Sync Tracking Docs

**Files:**
- Create: `docs/正式部署运行手册.md`
- Create: `docs/superpowers/specs/2026-06-19-production-deployment-runbook-design.md`
- Modify: `README.md`
- Modify: `docs/技术方案.md`
- Modify: `docs/功能跟进清单.md`

- [x] **Step 1: Write the runbook**

Cover dependency installation, production config, JSON-to-SQLite migration, frontend build, API startup, systemd, Nginx, health checks, backups, recovery,上线检查清单, and rollback.

- [x] **Step 2: Sync README and tracking docs**

Add the runbook to README, align the technical plan with SQLite-first formal deployment, and update `功能跟进清单` P0-A status.

### Task 4: Verification

**Files:**
- Test: `deployment-docs.test.ts`
- Test: `package-scripts.test.ts`

- [x] **Step 1: Run focused tests**

```bash
npm run test -- deployment-docs.test.ts package-scripts.test.ts
```

- [x] **Step 2: Run doc whitespace check**

```bash
git diff --check
```

- [x] **Step 3: Run build or lint if script changes affect package behavior**

```bash
npm run build
```
