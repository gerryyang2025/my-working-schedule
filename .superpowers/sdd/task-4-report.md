### Task 4 Report: ScheduleImportPanel

Implemented `ScheduleImportPanel` as an isolated Vue component for pasted historical weekly schedule import.

Files changed:
- `src/components/ScheduleImportPanel.vue`
- `src/components/ScheduleImportPanel.test.ts`
- `src/styles/main.css`

Summary:
- Added the required example format with the 2026-07-20 to 2026-07-26 weekly TSV sample rows.
- Added paste input, validation action, clear action, validation error display, preview summary, preview table, no-importable state, and confirm action.
- Wired preview through `validateScheduleImportText({ rawText, data })` using only component props and `confirmImport(rawText)` emit for parent integration.
- Rendered matched staff name, derived job ID, localized staff type, each day, raw-to-resolved shift display, alias display, import status, skipped-existing status, and existing shift labels.
- Added responsive styles scoped to the import panel in `src/styles/main.css`.

Verification:
- `npm run test -- src/components/ScheduleImportPanel.test.ts` passed: 5 tests.
- `npm run lint` passed.
