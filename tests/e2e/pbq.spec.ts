/**
 * T-309: PBQs in a real browser, through to the answer review (PRD EX-17,
 * PB-1 to PB-4, QA-2, LLD §17).
 *
 * - Standard sitting: answer PBQs 1–5 through their components (some parts
 *   right, some wrong or blank on purpose), axe on each PBQ, submit, then the
 *   review page shows each PBQ read-only with ✓ / ✗ per part or firewall rule,
 *   the correct answer next to wrong parts and the 1d model answer.
 * - Retake sitting (`/start?mode=retake`): the same for set B (B1–B5).
 *
 * The answers and expected marks are in tests/fixtures/pbqAnswers.ts; the
 * same cases run without a deployment in tests/unit/pbq/review.test.ts
 * against the server's marking. MCQs are left blank.
 *
 * Skipped unless `E2E_EXAM=1`, like exam.spec.ts (same setup notes there):
 *
 *   E2E_EXAM=1 npm run test:e2e -- pbq.spec.ts
 *
 * Each run leaves two submitted anonymous attempts behind.
 */
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { PBQ_ANSWERS, earnedFor, type PbqAnswerCase } from "../fixtures/pbqAnswers";
import { expectNoSeriousA11yViolations } from "./helpers/axe";
import { clickNext, currentHeading, savedAnswerCount, startExam } from "./helpers/exam";
import { answerPbq, expectPbqReview } from "./helpers/pbq";

const ENABLED = process.env.E2E_EXAM === "1";

const SET_A = PBQ_ANSWERS.filter((c) => !c.displayNumber.startsWith("B"));
const SET_B = PBQ_ANSWERS.filter((c) => c.displayNumber.startsWith("B"));

async function sitPbqs(
  page: Page,
  testInfo: TestInfo,
  mode: "standard" | "retake",
  cases: PbqAnswerCase[],
) {
  expect(cases).toHaveLength(5);
  const attemptId = await startExam(page, `E2E PBQ ${mode}`, mode);

  for (const [i, c] of cases.entries()) {
    await expect(currentHeading(page)).toContainText(`PBQ ${i + 1}:`);
    // axe on each of the five PBQ components, before and after answering.
    await expectNoSeriousA11yViolations(page, testInfo, `${mode}-pbq-${c.displayNumber}`);
    await answerPbq(page, c);
    await expectNoSeriousA11yViolations(page, testInfo, `${mode}-pbq-${c.displayNumber}-answered`);
    await clickNext(page);
  }
  // Every PBQ saved (text answers are debounced), then submit from the review screen.
  await expect
    .poll(() => savedAnswerCount(page, attemptId), { timeout: 15_000 })
    .toBe(cases.length);
  await page.getByRole("button", { name: /^Review( & submit)?$/ }).click();
  const main = page.getByRole("main");
  await expect(page.getByRole("heading", { level: 1, name: "Ready to submit?" })).toBeVisible();
  await main.getByRole("button", { name: "Submit exam" }).click();
  await page.waitForURL(/\/result$/);
  const points = cases.reduce((sum, c) => sum + earnedFor(c), 0);
  await expect(main).toContainText(new RegExp(`\\b${points} of \\d+ points`));

  await main.getByRole("link", { name: "Review answers" }).click();
  await page.waitForURL(/\/review$/);
  for (const c of cases) await expectPbqReview(page, c);
  await expectNoSeriousA11yViolations(page, testInfo, `${mode}-review-pbqs`);

  // The Wrong filter keeps the PBQs short of full marks.
  await page.getByRole("button", { name: /^Wrong \d+$/ }).click();
  for (const c of cases) {
    const full = c.marks.every((m) => m !== "wrong");
    await expect(
      page.getByRole("heading", { level: 3, name: `PBQ ${c.displayNumber}`, exact: true }),
    ).toHaveCount(full ? 0 : 1);
  }
}

test.describe("PBQs answered and reviewed in the browser (T-309)", () => {
  test.skip(!ENABLED, "Set E2E_EXAM=1 against a dev deployment that can start attempts");

  test("standard sitting: PBQs 1–5 marked per part in review", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await sitPbqs(page, testInfo, "standard", SET_A);
  });

  test("retake sitting: PBQs B1–B5 marked per part in review", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await sitPbqs(page, testInfo, "retake", SET_B);
  });
});
