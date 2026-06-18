# 一键部署入口设计

## 背景

当前正式部署已经具备 SQLite、systemd、Nginx、备份恢复和生产运行手册，但实际服务器操作仍需要在源码目录和 `/opt/my-working-schedule` 之间切换：先构建安装运行文件，再进入 `/opt` 安装依赖，随后回到源码目录初始化或重启服务。这种流程容易漏步骤，也不利于后续多人维护。

本设计选择方案 A：在根目录 `optools.sh` 中新增统一部署入口 `deploy`，让操作者始终停留在源码目录，通过一个命令完成生产部署闭环。

## 目标

- 提供 `./optools.sh deploy` 作为推荐正式部署入口。
- 部署过程不要求用户手动 `cd /opt/my-working-schedule`。
- 复用现有 `build`、`app init`、`data`、`nginx`、`app` 检查能力，避免新增独立脚本体系。
- 保持源码目录和生产运行目录分离：源码目录用于拉代码和执行部署，`/opt/my-working-schedule` 用于 systemd 工作目录和 Nginx 静态资源。
- 默认不覆盖用户的本地生产配置，不复制 `config/server.local.json`。

## 使用方式

推荐服务器操作流程：

```bash
cd /root/github/my-working-schedule
git pull
./optools.sh deploy
```

`deploy` 会自动寻找 systemd 服务用户可执行的 npm。只有在自动识别失败、且服务器存在特殊 Node.js 安装路径时，才需要使用高级覆盖参数：

```bash
OPTOOLS_NPM_BIN=/custom/node/bin/npm ./optools.sh deploy
```

## 命令行为

`./optools.sh deploy` 按顺序执行：

1. 自动解析 npm 可执行文件，并确认 systemd 服务用户可运行该 npm。
2. 执行 `app init`，初始化用户、目录、systemd service，并写入正确的 `ExecStart` 与 `Environment=PATH=...`。
3. 执行 `build`，构建前端并安装生产运行文件到 `/opt/my-working-schedule`。
4. 使用 `npm --prefix "$INSTALL_DIR" ci --include=dev` 在生产运行目录安装依赖，不切换 shell 工作目录。
5. 执行 `data status` 和 `data check`，确认 SQLite 配置与数据库健康状态。
6. 执行 `nginx test`，确认当前 Nginx 配置可用；是否自动安装或重载 Nginx 暂不作为默认动作。
7. 执行 `app stop`，停止当前 systemd 管理的生产 API 服务。
8. 检查 API 端口是否仍被占用，默认检查 `3001`。如果停止 systemd 后仍存在监听进程，说明可能有开发 daemon、手工启动的 `npm run start:api` 或其他服务占用端口，部署应停止并打印占用信息。
9. 执行 `app start`，启动生产 API 服务。
10. 执行 `app doctor` 和 `app health`，输出最终检查结果。

## 错误处理

部署流程采用 fail-fast 策略：任一步失败即停止，并保留上一步输出。这样可以避免在构建、依赖或数据库检查失败时继续重启服务。

关键错误提示需要明确给出下一步：

- npm 不可执行或服务用户无法执行：提示把 Node.js 安装或复制到 `/opt/node-v22.22.0`、`/opt/node`、`/usr/local/bin` 这类服务用户可访问路径，然后重新运行 `./optools.sh deploy`。
- `/opt/my-working-schedule/package.json` 缺失：由 `build` 负责修复；`app doctor` 会提前检查并报错。
- 依赖安装失败：提示保留在源码目录，重新执行 `./optools.sh deploy`，不要求手动进入 `/opt`。
- API 端口被占用：提示使用 `ss -ltnp | grep ':3001'` 或 `lsof -nP -iTCP:3001 -sTCP:LISTEN` 查看占用者，先停止开发 daemon 或手工启动的 API，再重新执行 `./optools.sh deploy`。
- Nginx 不存在或配置目录缺失：提示先执行 `./optools.sh nginx install`，或后续使用显式参数扩展自动安装能力。

## 不纳入本阶段

- 不做 release tar 包。
- 不把 `/opt/my-working-schedule` 改成 Git 工作目录。
- 不自动执行 `git pull`，避免脚本修改用户工作区或覆盖未提交代码。
- 不自动覆盖 `config/server.local.json`。
- 不默认执行 `nginx install` 或 `nginx reload`，避免在已有 Nginx 配置的服务器上产生非预期变更。
- 不引入 HTTPS 证书申请。

## npm 自动识别策略

`resolve_npm_bin` 调整为“自动优先，手工兜底”：

1. 如果用户显式设置 `OPTOOLS_NPM_BIN`，优先使用该路径，并验证它存在、可执行、服务用户可运行。
2. 检查 `command -v npm` 返回的 npm；如果服务用户可运行，则使用它。
3. 检查常见服务可访问路径，例如 `/opt/node-v22.22.0/bin/npm`、`/opt/node/bin/npm`、`/usr/local/bin/npm`、`/usr/bin/npm`。
4. 如果检测到的 npm 位于 `/root/.nvm` 且服务用户不可执行，不直接失败；继续搜索 `/opt` 和系统路径。
5. 如果全部失败，输出明确修复建议：把 Node.js 复制或安装到 `/opt/node-v22.22.0`，修正权限后重新执行 `./optools.sh deploy`。

该策略也应用于 `./optools.sh app init`，避免一键部署和单独初始化的行为不一致。

## API 端口防护

`deploy` 在启动生产服务前会先执行 `app stop`，然后检查 API 端口。默认端口来自 `PORT`，未设置时为 `3001`。检查命令优先使用 `ss`，其次使用 `lsof`，最后尝试 `netstat`。

如果停止 systemd 服务后仍有监听进程，脚本应返回非零状态并打印诊断信息，不继续执行 `app start`。这可以避免 `EADDRINUSE: address already in use 127.0.0.1:3001` 导致 systemd 反复失败重启。

## 文档更新

README 和正式部署运行手册需要把推荐流程改成：

```bash
cd /root/github/my-working-schedule
git pull
./optools.sh deploy
```

手册中保留 `OPTOOLS_NPM_BIN=/custom/node/bin/npm ./optools.sh deploy` 作为特殊路径排障参考，但主流程应以无需额外环境变量的 `./optools.sh deploy` 为准。

## 测试计划

新增或更新 `optools.test.ts`：

- `help` 输出包含 `./optools.sh deploy`。
- `deploy` 会按预期顺序调用 app init、build、依赖安装、data status/check、nginx test、app stop、端口检查、app start、app doctor、app health。
- 依赖安装使用 `npm --prefix "$INSTALL_DIR" ci --include=dev`，不需要切换目录。
- npm 自动识别会跳过服务用户不可执行的 `/root/.nvm` 路径，并选择 `/opt/node-v22.22.0/bin/npm` 这类可执行候选。
- API 端口占用时，`deploy` 返回非零状态并且不会启动 systemd 服务。
- 当依赖安装失败时，`deploy` 返回非零并停止后续重启服务。

更新文档测试：

- README 或正式部署运行手册包含 `./optools.sh deploy` 推荐命令。
- 手册保留分步骤排障命令。
