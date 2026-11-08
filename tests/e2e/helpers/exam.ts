/**
 * Exam helpers for tests/e2e/exam.spec.ts (T-220): the answer keys from the
 * committed seed (test code only; the app never sees them, SE-1), and the
 * runner interactions the sittings share.
 */
import { readFileSync } from "node:fs";
import { expect, type Locator, type Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { convexUrl } from "./convex";

interface SeedQuestion {
  displayNumber: string;
  kind: "mcq" | "pbq";
  section: string;
  points: number;
  stem: string;
  options?: { id: string; text: string }[];
  chooseCount?: number;
  payload?: unknown;
}
interface SeedKey {
  displayNumber: string;
  correct?: string[];
  explanation: string;
}
interface Seed {
  scoring: { totalPoints: number; conversion: { points: number; scaled: number }[] };
  questions: SeedQuestion[];
  answerKeys: SeedKey[];
}

export const SEED = JSON.parse(readFileSync("content/seed/sy0-701.json", "utf8")) as Seed;

export interface McqKey {
  displayNumber: string;
  chooseCount: number;
  optionIds: string[];
  correct: string[];
}

const keyByNumber = new Map(SEED.answerKeys.map((k) => [k.displayNumber, k]));

/** MCQ answer keys by display number (85 one-point questions). */
export const MCQ_KEYS = new Map<string, McqKey>(
  SEED.questions
    .filter((q) => q.kind === "mcq")
    .map((q) => [
      q.displayNumber,
      {
        displayNumber: q.displayNumber,
        chooseCount: q.chooseCount ?? 1,
        optionIds: (q.options ?? []).map((o) => o.id),
        correct: keyByNumber.get(q.displayNumber)?.correct ?? [],
      },
    ]),
);

/** Scaled score for a point total, from the seed's conversion table. */
export function scaledFor(points: number): number {
  const row = SEED.scoring.conversion.find((c) => c.points === points);
  if (!row) throw new Error(`No conversion row for ${points} points`);
  return row.scaled;
}

/** A wrong answer of the right size: the first options that aren't correct. */
export function wrongChoice(key: McqKey): string[] {
  return key.optionIds.filter((id) => !key.correct.includes(id)).slice(0, key.chooseCount);
}

/**
 * Text that only exists in the answer keys: a 40-character run of each
 * explanation that appears nowhere in the student-facing question content.
 * Finding one in a response before submitting would be a key leak (SE-1).
 */
export const KEY_ONLY_SNIPPETS: string[] = (() => {
  const studentText = JSON.stringify(SEED.questions);
  const out: string[] = [];
  for (const k of SEED.answerKeys) {
    // Plain words only, so the JSON encoding of a Convex frame can't differ.
    const runs = k.explanation.match(/[A-Za-z][A-Za-z ,]{39,}/g) ?? [];
    for (const run of runs) {
      let found = false;
      for (let i = 0; i + 40 <= run.length; i += 10) {
        const s = run.slice(i, i + 40);
        if (!studentText.includes(s)) {
          out.push(s);
          found = true;
          break;
        }
      }
      if (found) break;
    }
  }
  return out;
})();

// --- runner ------------------------------------------------------------------

/**
 * /start → "Start the exam" (or `/start?mode=retake` → "Start the PBQ retake",
 * T-307) → the runner. Returns the attempt id.
 */
export async function startExam(
  page: Page,
  displayName: string,
  mode: "standard" | "retake" = "standard",
): Promise<string> {
  await page.goto(mode === "retake" ? "/start?mode=retake" : "/start");
  await page.getByLabel(/Display name/).fill(displayName);
  const start = page.getByRole("button", {
    name: mode === "retake" ? "Start the PBQ retake" : "Start the exam",
  });
  await expect(start).toBeEnabled();
  await start.click();
  await page.waitForURL(/\/exam\/[^/]+$/);
  const attemptId = decodeURIComponent(new URL(page.url()).pathname.split("/")[2]!);
  await expect(currentHeading(page)).toBeVisible({ timeout: 20_000 });
  return attemptId;
}

/** The question heading (h1) inside the runner's main area. */
export function currentHeading(page: Page): Locator {
  return page.getByRole("main").getByRole("heading", { level: 1 }).first();
}

/** "Question 12 of 90" → "12"; a PBQ heading → null. */
export async function currentMcqNumber(page: Page): Promise<string | null> {
  const text = (await currentHeading(page).textContent())?.trim() ?? "";
  return /^Question (\S+)/.exec(text)?.[1] ?? null;
}

function mcqSection(page: Page): Locator {
  return page.locator('section[aria-labelledby="q-heading"]');
}

function optionInput(page: Page, optionId: string): Locator {
  return mcqSection(page).locator(`input[value="${optionId}"]`);
}

/**
 * Chooses `optionIds` on the open MCQ: by clicking the option, or with the
 * letter shortcut for its shuffled position (EX-9).
 */
export async function chooseOptions(page: Page, optionIds: string[], via: "click" | "keyboard") {
  for (const id of optionIds) {
    if (via === "click") {
      await mcqSection(page)
        .locator("label")
        .filter({ has: page.locator(`input[value="${id}"]`) })
        .click();
    } else {
      const order = await mcqSection(page)
        .locator("input")
        .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
      const index = order.indexOf(id);
      expect(index, `option ${id} on screen`).toBeGreaterThanOrEqual(0);
      // Focus the heading so the key isn't taken by a focused radio.
      await currentHeading(page).focus();
      await page.keyboard.press("abcde"[index]!);
    }
    await expect(optionInput(page, id)).toBeChecked();
  }
}

export async function expectChosen(page: Page, optionIds: string[]) {
  for (const id of optionIds) await expect(optionInput(page, id)).toBeChecked();
}

/** The footer's next button (Next / Next PBQ / Start multiple choice / Review & submit). */
export async function clickNext(page: Page) {
  await page
    .getByRole("main")
    .getByRole("button", { name: /^(Next|Next PBQ|Start multiple choice|Review & submit)$/ })
    .click();
}

/** Opens a question from the navigator ("Question 12, …" / "PBQ 2, …"). */
export async function jumpTo(page: Page, label: string) {
  await page
    .getByRole("navigation", { name: "Navigator" })
    .getByRole("button", { name: new RegExp(`^${label},`) })
    .click();
}

// --- server-side checks ------------------------------------------------------

export async function anonToken(page: Page): Promise<string> {
  const raw = await page.evaluate(() => localStorage.getItem("salus.anon.v1"));
  const token = raw ? (JSON.parse(raw) as { token?: string }).token : undefined;
  if (!token) throw new Error("No anonymous token in localStorage");
  return token;
}

/** Answers the server holds for an attempt (`attempts.getState`). */
export async function savedAnswerCount(page: Page, attemptId: string): Promise<number> {
  const client = new ConvexHttpClient(convexUrl(), { logger: false });
  const state = await client.query(api.attempts.getState, {
    attemptId: attemptId as Id<"attempts">,
    anonToken: await anonToken(page),
  });
  return state.responses.filter((r) => r.value !== undefined).length;
}
