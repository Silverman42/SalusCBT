# T-505 · Tutor UI: classes list and live class page

| | |
| --- | --- |
| Stage | 5 · Classes |
| Depends on | [T-502](T-502-class-dashboard-queries.md), [T-503](T-503-csv-delete.md), [T-403](../stage-4-auth/T-403-auth-proxy-client.md) |
| Requirements | `CL-1`, `CL-2`, `CL-5`, `CL-6`, `CL-8`, `CL-11` |
| Design refs | LLD §14.1 (`/tutor`, `/tutor/classes/[id]`) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Tutor screens to run a class.

## Steps

- `/tutor`: classes list, create class (name, version), show code with copy button.
- `/tutor/classes/[id]`: live attempt table with sort and filter, stats panel, CSV download, close/open, multi-select delete with confirmation.

## Files

- `app/pages/tutor/index.vue`
- `app/pages/tutor/classes/[id].vue`
- `app/components/tutor/ClassTable.vue`
- `app/components/tutor/AttemptTable.vue`

## Acceptance criteria

- [ ] Delete asks for confirmation and says it is permanent.
