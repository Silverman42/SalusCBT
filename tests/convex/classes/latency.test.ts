// T-510: the Stage 5 dashboard gate ("a tutor sees a student's attempt within
// 5 seconds of submission"; PRD CL-5), backend half.
//
// The dashboard is plain Convex subscriptions to `classes.attempts` and
// `classes.stats`. Convex re-runs a subscribed query as soon as a mutation
// that touches its read set commits, so the gate holds if `attempts.submit`
// (or the timer's `autoSubmit`) leaves the attempt marked in that same
// commit, with no follow-up job, and the queries stay cheap enough to re-run
// on a big class. Both are checked here; the end-to-end browser timing is
// tests/e2e/classes.spec.ts.

import { TransactionMetricsTracker } from "convex-test/dist/transactionMetrics.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CLASS_ATTEMPTS_LIMIT, MOST_MISSED_SAMPLE } from "../../../convex/classes";
import type { AnswerValue } from "../../../shared/content";
import type { SeedExam } from "../../../scripts/lib/types";
import seedJson from "../../../content/seed/sy0-701.json";
import { seedSignedIn, setup, type T } from "../lib/fixtures";

const seed = seedJson as SeedExam;
const NOW = new Date("2026-11-08T10:00:00Z").getTime();
const SECRET = "test-server-secret-0123456789abcdef";
const token = (n: number) => `tok${String(n).padStart(40, "0")}`;
const ipHash = (n: number) => n.toString(16).padStart(64, "0");
const MiB = 1 << 20;

/**
 * The limits to stay inside: Convex's older, stricter per-function read
 * limits (16,384 documents, 8 MiB). convex-test's defaults, the current
 * Convex limits, are 32,000 documents and 16 MiB.
 */
const READ_LIMITS = { documentsRead: 16_384, bytesRead: 8 * MiB };

function correctAnswer(n: string): AnswerValue {
  const key = seed.answerKeys.find((k) => k.displayNumber === n)!;
  if (key.correct) return { kind: "mcq", optionIds: [...key.correct] };
  const parts = key.parts!;
  if ("rules" in parts) return { kind: "firewall", rules: parts.rules.map((r) => ({ ...r })) };
  return { kind: "pbq", parts: { ...parts.parts } };
}

const STANDARD_PAPER = seed.questions
  .filter((q) => q.section !== "pbqB")
  .map((q) => q.displayNumber);

async function world(opts: { transactionLimits?: typeof READ_LIMITS } = {}) {
  const t = setup(opts);
  const { versionId } = await t.mutation(internal.seed.importExam, { seed });
  const rows = await t.run((ctx) =>
    ctx.db
      .query("questions")
      .withIndex("by_version_section_order", (q) => q.eq("versionId", versionId))
      .collect(),
  );
  const byNumber = new Map(rows.map((r) => [r.displayNumber, r._id]));
  const tutor = await seedSignedIn(t, { label: "tutor", role: "tutor" });
  const { classId, code } = await tutor.as.mutation(api.classes.create, {
    name: "Evening group",
    versionId,
  });
  let n = 0;
  /** A student in the class who has answered the whole paper correctly. */
  const student = async (name: string) => {
    const anonToken = token(++n);
    const { attemptId } = await t.mutation(api.attempts.start, {
      serverSecret: SECRET,
      anonToken,
      mode: "standard",
      ipHash: ipHash(n),
      classCode: code,
      displayName: name,
    });
    for (const num of STANDARD_PAPER) {
      await t.mutation(api.attempts.saveResponse, {
        attemptId,
        anonToken,
        questionId: byNumber.get(num)!,
        value: correctAnswer(num),
        flagged: false,
      });
    }
    return { attemptId, anonToken };
  };
  return { t, tutor, classId, student };
}

const pendingJobs = (t: T) =>
  t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect()).filter(
      (j) => j.state.kind === "pending" || j.state.kind === "inProgress",
    ),
  );

describe("class dashboard latency (T-510, CL-5)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("SERVER_SECRET", SECRET);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("a student's submit shows, marked, in the very next attempts and stats read", async () => {
    const w = await world();
    const ann = await w.student("Ann");
    const byClass = { classId: w.classId };

    const before = await w.tutor.as.query(api.classes.attempts, byClass);
    expect(before).toEqual([
      expect.objectContaining({ displayName: "Ann", status: "in_progress" }),
    ]);
    expect(await w.tutor.as.query(api.classes.stats, byClass)).toMatchObject({
      inProgressCount: 1,
      submittedCount: 0,
    });

    vi.setSystemTime(NOW + 25 * 60_000);
    await w.t.mutation(api.attempts.submit, ann);

    // Nothing else has to run: the submit cancelled the timer job and left no
    // follow-up work, so the commit itself is what the dashboard sees.
    expect(await pendingJobs(w.t)).toEqual([]);

    const after = await w.tutor.as.query(api.classes.attempts, byClass);
    expect(after).toEqual([
      expect.objectContaining({
        attemptId: ann.attemptId,
        status: "submitted",
        submittedBy: "student",
        submittedAt: NOW + 25 * 60_000,
        scaled: 900,
        passed: true,
      }),
    ]);
    expect(await w.tutor.as.query(api.classes.stats, byClass)).toMatchObject({
      inProgressCount: 0,
      submittedCount: 1,
      passedCount: 1,
      avgScaled: 900,
    });
    // The review page opens straight away too.
    expect(
      await w.tutor.as.query(api.classes.attemptResult, { attemptId: ann.attemptId }),
    ).toMatchObject({ displayName: "Ann", result: { scaled: 900 } });
  });

  it("a timer auto-submit shows, marked, as soon as the timer job commits", async () => {
    const w = await world();
    const bob = await w.student("Bob");
    // The timer fires at deadline + 30 s (90 minutes, standard time).
    vi.setSystemTime(NOW + 90 * 60_000 + 30_000);
    await w.t.finishAllScheduledFunctions(vi.runAllTimers);
    const rows = await w.tutor.as.query(api.classes.attempts, { classId: w.classId });
    expect(rows).toEqual([
      expect.objectContaining({
        attemptId: bob.attemptId,
        status: "submitted",
        submittedBy: "timer",
        scaled: 900,
      }),
    ]);
  });

  describe("read limits on a big class", () => {
    /**
     * `CLASS_ATTEMPTS_LIMIT` submitted attempts, the newest
     * `MOST_MISSED_SAMPLE` with a full set of responses (the ones `stats`
     * reads for most-missed), cloned from one real submission.
     */
    async function bigClass() {
      const w = await world({ transactionLimits: READ_LIMITS });
      const ann = await w.student("Ann");
      await w.t.mutation(api.attempts.submit, ann);
      const { attempt, responses } = await w.t.run(async (ctx) => ({
        attempt: (await ctx.db.get("attempts", ann.attemptId))!,
        responses: await ctx.db
          .query("responses")
          .withIndex("by_attempt_question", (q) => q.eq("attemptId", ann.attemptId))
          .collect(),
      }));
      expect(responses).toHaveLength(STANDARD_PAPER.length);
      const { _id, _creationTime, autoSubmitJobId: _job, ...fields } = attempt;

      const total = CLASS_ATTEMPTS_LIMIT;
      const BATCH = 50;
      for (let start = 1; start < total; start += BATCH) {
        await w.t.run(async (ctx) => {
          for (let i = start; i < Math.min(start + BATCH, total); i++) {
            const id: Id<"attempts"> = await ctx.db.insert("attempts", {
              ...fields,
              anonKey: `${i}`.padStart(64, "0"),
              displayName: `Student ${i}`,
              startedAt: fields.startedAt + i * 1000,
              submittedAt: fields.submittedAt! + i * 1000,
            });
            if (i < total - MOST_MISSED_SAMPLE) continue;
            for (const { _id: _r, _creationTime: _c, attemptId: _a, ...r } of responses) {
              await ctx.db.insert("responses", { ...r, attemptId: id });
            }
          }
        });
      }
      return w;
    }

    /** Documents and bytes one call reads, as convex-test counts them. */
    async function measure(run: () => Promise<unknown>) {
      let documents = 0;
      let bytes = 0;
      const original = TransactionMetricsTracker.prototype.trackRead;
      const spy = vi
        .spyOn(TransactionMetricsTracker.prototype, "trackRead")
        .mockImplementation(function (this: TransactionMetricsTracker, size: number) {
          documents++;
          bytes += size;
          return original.call(this, size);
        });
      try {
        await run();
      } finally {
        spy.mockRestore();
      }
      return { documents, bytes };
    }

    it(
      `stats, attempts and the CSV export of a ${CLASS_ATTEMPTS_LIMIT}-attempt class stay inside the read limits`,
      { timeout: 60_000 },
      async () => {
        const w = await bigClass();
        const byClass = { classId: w.classId };

        let stats: { submittedCount: number; mostMissedSample: number; truncated: boolean };
        const statsReads = await measure(async () => {
          stats = await w.tutor.as.query(api.classes.stats, byClass);
        });
        expect(stats!).toMatchObject({
          submittedCount: CLASS_ATTEMPTS_LIMIT,
          mostMissedSample: MOST_MISSED_SAMPLE,
          truncated: true,
        });
        // Every sampled attempt's responses were read, so the count is real.
        expect(statsReads.documents).toBeGreaterThan(
          CLASS_ATTEMPTS_LIMIT + MOST_MISSED_SAMPLE * STANDARD_PAPER.length,
        );
        expect(statsReads.documents).toBeLessThan(READ_LIMITS.documentsRead);
        expect(statsReads.bytes).toBeLessThan(READ_LIMITS.bytesRead);

        const attemptsReads = await measure(async () => {
          const rows = await w.tutor.as.query(api.classes.attempts, byClass);
          expect(rows).toHaveLength(CLASS_ATTEMPTS_LIMIT);
        });
        expect(attemptsReads.documents).toBeLessThan(READ_LIMITS.documentsRead);
        expect(attemptsReads.bytes).toBeLessThan(READ_LIMITS.bytesRead);

        const csvReads = await measure(async () => {
          const csv = await w.tutor.as.action(api.classes.exportCsv, byClass);
          expect(csv.split("\r\n").filter((l) => l.length > 0)).toHaveLength(
            CLASS_ATTEMPTS_LIMIT + 1,
          );
        });
        expect(csvReads.documents).toBeLessThan(READ_LIMITS.documentsRead);
        // Measured when written (T-510 notes): stats 14,596 documents / 3.8 MiB;
        // attempts and the CSV 1,004 documents / 0.8 MiB each.
      },
    );

    it("the limits are really enforced here (a tighter one makes stats fail)", async () => {
      const w = await world({ transactionLimits: { ...READ_LIMITS, documentsRead: 500 } });
      const ann = await w.student("Ann");
      await w.t.mutation(api.attempts.submit, ann);
      // One attempt is ~200 reads (paper, responses, auth); clone a few.
      await w.t.run(async (ctx) => {
        const a = (await ctx.db.get("attempts", ann.attemptId))!;
        const rs = await ctx.db
          .query("responses")
          .withIndex("by_attempt_question", (q) => q.eq("attemptId", a._id))
          .collect();
        const { _id, _creationTime, autoSubmitJobId: _j, ...fields } = a;
        for (let i = 1; i <= 5; i++) {
          const id = await ctx.db.insert("attempts", { ...fields, startedAt: a.startedAt + i });
          for (const { _id: _r, _creationTime: _c, attemptId: _a, ...r } of rs) {
            await ctx.db.insert("responses", { ...r, attemptId: id });
          }
        }
      });
      await expect(w.tutor.as.query(api.classes.stats, { classId: w.classId })).rejects.toThrow(
        /too many documents/i,
      );
    });
  });
});
