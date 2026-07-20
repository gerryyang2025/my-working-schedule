# Task 7 Report: Schedule Import Review Fixes

## RED Results

- `npm run test -- src/lib/schedule-import.test.ts src/components/ScheduleImportPanel.test.ts`
  - Failed as expected before production edits.
  - Empty placeholder preview still returned `status: "skip-existing"` instead of `status: "import"`.
  - Apply-time empty placeholder still counted as skipped and remained empty (`imported` was 13 instead of 14).
  - `ScheduleImportPanel` did not call `previewScheduleImport`; preview/error tests showed 0 calls to the API mock and rendered local preview data instead.
- `npm run test -- src/App.test.ts -t "import tab|imports pasted schedule|passes schedule import errors"`
  - Failed as expected before production edits.
  - Confirm-time import API error details were not passed into the panel; rendered server error text was empty.

## GREEN Results

- `npm run test -- src/lib/schedule-import.test.ts src/components/ScheduleImportPanel.test.ts`
  - Passed: 17 tests.
- `npm run test -- src/App.test.ts -t "import tab|imports pasted schedule|passes schedule import errors"`
  - Passed: 4 matching tests.
- `npm run test -- server/routes.test.ts -t "schedule import|导入排班|imports schedule text|invalid schedule import|managed staff permissions for schedule import"`
  - Sandboxed run failed with `listen EPERM: operation not permitted 0.0.0.0`.
  - Unsandboxed rerun passed: 7 matching tests.
- `npm run build`
  - Passed.
  - Vite emitted existing Rollup comment/chunk-size warnings.

## Files Changed

- `src/lib/schedule-import.ts`
- `src/lib/schedule-import.test.ts`
- `src/api/client.ts`
- `src/components/ScheduleImportPanel.vue`
- `src/components/ScheduleImportPanel.test.ts`
- `src/App.vue`
- `src/App.test.ts`

## Summary

- Empty schedule placeholders are now occupied only when they have at least one shift ID or a non-blank note.
- Preview treats blank placeholders as importable while preserving real occupied entries as skipped.
- Apply replaces blank placeholders for matching date/staff cells and still skips occupied entries.
- The import panel now uses server preview data from `previewScheduleImport`.
- API `errors` arrays survive through `requestJson` and are rendered by the panel for preview and confirm failures.
- App confirm revalidation remains server-side and passes returned validation details back into the panel.

## Residual Risks

- The panel does not abort or de-duplicate overlapping preview requests; stale responses are still guarded by the raw-text match before confirmation, but the visible preview can momentarily reflect whichever request resolves last.
