# P0 正式化收尾设计：生产运维增强

## 背景

当前系统已经完成 SQLite 存储、生产构建、systemd API 服务、Nginx 反向代理、备份恢复、账号权限和审计日志基础能力。正式部署运行手册也已经覆盖单机上线主流程。

本阶段收尾目标是补齐长期运行所需的生产运维能力：HTTPS 配置、日志轮转、防火墙检查和统一入口验收。范围保持在低风险的运维增强，不进入账号与人员绑定、护士长辖区权限或 P1 业务规则。

## 目标

1. 通过 `optools.sh` 提供统一的生产运维入口，减少手工复制命令。
2. 为 HTTPS、日志轮转、防火墙提供可检查、可重复执行、可文档化的流程。
3. 增强 `doctor` 检查，让上线后能够快速判断生产环境是否完整。
4. 补充测试和部署文档，保证脚本行为可回归、流程可验收。

## 非目标

1. 不自动申请 HTTPS 证书，不内置 certbot 流程。
2. 不默认修改服务器防火墙规则，避免误改云厂商安全组或现有策略。
3. 不改变应用业务数据结构。
4. 不实现账号与人员绑定、护士长辖区权限、出勤盈亏等 P1/P0 后续业务功能。

## 方案选择

### 方案 A：安全生产化增强

新增运维模板和脚本入口，默认只做安装配置、状态检查和明确指引。HTTPS 使用用户已有证书路径；防火墙默认只检查和输出建议；日志轮转可以安装静态配置并验证。

优点是低风险、可重复执行、适合当前单机正式部署阶段。缺点是证书申请和云安全组仍需要管理员按服务器实际情况处理。

### 方案 B：全自动部署增强

脚本自动安装 certbot、申请证书、开放防火墙端口并 reload 服务。优点是步骤少；缺点是强依赖域名解析、发行版、防火墙实现和云厂商安全组，失败场景多，且误操作风险更高。

### 方案 C：文档优先

只补充手册，不增加脚本。优点是改动小；缺点是验收仍依赖人工，后续重复部署成本高。

本阶段采用方案 A。

## 组件设计

### Nginx HTTPS

保留现有 HTTP 配置模板和 `tools/nginx-service.sh` 行为。新增 HTTPS 配置模板，支持以下变量：

- `NGINX_SERVER_NAME`：域名或服务器名。
- `NGINX_SSL_CERTIFICATE`：证书文件路径。
- `NGINX_SSL_CERTIFICATE_KEY`：私钥文件路径。
- `NGINX_HTTPS_SOURCE_CONF`：HTTPS 模板路径。
- `NGINX_TARGET_CONF`：目标 Nginx 配置路径。

新增命令：

- `./optools.sh nginx configure-https [--no-reload]`

命令会检查证书路径、模板路径和目标目录，生成 Nginx HTTPS 配置，执行 `nginx -t`，并在未指定 `--no-reload` 时 reload Nginx。

### 日志轮转

新增模板：

- `deploy/logrotate/my-working-schedule.example`

新增脚本：

- `tools/logrotate-service.sh`

新增入口：

- `./optools.sh logrotate install`
- `./optools.sh logrotate status`
- `./optools.sh logrotate test`

默认轮转对象包括应用相关日志和备份任务日志。`install` 安装配置到 `/etc/logrotate.d/my-working-schedule`；`test` 使用 `logrotate -d` 做 dry-run 验证；`status` 检查配置文件和 `logrotate` 命令是否存在。

### 防火墙检查

新增脚本：

- `tools/firewall-service.sh`

新增入口：

- `./optools.sh firewall status`
- `./optools.sh firewall guide`

`status` 识别常见环境，包括 `firewalld`、`ufw`、`iptables` 和 `nft`。脚本只输出当前状态和需要开放的端口建议，默认不执行开端口操作。

`guide` 输出人工验收步骤，包括开放 HTTP 80、HTTPS 443、确认云厂商安全组、确认 API 3001 只监听本机或仅由 Nginx 访问。

### Doctor 检查

增强 `./optools.sh doctor`：

1. 保留已有 Node、npm、dist、SQLite、Nginx、API 健康检查。
2. 增加 logrotate 状态检查。
3. 增加 firewall 状态检查。
4. HTTPS 检查采用提示性策略：如果配置了 HTTPS 目标或证书路径，则验证证书文件和 Nginx 配置；未配置 HTTPS 时输出提醒，不阻塞 HTTP-only 部署。

这样既能支持当前 IP 访问阶段，也能在后续绑定域名时纳入验收。

## 数据和配置流

本阶段不新增业务数据，也不修改 SQLite schema。

运维配置通过环境变量和模板文件流转：

1. 管理员设置 `NGINX_SERVER_NAME`、证书路径等环境变量。
2. `optools.sh` 将命令委托给对应 `tools/*-service.sh`。
3. 工具脚本复制或渲染 `deploy/*` 模板到系统目录。
4. `doctor` 读取脚本状态输出，汇总为生产环境检查结果。

## 错误处理

1. 缺少系统命令时输出明确安装建议，例如 `nginx`、`logrotate`。
2. 缺少证书文件时阻止 HTTPS 配置写入，避免生成不可用 Nginx 配置。
3. 防火墙脚本无法识别环境时不失败，只输出人工检查建议。
4. `doctor` 对核心运行能力保持失败即失败；对未启用 HTTPS 的环境只提示，不阻塞。
5. 所有系统目录写入失败时保留原始错误，便于定位权限问题。

## 测试设计

新增或扩展以下测试：

1. `tools/nginx-service.test.ts`：覆盖 HTTPS 配置渲染、证书缺失、`--no-reload` 行为。
2. `tools/logrotate-service.test.ts`：覆盖安装、状态和 dry-run 命令委托。
3. `tools/firewall-service.test.ts`：覆盖常见防火墙命令识别和指引输出。
4. `optools.test.ts`：覆盖新增 `nginx configure-https`、`logrotate`、`firewall` 和增强后的 `doctor` 委托。
5. 文档测试保持通过，确保手册中的命令和入口与实际脚本一致。

验收命令：

```bash
npm run test -- tools/nginx-service.test.ts tools/logrotate-service.test.ts tools/firewall-service.test.ts optools.test.ts
npm run test
```

## 文档更新

更新以下文档：

1. `docs/正式部署运行手册.md`：补充 HTTPS、日志轮转、防火墙、上线验收和常见排障。
2. `docs/功能跟进清单.md`：把正式部署深化中已完成和仍待完成的部分拆清楚。
3. `tools/README.md`：补充新工具脚本说明。

## 验收标准

1. `./optools.sh help` 显示新增运维命令。
2. `./optools.sh nginx configure-https --no-reload` 可在证书路径有效时生成配置并执行 Nginx 测试。
3. `./optools.sh logrotate status` 能判断配置是否已安装。
4. `./optools.sh firewall status` 能输出当前防火墙环境和端口建议。
5. `./optools.sh doctor` 能覆盖应用、数据、Nginx、日志轮转、防火墙和可选 HTTPS 检查。
6. 所有新增脚本测试和全量测试通过。
