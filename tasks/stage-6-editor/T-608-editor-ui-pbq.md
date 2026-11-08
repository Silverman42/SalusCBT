# T-608 · Editor UI: PBQ template forms, generate, preview, publish

| | |
| --- | --- |
| Stage | 6 · Question editor |
| Depends on | [T-606](T-606-editor-generate-preview.md), [T-607](T-607-editor-ui-versions-mcq.md) |
| Requirements | `ED-1`, `ED-2` |
| Design refs | PRD Tutor question editor table |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Fill-in templates for the five PBQ types.

## Steps

- `PbqTemplateForms`: one form per template with the fields in the PRD table.
- "Generate new values" button; "Preview as student" opens a preview attempt; Publish button shows issues if blocked.
- Classes can then pick the published version (T-501).

## Files

- `app/components/tutor/PbqTemplateForms/*.vue`

## Acceptance criteria

- [ ] A generated version can be previewed, marked and published from the UI. (UI built for
  every step: Generate, Preview as student → sit → submit → result and review, Publish. Not yet
  exercised end to end signed in; T-609's Playwright run covers it.)

## Notes

- Files live under `app/components/editor/` (`PbqForm.vue`, `pbq/PartFields.vue`,
  `pbq/FirewallFields.vue`, `pbq/FieldMessage.vue`) rather than `app/components/tutor/PbqTemplateForms/`,
  next to the T-607 editor. `EditorPbqSummary` is removed; `VersionEditor.vue` renders `EditorPbqForm`.
- One form state for all five templates (`app/lib/editorPbq.ts`): question text, domain, set
  (A/B; moving saves to the end of the other set), scenario, the template's text artefacts (log,
  scan, vendor/computed hashes, listings + sshd_config, firewall diagram), then parts (id, answer
  type, scored/practice, prompt, and the key: one answer, two ports, a pick from one-per-line
  choices, or a ticked MCQ option) or, for firewall, requirements and port choices (one per line),
  action choices, and rules with the correct port and action. Parts, MCQ options and rules can be
  added and removed (a new firewall rule goes before a final `Any` rule).
- Live validation: the form's own checks in plain words, then `validatePayload` / `validatePbqKey`
  from `shared/validate` (the server's save checks), one message per field. Errors show inline as
  you type; Save shows a focused error summary linking to each field. Server `VALIDATION_FAILED`
  paths map onto the same fields (`question.payload.log` → Log text, `key.parts.parts.1b` → part
  1b's answer, `key.parts.rules[2].port` → rule 3's port). `editor.validate` issues for the
  question that the fields can't show (ED-2 recompute, missing keys) are listed as "Before
  publishing". Blank answers are left out of the key, so a scored part without one is reported.
- "Generate new values" opens a dialog with an optional seed (0–4294967295), calls
  `editor.generate` (which saves), refills the form and shows "generated from seed N".
- "Student view" (collapsible, in the form) renders the current, unsaved values with the student
  PBQ components (`ExamQuestionPbq`); answers there are local only.
- Preview as student: header button (authored versions) → choose standard (set A) or retake
  (set B, disabled without set B PBQs) → `editor.previewAttempt`. The returned anon token is kept
  in this tab's sessionStorage under `salus.preview.v1.<attemptId>` (`app/lib/editorPreview.ts`),
  never in `useAnonIdentity`, and the tutor goes to `/tutor/versions/[id]/preview/[attemptId]`
  (`[id].vue` moved to `[id]/index.vue`): a simplified runner in the staff layout (student MCQ and
  PBQ components, navigator, saves per question with `PreviewSaver`, minutes left, submit with
  confirm), then `ResultSummary` and `ResultReviewList` from `review.getResult` / `getReview` with
  that token. `useAttempt`, `useAnonIdentity` and the student runner pages are untouched. A preview
  opened in another tab says to start a new one from the editor.
- Checked: `npm run typecheck`, `lint`, `format:check`, `npm test` (52 new unit tests: form ↔
  payload/key round trips for every template in sets A and B against the real generators and
  `checkQuestion`, live checks, path → field mapping, list edits, preview tickets, `PreviewSaver`).
  Live: Nuxt dev on :4600 with a temporary fixture page (deleted) rendering `EditorPbqForm` for all
  five templates: no console errors, student view renders, live errors and the summary work,
  light/dark, fits 375 px (domain/set selects now shrink). Signed out, `/tutor/versions/<id>` and
  `/tutor/versions/<id>/preview/<attemptId>` redirect to `/sign-in?redirect=…`. Signed-in flows
  (save, generate, preview, publish against Convex) were not exercised.
