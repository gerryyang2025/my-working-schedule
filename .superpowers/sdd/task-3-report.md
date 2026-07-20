### Task 3 Report: API Client Contract

**Implemented**
- Added exported schedule import request/response/result types in `src/api/client.ts`.
- Added `previewScheduleImport(rawText)` for `POST /api/data/schedule-import/preview`.
- Added `confirmScheduleImport(rawText)` for `POST /api/data/schedule-import`.
- Reused shared `ScheduleImportPreview`, `ScheduleImportApplyResult` without `data`, and `PublicAppData` for returned app data.

**Tests**
- No focused client test was added because there is no existing API-client test pattern in the repo.
- Ran `npm run lint` successfully.
