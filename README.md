# 国际医学部护理排班管理系统

这是一个面向国际医学部护理排班管理的 Web 工具项目。当前阶段重点梳理并实现排班管理能力，包括周视图、周查询、快速填班、打印、全屏展示，以及按周自动统计出勤班次数、加班班次数和总系数。

## 一期能力

- 当前自然周排班表和自然周统计。
- 日期选择和周范围定位。
- 管理密码进入编辑模式。
- 人员、班次、节假日维护。
- 班次画笔快速填班。
- 单元格弹窗支持每天最多两个班次。
- 周统计自动计算出勤班次数、加班班次数和总系数。
- 护士长绩效系数标注为单独核算。
- 月排班表和周统计表打印。

## 当前文档

- [产品需求.md](docs/产品需求.md)：总体需求说明，已标注一期范围与后续扩展。
- [功能跟进清单.md](docs/功能跟进清单.md)：统一记录已完成功能、部分完成能力和后续待实现事项。
- [技术方案.md](docs/技术方案.md)：一期技术方案与后续正式架构演进。
- [正式环境存储优化方案.md](docs/正式环境存储优化方案.md)：正式环境 SQLite 存储、迁移、备份和恢复建议。
- [方案细节.md](docs/方案细节.md)：一期落地细节与执行计划对齐说明。
- [风格样式.md](docs/风格样式.md)：Web 界面风格建议，已标注一期采用 Element Plus。
- [一期设计规格](docs/superpowers/specs/2026-06-15-nursing-schedule-design.md)：已确认的一期设计范围与规则。
- [一期实现计划](docs/superpowers/plans/2026-06-16-nursing-schedule-implementation.md)：按任务拆分的实现步骤与验证命令。

## Git 约定

- `.gitignore` 忽略本地系统文件、依赖目录、构建产物、日志、环境文件和本地需求附件。
- `.gitattributes` 统一文本文件换行，并将常见二进制文件标记为 binary。

## 本地开发

```bash
npm install
npm run dev
```

默认前端开发服务监听 `0.0.0.0:5173`，API 监听 `0.0.0.0:3001`，同一局域网内可通过本机真实 IP 访问，例如 `http://192.168.x.x:5173`。如需仅本机访问，可使用 `HOST=127.0.0.1 WEB_HOST=127.0.0.1 npm run dev`。

开发服务默认把运行时排班数据写入 `data/app-data.local.json`，该文件已被 `.gitignore` 忽略；`data/app-data.json` 只作为仓库种子数据保留。需要重置本地验证数据时，删除 `data/app-data.local.json` 后重新启动服务即可。也可以通过 `SCHEDULE_DATA_PATH` 指定其他数据文件。

管理员密码只从服务端配置读取，不再保存在排班数据文件中。优先级如下：

1. `SCHEDULE_ADMIN_PASSWORD` 环境变量
2. `config/server.local.json` 或 `SCHEDULE_CONFIG_PATH` 指定的配置文件

首次部署可复制示例配置：

```bash
cp config/server.example.json config/server.local.json
```

然后编辑 `config/server.local.json` 中的 `adminPassword`：

```json
{
  "host": "0.0.0.0",
  "port": 3001,
  "storagePath": "data/app-data.local.json",
  "adminPassword": "请改成真实密码"
}
```

修改后重启服务生效：

```bash
./optools.sh dev restart
```

## SQLite 存储与正式单机部署

开发环境默认继续使用 JSON 文件存储，便于本地调试和快速重置数据。正式单机部署可切换到 SQLite 文件数据库：

```bash
export SCHEDULE_STORAGE_DRIVER=sqlite
export SCHEDULE_SQLITE_PATH=/var/lib/my-working-schedule/schedule.db
export SCHEDULE_BACKUP_PATH=/var/backups/my-working-schedule
```

SQLite 是嵌入式文件数据库，不需要单独启动数据库 daemon。长期运行的仍然是当前 Web/API 进程；该进程由 `optools`、systemd 或后续正式部署脚本单独管理。

常用数据维护命令：

```bash
npm run data:preflight
npm run data:init:sqlite
SCHEDULE_DATA_PATH=data/app-data.local.json npm run data:migrate:sqlite
npm run data:export:json
npm run data:backup
CONFIRM_RESTORE=yes npm run data:restore -- <backup-file>
npm run data:check:sqlite
```

说明：

- `npm run data:init:sqlite` 只初始化 SQLite 库和表结构，不会自动从 JSON 导入数据。
- `npm run data:migrate:sqlite` 用当前 JSON 业务数据迁移到 SQLite；如目标库已存在，可按需要追加 `-- --overwrite`。
- `npm run data:export:json` 用于导出当前 SQLite 数据，便于人工检查或留存可读副本。
- `npm run data:backup` 会在 `SCHEDULE_BACKUP_PATH` 下生成带时间戳的数据库备份。
- `npm run data:check:sqlite` 会输出完整性和核心表检查结果，`ok: true` 代表检查通过。
- `npm run data:preflight` 是无副作用的运行前检查，会回显 JSON 路径、SQLite 路径和备份目录，便于部署联调。

Linux 辅助脚本：

```bash
./tools/sqlite-service.sh install
./tools/sqlite-service.sh init
./tools/sqlite-service.sh migrate
./tools/sqlite-service.sh backup
./tools/sqlite-service.sh restore <backup-file>
./tools/sqlite-service.sh status
./tools/sqlite-service.sh check
```

`./tools/sqlite-service.sh install` 是非写入式预检，不会安装 daemon，也不会创建数据库文件。它会检查 `node`、`npm` 和 `npm run data:preflight` 所需运行时，并解析预检输出中的 JSON，确认 `ok: true` 与 `command: "preflight"` 字段真实存在；`sqlite3` 缺失时只给出告警和手工排查提示，不阻塞使用。

推荐恢复 runbook：

1. 先停止 Web/API 服务。
2. 确认 `SCHEDULE_BACKUP_PATH` 有足够空间保存当前库的保护性备份，同时确认 `SCHEDULE_SQLITE_PATH` 所在文件系统有足够空间放置同目录临时副本。
3. 执行 `CONFIRM_RESTORE=yes ./tools/sqlite-service.sh restore <backup-file>`。
4. 执行 `./tools/sqlite-service.sh check`。
5. 重启 Web/API 服务并验证健康检查或关键页面读写。

## 本地启停

开发模式可以使用根目录脚本后台管理：

```bash
./optools.sh dev start
./optools.sh dev status
./optools.sh dev logs
./optools.sh dev stop
./optools.sh dev restart
```

脚本会以 daemon 方式启动 `npm run dev`，PID 写入 `tmp/optools/dev.pid`，日志写入 `logs/optools/dev.log`。该脚本仅用于本地开发模式；正式部署启停后续单独实现。

开发 daemon 默认对外监听。启动后可通过状态命令查看当前机器对外访问地址：

```bash
./optools.sh dev start
./optools.sh dev status
```

如自动检测的局域网 IP 不符合预期，可手动指定：

```bash
PUBLIC_HOST=192.168.x.x ./optools.sh dev start
```

如果启动提示缺少 `concurrently`、`vite`、`tsx` 或 `html2canvas`、`jspdf` 等依赖，说明当前环境没有安装完整依赖，请先执行 `npm ci --include=dev` 或 `npm install --include=dev`。

对外访问会暴露排班管理界面到当前网络，请务必通过 `config/server.local.json` 或 `SCHEDULE_ADMIN_PASSWORD` 设置实际管理密码；公网访问还需要额外配置防火墙、路由或反向代理。

## 验证命令

当前完整验证命令如下：

```bash
npm run test
npm run build
npm run test:e2e
```

首次运行 E2E 如提示缺少浏览器，请执行：

```bash
npx playwright install chromium
```

E2E 会为 API 服务使用系统临时目录中的独立数据文件，不会读写 `data/app-data.local.json`。
