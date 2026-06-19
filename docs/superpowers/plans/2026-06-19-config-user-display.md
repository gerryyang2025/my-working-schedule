# Config Visibility And User Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `./optools.sh config` visibility commands, document non-admin user creation, and remove duplicate current-user role text in the toolbar.

**Architecture:** Keep operational visibility in `optools.sh` because it already owns deployment paths and helper script wiring. Reuse `server/config.ts` for server config resolution through a small inline `node --import tsx` command, and keep account creation in the existing Web management drawer. Keep UI display logic local to `AppToolbar.vue`.

**Tech Stack:** Bash, Node.js with `tsx`, Vue 3, Vitest, Vue Test Utils, Markdown docs.

---

## File Structure

- Modify `optools.sh`: add config usage text, `run_config_helper`, config subcommand dispatch, and a redacted `config server` resolver.
- Modify `optools.test.ts`: add tests for config help, default `config show`, `config paths`, `config server`, and unknown config subcommands.
- Modify `src/components/AppToolbar.vue`: compute a non-duplicated user identity label and render that value.
- Modify `src/components/AppToolbar.test.ts`: add tests for duplicate and non-duplicate user display.
- Modify `docs/正式部署运行手册.md`: document how an admin adds `scheduler` and `viewer` users through the Web UI.

---

### Task 1: Add Failing Tests For `optools.sh config`

**Files:**
- Modify: `optools.test.ts`

- [ ] **Step 1: Add config command tests**

Append these tests inside the existing `describe("optools.sh", () => { ... })` block in `optools.test.ts`, preferably after the current help test so the command surface is documented near usage coverage:

```ts
  it("prints config command usage", async () => {
    const result = await runOptools(["help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("./optools.sh config");
    expect(result.stdout).toContain("./optools.sh config paths");
    expect(result.stdout).toContain("./optools.sh config server");
  });

  it("shows an operations config summary by default", async () => {
    const stateDir = await createStateDir();
    const installDir = join(stateDir, "opt", "my-working-schedule");
    const dataDir = join(stateDir, "var", "lib", "my-working-schedule");
    const backupDir = join(stateDir, "var", "backups", "my-working-schedule");
    const systemdFile = join(stateDir, "etc", "systemd", "system", "schedule-api.service");
    const fakeNginxHelper = join(stateDir, "tools", "nginx-service.sh");
    const fakeSqliteHelper = join(stateDir, "tools", "sqlite-service.sh");

    const result = await runOptools(["config"], {
      OPTOOLS_INSTALL_DIR: installDir,
      OPTOOLS_DATA_DIR: dataDir,
      OPTOOLS_BACKUP_DIR: backupDir,
      OPTOOLS_SYSTEMD_SERVICE_FILE: systemdFile,
      OPTOOLS_NGINX_SERVICE_SCRIPT: fakeNginxHelper,
      OPTOOLS_SQLITE_SERVICE_SCRIPT: fakeSqliteHelper,
      OPTOOLS_APP_SERVICE_NAME: "schedule-api",
      OPTOOLS_API_HEALTH_URL: "http://127.0.0.1:3901/api/health"
    });

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("config: operations summary");
    expect(result.stdout).toContain(`install dir: ${installDir}`);
    expect(result.stdout).toContain(`static dist: ${join(installDir, "dist")}`);
    expect(result.stdout).toContain(`data dir: ${dataDir}`);
    expect(result.stdout).toContain(`backup dir: ${backupDir}`);
    expect(result.stdout).toContain("systemd service: schedule-api");
    expect(result.stdout).toContain(`systemd file: ${systemdFile}`);
    expect(result.stdout).toContain(`nginx helper: ${fakeNginxHelper}`);
    expect(result.stdout).toContain(`sqlite helper: ${fakeSqliteHelper}`);
    expect(result.stdout).toContain("api health url: http://127.0.0.1:3901/api/health");
  });

  it("shows config paths for deployment troubleshooting", async () => {
    const stateDir = await createStateDir();
    const installDir = join(stateDir, "install");
    const configPath = join(stateDir, "server.local.json");
    const systemdFile = join(stateDir, "schedule-api.service");

    const result = await runOptools(["config", "paths"], {
      OPTOOLS_INSTALL_DIR: installDir,
      OPTOOLS_STATE_DIR: join(stateDir, "tmp"),
      OPTOOLS_LOG_DIR: join(stateDir, "logs"),
      OPTOOLS_SYSTEMD_SERVICE_FILE: systemdFile,
      SCHEDULE_CONFIG_PATH: configPath
    });

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("config: paths");
    expect(result.stdout).toContain(`source root: ${process.cwd()}`);
    expect(result.stdout).toContain(`install dir: ${installDir}`);
    expect(result.stdout).toContain(`static dist: ${join(installDir, "dist")}`);
    expect(result.stdout).toContain(`state dir: ${join(stateDir, "tmp")}`);
    expect(result.stdout).toContain(`log dir: ${join(stateDir, "logs")}`);
    expect(result.stdout).toContain(`server config path: ${configPath}`);
    expect(result.stdout).toContain(`systemd file: ${systemdFile}`);
  });

  it("shows redacted effective server config", async () => {
    const stateDir = await createStateDir();
    const configPath = join(stateDir, "server.local.json");

    await writeFile(
      configPath,
      JSON.stringify(
        {
          host: "127.0.0.1",
          port: 3999,
          storageDriver: "sqlite",
          storagePath: "data/app-data.local.json",
          sqlitePath: "/var/lib/my-working-schedule/schedule.db",
          backupPath: "/var/backups/my-working-schedule",
          adminPassword: "super-secret-password"
        },
        null,
        2
      ),
      "utf8"
    );

    const result = await runOptools(["config", "server"], {
      SCHEDULE_CONFIG_PATH: configPath
    });

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("config: effective server config");
    expect(result.stdout).toContain('"host": "127.0.0.1"');
    expect(result.stdout).toContain('"port": 3999');
    expect(result.stdout).toContain('"storageDriver": "sqlite"');
    expect(result.stdout).toContain('"adminPasswordConfigured": true');
    expect(result.stdout).not.toContain("super-secret-password");
    expect(result.stdout).not.toContain('"adminPassword":');
  });

  it("rejects unknown config subcommands", async () => {
    const result = await runOptools(["config", "unknown"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Unknown config command: unknown");
    expect(result.stdout).toContain("./optools.sh config");
  });
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
npm run test -- optools.test.ts
```

Expected: fail because `./optools.sh help` does not include `config`, and `./optools.sh config` currently falls through to the unknown command path.

- [ ] **Step 3: Commit the failing tests**

```bash
git add optools.test.ts
git commit -m "test: cover optools config commands"
```

---

### Task 2: Implement `optools.sh config`

**Files:**
- Modify: `optools.sh`

- [ ] **Step 1: Add usage entries**

In `usage()` in `optools.sh`, add the config command block after `deploy` and before `nginx`:

```bash
  ./optools.sh config         Show key production operations config
  ./optools.sh config show    Show key production operations config
  ./optools.sh config paths   Show important local and production paths
  ./optools.sh config server  Show effective server config with secrets redacted
```

In the environment section, add:

```bash
  SCHEDULE_CONFIG_PATH        Optional server config file path
```

- [ ] **Step 2: Add config helper functions**

Add these functions after `run_deploy()` and before `doctor_check()`:

```bash
server_config_path() {
  if [[ -n "${SCHEDULE_CONFIG_PATH:-}" ]]; then
    echo "$SCHEDULE_CONFIG_PATH"
    return
  fi

  echo "$ROOT_DIR/config/server.local.json"
}

run_config_show() {
  echo "config: operations summary"
  echo "source root: $ROOT_DIR"
  echo "install dir: $INSTALL_DIR"
  echo "static dist: $INSTALL_DIST_DIR"
  echo "data dir: $DATA_DIR"
  echo "backup dir: $BACKUP_DIR"
  echo "systemd service: $APP_SERVICE_NAME"
  echo "systemd file: $SYSTEMD_SERVICE_FILE"
  echo "nginx helper: $NGINX_SERVICE_SCRIPT"
  echo "sqlite helper: $SQLITE_SERVICE_SCRIPT"
  echo "api health url: $API_HEALTH_URL"
}

run_config_paths() {
  echo "config: paths"
  echo "source root: $ROOT_DIR"
  echo "install dir: $INSTALL_DIR"
  echo "static dist: $INSTALL_DIST_DIR"
  echo "state dir: $STATE_DIR"
  echo "log dir: $LOG_DIR"
  echo "dev pid file: $PID_FILE"
  echo "dev log file: $LOG_FILE"
  echo "server config path: $(server_config_path)"
  echo "systemd source file: $SYSTEMD_SOURCE_FILE"
  echo "systemd file: $SYSTEMD_SERVICE_FILE"
  echo "nginx helper: $NGINX_SERVICE_SCRIPT"
  echo "sqlite helper: $SQLITE_SERVICE_SCRIPT"
}

run_config_server() {
  if ! command -v node >/dev/null 2>&1; then
    echo "config server: node command not found" >&2
    return 1
  fi

  node --import tsx -e '
    const { resolveServerConfig } = await import("./server/config.ts");
    const config = resolveServerConfig();
    const redacted = {
      host: config.host,
      port: config.port,
      storageDriver: config.storageDriver,
      storagePath: config.storagePath ?? null,
      sqlitePath: config.sqlitePath ?? null,
      backupPath: config.backupPath ?? null,
      adminPasswordConfigured: Boolean(config.adminPassword)
    };
    console.log("config: effective server config");
    console.log(JSON.stringify(redacted, null, 2));
  '
}

run_config_helper() {
  local command="${1:-show}"

  case "$command" in
    show|"")
      run_config_show
      ;;
    paths)
      run_config_paths
      ;;
    server)
      run_config_server
      ;;
    help|-h|--help)
      usage
      ;;
    *)
      echo "Unknown config command: $command" >&2
      usage
      return 1
      ;;
  esac
}
```

- [ ] **Step 3: Wire the main dispatcher**

In `main()`, add this scope before `nginx)`:

```bash
    config)
      shift || true
      run_config_helper "$@"
      ;;
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm run test -- optools.test.ts
```

Expected: all tests in `optools.test.ts` pass.

- [ ] **Step 5: Commit implementation**

```bash
git add optools.sh optools.test.ts
git commit -m "feat: add optools config commands"
```

---

### Task 3: Optimize Toolbar User Display

**Files:**
- Modify: `src/components/AppToolbar.test.ts`
- Modify: `src/components/AppToolbar.vue`

- [ ] **Step 1: Update the test helper to accept user overrides**

Add this import near the existing imports in `src/components/AppToolbar.test.ts`:

```ts
import type { AuthUser } from "@/api/client";
```

Then change the helper signature from:

```ts
function mountToolbar(selectedDate = "2026-06-17") {
```

to:

```ts
function mountToolbar(
  selectedDate = "2026-06-17",
  currentUser: AuthUser = {
    id: "user-admin",
    username: "admin",
    displayName: "系统管理员",
    role: "admin" as const
  }
) {
```

Then replace the hard-coded `currentUser` prop object with:

```ts
      currentUser
```

- [ ] **Step 2: Add failing display tests**

Append these tests near the other toolbar behavior tests:

```ts
  it("uses username when display name duplicates the role label", () => {
    const wrapper = mountToolbar("2026-06-17", {
      id: "user-admin",
      username: "admin",
      displayName: "系统管理员",
      role: "admin"
    });

    expect(wrapper.get(".toolbar-user").text()).toBe("admin · 系统管理员");
  });

  it("uses display name when it differs from the role label", () => {
    const wrapper = mountToolbar("2026-06-17", {
      id: "user-scheduler",
      username: "scheduler",
      displayName: "排班负责人",
      role: "scheduler"
    });

    expect(wrapper.get(".toolbar-user").text()).toBe("排班负责人 · 排班管理员");
  });
```

- [ ] **Step 3: Run the focused test and confirm failure**

Run:

```bash
npm run test -- src/components/AppToolbar.test.ts
```

Expected: fail because `.toolbar-user` still renders `currentUser.displayName · roleLabel`.

- [ ] **Step 4: Implement the display label**

In `src/components/AppToolbar.vue`, add this computed value after `roleLabel`:

```ts
const userIdentityLabel = computed(() => {
  const displayName = props.currentUser.displayName.trim();
  const fallbackName = displayName && displayName !== roleLabel.value ? displayName : props.currentUser.username;
  return `${fallbackName} · ${roleLabel.value}`;
});
```

Then change the template line:

```vue
      <span class="toolbar-user">{{ currentUser.displayName }} · {{ roleLabel }}</span>
```

to:

```vue
      <span class="toolbar-user">{{ userIdentityLabel }}</span>
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm run test -- src/components/AppToolbar.test.ts
```

Expected: all AppToolbar tests pass.

- [ ] **Step 6: Commit toolbar optimization**

```bash
git add src/components/AppToolbar.vue src/components/AppToolbar.test.ts
git commit -m "fix: avoid duplicate toolbar user role text"
```

---

### Task 4: Document Account Management And Verify

**Files:**
- Modify: `docs/正式部署运行手册.md`

- [ ] **Step 1: Add account management documentation**

Insert this section after the “页面验证” list and before “备份” in `docs/正式部署运行手册.md`:

```markdown
## 账号维护

除默认 `admin` 外，其他账号通过 Web 管理页面维护：

1. 使用 `admin` 和当前管理员密码登录。
2. 点击右上角“配置”。
3. 进入“账号”tab。
4. 点击“新增账号”。
5. 填写账号、显示名、角色、启用状态和初始密码。
6. 点击“保存账号”。
7. 让新用户使用初始密码登录，并建议首次登录后点击“修改密码”改成个人密码。

当前支持三类角色：

- `系统管理员`：可维护人员、班次、节假日、账号、审计日志、排班和月结。
- `排班管理员`：可维护排班和月结，不能维护人员、班次、节假日、账号和审计日志。
- `只读查看`：只能查看排班、周统计、月结与奖金等信息，不能保存修改。

如果新增账号无法登录，先确认账号处于“启用”状态，再确认密码是否已正确设置或重置。
```

- [ ] **Step 2: Run focused verification**

Run:

```bash
npm run test -- optools.test.ts src/components/AppToolbar.test.ts
```

Expected: both focused test files pass.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run test
```

Expected: full test suite passes.

- [ ] **Step 4: Manually verify the config commands**

Run:

```bash
./optools.sh config
./optools.sh config paths
./optools.sh config server
```

Expected:

- `config` prints operations summary.
- `config paths` prints source, install, log, pid, config, systemd, and helper paths.
- `config server` prints JSON with `adminPasswordConfigured`, and does not print an `adminPassword` value.

- [ ] **Step 5: Commit docs and final verification state**

```bash
git add docs/正式部署运行手册.md
git commit -m "docs: explain account management roles"
```

---

## Final Review Checklist

- [ ] `./optools.sh help` includes `config` commands.
- [ ] `./optools.sh config` works as `config show`.
- [ ] `./optools.sh config paths` works.
- [ ] `./optools.sh config server` redacts admin password.
- [ ] Default admin toolbar label is `admin · 系统管理员`.
- [ ] Non-duplicated display names still show as `显示名 · 角色名`.
- [ ] `docs/正式部署运行手册.md` explains how to add non-admin users.
- [ ] Focused and full tests pass.
