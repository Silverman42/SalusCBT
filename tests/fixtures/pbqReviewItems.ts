/**
 * T-309: review items for the ten seed PBQs answered as in `pbqAnswers.ts`,
 * built the way `convex/lib/review.ts` builds them (the key as an answer
 * value, `partResults` from the server's own `scoreQuestion`). Test code
 * only: marking stays out of app/ (SE-1).
 */
import seed from "../../content/seed/sy0-701.json";
import { scoreQuestion, type MarkKey, type MarkQuestion } from "../../convex/marking/score";
import type { ReviewEntry } from "../../app/lib/resultView";
import type { AnswerValue, PbqKey, PbqPayload } from "../../shared/content";
import { PBQ_ANSWERS, type PbqAnswerCase } from "./pbqAnswers";

export type PbqReviewEntry = Extract<ReviewEntry, { kind: "pbq" }>;

type SeedPbq = {
  displayNumber: string;
  section: "pbqA" | "pbqB";
  domain: PbqReviewEntry["domain"];
  points: number;
  stem: string;
  payload: PbqPayload;
};
type SeedKey = { displayNumber: string; parts?: PbqKey; explanation: string };

const questions = (seed.questions as unknown as (SeedPbq & { kind: string })[]).filter(
  (q) => q.kind === "pbq",
);
const keys = seed.answerKeys as unknown as SeedKey[];

function keyAsAnswer(parts: PbqKey | undefined): AnswerValue | null {
  if (!parts) return null;
  if ("rules" in parts) return { kind: "firewall", rules: parts.rules.map((r) => ({ ...r })) };
  return { kind: "pbq", parts: { ...parts.parts } };
}

/** The review item for one seed PBQ and answer (`null` = unanswered). */
export function pbqReviewItem(displayNumber: string, answer: AnswerValue | null): PbqReviewEntry {
  const q = questions.find((x) => x.displayNumber === displayNumber);
  const key = keys.find((k) => k.displayNumber === displayNumber);
  if (!q || !key) throw new Error(`No seed PBQ ${displayNumber}`);
  const markQ: MarkQuestion = {
    kind: "pbq",
    domain: q.domain,
    points: q.points,
    template: q.payload.template,
    payload: q.payload,
  };
  const markKey: MarkKey = { parts: key.parts };
  const score = scoreQuestion(markQ, markKey, answer);
  const practice = key.parts && "practice" in key.parts ? key.parts.practice : undefined;
  return {
    questionId: `seed-${displayNumber}` as PbqReviewEntry["questionId"],
    kind: "pbq",
    section: q.section,
    displayNumber,
    points: q.points,
    stem: q.stem,
    payload: q.payload,
    domain: q.domain,
    flagged: displayNumber === "3",
    yourAnswer: answer,
    correctAnswer: keyAsAnswer(key.parts),
    earned: score.earned,
    max: q.points,
    explanation: key.explanation,
    partResults: score.parts ?? [],
    ...(practice ? { practiceAnswer: { ...practice } } : {}),
  };
}

/** All ten cases as review items, in paper order (set A, then set B). */
export const PBQ_REVIEW_CASES: { case: PbqAnswerCase; item: PbqReviewEntry }[] = PBQ_ANSWERS.map(
  (c) => ({ case: c, item: pbqReviewItem(c.displayNumber, c.answer) }),
);
