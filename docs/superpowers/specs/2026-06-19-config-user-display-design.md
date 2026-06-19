# 配置可观测与账号显示优化设计

## 背景

系统已经具备生产部署脚本、SQLite 存储、账号权限和审计日志基础能力。继续做 P0 正式化能力前，先补齐几个会影响部署排障和日常管理的小优化：

1. 运维入口缺少查看当前主要配置和配置路径的命令。
2. 除 `admin` 外的账号添加方式已经存在，但文档说明不够直观。
3. 默认 `admin` 登录后显示为“系统管理员 · 系统管理员”，信息重复。

本阶段目标是用最小改动提升可维护性和可理解性。

## 目标

1. 为 `./optools.sh` 增加 `config` 子命令，用于查看当前主要配置和关键路径。
2. 在正式部署运行手册中说明如何添加 `scheduler` 和 `viewer` 等非 admin 账号。
3. 优化工具栏当前用户显示，避免显示名和角色名重复。
4. 补充必要测试，避免运维入口和 UI 文案回退。

## 非目标

1. 不新增角色类型，仍保持 `admin`、`scheduler`、`viewer` 三类。
2. 不实现账号与人员档案绑定。
3. 不新增命令行创建用户能力，账号维护继续通过 Web 管理页面完成。
4. 不打印管理员密码明文。

## 方案选择

### 方案 A：轻量闭环优化

新增 `optools.sh config` 查询能力，补充账号添加文档，并优化工具栏重复显示逻辑。该方案改动小、收益直接，适合在 P0 正式化收尾前先完成。

### 方案 B：只做最小 UI 和文档修正

只优化“系统管理员 · 系统管理员”显示，并补充账号添加说明。优点是风险最低；缺点是部署排障时仍缺少统一配置查询入口。

### 方案 C：增加账号创建命令行工具

在 `optools.sh` 或独立工具中增加创建账号、重置密码命令。优点是服务器侧操作更强；缺点是会绕开当前 Web 管理入口和交互校验，需要额外审计与安全设计，本阶段不展开。

本阶段采用方案 A。

## 功能设计

### `optools.sh config`

新增命令：

- `./optools.sh config`
- `./optools.sh config show`
- `./optools.sh config paths`
- `./optools.sh config server`

`config` 默认等同于 `config show`。

`config show` 输出运维摘要，包括：

- 应用安装目录。
- 静态文件目录。
- 数据目录。
- 备份目录。
- systemd 服务名和 service 文件。
- Nginx helper 脚本路径。
- SQLite helper 脚本路径。
- API 健康检查地址。

`config paths` 输出更偏路径排障的信息，包括源码目录、安装目录、dist 目录、日志目录、pid 文件、配置文件路径、systemd 文件、工具脚本路径。

`config server` 输出服务端生效配置，优先通过现有 `server/config.ts` 的 `resolveServerConfig()` 获取，字段包括：

- `host`
- `port`
- `storageDriver`
- `storagePath`
- `sqlitePath`
- `backupPath`
- `adminPasswordConfigured`

`adminPasswordConfigured` 只显示布尔值，不显示密码明文。

如果当前环境缺少 Node.js 或配置解析失败，命令应失败并输出明确错误，便于定位配置文件格式、路径或环境变量问题。

### 账号添加说明

在 `docs/正式部署运行手册.md` 中补充“账号维护”小节：

1. 使用 `admin` 登录。
2. 点击右上角“配置”。
3. 进入“账号”tab。
4. 点击“新增账号”。
5. 填写账号、显示名、角色、启用状态和初始密码。
6. 保存后让新用户用初始密码登录，并建议首次登录后修改密码。

角色说明：

- `系统管理员`：可维护配置、账号、审计、排班和月结。
- `排班管理员`：可维护排班和月结，不能维护系统配置和账号。
- `只读查看`：只能查看排班、统计和月结信息。

### 当前用户显示优化

工具栏继续显示“用户身份”信息，但避免重复：

- 如果 `displayName` 与角色标签不同，显示：`显示名 · 角色名`。
- 如果 `displayName` 与角色标签相同，显示：`username · 角色名`。

默认 `admin` 因此显示为：`admin · 系统管理员`。

普通账号示例：

- `排班管理员 · 排班管理员` 会显示为 `scheduler · 排班管理员`。
- `张护士 · 排班管理员` 仍显示为 `张护士 · 排班管理员`。

## 测试设计

1. `optools.test.ts`
   - 覆盖 `config` 默认等同于 `config show`。
   - 覆盖 `config paths` 输出关键路径。
   - 覆盖 `config server` 输出配置摘要且不包含管理员密码明文。
   - 覆盖未知 config 子命令会失败并显示帮助。

2. `src/components/AppToolbar.test.ts`
   - 覆盖显示名与角色名不同时使用 `displayName · roleLabel`。
   - 覆盖显示名与角色名相同时使用 `username · roleLabel`。

3. 文档测试保持通过。

验收命令：

```bash
npm run test -- optools.test.ts src/components/AppToolbar.test.ts
npm run test
```

## 验收标准

1. `./optools.sh help` 展示 `config` 相关命令。
2. `./optools.sh config` 能输出当前运维摘要。
3. `./optools.sh config paths` 能输出关键路径。
4. `./optools.sh config server` 能输出服务端配置摘要，但不泄露管理员密码。
5. `admin` 登录后不再显示“系统管理员 · 系统管理员”。
6. 正式部署运行手册清楚说明非 admin 账号添加方式和角色差异。
