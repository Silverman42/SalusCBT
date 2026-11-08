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

- [x] Types compile in both `app/` and `convex/`.
- [x] Validators reject a payload with a missing part or wrong template.

## Tests

- Unit tests: one valid and one invalid payload per template.

## Notes

- Types in `shared/content.ts` follow LLD §3.2 exactly; added helper aliases only (`PbqTemplate`, `PayloadOf<T>`, `PbqPart`, `PartKind`, `FirewallAction`, `FirewallRuleRow`).
- Validators in `shared/validate.ts` are Convex `v` validators (`pbqPayloadValidator`, `payloadValidators[template]`, `pbqKeyValidator`, `answerValueValidator`, part validators), so the schema and function args can use them directly. A type-level assertion keeps them equal to the hand-written types.
- `validatePayload(template, payload)` returns `{ ok: true, value } | { ok: false, errors: { path, message }[] }` and never throws. Besides shape it checks: payload template matches, non-empty parts, unique part ids, pick/mcq choices, at least one scored part (sshLog, permissions), and non-empty firewall lists.
- Also added `validatePbqKey(payload, key)` (every scored part keyed, portPair = two ports, pick/mcq keys valid, firewall keys from the choice lists; LLD §6.2/§10.2) and `validateAnswerValue(value)`.
- `convex/tsconfig.json` now also includes `../shared/**/*`; the app side imports via `#shared/content` / `#shared/validate`. Verified with temporary imports from both sides.
- Tests: `tests/unit/shared/validate.test.ts` (22 tests, fixtures from set A of the source exam).
