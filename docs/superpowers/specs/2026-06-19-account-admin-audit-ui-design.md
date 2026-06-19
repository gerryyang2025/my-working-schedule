# Account Admin Audit UI Design

## Scope

This stage turns the existing auth, role, and audit foundation into usable management features:

- Admins can maintain login accounts from the existing system configuration drawer.
- Logged-in users can change their own password from the toolbar.
- Admins can view recent audit logs from the existing system configuration drawer.

The stage does not bind accounts to nursing staff records yet. Staff scheduling identity and login identity remain separate until a later permissions model needs staff-level ownership.

## Product Behavior

### Account Management

The system configuration drawer gains an "账号" tab visible to admins. It lists accounts with username, display name, role, enabled state, and update time. Admins can:

- Create an account with username, display name, role, enabled state, and initial password.
- Edit display name, role, and enabled state.
- Reset a password by entering a new password on the account form.

Roles remain:

- `admin`: can manage accounts, configuration, scheduling, month settlement, and audit logs.
- `scheduler`: can maintain scheduling and month settlement.
- `viewer`: read-only access after login.

The backend prevents invalid account data and protects against disabling or demoting the last enabled admin.

### Password Change

The toolbar current-user area gains a "修改密码" action. Any logged-in user can submit current password and new password. The server verifies the current password before updating the hash. A successful password change revokes the current session and asks the user to log in again, so old credentials cannot continue silently.

### Audit Log Viewer

The system configuration drawer gains an "审计" tab visible to admins. It shows recent audit logs with time, account, action, object type, summary, IP, and user agent. The first version supports server-side filters:

- Username
- Action
- Keyword against summary, target type, or target id
- Limit, capped by the server

## API Design

- `GET /api/users`: admin only, returns `{ rows }`.
- `PUT /api/users/:id`: admin only, creates or updates one account. Password is required for creation and optional for update.
- `PUT /api/auth/password`: logged-in users, verifies current password and sets new password.
- `GET /api/audit-logs`: admin only, accepts `username`, `action`, `keyword`, and `limit`.

`/api/admin/session` remains as a compatibility login alias for the bootstrap admin.

## Data Design

The existing SQLite tables are reused:

- `users`
- `user_sessions`
- `audit_logs`

No schema migration is needed. The auth store gains user maintenance and filtered audit listing methods for both memory and SQLite implementations so tests can use the same route surface.

## UI Design

The feature stays inside the current UI shell:

- `AppToolbar` shows current user and emits password-change events.
- `PasswordChangeDialog` handles self-service password updates.
- `ManagementDrawer` adds account and audit tabs alongside staff, shifts, and holidays.

Mobile behavior follows the existing management drawer pattern: tables remain for desktop, compact stacked items are used for mobile where needed.

## Testing

Backend tests cover:

- Admin account creation and update.
- Rejecting duplicate usernames and invalid roles.
- Preventing removal of the last enabled admin.
- User password change with correct and incorrect current password.
- Filtered audit log listing.

Frontend tests cover:

- Toolbar emits password-change action.
- Password dialog validates and emits payload.
- Management drawer displays account and audit tabs and emits account-save/audit-filter events.
- App wires API calls to the new UI and refreshes users/audit logs.

