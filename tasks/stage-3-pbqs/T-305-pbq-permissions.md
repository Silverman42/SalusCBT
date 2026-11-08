# T-305 · PbqPermissions component (permissions and SSH)

| | |
| --- | --- |
| Stage | 3 · Interactive PBQs |
| Depends on | [T-213](../stage-2-exam-engine/T-213-exam-runner-ui.md) |
| Requirements | `PB-1`, `QA-2` |
| Design refs | LLD §14.4 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

`ls -l` listings and `sshd_config` shown as a terminal.

## Steps

- Terminal-styled read-only blocks.
- Inputs: filename, two octal modes (`inputmode="numeric"`), directive name.

## Files

- `app/components/pbq/PbqPermissions.vue`

## Acceptance criteria

- [x] `0640` and `640` both accepted (via marking). (The component stores the text as typed; `norm.octal` makes them equal: `tests/unit/marking/normalise.test.ts` "0640 = 640", `tests/unit/marking/score.test.ts` "applies the normalisers".)

## Tests

- `tests/unit/pbq/permissions.test.ts`: PBQ 4 and B4 have path, octal, octal, directive parts; prompt/command split (`$` and `#`); every artefact line tagged (prompt, `#` comment, output) with the text kept exactly; `cat` target as the sshd panel title; answers stored as typed (`640`, `0600`), `null` when every blank is empty.

## Notes

- `app/components/pbq/PbqPermissions.vue`, wired as `permissions` in `QuestionPbq.vue`. Helpers: `app/lib/pbq/shellPrompt.ts` (`terminalLines`, `catTarget`), `app/lib/pbq/partAnswers.ts`.
- Layout after mockup screen 03: two read-only terminal panels on the left ("File listings" with both `ls` commands, and `/etc/ssh/sshd_config` from the `cat` command), answer panel on the right. Prompts are tinted, commands bold, `#` comments muted; nothing else is highlighted (no hints). Each line keeps its spacing (`whitespace-pre`) and the panel scrolls inside itself (max 60vh), so the page never scrolls sideways at 360 px. Panels are focusable regions named by their title.
- Inputs: 4a path and 4d directive as text, 4b/4c octal with `inputmode="numeric"` and `maxlength=8`; all `autocomplete/autocapitalize/spellcheck` off. Typing emits with `{ debounce: true }`. The value is not normalised in the browser.
- Read-only disables the inputs. Slot `part-mark` (`{ part }`) after each part for T-309.
