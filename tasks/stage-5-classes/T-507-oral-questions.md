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

- [x] All 10 oral questions show with model answers.

## Notes

- Done 2026-11-08 (not committed). `convex/content.ts` `oralQuestions({ versionId? })` → `{ versionId, label, versionNo, isDefault, questions: { order, question, modelAnswer }[] } | null`. No `versionId` = the default exam's (`sy0-701`) current version; `null` when no default exam exists. Capped at `MAX_VERSION_ORAL` (100).
- **Deviation from LLD §5.1/§14.1 ("public"):** tutor-only (`requireProfile(ctx, ["tutor"])`, admin passes), with the editor's ED-5 visibility (`requireVisibleVersion`: own versions + published default versions; admin all; else `NOT_FOUND`). Model answers are marking material and the T-209 leak test treats them as key values, so no anonymous path returns them. PRD CL-10's "or a study partner" then means someone sitting with a tutor; a student-facing version would need the leak test's `SECRET_VALUES` changed on purpose.
- Page `/oral` (`app/pages/oral.vue`), staff layout, `middleware: "tutor"`; the sidebar item was already in `app/lib/staffNav.ts`. `nuxt.config.ts` gets `"/oral": { ssr: false }`, like the other staff routes. `?version=<id>` picks a version (a version select lists `editor.myVersions`); T-505 can link a class to `/oral?version=<class.versionId>`.
- `app/components/oral/OralQuestionDeck.vue` (keyed by version): "Question n of N", numbered jump buttons (`aria-current="step"`), question, Reveal/Hide model answer button (`aria-expanded` + `aria-controls`), Previous / Next. Keys: ← / → move, A toggles the answer (ignored in fields/selects and with modifiers). The answer hides again on each move. No mockup screen exists for it (only the sidebar link in screen 09); the card follows the exam runner's question and footer styles.
- Tests: `tests/convex/content/oral.test.ts` (6), `tests/unit/oral.test.ts` (5); `content:oralQuestions` is in `STAFF_ONLY` (leak.test.ts) and `access: "tutor"` (access.test.ts).
