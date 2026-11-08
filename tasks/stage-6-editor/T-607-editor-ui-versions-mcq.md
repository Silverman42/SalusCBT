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
- `app/components/tutor/McqForm.vue`
- `app/components/tutor/VersionEditor.vue`

## Acceptance criteria

- [ ] All tutor text rendered as plain text.
