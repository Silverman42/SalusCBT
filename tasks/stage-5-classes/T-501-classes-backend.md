# T-501 · Classes backend: create, update, list, lookup

| | |
| --- | --- |
| Stage | 5 · Classes |
| Depends on | [T-404](../stage-4-auth/T-404-profiles-admin-bootstrap.md) |
| Requirements | `CL-1`, `CL-2`, `CL-3`, `CL-4` |
| Design refs | LLD §5.2, §5.1 (`lookupCode`) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Tutors create classes with short codes; students look them up.

## Steps

- `classes.create`: version must be published and owned by caller or default; code like `SEC-4K7Q` (no 0/O/1/I), unique, retry on clash; audit `class.created`.
- `classes.update`: owner check; close/open; change version (new attempts only); audit `class.closed`.
- `classes.mine`.
- Public `classes.lookupCode({ code })` → `{ name, open }` or `null`.

## Files

- `convex/classes.ts`

## Acceptance criteria

- [x] Closed code refuses new attempts, past results stay.
- [x] Tutor A cannot update tutor B's class (`NOT_FOUND`).

## Notes

- Tests: `tests/convex/classes/classes.test.ts` (convex-test, 15 cases).
- Version rule (CL-3): `published` and either the caller's own (`ownerId`) or a default version (no `ownerId`); the admin may use any published version. Otherwise `NOT_FOUND`, the same as a missing one.
- `timeMultiplier` must be one of 1, 1.25, 1.5, 2 (EX-21), default 1; name is trimmed, 1–80 chars. Bad input is `VALIDATION_FAILED`.
- Codes come from `convex/lib/classCodes.ts` `allocateClassCode`: draw `newClassCode()`, check `by_code`, up to 8 draws, then a plain error. The `by_code` read is in the mutation's read set, so concurrent creates that draw the same code conflict and retry (OCC).
- `update` patches only given fields; a version change is checked only when it differs. Each attempt stores its own `versionId`, so version and multiplier changes apply to new attempts only (tested through `attempts.start`). `class.closed` is audited on an open → closed transition only; reopening has no §12.2 event and is not audited.
- `mine` returns `ClassSummary` `{ classId, name, code, status, versionId, versionLabel, timeMultiplier, tutorId, createdAt }`, newest first, capped at 500. The admin sees every class.
- `lookupCode` uses the same normalisation and 32-char cap as `attempts.start` and returns `null` for unknown or blank input. `open` is `status === "open"` and the version still `published`, i.e. whether a start would pass the class checks. Every class needs a display name (CL-4), so no extra flag.
- Open: `lookupCode` is a query (LLD §5.1, reactive as the student types, T-508), so it cannot spend rate-limiter tokens and is not throttled. §12.1 has no lookup limit. It reveals only a class name and open flag; if enumeration of the ~1M code space matters, add a `classLookup` limit by moving lookup behind a Nuxt server route or a mutation.
