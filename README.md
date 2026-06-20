# 国际医学部护理排班管理系统

这是一个面向国际医学部护理排班管理的 Web 工具项目。当前阶段重点梳理并实现排班管理能力，包括周视图、周查询、快速填班、打印、全屏展示，以及按周自动统计出勤班次数、加班班次数和总系数。

## 一期能力

- 当前自然周排班表和自然周统计。
- 日期选择和周范围定位。
- 登录页面和基础角色权限。
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
- [正式部署运行手册.md](docs/正式部署运行手册.md)：单机正式部署、systemd、Nginx、备份、恢复和上线检查步骤。
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

当前开发和正式运行时都使用 SQLite。默认本地开发数据库为 `data/schedule.db`，该文件已被 `.gitignore` 忽略；仓库不再保留 JSON 数据文件。需要重置本地验证数据时，停止服务后删除 `data/schedule.db`，再执行 `./optools.sh data init`。

默认管理员账号为 `admin`。管理员初始密码只从服务端配置读取，不再保存在排班数据文件中。优先级如下：

1. `SCHEDULE_ADMIN_PASSWORD` 环境变量
2. `config/server.local.json` 或 `SCHEDULE_CONFIG_PATH` 指定的配置文件

首次部署可复制示例配置：

```bash
cp config/server.example.json config/server.local.json
```

然后编辑 `config/server.local.json` 中的 `adminPassword`，该密码用于登录页面的默认管理员账号：

```json
{
  "host": "0.0.0.0",
  "port": 3001,
  "storageDriver": "sqlite",
  "sqlitePath": "data/schedule.db",
  "backupPath": "backups",
  "adminPassword": "请改成真实密码"
}
```

修改后重启服务生效：

```bash
./optools.sh dev restart
```

默认管理员密码会以哈希形式保存到 `users` 表；每次服务启动都会按当前配置刷新 `admin` 账号密码，便于部署阶段通过配置文件或环境变量统一调整。

## SQLite 存储与正式单机部署

当前版本只保留 SQLite 运行时存储。正式单机部署推荐使用 `/var/lib/my-working-schedule/schedule.db`：

```bash
export SCHEDULE_STORAGE_DRIVER=sqlite
export SCHEDULE_SQLITE_PATH=/var/lib/my-working-schedule/schedule.db
export SCHEDULE_BACKUP_PATH=/var/backups/my-working-schedule
```

SQLite 是嵌入式文件数据库，不需要单独启动数据库 daemon。长期运行的仍然是当前 Web/API 进程；正式环境推荐通过 `optools.sh` 统一封装 systemd、Nginx 和 SQLite 维护操作。

常用数据维护命令推荐使用统一入口：

```bash
./optools.sh data install
./optools.sh data init
./optools.sh data backup
CONFIRM_RESTORE=yes ./optools.sh data restore <backup-file>
./optools.sh data status
./optools.sh data check
```

说明：

- `./optools.sh data init` 初始化或升级 SQLite 库和表结构，不会从 JSON 导入数据。
- `./optools.sh data backup` 会在 `SCHEDULE_BACKUP_PATH` 下生成带时间戳的数据库备份。
- `./optools.sh data check` 会输出完整性和核心表检查结果，`ok: true` 代表检查通过。
- `./optools.sh data install` 是无副作用的运行前检查，会回显 SQLite 路径和备份目录，便于部署联调。

底层 Linux 辅助脚本仍保留，便于单独调试：

```bash
./tools/sqlite-service.sh install
./tools/sqlite-service.sh init
./tools/sqlite-service.sh backup
./tools/sqlite-service.sh restore <backup-file>
./tools/sqlite-service.sh status
./tools/sqlite-service.sh check
```

`./tools/sqlite-service.sh install` 是非写入式预检，不会安装 daemon，也不会创建数据库文件。它会检查 `node`、`npm` 和 `npm run data:preflight` 所需运行时，并解析预检输出中的 JSON，确认 `ok: true` 与 `command: "preflight"` 字段真实存在；`sqlite3` 缺失时只给出告警和手工排查提示，不阻塞使用。

备份方法：

```bash
./optools.sh data status
./optools.sh data check
./optools.sh data backup
```

说明：

- 建议在月结、系统升级、服务器迁移前手动执行一次备份。
- 备份文件会写入 `SCHEDULE_BACKUP_PATH`，默认是 `/var/backups/my-working-schedule`。
- 如果不使用维护脚本，也可以执行 `npm run data:backup`，但仍需提前设置 `SCHEDULE_STORAGE_DRIVER=sqlite`、`SCHEDULE_SQLITE_PATH` 和 `SCHEDULE_BACKUP_PATH`。
- 备份后建议执行 `./optools.sh data status` 查看数据库路径和备份目录是否符合预期。

恢复方法：

```bash
./optools.sh app stop
CONFIRM_RESTORE=yes ./optools.sh data restore <backup-file>
./optools.sh data check
./optools.sh app start
```

说明：

- `<backup-file>` 可以是 `SCHEDULE_BACKUP_PATH` 下的备份文件名，例如 `schedule-2026-06-18-153000.db`；也可以是绝对路径。
- 恢复必须显式设置 `CONFIRM_RESTORE=yes`，避免误操作覆盖当前数据库。
- 恢复前脚本会先对当前数据库做保护性备份，再替换为指定备份文件。
- 恢复后必须执行 `./optools.sh data check`，再启动服务并检查页面数据。

推荐恢复 runbook：

1. 先停止 Web/API 服务。
2. 确认 `SCHEDULE_BACKUP_PATH` 有足够空间保存当前库的保护性备份，同时确认 `SCHEDULE_SQLITE_PATH` 所在文件系统有足够空间放置同目录临时副本。
3. 执行 `CONFIRM_RESTORE=yes ./optools.sh data restore <backup-file>`。
4. 执行 `./optools.sh data check`。
5. 重启 Web/API 服务并验证健康检查或关键页面读写。

## 正式部署

单机正式部署建议使用：

- `./optools.sh deploy` 一键完成初始化、构建、依赖安装、SQLite 表结构初始化/升级、SQLite/Nginx/logrotate 检查、生产服务重启和健康检查等待。
- `./optools.sh build` 构建前端静态资源，并把 API 运行文件安装到 `/opt/my-working-schedule`。
- `npm run start:api` 启动 Express API。
- `deploy/systemd/my-working-schedule.service.example` 管理 API 后台进程。
- `deploy/nginx/my-working-schedule.conf.example` 提供静态资源和 `/api/` 反向代理。
- `./optools.sh nginx install` 安装 nginx、创建 `conf.d`、复制配置并执行 `nginx -t`。
- `./optools.sh app init` 创建服务用户/组、部署目录、systemd service 并启用服务。
- `./optools.sh app doctor` 专项检查 API/systemd 前置条件和服务状态。
- `./optools.sh app start|status|logs` 管理正式 API 服务。
- `./optools.sh doctor` 执行完整生产运行体检，聚合检查 Node、静态资源、SQLite、Nginx、systemd 服务和 API 健康状态。
- `deploy/cron/my-working-schedule-backup.cron.example` 定时备份 SQLite。

推荐部署命令：

```bash
cd /root/github/my-working-schedule
git pull
./optools.sh deploy
```

API 重启后可能需要几秒钟才能响应 `/api/health`。`deploy` 会自动重试健康检查；服务器启动较慢时可临时放宽等待时间：

```bash
OPTOOLS_HEALTH_RETRIES=60 OPTOOLS_HEALTH_RETRY_DELAY=1 ./optools.sh deploy
```

`deploy` 也会自动安装并 dry-run 验证 logrotate 配置，避免后续 `./optools.sh doctor` 因日志轮转未初始化而失败。如果服务器缺少 `logrotate` 系统命令，请先安装系统包后重新执行 `./optools.sh deploy`。

如果 systemd 日志出现 `status=203/EXEC`，通常是 service 中的 `ExecStart` 指向了不存在或服务用户不可执行的 npm。不要把 `/root/.nvm/.../npm` 直接配置给非 root 服务用户；推荐把 Node.js 放到 `/opt/node-v22.22.0` 这类可访问路径。`deploy` 会自动寻找服务用户可执行的 npm；特殊路径可用 `OPTOOLS_NPM_BIN=/custom/node/bin/npm ./optools.sh deploy` 覆盖。

如果 systemd 日志出现 `ENOENT: no such file or directory, open '/opt/my-working-schedule/package.json'`，说明生产工作目录尚未安装 API 运行文件。请在源码目录执行 `./optools.sh deploy`。

如果 systemd 日志出现 `EADDRINUSE: address already in use 127.0.0.1:3001`，说明 API 端口被其他进程占用。先执行 `ss -ltnp | grep ':3001'` 或 `lsof -nP -iTCP:3001 -sTCP:LISTEN` 找到占用者，停止开发 daemon 或手工启动的 API 后，再重新执行 `./optools.sh deploy`。

完整步骤见 [正式部署运行手册.md](docs/正式部署运行手册.md)。

## 本地启停

开发模式可以使用根目录脚本后台管理：

```bash
./optools.sh dev start
./optools.sh dev status
./optools.sh dev logs
./optools.sh dev stop
./optools.sh dev restart
```

脚本会以 daemon 方式启动 `npm run dev`，PID 写入 `tmp/optools/dev.pid`，日志写入 `logs/optools/dev.log`。该脚本仅用于本地开发模式；正式部署使用 `./optools.sh app start|stop|restart|status|logs` 管理 systemd 服务。

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

对外访问会暴露排班管理界面到当前网络，请务必通过 `config/server.local.json` 或 `SCHEDULE_ADMIN_PASSWORD` 设置实际管理员登录密码；公网访问还需要额外配置防火墙、路由或反向代理。

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

E2E 会为 API 服务使用系统临时目录中的独立 SQLite 数据库，不会读写 `data/schedule.db`。
