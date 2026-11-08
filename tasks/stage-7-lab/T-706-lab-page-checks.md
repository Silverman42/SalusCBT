# T-706 · Lab page: checks, reset and cheat sheet

| | |
| --- | --- |
| Stage | 7 · Terminal lab |
| Depends on | [T-703](T-703-lab-commands-files.md), [T-704](T-704-lab-commands-text.md), [T-705](T-705-lab-sha256.md), [T-308](../stage-3-pbqs/T-308-lab-download.md) |
| Requirements | `LB-6`, `LB-7`, `LB-8` |
| Design refs | LLD §13.2 (Lab checks) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Put the terminal lab together on `/lab`.

## Steps

- `checks.ts`: Lab A by answer entry; B by tampered filename; C when `etc/shadow` 640, `id_rsa` 600, `PermitRootLogin no`.
- "Reset lab" button.
- `CheatSheet.vue` from Part 5 beside the terminal.
- Keep the download section from T-308.

## Files

- `app/lib/terminal/checks.ts`
- `app/components/lab/CheatSheet.vue`
- `app/pages/lab.vue`

## Acceptance criteria

- [x] Labs A–C show passed when done correctly.

## Notes

- Page (`app/pages/lab.vue`, mockup screen 12): banner, Lab A–D tabs (a tick and ", passed" on a passed lab), the selected step with its check, the terminal with "Reset lab", and the cheat sheet plus a build-lab.sh card beside it (stacked below at phone width). Lab D's tab holds the T-308 download section: the scan warning still comes before the download links (LB-9). The page stays SSR; the lab itself is built on the client in `onMounted` (`seedLab()` needs Web Crypto), memory only.
- Checks (`app/lib/terminal/checks.ts`, `app/components/lab/CheckPanel.vue`): Lab A by answer entry, each field marked right or not yet; Lab B by matching `LabSession.tamperedFile` (name or path accepted); Lab C reads the VFS: `etc/shadow` and `home/deploy/.ssh/id_rsa` modes and the effective `PermitRootLogin` (the first directive outside a comment, as sshd reads it; appending a second line does not pass). The Lab A answers and the Lab C target values are not in the bundle as text: they are stored as salted SHA-256 digests and the normalised input is hashed and compared. That keeps the answer key off the page, it is not a secret (a value like `50` is easy to brute-force). `tests/unit/terminal-checks.test.ts` pins the digests to the Part 6 answers.
- Reset asks first (modal, focus on "Keep working"), then calls `seedLab()` again: new files, new Lab B victim, check forms and passed ticks cleared, focus back on the terminal input. Command history is kept, as in a real terminal.
- Cheat sheet (`app/components/lab/CheatSheet.vue`, data in `app/lib/terminal/cheatSheet.ts`): the Part 5 table (nmap and ss marked as Lab D on your own machine), plus a disclosure listing every command with its `help` summary from `DEFAULT_COMMANDS`.
- `shared/lab.ts`: a step can carry `browser` overrides, applied by `browserLabStep()`. Lab B's browser version drops `cat ~/secplus-lab/.answer-lab-b` (that file is deliberately not in the VFS) and says to use the Check instead; the downloaded instructions (`/downloads/lab-instructions.md`) keep the original line for the real script.
- Tests: `tests/unit/terminal-checks.test.ts`, `tests/unit/terminal-ui.test.ts`, and `tests/e2e/lab.spec.ts` (no deployment needed): types the Lab A–C commands, asserts the outputs, passes all three checks, resets, exercises the keyboard, checks HTML in output stays text, and runs axe at 375 px and 1280 px in light and dark mode on each tab with no horizontal page scroll. Passed on Chromium, WebKit, Pixel 7 and iPhone 14 projects; `QA=1` `qa.spec.ts` for `/lab` passed on the same (Firefox could not launch on this machine).
