# T-503 · CSV export and deleting attempts

| | |
| --- | --- |
| Stage | 5 · Classes |
| Depends on | [T-502](T-502-class-dashboard-queries.md) |
| Requirements | `CL-8`, `CL-11`, `PR-5` |
| Design refs | LLD §5.2 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Export results and delete attempts with full cascade.

## Steps

- `classes.exportCsv` action: escape fields, guard against CSV formula injection (`=`, `+`, `-`, `@`).
- `classes.deleteAttempts({ attemptIds })` (max 100): owner check per attempt; delete responses and share links; audit `attempt.deleted` with count.

## Files

- `convex/classes.ts`

## Acceptance criteria

- [x] Deleted attempt's share link returns `null`. (Verified by the rows being gone in the same transaction; `shareLinks.view` is T-504, which looks links up by `publicId`.)
- [ ] CSV opens cleanly in Excel and Sheets. (RFC 4180 output with BOM and CRLF, round-trip parsed in tests; still needs a manual open in Excel and Sheets once T-505 downloads it.)

## Notes

- `classes.exportCsv` is an action (LLD §5.2) returning the CSV string; it calls `internal.classes.exportCsvData`, which runs `requireProfile` + `requireClassOwner` on the identity passed through. Builder is in `convex/lib/classCsv.ts`.
- Columns: Name, Mode, Status, Started (UTC), Submitted (UTC), Submitted by, Time used (min), Scaled score, Result (Pass/Fail), Points, Total points, Flagged, Domain 1.0–5.0 (%), Attempt ID. Score columns are blank unless the attempt is submitted. Same newest-first, `CLASS_ATTEMPTS_LIMIT` rows as the dashboard. No `anonKey`, `ipHash` or share-link data.
- Escaping: fields with `,` `"` CR or LF are quoted with `""` for inner quotes; text cells starting with `=`, `+`, `-`, `@`, tab or CR get a leading `'`. The string starts with a UTF-8 BOM (`﻿`) so Excel reads non-ASCII names; the client should download it as `text/csv;charset=utf-8` without adding another BOM.
- `classes.deleteAttempts({ attemptIds })` → `{ deleted }`: dedupes, max `MAX_DELETE_ATTEMPTS` (`VALIDATION_FAILED`), checks every id with `ownedClassAttempt` before deleting anything. A missing id, an attempt without a class or one in another tutor's class fails the whole call with `NOT_FOUND` (unlike `admin.deleteAttempts`, which skips missing ids), so nothing is revealed and nothing is half-deleted. Admin may delete in any class. Audit `attempt.deleted`, `meta: { count, classIds }`, `target` = the class id when there is one class.
- Tests: `tests/convex/classes/csvDelete.test.ts`; both functions are listed in `tests/convex/leak.test.ts` `STAFF_ONLY` and the other-tutor `NOT_FOUND` check.
