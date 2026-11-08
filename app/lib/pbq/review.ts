/**
 * PBQ answer review (T-309, PRD EX-17, PB-2, PB-3): the mark, "your answer"
 * and the correct (or, for a practice part, model) answer for each PBQ part or
 * firewall rule, as text. Pure: no Vue. Used by the review components
 * (`ResultPbqReview`, the stacked-card fallback in `ResultReviewItem`) on the
 * student review, share and tutor pages.
 *
 * `partResults` (from `review.getReview` and friends) holds one boolean per
 * scored part in payload order (firewall: per rule); practice parts
 * (`scored: false`, e.g. 1d) have no entry and no mark.
 */
import type { AnswerValue, PayloadOf, PbqPart, PbqPayload } from "../../../shared/content";
import { optionLetter } from "../examRunner";
import { actionLabel } from "./firewall";

/** Shown for a blank answer or key. */
export const BLANK = "—";

/** The review fields a PBQ review item carries (see `convex/lib/review.ts`). */
export type PbqReviewInput = {
  payload: PbqPayload;
  yourAnswer: AnswerValue | null;
  correctAnswer: AnswerValue | null;
  partResults: readonly boolean[];
  practiceAnswer?: Record<string, string>;
};

export type PartMark = {
  /** `true` / `false` for a scored part; `null` for a practice part (not scored). */
  ok: boolean | null;
  /** The student's answer as text (`BLANK` when not answered). */
  yours: string;
  /** The key, or for a practice part the model answer, as text. */
  correct: string;
  /** Nothing was entered for this part. */
  blank: boolean;
};

/** Practice parts (`scored: false`, e.g. 1d) carry no mark (PB-2). */
export const isScoredPart = (part: PbqPart) => !("scored" in part) || part.scored !== false;

const clean = (v: string | null | undefined) => (v ?? "").trim();

/**
 * One part's value from an answer (the student's or the key) as text:
 * a port pair as "Cleartext 110 · Secure 995", an MCQ part as its letter in
 * paper order and its text ("B · Integrity"), anything else as entered.
 */
export function formatPartAnswer(part: PbqPart, answer: AnswerValue | null | undefined): string {
  const raw = answer?.kind === "pbq" ? answer.parts[part.id] : undefined;
  if (part.kind === "portPair") {
    const [clear, secure] = Array.isArray(raw) ? raw.map(clean) : [clean(raw), ""];
    if (!clear && !secure) return BLANK;
    return `Cleartext ${clear || BLANK} · Secure ${secure || BLANK}`;
  }
  const text = Array.isArray(raw) ? raw.map(clean).filter(Boolean).join(", ") : clean(raw);
  if (!text) return BLANK;
  if (part.kind === "mcq") {
    const i = part.options.findIndex((o) => o.id === text);
    return i === -1 ? text : `${optionLetter(i)} · ${part.options[i]!.text}`;
  }
  return text;
}

/** A firewall answer's rule `index` as "443 · Allow" (`BLANK` for unset cells). */
export function formatRule(answer: AnswerValue | null | undefined, index: number): string {
  const r = answer?.kind === "firewall" ? answer.rules[index] : undefined;
  if (!r?.port && !r?.action) return BLANK;
  return `${r.port ?? BLANK} · ${r.action ? actionLabel(r.action) : BLANK}`;
}

/** Marks for every part of a non-firewall PBQ, by part id. */
export function partMarks(item: PbqReviewInput): Map<string, PartMark> {
  const out = new Map<string, PartMark>();
  if (item.payload.template === "firewall") return out;
  const parts: PbqPart[] = item.payload.parts;
  let scored = 0;
  for (const part of parts) {
    const yours = formatPartAnswer(part, item.yourAnswer);
    const blank = yours === BLANK;
    if (!isScoredPart(part)) {
      const model = clean(item.practiceAnswer?.[part.id]);
      out.set(part.id, { ok: null, yours, correct: model || BLANK, blank });
    } else {
      out.set(part.id, {
        ok: item.partResults[scored++] ?? false,
        yours,
        correct: formatPartAnswer(part, item.correctAnswer),
        blank,
      });
    }
  }
  return out;
}

/** Marks for every rule of a firewall PBQ, in rule order. */
export function ruleMarks(item: PbqReviewInput): PartMark[] {
  if (item.payload.template !== "firewall") return [];
  const payload: PayloadOf<"firewall"> = item.payload;
  return payload.rules.map((_, i) => {
    const yours = formatRule(item.yourAnswer, i);
    return {
      ok: item.partResults[i] ?? false,
      yours,
      correct: formatRule(item.correctAnswer, i),
      blank: yours === BLANK,
    };
  });
}

/** The status line for a mark: "Correct", "Wrong", "Not answered" or "Practice · not scored". */
export function markLabel(mark: PartMark): string {
  if (mark.ok === null) return "Practice · not scored";
  if (mark.ok) return "Correct";
  return mark.blank ? "Not answered" : "Wrong";
}

/** Templates with a dedicated PBQ component; others are reviewed as stacked cards. */
const REVIEW_TEMPLATES: ReadonlySet<string> = new Set([
  "sshLog",
  "nmap",
  "hashCheck",
  "permissions",
  "firewall",
]);

export function hasArtefactReview(template: string): boolean {
  return REVIEW_TEMPLATES.has(template);
}
