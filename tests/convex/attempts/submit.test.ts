// T-207: attempts.submit, attempts.autoSubmit and the sweepOpenAttempts
// safety net (LLD §7.4, §12.3; EX-3, EX-13, EX-16, SE-1, SE-4). Uses the real
// seed so the marks match the Part 6 conversion table.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { AUTO_SUBMIT_GRACE_MS, SWEEP_BATCH, SWEEP_GRACE_MS } from "../../../convex/attempts";
import { errorCodeOf } from "../../../convex/lib/errors";
import type { AnswerValue } from "../../../shared/content";
import type { SeedExam } from "../../../scripts/lib/types";
import seedJson from "../../../content/seed/sy0-701.json";
import { setup, type T } from "../lib/fixtures";

const NOW = new Date("2026-11-08T10:00:00Z").getTime();
const LIMIT_MS = 90 * 60_000;
const SECRET = "test-server-secret-0123456789abcdef";
const IP_HASH = "b".repeat(64);
const seed = seedJson as SeedExam;

const token = (n = 0) => `tok${String(n).padStart(40, "0")}`;

const PBQ_A = ["1", "2", "3", "4", "5"];
const PBQ_B = ["B1", "B2", "B3", "B4", "B5"];
const MCQS = seed.questions.filter((q) => q.kind === "mcq").map((q) => q.displayNumber);

/** The fully correct answer for a question, built from its seed key. */
function correctAnswer(displayNumber: string): AnswerValue {
  const key = seed.answerKeys.find((k) => k.displayNumber === displayNumber);
  if (!key) throw new Error(`no key for ${displayNumber}`);
  if (key.correct) return { kind: "mcq", optionIds: [...key.correct] };
  const parts = key.parts!;
  if ("rules" in parts) return { kind: "firewall", rules: parts.rules.map((r) => ({ ...r })) };
  return { kind: "pbq", parts: { ...parts.parts } };
}

/** A wrong answer for an MCQ: a single option that isn't (all of) the key. */
function wrongMcq(displayNumber: string): AnswerValue {
  const q = seed.questions.find((x) => x.displayNumber === displayNumber);
  const key = seed.answerKeys.find((k) => k.displayNumber === displayNumber)!;
  if (!q || q.kind !== "mcq") throw new Error(`${displayNumber} is not an MCQ`);
  const pick = q.options.find((o) => !key.correct!.includes(o.id)) ?? q.options[0]!;
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

type Ctx = {
  t: T;
  versionId: Id<"examVersions">;
  attemptId: Id<"attempts">;
  deadline: number;
  q: (displayNumber: string) => Id<"questions">;
};

async function setupAttempt(mode: "standard" | "retake" = "standard"): Promise<Ctx> {
  const t = setup();
  const { versionId } = await t.mutation(internal.seed.importExam, { seed });
  const { attemptId, deadline } = await t.mutation(api.attempts.start, {
    serverSecret: SECRET,
    anonToken: token(),
    mode,
    ipHash: IP_HASH,
  });
  const rows = await t.run((ctx) => ctx.db.query("questions").collect());
  const byNumber = new Map(
    rows.filter((r) => r.versionId === versionId).map((r) => [r.displayNumber, r._id]),
  );
  const q = (n: string) => {
    const id = byNumber.get(n);
    if (!id) throw new Error(`no question ${n}`);
    return id;
  };
  return { t, versionId, attemptId, deadline, q };
}

function save(c: Ctx, displayNumber: string, value?: AnswerValue, flagged = false) {
  return c.t.mutation(api.attempts.saveResponse, {
    attemptId: c.attemptId,
    anonToken: token(),
    questionId: c.q(displayNumber),
    ...(value !== undefined ? { value } : {}),
    flagged,
  });
}

/** Save the key answer for each question, and a wrong answer for each in `wrong`. */
async function answer(c: Ctx, right: readonly string[], wrong: readonly string[] = []) {
  for (const n of right) await save(c, n, correctAnswer(n));
  for (const n of wrong) await save(c, n, wrongMcq(n));
}

function submit(c: Ctx, anonToken = token()) {
  return c.t.mutation(api.attempts.submit, { attemptId: c.attemptId, anonToken });
}

async function attemptDoc(c: Ctx): Promise<Doc<"attempts">> {
  return (await c.t.run((ctx) => ctx.db.get("attempts", c.attemptId)))!;
}

async function responseRows(c: Ctx): Promise<Doc<"responses">[]> {
  return await c.t.run((ctx) => ctx.db.query("responses").collect());
}

async function jobState(c: Ctx) {
  const a = await attemptDoc(c);
  return await c.t.run(async (ctx) => {
    const job = await ctx.db.system.get("_scheduled_functions", a.autoSubmitJobId!);
    return job!.state.kind;
  });
}

describe("attempts.submit / autoSubmit / sweepOpenAttempts (T-207)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("SERVER_SECRET", SECRET);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe("scoring with the real seed", () => {
    it("all correct: 102 / 102, 900, passed and comfortable, every domain full", async () => {
      const c = await setupAttempt();
      await answer(c, [...PBQ_A, ...MCQS]);
      vi.setSystemTime(NOW + 30 * 60_000);
      const result = await submit(c);
      expect(result).toEqual({
        points: 102,
        totalPoints: 102,
        scaled: 900,
        passed: true,
        comfortable: true,
        domains: seed.domains.map((d) => ({ domain: d.domain, points: d.points, max: d.points })),
        flaggedCount: 0,
        timeUsedSec: 30 * 60,
      });

      const a = await attemptDoc(c);
      expect(a).toMatchObject({
        status: "submitted",
        submittedBy: "student",
        submittedAt: NOW + 30 * 60_000,
        result,
      });
    });

    it.each([
      [83, 751, true],
      [82, 743, false],
    ])("the pass gate: %i points → %i (passed %s)", async (points, scaled, passed) => {
      const c = await setupAttempt();
      const right = points - 17; // PBQ set A is worth 17
      await answer(c, [...PBQ_A, ...MCQS.slice(0, right)], MCQS.slice(right));
      const result = await submit(c);
      expect(result).toMatchObject({
        points,
        totalPoints: 102,
        scaled,
        passed,
        comfortable: false,
      });
    });

    it("a blank paper scores 0 → 100 and every question earns 0", async () => {
      const c = await setupAttempt();
      const result = await submit(c);
      expect(result).toMatchObject({ points: 0, totalPoints: 102, scaled: 100, passed: false });
      expect(result.domains.every((d) => d.points === 0)).toBe(true);
      expect(await responseRows(c)).toHaveLength(0); // D9: no rows invented
    });

    it("writes earned / partResults per response; cleared and flag-only rows earn 0", async () => {
      const c = await setupAttempt();
      await save(c, "6", correctAnswer("6"));
      await save(c, "7", wrongMcq("7"), true);
      await save(c, "8", correctAnswer("8"));
      await save(c, "8"); // cleared: kept row, no value
      await save(c, "9", undefined, true); // flagged, never answered
      await save(c, "5", correctAnswer("5")); // firewall, 4 rules
      const fw = correctAnswer("5") as Extract<AnswerValue, { kind: "firewall" }>;
      await save(c, "5", {
        kind: "firewall",
        rules: [fw.rules[0]!, fw.rules[1]!, { port: null, action: null }, fw.rules[3]!],
      });
      await save(c, "1", {
        kind: "pbq",
        parts: { "1a": "193.32.162.71", "1b": "wrong", "1c": "" },
      });

      const result = await submit(c);
      expect(result.points).toBe(1 + 3 + 1);
      expect(result.flaggedCount).toBe(2);

      const byQ = new Map((await responseRows(c)).map((r) => [r.questionId, r]));
      expect(byQ.get(c.q("6"))).toMatchObject({ earned: 1 });
      expect(byQ.get(c.q("6"))!.partResults).toBeUndefined();
      expect(byQ.get(c.q("7"))).toMatchObject({ earned: 0, flagged: true });
      expect(byQ.get(c.q("8"))).toMatchObject({ earned: 0 });
      expect(byQ.get(c.q("9"))).toMatchObject({ earned: 0, flagged: true });
      expect(byQ.get(c.q("5"))).toMatchObject({
        earned: 3,
        partResults: [true, true, false, true],
      });
      // 1d is practice (PB-2): three scored parts only.
      expect(byQ.get(c.q("1"))).toMatchObject({ earned: 1, partResults: [true, false, false] });
    });

    it("a retake is marked against PBQ set B's keys", async () => {
      const c = await setupAttempt("retake");
      await answer(c, [...PBQ_B, ...MCQS]);
      const result = await submit(c);
      expect(result).toMatchObject({ points: 102, totalPoints: 102, scaled: 900, passed: true });

      const byQ = new Map((await responseRows(c)).map((r) => [r.questionId, r]));
      expect(byQ.get(c.q("B2"))).toMatchObject({ earned: 3, partResults: [true, true, true] });
      expect(byQ.get(c.q("B5"))).toMatchObject({
        earned: 4,
        partResults: [true, true, true, true],
      });
    });

    it("set A's answers in set B's fields score 0 on a retake", async () => {
      const c = await setupAttempt("retake");
      const a1 = correctAnswer("1") as Extract<AnswerValue, { kind: "pbq" }>;
      await save(c, "B1", {
        kind: "pbq",
        parts: { B1a: a1.parts["1a"]!, B1b: a1.parts["1b"]!, B1c: a1.parts["1c"]! },
      });
      const result = await submit(c);
      expect(result.points).toBe(0);
    });

    it("a question with no answer key scores 0 and is logged by id only", async () => {
      const c = await setupAttempt();
      await answer(c, ["6", "7"]);
      await c.t.run(async (ctx) => {
        const key = await ctx.db
          .query("answerKeys")
          .withIndex("by_question", (q) => q.eq("questionId", c.q("6")))
          .unique();
        await ctx.db.delete("answerKeys", key!._id);
      });
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const result = await submit(c);
        expect(result.points).toBe(1);
        expect(spy).toHaveBeenCalledTimes(1);
        const msg = String(spy.mock.calls[0]![0]);
        expect(msg).toContain(c.q("6"));
        const key6 = seed.answerKeys.find((k) => k.displayNumber === "6")!;
        expect(msg).not.toContain(key6.explanation);
      } finally {
        spy.mockRestore();
      }
      const row = (await responseRows(c)).find((r) => r.questionId === c.q("6"));
      expect(row!.earned).toBe(0);
    });
  });

  describe("submit", () => {
    it("is idempotent: a second submit returns the same result and changes nothing", async () => {
      const c = await setupAttempt();
      await answer(c, ["6", "7"]);
      vi.setSystemTime(NOW + 10 * 60_000);
      const first = await submit(c);
      const before = await attemptDoc(c);

      vi.setSystemTime(NOW + 20 * 60_000);
      const second = await submit(c);
      expect(second).toEqual(first);
      expect(await attemptDoc(c)).toEqual(before);
    });

    it("returns only the result summary: no keys, explanations or per-question marks (SE-1)", async () => {
      const c = await setupAttempt();
      await answer(c, [...PBQ_A, ...MCQS.slice(0, 10)]);
      const result = await submit(c);
      expect(Object.keys(result).sort()).toEqual(
        [
          "comfortable",
          "domains",
          "flaggedCount",
          "passed",
          "points",
          "scaled",
          "timeUsedSec",
          "totalPoints",
        ].sort(),
      );
      const json = JSON.stringify(result);
      for (const word of ["correct", "parts", "explanation", "earned", "rules", "optionIds"]) {
        expect(json).not.toContain(word);
      }
      for (const k of seed.answerKeys) expect(json).not.toContain(k.explanation);
    });

    it("cancels the pending timer job", async () => {
      const c = await setupAttempt();
      expect(await jobState(c)).toBe("pending");
      await submit(c);
      expect(await jobState(c)).toBe("canceled");

      // The cancelled job never runs: the attempt stays a student submit.
      await c.t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await attemptDoc(c)).toMatchObject({ submittedBy: "student" });
    });

    it("closes the attempt: saveResponse then fails with ATTEMPT_CLOSED", async () => {
      const c = await setupAttempt();
      await submit(c);
      expect(await codeOf(save(c, "6", correctAnswer("6")))).toBe("ATTEMPT_CLOSED");
      const state = await c.t.query(api.attempts.getState, {
        attemptId: c.attemptId,
        anonToken: token(),
      });
      expect(state.status).toBe("submitted");
    });

    it("another token's attempt is NOT_FOUND and is not submitted", async () => {
      const c = await setupAttempt();
      expect(await codeOf(submit(c, token(1)))).toBe("NOT_FOUND");
      expect(await codeOf(submit(c, "short"))).toBe("BAD_TOKEN");
      expect((await attemptDoc(c)).status).toBe("in_progress");
    });

    it("a late student submit caps submittedAt at the deadline", async () => {
      const c = await setupAttempt();
      vi.setSystemTime(c.deadline + 10_000);
      const result = await submit(c);
      expect(result.timeUsedSec).toBe(LIMIT_MS / 1000);
      expect(await attemptDoc(c)).toMatchObject({
        submittedAt: c.deadline,
        submittedBy: "student",
      });
    });

    it("an expired attempt without a result is ATTEMPT_CLOSED", async () => {
      const c = await setupAttempt();
      await c.t.run((ctx) => ctx.db.patch("attempts", c.attemptId, { status: "expired" }));
      expect(await codeOf(submit(c))).toBe("ATTEMPT_CLOSED");
    });
  });

  describe("autoSubmit (timer)", () => {
    it("submits what was saved at deadline + 30 s, with submittedBy = timer", async () => {
      const c = await setupAttempt();
      await answer(c, ["6", "7"], ["8"]);
      await save(c, "9", undefined, true);

      await c.t.finishAllScheduledFunctions(vi.runAllTimers);

      const a = await attemptDoc(c);
      expect(Date.now()).toBeGreaterThanOrEqual(c.deadline + AUTO_SUBMIT_GRACE_MS);
      expect(a).toMatchObject({
        status: "submitted",
        submittedBy: "timer",
        submittedAt: c.deadline,
        result: { points: 2, flaggedCount: 1, timeUsedSec: LIMIT_MS / 1000 },
      });
      expect(await jobState(c)).toBe("success");
    });

    it("then a student submit returns the timer's result", async () => {
      const c = await setupAttempt();
      await answer(c, ["6"]);
      await c.t.finishAllScheduledFunctions(vi.runAllTimers);
      const stored = (await attemptDoc(c)).result;
      expect(await submit(c)).toEqual(stored);
      expect((await attemptDoc(c)).submittedBy).toBe("timer");
    });

    it("is a no-op for an attempt already submitted, or deleted", async () => {
      const c = await setupAttempt();
      await answer(c, ["6"]);
      await submit(c);
      const before = await attemptDoc(c);
      await c.t.mutation(internal.attempts.autoSubmit, { attemptId: c.attemptId });
      expect(await attemptDoc(c)).toEqual(before);

      await c.t.run((ctx) => ctx.db.delete("attempts", c.attemptId));
      await expect(
        c.t.mutation(internal.attempts.autoSubmit, { attemptId: c.attemptId }),
      ).resolves.toBeNull();
    });
  });

  describe("sweepOpenAttempts (safety net)", () => {
    it("finalises an attempt whose timer job was lost, once it is 60 s past the deadline", async () => {
      const c = await setupAttempt();
      await answer(c, ["6", "7"]);
      const a = await attemptDoc(c);
      await c.t.run((ctx) => ctx.scheduler.cancel(a.autoSubmitJobId!)); // the lost job

      vi.setSystemTime(c.deadline + SWEEP_GRACE_MS - 1_000);
      expect(await c.t.mutation(internal.attempts.sweepOpenAttempts, {})).toBe(0);
      expect((await attemptDoc(c)).status).toBe("in_progress");

      vi.setSystemTime(c.deadline + SWEEP_GRACE_MS + 1_000);
      expect(await c.t.mutation(internal.attempts.sweepOpenAttempts, {})).toBe(1);
      expect(await attemptDoc(c)).toMatchObject({
        status: "submitted",
        submittedBy: "timer",
        submittedAt: c.deadline,
        result: { points: 2, timeUsedSec: LIMIT_MS / 1000 },
      });

      // Nothing left: a second run finds nothing.
      expect(await c.t.mutation(internal.attempts.sweepOpenAttempts, {})).toBe(0);
    });

    it("works in batches and reschedules itself until every stale attempt is closed", async () => {
      const c = await setupAttempt();
      const extra = SWEEP_BATCH + 2;
      const ids = await c.t.run(async (ctx) => {
        const base = await ctx.db.get("attempts", c.attemptId);
        const out: Id<"attempts">[] = [];
        for (let i = 0; i < extra; i++) {
          const { _id, _creationTime, autoSubmitJobId, ...rest } = base!;
          void _id;
          void _creationTime;
          void autoSubmitJobId;
          out.push(await ctx.db.insert("attempts", { ...rest, deadline: base!.deadline - i }));
        }
        return out;
      });
      vi.setSystemTime(c.deadline + SWEEP_GRACE_MS + 1_000);

      expect(await c.t.mutation(internal.attempts.sweepOpenAttempts, {})).toBe(SWEEP_BATCH);
      // The follow-up run (and the original timer job, now a no-op) finish the rest.
      await c.t.finishAllScheduledFunctions(vi.runAllTimers);

      const docs = await c.t.run(async (ctx) =>
        Promise.all([...ids, c.attemptId].map((id) => ctx.db.get("attempts", id))),
      );
      expect(docs.every((d) => d!.status === "submitted" && d!.submittedBy === "timer")).toBe(true);
    });
  });
});
