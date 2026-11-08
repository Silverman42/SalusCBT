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
 * `getPaper` and `getState` are the student's reads (T-205). Both take the
 * anon token and give the same `NOT_FOUND` for a missing or foreign attempt.
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { env, internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import type { AnswerValue } from "../shared/content";
import { answerValueValidator } from "../shared/validate";
import { anonKeyOf, loadOwnAttempt } from "./lib/anon";
import { secretsMatch } from "./lib/clientIp";
import { normaliseClassCode, randomUint32 } from "./lib/codes";
import { fail } from "./lib/errors";
import { loadPaperQuestions, paperValidator, toPaperQuestion } from "./lib/paper";
import { enforceRateLimit } from "./lib/rateLimits";

/** The exam a start without a class code sits (its `defaultVersionId`). */
export const DEFAULT_EXAM_SLUG = "sy0-701";

/** SE-4: the timer job runs this long after the deadline (same grace as saves). */
export const AUTO_SUBMIT_GRACE_MS = 30_000;

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
 * characters), `NOT_FOUND` (no published version to sit).
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
 * Timer submit, scheduled by `start` at `deadline + 30 s` (LLD §7.4).
 * TODO(T-207): call `finalise(ctx, attempt, "timer")`. Until then this is a
 * no-op, so `start` has a real job id to store and cancel.
 */
export const autoSubmit = internalMutation({
  args: { attemptId: v.id("attempts") },
  returns: v.null(),
  handler: async () => null,
});
