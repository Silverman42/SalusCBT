/**
 * PBQ helpers for tests/e2e/exam.spec.ts (T-309): enter a seed PBQ's answer
 * through its component in the runner, and check its marks on the review page.
 * The answers and expected marks are in tests/fixtures/pbqAnswers.ts.
 *
 * Inputs are found by the id suffixes the PBQ components give them
 * (`pbq-<questionId>-<part>`, nmap `…-<part>-<side>`, firewall `…-r<i>-port`),
 * scoped to the runner's main area, where only the open PBQ is rendered.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import type { PbqAnswerCase } from "../../fixtures/pbqAnswers";
import { earnedFor } from "../../fixtures/pbqAnswers";
import { SEED } from "./exam";

type SeedPart = { id: string; kind: string };
type SeedPayload = { template: string; parts?: SeedPart[] };

function seedPayload(displayNumber: string): SeedPayload {
  const q = SEED.questions.find((x) => x.displayNumber === displayNumber && x.kind === "pbq");
  if (!q) throw new Error(`No seed PBQ ${displayNumber}`);
  return q.payload as SeedPayload;
}

const byIdSuffix = (scope: Locator, suffix: string) => scope.locator(`[id$="-${suffix}"]`);

/** Fills in the open PBQ in the runner with `c.answer`. */
export async function answerPbq(page: Page, c: PbqAnswerCase) {
  const main = page.getByRole("main");
  const payload = seedPayload(c.displayNumber);
  const answer = c.answer;

  if (answer.kind === "firewall") {
    for (const [i, rule] of answer.rules.entries()) {
      if (rule.port) await byIdSuffix(main, `r${i}-port`).selectOption(rule.port);
      if (rule.action) await byIdSuffix(main, `r${i}-action`).selectOption(rule.action);
    }
    return;
  }
  if (answer.kind !== "pbq") throw new Error("not a PBQ answer");

  for (const part of payload.parts ?? []) {
    const value = answer.parts[part.id];
    if (value === undefined) continue;
    if (part.kind === "portPair" && Array.isArray(value)) {
      await byIdSuffix(main, `${part.id}-0`).fill(value[0] ?? "");
      await byIdSuffix(main, `${part.id}-1`).fill(value[1] ?? "");
    } else if (payload.template === "nmap") {
      await byIdSuffix(main, `${part.id}-0`).fill(String(value));
    } else if (part.kind === "pick") {
      await byIdSuffix(main, part.id).selectOption(String(value));
    } else if (part.kind === "mcq") {
      const radio = main.locator(`input[type="radio"][name$="-${part.id}"][value="${value}"]`);
      await main.locator("label").filter({ has: radio }).click();
      await expect(radio).toBeChecked();
    } else {
      await byIdSuffix(main, part.id).fill(String(value));
    }
  }
}

/** The review page's article for a PBQ ("PBQ 3" / "PBQ B3"). */
export function reviewArticle(page: Page, displayNumber: string): Locator {
  return page.locator("article").filter({
    has: page.getByRole("heading", { level: 3, name: `PBQ ${displayNumber}`, exact: true }),
  });
}

/**
 * The PBQ is shown with its own component, read-only, with the student's
 * answers, one mark per part or rule as expected, the correct answer next to
 * wrong parts and the points earned.
 */
export async function expectPbqReview(page: Page, c: PbqAnswerCase) {
  const article = reviewArticle(page, c.displayNumber);
  await expect(article).toHaveCount(1);
  const max = c.marks.filter((m) => m !== "practice").length;
  await expect(article.locator("header")).toContainText(`${earnedFor(c)} / ${max} points`);

  const marks = article.getByTestId("pbq-mark");
  await expect(marks).toHaveCount(c.marks.length);
  expect(await marks.evaluateAll((els) => els.map((e) => e.getAttribute("data-mark")))).toEqual(
    c.marks,
  );
  for (const text of c.shows) await expect(marks.filter({ hasText: text })).not.toHaveCount(0);

  // Read-only, with the student's answer in place.
  const fields = article.locator("input:not([type=radio]):not([type=search]), select, textarea");
  expect(await fields.count()).toBeGreaterThan(0);
  for (const field of await fields.all()) await expect(field).toBeDisabled();
  const answer = c.answer;
  if (answer.kind === "firewall") {
    const first = answer.rules[0]!;
    await expect(byIdSuffix(article, "r0-port")).toHaveValue(first.port ?? "");
  } else if (answer.kind === "pbq") {
    const [id, value] = Object.entries(answer.parts)[0]!;
    const suffix = Array.isArray(value) || seedPayload(c.displayNumber).template === "nmap";
    const expected = Array.isArray(value) ? value[0]! : value;
    await expect(byIdSuffix(article, suffix ? `${id}-0` : id)).toHaveValue(expected);
  }
}
