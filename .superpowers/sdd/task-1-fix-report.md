# Task 1 Fix Report

## Changed Files

- `src/lib/schedule-import.ts`
- `src/lib/schedule-import.test.ts`
- `.superpowers/sdd/task-1-fix-report.md`

## Fixes

- Preview now treats any existing schedule entry for a staff/date as `skip-existing`, including entries with empty `shiftIds` and blank `note`.
- Apply results now count defensive apply-time skips caused by stale/existing schedule entry IDs.

## Tests Run

- `npm run test -- src/lib/schedule-import.test.ts`
- `npm run lint`
