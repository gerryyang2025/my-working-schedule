# Schedule Range Query Design

## Goal

Add a dedicated read-only query tab for viewing schedule information across a user-defined date range. This keeps the existing schedule editing workflow focused on the selected week while giving users a safer way to inspect one person or all staff over longer periods.

## Final Decisions

- Add a new `查询` tab between `排班` and `周统计`.
- The existing `排班` tab remains an editing workspace and continues to show only the selected date's natural week.
- The existing staff name/job ID search in `排班` remains scoped to the current week.
- The new `查询` tab is read-only.
- Query supports a custom start date and end date without a hard maximum range.
- Query defaults to the selected date's current week.
- Query results are grouped by natural week and rendered vertically. Each week block shows at most seven date columns.
- Long ranges are allowed. When the range exceeds 180 days, show a warning that the result may be large and scrolling/loading may be slower.
- Long ranges are fully expanded by default.

## Query Tab Behavior

The query tab contains:

- Start date input.
- End date input.
- Staff search input for name or job ID.
- Clear/reset button.
- Result summary text.
- Optional long-range warning.
- Week-grouped read-only schedule tables.

Default state:

- Start date = current selected week start.
- End date = current selected week end.
- Staff search is empty.
- Results show all visible staff for the current week.

Valid query:

- A date is valid when it uses the existing `YYYY-MM-DD` date key format and can be converted by current date helpers.
- Start date must be earlier than or equal to end date.
- A valid range is expanded into date keys by existing date utilities.
- Dates are then grouped by natural week.

Invalid query:

- If start date is later than end date, show `开始日期不能晚于结束日期`.
- If a date is malformed or missing, keep the query tab visible and show a clear validation message.
- Do not render stale results for an invalid query.

Long range:

- If the date count is greater than 180, show `当前查询范围较长，结果较多，加载和滚动可能变慢。`
- Do not block the query.
- Do not paginate or collapse the result in this version.

## Staff Visibility And Filtering

The query tab uses the same basic visibility rule as schedule and print views:

- Enabled staff are visible.
- Disabled staff are visible only when they have schedule entries inside the queried date range.

The staff search input filters visible staff by:

- `staff.name`
- `staff.jobId`

Filtering is trimmed and case-insensitive for job IDs and names.

Result summary:

- Use wording like `已显示 X / Y 人；日期 N 天；共 M 周`.
- `Y` means all staff visible for the selected date range before name/job ID filtering.
- `X` means staff remaining after name/job ID filtering.

Empty state:

- If no staff match the name/job ID filter, show `未找到匹配人员`.
- If the range has no schedule entries, still show enabled staff with empty cells, because the query tab is a schedule view, not only an entry list.

## Display Model

The query tab displays multiple week blocks:

- Each block title uses `YYYY-MM-DD 至 YYYY-MM-DD`.
- Each block contains only dates from the selected query range. Partial first and last weeks may have fewer than seven date columns.
- Each block uses the same core table structure as the schedule grid:
  - 排序ID
  - 人员
  - 类型
  - Date columns
- Shift cells use the same text/color style as the schedule grid.
- Cells are read-only and must not show editable affordances.
- Clicking cells in the query tab must not call quick fill, open the edit dialog, or save schedule entries.

## Existing Schedule Tab Behavior

The schedule tab remains unchanged except for continuing to keep its current-week staff search:

- Shows only the selected date's natural week.
- Supports name/job ID search within that week.
- Supports shift palette.
- Supports click-to-fill and edit dialog.
- Supports copy previous week.
- Supports batch rest, batch office, and batch clear for the current selected week only.

The query tab must not alter the schedule tab's selected shift, edit dialog state, batch operation payloads, or weekly editable staff calculation.

## Non-Goals

This feature does not:

- Add new backend APIs.
- Add SQLite fields or migrations.
- Change weekly summary calculation.
- Change monthly summary, settlement, or bonus allocation.
- Change print week or print month behavior.
- Make batch operations work across query ranges.
- Add pagination, month folding, or virtual scrolling.

## Suggested Components And Data Flow

Keep the implementation close to current frontend patterns:

- `App.vue` owns query tab state:
  - `scheduleQueryStartDate`
  - `scheduleQueryEndDate`
  - `scheduleQueryStaffQuery`
- Add computed values in `App.vue`:
  - normalized query dates
  - validation message
  - query date keys
  - query week groups
  - query visible staff
  - filtered query staff
  - long-range warning flag
- Introduce a read-only schedule display component or mode:
  - Preferred: create a small `ScheduleQueryResults.vue` that renders week groups and internally reuses a read-only grid-like table.
  - Alternative: extend `ScheduleGrid.vue` with a read-only mode only if it stays simple.

Prefer the dedicated query results component if it avoids mixing edit behavior into read-only display.

## Testing Requirements

Add tests for:

- Query tab exists between `排班` and `周统计`.
- Query tab defaults to the selected date's current week.
- A custom valid range renders multiple natural-week blocks.
- Partial first/last weeks only render dates inside the range.
- Staff search filters by name and job ID within the queried range.
- Disabled historical staff appears only when it has entries in the query range.
- Long ranges over 180 days show a warning but still render.
- Invalid start/end order shows `开始日期不能晚于结束日期` and does not render stale results.
- Query cells are read-only and do not trigger quick fill or edit dialog.
- Schedule tab editing/search behavior remains unchanged.
- Weekly summary, print week/month, and batch operation payloads are not affected by query tab state.

## Open Risk

Very large custom ranges can render many week blocks and many cells. The first version accepts this because query is read-only and grouped by week. If real usage shows performance pressure, a later feature can add month folding, pagination, or virtual rendering.
