/**
 * Class dashboard rows and statistics (LLD §5.2 `classes.attempts`,
 * `classes.stats`; PRD CL-5, CL-6).
 *
 * Pure functions over attempt documents, so the maths is testable without a
 * database. `classes.ts` loads the rows (bounded, by the `by_class` index) and
 * authorises the caller first.
 *
 * Privacy: rows carry the display name and result totals only. `anonKey`,
 * `ipHash`, `shuffleSeed` and the scheduled job id never leave the server.
 */
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { DOMAINS, isBelowTarget, type Domain } from "../marking/score";

const domainValidator = v.union(
  v.literal("1.0"),
  v.literal("2.0"),
  v.literal("3.0"),
  v.literal("4.0"),
  v.literal("5.0"),
);
const statusValidator = v.union(
  v.literal("in_progress"),
  v.literal("submitted"),
  v.literal("expired"),
);

// ---------------------------------------------------------------------------
// Attempt rows (CL-5)
// ---------------------------------------------------------------------------

/** `classes.attempts` filter. Omitted or `"all"` returns every row. */
export const attemptFilterValidator = v.union(
  v.literal("all"),
  v.literal("in_progress"),
  v.literal("submitted"),
  v.literal("expired"),
  v.literal("passed"),
  v.literal("failed"),
);
export type AttemptFilter = Infer<typeof attemptFilterValidator>;

export const attemptRowValidator = v.object({
  attemptId: v.id("attempts"),
  /** CL-4: every class attempt has one; `""` only for data written before that rule. */
  displayName: v.string(),
  mode: v.union(v.literal("standard"), v.literal("retake")),
  status: statusValidator,
  startedAt: v.number(),
  deadline: v.number(),
  submittedAt: v.optional(v.number()),
  submittedBy: v.optional(v.union(v.literal("student"), v.literal("timer"))),
  /** Present once submitted with a result. */
  scaled: v.optional(v.number()),
  passed: v.optional(v.boolean()),
  points: v.optional(v.number()),
  totalPoints: v.optional(v.number()),
  timeUsedSec: v.optional(v.number()),
  flaggedCount: v.optional(v.number()),
});
export type AttemptRow = Infer<typeof attemptRowValidator>;

type Marked = Doc<"attempts"> & { result: NonNullable<Doc<"attempts">["result"]> };

/** Submitted with a stored result: the attempts that count towards scores. */
export function isMarked(a: Doc<"attempts">): a is Marked {
  return a.status === "submitted" && a.result !== undefined;
}

/** One dashboard row. Picks fields explicitly so no private field can slip through. */
export function attemptRow(a: Doc<"attempts">): AttemptRow {
  const r = isMarked(a) ? a.result : undefined;
  return {
    attemptId: a._id,
    displayName: a.displayName ?? "",
    mode: a.mode,
    status: a.status,
    startedAt: a.startedAt,
    deadline: a.deadline,
    ...(a.submittedAt !== undefined ? { submittedAt: a.submittedAt } : {}),
    ...(a.submittedBy !== undefined ? { submittedBy: a.submittedBy } : {}),
    ...(r
      ? {
          scaled: r.scaled,
          passed: r.passed,
          points: r.points,
          totalPoints: r.totalPoints,
          timeUsedSec: r.timeUsedSec,
          flaggedCount: r.flaggedCount,
        }
      : {}),
  };
}

export function matchesFilter(a: Doc<"attempts">, filter: AttemptFilter | undefined): boolean {
  switch (filter ?? "all") {
    case "all":
      return true;
    case "in_progress":
    case "submitted":
    case "expired":
      return a.status === filter;
    case "passed":
      return isMarked(a) && a.result.passed;
    case "failed":
      return isMarked(a) && !a.result.passed;
  }
}

// ---------------------------------------------------------------------------
// Score statistics (CL-6)
// ---------------------------------------------------------------------------

export const classDomainValidator = v.object({
  domain: domainValidator,
  /** Summed over every marked attempt in the class. */
  points: v.number(),
  max: v.number(),
  /** `points / max`, or `null` when no marked attempt had questions in the domain. */
  share: v.union(v.number(), v.null()),
  /** Below the exam's `domainTarget` (0.81); never for an empty domain. */
  belowTarget: v.boolean(),
});
export type ClassDomain = Infer<typeof classDomainValidator>;

export type ScoreStats = {
  /** Marked (submitted with a result) attempts the numbers below cover. */
  submittedCount: number;
  passedCount: number;
  /** `passedCount / submittedCount`, 0–1; `null` with no marked attempts. */
  passRate: number | null;
  /** Mean scaled score rounded to 1 dp; `null` with no marked attempts. */
  avgScaled: number | null;
  medianScaled: number | null;
  domains: ClassDomain[];
};

const round1 = (x: number) => Math.round(x * 10) / 10;

function median(sorted: readonly number[]): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid]! : round1((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** Pass rate, mean/median scaled and the class domain breakdown over marked attempts. */
export function scoreStats(attempts: readonly Doc<"attempts">[], domainTarget: number): ScoreStats {
  const marked = attempts.filter(isMarked);
  const scaled = marked.map((a) => a.result.scaled).sort((x, y) => x - y);
  const passedCount = marked.filter((a) => a.result.passed).length;
  const totals = new Map<Domain, { points: number; max: number }>(
    DOMAINS.map((d) => [d, { points: 0, max: 0 }]),
  );
  for (const a of marked) {
    for (const d of a.result.domains) {
      const row = totals.get(d.domain);
      if (!row) continue;
      row.points += d.points;
      row.max += d.max;
    }
  }
  const n = marked.length;
  return {
    submittedCount: n,
    passedCount,
    passRate: n === 0 ? null : passedCount / n,
    avgScaled: n === 0 ? null : round1(scaled.reduce((s, x) => s + x, 0) / n),
    medianScaled: median(scaled),
    domains: DOMAINS.map((domain) => {
      const { points, max } = totals.get(domain)!;
      return {
        domain,
        points,
        max,
        share: max > 0 ? points / max : null,
        belowTarget: isBelowTarget({ domain, points, max }, domainTarget),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Most-missed questions (CL-6)
// ---------------------------------------------------------------------------

export const missedQuestionValidator = v.object({
  questionId: v.id("questions"),
  displayNumber: v.string(),
  section: v.union(v.literal("pbqA"), v.literal("pbqB"), v.literal("mcq")),
  kind: v.union(v.literal("mcq"), v.literal("pbq")),
  domain: domainValidator,
  stem: v.string(),
  /** Sampled marked attempts whose paper had this question. */
  sat: v.number(),
  /** Of those, how many did not earn full marks (unanswered counts as missed). */
  missed: v.number(),
  /** `missed / sat`. */
  missRate: v.number(),
});
export type MissedQuestion = Infer<typeof missedQuestionValidator>;

export const MOST_MISSED_COUNT = 10;

/** Per-question tally while scanning attempts. */
export type MissTally = Map<
  Id<"questions">,
  { question: Doc<"questions">; sat: number; missed: number }
>;

/**
 * Adds one marked attempt to the tally: every question on its paper was sat;
 * it was missed unless its response row earned full marks (no row scores 0).
 */
export function tallyAttempt(
  tally: MissTally,
  paper: readonly Doc<"questions">[],
  earnedByQuestion: ReadonlyMap<Id<"questions">, number>,
): void {
  for (const q of paper) {
    const row = tally.get(q._id) ?? { question: q, sat: 0, missed: 0 };
    row.sat += 1;
    if ((earnedByQuestion.get(q._id) ?? 0) < q.points) row.missed += 1;
    tally.set(q._id, row);
  }
}

const SECTION_RANK = { pbqA: 0, pbqB: 1, mcq: 2 } as const;

/**
 * The `MOST_MISSED_COUNT` questions with the highest miss rate (ties: more
 * misses, then paper order). Questions nobody missed are left out.
 */
export function mostMissed(tally: MissTally): MissedQuestion[] {
  return [...tally.values()]
    .filter((r) => r.missed > 0)
    .sort(
      (a, b) =>
        b.missed / b.sat - a.missed / a.sat ||
        b.missed - a.missed ||
        SECTION_RANK[a.question.section] - SECTION_RANK[b.question.section] ||
        a.question.order - b.question.order,
    )
    .slice(0, MOST_MISSED_COUNT)
    .map(({ question: q, sat, missed }) => ({
      questionId: q._id,
      displayNumber: q.displayNumber,
      section: q.section,
      kind: q.kind,
      domain: q.domain,
      stem: q.stem,
      sat,
      missed,
      missRate: missed / sat,
    }));
}
