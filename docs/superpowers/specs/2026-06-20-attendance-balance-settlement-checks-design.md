# 出勤盈亏与月结前检查设计

## 背景

当前系统已经支持周统计、月度汇总、奖金试算、月结锁定和 SQLite 持久化。统计中已有出勤班次、满勤标准、加班班次和绩效系数，但还缺少直观的“出勤盈亏”信息。月结前也缺少数据质量检查，管理员需要人工判断是否存在未排班、出勤不足、异常双班或停用数据引用。

本阶段目标是补齐 P1 中风险较低、价值明确的业务能力：在周统计、月度汇总、月结快照、打印和奖金试算中增加出勤盈亏；在确认月结前提供检查提示。检查只做提醒和确认，不做硬性阻断。

## 已确认决策

- 本阶段只做“出勤盈亏”和“月结前数据检查”。
- 出勤盈亏按班次计算，不按自然日计算工时。
- 一个人一天最多两个班次，双班属于少见但允许的情况，因此只提醒不禁止。
- 月结前检查只做提醒，用户确认后仍可继续月结。
- 护士长排班规则和其他人一致；护士长绩效仍显示为单独核算，不在本阶段实现护士长绩效算法。
- 文员和护士一样参与排班表和统计。
- 当前运行时只保留 SQLite 存储方案，因此新月结字段需要进入 SQLite schema 和迁移。
- 本阶段不实现班次分类、岗位系数、奖金导出、自动汇总或批量排班工具。

## 计算口径

### 周统计

新增 `attendanceBalance`：

```text
attendanceBalance = attendanceShifts - requiredShifts
```

其中：

- `attendanceShifts`：已存在的出勤班次，继续只统计 `countsAsAttendance = true` 的班次。
- `requiredShifts`：已存在的满勤标准，继续按自然周和节假日扣减计算。
- `overtimeShifts`：保持现有口径，继续为 `max(0, attendanceBalance)`。

显示时使用带符号格式：

- 正数：`+1`
- 零：`0`
- 负数：`-1`

### 月度汇总

月度汇总新增 `requiredShifts` 和 `attendanceBalance`：

```text
monthlyRequiredShifts = selectedRange 内每个自然周/部分周的满勤标准之和
monthlyAttendanceBalance = attendanceShifts - monthlyRequiredShifts
```

月度满勤标准复用当前月度累计加班所依赖的周/部分周逻辑，避免周统计和月统计出现两套口径。

月度累计加班仍保持现有口径：按每个自然周或部分周计算正向加班，再累加；不会因为整月总盈亏为负而抵消已经形成的周加班。

### 月结快照

`MonthlySettlementRow` 新增：

- `requiredShifts`
- `attendanceBalance`

新月结保存时写入这两个字段，保证历史月结快照后续打印和奖金范围试算时不受后续配置变动影响。

旧月结快照如果没有这两个字段，读取时使用兼容默认值 `0`，不回填和不推测历史数据，避免误改已确认的历史月结记录。

## 数据结构

需要扩展以下领域模型：

```ts
interface WeeklyStaffSummary {
  attendanceBalance: number;
}

interface MonthlyStaffSummary {
  requiredShifts: number;
  attendanceBalance: number;
}

interface MonthlySettlementRow {
  requiredShifts: number;
  attendanceBalance: number;
}
```

奖金范围试算中，按月结快照和实时月度汇总混合计算时，需要同时累加：

- `attendanceShifts`
- `requiredShifts`
- `attendanceBalance`
- `overtimeShifts`
- `coefficientTotal`

护士长或其他单独核算人员的 `coefficientExcludedReason` 逻辑保持不变。

## SQLite 迁移

SQLite schema 版本需要从当前版本递增。

`monthly_settlement_rows` 新增字段：

```sql
required_shifts integer not null default 0
attendance_balance integer not null default 0
```

迁移要求：

- 新库建表时直接包含两个字段。
- 老库升级时通过 `alter table` 增加字段。
- 半升级库重复执行迁移时不能失败。
- `readMonthlySettlements`、`replaceAppDataInSqlite` 和相关 mapper 需要完整读写两个字段。
- `data:check:sqlite` 需要把新增字段纳入 schema 检查。

旧 JSON 存储方案已经删除，本阶段不再设计 JSON driver 兼容逻辑。若测试夹具中存在旧月结对象，可以在内存归一化层补默认值。

## 页面展示

### 周统计

周统计新增“出勤盈亏”列，建议位置放在“满勤标准”和“加班班次”之间：

```text
人员 | 人员类型 | 出勤班次 | 满勤标准 | 出勤盈亏 | 加班班次 | 总系数
```

移动端一人一行摘要中增加盈亏信息，例如：

```text
出勤 3/4 · 盈亏 -1 · 加班 0 · 系数 3.60
```

### 月结与奖金

月度汇总和奖金表新增“满勤标准”和“出勤盈亏”：

```text
人员 | 人员类型 | 月出勤班次 | 满勤标准 | 出勤盈亏 | 累计加班班次 | 月总系数 | 分配金额 | 备注
```

如移动端空间不足，保留一行人员卡片风格，优先展示：

- 人员姓名和工号
- 月出勤/满勤
- 出勤盈亏
- 累计加班
- 月总系数或单独核算说明

## 打印和 PDF

打印周表、月表和奖金快照需要同步新增字段。

周表汇总新增“出勤盈亏”。

月表的月度汇总新增“满勤标准”和“出勤盈亏”。

已月结月份的奖金快照打印也新增这两个字段，优先使用月结快照中保存的值。

打印中的排班文字继续与页面保持一致：使用彩色文字，不恢复外框样式。

## 月结前数据检查

新增月结前检查 helper，建议放在 `src/lib/settlement-checks.ts`，由前端确认月结流程调用。

检查结果结构：

```ts
type SettlementCheckType =
  | "no-attendance"
  | "attendance-deficit"
  | "double-shift"
  | "disabled-shift"
  | "disabled-staff-with-schedule";

interface SettlementCheckItem {
  type: SettlementCheckType;
  message: string;
  staffId?: string;
  date?: string;
  shiftIds?: string[];
}
```

检查项：

- 未排班人员：当月启用人员没有任何计出勤班次。
- 出勤不足人员：月度 `attendanceBalance < 0`。
- 异常双班：同一人同一天有两个班次。
- 已停用班次引用：排班记录引用已停用班次。
- 已停用人员有当月排班：停用人员在当月仍有排班记录。

检查交互：

- 点击“确认月结”时先计算检查结果。
- 无检查项时走现有确认流程。
- 有检查项时弹出确认框，展示检查摘要和前若干条明细。
- 用户选择“继续月结”后照常保存月结快照。
- 用户取消时不调用保存接口。

检查不新增后端硬阻断。后端继续负责权限、锁定状态和数据保存校验。

## 测试设计

计算测试：

- 周统计能计算正数、零、负数出勤盈亏。
- 周统计的加班班次继续等于 `max(0, attendanceBalance)`。
- 月度汇总能跨部分周累计满勤标准，并计算月度出勤盈亏。
- 节假日扣减满勤后，周/月口径一致。
- 月度累计加班保持按周正向累计，不被月度负盈亏抵消。

奖金和月结测试：

- `createSettlementRow` 保存 `requiredShifts` 和 `attendanceBalance`。
- 奖金范围试算能累加月结快照和实时汇总中的满勤标准、出勤盈亏。
- 护士长单独核算说明不受新增字段影响。

SQLite 测试：

- 新库 `monthly_settlement_rows` 包含新增字段。
- 老库迁移后包含新增字段。
- mapper 写入并读取月结快照时保留新增字段。
- 半升级库重复迁移不失败。

页面测试：

- 周统计桌面和移动端显示出勤盈亏。
- 月结与奖金表显示满勤标准和出勤盈亏。
- 确认月结前存在检查项时出现确认提示。
- 用户确认后继续保存月结，用户取消后不保存。

打印测试：

- 周表汇总、月表汇总和奖金快照打印包含新增字段。
- 排班文字打印仍为彩色文字且不带方框。

## 验收标准

- 周统计能看到每个人的出勤盈亏，且数字与出勤班次减满勤标准一致。
- 月结与奖金能看到每个人的月满勤标准和月出勤盈亏。
- 月结保存后，再次查看已月结月份仍能看到保存时的满勤标准和出勤盈亏。
- 奖金范围试算中跨月汇总的出勤盈亏能正确累加。
- 月结前存在未排班、出勤不足、双班、停用班次或停用人员排班时，会出现提示。
- 检查提示不阻止用户继续月结。
- 打印周表、月表和奖金快照均包含新增统计字段。
- SQLite 旧库可平滑迁移，不丢失已有月结数据。

## 非目标

本阶段不做：

- 班次分类。
- 护士长绩效算法。
- 岗位系数和班次系数组合。
- 奖金分配结果导出。
- 自动周汇总或自动月汇总。
- 排班复制、批量清空或批量设置。
- 个人只看自己排班或更复杂组织权限模型。
