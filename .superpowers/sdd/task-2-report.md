### Task 2 Report: Backend Import Endpoint

**Files changed**
- `server/routes.ts`
- `server/routes.test.ts`
- `.superpowers/sdd/task-2-report.md`

**Implemented**
- Added `POST /api/data/schedule-import/preview` for scheduler/admin preview of pasted schedule text.
- Added `POST /api/data/schedule-import` for confirmed import.
- Reused `validateScheduleImportText` and `applyScheduleImportPreview`.
- Enforced scheduler/admin auth, managed-staff scope checks, whole-batch validation, no-overwrite skip behavior, settled-month blocking through validation, and audit logging on successful confirm.
- Confirm reloads storage data and revalidates inside `storage.update` before mutating.

**Tests run**
- `npm run test -- server/routes.test.ts -t "schedule import|导入排班|imports schedule text|invalid schedule import|managed staff permissions for schedule import"`
  - First sandboxed run failed with `listen EPERM`.
  - Reran with escalation: confirmed new tests failed as 404 before implementation.
  - Reran after implementation: passed, 7 tests.
- `npm run lint`
  - Initially failed on TypeScript narrowing in `server/routes.ts`.
  - Passed after route type cleanup.

**Risks**
- The preview endpoint path is `POST /api/data/schedule-import/preview`; the brief named only the confirm route, while the task scope requested a preview endpoint as well.
- Full route test suite was not run; focused import route tests and lint passed.
