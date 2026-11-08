// T-502: classes.attempts / stats / attemptResult / attemptReview (LLD §5.2;
// CL-5, CL-6, CL-7, SE-2). Uses the real seed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { scoreStats } from "../../../convex/lib/classStats";
import { errorCodeOf } from "../../../convex/lib/errors";
import type { AnswerValue } from "../../../shared/content";
import type { SeedExam } from "../../../scripts/lib/types";
import seedJson from "../../../content/seed/sy0-701.json";
import { seedSignedIn, setup } from "../lib/fixtures";

const NOW = new Date("2026-11-08T10:00:00Z").getTime();
const SECRET = "test-server-secret-0123456789abcdef";
const seed = seedJson as SeedExam;

const token = (n: number) => `tok${String(n).padStart(40, "0")}`;
const ipHash = (n: number) => n.toString(16).padStart(64, "0");

const PBQ_A = ["1", "2", "3", "4", "5"];
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

type World = Awaited<ReturnType<typeof world>>;

/** Seed, two tutors and an admin, and a class owned by tutor A. */
async function world() {
  const t = setup();
  const { versionId } = await t.mutation(internal.seed.importExam, { seed });
  const rows = await t.run((ctx) => ctx.db.query("questions").collect());
  const byNumber = new Map(rows.map((r) => [r.displayNumber, r._id]));
  const q = (n: string): Id<"questions"> => byNumber.get(n)!;
  const tutorA = await seedSignedIn(t, { label: "a", role: "tutor" });
  const tutorB = await seedSignedIn(t, { label: "b", role: "tutor" });
  const admin = await seedSignedIn(t, { label: "admin", role: "admin" });
  const { classId, code } = await tutorA.as.mutation(api.classes.create, {
    name: "Evening group",
    versionId,
  });
  return { t, q, versionId, tutorA, tutorB, admin, classId, code };
}

let tokens = 0;

/** A student attempt (in the class unless `classCode: null`). */
async function student(w: World, name: string, opts: { classCode?: string | null } = {}) {
  const n = ++tokens;
  const classCode = opts.classCode === undefined ? w.code : opts.classCode;
  const { attemptId } = await w.t.mutation(api.attempts.start, {
    serverSecret: SECRET,
    anonToken: token(n),
    mode: "standard",
    ipHash: ipHash(n),
    ...(classCode !== null ? { classCode, displayName: name } : {}),
  });
  const anonToken = token(n);
  return {
    attemptId,
    anonToken,
    save: (num: string, value: AnswerValue) =>
      w.t.mutation(api.attempts.saveResponse, {
        attemptId,
        anonToken,
        questionId: w.q(num),
        value,
        flagged: false,
      }),
    submit: () => w.t.mutation(api.attempts.submit, { attemptId, anonToken }),
  };
}

describe("class dashboard (T-502)", () => {
  beforeEach(() => {
    tokens = 0;
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("SERVER_SECRET", SECRET);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe("attempts", () => {
    it("lists class attempts newest first; a submission shows its score at once", async () => {
      const w = await world();
      const ann = await student(w, "Ann");
      vi.setSystemTime(NOW + 60_000);
      const bob = await student(w, "Bob");
      await student(w, "Solo", { classCode: null });

      const before = await w.tutorA.as.query(api.classes.attempts, { classId: w.classId });
      expect(before.map((r) => r.displayName)).toEqual(["Bob", "Ann"]);
      expect(before[1]).toEqual({
        attemptId: ann.attemptId,
        displayName: "Ann",
        mode: "standard",
        status: "in_progress",
        startedAt: expect.any(Number),
        deadline: expect.any(Number),
      });

      for (const n of [...PBQ_A, ...MCQS]) await ann.save(n, correctAnswer(n));
      vi.setSystemTime(NOW + 20 * 60_000);
      await ann.submit();

      const after = await w.tutorA.as.query(api.classes.attempts, { classId: w.classId });
      expect(after.find((r) => r.attemptId === ann.attemptId)).toMatchObject({
        status: "submitted",
        submittedAt: NOW + 20 * 60_000,
        submittedBy: "student",
        scaled: 900,
        passed: true,
        points: 102,
        totalPoints: 102,
        timeUsedSec: 1200,
        flaggedCount: 0,
      });
      expect(after.find((r) => r.attemptId === bob.attemptId)?.scaled).toBeUndefined();
    });

    it("never returns anon keys, tokens or IP hashes", async () => {
      const w = await world();
      const s = await student(w, "Ann");
      await s.submit();
      const doc = (await w.t.run((ctx) => ctx.db.get("attempts", s.attemptId)))!;
      const json = JSON.stringify(
        await w.tutorA.as.query(api.classes.attempts, { classId: w.classId }),
      );
      expect(json).not.toContain(doc.anonKey);
      expect(json).not.toContain(s.anonToken);
      expect(json).not.toContain(ipHash(1));
      expect(json).not.toMatch(/anonKey|ipHash|shuffleSeed|autoSubmitJobId/);
    });

    it("filters by status and pass/fail", async () => {
      const w = await world();
      const pass = await student(w, "Pass");
      for (const n of [...PBQ_A, ...MCQS]) await pass.save(n, correctAnswer(n));
      await pass.submit();
      const fail = await student(w, "Fail");
      await fail.submit();
      await student(w, "Busy");
      const names = async (filter: "all" | "in_progress" | "submitted" | "passed" | "failed") =>
        (await w.tutorA.as.query(api.classes.attempts, { classId: w.classId, filter }))
          .map((r) => r.displayName)
          .sort();
      expect(await names("all")).toEqual(["Busy", "Fail", "Pass"]);
      expect(await names("in_progress")).toEqual(["Busy"]);
      expect(await names("submitted")).toEqual(["Fail", "Pass"]);
      expect(await names("passed")).toEqual(["Pass"]);
      expect(await names("failed")).toEqual(["Fail"]);
    });
  });

  describe("stats", () => {
    it("is empty for a class with no submissions", async () => {
      const w = await world();
      await student(w, "Busy");
      const s = await w.tutorA.as.query(api.classes.stats, { classId: w.classId });
      expect(s).toMatchObject({
        attemptCount: 1,
        inProgressCount: 1,
        submittedCount: 0,
        passedCount: 0,
        passRate: null,
        avgScaled: null,
        medianScaled: null,
        passScaled: 750,
        domainTarget: 0.81,
        mostMissed: [],
        mostMissedSample: 0,
        truncated: false,
      });
      expect(s.domains.map((d) => d.share)).toEqual([null, null, null, null, null]);
    });

    it("averages, pass rate, domains and most-missed over submitted class attempts", async () => {
      const w = await world();
      // Ann: everything right except the first three MCQs.
      const ann = await student(w, "Ann");
      for (const n of PBQ_A) await ann.save(n, correctAnswer(n));
      for (const n of MCQS.slice(3)) await ann.save(n, correctAnswer(n));
      for (const n of MCQS.slice(0, 3)) await ann.save(n, wrongMcq(n));
      await ann.submit();
      // Bob: blank paper. Cat: still sitting. Solo: not in the class.
      const bob = await student(w, "Bob");
      await bob.submit();
      await student(w, "Cat");
      const solo = await student(w, "Solo", { classCode: null });
      await solo.submit();

      const s = await w.tutorA.as.query(api.classes.stats, { classId: w.classId });
      expect(s).toMatchObject({
        attemptCount: 3,
        inProgressCount: 1,
        submittedCount: 2,
        passedCount: 1,
        passRate: 0.5,
        // Ann 99/102 → 876; Bob 0 → 100.
        avgScaled: 488,
        medianScaled: 488,
        mostMissedSample: 2,
      });
      const points = s.domains.reduce((sum, d) => sum + d.points, 0);
      const max = s.domains.reduce((sum, d) => sum + d.max, 0);
      expect(points).toBe(99);
      expect(max).toBe(204);
      // Half the class scored nothing, so every domain is below the 0.81 target.
      expect(s.domains.every((d) => d.belowTarget)).toBe(true);

      expect(s.mostMissed).toHaveLength(10);
      expect(s.mostMissed.slice(0, 3).map((m) => m.displayNumber)).toEqual(MCQS.slice(0, 3));
      expect(s.mostMissed[0]).toMatchObject({ sat: 2, missed: 2, missRate: 1, kind: "mcq" });
      expect(s.mostMissed[3]).toMatchObject({ sat: 2, missed: 1, missRate: 0.5 });
      // No keys or explanations in the stats.
      expect(JSON.stringify(s)).not.toMatch(/"correct|"explanation"|anonKey/);
    });
  });

  describe("attemptResult and attemptReview", () => {
    it("gives the tutor exactly the review the student sees", async () => {
      const w = await world();
      const s = await student(w, "Ann");
      await s.save("1", correctAnswer("1"));
      await s.save(MCQS[0]!, wrongMcq(MCQS[0]!));
      await s.submit();
      const args = { attemptId: s.attemptId, anonToken: s.anonToken };

      const review = await w.tutorA.as.query(api.classes.attemptReview, {
        attemptId: s.attemptId,
      });
      expect(review).toEqual(await w.t.query(api.review.getReview, args));
      expect(review.length).toBe(PBQ_A.length + MCQS.length);

      const result = await w.tutorA.as.query(api.classes.attemptResult, {
        attemptId: s.attemptId,
      });
      expect(result).toEqual({
        ...(await w.t.query(api.review.getResult, args)),
        displayName: "Ann",
        classId: w.classId,
        className: "Evening group",
      });
    });

    it("an in-progress attempt is NOT_FOUND, so no keys reach anyone early", async () => {
      const w = await world();
      const s = await student(w, "Ann");
      const args = { attemptId: s.attemptId };
      expect(await codeOf(w.tutorA.as.query(api.classes.attemptReview, args))).toBe("NOT_FOUND");
      expect(await codeOf(w.tutorA.as.query(api.classes.attemptResult, args))).toBe("NOT_FOUND");
    });

    it("an attempt outside any class is NOT_FOUND, even for the admin", async () => {
      const w = await world();
      const s = await student(w, "Solo", { classCode: null });
      await s.submit();
      const args = { attemptId: s.attemptId };
      expect(await codeOf(w.admin.as.query(api.classes.attemptReview, args))).toBe("NOT_FOUND");
      expect(await codeOf(w.admin.as.query(api.classes.attemptResult, args))).toBe("NOT_FOUND");
    });
  });

  describe("access (SE-2)", () => {
    it("another tutor gets NOT_FOUND for everything; the admin passes", async () => {
      const w = await world();
      const s = await student(w, "Ann");
      await s.submit();
      const byClass = { classId: w.classId };
      const byAttempt = { attemptId: s.attemptId };

      expect(await codeOf(w.tutorB.as.query(api.classes.attempts, byClass))).toBe("NOT_FOUND");
      expect(await codeOf(w.tutorB.as.query(api.classes.stats, byClass))).toBe("NOT_FOUND");
      expect(await codeOf(w.tutorB.as.query(api.classes.attemptReview, byAttempt))).toBe(
        "NOT_FOUND",
      );
      expect(await codeOf(w.tutorB.as.query(api.classes.attemptResult, byAttempt))).toBe(
        "NOT_FOUND",
      );

      expect(await w.admin.as.query(api.classes.attempts, byClass)).toHaveLength(1);
      expect((await w.admin.as.query(api.classes.stats, byClass)).submittedCount).toBe(1);
      expect(await w.admin.as.query(api.classes.attemptReview, byAttempt)).not.toHaveLength(0);
    });

    it("signed-out and removed callers are refused", async () => {
      const w = await world();
      const removed = await seedSignedIn(w.t, { label: "gone", role: "tutor", status: "removed" });
      const byClass = { classId: w.classId };
      expect(await codeOf(w.t.query(api.classes.attempts, byClass))).toBe("UNAUTHENTICATED");
      expect(await codeOf(w.t.query(api.classes.stats, byClass))).toBe("UNAUTHENTICATED");
      expect(await codeOf(removed.as.query(api.classes.attempts, byClass))).toBe("FORBIDDEN");
    });

    it("a deleted class is NOT_FOUND", async () => {
      const w = await world();
      await w.t.run((ctx) => ctx.db.delete("classes", w.classId));
      expect(await codeOf(w.tutorA.as.query(api.classes.attempts, { classId: w.classId }))).toBe(
        "NOT_FOUND",
      );
    });
  });
});

describe("scoreStats", () => {
  const marked = (scaled: number, passed: boolean) =>
    ({
      status: "submitted",
      result: {
        points: 0,
        totalPoints: 1,
        scaled,
        passed,
        comfortable: false,
        domains: [{ domain: "1.0", points: 9, max: 10 }],
        flaggedCount: 0,
        timeUsedSec: 0,
      },
    }) as unknown as Doc<"attempts">;

  it("takes the middle score for an odd count and the mean of the middle two for an even count", () => {
    expect(
      scoreStats([marked(500, false), marked(900, true), marked(800, true)], 0.81),
    ).toMatchObject({ medianScaled: 800, avgScaled: 733.3, passRate: 2 / 3 });
    expect(scoreStats([marked(500, false), marked(801, true)], 0.81).medianScaled).toBe(650.5);
  });

  it("flags a domain only when its class share is below target", () => {
    const s = scoreStats([marked(800, true)], 0.81);
    expect(s.domains[0]).toEqual({
      domain: "1.0",
      points: 9,
      max: 10,
      share: 0.9,
      belowTarget: false,
    });
    expect(scoreStats([marked(800, true)], 0.95).domains[0]!.belowTarget).toBe(true);
    expect(s.domains[1]).toMatchObject({ max: 0, share: null, belowTarget: false });
  });
});
