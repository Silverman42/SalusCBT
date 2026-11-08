// Scoring, scaled score and domain breakdown (LLD §8.2; EX-9, EX-13–EX-15,
// PB-2, PB-3, ED-10).
//
// Pure functions used by submit, review, preview and tutor stats. They take
// plain question / key / answer shapes (structurally compatible with the
// `questions`, `answerKeys` and `responses` documents) and never touch a
// Convex ctx. Marking is server-side only: never import this module from app/
// (SE-1).

import type { AnswerValue, PbqKey, PbqPayload, PbqPart, PbqTemplate } from "../../shared/content";
import { norm } from "./normalise";

export type Domain = "1.0" | "2.0" | "3.0" | "4.0" | "5.0";
export const DOMAINS: readonly Domain[] = ["1.0", "2.0", "3.0", "4.0", "5.0"];

/** The fields of a `questions` document that marking needs. */
export type MarkQuestion = {
  kind: "mcq" | "pbq";
  domain: Domain;
  /** mcq = 1; pbq = number of scored parts (ED-10). */
  points: number;
  template?: PbqTemplate;
  payload?: PbqPayload;
};

/** The fields of an `answerKeys` document that marking needs. */
export type MarkKey = {
  /** MCQ option ids, e.g. `["A", "B"]` for a Choose TWO. */
  correct?: string[];
  /** PBQ key. */
  parts?: PbqKey;
};

export type QuestionScore = {
  /** Points earned, 0 ≤ earned ≤ max. */
  earned: number;
  /** Points available: 1 for an MCQ, the number of scored parts / rules for a PBQ. */
  max: number;
  /** Per scored part (or firewall rule) result, in payload order; PBQs only. */
  parts?: boolean[];
};

/** Exam thresholds (the `exams` document). */
export type ExamThresholds = { passScaled: number; comfortScaled: number };

export type DomainResult = { domain: Domain; points: number; max: number };

export type ScoreSummary = {
  points: number;
  totalPoints: number;
  scaled: number;
  passed: boolean;
  comfortable: boolean;
  domains: DomainResult[];
};

const count = (results: boolean[]) => results.filter(Boolean).length;

/** Practice parts (`scored: false`, e.g. 1d) never score (PB-2). Port, pick and mcq parts are always scored. */
const isScored = (part: PbqPart) => !("scored" in part) || part.scored !== false;

/**
 * Score one question. A missing / blank / wrong-shaped answer scores 0, as
 * does a question with no usable key.
 */
export function scoreQuestion(
  q: MarkQuestion,
  key: MarkKey | null | undefined,
  value: AnswerValue | null | undefined,
): QuestionScore {
  if (q.kind === "mcq") {
    // EX-9: Choose TWO is both-or-nothing; the chosen set must equal the key exactly.
    const want = new Set(key?.correct ?? []);
    const got = new Set(value?.kind === "mcq" ? value.optionIds : []);
    const ok = want.size > 0 && got.size === want.size && [...want].every((id) => got.has(id));
    return { earned: ok ? 1 : 0, max: 1 };
  }

  const pbqKey = key?.parts;

  if (q.template === "firewall" || q.payload?.template === "firewall") {
    // PB-3: each rule scores when both its port and its action match.
    const rules = pbqKey && "rules" in pbqKey ? pbqKey.rules : [];
    const answers = value?.kind === "firewall" ? value.rules : [];
    const parts = rules.map((k, i) => {
      const a = answers[i];
      // norm.equal, not norm.port(a) === norm.port(b): two nulls must not match.
      return !!a && norm.equal("port", a.port, k.port) && a.action === k.action;
    });
    return { earned: count(parts), max: parts.length, parts };
  }

  const payloadParts: PbqPart[] =
    q.payload && "parts" in q.payload ? (q.payload.parts as PbqPart[]) : [];
  const keyParts = pbqKey && "parts" in pbqKey ? pbqKey.parts : {};
  const answers = value?.kind === "pbq" ? value.parts : {};
  const parts = payloadParts
    .filter(isScored)
    .map(
      (p) =>
        Object.hasOwn(keyParts, p.id) &&
        Object.hasOwn(answers, p.id) &&
        norm.equal(p.kind, answers[p.id], keyParts[p.id]),
    );
  return { earned: count(parts), max: parts.length, parts };
}

/** Earned points for a question, clamped to `[0, q.points]` so a bad key can never push the total past 100%. */
const credited = (q: MarkQuestion, r: QuestionScore | undefined) =>
  Math.max(0, Math.min(r?.earned ?? 0, q.points));

function assertAligned(questions: readonly MarkQuestion[], perQuestion: readonly QuestionScore[]) {
  if (questions.length !== perQuestion.length) {
    throw new Error(
      `perQuestion has ${perQuestion.length} entries for ${questions.length} questions`,
    );
  }
}

/** EX-14: `round(100 + 800 × points / total)`; 100 when the paper is worth nothing. */
export function scaledScore(points: number, totalPoints: number): number {
  if (totalPoints <= 0) return 100;
  return Math.round(100 + (800 * points) / totalPoints);
}

/**
 * EX-15: points earned and available per domain, always all five domains in
 * order 1.0–5.0 (a domain with no questions has `max: 0`).
 * `perQuestion[i]` is the score for `questions[i]`.
 */
export function byDomain(
  questions: readonly MarkQuestion[],
  perQuestion: readonly QuestionScore[],
): DomainResult[] {
  assertAligned(questions, perQuestion);
  const totals = new Map(DOMAINS.map((d) => [d, { domain: d, points: 0, max: 0 }]));
  questions.forEach((q, i) => {
    const row = totals.get(q.domain);
    if (!row) throw new Error(`Unknown domain ${String(q.domain)}`);
    row.points += credited(q, perQuestion[i]);
    row.max += q.points;
  });
  return [...totals.values()];
}

/** UI hint: is this domain below the exam's target share (`exam.domainTarget`, 0.81)? Empty domains never are. */
export function isBelowTarget(d: DomainResult, domainTarget: number): boolean {
  return d.max > 0 && d.points / d.max < domainTarget;
}

/**
 * Attempt summary. The total comes from the questions' points (ED-10), so it
 * follows questions being added or removed. `perQuestion[i]` is the score for
 * `questions[i]`; unanswered questions should be scored (they earn 0).
 */
export function summarise(
  questions: readonly MarkQuestion[],
  perQuestion: readonly QuestionScore[],
  exam: ExamThresholds,
): ScoreSummary {
  assertAligned(questions, perQuestion);
  const totalPoints = questions.reduce((s, q) => s + q.points, 0);
  const points = questions.reduce((s, q, i) => s + credited(q, perQuestion[i]), 0);
  const scaled = scaledScore(points, totalPoints);
  return {
    points,
    totalPoints,
    scaled,
    passed: scaled >= exam.passScaled, // 750
    comfortable: scaled >= exam.comfortScaled, // 800
    domains: byDomain(questions, perQuestion),
  };
}

/**
 * Score a whole paper (LLD §7.4 `score`): looks up each question's key and
 * answer by id; a missing response is unanswered and scores 0.
 */
export function scorePaper<Id extends string>(
  questions: readonly (MarkQuestion & { _id: Id })[],
  keys: ReadonlyMap<Id, MarkKey>,
  values: ReadonlyMap<Id, AnswerValue | null | undefined>,
  exam: ExamThresholds,
): { perQuestion: (QuestionScore & { questionId: Id })[]; summary: ScoreSummary } {
  const perQuestion = questions.map((q) => ({
    questionId: q._id,
    ...scoreQuestion(q, keys.get(q._id), values.get(q._id)),
  }));
  return { perQuestion, summary: summarise(questions, perQuestion, exam) };
}
