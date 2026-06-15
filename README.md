# 国际医学部护理排班管理系统

这是一个面向国际医学部护理排班管理的 Web 工具项目。当前阶段重点梳理并实现排班管理能力，包括月视图、周查询、快速填班、打印、全屏展示，以及按周自动统计出勤班次数、加班班次数和总系数。

## 当前文档

- [产品需求.md](docs/产品需求.md)：总体需求说明，已标注一期范围与后续扩展。
- [技术方案.md](docs/技术方案.md)：一期技术方案与后续正式架构演进。
- [方案细节.md](docs/方案细节.md)：一期落地细节与执行计划对齐说明。
- [风格样式.md](docs/风格样式.md)：Web 界面风格建议，已标注一期采用 Element Plus。
- [一期设计规格](docs/superpowers/specs/2026-06-15-nursing-schedule-design.md)：已确认的一期设计范围与规则。
- [一期实现计划](docs/superpowers/plans/2026-06-16-nursing-schedule-implementation.md)：按任务拆分的实现步骤与验证命令。

## Git 约定

- `.gitignore` 忽略本地系统文件、依赖目录、构建产物、日志、环境文件和本地需求附件。
- `.gitattributes` 统一文本文件换行，并将常见二进制文件标记为 binary。
- `排班需求.docx` 作为本地需求附件保留在工作区，不再纳入 Git 跟踪。

## 本地开发

```bash
npm install
npm run dev
```

默认前端地址为 `http://127.0.0.1:5173`，API 地址为 `http://127.0.0.1:3001`。

## 验证命令

脚手架阶段可先运行 `npm run lint` 与 `npm run test`；`npm run build` 和 `npm run test:e2e` 需要后续任务补齐前端入口与 API 服务后再作为完整验证。

```bash
npm run test
npm run build
npm run test:e2e
```
