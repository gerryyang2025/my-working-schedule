# Staff Reorder Single Control Design

## Goal

Reduce repeated reorder controls in the schedule grid. Replace per-row up/down buttons with one shared reorder control that operates on the currently selected staff row.

## Current Problem

The schedule page can persist staff order correctly, but every row shows its own up/down buttons in the `排序ID` column. With many staff members, this creates visual noise and makes the first fixed column feel crowded, especially on mobile.

## Selected Design

Use a single selected-row reorder model:

1. The user clicks a staff row to select that staff member.
2. The selected row is highlighted with a subtle shadow treatment across the visible row.
3. A single reorder control area shows `上移` and `下移` actions.
4. Clicking `上移` or `下移` moves the selected staff member one position and saves the real `sortOrder` through the existing staff-order API.

Reference layout:

```text
排序ID        人员              类型        22 周一    23 周二 ...
──────────────────────────────────────────────────────────────
[↑ 上移] [↓ 下移]    已选：时银丽 000815

1             段鸿露
              000228            护士长       常        常

2             吴鸿雁
              000214            护士         休        A4

3             王慧
              000422            护士         进修      进修

4   ●         时银丽
              000815            护士         休        休
              selected row: subtle shadow highlight

5             童妃妃
              000842            护士         P2        公休
```

## Interaction Rules

- Selection is row-based. Clicking the `排序ID` cell, personnel cell, type cell, or any schedule cell in the row selects that staff member.
- Existing schedule-cell quick-fill/edit behavior remains unchanged for editable cells.
- The selected row uses a shadow highlight, not a heavy filled background, so shift colors remain readable.
- If no staff is selected, the shared reorder buttons are disabled and the helper text says `请选择人员`.
- If the selected staff is the first visible row, `上移` is disabled.
- If the selected staff is the last visible row, `下移` is disabled.
- If a staff search is active, reordering remains disabled to avoid ambiguous filtered-order changes.
- If the selected staff disappears because the week/date/search changes, selection is cleared.
- Non-admin users cannot reorder and should not see active reorder controls.

## Visual Treatment

Selected row style:

- Add a slightly stronger left-side marker in the `排序ID` column.
- Add row-level shadow using inset or overlay style so it works inside table rows.
- Keep background mostly white to preserve weekend/holiday and shift-color readability.
- Avoid adding controls to every row.

Recommended visual language:

```text
box-shadow:
  inset 3px 0 0 #2563eb,
  inset 0 0 0 9999px rgba(37, 99, 235, 0.035),
  0 2px 8px rgba(37, 99, 235, 0.16);
```

Exact CSS can be tuned during implementation to avoid table rendering artifacts.

## Component Design

`ScheduleGrid.vue` should own only row selection and visible-order emission:

- Add optional `selectedStaffId` prop.
- Add `selectStaff` event when a row is clicked.
- Keep `reorderStaff` event, but trigger it from shared controls instead of row-level buttons.
- Remove per-row `staff-reorder-button` rendering.
- Keep edge move logic based on `sortedStaff`.

`App.vue` remains responsible for persistence:

- Store selected schedule staff id.
- Pass selected staff id into `ScheduleGrid`.
- Receive `selectStaff` events.
- Continue using existing `handleReorderStaff` to merge visible order into full staff order and call `saveStaffOrder`.
- Clear selection when the selected staff is no longer visible.

## Error Handling And Busy States

Reuse the current staff-order save behavior:

- Preserve malformed payload checks.
- Preserve stale request guards.
- Preserve overlap protection with schedule entry saves and config mutations.
- Preserve backend validation that rewrites real `sortOrder` values to continuous `1..N`.

## Testing

Add or update tests for:

- Selecting a row emits or stores the selected staff id.
- The selected row renders the shadow/highlight class.
- Shared `上移` and `下移` buttons emit the expected visible staff order.
- First row disables `上移`; last row disables `下移`.
- Search-active state disables reorder controls.
- Non-admin users cannot trigger reorder saves.
- Existing quick-fill/edit tests still pass.

## Out Of Scope

- Drag-and-drop sorting.
- Batch multi-row reordering.
- Sorting inside filtered search results.
- Changing backend storage or audit behavior.
