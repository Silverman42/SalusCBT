# T-507 · Oral questions screen

| | |
| --- | --- |
| Stage | 5 · Classes |
| Depends on | [T-109](../stage-1-setup/T-109-seed-import.md) |
| Requirements | `CL-10` |
| Design refs | LLD §5.1 (`content.oralQuestions`), §14.1 (`/oral`) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

One oral question at a time, model answer on click.

## Steps

- Public query `content.oralQuestions({ versionId })`.
- `/oral`: one at a time, Reveal / Next / Previous, keyboard-friendly.

## Files

- `convex/content.ts`
- `app/pages/oral.vue`

## Acceptance criteria

- [ ] All 10 oral questions show with model answers.
