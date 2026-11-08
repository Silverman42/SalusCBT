/**
 * Results and review for a submitted attempt (LLD §5.1, §8.3; PRD EX-14–EX-19,
 * PB-2, SE-1).
 *
 * The builders here are shared by `review.*` (owner token, T-208) and
 * `shareLinks.view` (T-504). Callers authorise first; these functions only
 * check that the attempt is submitted.
 *
 * `buildReview` is the one student-reachable path that reads `answerKeys`. It
 * refuses (`NOT_FOUND`) unless `attempt.status === "submitted"` with a stored
 * result, so keys and explanations never reach a student before submission.
 * `buildResult` and `attemptSummary` never read keys.
 */
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { AnswerValue, PbqKey } from "../../shared/content";
import { answerValueValidator } from "../../shared/validate";
import { scoreQuestion } from "../marking/score";
import { attemptResultValidator } from "../schema";
import { fail } from "./errors";
import { loadPaperQuestions, paperMcqValidator, paperPbqValidator, toPaperQuestion } from "./paper";

/** More keys / responses than a version / paper has; keeps the reads bounded. */
const KEY_LIMIT = 1000;
const RESPONSE_LIMIT = 1000;

const domainValidator = v.union(
  v.literal("1.0"),
  v.literal("2.0"),
  v.literal("3.0"),
  v.literal("4.0"),
  v.literal("5.0"),
);
const modeValidator = v.union(v.literal("standard"), v.literal("retake"));

type ReadCtx = Pick<QueryCtx, "db">;
type Submitted = Doc<"attempts"> & {
  status: "submitted";
  result: NonNullable<Doc<"attempts">["result"]>;
};

/** `NOT_FOUND` unless the attempt is submitted and marked (in-progress and expired look missing). */
export function requireSubmitted(attempt: Doc<"attempts">): Submitted {
  if (attempt.status !== "submitted" || !attempt.result) fail("NOT_FOUND");
  return attempt as Submitted;
}

async function examOf(ctx: ReadCtx, attempt: Doc<"attempts">): Promise<Doc<"exams">> {
  const version = await ctx.db.get("examVersions", attempt.versionId);
  const exam = version ? await ctx.db.get("exams", version.examId) : null;
  // Versions are never deleted while attempts point at them; this is a data bug.
  if (!exam) throw new Error(`review: attempt ${attempt._id} has no exam`);
  return exam;
}

// ---------------------------------------------------------------------------
// Result (EX-14–EX-16)
// ---------------------------------------------------------------------------

export const resultViewValidator = v.object({
  attemptId: v.id("attempts"),
  mode: modeValidator,
  examTitle: v.string(),
  startedAt: v.number(),
  submittedAt: v.number(),
  submittedBy: v.union(v.literal("student"), v.literal("timer")),
  /** Thresholds for the UI: pass line (750), comfortable margin (800), domain target (0.81). */
  passScaled: v.number(),
  comfortScaled: v.number(),
  domainTarget: v.number(),
  /** The stored summary written at submit (same shape `attempts.submit` returns). */
  result: attemptResultValidator,
});
export type ResultView = Infer<typeof resultViewValidator>;

/** The result summary of a submitted attempt. Never reads `answerKeys`. */
export async function buildResult(ctx: ReadCtx, attempt: Doc<"attempts">): Promise<ResultView> {
  const a = requireSubmitted(attempt);
  const exam = await examOf(ctx, a);
  return {
    attemptId: a._id,
    mode: a.mode,
    examTitle: exam.title,
    startedAt: a.startedAt,
    submittedAt: a.submittedAt ?? a.deadline,
    submittedBy: a.submittedBy ?? "timer",
    passScaled: exam.passScaled,
    comfortScaled: exam.comfortScaled,
    domainTarget: exam.domainTarget,
    result: a.result,
  };
}

// ---------------------------------------------------------------------------
// Review (EX-17, EX-18, PB-2)
// ---------------------------------------------------------------------------

/** Fields every review item adds to the paper question it was shown as. */
const reviewFields = {
  domain: domainValidator,
  flagged: v.boolean(),
  /** What the student saved; `null` when unanswered or cleared. */
  yourAnswer: v.union(answerValueValidator, v.null()),
  /** The key in answer shape (option ids, part answers or firewall rules); `null` if the key is missing. */
  correctAnswer: v.union(answerValueValidator, v.null()),
  earned: v.number(),
  max: v.number(),
  /** The "Why" text; empty when the key is missing. */
  explanation: v.string(),
};

export const reviewMcqValidator = paperMcqValidator.extend(reviewFields);
export const reviewPbqValidator = paperPbqValidator.extend({
  ...reviewFields,
  /** Per scored part (firewall: per rule) in payload order, as marked at submit. */
  partResults: v.array(v.boolean()),
  /** PB-2: model answers for practice parts (e.g. 1d), by part id. */
  practiceAnswer: v.optional(v.record(v.string(), v.string())),
});
export const reviewItemValidator = v.union(reviewMcqValidator, reviewPbqValidator);
export type ReviewItem = Infer<typeof reviewItemValidator>;

/** A key as an answer value, so the UI renders "yours" and "correct" with the same code. */
function keyAsAnswer(q: Doc<"questions">, key: Doc<"answerKeys">): AnswerValue | null {
  if (q.kind === "mcq") return key.correct ? { kind: "mcq", optionIds: [...key.correct] } : null;
  const parts: PbqKey | undefined = key.parts;
  if (!parts) return null;
  if ("rules" in parts) {
    return {
      kind: "firewall",
      rules: parts.rules.map((r) => ({ port: r.port, action: r.action })),
    };
  }
  return { kind: "pbq", parts: { ...parts.parts } };
}

/**
 * Every question of a submitted attempt in paper order (its PBQ set, set B for
 * a retake, then the MCQs), each as the student saw it (same seeded option
 * order, via `toPaperQuestion`) plus the student's answer, flag, marks, the
 * correct answer and the explanation. Marks are the ones stored at submit; a
 * question with no response row scored 0.
 */
export async function buildReview(ctx: ReadCtx, attempt: Doc<"attempts">): Promise<ReviewItem[]> {
  const a = requireSubmitted(attempt);
  const questions = await loadPaperQuestions(ctx, a);
  const onPaper = new Set<Id<"questions">>(questions.map((q) => q._id));

  const keys = new Map<Id<"questions">, Doc<"answerKeys">>();
  const keyRows = await ctx.db
    .query("answerKeys")
    .withIndex("by_version", (q) => q.eq("versionId", a.versionId))
    .take(KEY_LIMIT);
  for (const k of keyRows) if (onPaper.has(k.questionId)) keys.set(k.questionId, k);

  const responses = new Map<Id<"questions">, Doc<"responses">>();
  const rows = await ctx.db
    .query("responses")
    .withIndex("by_attempt_question", (q) => q.eq("attemptId", a._id))
    .take(RESPONSE_LIMIT);
  for (const r of rows) responses.set(r.questionId, r);

  return questions.map((q): ReviewItem => {
    const key = keys.get(q._id);
    const row = responses.get(q._id);
    const value = (row?.value ?? null) as AnswerValue | null;
    const common = {
      domain: q.domain,
      flagged: row?.flagged ?? false,
      yourAnswer: value,
      correctAnswer: key ? keyAsAnswer(q, key) : null,
      earned: row?.earned ?? 0,
      max: q.points,
      explanation: key?.explanation ?? "",
    };
    const shown = toPaperQuestion(q, a.shuffleSeed);
    if (shown.kind === "mcq") return { ...shown, ...common };
    // No row (never answered or flagged): every scored part is wrong. Score an
    // empty answer for the part count rather than trusting q.points.
    const partResults =
      row?.partResults ??
      scoreQuestion(q, key ? { correct: key.correct, parts: key.parts } : null, null).parts ??
      [];
    const practice = key?.parts && "practice" in key.parts ? key.parts.practice : undefined;
    return {
      ...shown,
      ...common,
      partResults,
      ...(practice ? { practiceAnswer: { ...practice } } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// History (EX-19)
// ---------------------------------------------------------------------------

export const attemptSummaryValidator = v.object({
  attemptId: v.id("attempts"),
  mode: modeValidator,
  status: v.union(v.literal("in_progress"), v.literal("submitted"), v.literal("expired")),
  startedAt: v.number(),
  deadline: v.number(),
  submittedAt: v.optional(v.number()),
  /** Present once submitted. Totals only. */
  scaled: v.optional(v.number()),
  passed: v.optional(v.boolean()),
  points: v.optional(v.number()),
  totalPoints: v.optional(v.number()),
});
export type AttemptSummary = Infer<typeof attemptSummaryValidator>;

/** One history row. Never reads `answerKeys`. */
export function attemptSummary(a: Doc<"attempts">): AttemptSummary {
  const r = a.status === "submitted" ? a.result : undefined;
  return {
    attemptId: a._id,
    mode: a.mode,
    status: a.status,
    startedAt: a.startedAt,
    deadline: a.deadline,
    ...(a.submittedAt !== undefined ? { submittedAt: a.submittedAt } : {}),
    ...(r
      ? { scaled: r.scaled, passed: r.passed, points: r.points, totalPoints: r.totalPoints }
      : {}),
  };
}
