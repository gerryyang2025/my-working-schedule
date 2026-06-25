# Workbench Action Tabs Design

## Context

The current homepage header still exposes three global action buttons: `配置`, `打印周表`, and `打印月表`. The left workbench navigation contains the primary application sections: `排班`, `查询`, `周统计`, `月结与奖金`, and `使用说明`.

The requested optimization is to reduce top-header controls, make these actions part of the workbench tab model, and keep the account menu as a floating menu that does not move the page layout.

## Goals

- Move `打印周表`, `打印月表`, and `配置` into the workbench tab list before `使用说明`.
- Keep the header visually simple: title on the left and current account on the right.
- Render the current account text as `当前用户：admin`.
- Keep account actions in a floating dropdown menu that does not push the page content down.
- Preserve existing print preview, PDF generation/share/download, password change, logout, configuration, and permission behavior.

## Non-Goals

- Do not redesign the schedule grid, shift palette, query page, weekly summary, bonus page, or help content.
- Do not change authentication, authorization, or backend APIs.
- Do not change print calculation logic or settlement logic.
- Do not introduce new routes; this remains a single-page workbench.

## Navigation Design

The workbench tab order becomes:

1. `排班`
2. `查询`
3. `周统计`
4. `月结与奖金`
5. `打印周表`
6. `打印月表`
7. `配置`
8. `使用说明`

`打印周表`, `打印月表`, and `配置` are true workbench panels, not shortcut buttons. Selecting one changes `activeWorkbenchTab` and displays the corresponding panel in the existing right-side workbench area.

## Header Design

The header contains:

- Left: existing department eyebrow and system title.
- Right: one account menu trigger with text `当前用户：<username>`, for example `当前用户：admin`.

The header no longer contains visible `配置`, `打印周表`, or `打印月表` buttons.

## Account Menu Design

Clicking `当前用户：admin` opens a floating dropdown containing:

- `修改密码`
- `退出登录`

The menu keeps the current interaction behavior:

- Click trigger to open/close.
- Click outside to close.
- Press `Escape` to close and restore focus to the trigger.
- Selecting `修改密码` closes the menu and opens the password change dialog.
- Selecting `退出登录` closes the menu and logs out.

The menu must float above content without changing document flow. The current layout-shift workaround (`.app-header.user-menu-open { margin-bottom: ... }`) is removed. The dropdown should use absolute positioning, a sufficient `z-index`, and clipping/overflow rules that keep it visible without pushing the schedule operation row down.

## Print Tab Behavior

### `打印周表`

The `打印周表` panel shows the existing weekly print preview content for the selected week. It reuses the current `PrintViews` weekly mode and the same computed data that powers the current print preview dialog.

The panel provides the existing print actions:

- Generate/share PDF.
- Download PDF when sharing is unavailable.
- Call system print when supported on the current device.

On mobile or unsupported print environments, the panel still provides the PDF/share fallback. Since the user explicitly entered a print tab, the print content is visible in the page instead of being hidden behind a modal dialog.

### `打印月表`

The `打印月表` panel shows the existing monthly print preview content for the selected month. It reuses the current `PrintViews` monthly mode, `monthlySummary`, and `currentMonthlySettlement`.

It exposes the same print/PDF actions as `打印周表`.

### Preview Dialog Compatibility

The current print dialog state and helper functions can be refactored into reusable panel actions. The implementation should avoid duplicating PDF/share logic. If any existing dialog-specific state remains, it must not conflict with the new tab panels.

## Configuration Tab Behavior

The `配置` panel displays the existing configuration management UI in the workbench content area, replacing the header button plus drawer entry.

Selecting `配置` should:

- Load the latest app data if needed.
- Load users and audit logs when the current user can manage configuration.
- Display the existing `ManagementDrawer` content as an in-page management panel or through a shared management component.

The management panel must preserve current behavior:

- Only admins can manage configuration.
- Non-admin users can see a disabled or permission message state instead of editable configuration.
- Staff, shifts, holidays, users, and audit log interactions continue to use the same save/delete/refresh handlers.
- Existing saving/loading state and audit refresh behavior remain intact.

## Layout And Styling

- The left workbench tabs remain the primary navigation pattern.
- The additional print/config tabs should fit without forcing horizontal scrolling on desktop.
- On mobile, tabs may stack as they do today.
- Header account text must be constrained with ellipsis for long usernames.
- The floating account menu should be visually attached to the account trigger and layered above the page.
- The print panels should use a readable page-preview layout and should not be squeezed by the schedule grid layout.

## State And Data Flow

- `WorkbenchTab` gains `printWeek`, `printMonth`, and `config` variants.
- `activeWorkbenchTab` controls which panel is visible.
- Existing selected date/week/month state remains shared across schedule, print week, and print month panels.
- Existing `printPreviewMode` can be replaced or reduced if print mode is now derived from the active print tab.
- PDF generation state (`pdfGenerating`, `pdfDownloadUrl`, `pdfDownloadName`, `printPdfStatus`) should be shared by both print panels and reset when switching between print tabs or closing/finishing PDF work.
- Configuration loading should happen when opening the `配置` tab, with guards to avoid unnecessary repeated requests while preserving freshness after saves.

## Error Handling

- If direct system print is unsupported, show the existing warning/fallback copy in the print panel.
- If PDF generation fails, keep the existing `ElMessage.error` behavior.
- If configuration loading fails, show the existing configuration load error message.
- If a user without configuration permission selects `配置`, show a clear in-panel permission message and do not attempt privileged writes.

## Testing Plan

Update or add tests for:

- Workbench tab order includes `打印周表`, `打印月表`, and `配置` before `使用说明`.
- Header no longer renders `配置`, `打印周表`, or `打印月表` action buttons.
- Header account trigger renders `当前用户：admin`.
- Account dropdown opens as a floating menu without adding the `user-menu-open` layout-shift class.
- `Escape`, outside click, password change, and logout menu interactions still work.
- `打印周表` tab renders weekly print preview content and PDF/system print controls.
- `打印月表` tab renders monthly print preview content and PDF/system print controls.
- `配置` tab loads users/audit logs for admins and renders management content.
- Non-admin configuration access is disabled or replaced by a permission message.
- CSS tests cover the floating account dropdown and removal of the layout-shift rule.

## Browser Verification

After implementation, verify in the browser:

- Desktop header only shows title and `当前用户：admin`.
- Account dropdown floats over the page and does not move the schedule operation row.
- The dropdown does not obscure critical controls in normal desktop width.
- Left tabs show the new order and selecting each new tab displays the correct panel.
- Mobile layout has no horizontal overflow with the longer account label.
- Print week/month panels remain readable on desktop and usable on mobile.

## Open Decisions Resolved

- The chosen navigation approach is the existing left-side workbench tab model, not a new top tab bar.
- `打印周表`, `打印月表`, and `配置` are true workbench panels, not shortcut actions.
- The account menu should float and must not push page content down.
