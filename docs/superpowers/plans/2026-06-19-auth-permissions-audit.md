# Auth Permissions Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single management password flow with a login page, persisted sessions, role-based write permissions, and audit logs.

**Architecture:** Add a focused server-side auth/audit service with memory and SQLite-backed stores. API routes authenticate bearer sessions and authorize each write route by role. The frontend gates the app behind a login page, stores the session token locally, and exposes edit controls according to the logged-in user role.

**Tech Stack:** Vue 3, Element Plus, Express, Node crypto PBKDF2, SQLite via better-sqlite3, Vitest.

---

### Task 1: Server Auth And Audit Foundation

**Files:**
- Create: `server/auth.ts`
- Create: `server/auth-store.ts`
- Modify: `server/sqlite/schema.ts`
- Test: `server/auth.test.ts`
- Test: `server/sqlite-storage.test.ts`

- [x] Write failing tests for password hashing, login success/failure, session lookup, logout, and audit insertion.
- [x] Implement PBKDF2 password hashing, session token hashing, memory auth store, and SQLite auth tables.
- [x] Ensure `initializeSqliteSchema` creates `users`, `user_sessions`, and `audit_logs`.

### Task 2: API Route Authorization And Auditing

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/index.ts`
- Modify: `server/routes.test.ts`

- [x] Add `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`, and `/api/audit-logs`.
- [x] Keep `/api/admin/session` as a compatibility alias for the bootstrap admin password during transition.
- [x] Require `admin` for personnel, shift, and holiday configuration writes.
- [x] Require `admin` or `scheduler` for schedule and monthly settlement writes.
- [x] Record audit logs for login, logout, configuration changes, schedule changes, and month settlement changes.

### Task 3: Frontend Login Page And Session State

**Files:**
- Create: `src/components/LoginPage.vue`
- Modify: `src/api/client.ts`
- Modify: `src/App.vue`
- Modify: `src/components/AppToolbar.vue`
- Test: `src/App.test.ts`
- Test: `src/components/AppToolbar.test.ts`

- [x] Add auth client helpers for login, logout, current user, and persisted token.
- [x] Render a login page before the main app when no user session is available.
- [x] Show current user and logout in the toolbar.
- [x] Disable schedule/monthly edits for `viewer`; disable configuration edits for non-`admin`.

### Task 4: Documentation And Verification

**Files:**
- Modify: `docs/功能跟进清单.md`
- Modify: `docs/正式部署运行手册.md`

- [x] Document bootstrap admin account and role behavior.
- [x] Run targeted server and frontend tests.
- [x] Run `npm run build`.
