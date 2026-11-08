/**
 * Classes (LLD §5.1 `lookupCode`, §5.2; PRD CL-1 to CL-7, EX-21).
 *
 * - `create` / `update` / `mine` are tutor functions (admin passes every
 *   tutor check). A class owned by someone else is `NOT_FOUND`.
 * - `attempts` / `stats` / `attemptResult` / `attemptReview` feed the tutor
 *   dashboard (T-502). They are ordinary reactive queries, so an open
 *   dashboard updates as soon as a student's submit commits (CL-5). They
 *   never return `anonKey`, `ipHash` or anything else that identifies the
 *   student's browser.
 * - `lookupCode` is public, for the start screen. It reveals only the class
 *   name and whether it accepts new attempts.
 *
 * Closing a class only stops new attempts (`attempts.start` refuses
 * `CLASS_CLOSED`); existing attempts and results are untouched (CL-2).
 * Changing a class's version likewise affects only new attempts, because
 * each attempt stores its own `versionId`.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { allocateClassCode } from "./lib/classCodes";
import {
  attemptFilterValidator,
  attemptRow,
  attemptRowValidator,
  classDomainValidator,
  isMarked,
  matchesFilter,
  missedQuestionValidator,
  mostMissed,
  scoreStats,
  tallyAttempt,
  type MissTally,
} from "./lib/classStats";
import { normaliseClassCode } from "./lib/codes";
import { fail } from "./lib/errors";
import { requireClassOwner, requireProfile } from "./lib/guards";
import { loadPaperQuestions } from "./lib/paper";
import { buildResult, buildReview, resultViewValidator, reviewItemValidator } from "./lib/review";

/** EX-21: standard time or one of the extra-time accommodations. */
export const TIME_MULTIPLIERS = [1, 1.25, 1.5, 2] as const;

export const CLASS_NAME_MAX = 80;

/** Longer than any real code (`SEC-XXXX`); matches `attempts.start`. */
const CODE_INPUT_MAX = 32;

/** Upper bound on `mine` (admin sees every class). */
const MINE_LIMIT = 500;

/**
 * Most attempts a dashboard query reads for one class. Far above a real class;
 * `stats.truncated` says when it was hit (the newest attempts are kept).
 */
export const CLASS_ATTEMPTS_LIMIT = 1000;

/**
 * Most marked attempts `stats` reads responses for (most-missed questions).
 * Each costs up to ~90 response reads, so this keeps the query well inside
 * Convex's per-query read limits. The newest are used.
 */
export const MOST_MISSED_SAMPLE = 150;

/** More responses than any paper has. */
const RESPONSE_LIMIT = 1000;

const classStatus = v.union(v.literal("open"), v.literal("closed"));

const classSummary = v.object({
  classId: v.id("classes"),
  name: v.string(),
  code: v.string(),
  status: classStatus,
  versionId: v.id("examVersions"),
  versionLabel: v.string(),
  timeMultiplier: v.number(),
  tutorId: v.id("profiles"),
  createdAt: v.number(),
});

function cleanName(input: string): string {
  const name = input.trim();
  if (name.length === 0 || name.length > CLASS_NAME_MAX) fail("VALIDATION_FAILED");
  return name;
}

function checkMultiplier(m: number): number {
  if (!(TIME_MULTIPLIERS as readonly number[]).includes(m)) fail("VALIDATION_FAILED");
  return m;
}

/**
 * A version the caller may give a class (CL-3): published, and either one of
 * the caller's own versions or a default (admin-managed, no owner) version.
 * The admin may use any published version. Otherwise `NOT_FOUND`.
 */
async function usableVersion(
  ctx: Pick<QueryCtx, "db">,
  profile: Doc<"profiles">,
  versionId: Id<"examVersions">,
): Promise<Doc<"examVersions">> {
  const version = await ctx.db.get("examVersions", versionId);
  if (!version || version.status !== "published") fail("NOT_FOUND");
  const allowed =
    profile.role === "admin" || version.ownerId === undefined || version.ownerId === profile._id;
  if (!allowed) fail("NOT_FOUND");
  return version;
}

export const create = mutation({
  args: {
    name: v.string(),
    versionId: v.id("examVersions"),
    timeMultiplier: v.optional(v.number()),
  },
  returns: v.object({ classId: v.id("classes"), code: v.string() }),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, ["tutor"]);
    const name = cleanName(args.name);
    const timeMultiplier = checkMultiplier(args.timeMultiplier ?? 1);
    await usableVersion(ctx, profile, args.versionId);
    const code = await allocateClassCode(ctx);
    const classId = await ctx.db.insert("classes", {
      tutorId: profile._id,
      name,
      code,
      versionId: args.versionId,
      timeMultiplier,
      status: "open",
      createdAt: Date.now(),
    });
    await writeAudit(ctx, {
      actorId: profile._id,
      action: "class.created",
      target: classId,
      meta: { code, versionId: args.versionId, timeMultiplier },
    });
    return { classId, code };
  },
});

export const update = mutation({
  args: {
    classId: v.id("classes"),
    name: v.optional(v.string()),
    versionId: v.optional(v.id("examVersions")),
    status: v.optional(classStatus),
    timeMultiplier: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, ["tutor"]);
    const cls = await requireClassOwner(ctx, profile, args.classId);
    const patch: Partial<Pick<Doc<"classes">, "name" | "versionId" | "status" | "timeMultiplier">> =
      {};
    if (args.name !== undefined) patch.name = cleanName(args.name);
    if (args.timeMultiplier !== undefined) {
      patch.timeMultiplier = checkMultiplier(args.timeMultiplier);
    }
    if (args.versionId !== undefined && args.versionId !== cls.versionId) {
      await usableVersion(ctx, profile, args.versionId);
      patch.versionId = args.versionId;
    }
    if (args.status !== undefined) patch.status = args.status;
    if (Object.keys(patch).length > 0) await ctx.db.patch("classes", cls._id, patch);
    if (cls.status === "open" && args.status === "closed") {
      await writeAudit(ctx, { actorId: profile._id, action: "class.closed", target: cls._id });
    }
    return null;
  },
});

/** The caller's classes, newest first. The admin sees every class. */
export const mine = query({
  args: {},
  returns: v.array(classSummary),
  handler: async (ctx) => {
    const profile = await requireProfile(ctx, ["tutor"]);
    const classes =
      profile.role === "admin"
        ? await ctx.db.query("classes").order("desc").take(MINE_LIMIT)
        : await ctx.db
            .query("classes")
            .withIndex("by_tutor", (q) => q.eq("tutorId", profile._id))
            .order("desc")
            .take(MINE_LIMIT);
    const labels = new Map<Id<"examVersions">, string>();
    for (const c of classes) {
      if (!labels.has(c.versionId)) {
        labels.set(c.versionId, (await ctx.db.get("examVersions", c.versionId))?.label ?? "");
      }
    }
    return classes.map((c) => ({
      classId: c._id,
      name: c.name,
      code: c.code,
      status: c.status,
      versionId: c.versionId,
      versionLabel: labels.get(c.versionId) ?? "",
      timeMultiplier: c.timeMultiplier,
      tutorId: c.tutorId,
      createdAt: c.createdAt,
    }));
  },
});

/**
 * Public start-screen lookup: `{ name, open }` or `null` for an unknown code.
 * Same normalisation as `attempts.start`. `open` is false when the class is
 * closed or its version is no longer published, i.e. exactly when a start
 * would be refused for the class itself. Every class needs a display name
 * (CL-4), so the screen needs no extra flag for it.
 */
export const lookupCode = query({
  args: { code: v.string() },
  returns: v.union(v.null(), v.object({ name: v.string(), open: v.boolean() })),
  handler: async (ctx, args) => {
    if (args.code.length > CODE_INPUT_MAX) return null;
    const code = normaliseClassCode(args.code);
    if (code.length === 0) return null;
    const cls = await ctx.db
      .query("classes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (!cls) return null;
    const version = await ctx.db.get("examVersions", cls.versionId);
    return { name: cls.name, open: cls.status === "open" && version?.status === "published" };
  },
});

// ---------------------------------------------------------------------------
// Dashboard (T-502; LLD §5.2; CL-5, CL-6, CL-7)
// ---------------------------------------------------------------------------

/** The class's attempts, newest first (by start time), at most `CLASS_ATTEMPTS_LIMIT`. */
async function classAttempts(ctx: Pick<QueryCtx, "db">, classId: Id<"classes">) {
  return await ctx.db
    .query("attempts")
    .withIndex("by_class", (q) => q.eq("classId", classId))
    .order("desc")
    .take(CLASS_ATTEMPTS_LIMIT);
}

/**
 * Live attempt table (CL-5): every attempt in the class, newest first, with
 * name, status, dates, score, pass/fail and time used. In-progress and
 * expired attempts are listed without scores. Sorting is client-side.
 *
 * Errors: `UNAUTHENTICATED` / `FORBIDDEN`; `NOT_FOUND` (missing class or
 * another tutor's).
 */
export const attempts = query({
  args: { classId: v.id("classes"), filter: v.optional(attemptFilterValidator) },
  returns: v.array(attemptRowValidator),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, ["tutor"]);
    const cls = await requireClassOwner(ctx, profile, args.classId);
    const rows = await classAttempts(ctx, cls._id);
    return rows.filter((a) => matchesFilter(a, args.filter)).map(attemptRow);
  },
});

/**
 * Class view (CL-6) over marked (submitted) attempts: count, pass rate,
 * mean and median scaled score, the domain breakdown summed across the
 * class with below-target flags, and the 10 most-missed questions.
 *
 * Preview attempts (`editor.previewAttempt`) have no class, so they never
 * appear here. Most-missed covers the newest `MOST_MISSED_SAMPLE` marked
 * attempts (`mostMissedSample` says how many were used).
 *
 * Errors: `UNAUTHENTICATED` / `FORBIDDEN`; `NOT_FOUND`.
 */
export const stats = query({
  args: { classId: v.id("classes") },
  returns: v.object({
    attemptCount: v.number(),
    inProgressCount: v.number(),
    submittedCount: v.number(),
    passedCount: v.number(),
    passRate: v.union(v.number(), v.null()),
    avgScaled: v.union(v.number(), v.null()),
    medianScaled: v.union(v.number(), v.null()),
    passScaled: v.number(),
    domainTarget: v.number(),
    domains: v.array(classDomainValidator),
    mostMissed: v.array(missedQuestionValidator),
    mostMissedSample: v.number(),
    /** `CLASS_ATTEMPTS_LIMIT` was hit; the figures cover the newest attempts only. */
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, ["tutor"]);
    const cls = await requireClassOwner(ctx, profile, args.classId);
    const version = await ctx.db.get("examVersions", cls.versionId);
    const exam = version ? await ctx.db.get("exams", version.examId) : null;
    if (!exam) throw new Error(`classes.stats: class ${cls._id} has no exam`);

    const rows = await classAttempts(ctx, cls._id);
    const scores = scoreStats(rows, exam.domainTarget);

    const tally: MissTally = new Map();
    const papers = new Map<string, Doc<"questions">[]>();
    const sample = rows.filter(isMarked).slice(0, MOST_MISSED_SAMPLE);
    for (const a of sample) {
      const paperKey = `${a.versionId}:${a.mode}`;
      let paper = papers.get(paperKey);
      if (!paper) {
        paper = await loadPaperQuestions(ctx, a);
        papers.set(paperKey, paper);
      }
      const responses = await ctx.db
        .query("responses")
        .withIndex("by_attempt_question", (q) => q.eq("attemptId", a._id))
        .take(RESPONSE_LIMIT);
      const earned = new Map(responses.map((r) => [r.questionId, r.earned ?? 0]));
      tallyAttempt(tally, paper, earned);
    }

    return {
      attemptCount: rows.length,
      inProgressCount: rows.filter((a) => a.status === "in_progress").length,
      ...scores,
      passScaled: exam.passScaled,
      domainTarget: exam.domainTarget,
      mostMissed: mostMissed(tally),
      mostMissedSample: sample.length,
      truncated: rows.length === CLASS_ATTEMPTS_LIMIT,
    };
  },
});

/** A class attempt the caller may see: its class must be theirs (admin: any class). */
async function ownedClassAttempt(
  ctx: Pick<QueryCtx, "db">,
  profile: Doc<"profiles">,
  attemptId: Id<"attempts">,
): Promise<{ attempt: Doc<"attempts">; cls: Doc<"classes"> }> {
  const attempt = await ctx.db.get("attempts", attemptId);
  // Attempts outside a class (self-study, previews) belong to their token only.
  if (!attempt?.classId) fail("NOT_FOUND");
  const cls = await requireClassOwner(ctx, profile, attempt.classId);
  return { attempt, cls };
}

/**
 * The result summary of one submitted attempt in the caller's class, as the
 * student sees it (`review.getResult`), plus the student's display name and
 * class for the page header.
 *
 * Errors: `UNAUTHENTICATED` / `FORBIDDEN`; `NOT_FOUND` (missing, not in a
 * class of the caller's, or not submitted).
 */
export const attemptResult = query({
  args: { attemptId: v.id("attempts") },
  returns: resultViewValidator.extend({
    displayName: v.string(),
    classId: v.id("classes"),
    className: v.string(),
  }),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, ["tutor"]);
    const { attempt, cls } = await ownedClassAttempt(ctx, profile, args.attemptId);
    return {
      ...(await buildResult(ctx, attempt)),
      displayName: attempt.displayName ?? "",
      classId: cls._id,
      className: cls.name,
    };
  },
});

/**
 * CL-7: the same `ReviewItem[]` the student gets from `review.getReview`
 * (every MCQ and PBQ answer, marks, keys and explanations), for a submitted
 * attempt in the caller's class.
 *
 * Errors: `UNAUTHENTICATED` / `FORBIDDEN`; `NOT_FOUND` (missing, not in a
 * class of the caller's, or not submitted).
 */
export const attemptReview = query({
  args: { attemptId: v.id("attempts") },
  returns: v.array(reviewItemValidator),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, ["tutor"]);
    const { attempt } = await ownedClassAttempt(ctx, profile, args.attemptId);
    return await buildReview(ctx, attempt);
  },
});
