# T-309 · PBQ review rendering and E2E tests

| | |
| --- | --- |
| Stage | 3 · Interactive PBQs |
| Depends on | [T-307](T-307-retake-mode.md), [T-216](../stage-2-exam-engine/T-216-review-page.md) |
| Requirements | `EX-17`, `PB-2`, `QA-2` |
| Design refs | LLD §8.3, §17 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Review shows per-part results for PBQs, and the full flow is tested.

## Steps

- `ReviewItem` PBQ variants: per-part your answer / correct / ✓✗; firewall per rule; 1d model answer.
- Playwright: standard sitting with PBQs answered; retake sitting.
- axe checks on all five PBQ components.

## Files

- `app/components/review/ReviewItem.vue`
- `tests/e2e/pbq.spec.ts`

## Acceptance criteria

- [ ] No serious axe violations on PBQs.

## Notes

- Files differ from the list above: review components live in `app/components/result/` (T-504/T-216). `ResultReviewItem` now renders a PBQ with `ResultPbqReview`, which mounts the exam's own PBQ component (same template map as `exam/QuestionPbq.vue`) read-only with `yourAnswer` as the model value: artefact panel, the student's answers in the disabled fields, and a `ResultPbqMark` per part (`part-mark` slot, now also in `PbqSshLog` and `PbqNmap`) or per firewall rule (`rule-mark`, Result column widened to 160 px). The question header (label, domain, flag, marks) sits above it in a bordered tray; the stem goes in the `heading` slot and the "Why" in `footer`, as in the runner. The stacked-card layout stays as the fallback for a template without a component (`hasArtefactReview`).
- Mockup screen 07 only shows an MCQ, so PBQ marks follow its language: ok / bad soft tints, "Correct" / "Wrong" / "Not answered", "Correct answer …" next to anything not right, "Practice · not scored" + "Model answer" for 1d / B1d. Small text on the tints is `text-fg`.
- Pure helpers in `app/lib/pbq/review.ts`: `formatPartAnswer` (port pair "Cleartext 110 · Secure 995", MCQ part "B · Integrity" with the paper-order letter, blanks "—"), `formatRule` ("443 · Allow"), `partMarks` / `ruleMarks` (lines `partResults` up with scored parts, skipping practice parts), `markLabel`. `partRows` (fallback) now uses them; `firewallRuleText` / `optionText` were removed.
- axe fixes found on the way: the review marks chip used `text-ok` / `text-bad` on the soft tints (3.56:1 on a full-marks item) → `text-fg`; `PbqHashCheck` Vendor / Computed labels were 4.39:1 in dark mode → `text-code-fg`.
- Tests: `tests/unit/pbq/review.test.ts` (formatters per kind, marks for all ten seed PBQs using the server's `scoreQuestion`, via `tests/fixtures/pbqAnswers.ts` + `pbqReviewItems.ts`). `tests/e2e/pbq.spec.ts` (gated by `E2E_EXAM=1`): standard sitting answering PBQs 1–5 and a retake sitting answering B1–B5 through the components, axe on each PBQ before and after answering, submit, then marks / correct answers / read-only values / axe on the review page and the Wrong filter. `startExam` takes a `mode`.
- Live check (temporary fixture page with all ten PBQs in review, deleted): 1280 px and 375 px, light and dark; injected axe-core (WCAG 2.x A/AA) had no violations apart from the fixture page's missing title; no horizontal scroll at 375 px.
- Not run: the gated e2e spec. `.env.local` has no `NUXT_SERVER_SECRET`, so `/api/attempts/start` fails locally; it type-checks and lints. The acceptance box stays open until it runs against a deployment with the secret set.
