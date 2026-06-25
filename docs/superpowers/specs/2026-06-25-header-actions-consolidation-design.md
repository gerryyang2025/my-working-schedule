# Header Actions Consolidation Design

## Background

The schedule home page currently splits account identity and common actions across multiple top rows. The header only shows the current user identity, while the next toolbar row contains week navigation, password change, configuration, printing, fullscreen, and logout actions. Search and batch schedule actions also sit on separate visual rows. On wide screens this leaves unused space in the header and makes the top of the schedule view visually crowded.

## Goals

- Show the current user as the account name only, for example `admin`.
- Move global actions up into the top header beside the user menu.
- Reduce visible button count by placing account-specific actions inside the `admin` dropdown.
- Remove the fullscreen action from the home page.
- Put the selected schedule week, date controls, staff search, and batch schedule actions into one content operation row.
- Keep the search input at a moderate fixed width that can show its placeholder without consuming the whole row.
- Preserve existing permission behavior for configuration and existing handlers for password change, logout, and printing.

## Proposed Layout

The authenticated page uses two compact top areas:

1. Header row:
   - Left: department eyebrow and page title.
   - Right: `配置`, `打印周表`, `打印月表`, and a user dropdown labeled with the username, such as `admin`.

2. Schedule operation row:
   - Current schedule week label, for example `第26周`.
   - Date picker for selecting the schedule date.
   - Previous week button.
   - `本周` button.
   - Next week button.
   - Current week range text.
   - `搜索人员` label.
   - Staff search input with a moderate width.
   - Displayed staff count.
   - `复制上一周`, `批量休息`, `批量办公`, and `批量清空` actions.

The header user label no longer includes the role label such as `系统管理员`. Role and permission explanations remain in the existing `使用说明` page.

The schedule week label uses the same Monday-to-Sunday week model as the schedule grid. For the selected week `2026-06-22 至 2026-06-28`, the label is `第26周`.

## User Menu

The username control opens a dropdown with:

- `修改密码`
- `退出登录`

Choosing `修改密码` opens the existing password change dialog. Choosing `退出登录` calls the existing logout flow. The menu should keep test hooks for these actions so the current behavior remains easy to verify.

The dropdown must render above the page content and avoid covering important controls in the schedule operation row. The row should leave practical right-side breathing room below the user menu area on desktop, and the dropdown should use a sufficient stacking layer.

## Component Boundaries

- `App.vue` owns the current user and global action handlers. It should pass the username to the header control and wire dropdown commands to the existing handlers.
- `AppToolbar.vue` should no longer render password change, configuration, print, fullscreen, or logout buttons. Its remaining responsibility should be narrowed or replaced so the schedule operation row can combine week controls with staff search and batch schedule actions.
- The fullscreen handler and button should be removed from the visible home page workflow.
- Styles should keep the header compact on desktop and allow wrapping on narrow screens without overlapping the title, operation row, dropdown, or action controls.

## Permissions

The `配置` action remains disabled when the current account cannot manage configuration. Batch schedule actions keep their current permission and busy-state behavior. This design does not change role rules, editable staff scope, account binding, or backend authorization.

## Mobile Behavior

On narrow screens, the header may wrap into multiple visual lines. The title stays first, then the compact action group wraps below if needed. The user dropdown remains visible as the account entry point. The schedule operation row may wrap into multiple lines in this order: week controls first, then search, then batch actions. It should not horizontally overflow or overlap the user dropdown.

## Testing

Add or update focused tests to verify:

- The header shows `admin` without the role text.
- Password change and logout are emitted from the user dropdown.
- Configuration, print week, and print month actions remain available in the header.
- The fullscreen action is no longer rendered.
- The schedule operation row renders `第26周`, date controls, week range, staff search, displayed count, and batch actions in the same row on desktop.
- The staff search input uses a moderate width instead of stretching across the row.
- CSS tests cover the compact header action layout, dropdown stacking/spacing expectations, and removal of the old toolbar action group.

## Out Of Scope

- No changes to schedule grid behavior.
- No changes to shift palette display.
- No changes to permission semantics.
- No redesign of the sidebar tabs or help page content.
