# SQLite 存储迁移与备份设计

## 文档状态

本文定义 P0 第一阶段正式化能力：SQLite 存储迁移与备份。目标是在不改变现有前端页面和业务 API 的前提下，将当前开发期 JSON 文件存储平滑升级为可用于正式环境的 SQLite 存储，并保证已经写入 `data/app-data.local.json` 的真实用户数据可以完整迁移、校验和回滚。

本阶段不实现正式账号体系、不实现审计日志、不实现 PostgreSQL、不调整排班、统计、奖金和月结规则。

## 目标

- 保留现有 JSON 存储作为开发模式和回退方案。
- 新增 SQLite 存储实现，满足正式单机部署的事务和持久化需求。
- 支持通过配置选择 `json` 或 `sqlite` 存储驱动。
- 提供 JSON 到 SQLite 的迁移命令。
- 提供 SQLite 到 JSON 的导出命令。
- 提供 SQLite 手动备份命令。
- 在根目录新增 `tools/`，提供 Linux 下 SQLite 安装、初始化、迁移、备份、恢复和检查维护入口。
- 迁移和备份过程有明确的错误处理、校验报告和回滚路径。
- 当前所有 API、前端调用和业务规则保持兼容。

## 非目标

- 不新增账号登录、角色权限和密码哈希。
- 不新增审计日志表写入逻辑。
- 不做 PostgreSQL 或远程数据库适配。
- 不把 SQLite 包装成常驻数据库 daemon。SQLite 是嵌入式文件数据库，正式环境需要 systemd 管理的是当前 Web/API 应用，不是 SQLite 本身。
- 不做 UI 页面改造。
- 不修改月结、奖金分配、周统计和月统计算法。
- 不自动删除原 JSON 数据文件。

## 配置设计

新增服务端配置字段：

```json
{
  "storageDriver": "json",
  "storagePath": "data/app-data.local.json",
  "sqlitePath": "data/schedule.db",
  "backupPath": "backups"
}
```

环境变量优先级高于配置文件：

- `SCHEDULE_STORAGE_DRIVER`：`json` 或 `sqlite`，默认 `json`。
- `SCHEDULE_DATA_PATH`：JSON 数据路径，沿用现有配置。
- `SCHEDULE_SQLITE_PATH`：SQLite 数据库路径，默认 `data/schedule.db`。
- `SCHEDULE_BACKUP_PATH`：备份目录，默认 `backups`。

兼容要求：

- 未配置 `storageDriver` 时，系统继续使用现有 JSON 存储。
- 配置 `storageDriver=sqlite` 时，API 使用 SQLite 存储。
- 现有 `storagePath` 继续只表示 JSON 文件路径，不复用为 SQLite 数据库路径。
- `adminPassword` 仍来自环境变量或配置文件，不在本阶段迁入 SQLite。

## 存储接口设计

继续保留现有 `StorageAdapter`：

```ts
interface StorageAdapter {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
  update(mutator: (current: AppData) => AppData | Promise<AppData>): Promise<AppData>;
}
```

新增存储工厂：

- `createJsonStorage(path)`：现有 JSON 实现。
- `createSqliteStorage(path)`：新增 SQLite 实现。
- `createConfiguredStorage(config)`：根据配置返回 JSON 或 SQLite adapter。

SQLite adapter 对外仍读写完整 `AppData`，以保持现有路由层不变。内部负责把表结构映射成 `AppData`。

第一阶段允许 SQLite adapter 的 `save(data)` 采用“事务内整体替换业务表”的方式实现，用于兼容当前路由的全量数据更新模型。后续账号和审计阶段再逐步演进为更细粒度的 repository 接口。

## SQLite 数据模型

第一阶段表结构覆盖当前 `AppData`：

| 表名 | 说明 |
| --- | --- |
| `staff` | 人员资料 |
| `shifts` | 班次配置 |
| `holidays` | 节假日配置 |
| `schedule_entries` | 排班记录主表 |
| `schedule_entry_shifts` | 排班记录中的班次顺序明细 |
| `monthly_settlements` | 月结主表 |
| `monthly_settlement_rows` | 月结人员快照 |
| `app_settings` | 系统设置 |
| `schema_migrations` | 数据库迁移版本 |

本阶段暂不创建 `users` 和 `audit_logs`，但表结构命名和数据库路径为后续账号与审计留出空间。

关键约束：

- `staff.id` 主键。
- `staff.job_id` 唯一。
- `shifts.id` 主键。
- `holidays.id` 主键。
- `holidays.date` 唯一。
- `schedule_entries.id` 主键。
- `schedule_entries(date, staff_id)` 唯一。
- `schedule_entry_shifts(entry_id, position)` 唯一。
- `monthly_settlements.month` 唯一。
- `monthly_settlement_rows(settlement_id, staff_id)` 唯一。

外键建议开启，避免孤儿数据：

- 排班记录引用人员。
- 排班班次明细引用排班记录和班次。
- 月结明细引用月结主表。

为了保留历史排班，人员和班次停用只更新 `enabled`，不删除历史记录。

## 迁移命令

新增脚本命令：

```bash
npm run data:migrate:sqlite
npm run data:export:json
npm run data:backup
```

同时在根目录新增 Linux 运维工具目录：

```text
tools/
  sqlite-service.sh
  README.md
```

`tools/sqlite-service.sh` 是当前系统的 SQLite 数据库文件维护入口，不是 SQLite 后台服务进程。脚本面向 Linux 部署环境，封装安装检查、目录准备、迁移、备份、恢复和健康检查。

建议命令：

```bash
./tools/sqlite-service.sh install
./tools/sqlite-service.sh init
./tools/sqlite-service.sh migrate
./tools/sqlite-service.sh backup
./tools/sqlite-service.sh restore <backup-file>
./tools/sqlite-service.sh status
./tools/sqlite-service.sh check
```

命令职责：

| 命令 | 职责 |
| --- | --- |
| `install` | 执行非写入式预检，检查 `sqlite3`、`node`、`npm` 以及当前 `npm run data:*` 所需的本地 npm 依赖（至少 `node_modules/.bin/tsx`）可用性；如缺失则给出安装提示，并输出状态 |
| `init` | 初始化 SQLite 数据库文件和基础表结构；不从 JSON 隐式迁移数据 |
| `migrate` | 调用 JSON 到 SQLite 迁移能力，并输出迁移校验报告 |
| `backup` | 调用 SQLite 备份能力，生成带时间戳的备份文件 |
| `restore <backup-file>` | 从指定备份文件恢复 SQLite 数据库，恢复前必须先备份当前数据库 |
| `status` | 显示 SQLite 数据库路径、是否存在、文件大小、更新时间、备份目录和当前配置 |
| `check` | 执行 SQLite `integrity_check`，并检查核心业务表是否存在 |

默认 Linux 正式路径建议：

```text
数据库文件：/var/lib/my-working-schedule/schedule.db
备份目录：/var/backups/my-working-schedule
```

脚本应允许通过环境变量覆盖路径：

- `SCHEDULE_SQLITE_PATH`
- `SCHEDULE_BACKUP_PATH`
- `SCHEDULE_DATA_PATH`

权限要求：

- 数据库文件和备份目录应由运行 Web/API 服务的 Linux 用户可读写。
- `install` 可以只给出 `sudo apt install sqlite3` 提示，不应在未确认的情况下自动执行提权安装。
- `restore` 属于高风险操作，必须要求显式确认，且恢复前自动创建当前数据库备份。

`tools/README.md` 需要说明：

- SQLite 没有独立后台服务。
- `sqlite-service.sh` 管理的是当前系统使用的 SQLite 数据库文件。
- 正式 Web/API 应用的进程管理应由后续正式部署脚本或 systemd unit 负责。

### `data:migrate:sqlite`

职责：

1. 读取配置，定位 JSON 源文件和 SQLite 目标文件。
2. 备份源 JSON 文件。
3. 使用现有数据校验与兼容补齐逻辑读取 JSON。
4. 创建或升级 SQLite 表结构。
5. 在单个事务中导入全部业务数据。
6. 输出迁移校验报告。

默认源文件：

- 优先读取 `SCHEDULE_DATA_PATH`。
- 其次读取配置文件 `storagePath`。
- 最后使用 `data/app-data.local.json`。

默认目标文件：

- 优先读取 `SCHEDULE_SQLITE_PATH`。
- 其次读取配置文件 `sqlitePath`。
- 最后使用 `data/schedule.db`。

迁移脚本不能把仓库种子数据 `data/app-data.json` 当作默认正式源，除非用户显式指定。

### `data:export:json`

职责：

1. 从 SQLite 读取完整 `AppData`。
2. 写出 JSON 文件。
3. 输出导出报告。

默认导出文件建议为：

```text
exports/app-data-YYYYMMDD-HHmmss.json
```

该命令用于人工检查、备份和未来跨版本迁移。

### `data:backup`

职责：

1. 读取 SQLite 数据库路径。
2. 创建备份目录。
3. 生成带时间戳的数据库备份文件。
4. 输出备份路径。

如果 SQLite 使用 WAL 模式，备份命令必须使用 SQLite 备份 API 或先执行 checkpoint，不能只复制主 `.db` 文件。

第一阶段可以先不默认启用 WAL，以降低备份复杂度。

## 迁移校验报告

迁移完成后输出结构化报告，至少包含：

| 数据类型 | 校验 |
| --- | --- |
| 人员 | JSON `staff.length` 等于 SQLite `staff` 行数 |
| 班次 | JSON `shifts.length` 等于 SQLite `shifts` 行数 |
| 节假日 | JSON `holidays.length` 等于 SQLite `holidays` 行数 |
| 排班记录 | JSON `scheduleEntries.length` 等于 SQLite `schedule_entries` 行数 |
| 排班班次明细 | JSON 全部 `shiftIds` 数量等于 SQLite `schedule_entry_shifts` 行数 |
| 月结主表 | JSON `monthlySettlements.length` 等于 SQLite `monthly_settlements` 行数 |
| 月结明细 | JSON 全部月结 `rows` 数量等于 SQLite `monthly_settlement_rows` 行数 |
| 系统设置 | `defaultRequiredShiftsPerWeek` 和 `version` 一致 |

校验报告结论分为：

- `ok: true`：可以切换到 SQLite。
- `ok: false`：迁移失败，不应启用 SQLite。

失败时报告具体差异，例如 `schedule_entry_shifts expected 120 actual 118`。

## 数据兼容

迁移脚本必须复用或等价实现当前 JSON 存储的兼容补齐逻辑：

- 缺少 `monthlySettlements` 时补为空数组。
- 旧月结明细缺少 `staffJobId` 时补为空字符串。
- 旧月结明细缺少 `overtimeShifts` 时补 `0`。

迁移完成后，从 SQLite 读取出的 `AppData` 必须通过现有领域类型校验，并与 JSON 读取后的规范化结果等价。

## 错误处理与回滚

迁移前：

- 如果 JSON 源文件不存在，迁移失败并提示源文件路径。
- 如果 JSON 结构不正确，迁移失败，不创建或不覆盖正式 SQLite 文件。
- 如果 SQLite 目标文件已存在，默认拒绝覆盖，除非显式传入覆盖参数。

迁移中：

- 所有导入写入在一个事务中完成。
- 任一步失败则回滚事务。
- 不删除源 JSON 文件。

迁移后：

- 校验失败时标记迁移失败。
- 保留迁移前 JSON 备份。
- 服务配置仍可切回 JSON。

## 服务启动行为

服务启动时：

- `storageDriver=json`：行为与当前一致。
- `storageDriver=sqlite`：如果 SQLite 文件不存在，启动失败并提示先执行迁移或初始化命令。
- SQLite 启动成功后，所有现有 `/api/data` 读写接口行为保持一致。

不在本阶段提供“SQLite 文件不存在时自动从 JSON 迁移”的隐式行为。正式数据迁移必须由显式命令触发，避免误把种子数据或空数据写入正式库。

## 测试计划

### 单元测试

- 配置解析测试：`storageDriver`、`sqlitePath`、`backupPath` 和环境变量优先级。
- SQLite schema 测试：新库初始化后表结构可用。
- SQLite adapter 测试：`load`、`save`、`update` 与 JSON adapter 行为一致。
- 迁移测试：从包含人员、班次、节假日、排班、月结的数据 JSON 导入 SQLite。
- 导出测试：SQLite 导出 JSON 后可通过现有 `AppData` 校验。
- 备份测试：备份文件存在且可打开读取。

### API 测试

现有路由测试在 JSON 和 SQLite 两种存储下都应通过，至少覆盖：

- 保存人员。
- 保存班次。
- 保存节假日。
- 保存排班。
- 确认月结。
- 取消月结。
- 已月结月份禁止修改排班。

### 验收测试

- 使用当前 `data/app-data.local.json` 执行迁移，报告成功。
- 切换到 `storageDriver=sqlite` 后启动服务。
- 页面能读取同样的人员、班次、节假日、排班和月结数据。
- 修改一条排班后重启服务，数据仍存在。
- 备份命令生成可恢复的数据库文件。
- `./tools/sqlite-service.sh status` 能显示当前 SQLite 路径、状态和备份目录。
- `./tools/sqlite-service.sh check` 能对 SQLite 数据库执行完整性检查并通过。
- `./tools/sqlite-service.sh restore <backup-file>` 能在测试数据库上恢复备份，并保留恢复前备份。

## 文档更新

实现阶段需要同步更新：

- `README.md`：新增 SQLite 配置、迁移、备份命令。
- `docs/正式环境存储优化方案.md`：根据实际命令和路径修订。
- `docs/功能跟进清单.md`：将 SQLite 存储迁移与备份状态更新为已完成或部分完成。
- `tools/README.md`：说明 Linux 下 SQLite 数据库文件维护脚本的使用方式。

## 后续衔接

SQLite 存储完成后，下一阶段再实现：

1. 正式账号体系。
2. 审计日志。
3. 正式部署脚本。

账号和审计应直接基于 SQLite 实现，不再扩展 JSON 存储。
