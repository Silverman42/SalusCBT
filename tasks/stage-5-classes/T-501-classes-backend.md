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

- [ ] Closed code refuses new attempts, past results stay.
- [ ] Tutor A cannot update tutor B's class (`NOT_FOUND`).
