# Permission Model Finalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finalize the P0 account permission model by making the existing role, staff binding, and managed-staff rules clear in UI, tests, and docs.

**Architecture:** No new database schema or API is required. The work tightens the existing `admin` / `scheduler` / `viewer` model by adding regression tests, refining explanatory text in `App.vue` and `ManagementDrawer.vue`, and syncing deployment and tracking docs.

**Tech Stack:** Vue 3, Element Plus, Vitest, Express route tests, SQLite-backed auth and schedule data.

---

## File Structure

- Modify `src/App.test.ts`: lock the homepage guidance text so it explains full-department visibility, managed-staff edit scope, and staff binding not granting permissions.
- Modify `src/App.vue`: update the homepage info panel copy only.
- Modify `src/components/ManagementDrawer.test.ts`: add assertions for role guidance, staff binding guidance, scheduler guidance, viewer guidance, and head-nurse account setup advice.
- Modify `src/components/ManagementDrawer.vue`: refine account form help text and role-specific copy.
- Modify `server/permissions.test.ts`: add focused regression tests for `viewer` and empty `scheduler` permissions.
- Optionally modify `server/routes.test.ts`: only if the permission unit tests reveal a missing route-level case.
- Modify `deployment-docs.test.ts`: assert the runbook documents the three roles and head-nurse account configuration.
- Modify `docs/功能跟进清单.md`: mark the current P0 permission model as finalized, leaving only future complex organization models as later work.
- Modify `docs/正式部署运行手册.md`: add operator-facing instructions for admin, scheduler, viewer, head-nurse accounts, staff binding, and managed-staff setup.
- Modify `docs/技术方案.md`: keep the formal architecture description aligned with the finalized permission model.

## Task 1: Homepage Permission Guidance

**Files:**
- Modify: `src/App.test.ts`
- Modify: `src/App.vue`

- [ ] **Step 1: Write the failing homepage guidance test**

Update the existing `renders concise usage and calculation guidance below the title` test in `src/App.test.ts` by adding these assertions inside the same test:

```ts
expect(infoPanel.text()).toContain("绑定人员只用于标识账号本人");
expect(infoPanel.text()).toContain("不会自动授予排班权限");
expect(infoPanel.text()).toContain("编辑范围由账号可管理人员决定");
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm run test -- src/App.test.ts -t "renders concise usage and calculation guidance below the title"
```

Expected: FAIL because the homepage copy does not yet mention that staff binding does not grant scheduling permission.

- [ ] **Step 3: Update the homepage copy**

In `src/App.vue`, replace the quick-start paragraph inside `.app-info-panel` with:

```vue
<p>
  所有登录账号可查看全科排班；排班员只能编辑账号可管理人员范围内的格子，其他格子为只读。绑定人员只用于标识账号本人，
  不会自动授予排班权限，编辑范围由账号可管理人员决定。
</p>
```

Keep the calculation rules block unchanged.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
npm run test -- src/App.test.ts -t "renders concise usage and calculation guidance below the title"
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add src/App.test.ts src/App.vue
git commit -m "Clarify homepage permission guidance"
```

## Task 2: Account Drawer Role Guidance

**Files:**
- Modify: `src/components/ManagementDrawer.test.ts`
- Modify: `src/components/ManagementDrawer.vue`

- [ ] **Step 1: Write the failing account guidance test**

Add this test to `describe("ManagementDrawer", ...)` in `src/components/ManagementDrawer.test.ts` after the existing account save tests:

```ts
it("explains staff binding and role scoped permissions", async () => {
  const wrapper = mountDrawer();

  expect(wrapper.text()).toContain("绑定人员只用于标识账号本人");
  expect(wrapper.text()).toContain("不会自动授予排班权限");
  expect(wrapper.text()).toContain("系统管理员默认管理全部人员");
  expect(wrapper.text()).toContain("只读账号可以查看全科排班，但不能编辑排班和月结");

  await wrapper
    .findAll(".management-mobile-user")
    .find((item) => item.text().includes("排班管理员"))!
    .trigger("click");

  expect(wrapper.text()).toContain("排班管理员需要选择可管理人员");
  expect(wrapper.text()).toContain("未选择时只能查看，不能编辑任何人员");
  expect(wrapper.text()).toContain("护士长需要参与排班管理时，请选择排班管理员");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm run test -- src/components/ManagementDrawer.test.ts -t "explains staff binding and role scoped permissions"
```

Expected: FAIL because the exact new help copy is not present.

- [ ] **Step 3: Update binding and role help text**

In `src/components/ManagementDrawer.vue`, replace the existing binding help paragraph with:

```vue
<p class="management-help-text">
  绑定人员只用于标识账号本人，不会自动授予排班权限；可管理人员决定排班和月结可操作范围。
</p>
```

After the scheduler `el-select` for `userDraft.managedStaffIds`, add this scheduler-only paragraph:

```vue
<p v-if="userDraft.role === 'scheduler'" class="management-help-text">
  排班管理员需要选择可管理人员；未选择时只能查看，不能编辑任何人员。护士长需要参与排班管理时，请选择排班管理员并配置可管理人员。
</p>
```

Keep the existing admin and viewer paragraphs, but make sure they read exactly:

```vue
<p v-else-if="userDraft.role === 'admin'" class="management-help-text">系统管理员默认管理全部人员。</p>
<p v-else class="management-help-text">只读账号可以查看全科排班，但不能编辑排班和月结。</p>
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
npm run test -- src/components/ManagementDrawer.test.ts -t "explains staff binding and role scoped permissions"
```

Expected: PASS.

- [ ] **Step 5: Run the full drawer tests**

Run:

```bash
npm run test -- src/components/ManagementDrawer.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add src/components/ManagementDrawer.test.ts src/components/ManagementDrawer.vue
git commit -m "Clarify account permission guidance"
```

## Task 3: Permission Regression Tests

**Files:**
- Modify: `server/permissions.test.ts`
- Optional Modify: `server/routes.test.ts`

- [ ] **Step 1: Add explicit permission unit tests**

Append these tests to `server/permissions.test.ts` inside `describe("permissions", ...)`:

```ts
it("keeps schedulers without managed staff read-only for staff writes", () => {
  const scheduler = user({ role: "scheduler", managedStaffIds: [] });

  expect(canManageStaff(scheduler, "staff-a")).toBe(false);
  expect(canManageAllStaff(scheduler, ["staff-a"])).toBe(false);
});

it("does not let staff binding grant edit permission by itself", () => {
  const viewer = user({ role: "viewer", staffId: "staff-a", managedStaffIds: ["staff-a"] });
  const scheduler = user({ role: "scheduler", staffId: "staff-a", managedStaffIds: [] });

  expect(canManageStaff(viewer, "staff-a")).toBe(false);
  expect(canManageStaff(scheduler, "staff-a")).toBe(false);
});
```

- [ ] **Step 2: Run permission unit tests**

Run:

```bash
npm run test -- server/permissions.test.ts
```

Expected: PASS if existing implementation already enforces the intended model.

- [ ] **Step 3: Add route-level test only if needed**

If Step 2 passes and existing `server/routes.test.ts` already has cases for `viewer` write rejection, limited `scheduler` write rejection, and monthly settlement scope rejection, do not add route tests.

If a missing route-level case is found, add this test near the existing schedule-write permission tests in `server/routes.test.ts`:

```ts
it("blocks schedulers with only a staff binding from editing that staff schedule", async () => {
  const app = createTestApp();
  const headers = await createUserAndLogin(app, {
    id: "user-bound-scheduler",
    username: "bound-scheduler",
    displayName: "绑定排班员",
    role: "scheduler",
    staffId: "staff-nurse-001",
    managedStaffIds: []
  });

  await request(app)
    .put("/api/data/schedule-entry")
    .set(headers)
    .send({ date: "2026-06-15", staffId: "staff-nurse-001", shiftIds: ["shift-a1"], note: "" })
    .expect(403, { message: "当前账号没有该人员操作权限" });
});
```

- [ ] **Step 4: Run route tests if Step 3 added a route test**

Run:

```bash
npm run test -- server/routes.test.ts -t "blocks schedulers with only a staff binding from editing that staff schedule"
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

If only `server/permissions.test.ts` changed:

```bash
git add server/permissions.test.ts
git commit -m "Cover finalized permission model"
```

If `server/routes.test.ts` also changed:

```bash
git add server/permissions.test.ts server/routes.test.ts
git commit -m "Cover finalized permission model"
```

## Task 4: Documentation and Documentation Tests

**Files:**
- Modify: `deployment-docs.test.ts`
- Modify: `docs/正式部署运行手册.md`
- Modify: `docs/功能跟进清单.md`
- Modify: `docs/技术方案.md`

- [ ] **Step 1: Write failing deployment documentation assertions**

In `deployment-docs.test.ts`, add these assertions to the runbook test that reads `docs/正式部署运行手册.md`:

```ts
expect(runbook).toContain("系统管理员");
expect(runbook).toContain("排班管理员");
expect(runbook).toContain("只读查看");
expect(runbook).toContain("护士长需要参与排班管理时");
expect(runbook).toContain("绑定人员只用于标识账号本人");
expect(runbook).toContain("可管理人员决定排班和月结可操作范围");
```

- [ ] **Step 2: Run docs test and verify it fails**

Run:

```bash
npm run test -- deployment-docs.test.ts
```

Expected: FAIL if the runbook does not yet contain the exact finalized guidance.

- [ ] **Step 3: Update the runbook account maintenance section**

In `docs/正式部署运行手册.md`, update the account maintenance section around “账号与人员档案绑定” and role descriptions so it includes this text:

```md
绑定人员只用于标识账号本人，不会自动授予排班权限；可管理人员决定排班和月结可操作范围。

推荐配置：

- 系统管理员：使用 `admin` 角色，默认管理全部人员。
- 排班管理员：使用 `scheduler` 角色，并显式选择可管理人员；未选择时只能查看，不能编辑任何人员。
- 只读查看：使用 `viewer` 角色，可以查看全科排班，但不能编辑排班和月结。
- 护士长需要参与排班管理时，账号角色使用 `scheduler`，再按实际管理范围选择可管理人员。
```

- [ ] **Step 4: Update the feature tracking list**

In `docs/功能跟进清单.md`, change `### 2.6 细粒度账号权限` to say the current staff-binding and managed-staff write-scope model is complete, while personal-only visibility and organization models remain future work:

```md
当前已实现账号绑定人员、排班管理员可管理人员名单，以及排班和月结写入范围校验。所有登录账号仍可查看全科排班；个人只看自己排班、科室或小组模型暂不实现，作为后续组织权限模型评估。
```

In `### 3.1 P0：正式化基础能力`, replace the generic fine-grained-role bullet with:

```md
- 目标服务器二次联调，当前阶段覆盖 HTTP + IP、日志轮转、防火墙、安全组和备份恢复流程；HTTPS 证书切换留到后续正式域名阶段。
- 后续更复杂组织权限评估，例如个人只看自己排班、科室、小组或护士长辖区模型。
```

- [ ] **Step 5: Update the technical方案 account permission paragraph**

In `docs/技术方案.md`, update the account permission bullet or paragraph so it includes:

```md
账号权限采用三类角色：系统管理员、排班管理员、只读查看。所有登录账号可以查看全科排班；排班管理员的写入范围由账号的可管理人员名单决定；绑定人员只用于标识账号本人，不自动授予排班权限。
```

- [ ] **Step 6: Run docs tests and verify they pass**

Run:

```bash
npm run test -- deployment-docs.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add deployment-docs.test.ts docs/正式部署运行手册.md docs/功能跟进清单.md docs/技术方案.md
git commit -m "Document finalized permission model"
```

## Task 5: Full Verification

**Files:**
- No direct edits unless verification reveals a failure.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test -- src/App.test.ts src/components/ManagementDrawer.test.ts server/permissions.test.ts deployment-docs.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run type checking**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Check whitespace and final status**

Run:

```bash
git diff --check
git status --short --branch
```

Expected: no whitespace errors. `git status` may show `master...origin/master [ahead N]` and no uncommitted files.

- [ ] **Step 4: Update the execution summary**

Prepare a short summary with:

```md
完成：
- 首页和账号维护页面明确绑定人员不自动授权。
- 账号维护页面补充护士长、排班管理员、只读账号配置说明。
- 权限模型增加回归测试。
- 部署手册、技术方案和功能跟进清单已同步。

验证：
- npm run test -- src/App.test.ts src/components/ManagementDrawer.test.ts server/permissions.test.ts deployment-docs.test.ts
- npm run lint
- git diff --check
```

Do not mark the task complete unless all verification commands pass.

---

## Self-Review

- Spec coverage: The plan covers homepage guidance, account drawer copy, role behavior tests, runbook updates, feature tracking updates, and technical方案 alignment. It explicitly avoids new schema, new roles, personal-only visibility, and nurse-head-specific role logic.
- Placeholder scan: The plan has no placeholder markers. The only conditional step is route-test addition, and it includes exact criteria and code.
- Type consistency: Existing names are used: `admin`, `scheduler`, `viewer`, `staffId`, `managedStaffIds`, `canManageStaff`, `canManageAllStaff`, `mountDrawer`, and `mountApp`.
