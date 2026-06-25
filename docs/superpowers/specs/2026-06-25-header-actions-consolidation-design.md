# Header Actions Consolidation Design

## Background

The schedule home page currently splits account identity and common actions across two top rows. The header only shows the current user identity, while the next toolbar row contains week navigation, password change, configuration, printing, fullscreen, and logout actions. On wide screens this leaves unused space in the header and makes the action row visually crowded.

## Goals

- Show the current user as the account name only, for example `admin`.
- Move global actions up into the top header beside the user menu.
- Reduce visible button count by placing account-specific actions inside the `admin` dropdown.
- Keep the week navigation row focused on date and week selection.
- Preserve existing permission behavior for configuration and existing handlers for password change, logout, printing, and fullscreen.

## Proposed Layout

The authenticated page uses two compact top areas:

1. Header row:
   - Left: department eyebrow and page title.
   - Right: `配置`, `打印周表`, `打印月表`, `全屏`, and a user dropdown labeled with the username, such as `admin`.

2. Week toolbar row:
   - Date picker.
   - Previous week button.
   - `本周` button.
   - Next week button.
   - Current week range text.

The header user label no longer includes the role label such as `系统管理员`. Role and permission explanations remain in the existing `使用说明` page.

## User Menu

The username control opens a dropdown with:

- `修改密码`
- `退出登录`

Choosing `修改密码` opens the existing password change dialog. Choosing `退出登录` calls the existing logout flow. The menu should keep test hooks for these actions so the current behavior remains easy to verify.

## Component Boundaries

- `App.vue` owns the current user and global action handlers. It should pass the username to the header control and wire dropdown commands to the existing handlers.
- `AppToolbar.vue` should become week-navigation focused. It should no longer render password change, configuration, print, fullscreen, or logout buttons.
- Styles should keep the header compact on desktop and allow wrapping on narrow screens without overlapping the title, toolbar, or action controls.

## Permissions

The `配置` action remains disabled when the current account cannot manage configuration. This design does not change role rules, editable staff scope, account binding, or backend authorization.

## Mobile Behavior

On narrow screens, the header may wrap into multiple visual lines. The title stays first, then the compact action group wraps below if needed. The user dropdown remains visible as the account entry point. The week toolbar keeps its existing responsive behavior, with the week range on its own line when space is limited.

## Testing

Add or update focused tests to verify:

- The header shows `admin` without the role text.
- Password change and logout are emitted from the user dropdown.
- Configuration, print week, print month, and fullscreen actions remain available in the header.
- The weekly toolbar no longer renders account actions.
- CSS tests cover the compact header action layout and removal of the old toolbar action group.

## Out Of Scope

- No changes to schedule grid behavior.
- No changes to shift palette display.
- No changes to permission semantics.
- No redesign of the sidebar tabs or help page content.
