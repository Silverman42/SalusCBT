/**
 * T-220: the Stage 2 gate in a real browser (PRD EX-*, QA-2, LLD §17).
 *
 * - Full sitting at 83 points: /start → answer every MCQ (clicks and A–E
 *   keys, one flag) → refresh mid-exam → review screen → Submit exam →
 *   result (751, Pass) → review page → /history. axe runs on the runner (MCQ
 *   and PBQ views, navigator), the review screen, the result and the review
 *   page. Every WebSocket frame the browser receives before submitting is
 *   checked for answer-key text (SE-1).
 * - Full sitting at 82 points: 743, Below 750.
 * - Timer expiry: the page clock is fast-forwarded past 0:00 and the runner
 *   submits by itself and opens the result.
 *
 * The answers come from the committed seed (`content/seed/sy0-701.json`),
 * matched by question number; option ids are stable under the per-attempt
 * shuffle. PBQs are left blank, so the MCQs alone decide the score: 85 MCQ
 * points, minus 2 (83) or 3 (82) answered wrong on purpose.
 *
 * Skipped unless `E2E_EXAM=1`: it needs a live dev deployment that can start
 * attempts, which CI doesn't have yet. To run it locally:
 *
 *   npx convex env set SERVER_SECRET <random>   # same value as NUXT_SERVER_SECRET
 *   # .env.local: NUXT_SERVER_SECRET=<that value>, NUXT_IP_PEPPER=<random>
 *   npm run seed:import                         # once: a published default version
 *   E2E_EXAM=1 npm run test:e2e -- exam.spec.ts
 *
 * (`E2E_PORT=3220` runs against a dev server on another port.) The spec
 * calls `attempts.getState` with the Convex client to check what the server
 * saved, at `E2E_CONVEX_URL` or `CONVEX_URL` (from the environment or
 * .env.local). Each run leaves three submitted anonymous attempts behind.
 *
 * Timer expiry, client side only: the server's deadline is authoritative and
 * real (start time + 90 minutes; there is no shorter test time limit and no
 * backend hook for one). With the page clock 90 minutes ahead the runner
 * reaches 0:00 and calls `attempts.submit`, which the server accepts at any
 * time before the deadline, so the result is marked "by the student" at the
 * real time. The server's own path (`autoSubmit` at deadline + 30 s, then the
 * sweep) is covered by the convex-test suites (T-207), not here.
 */
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./helpers/axe";
import {
  chooseOptions,
  clickNext,
  currentHeading,
  currentMcqNumber,
  expectChosen,
  jumpTo,
  KEY_ONLY_SNIPPETS,
  MCQ_KEYS,
  savedAnswerCount,
  scaledFor,
  SEED,
  startExam,
  wrongChoice,
} from "./helpers/exam";

const ENABLED = process.env.E2E_EXAM === "1";

/** Questions answered wrong on purpose (a "Choose TWO" one among them). */
const WRONG = ["7", "20", "61"];
/** Refresh after answering this question. */
const REFRESH_AFTER = "48";
/** Flagged for review (answered correctly, so the score doesn't change). */
const FLAG = "10";

interface SittingOptions {
  wrong: string[];
  refresh?: boolean;
  axe?: TestInfo;
}

/** Collects every WebSocket frame the page receives (Convex sync). */
function recordFrames(page: Page): string[] {
  const frames: string[] = [];
  page.on("websocket", (ws) =>
    ws.on("framereceived", (f) => frames.push(typeof f.payload === "string" ? f.payload : "")),
  );
  return frames;
}

function expectNoKeyText(frames: string[]) {
  expect(frames.length, "Convex frames received").toBeGreaterThan(0);
  const all = frames.join("\n");
  const leaked = KEY_ONLY_SNIPPETS.filter((s) => all.includes(s));
  expect(leaked, "answer-key text in a student response").toEqual([]);
  expect(all).not.toContain('"explanation"');
}

/**
 * Walks the paper from the first question with the footer's Next button and
 * answers every MCQ. Returns at the review screen.
 */
async function sitPaper(page: Page, attemptId: string, opts: SittingOptions) {
  const total = SEED.questions.filter((q) => q.section === "mcq" || q.section === "pbqA").length;
  await expect(currentHeading(page)).toContainText(/PBQ 1:/);
  if (opts.axe) await expectNoSeriousA11yViolations(page, opts.axe, "runner-pbq");

  let answered = 0;
  for (let i = 0; i < total; i++) {
    const n = await currentMcqNumber(page);
    if (n !== null) {
      const key = MCQ_KEYS.get(n);
      expect(key, `seed key for Q${n}`).toBeDefined();
      const ids = opts.wrong.includes(n) ? wrongChoice(key!) : key!.correct;
      // Every third question by keyboard shortcut (EX-9), the rest by click.
      await chooseOptions(page, ids, i % 3 === 0 ? "keyboard" : "click");
      answered++;
      if (n === FLAG) {
        const flag = page.getByRole("main").getByRole("button", { name: /^Flag/ });
        await flag.click();
        await expect(flag).toHaveAttribute("aria-pressed", "true");
      }
      if (opts.axe && answered === 1) {
        await expectNoSeriousA11yViolations(page, opts.axe, "runner-mcq");
      }
      if (opts.refresh && n === REFRESH_AFTER) {
        await refreshMidExam(page, attemptId, n, ids, answered);
      }
    }
    await clickNext(page);
  }
  await expect(page.getByRole("heading", { level: 1, name: "Ready to submit?" })).toBeVisible();
  return answered;
}

/** EX-11: the server holds every answer, and a reload restores the runner. */
async function refreshMidExam(
  page: Page,
  attemptId: string,
  n: string,
  ids: string[],
  answered: number,
) {
  await expect.poll(() => savedAnswerCount(page, attemptId), { timeout: 15_000 }).toBe(answered);
  await page.reload();
  // Same question (sessionStorage), same answer, same count in the navigator.
  await expect(currentHeading(page)).toContainText(`Question ${n} `);
  await expectChosen(page, ids);
  await expect(page.getByRole("navigation", { name: "Navigator" })).toContainText(
    `${answered} answered`,
  );
  // An earlier answer too, from the navigator.
  await jumpTo(page, "Question 6");
  await expectChosen(page, MCQ_KEYS.get("6")!.correct);
  await jumpTo(page, `Question ${n}`);
  await expect(currentHeading(page)).toContainText(`Question ${n} `);
}

test.describe("Stage 2 gate in the browser (T-220)", () => {
  test.skip(!ENABLED, "Set E2E_EXAM=1 against a dev deployment that can start attempts");

  test("full sitting at 83 points: refresh, submit, 751 Pass, review, history", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const wrong = WRONG.slice(0, 2);
    const points = MCQ_KEYS.size - wrong.length;
    expect(points).toBe(83);
    const scaled = scaledFor(points);
    expect(scaled).toBe(751);

    const frames = recordFrames(page);
    await page.goto("/start");
    await expectNoSeriousA11yViolations(page, testInfo, "start");
    const attemptId = await startExam(page, "E2E Pass");
    const answered = await sitPaper(page, attemptId, { wrong, refresh: true, axe: testInfo });
    expect(answered).toBe(MCQ_KEYS.size);

    // Review screen (EX-12): 85 answered, 1 flagged, the 5 PBQs unanswered.
    const main = page.getByRole("main");
    await expect(main).toContainText(new RegExp(`\\b${MCQ_KEYS.size}\\s*Answered`));
    await expect(main).toContainText(/\b1\s*Flagged/);
    await expect(main).toContainText(/\b5\s*Unanswered/);
    await expectNoSeriousA11yViolations(page, testInfo, "review-screen");
    await expect.poll(() => savedAnswerCount(page, attemptId)).toBe(MCQ_KEYS.size);

    // Nothing the browser received while sitting held answer-key text.
    expectNoKeyText(frames);

    await main.getByRole("button", { name: "Submit exam" }).click();
    await page.waitForURL(/\/result$/);
    await expect(main).toContainText(String(scaled));
    await expect(main).toContainText("Pass");
    await expect(main).toContainText(`${points} of ${SEED.scoring.totalPoints} points`);
    await expectNoSeriousA11yViolations(page, testInfo, "result");

    await main.getByRole("link", { name: "Review answers" }).click();
    await page.waitForURL(/\/review$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`Review · ${scaled} Pass`);
    // One "Your answer · Wrong" per wrong option chosen (two on a Choose TWO).
    const wrongPicks = wrong.reduce((sum, n) => sum + wrongChoice(MCQ_KEYS.get(n)!).length, 0);
    await expect(page.getByText("Your answer · Wrong", { exact: true })).toHaveCount(wrongPicks);
    await expectNoSeriousA11yViolations(page, testInfo, "review-page");

    await page.goto("/history");
    await expect(page.getByRole("main")).toContainText(String(scaled));
  });

  test("full sitting at 82 points: 743, Below 750", async ({ page }) => {
    test.setTimeout(300_000);
    const wrong = WRONG.slice(0, 3);
    const points = MCQ_KEYS.size - wrong.length;
    expect(points).toBe(82);
    const scaled = scaledFor(points);
    expect(scaled).toBe(743);

    const attemptId = await startExam(page, "E2E Below");
    await sitPaper(page, attemptId, { wrong });
    await expect.poll(() => savedAnswerCount(page, attemptId)).toBe(MCQ_KEYS.size);

    const main = page.getByRole("main");
    await main.getByRole("button", { name: "Submit exam" }).click();
    await page.waitForURL(/\/result$/);
    await expect(main).toContainText(String(scaled));
    await expect(main).toContainText("Below 750");
    await expect(main).toContainText(`${points} of ${SEED.scoring.totalPoints} points`);
  });

  test("timer expiry: at 0:00 the runner submits and opens the result", async ({ page }) => {
    test.setTimeout(120_000);
    // Fake timers that keep pace with real time until fast-forwarded.
    await page.clock.install();
    const attemptId = await startExam(page, "E2E Timer");

    await jumpTo(page, "Question 6");
    await chooseOptions(page, MCQ_KEYS.get("6")!.correct, "click");
    await expect.poll(() => savedAnswerCount(page, attemptId)).toBe(1);

    const timer = page.getByRole("timer");
    await expect(timer).toHaveAccessibleName(/Time remaining: about (89|90) minutes/);

    // 80 minutes on: the last-ten-minutes state (EX-4).
    await page.clock.fastForward("01:20:00");
    await expect(timer).toHaveAccessibleName(/Time remaining: about (9|10) minutes/);
    await expect(page).toHaveURL(new RegExp(`/exam/${attemptId}$`));

    // Past 0:00: read-only, submitted, and the result page opens (EX-3).
    await page.clock.fastForward("10:30");
    await page.waitForURL(/\/result$/, { timeout: 30_000 });
    const main = page.getByRole("main");
    await expect(main).toContainText("Below 750");
    await expect(main).toContainText(`1 of ${SEED.scoring.totalPoints} points`);
  });
});
