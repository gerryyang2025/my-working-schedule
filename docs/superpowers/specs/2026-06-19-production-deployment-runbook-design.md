# 正式部署联调与上线运行手册设计

## 背景

SQLite 存储迁移、备份、恢复和 Linux 维护脚本已经实现。下一步需要把这些能力整理成正式部署闭环，让服务器可以明确完成依赖安装、配置、迁移、生产构建、API 后台运行、Nginx 反向代理、健康检查、备份和恢复。

## 范围

本阶段只做 P0-A：正式部署联调与上线运行手册。

包含：

- 生产配置示例。
- 生产 API 启动脚本。
- systemd 服务示例。
- Nginx 反向代理示例。
- SQLite 备份定时任务示例。
- 正式部署运行手册。
- README、技术方案和功能跟进清单同步。

不包含：

- 正式账号体系。
- 密码哈希、登录会话和角色权限。
- 操作审计日志。
- 自动安装脚本或一键部署脚本。
- HTTPS 证书自动申请。

## 设计

当前后端仍以 TypeScript 源码运行，因此生产 API 启动脚本采用 `node --import tsx server/index.ts`，区别于开发模式的 `server/dev-api-watch.mjs`。前端通过 `npm run build` 生成 `dist`，由 Nginx 直接服务静态文件；API 只监听 `127.0.0.1:3001`，由 Nginx 转发 `/api/`。

SQLite 配置通过 systemd `Environment=` 或 `config/server.local.json` 提供。推荐正式路径为 `/var/lib/my-working-schedule/schedule.db` 和 `/var/backups/my-working-schedule`。

## 验证

新增测试覆盖：

- 生产部署手册必须包含 SQLite、构建、启动、systemd、备份和健康检查命令。
- 生产配置示例必须默认 SQLite，且不能包含真实密码。
- systemd、Nginx 和 cron 示例必须指向生产命令和正式路径。
- `package.json` 必须提供不依赖开发 watcher 的 `start:api` 脚本。
