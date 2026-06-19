# P0 Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the low-risk P0 production hardening path by adding HTTPS Nginx configuration, logrotate maintenance, firewall inspection guidance, and unified `optools.sh doctor` checks.

**Architecture:** Keep `optools.sh` as the single user-facing operations entry point. Add focused helper scripts under `tools/` and static templates under `deploy/`, then delegate from `optools.sh` with tests around each delegation point.

**Tech Stack:** Bash, Nginx, logrotate, Linux firewall command inspection, Vitest, Markdown runbook docs.

---

### Task 1: Sync Tracking Status

**Files:**
- Modify: `docs/功能跟进清单.md`

- [x] **Step 1: Mark already completed config/account polish**

Record `optools.sh config`, deployment account instructions, and user-display cleanup as completed.

- [x] **Step 2: Split P0 production hardening scope**

Separate script hardening from later target-server HTTPS/firewall/security-group validation.

### Task 2: Add HTTPS Nginx Configuration

**Files:**
- Add: `deploy/nginx/my-working-schedule-https.conf.example`
- Modify: `tools/nginx-service.sh`
- Modify: `tools/nginx-service.test.ts`
- Modify: `optools.sh`
- Modify: `optools.test.ts`

- [x] **Step 1: Add HTTPS template**

Create a template with placeholders for server name, certificate, and private key while keeping static files under `/opt/my-working-schedule/dist` and `/api/` proxied to `127.0.0.1:3001`.

- [x] **Step 2: Add `configure-https` helper command**

Render the template from `NGINX_SERVER_NAME`, `NGINX_SSL_CERTIFICATE`, and `NGINX_SSL_CERTIFICATE_KEY`; validate paths before writing the target config.

- [x] **Step 3: Add tests**

Cover successful render with `--no-reload` and failure when cert files are missing.

### Task 3: Add Logrotate Maintenance

**Files:**
- Add: `deploy/logrotate/my-working-schedule.example`
- Add: `tools/logrotate-service.sh`
- Add: `tools/logrotate-service.test.ts`
- Modify: `optools.sh`
- Modify: `optools.test.ts`

- [x] **Step 1: Add logrotate template**

Rotate application and backup logs with safe defaults.

- [x] **Step 2: Add helper commands**

Support `install`, `status`, `test`, and `help`.

- [x] **Step 3: Add wrapper and tests**

Expose `./optools.sh logrotate ...` and cover delegation plus helper behavior.

### Task 4: Add Firewall Inspection

**Files:**
- Add: `tools/firewall-service.sh`
- Add: `tools/firewall-service.test.ts`
- Modify: `optools.sh`
- Modify: `optools.test.ts`

- [x] **Step 1: Detect common firewall tools**

Inspect `firewalld`, `ufw`, `nft`, and `iptables` without mutating rules.

- [x] **Step 2: Add guide output**

Document that HTTP 80 and HTTPS 443 should be open, while API 3001 should remain private behind Nginx.

- [x] **Step 3: Add wrapper and tests**

Expose `./optools.sh firewall status|guide`.

### Task 5: Extend Doctor and Docs

**Files:**
- Modify: `optools.sh`
- Modify: `optools.test.ts`
- Modify: `docs/正式部署运行手册.md`
- Modify: `tools/README.md`
- Modify: `docs/功能跟进清单.md`

- [x] **Step 1: Add doctor checks**

Include logrotate and firewall checks, keeping HTTPS optional unless certificate-related environment variables are configured.

- [x] **Step 2: Update runbook**

Add HTTPS, logrotate, firewall, and updated launch checklist instructions.

- [x] **Step 3: Update tracking**

Move implemented P0 production hardening items into completed/partially completed sections and leave target-server validation as the remaining manual step.

### Task 6: Verify

**Files:**
- Test suite and build outputs only.

- [x] **Step 1: Run focused tests**

Run `npm run test -- tools/nginx-service.test.ts tools/logrotate-service.test.ts tools/firewall-service.test.ts optools.test.ts deployment-docs.test.ts`.

- [x] **Step 2: Run build**

Run `npm run build`.

- [x] **Step 3: Review git diff**

Confirm only planned files changed.
