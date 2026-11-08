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

- [ ] A generated version can be previewed, marked and published from the UI.
