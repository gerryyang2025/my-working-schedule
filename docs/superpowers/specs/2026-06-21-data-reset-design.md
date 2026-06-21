# 一键初始化数据设计

日期：2026-06-21

## 背景

系统已经切换为 SQLite 单一存储方案，并逐步补齐正式部署、账号权限、审计日志、人员维护、排班效率工具和月结能力。实际使用中，管理员可能需要在测试录入后快速清空业务数据，重新开始正式录入。现有 `data init` 只负责初始化或升级表结构，`data restore` 只负责恢复备份，都不适合表达“清空当前业务数据并重新录入”的操作意图。

## 目标

新增一个安全、明确、可审计的“一键初始化”运维入口，方便管理员重新录入排班数据。

核心命令为：

```bash
CONFIRM_RESET=yes ./optools.sh data reset
```

该命令默认采用保守范围：清空业务运行数据，保留基础配置和账号体系。

## 非目标

- 不提供 Web 页面上的一键清库按钮，避免普通页面操作误触发高风险动作。
- 不重置 Node、Nginx、systemd、logrotate、firewall 等部署环境。
- 不删除 SQLite 数据库文件本身，不通过删除文件绕过 schema 初始化和备份流程。
- 不恢复 JSON 存储或 JSON 迁移方案。

## 重置范围

`data reset` 清空以下运行数据：

- 排班记录：`schedule_entries`、`schedule_entry_shifts`
- 月结快照和奖金结果：`monthly_settlements`、`monthly_settlement_rows`
- 登录会话：`user_sessions`
- 审计日志：`audit_logs`

`data reset` 保留以下基础数据：

- 人员档案：`staff`
- 班次配置：`shifts`
- 节假日配置：`holidays`
- 系统配置：`app_settings`
- 账号、角色、绑定人员和可管理人员范围：`users`、`user_managed_staff`
- schema 迁移记录：`schema_migrations`

保留账号体系的原因是：重新录入排班时通常仍希望沿用正式账号、权限、人员绑定和管理范围；如果管理员确实需要重建全部账号，应通过备份恢复或后续单独的全库重建命令处理。

## 安全机制

`data reset` 是高风险操作，必须满足以下保护条件：

1. 自动备份：执行清空前先生成 SQLite 备份，备份路径复用现有 `SCHEDULE_BACKUP_PATH` 或 `/var/backups/my-working-schedule`。
2. 显式确认：未设置 `CONFIRM_RESET=yes` 时拒绝执行，并输出风险提示。
3. 事务执行：清空操作在 SQLite transaction 中完成，要么全部成功，要么全部回滚。
4. 外键完整性：执行后运行 `pragma foreign_key_check` 和现有 `data check`，确认数据库结构和引用完整。
5. 保留管理员：不删除 `users`，因此默认 `admin` 和其他账号仍可登录。
6. 清空会话：删除 `user_sessions` 后，已登录浏览器需要重新登录，避免旧会话拿着重置前状态继续操作。

## 命令入口

新增命令：

```bash
./optools.sh data reset
```

未确认时输出：

```text
Reset is a high-risk operation. Set CONFIRM_RESET=yes to continue.
```

确认执行时输出至少包含：

- 重置前自动生成的备份文件路径
- SQLite 数据库路径
- 已清空的表名或数据类别
- `data check` 的结果
- 需要重新登录的提示

底层 `tools/sqlite-service.sh` 同步支持：

```bash
./tools/sqlite-service.sh reset
```

Node 维护入口同步支持：

```bash
npm run data:reset
```

或：

```bash
node --import tsx server/data-cli.ts reset
```

## 数据流

1. `optools.sh data reset` 转发到 `tools/sqlite-service.sh reset`。
2. helper 检查目录、Node/npm、SQLite 维护入口。
3. helper 检查 `CONFIRM_RESET=yes`。
4. `server/data-cli.ts reset` 解析当前服务配置，定位 SQLite 和备份目录。
5. 维护模块打开 SQLite 数据库并校验 schema。
6. 自动调用现有备份能力生成备份。
7. 在事务中删除运行数据表内容。
8. 重新校验数据库完整性。
9. 输出 JSON 或可读文本结果。

## 错误处理

- SQLite 文件不存在：失败并提示先执行 `./optools.sh data init` 或 `./optools.sh deploy`。
- schema 不完整：失败并提示先执行 `./optools.sh data init` 升级结构。
- 自动备份失败：停止重置，不清空任何数据。
- 清空事务失败：自动回滚，保留原始数据，并保留已生成备份。
- 校验失败：命令返回非零状态，并提示从自动备份恢复。

## 测试策略

覆盖以下测试：

- `server/sqlite-maintenance.test.ts`
  - 未确认时拒绝 reset。
  - reset 前自动生成备份。
  - reset 清空排班、月结、会话、审计。
  - reset 保留人员、班次、节假日、系统配置、账号和账号管理范围。
  - reset 后 `checkSqliteDatabase` 通过。
- `tools/sqlite-service.test.ts`
  - help 中包含 reset。
  - 未设置 `CONFIRM_RESET=yes` 时失败。
  - 设置确认变量后会转发到 `data:reset`。
- `optools.test.ts`
  - `./optools.sh data reset` 会转发到底层 SQLite helper。
  - help 中显示一键初始化命令。

## 文档更新

更新以下文档：

- `docs/正式部署运行手册.md`：新增“一键初始化/重新录入数据”章节。
- `docs/SQLite常用命令.md`：补充 reset 前后检查常用 SQL。
- `docs/功能跟进清单.md`：记录“一键初始化数据”能力状态。

## 验收步骤

1. 执行 `./optools.sh data backup`，确认可生成备份。
2. 录入一条排班，创建一个月结快照，确认审计日志有记录。
3. 执行 `./optools.sh data reset`，确认因缺少 `CONFIRM_RESET=yes` 被拒绝。
4. 执行 `CONFIRM_RESET=yes ./optools.sh data reset`。
5. 执行 `./optools.sh data check`，确认通过。
6. 重新登录系统。
7. 确认人员、班次、节假日、账号仍存在。
8. 确认排班、月结、审计记录已经清空。
9. 如需回滚，执行 `CONFIRM_RESTORE=yes ./optools.sh data restore <自动备份文件>`。
