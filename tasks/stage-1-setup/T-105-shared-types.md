# T-105 · Shared content and answer types with validators

| | |
| --- | --- |
| Stage | 1 · Setup |
| Depends on | [T-101](T-101-scaffold-project.md) |
| Requirements | `SE-1`, `ED-2` |
| Design refs | LLD §3.2 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Define `PbqPayload`, part types, `PbqKey` and `AnswerValue` in `shared/` so the app, Convex and the parser use the same shapes.

## Steps

- Write `shared/content.ts` with the types from LLD §3.2.
- Add runtime validators (Convex `v` validators or zod) for each `PbqPayload` template and for `AnswerValue`.
- Export a `validatePayload(template, payload)` helper used by seeding and the editor.

## Files

- `shared/content.ts`
- `shared/validate.ts`

## Acceptance criteria

- [ ] Types compile in both `app/` and `convex/`.
- [ ] Validators reject a payload with a missing part or wrong template.

## Tests

- Unit tests: one valid and one invalid payload per template.
