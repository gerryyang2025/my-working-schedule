# Production Operations Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining P0 production-operations loop with repeatable deployment acceptance docs, backup-restore rehearsal records, and a troubleshooting guide for `./optools.sh doctor`.

**Architecture:** Keep production behavior unchanged: `./optools.sh doctor` remains the machine-check command, while `./optools.sh doctor guide` becomes a read-only explanation command. Deployment docs stay in `docs/`, tests enforce that the runbook, checklist, and rehearsal template remain discoverable and aligned with HTTP + IP, SQLite, backup, Nginx, logrotate, firewall, and API health checks.

**Tech Stack:** Bash (`optools.sh`), Markdown docs, Vitest doc/CLI tests.

---

## File Structure

- Modify `optools.sh`: add `doctor guide` usage and a new `run_doctor_guide` helper. Do not change the current `./optools.sh doctor` check behavior or output.
- Modify `optools.test.ts`: add CLI tests for `doctor guide` and help text.
- Modify `deployment-docs.test.ts`: add documentation assertions for the new acceptance checklist and backup-restore rehearsal template.
- Create `docs/正式上线验收清单.md`: step-by-step acceptance checklist for target-server production validation.
- Create `docs/备份恢复演练记录模板.md`: copyable backup and restore rehearsal record template.
- Modify `docs/正式部署运行手册.md`: link to the two new docs and mention `./optools.sh doctor guide`.
- Modify `docs/功能跟进清单.md`: move the P0 production-operations closure from pending into completed or partial-completed status, depending on whether implementation and tests pass.

---

### Task 1: Add Documentation Tests For The Production Acceptance Checklist

**Files:**
- Modify: `deployment-docs.test.ts`
- Create later in Task 2: `docs/正式上线验收清单.md`
- Create later in Task 2: `docs/备份恢复演练记录模板.md`
- Modify later in Task 2: `docs/正式部署运行手册.md`

- [ ] **Step 1: Write the failing documentation test**

Add this test inside `describe("production deployment docs and examples", () => { ... })` in `deployment-docs.test.ts`:

```ts
  it("documents production acceptance and backup restore rehearsal records", async () => {
    const runbook = await readProjectFile("docs/正式部署运行手册.md");
    const checklist = await readProjectFile("docs/正式上线验收清单.md");
    const rehearsal = await readProjectFile("docs/备份恢复演练记录模板.md");

    expect(runbook).toContain("[正式上线验收清单](./正式上线验收清单.md)");
    expect(runbook).toContain("[备份恢复演练记录模板](./备份恢复演练记录模板.md)");
    expect(runbook).toContain("./optools.sh doctor guide");

    expect(checklist).toContain("# 正式上线验收清单");
    expect(checklist).toContain("当前阶段：HTTP + 服务器公网 IP");
    expect(checklist).toContain("./optools.sh deploy");
    expect(checklist).toContain("./optools.sh doctor");
    expect(checklist).toContain("./optools.sh doctor guide");
    expect(checklist).toContain("./optools.sh data backup");
    expect(checklist).toContain("CONFIRM_RESTORE=yes ./optools.sh data restore");
    expect(checklist).toContain("公网访问 http://<server-ip>/");
    expect(checklist).toContain("不要求 HTTPS 验收通过");

    expect(rehearsal).toContain("# 备份恢复演练记录模板");
    expect(rehearsal).toContain("演练时间");
    expect(rehearsal).toContain("备份文件");
    expect(rehearsal).toContain("./optools.sh data check");
    expect(rehearsal).toContain("CONFIRM_RESTORE=yes ./optools.sh data restore");
    expect(rehearsal).toContain("恢复后验证结论");
  });
```

- [ ] **Step 2: Run the documentation test to verify it fails**

Run:

```bash
npm run test -- deployment-docs.test.ts -t "production acceptance"
```

Expected result: FAIL because `docs/正式上线验收清单.md` and `docs/备份恢复演练记录模板.md` do not exist yet, or because the runbook does not link to them yet.

---

### Task 2: Add Production Acceptance Checklist And Rehearsal Template Docs

**Files:**
- Create: `docs/正式上线验收清单.md`
- Create: `docs/备份恢复演练记录模板.md`
- Modify: `docs/正式部署运行手册.md`

- [ ] **Step 1: Create the production acceptance checklist**

Create `docs/正式上线验收清单.md` with this content:

````md
# 正式上线验收清单

本文用于目标服务器正式运行前后的逐项验收。当前阶段：HTTP + 服务器公网 IP，不要求 HTTPS 验收通过；后续申请正式域名后，再按正式部署运行手册启用 HTTPS。

## 1. 部署前检查

- [ ] 已确认服务器 Node.js、npm、gcc、make、python3 可用。
- [ ] 已确认源码目录为 `/root/github/my-working-schedule` 或实际部署约定目录。
- [ ] 已确认 `/opt/my-working-schedule`、`/var/lib/my-working-schedule`、`/var/backups/my-working-schedule` 可创建或已存在。
- [ ] 已确认 `config/server.local.json` 或 systemd 环境变量使用 SQLite：`SCHEDULE_STORAGE_DRIVER=sqlite`。
- [ ] 已确认默认管理员密码已设置为真实密码，不再使用临时口令。

## 2. 部署执行

```bash
cd /root/github/my-working-schedule
git pull
./optools.sh deploy
```

- [ ] `./optools.sh deploy` 执行成功。
- [ ] `./optools.sh app doctor` 通过。
- [ ] `./optools.sh doctor` 通过；如果失败，执行 `./optools.sh doctor guide` 按检查项排查。
- [ ] `./optools.sh data check` 输出 `ok: true`。
- [ ] `./optools.sh logrotate status` 显示 logrotate 命令和应用配置存在。
- [ ] `./optools.sh firewall status` 已检查本机防火墙状态。

## 3. HTTP + IP 访问验收

```bash
curl -I http://127.0.0.1/
curl -fsS http://127.0.0.1/api/health
```

- [ ] 服务器本机 `http://127.0.0.1/` 返回 200 或 304。
- [ ] 服务器本机 `http://127.0.0.1/api/health` 返回健康结果。
- [ ] 公网访问 http://<server-ip>/ 可打开首页。
- [ ] 公网访问 http://<server-ip>/api/health 可返回健康结果。
- [ ] 云安全组开放 TCP 80。
- [ ] API 3001 未直接暴露公网，API 访问通过 Nginx 反向代理。
- [ ] 当前阶段 `./optools.sh doctor` 中 `[skip] nginx https config` 属于预期结果，不要求 HTTPS 验收通过。

## 4. 页面和账号验收

- [ ] 使用 `admin` 和正式管理员密码登录成功。
- [ ] 首页可显示排班、周统计、月结与奖金 tab。
- [ ] 系统配置页面可打开。
- [ ] 账号页面可新增一个 `viewer` 测试账号。
- [ ] `viewer` 账号可登录并查看全科排班。
- [ ] `viewer` 账号不能编辑排班和月结。
- [ ] 审计页面可查询到最新登录和配置操作记录。

## 5. 数据和备份验收

```bash
./optools.sh data status
./optools.sh data check
./optools.sh data backup
ls -lh /var/backups/my-working-schedule
```

- [ ] SQLite 文件路径为 `/var/lib/my-working-schedule/schedule.db` 或已确认的正式路径。
- [ ] `./optools.sh data check` 通过。
- [ ] `./optools.sh data backup` 生成新的备份文件。
- [ ] 备份文件大小大于 0。
- [ ] 已按 [备份恢复演练记录模板](./备份恢复演练记录模板.md) 完成至少一次恢复演练记录。

## 6. 恢复演练验收

恢复演练应优先在测试服务器或维护窗口执行。

```bash
./optools.sh app stop
CONFIRM_RESTORE=yes ./optools.sh data restore <backup-file>
./optools.sh data check
./optools.sh app start
./optools.sh app health
```

- [ ] 恢复命令要求显式 `CONFIRM_RESTORE=yes`。
- [ ] 恢复后 `./optools.sh data check` 通过。
- [ ] 恢复后 `./optools.sh app health` 通过。
- [ ] 恢复后页面核心数据可读取。
- [ ] 恢复演练结果已记录到 [备份恢复演练记录模板](./备份恢复演练记录模板.md) 的副本中。

## 7. 上线结论

- [ ] 验收人：
- [ ] 验收日期：
- [ ] 服务器公网 IP：
- [ ] Git commit：
- [ ] 结论：通过 / 有条件通过 / 不通过。
- [ ] 遗留问题：
````

- [ ] **Step 2: Create the backup-restore rehearsal template**

Create `docs/备份恢复演练记录模板.md` with this content:

````md
# 备份恢复演练记录模板

本文用于记录每次备份和恢复演练。建议在正式上线、系统升级、月结前和服务器迁移前各记录一次。

## 基本信息

- 演练时间：
- 操作人员：
- 服务器：
- Git commit：
- SQLite 路径：
- 备份目录：

## 备份记录

执行命令：

```bash
./optools.sh data status
./optools.sh data check
./optools.sh data backup
ls -lh /var/backups/my-working-schedule
```

- 备份文件：
- 备份文件大小：
- 备份前 `./optools.sh data check` 结果：
- 备份结论：通过 / 不通过。

## 恢复演练记录

恢复演练建议在测试服务器或维护窗口执行。恢复正式数据前必须先确认备份文件路径。

执行命令：

```bash
./optools.sh app stop
CONFIRM_RESTORE=yes ./optools.sh data restore <backup-file>
./optools.sh data check
./optools.sh app start
./optools.sh app health
```

- 恢复使用的备份文件：
- 恢复后 `./optools.sh data check` 结果：
- 恢复后 `./optools.sh app health` 结果：
- 恢复后页面验证结果：
- 恢复后验证结论：通过 / 不通过。

## 页面核对

- [ ] 首页可打开。
- [ ] admin 可登录。
- [ ] 排班表可读取。
- [ ] 周统计可读取。
- [ ] 月结与奖金可读取。
- [ ] 系统配置可读取。
- [ ] 审计日志可读取。

## 问题记录

- 发现问题：
- 处理过程：
- 最终结论：
````

- [ ] **Step 3: Link the new docs from the runbook**

In `docs/正式部署运行手册.md`, add a short section near `## 上线检查清单`:

````md
## 验收与演练文档

正式上线建议使用独立清单逐项记录：

- [正式上线验收清单](./正式上线验收清单.md)
- [备份恢复演练记录模板](./备份恢复演练记录模板.md)

当 `./optools.sh doctor` 失败时，可先查看检查项解释：

```bash
./optools.sh doctor guide
```
````

- [ ] **Step 4: Run the documentation test to verify it passes**

Run:

```bash
npm run test -- deployment-docs.test.ts -t "production acceptance"
```

Expected result: PASS.

---

### Task 3: Add `./optools.sh doctor guide`

**Files:**
- Modify: `optools.test.ts`
- Modify: `optools.sh`

- [ ] **Step 1: Write the failing CLI test**

Add this test inside `describe("optools.sh", () => { ... })` in `optools.test.ts`, near the existing `doctor` tests:

```ts
  it("prints doctor troubleshooting guidance", async () => {
    const result = await runOptools(["doctor", "guide"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("doctor guide: production runtime checks");
    expect(result.stdout).toContain("[fail] data check");
    expect(result.stdout).toContain("./optools.sh data status");
    expect(result.stdout).toContain("./optools.sh data check");
    expect(result.stdout).toContain("[fail] nginx test");
    expect(result.stdout).toContain("./optools.sh nginx status");
    expect(result.stdout).toContain("./optools.sh nginx test");
    expect(result.stdout).toContain("[skip] nginx https config");
    expect(result.stdout).toContain("HTTP + IP");
    expect(result.stdout).toContain("[fail] logrotate status");
    expect(result.stdout).toContain("./optools.sh logrotate install");
    expect(result.stdout).toContain("[fail] firewall status");
    expect(result.stdout).toContain("./optools.sh firewall guide");
    expect(result.stdout).toContain("[fail] api health");
    expect(result.stdout).toContain("./optools.sh app status");
    expect(result.stdout).toContain("journalctl -u my-working-schedule -n 100 --no-pager");
  });
```

Also update the existing `prints development daemon usage` test expectations:

```ts
    expect(result.stdout).toContain("./optools.sh doctor guide");
```

- [ ] **Step 2: Run the CLI test to verify it fails**

Run:

```bash
npm run test -- optools.test.ts -t "doctor troubleshooting"
```

Expected result: FAIL because `./optools.sh doctor guide` currently runs `doctor` instead of printing guide text.

- [ ] **Step 3: Update `optools.sh` usage**

In the `usage()` heredoc, add this line after `./optools.sh doctor`:

```bash
  ./optools.sh doctor guide   Explain doctor checks and common fixes
```

- [ ] **Step 4: Add a `run_doctor_guide` helper**

Add this function immediately after `doctor_check_https_config()` and before `run_doctor()`:

```bash
run_doctor_guide() {
  cat <<EOF
doctor guide: production runtime checks

Run:
  ./optools.sh doctor

When a check fails, use the matching section below.

[fail] node / [fail] npm
  Meaning: Node.js or npm is not available to the current shell.
  Check:
    command -v node
    command -v npm
  Fix: install Node.js in a service-user-readable path, then rerun ./optools.sh deploy.

[fail] static dist
  Meaning: frontend assets are not installed in the production dist directory.
  Check:
    ./optools.sh config paths
    ls -lh "$INSTALL_DIST_DIR/index.html"
  Fix:
    ./optools.sh build
    ./optools.sh deploy

[fail] app package.json / [fail] app server entry / [fail] app shared source
  Meaning: production runtime files are missing under the install directory.
  Check:
    ./optools.sh config paths
    ls -lh "$INSTALL_DIR"
  Fix:
    ./optools.sh build
    ./optools.sh deploy

[fail] data status / [fail] data check
  Meaning: SQLite storage path, schema, or integrity check is not healthy.
  Check:
    ./optools.sh data status
    ./optools.sh data check
  Fix: confirm SCHEDULE_STORAGE_DRIVER=sqlite and SCHEDULE_SQLITE_PATH, then rerun ./optools.sh data init.

[fail] nginx status / [fail] nginx test
  Meaning: Nginx is missing, inactive, or config test failed.
  Check:
    ./optools.sh nginx status
    ./optools.sh nginx test
  Fix:
    ./optools.sh nginx install
    ./optools.sh nginx reload

[skip] nginx https config
  Meaning: HTTPS variables are not configured.
  Current phase: HTTP + IP access treats this as expected. Enable HTTPS only after a formal domain and certificate are ready.

[fail] nginx https config
  Meaning: one or more HTTPS variables are configured, but domain, certificate, or key is incomplete.
  Check:
    echo "$NGINX_SERVER_NAME"
    echo "$NGINX_SSL_CERTIFICATE"
    echo "$NGINX_SSL_CERTIFICATE_KEY"
  Fix: configure all three HTTPS variables or unset all three for HTTP + IP mode.

[fail] logrotate status
  Meaning: logrotate command or app logrotate config is missing.
  Check:
    ./optools.sh logrotate status
  Fix:
    ./optools.sh logrotate install
    ./optools.sh logrotate test

[fail] firewall status
  Meaning: firewall helper could not confirm current firewall status.
  Check:
    ./optools.sh firewall status
    ./optools.sh firewall guide
  Fix: open TCP 80 for HTTP + IP mode in both server firewall and cloud security group. Open TCP 443 only after HTTPS is enabled.

[fail] app status
  Meaning: the systemd API service is not active.
  Check:
    ./optools.sh app status
    journalctl -u $APP_SERVICE_NAME -n 100 --no-pager
  Fix: inspect logs, resolve ExecStart, dependency, data, or port errors, then run ./optools.sh app restart.

[fail] api health
  Meaning: the API process did not answer /api/health.
  Check:
    ./optools.sh app status
    ./optools.sh app logs
    curl -fsS "$API_HEALTH_URL"
  Fix: restart the app after resolving service logs. If deploy is slow, rerun with OPTOOLS_HEALTH_RETRIES=60.
EOF
}
```

- [ ] **Step 5: Route `doctor guide` without changing `doctor`**

Change the `doctor)` branch in `main()` from:

```bash
    doctor)
      run_doctor
      ;;
```

to:

```bash
    doctor)
      case "$command" in
        "")
          run_doctor
          ;;
        guide)
          run_doctor_guide
          ;;
        *)
          echo "Unknown doctor command: $command" >&2
          usage
          return 1
          ;;
      esac
      ;;
```

- [ ] **Step 6: Run the CLI test to verify it passes**

Run:

```bash
npm run test -- optools.test.ts -t "doctor troubleshooting"
```

Expected result: PASS.

- [ ] **Step 7: Run the existing doctor test to guard unchanged behavior**

Run:

```bash
npm run test -- optools.test.ts -t "runs doctor checks"
```

Expected result: PASS. Confirm `./optools.sh doctor` still runs checks and can return non-zero when a check fails.

---

### Task 4: Update Follow-Up Checklist And Run Focused Verification

**Files:**
- Modify: `docs/功能跟进清单.md`

- [ ] **Step 1: Update `docs/功能跟进清单.md`**

In section `### 1.7 正式存储基础能力`, add a bullet:

```md
- 支持正式上线验收清单、备份恢复演练记录模板和 `./optools.sh doctor guide` 故障解释入口，方便目标服务器二次联调和日常运维。
```

In section `### 3.1 P0：正式化基础能力`, replace:

```md
- 目标服务器二次联调，当前阶段覆盖 HTTP + IP、日志轮转、防火墙、安全组和备份恢复流程；HTTPS 证书切换留到后续正式域名阶段。
```

with:

```md
- 目标服务器二次联调仍需在真实服务器定期执行；当前已提供 HTTP + IP、日志轮转、防火墙、安全组、备份恢复和 doctor 排障说明的验收材料。
```

Keep this item in P0 because real target-server execution is an operational activity, not something the repository can fully complete by itself.

- [ ] **Step 2: Run focused tests**

Run:

```bash
npm run test -- deployment-docs.test.ts optools.test.ts
```

Expected result: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected result: PASS.

- [ ] **Step 4: Run full tests when focused tests pass**

Run:

```bash
npm run test
```

Expected result: PASS. If sandboxed execution fails with `listen EPERM` in `server/routes.test.ts`, rerun the same command with the approved non-sandbox test execution path and record that the sandbox failure is caused by local port-listen restrictions.

- [ ] **Step 5: Summarize implementation results**

Report:

```md
已完成 P0 正式运行闭环增强：
- 新增正式上线验收清单。
- 新增备份恢复演练记录模板。
- 新增 `./optools.sh doctor guide`。
- 更新正式部署运行手册和功能跟进清单。

验证：
- `npm run test -- deployment-docs.test.ts optools.test.ts`
- `npm run lint`
- `npm run test`
```

---

## Self-Review

- **Spec coverage:** The plan covers production acceptance docs, backup-restore rehearsal records, `doctor guide`, runbook links, checklist status, and verification. It intentionally excludes HTTPS enablement, schema changes, and business features.
- **Placeholder scan:** No placeholder markers or vague implementation steps remain. Every file and command is named explicitly.
- **Type and command consistency:** `./optools.sh doctor guide` is added to usage, routed in `main()`, and tested through `runOptools(["doctor", "guide"])`. Documentation tests point to concrete Markdown files.
