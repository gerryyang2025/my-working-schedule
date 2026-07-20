Task 5: App Integration

Status: DONE

Implementation:
- Added the editable-only `导入` workbench tab after `查询`.
- Rendered `ScheduleImportPanel` in the import tab with current app data and saving state.
- Wired `confirmScheduleImport(rawText)` from `src/api/client.ts` to replace `data.value` on success.
- Added concise success/error messaging, duplicate-submit guard, no-permission guard, and a permission-loss fallback back to `排班`.
- Updated App tests with API mocks, an import panel stub, editable/viewer visibility coverage, and confirm-flow coverage.

Verification:
- `npm run test -- src/App.test.ts -t "import tab|imports pasted schedule"`: passed, 3 tests.
- `npm run test -- src/App.test.ts -t "query tab|import tab|imports pasted schedule"`: passed, 4 tests.
- `npm run lint`: passed.
