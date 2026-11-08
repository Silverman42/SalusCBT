# T-304 · PbqHashCheck component (installer integrity)

| | |
| --- | --- |
| Stage | 3 · Interactive PBQs |
| Depends on | [T-213](../stage-2-exam-engine/T-213-exam-runner-ui.md) |
| Requirements | `PB-1`, `QA-2` |
| Design refs | LLD §14.4 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Vendor and computed hashes side by side.

## Steps

- Align vendor and computed hashes by filename.
- Full hash always visible (no truncation) — wraps on small screens.
- Filename pick part, then two shuffled MC parts (3b, 3c).

## Files

- `app/components/pbq/PbqHashCheck.vue`

## Acceptance criteria

- [x] Readable at 360 px without hiding characters. (Every hash is shown whole with `break-all`; at 360 px each wraps onto two lines inside its card, no page scroll. Checked at 360, 375 and 1280 px, light and dark, PBQ 3 and B3.)

## Tests

- `tests/unit/pbq/hashCheck.test.ts`: PBQ 3 and B3 line up by file name in the pick part's order, full 64-character hashes on both sides, command line kept apart, out-of-order and one-sided files, fallback (`null`) when a line doesn't parse; answers store the picked file and MCQ option ids as given, `null` once cleared; MCQ part options keep paper order and ids.

## Notes

- `app/components/pbq/PbqHashCheck.vue`, wired as `hashCheck` in `QuestionPbq.vue`. Pure helpers: `app/lib/pbq/hashCheck.ts` (`parseHashListing`, `alignHashes`), `app/lib/pbq/partAnswers.ts` (`partText`, `withPartText`, `mcqPartOptions`; shared with T-305), `app/lib/pbq/shellPrompt.ts` (prompt/command split; shared with T-305).
- Layout after mockup screen 03 (no hashCheck screen exists): one "SHA-256 check" code panel on the left with the two commands (`$ cat vendor_hashes.txt`, `$ sha256sum …`) and a card per file showing Vendor and Computed hashes one above the other in the same column, so they wrap at the same points. No highlighting of the differing pair (the student has to compare). If either listing has a line that isn't `hash  file`, the two raw listings are shown instead.
- Parts: 3a native `<select>` ("Choose a file"), 3b/3c radio groups (`fieldset`/`legend`) with options in the paper's order and ids untouched; letters follow screen position. Clicks and selects emit without `debounce`.
- "Two shuffled MC parts": the paper's option order is used as given; the component never reorders.
- The artefact panel is a focusable named region. Read-only disables the select and radios.
- Slot `part-mark` (`{ part }`) after each part, for T-309 review marks.
