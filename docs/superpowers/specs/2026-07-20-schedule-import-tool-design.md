# Schedule Import Tool Design

## Goal

Add a dedicated `导入` tab for importing historical weekly schedule data pasted from an external table. The tool should parse the schedule period from the pasted text, validate staff and shift data before writing anything, show a clear preview, and only import after explicit confirmation.

This feature is for controlled historical data entry. It must protect existing schedule data and avoid silent guesses.

## Final Decisions

- Add a left-side `导入` tab.
- Place `导入` after `查询`: `排班 / 查询 / 导入 / 周统计 / 月结与奖金 / 打印 / 配置 / 使用说明`.
- The import page shows a required data format example.
- Users paste the complete period line plus table content into one text area.
- The import page does not provide a separate date picker.
- The schedule period is parsed from the pasted text.
- Staff matching uses exact staff name matching against enabled staff only.
- Import data does not include job ID. The system derives job ID from the matched staff record.
- Shift matching uses exact enabled shift name/shortName matching first, then a controlled alias map.
- `/` is treated as a normal shift value. It must match an enabled `/` shift.
- Existing schedule entries are skipped and never overwritten in this version.
- Validation is whole-batch. Any blocking error prevents import.
- Preview is required before import.

## Input Format

The first version supports this standard format:

```text
当前排班周期为2026年7月20日（周一）至 7月26日（周日）：

姓名	周一(7/20)	周二(7/21)	周三(7/22)	周四(7/23)	周五(7/24)	周六(7/25)	周日(7/26)
段鸿露	常班	常班	常班	常班	常班	休	休
张曼曼	N1	/	休	P3	A4	A4	N1
陈佩燕	N2	/	休	P2	A5	A2	N2
王亚婷	A5	N1	/	休	P2	A3组长	休
李丹青	P2	N2	/	休	婚假	婚假	婚假
时银丽	A4	A4	N1	/	休	P2	A3组长
```

Supported details:

- The period line must contain `当前排班周期为...至...`.
- The start date must be Monday and the end date must be Sunday.
- The parsed period must be exactly seven days.
- Header columns must be `姓名` plus `周一` through `周日`.
- Header dates must match the parsed period.
- Rows must contain exactly one name cell and seven shift cells.
- Input copied from Excel or a spreadsheet should be accepted as tab-separated text.
- Leading and trailing whitespace is ignored.

## Period Parsing

The importer parses the period from the text, then uses the existing date helpers and week rules for validation.

Rules:

- Start date must include year, month, day, and weekday.
- End date may omit the year when it is the same schedule week context.
- If the end year is omitted and the end month/day falls before the start month/day, the parser may infer the next year for cross-year weeks.
- Weekday text must match the actual calendar date.
- The final parsed period must match Monday-to-Sunday exactly.

If the period line is missing, malformed, not Monday-to-Sunday, or inconsistent with the table header, validation fails.

## Staff Matching

Staff rows are matched by exact name only.

Rules:

- Match only enabled staff.
- A name must match exactly one enabled staff record.
- Unknown names are blocking errors.
- Duplicate names in the import table are blocking errors.
- Duplicate enabled staff names in the system make matching ambiguous and are blocking errors.
- Disabled staff cannot be imported through this tool.
- All staff types can be imported when enabled, including nurses, head nurses, and clerks.

The preview shows the derived staff information:

- 姓名
- 工号
- 人员类型

## Shift Matching

Each shift cell is matched to one enabled shift.

Matching order:

1. Exact match against enabled shift `name`.
2. Exact match against enabled shift `shortName`.
3. Controlled alias mapping.

Initial controlled aliases:

- `常班` -> `常`
- `办公班` -> `办公`
- `备班1` -> `备1`

Alias rules:

- The alias target must resolve to exactly one enabled shift by name or shortName.
- Alias mapping is shown in preview so users can verify it.
- If a value matches multiple shifts, validation fails.
- If a value does not match any enabled shift and has no alias, validation fails.
- Values such as `带检`, `跟班-办公`, `婚假`, `A3组长`, and `/` are not automatically归并; they must exist as enabled shifts or be covered by a controlled alias.

Each cell imports one shift in this version. Two-shift cells remain out of scope until a separate delimiter rule is confirmed.

## Existing Data Handling

This version is non-overwriting.

For each matched staff/date cell:

- If the target date is inside a settled month, validation fails for the whole import.
- If the system already has a schedule entry with existing shift IDs or a note, the cell is marked as `跳过已有排班`.
- If the system has no entry, or only an empty entry without note, the cell is eligible for import.
- Existing entries are never changed or cleared.

This behavior keeps historical import safe and avoids accidental loss of manually maintained schedule data.

## Page Flow

The `导入` tab contains three areas.

### 1. Format Guide

Show a concise instruction and the standard example. The copy should explain:

- Paste the period line and table together.
- Staff are matched by name.
- Job IDs are filled from system staff records.
- Shift values must exist in system shift configuration or supported aliases.
- Existing schedule data will be skipped, not overwritten.

### 2. Paste And Validate

Controls:

- Large textarea for pasted data.
- `校验数据` button.
- `清空` button.

Validation result states:

- No input: show a gentle empty-state hint.
- Errors: show grouped errors by period/header/row/cell.
- Success: show preview and enable `确认导入`.

### 3. Preview And Confirm

Preview includes:

- Parsed period: `第N周 YYYY-MM-DD 至 YYYY-MM-DD`.
- Summary counts:
  - Parsed staff count.
  - Cells to import.
  - Cells skipped because existing schedule data is present.
  - Alias-mapped cells.
- Preview table:
  - 行号
  - 姓名
  - 工号
  - 类型
  - 周一 to 周日 cells
  - Per-cell status when useful: `将导入`, `跳过`, `别名`.

The final button is `确认导入`. It remains disabled until the latest validation result is successful and matches the current textarea content.

If validation succeeds but every eligible cell is skipped because existing schedule data is present, show `没有可导入内容` and keep `确认导入` disabled.

## Data Flow

Keep parsing and validation in a focused shared helper so behavior is testable and consistent.

Suggested modules:

- `src/lib/schedule-import.ts`
  - Parse raw text.
  - Parse period and header.
  - Match staff against app data.
  - Match shifts against app data and aliases.
  - Build preview rows and import candidates.
- `src/components/ScheduleImportPanel.vue`
  - Render guide, textarea, validation errors, preview, and confirmation controls.
- `src/api/client.ts`
  - Add an import API client wrapper.
- `server/routes.ts`
  - Add an import endpoint that re-parses and re-validates the raw text before writing.

The frontend may compute preview locally from current app data for quick feedback. The backend must revalidate on confirmation because app data may have changed after preview.

## Backend Import Behavior

Add one confirm endpoint, for example `POST /api/data/schedule-import`.

Payload:

- Raw pasted text.
- Expected non-overwrite mode.

Server responsibilities:

- Require the same permission level as schedule editing and batch schedule operations.
- Load current app data.
- Re-run all parsing and validation.
- Respect monthly settlement locks.
- Write only eligible empty cells.
- Return updated app data and an import result summary.
- Return validation errors without writing if any blocking error exists.
- Record audit log with period, staff count, imported cell count, skipped cell count, and alias count.

The backend result may differ from the frontend preview if another user changed data between preview and confirmation. In that case, server truth wins and the returned summary should be displayed.

## Error Handling

Blocking errors include:

- Missing or invalid period line.
- Period not exactly Monday-to-Sunday.
- Header weekday/date mismatch.
- Row column count mismatch.
- Empty staff name.
- Unknown staff name.
- Staff name maps to disabled staff only.
- Staff name is duplicated in import text.
- Enabled staff name is duplicated in system data.
- Empty shift cell.
- Unknown shift value.
- Shift alias target missing or ambiguous.
- Date belongs to a settled month.

Non-blocking preview statuses:

- Existing schedule data will be skipped.
- Shift value was resolved by alias.

## Permissions

The `导入` tab should be visible only to users who can edit schedules.

Users without schedule edit permission should not see the import action. Direct API calls from unauthorized users must be rejected.

## Testing Requirements

Add tests for:

- Period line parsing from the standard sample.
- Monday-to-Sunday validation.
- Header date and weekday mismatch errors.
- Exact staff name matching.
- Unknown, disabled, duplicated imported, and duplicated system staff names.
- Exact shift name matching.
- Exact shift shortName matching.
- Alias matching for `常班`, `办公班`, and `备班1`.
- `/` imported as a normal shift when configured.
- Unknown shift errors.
- Whole-batch failure prevents writes.
- Existing schedule entries are skipped and not overwritten.
- Settled month dates block import.
- Preview summary counts.
- Successful validation with zero importable cells shows a no-op state and does not submit.
- Import endpoint revalidates raw text before writing.
- Audit summary records import counts.
- Left-side `导入` tab appears in the expected position.

## Non-Goals

This first version does not:

- Import multiple weeks in one paste.
- Import monthly schedule sheets.
- Create staff automatically.
- Create shifts automatically.
- Overwrite or clear existing schedule entries.
- Import two shifts in a single cell.
- Provide a shift alias management UI.
- Import notes or remarks.
- Support fuzzy name matching.
- Support partially successful imports.

## Open Risk

Name-only import is convenient but depends on clean staff names. The strict matching rule intentionally blocks ambiguous data. If historical source files often contain old names or typos, a later version can add an explicit manual mapping step, but this version should keep the safest exact-match behavior.
