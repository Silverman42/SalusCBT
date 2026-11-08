/**
 * Attempt lifecycle (LLD §7, PRD EX-1, EX-3, EX-11, CL-4, PB-4, SE-5, EX-21).
 *
 * `start` is the only way to create an attempt. It is a public mutation, but
 * only the Nuxt server route `server/api/attempts/start.post.ts` (T-203) can
 * use it: the route adds `serverSecret` (= `SERVER_SECRET`, shared with Nuxt
 * as `NUXT_SERVER_SECRET`) and `ipHash` (HMAC of the client IP, computed with
 * `NUXT_IP_PEPPER` so the raw IP never leaves Nuxt; PR-3). The start time and
 * deadline are set here, never by the client (EX-3).
 *
 * `startInfo` feeds the start screen (time limit with the class multiplier,
 * whether the retake can be started; EX-21, PB-4).
 *
 * `getPaper` and `getState` are the student's reads (T-205). Both take the
 * anon token and give the same `NOT_FOUND` for a missing or foreign attempt.
 * `saveResponse` (T-206) is the student's only write while sitting the exam.
 *
 * Marking happens once, in `finalise` (T-207, LLD §7.4), reached three ways:
 * the student's `submit`, the timer's `autoSubmit` (scheduled by `start`) and
 * the `sweepOpenAttempts` cron, a safety net for a lost timer job.
 */
import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { env, internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import type { AnswerValue } from "../shared/content";
import { answerValueValidator } from "../shared/validate";
import { anonKeyOf, loadOwnAttempt } from "./lib/anon";
import { answerFitsQuestion, isBlankAnswer } from "./lib/answers";
import { secretsMatch } from "./lib/clientIp";
import { normaliseClassCode, randomUint32 } from "./lib/codes";
import { fail } from "./lib/errors";
import {
  hasFullRetakeSet,
  loadPaperQuestions,
  paperValidator,
  sectionsFor,
  toPaperQuestion,
} from "./lib/paper";
import { enforceRateLimit } from "./lib/rateLimits";
import { scorePaper, type MarkKey } from "./marking/score";
import { attemptResultValidator } from "./schema";

/** The exam a start without a class code sits (its `defaultVersionId`). */
export const DEFAULT_EXAM_SLUG = "sy0-701";

/** SE-4: the timer job runs this long after the deadline (same grace as saves). */
export const AUTO_SUBMIT_GRACE_MS = 30_000;

/** SE-4: saves are accepted until `deadline + 30 s`, when the timer submits. */
export const SAVE_GRACE_MS = AUTO_SUBMIT_GRACE_MS;

/** CL-4: display name length after trimming. */
export const DISPLAY_NAME_MAX = 40;

/** Longer than any real class code (`SEC-XXXX`); longer input is just unknown. */
const CLASS_CODE_INPUT_MAX = 32;

/** `ipHash` is an HMAC digest (hex or base64), so it is short and non-empty. */
const IP_HASH_MAX = 128;

const modeValidator = v.union(v.literal("standard"), v.literal("retake"));

/**
 * Refuse the call unless `presented` matches `SERVER_SECRET`. Compared in
 * constant time over SHA-256 digests, so neither the position of the first
 * difference nor the length leaks (as for the auth proxy header, LLD §18.1
 * finding 4). Unset or empty `SERVER_SECRET` refuses every call: an empty
 * secret would otherwise match an empty argument.
 */
async function requireServerSecret(presented: string): Promise<void> {
  const expected = env.SERVER_SECRET;
  if (!expected) {
    // A deployment problem, not a client one: a plain Error is logged with this
    // message and reaches the Nuxt route as a server error.
    throw new Error(
      "attempts.start: SERVER_SECRET is not set on this Convex deployment. Set it to the same value as NUXT_SERVER_SECRET.",
    );
  }
  if (!presented || !(await secretsMatch(presented, expected))) fail("FORBIDDEN");
}

/** Trimmed display name, `undefined` when blank; `VALIDATION_FAILED` if over 40 characters. */
function cleanDisplayName(input: string | undefined): string | undefined {
  const name = input?.trim();
  if (!name) return undefined;
  if (name.length > DISPLAY_NAME_MAX) fail("VALIDATION_FAILED");
  return name;
}

/** The open class for a code, or `CLASS_UNKNOWN` / `CLASS_CLOSED` (LLD §7.1 step 4). */
async function openClassByCode(ctx: MutationCtx, input: string): Promise<Doc<"classes">> {
  if (input.length > CLASS_CODE_INPUT_MAX) fail("CLASS_UNKNOWN");
  const code = normaliseClassCode(input);
  const cls = await ctx.db
    .query("classes")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
  if (!cls) fail("CLASS_UNKNOWN");
  if (cls.status !== "open") fail("CLASS_CLOSED");
  return cls;
}

/** EX-21: a positive finite multiplier, otherwise the standard time (1). */
function multiplierOf(cls: Doc<"classes"> | null): number {
  const m = cls?.timeMultiplier;
  return typeof m === "number" && Number.isFinite(m) && m > 0 ? m : 1;
}

/**
 * Start an attempt (LLD §7.1). Errors: `FORBIDDEN` (bad secret), `BAD_TOKEN`,
 * `RATE_LIMITED` (`{ code, retryAfter }`), `CLASS_UNKNOWN`, `CLASS_CLOSED`,
 * `VALIDATION_FAILED` (display name missing for a class, or over 40
 * characters), `NOT_FOUND` (no published version to sit, or `mode: "retake"`
 * when the version's PBQ set B is incomplete; PB-4, LLD §10.2).
 *
 * The result holds ids and times only: nothing is read from `answerKeys` (SE-1).
 */
export const start = mutation({
  args: {
    serverSecret: v.string(),
    anonToken: v.string(),
    displayName: v.optional(v.string()),
    classCode: v.optional(v.string()),
    mode: modeValidator,
    ipHash: v.string(),
  },
  returns: v.object({
    attemptId: v.id("attempts"),
    deadline: v.number(),
    serverNow: v.number(),
  }),
  handler: async (ctx, args) => {
    // 1. Only the Nuxt server route may call this.
    await requireServerSecret(args.serverSecret);
    if (!args.ipHash || args.ipHash.length > IP_HASH_MAX) {
      throw new Error("attempts.start: ipHash must be a non-empty HMAC digest.");
    }

    // 2. Never store the token itself (D4).
    const anonKey = await anonKeyOf(args.anonToken);

    // 3. SE-5. A later throw rolls the whole mutation back, tokens included.
    await enforceRateLimit(ctx, "attemptStartAnon", anonKey);
    await enforceRateLimit(ctx, "attemptStartIp", args.ipHash);

    // 4. Class code (CL-4) or the default exam.
    const displayName = cleanDisplayName(args.displayName);
    const classCode = args.classCode?.trim() ? args.classCode : undefined;
    const cls = classCode !== undefined ? await openClassByCode(ctx, classCode) : null;
    if (cls && displayName === undefined) fail("VALIDATION_FAILED");

    let versionId = cls?.versionId;
    if (!versionId) {
      const exam = await ctx.db
        .query("exams")
        .withIndex("by_slug", (q) => q.eq("slug", DEFAULT_EXAM_SLUG))
        .unique();
      versionId = exam?.defaultVersionId;
    }
    const version = versionId ? await ctx.db.get("examVersions", versionId) : null;
    if (!version || version.status !== "published") fail("NOT_FOUND");
    const exam = await ctx.db.get("exams", version.examId);
    if (!exam) fail("NOT_FOUND");
    if (args.mode === "retake" && !(await hasFullRetakeSet(ctx, version._id))) fail("NOT_FOUND");

    // 5–6. The PBQ set (pbqA, or pbqB for a retake; PB-4) follows from `mode`
    // when the paper is built (T-205), so only the mode is stored.
    const now = Date.now();
    const deadline = now + Math.round(exam.timeLimitMin * 60_000 * multiplierOf(cls));
    const attemptId = await ctx.db.insert("attempts", {
      anonKey,
      ...(displayName !== undefined ? { displayName } : {}),
      ...(cls ? { classId: cls._id } : {}),
      versionId: version._id,
      mode: args.mode,
      status: "in_progress",
      startedAt: now,
      deadline,
      shuffleSeed: randomUint32(),
      ipHash: args.ipHash,
    });

    // 7. The timer submits whatever is saved once the grace period is over.
    const autoSubmitJobId = await ctx.scheduler.runAt(
      deadline + AUTO_SUBMIT_GRACE_MS,
      internal.attempts.autoSubmit,
      { attemptId },
    );
    await ctx.db.patch("attempts", attemptId, { autoSubmitJobId });

    // 8.
    return { attemptId, deadline, serverNow: now };
  },
});

/**
 * What the start screen tells the student before the timer starts (EX-2,
 * EX-21, PB-4): the time limit in minutes (the exam's `timeLimitMin` times the
 * class `timeMultiplier`, unrounded: 1.25 × 90 is 112.5, as the deadline is), the
 * multiplier itself, and whether a retake (PBQ set B) can be started.
 *
 * Without `classCode` this describes the default exam. `null` when the code is
 * unknown or there is nothing to sit (the class is closed, or its version is
 * no longer published), i.e. when `start` would refuse anyway; the class-code
 * field (`classes.lookupCode`) says why. Public and account-free: it reveals
 * no more than the start screen shows (no ids, no content, no keys).
 */
export const startInfo = query({
  args: { classCode: v.optional(v.string()) },
  returns: v.union(
    v.null(),
    v.object({ minutes: v.number(), timeMultiplier: v.number(), retake: v.boolean() }),
  ),
  handler: async (ctx, args) => {
    let cls: Doc<"classes"> | null = null;
    let versionId: Id<"examVersions"> | undefined;
    if (args.classCode?.trim()) {
      if (args.classCode.length > CLASS_CODE_INPUT_MAX) return null;
      const code = normaliseClassCode(args.classCode);
      cls = await ctx.db
        .query("classes")
        .withIndex("by_code", (q) => q.eq("code", code))
        .unique();
      if (!cls || cls.status !== "open") return null;
      versionId = cls.versionId;
    } else {
      const exam = await ctx.db
        .query("exams")
        .withIndex("by_slug", (q) => q.eq("slug", DEFAULT_EXAM_SLUG))
        .unique();
      versionId = exam?.defaultVersionId;
    }
    const version = versionId ? await ctx.db.get("examVersions", versionId) : null;
    if (!version || version.status !== "published") return null;
    const exam = await ctx.db.get("exams", version.examId);
    if (!exam) return null;
    const timeMultiplier = multiplierOf(cls);
    return {
      minutes: exam.timeLimitMin * timeMultiplier,
      timeMultiplier,
      retake: await hasFullRetakeSet(ctx, version._id),
    };
  },
});

/** More responses than a paper has questions; keeps the read bounded. */
const RESPONSE_LIMIT = 1000;

/**
 * The paper for an attempt (LLD §7.3, EX-6, EX-10, SE-1): the PBQ set for its
 * mode (pbqA, or pbqB for a retake), then the MCQs by number. Options, and the
 * options of PBQ MCQ parts, are in this attempt's seeded order with their
 * original ids. Built from `questions` only: `answerKeys` is never read.
 *
 * Errors: `BAD_TOKEN`, `NOT_FOUND` (missing attempt or another token's; same
 * error for both, SE-3).
 */
export const getPaper = query({
  args: { attemptId: v.id("attempts"), anonToken: v.string() },
  returns: paperValidator,
  handler: async (ctx, args) => {
    const attempt = await loadOwnAttempt(ctx, args.attemptId, args.anonToken);
    const questions = await loadPaperQuestions(ctx, attempt);
    return {
      attemptId: attempt._id,
      mode: attempt.mode,
      questions: questions.map((q) => toPaperQuestion(q, attempt.shuffleSeed)),
    };
  },
});

/**
 * Saved state for load and refresh (LLD §5.1, §14.2, EX-11): status, timing
 * and each saved response's value and flag. Marks (`earned`, `partResults`)
 * are never included; results come from `review.getResult` (T-208).
 *
 * `serverNow` is read in a query, so it is the time this result was computed:
 * a cached result can be older than the request. The runner treats it as a
 * clock estimate only (T-212); the deadline itself is enforced on the server.
 *
 * Errors: `BAD_TOKEN`, `NOT_FOUND` (as for `getPaper`).
 */
export const getState = query({
  args: { attemptId: v.id("attempts"), anonToken: v.string() },
  returns: v.object({
    status: v.union(v.literal("in_progress"), v.literal("submitted"), v.literal("expired")),
    startedAt: v.number(),
    deadline: v.number(),
    serverNow: v.number(),
    responses: v.array(
      v.object({
        questionId: v.id("questions"),
        value: v.optional(answerValueValidator),
        flagged: v.boolean(),
        updatedAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const attempt = await loadOwnAttempt(ctx, args.attemptId, args.anonToken);
    const rows = await ctx.db
      .query("responses")
      .withIndex("by_attempt_question", (q) => q.eq("attemptId", attempt._id))
      .take(RESPONSE_LIMIT);
    return {
      status: attempt.status,
      startedAt: attempt.startedAt,
      deadline: attempt.deadline,
      serverNow: Date.now(),
      responses: rows.map((r) => ({
        questionId: r.questionId,
        ...(r.value !== undefined && r.value !== null ? { value: r.value as AnswerValue } : {}),
        flagged: r.flagged,
        updatedAt: r.updatedAt,
      })),
    };
  },
});

/**
 * Save one question's answer and flag (LLD §7.2, EX-7, EX-11, SE-3, SE-4).
 * Upserts the single `responses` row for `(attemptId, questionId)` (D9).
 *
 * Every call carries the question's whole state: `value` (omitted, or blank,
 * clears the answer) and `flagged`. A flag toggle therefore resends the
 * current value, and a retry is safe to repeat.
 *
 * Ordering (LLD is silent, so last-write-wins by the client's change time):
 * `clientUpdatedAt` is when the student made the change, in server-clock
 * milliseconds (`Date.now() + clockOffset`, T-212). It is clamped to
 * `[startedAt, now]` and stored as `updatedAt`. A save whose time is older
 * than the stored row's is not applied (`applied: false`), so a queued retry
 * that arrives late can't overwrite a newer answer. Without it the server time
 * is used, i.e. arrival order. A cleared row is kept (not deleted) so this
 * check still holds after a clear; marking treats it as unanswered.
 *
 * Never reads `answerKeys` and never writes marks; marking is at submit.
 *
 * Errors: `BAD_TOKEN`; `NOT_FOUND` (attempt missing or another token's, or a
 * question not on this attempt's paper: another version, or the other PBQ
 * set); `ATTEMPT_CLOSED` (not `in_progress`, or past `deadline + 30 s`);
 * `VALIDATION_FAILED` (value doesn't fit the question, or a bad
 * `clientUpdatedAt`).
 */
export const saveResponse = mutation({
  args: {
    attemptId: v.id("attempts"),
    anonToken: v.string(),
    questionId: v.id("questions"),
    value: v.optional(answerValueValidator),
    flagged: v.boolean(),
    clientUpdatedAt: v.optional(v.number()),
  },
  returns: v.object({ ok: v.literal(true), savedAt: v.number(), applied: v.boolean() }),
  handler: async (ctx, args) => {
    const attempt = await loadOwnAttempt(ctx, args.attemptId, args.anonToken);
    const now = Date.now();
    if (attempt.status !== "in_progress" || now > attempt.deadline + SAVE_GRACE_MS) {
      fail("ATTEMPT_CLOSED");
    }

    const question = await ctx.db.get("questions", args.questionId);
    const sections: readonly Doc<"questions">["section"][] = sectionsFor(attempt.mode);
    if (
      !question ||
      question.versionId !== attempt.versionId ||
      !sections.includes(question.section)
    ) {
      fail("NOT_FOUND");
    }

    if (args.value !== undefined && !answerFitsQuestion(question, args.value)) {
      fail("VALIDATION_FAILED");
    }
    const value = args.value === undefined || isBlankAnswer(args.value) ? undefined : args.value;

    if (args.clientUpdatedAt !== undefined && !Number.isFinite(args.clientUpdatedAt)) {
      fail("VALIDATION_FAILED");
    }
    const updatedAt = Math.min(now, Math.max(attempt.startedAt, args.clientUpdatedAt ?? now));

    const existing = await ctx.db
      .query("responses")
      .withIndex("by_attempt_question", (q) =>
        q.eq("attemptId", attempt._id).eq("questionId", question._id),
      )
      .unique();

    if (existing) {
      if (updatedAt < existing.updatedAt)
        return { ok: true as const, savedAt: now, applied: false };
      await ctx.db.replace("responses", existing._id, {
        attemptId: attempt._id,
        questionId: question._id,
        ...(value !== undefined ? { value } : {}),
        flagged: args.flagged,
        updatedAt,
      });
    } else if (value !== undefined || args.flagged) {
      // D9: no row for a question that is neither answered nor flagged.
      await ctx.db.insert("responses", {
        attemptId: attempt._id,
        questionId: question._id,
        ...(value !== undefined ? { value } : {}),
        flagged: args.flagged,
        updatedAt,
      });
    }
    return { ok: true as const, savedAt: now, applied: true };
  },
});

export type AttemptResult = Infer<typeof attemptResultValidator>;

/** Who finalised an attempt (`attempts.submittedBy`). */
type SubmittedBy = NonNullable<Doc<"attempts">["submittedBy"]>;

/** More keys than a version has (95 in the seed: both PBQ sets and the MCQs). */
const KEY_LIMIT = 1000;

/** The cron finalises attempts left `in_progress` this long after their deadline (LLD §12.3). */
export const SWEEP_GRACE_MS = 60_000;

/**
 * Attempts finalised per sweep run. Each finalise reads about 280 documents
 * (90 questions, 95 keys, ≤ 90 responses, attempt, version, exam; the seed is
 * ~150 KB in all) and writes ≤ 91, so 10 stays far inside one transaction's
 * limits. A full batch schedules the next run straight away.
 */
export const SWEEP_BATCH = 10;

/**
 * Mark an attempt and close it (LLD §7.4, EX-13, EX-16, SE-1, SE-4).
 *
 * Idempotent: an attempt that is no longer `in_progress` is returned as is
 * (its stored `result`, or `null` if it never got one), so a student submit
 * racing the timer marks once and both see the same result. Convex runs each
 * mutation as a serialisable transaction, so two calls can't both pass the
 * status check.
 *
 * Reads `answerKeys` here only, on the server; the keys are never returned.
 * Questions are the attempt's paper (its PBQ set and the MCQs). A response row
 * with no `value` (a cleared answer) and a question with no row both score 0.
 * Each response row on the paper gets `earned` (capped at the question's
 * points) and, for PBQs, `partResults`. `submittedAt = min(now, deadline)`.
 * A student submit cancels the pending timer job.
 */
export async function finalise(
  ctx: MutationCtx,
  attempt: Doc<"attempts">,
  by: SubmittedBy,
): Promise<AttemptResult | null> {
  if (attempt.status !== "in_progress") return attempt.result ?? null;

  const version = await ctx.db.get("examVersions", attempt.versionId);
  const exam = version ? await ctx.db.get("exams", version.examId) : null;
  if (!exam) {
    // Versions are never deleted while attempts point at them; this is a data bug.
    throw new Error(`finalise: attempt ${attempt._id} has no exam (version ${attempt.versionId})`);
  }

  const questions = await loadPaperQuestions(ctx, attempt);
  const onPaper = new Set<Id<"questions">>(questions.map((q) => q._id));

  const keyRows = await ctx.db
    .query("answerKeys")
    .withIndex("by_version", (q) => q.eq("versionId", attempt.versionId))
    .take(KEY_LIMIT);
  const keys = new Map<Id<"questions">, MarkKey>();
  for (const k of keyRows) {
    if (onPaper.has(k.questionId)) keys.set(k.questionId, { correct: k.correct, parts: k.parts });
  }
  const missing = questions.filter((q) => !keys.has(q._id)).map((q) => q._id);
  if (missing.length > 0) {
    // Scores 0 rather than failing the submit; loud so a bad version is noticed.
    // Ids only: no answer or key data in logs.
    console.error(
      `finalise: no answer key for ${missing.length} question(s) of version ${attempt.versionId}, scored 0: ${missing.join(", ")}`,
    );
  }

  const responses = (
    await ctx.db
      .query("responses")
      .withIndex("by_attempt_question", (q) => q.eq("attemptId", attempt._id))
      .take(RESPONSE_LIMIT)
  ).filter((r) => onPaper.has(r.questionId));
  const values = new Map<Id<"questions">, AnswerValue | undefined>(
    responses.map((r) => [r.questionId, (r.value ?? undefined) as AnswerValue | undefined]),
  );

  const { perQuestion, summary } = scorePaper(questions, keys, values, exam);

  const pointsOf = new Map(questions.map((q) => [q._id, q.points]));
  const scoreOf = new Map(perQuestion.map((s) => [s.questionId, s]));
  for (const r of responses) {
    const s = scoreOf.get(r.questionId);
    if (!s) continue;
    const earned = Math.max(0, Math.min(s.earned, pointsOf.get(r.questionId) ?? 0));
    await ctx.db.patch("responses", r._id, {
      earned,
      ...(s.parts !== undefined ? { partResults: s.parts } : {}),
    });
  }

  const submittedAt = Math.min(Date.now(), attempt.deadline);
  const result: AttemptResult = {
    ...summary,
    flaggedCount: responses.filter((r) => r.flagged).length,
    timeUsedSec: Math.max(0, Math.round((submittedAt - attempt.startedAt) / 1000)),
  };
  await ctx.db.patch("attempts", attempt._id, {
    status: "submitted",
    submittedAt,
    submittedBy: by,
    result,
  });

  if (by === "student" && attempt.autoSubmitJobId) {
    const job = await ctx.db.system.get("_scheduled_functions", attempt.autoSubmitJobId);
    if (job?.state.kind === "pending") await ctx.scheduler.cancel(attempt.autoSubmitJobId);
  }
  return result;
}

/**
 * The student's submit (LLD §5.1, §7.4, EX-13, EX-16). Marks the attempt and
 * returns its result summary: totals, scaled score, pass flags, per-domain
 * points, flagged count and time used. No keys, explanations or per-question
 * marks (SE-1); the review comes from `review.getReview` (T-208).
 *
 * Idempotent: submitting an attempt that is already submitted (by the student
 * or the timer) returns the stored result instead of an error. Allowed after
 * the deadline too (saves stop at `deadline + 30 s`, so the answers are fixed);
 * `submittedAt` is still capped at the deadline.
 *
 * Errors: `BAD_TOKEN`; `NOT_FOUND` (missing or another token's attempt, SE-3);
 * `ATTEMPT_CLOSED` (closed without a result, i.e. `expired`).
 */
export const submit = mutation({
  args: { attemptId: v.id("attempts"), anonToken: v.string() },
  returns: attemptResultValidator,
  handler: async (ctx, args) => {
    const attempt = await loadOwnAttempt(ctx, args.attemptId, args.anonToken);
    const result = await finalise(ctx, attempt, "student");
    if (!result) fail("ATTEMPT_CLOSED");
    return result;
  },
});

/**
 * Timer submit, scheduled by `start` at `deadline + 30 s` (LLD §7.4, SE-4):
 * finalises whatever was saved, with `submittedBy = "timer"`. A no-op when the
 * attempt is gone or already finalised (the student submitted first, or the
 * sweep got there).
 */
export const autoSubmit = internalMutation({
  args: { attemptId: v.id("attempts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get("attempts", args.attemptId);
    if (attempt) await finalise(ctx, attempt, "timer");
    return null;
  },
});

/**
 * Safety net, every 10 minutes from `crons.ts` (LLD §12.3): finalise
 * `in_progress` attempts more than 60 s past their deadline, i.e. whose timer
 * job failed or was lost. Oldest deadline first, `SWEEP_BATCH` per run; a full
 * batch schedules another run at once until none are left. Returns the number
 * finalised in this run.
 */
export const sweepOpenAttempts = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - SWEEP_GRACE_MS;
    const stale = await ctx.db
      .query("attempts")
      .withIndex("by_status_deadline", (q) => q.eq("status", "in_progress").lt("deadline", cutoff))
      .take(SWEEP_BATCH);
    for (const attempt of stale) await finalise(ctx, attempt, "timer");
    if (stale.length === SWEEP_BATCH) {
      await ctx.scheduler.runAfter(0, internal.attempts.sweepOpenAttempts, {});
    }
    return stale.length;
  },
});
