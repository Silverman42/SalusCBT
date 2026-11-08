# T-707 · Lab fixture tests against a real build-lab.sh run

| | |
| --- | --- |
| Stage | 7 · Terminal lab |
| Depends on | [T-706](T-706-lab-page-checks.md) |
| Requirements | `LB-*` |
| Design refs | LLD §13.2 (Tests), §17 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Stage 7 gate.

## Steps

- Run `build-lab.sh` on Ubuntu, capture outputs of every lab-step command as fixtures (excluding the random tampered file/hashes).
- Vitest runs every lab command against `seedLab()` and compares.

## Files

- `tests/fixtures/lab/*`
- `tests/unit/terminal-lab-fixtures.test.ts`
- `scripts/capture-lab-fixtures.sh`, `.github/workflows/ci.yml` (`lab-fixtures` job)

## Acceptance criteria

- [x] **Stage 7 gate:** every lab command matches; Labs A–C give the Part 6 answers.
- [x] Fixtures for every Lab A–C step command (stdout, stderr, exit status, one session, fresh build) in `tests/fixtures/lab/`, with a capture script (`scripts/capture-lab-fixtures.sh`).
- [x] Vitest replays every command in the in-browser terminal and compares byte for byte (`tests/unit/terminal-lab-fixtures.test.ts`); Labs A–C answers checked against Part 6.
- [x] Fixtures confirmed equal to a real Ubuntu run (the `lab-fixtures` CI job passes).

## Notes

- 2026-11-08: No Docker/Podman on the dev Mac, so the committed fixtures were **not** captured on Ubuntu. They were written from the in-browser terminal's output and cross-checked by hand: the content (head, grep, awk counts, the four SHA-256 lines, `sha256sum -c` output and warning, file sizes, `grep -n` line numbers, the build message) matched a run of the same capture with the Mac's own tools; the GNU-only formatting (`uniq -c` width 7, `ls -l` on ext4: `total 20`/`total 16`, 4096-byte dirs, `stat -c`) was checked against GNU behaviour, not a GNU binary. The `lab-fixtures` CI job (ubuntu-latest, gawk installed) re-captures them and fails on any difference, uploading the fresh files as the `lab-fixtures` artifact; tick the Stage 7 gate once it passes.
- Deterministic Lab B: the capture swaps only `/dev/urandom` (installer k = 2 MiB of byte k) and `shuf -n1` (victim `backup-tool-1.8.deb`); the test seeds `seedLab()` the same way. Normalised: owner/group → `root root`, temp `$HOME` → `/root`, GNU's six-month `Nov  3  2026` → `Nov  3 09:14`; mtimes are set to `LAB_MTIME` before the commands run.
- `cat ~/secplus-lab/.answer-lab-b` is download-only: its fixture is checked against the session's tampered file instead of being replayed (the browser lab has no answer file). Lab D (nmap, ss) has no fixtures (machine-dependent, not in the browser lab).
- CI: the `checks` job now installs gawk before `npm test`, so the real-tool comparisons in `terminal-seed`, `terminal-files` and `terminal-text` run (not skip) with gawk as `awk`; `terminal-lab-fixtures.test.ts` fails on GitHub Actions if the GNU tools are missing.
- No terminal bugs found locally (fixtures pass); any GNU mismatch will show up in the `lab-fixtures` job or the existing comparisons on CI.

- **2026-11-08:** first CI run (c783068) — `lab-fixtures` passed on ubuntu-latest, so the committed fixtures equal a real GNU run; the replay test passes against them.
