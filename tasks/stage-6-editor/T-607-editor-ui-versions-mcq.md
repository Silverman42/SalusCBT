# T-607 · Editor UI: versions list and MCQ form

| | |
| --- | --- |
| Stage | 6 · Question editor |
| Depends on | [T-603](T-603-editor-validate-publish.md) |
| Requirements | `ED-3`, `ED-8`, `ED-9` |
| Design refs | LLD §14.1 (`/tutor/versions`) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Screens for managing versions and editing multiple-choice questions.

## Steps

- `/tutor/versions`: list, new draft from default or own version, restore old version.
- `/tutor/versions/[id]`: question list with add/remove/reorder; `McqForm` (stem, options, correct answers, Choose TWO, domain, explanation).
- Validation issue list with links to the problem question.

## Files

- `app/pages/tutor/versions/index.vue`
- `app/pages/tutor/versions/[id].vue`
- `app/components/editor/McqForm.vue` (`<EditorMcqForm>`)
- `app/components/editor/VersionEditor.vue` (`<EditorVersionEditor>`)
- `app/components/editor/QuestionList.vue`, `IssuePanel.vue`, `PbqSummary.vue`, `NewDraftDialog.vue`
- `app/composables/useEditorAction.ts`, `app/lib/editor.ts`
- `tests/unit/editor.test.ts`

## Acceptance criteria

- [x] All tutor text rendered as plain text. (Interpolation / `v-text` only; a unit test fails on
      any `v-html` or `innerHTML` in the editor pages and components.)

## Notes

- Components live in `app/components/editor/` (not `components/tutor/`, which T-505 owns), so they
  resolve as `<EditorMcqForm>`, `<EditorVersionEditor>` and so on.
- `/tutor/versions` (staff layout): drafts, published and archived cards from `editor.myVersions`.
  "New draft" copies the newest default version (or any visible version picked in the dialog);
  each row has Edit/View (authored versions only; `getDraft` is author-only) and "New draft from
  this", which reads "Restore" for an older published version in its line (ED-3). Both call
  `editor.createDraft` and open the new draft.
- `/tutor/versions/[id]` follows mockup screen 11 inside the staff layout: header strip (label,
  "v3 · draft · copied from …", status badge, PBQs / Multiple choice tabs, Publish), question list
  (search, add, Q-number + stem, issue dot, up/down reorder buttons with a live-region
  announcement; reorder is hidden while searching), the MCQ form, and side cards: live
  `editor.validate` issues (errors then warnings, question issues jump to the question), totals
  computed from the questions, and the line's published versions with Restore. Columns: one on
  phones (issues first), two from `lg`, three from `2xl`.
- `McqForm`: question text, Choose TWO switch, domain select, 2–6 options with a tick per correct
  answer (Choose ONE acts like a radio; Choose TWO keeps the newest two ticks), removing an option
  re-letters the rest and keeps ticks on their text, explanation. Save-blocking problems (domain,
  blank text/options, lengths) are checked before the call; the server's `VALIDATION_FAILED`
  `issues` map onto the same fields (`fieldForPath`: `question.options[1].id` → option B's box,
  `key.correct[0]` → the ticks). An error summary (focused, `role="alert"`) links to each field;
  fields get `aria-invalid` and `aria-describedby`. Publish-time gaps (tick count ≠ Choose
  ONE/TWO, missing explanation) show as warnings and don't block the save (matches
  `checkQuestion`). Unsaved changes ask before switching question.
- Remove uses `AdminConfirmDialog`; Publish has its own confirm (non-destructive styling) saying
  published versions never change and started attempts keep their version; it's disabled while
  `validate` reports errors, and a blocked publish lists the server's issues in the dialog.
- Non-editable versions (published, archived, or another tutor's draft viewed by the admin) render
  read-only with the reason and a "New draft from this" / "Restore" button.
- PBQs show a read-only summary (`EditorPbqSummary`) and can be reordered within their set. Seam
  for T-608: render the template forms in place of `EditorPbqSummary` in `VersionEditor.vue`, and
  add "Preview as student" / "Generate new values" to the header strip.
- Checked: `npm run typecheck`, `lint`, `format:check`, `npm test` (28 new unit tests). Live: Nuxt
  dev on :4100, signed-out `/tutor/versions` and `/tutor/versions/<id>` redirect to
  `/sign-in?redirect=…`; every editor page, component and helper compiles in Vite with no console
  errors. The signed-in screens were not exercised (no tutor session in the test browser).
