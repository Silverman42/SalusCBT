# T-308 · Lab download: build-lab.sh and Lab D instructions

| | |
| --- | --- |
| Stage | 3 · Interactive PBQs |
| Depends on | [T-001](../stage-0-decisions/T-001-add-source-content.md) |
| Requirements | `LB-9` |
| Design refs | PRD Scope table; LLD §14.1 (`/lab`) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Ship the lab script as a download for the MVP.

## Steps

- Serve `build-lab.sh` and Lab D instructions from a server route with `Content-Disposition: attachment`.
- Show a warning to scan only machines you own.
- Simple `/lab` page with download + instructions (terminal comes in Stage 7).

## Files

- `server/routes/downloads/build-lab.sh.get.ts`
- `app/pages/lab.vue`

## Acceptance criteria

- [ ] Download works; warning visible before the link.

## Notes

- LB-9 moved to Stage 3 in the PRD release plan (2026-11-08), so it ships with the MVP.
