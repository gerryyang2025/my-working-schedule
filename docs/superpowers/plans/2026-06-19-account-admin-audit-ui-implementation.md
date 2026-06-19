# Account Admin Audit UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add usable account management, self-service password change, and audit log viewing on top of the existing auth foundation.

**Architecture:** Extend the auth store with user maintenance and filtered audit listing, then expose admin/user API routes. The frontend keeps management inside the existing drawer by adding "账号" and "审计" tabs, while password change lives in a focused dialog opened from the toolbar.

**Tech Stack:** Vue 3, Element Plus, Express, better-sqlite3, Vitest, Supertest.

---

### Task 1: Backend User Maintenance And Audit Filters

**Files:**
- Modify: `server/auth-store.ts`
- Modify: `server/sqlite/auth-store.ts`
- Modify: `server/routes.ts`
- Modify: `server/auth.test.ts`
- Modify: `server/sqlite-auth-store.test.ts`
- Modify: `server/routes.test.ts`

- [x] Write failing tests for listing users, saving users, password change, last-admin protection, and audit filters.
- [x] Extend `AuthStore` with `listUsers`, `saveUser`, `changePassword`, and filtered `listAuditLogs`.
- [x] Implement memory auth store behavior.
- [x] Implement SQLite auth store behavior.
- [x] Add `GET /api/users`, `PUT /api/users/:id`, and `PUT /api/auth/password`.
- [x] Extend `GET /api/audit-logs` query handling.
- [x] Run backend targeted tests.

### Task 2: API Client And Toolbar Password Entry

**Files:**
- Modify: `src/api/client.ts`
- Modify: `src/components/AppToolbar.vue`
- Modify: `src/components/AppToolbar.test.ts`
- Create: `src/components/PasswordChangeDialog.vue`
- Create: `src/components/PasswordChangeDialog.test.ts`

- [x] Write failing frontend tests for password action and dialog submit behavior.
- [x] Add API client helpers for user listing, saving users, audit listing, and password change.
- [x] Add toolbar "修改密码" action.
- [x] Implement `PasswordChangeDialog`.
- [x] Run targeted frontend tests.

### Task 3: Management Drawer Account And Audit Tabs

**Files:**
- Modify: `src/components/ManagementDrawer.vue`
- Modify: `src/styles/main.css`
- Create/Modify: `src/components/ManagementDrawer.test.ts`

- [x] Write failing tests for account tab rendering, account save emit, audit tab rendering, and audit filter emit.
- [x] Add account table/list and account form.
- [x] Add audit filter controls and audit table/list.
- [x] Add mobile-friendly styles for account and audit rows.
- [x] Run drawer tests and CSS tests.

### Task 4: App Integration And Documentation

**Files:**
- Modify: `src/App.vue`
- Modify: `src/App.test.ts`
- Modify: `docs/功能跟进清单.md`
- Modify: `docs/技术方案.md`
- Modify: `docs/正式部署运行手册.md`

- [x] Write failing App tests for loading users/audit logs, saving users, changing password, and re-login after password change.
- [x] Wire App state and API handlers into `ManagementDrawer` and `PasswordChangeDialog`.
- [x] Update documents with account UI and audit viewer status.
- [x] Run full targeted frontend/backend tests and `npm run build`.
