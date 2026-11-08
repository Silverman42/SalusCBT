# T-307 · Retake mode (PBQ set B)

| | |
| --- | --- |
| Stage | 3 · Interactive PBQs |
| Depends on | [T-204](../stage-2-exam-engine/T-204-attempts-start.md), [T-302](T-302-pbq-sshlog.md), [T-303](T-303-pbq-nmap.md), [T-304](T-304-pbq-hashcheck.md), [T-305](T-305-pbq-permissions.md), [T-306](T-306-pbq-firewall.md) |
| Requirements | `PB-4` |
| Design refs | LLD §7.1 step 5 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Let students retake with set B PBQs and the same MCQs.

## Steps

- Show "Retake PBQs" on the landing page and start screen.
- Pass `mode: retake` through the start route.
- Review and result pages show B-set display numbers (B1–B5).

## Files

- `app/pages/index.vue`
- `app/pages/start.vue`

## Acceptance criteria

- [x] A retake attempt shows B1–B5 then Q6–Q90.

## Notes

- 2026-11-08: the retake paper is PBQ set B (B1–B5) then the same 85 MCQs (`convex/lib/paper.ts` `sectionsFor("retake")`), so MCQ pacing alerts apply as usual. Verified by `tests/convex/attempts/paper.test.ts` ("a retake sits PBQ set B…", real seed: B1–B5 then 85 MCQs) and `tests/convex/review/review.test.ts` (B-set display numbers in review/result).
- Offered on the landing page ("Retake PBQs" button next to Start, keeps the class code), on `/start` ("Retake PBQs (set B) instead" link when available; `?mode=retake` heading, instructions and button copy; "Sit the standard exam instead") and on the result page (`RETAKE_START_PATH = "/start?mode=retake"`). PRD/LLD don't require a prior standard attempt, so it isn't gated on `review.myAttempts`.
- Availability (LLD §10.2 "retake disabled if set B is missing"): `attempts.start` now refuses `mode: "retake"` with `NOT_FOUND` unless the version has exactly 5 set-B PBQs (`hasFullRetakeSet`), and the new public query `attempts.startInfo` reports `retake: boolean`; `/start?mode=retake` shows a warning and disables Start when it is false. The client maps a retake `NOT_FOUND` to `RETAKE_UNAVAILABLE`.
- The history page has no retake button (no seam there); the result page's button doesn't carry the class code (the result view has none) — the student re-enters it on `/start`.
- Live check against the running dev server: `/` → "Retake PBQs" → `/start?mode=retake` renders the retake copy. Starting still 500s locally while `SERVER_SECRET` is unset.

