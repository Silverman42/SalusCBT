// T-208: review.getResult, review.getReview, review.myAttempts (LLD §5.1,
// §8.3; EX-14–EX-19, PB-2, PB-4, SE-1, SE-3). Uses the real seed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { errorCodeOf } from "../../../convex/lib/errors";
import type { ReviewItem } from "../../../convex/lib/review";
import type { AnswerValue } from "../../../shared/content";
import type { SeedExam } from "../../../scripts/lib/types";
import seedJson from "../../../content/seed/sy0-701.json";
import { setup, type T } from "../lib/fixtures";

const NOW = new Date("2026-11-08T10:00:00Z").getTime();
const SECRET = "test-server-secret-0123456789abcdef";
const IP_HASH = "b".repeat(64);
const seed = seedJson as SeedExam;

const token = (n = 0) => `tok${String(n).padStart(40, "0")}`;

const PBQ_A = ["1", "2", "3", "4", "5"];
const PBQ_B = ["B1", "B2", "B3", "B4", "B5"];
const MCQS = seed.questions.filter((q) => q.kind === "mcq").map((q) => q.displayNumber);

const keyOf = (n: string) => {
  const key = seed.answerKeys.find((k) => k.displayNumber === n);
  if (!key) throw new Error(`no key for ${n}`);
  return key;
};

function correctAnswer(n: string): AnswerValue {
  const key = keyOf(n);
  if (key.correct) return { kind: "mcq", optionIds: [...key.correct] };
  const parts = key.parts!;
  if ("rules" in parts) return { kind: "firewall", rules: parts.rules.map((r) => ({ ...r })) };
  return { kind: "pbq", parts: { ...parts.parts } };
}

function wrongMcq(n: string): AnswerValue {
  const q = seed.questions.find((x) => x.displayNumber === n);
  if (!q || q.kind !== "mcq") throw new Error(`${n} is not an MCQ`);
  const pick = q.options.find((o) => !keyOf(n).correct!.includes(o.id))!;
  return { kind: "mcq", optionIds: [pick.id] };
}

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).not.toBeNull();
  return errorCodeOf(err);
}

/** Every explanation and practice answer in the seed: none may appear before submission. */
const SECRET_TEXTS = seed.answerKeys.flatMap((k) => [
  k.explanation,
  ...(k.parts && "practice" in k.parts ? Object.values(k.parts.practice ?? {}) : []),
]);

function expectNoKeys(value: unknown) {
  const json = JSON.stringify(value);
  expect(json).not.toMatch(/"correct(Answer)?"/);
  expect(json).not.toContain('"explanation"');
  expect(json).not.toContain('"practiceAnswer"');
  for (const text of SECRET_TEXTS) expect(json).not.toContain(JSON.stringify(text).slice(1, -1));
}

async function importSeed(t: T) {
  const { versionId } = await t.mutation(internal.seed.importExam, { seed });
  const rows = await t.run((ctx) => ctx.db.query("questions").collect());
  const byNumber = new Map(
    rows.filter((r) => r.versionId === versionId).map((r) => [r.displayNumber, r._id]),
  );
  return (n: string): Id<"questions"> => {
    const id = byNumber.get(n);
    if (!id) throw new Error(`no question ${n}`);
    return id;
  };
}

async function start(t: T, mode: "standard" | "retake" = "standard", tok = token()) {
  const { attemptId } = await t.mutation(api.attempts.start, {
    serverSecret: SECRET,
    anonToken: tok,
    mode,
    ipHash: IP_HASH,
  });
  return attemptId;
}

type Ctx = { t: T; attemptId: Id<"attempts">; q: (n: string) => Id<"questions"> };

async function setupAttempt(mode: "standard" | "retake" = "standard"): Promise<Ctx> {
  const t = setup();
  const q = await importSeed(t);
  return { t, q, attemptId: await start(t, mode) };
}

function save(c: Ctx, n: string, value?: AnswerValue, flagged = false) {
  return c.t.mutation(api.attempts.saveResponse, {
    attemptId: c.attemptId,
    anonToken: token(),
    questionId: c.q(n),
    ...(value !== undefined ? { value } : {}),
    flagged,
  });
}

const submit = (c: Ctx) =>
  c.t.mutation(api.attempts.submit, { attemptId: c.attemptId, anonToken: token() });
const getResult = (c: Ctx, anonToken = token()) =>
  c.t.query(api.review.getResult, { attemptId: c.attemptId, anonToken });
const getReview = (c: Ctx, anonToken = token()) =>
  c.t.query(api.review.getReview, { attemptId: c.attemptId, anonToken });
const getPaper = (c: Ctx) =>
  c.t.query(api.attempts.getPaper, { attemptId: c.attemptId, anonToken: token() });

const item = (items: ReviewItem[], n: string) => {
  const found = items.find((i) => i.displayNumber === n);
  if (!found) throw new Error(`no review item ${n}`);
  return found;
};

/** A review item minus the fields review adds: what the paper showed. */
function asShown(i: ReviewItem) {
  const {
    domain: _d,
    flagged: _f,
    yourAnswer: _y,
    correctAnswer: _c,
    earned: _e,
    max: _m,
    explanation: _x,
    ...rest
  } = i;
  if (rest.kind === "pbq") {
    const { partResults: _p, practiceAnswer: _pa, ...shown } = rest;
    return shown;
  }
  return rest;
}

describe("review queries (T-208)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("SERVER_SECRET", SECRET);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe("getResult", () => {
    it("returns the stored result with the exam's thresholds and times", async () => {
      const c = await setupAttempt();
      for (const n of [...PBQ_A, ...MCQS]) await save(c, n, correctAnswer(n));
      await save(c, "47", correctAnswer("47"), true);
      vi.setSystemTime(NOW + 20 * 60_000);
      const submitted = await submit(c);

      const view = await getResult(c);
      const doc = await c.t.run((ctx) => ctx.db.get("attempts", c.attemptId));
      expect(view).toEqual({
        attemptId: c.attemptId,
        mode: "standard",
        examTitle: expect.any(String),
        startedAt: doc!.startedAt,
        submittedAt: NOW + 20 * 60_000,
        submittedBy: "student",
        passScaled: 750,
        comfortScaled: 800,
        domainTarget: 0.81,
        result: submitted,
      });
      expect(view.result).toMatchObject({ scaled: 900, flaggedCount: 1, timeUsedSec: 1200 });
      expectNoKeys(view);
    });

    it("an in-progress attempt is NOT_FOUND", async () => {
      const c = await setupAttempt();
      await save(c, "47", correctAnswer("47"));
      expect(await codeOf(getResult(c))).toBe("NOT_FOUND");
    });

    it("another token, a deleted attempt and a bad token are refused like a missing one", async () => {
      const c = await setupAttempt();
      await submit(c);
      expect(await codeOf(getResult(c, token(1)))).toBe("NOT_FOUND");
      expect(await codeOf(getResult(c, "short"))).toBe("BAD_TOKEN");
      await c.t.run((ctx) => ctx.db.delete("attempts", c.attemptId));
      expect(await codeOf(getResult(c))).toBe("NOT_FOUND");
    });

    it("works for a timer-submitted attempt", async () => {
      const c = await setupAttempt();
      await c.t.mutation(internal.attempts.autoSubmit, { attemptId: c.attemptId });
      expect(await getResult(c)).toMatchObject({ submittedBy: "timer", result: { points: 0 } });
    });
  });

  describe("getReview", () => {
    it("an in-progress attempt is NOT_FOUND, so no keys reach the student", async () => {
      const c = await setupAttempt();
      await save(c, "1", correctAnswer("1"), true);
      expect(await codeOf(getReview(c))).toBe("NOT_FOUND");
    });

    it("another token gets NOT_FOUND, also after submission", async () => {
      const c = await setupAttempt();
      expect(await codeOf(getReview(c, token(1)))).toBe("NOT_FOUND");
      await submit(c);
      expect(await codeOf(getReview(c, token(1)))).toBe("NOT_FOUND");
    });

    it("lists the paper in order, each question exactly as it was shown (same option order)", async () => {
      const c = await setupAttempt();
      const paper = await getPaper(c);
      await submit(c);
      const items = await getReview(c);

      expect(items.map((i) => i.displayNumber)).toEqual([...PBQ_A, ...MCQS]);
      expect(items.map(asShown)).toEqual(paper.questions);

      // The shuffle really applies: at least one MCQ is out of A–F order, and
      // PBQ 3's MCQ parts match the paper's per-part order.
      const shuffledMcq = items.some(
        (i) =>
          i.kind === "mcq" &&
          i.options.map((o) => o.id).join("") !== [...i.options.map((o) => o.id)].sort().join(""),
      );
      expect(shuffledMcq).toBe(true);
      const pbq3 = item(items, "3");
      const paper3 = paper.questions.find((p) => p.displayNumber === "3");
      expect(pbq3.kind === "pbq" && pbq3.payload).toEqual(paper3?.kind === "pbq" && paper3.payload);
    });

    it("shows answers, marks, keys, explanations and the practice model answer", async () => {
      const c = await setupAttempt();
      await save(c, "1", correctAnswer("1"));
      await save(c, "5", correctAnswer("5"));
      await save(c, "47", correctAnswer("47"), true);
      await save(c, "48", wrongMcq("48"));
      await save(c, "20", correctAnswer("20")); // Choose TWO
      await save(c, "49", undefined, true); // flagged, unanswered
      await submit(c);
      const items = await getReview(c);

      expect(item(items, "47")).toMatchObject({
        kind: "mcq",
        flagged: true,
        yourAnswer: correctAnswer("47"),
        correctAnswer: correctAnswer("47"),
        earned: 1,
        max: 1,
        explanation: keyOf("47").explanation,
      });
      expect(item(items, "48")).toMatchObject({
        yourAnswer: wrongMcq("48"),
        correctAnswer: correctAnswer("48"),
        earned: 0,
        flagged: false,
      });
      expect(item(items, "20")).toMatchObject({ chooseCount: 2, earned: 1 });
      expect(item(items, "49")).toMatchObject({ yourAnswer: null, flagged: true, earned: 0 });
      expect(item(items, "50")).toMatchObject({ yourAnswer: null, flagged: false, earned: 0 });

      const seedQ47 = seed.questions.find((q) => q.displayNumber === "47")!;
      expect(item(items, "47").domain).toBe(seedQ47.domain);

      const ssh = item(items, "1");
      expect(ssh).toMatchObject({
        kind: "pbq",
        earned: 3,
        max: 3,
        partResults: [true, true, true],
        correctAnswer: correctAnswer("1"),
        practiceAnswer: (keyOf("1").parts as { practice: Record<string, string> }).practice,
        explanation: keyOf("1").explanation,
      });

      const fw = item(items, "5");
      expect(fw).toMatchObject({
        earned: 4,
        partResults: [true, true, true, true],
        correctAnswer: correctAnswer("5"),
      });
      expect(fw.kind === "pbq" && fw.practiceAnswer).toBeFalsy();

      // Unanswered PBQs: every scored part marked wrong, one result per part.
      const nmap = item(items, "2");
      expect(nmap).toMatchObject({ yourAnswer: null, earned: 0 });
      expect(nmap.kind === "pbq" && nmap.partResults).toEqual(Array(nmap.max).fill(false));

      // The marks agree with the stored result.
      const result = (await getResult(c)).result;
      expect(items.reduce((s, i) => s + i.earned, 0)).toBe(result.points);
      expect(items.reduce((s, i) => s + i.max, 0)).toBe(result.totalPoints);
      for (const i of items) expect(i.explanation).not.toBe("");
    });

    it("a retake is reviewed against PBQ set B", async () => {
      const c = await setupAttempt("retake");
      const paper = await getPaper(c);
      await save(c, "B3", correctAnswer("B3"));
      await submit(c);
      const items = await getReview(c);

      expect(items.map((i) => i.displayNumber)).toEqual([...PBQ_B, ...MCQS]);
      expect(items.map(asShown)).toEqual(paper.questions);
      expect(items.slice(0, 5).every((i) => i.kind === "pbq" && i.section === "pbqB")).toBe(true);
      expect(item(items, "B3")).toMatchObject({
        earned: 3,
        correctAnswer: correctAnswer("B3"),
        explanation: keyOf("B3").explanation,
      });
      // Set A's key text never appears in a retake review.
      expect(JSON.stringify(items)).not.toContain(keyOf("3").explanation.slice(0, 40));
    });
  });

  describe("myAttempts", () => {
    const list = (t: T, anonToken = token(), numItems = 20, cursor: string | null = null) =>
      t.query(api.review.myAttempts, { anonToken, paginationOpts: { numItems, cursor } });

    it("lists this token's attempts newest first, with scores once submitted and no keys", async () => {
      const t = setup();
      const q = await importSeed(t);
      const first = await start(t);
      const c: Ctx = { t, q, attemptId: first };
      for (const n of MCQS) await save(c, n, correctAnswer(n));
      vi.setSystemTime(NOW + 10 * 60_000);
      const result = await submit(c);
      vi.setSystemTime(NOW + 60 * 60_000);
      const second = await start(t, "retake");
      vi.setSystemTime(NOW + 61 * 60_000);
      await start(t, "standard", token(1)); // someone else's

      // convex-test may nudge the clock by a millisecond per write: read the real times.
      const at = async (id: Id<"attempts">) =>
        (await t.run((ctx) => ctx.db.get("attempts", id)))!.startedAt;
      const [firstAt, secondAt] = [await at(first), await at(second)];

      const res = await list(t);
      expect(res.isDone).toBe(true);
      expect(res.page).toEqual([
        {
          attemptId: second,
          mode: "retake",
          status: "in_progress",
          startedAt: secondAt,
          deadline: secondAt + 90 * 60_000,
        },
        {
          attemptId: first,
          mode: "standard",
          status: "submitted",
          startedAt: firstAt,
          deadline: firstAt + 90 * 60_000,
          submittedAt: NOW + 10 * 60_000,
          scaled: result.scaled,
          passed: result.passed,
          points: result.points,
          totalPoints: result.totalPoints,
        },
      ]);
      expectNoKeys(res);
    });

    it("paginates and bounds the page size", async () => {
      const t = setup();
      await importSeed(t);
      const ids: Id<"attempts">[] = [];
      for (let i = 0; i < 3; i++) {
        vi.setSystemTime(NOW + i * 1000);
        ids.push(await start(t));
      }
      const p1 = await list(t, token(), 2);
      expect(p1.page.map((a) => a.attemptId)).toEqual([ids[2], ids[1]]);
      expect(p1.isDone).toBe(false);
      const p2 = await list(t, token(), 2, p1.continueCursor);
      expect(p2.page.map((a) => a.attemptId)).toEqual([ids[0]]);

      expect(await codeOf(list(t, token(), 0))).toBe("VALIDATION_FAILED");
      expect(await codeOf(list(t, token(), 101))).toBe("VALIDATION_FAILED");
      expect(await codeOf(list(t, "bad"))).toBe("BAD_TOKEN");
    });

    it("an unknown token has no history", async () => {
      const t = setup();
      expect((await list(t, token(9))).page).toEqual([]);
    });
  });
});
