/**
 * Checks a student's answer against the question it is saved for (LLD §7.2,
 * PRD EX-7, EX-9, PB-1–PB-3). `attempts.saveResponse` runs this before it
 * stores anything, because `getState` returns the stored value typed by
 * `answerValueValidator` and marking (T-207) trusts its shape.
 *
 * Uses the question document only (option ids, `chooseCount`, payload part
 * ids and choice lists). Nothing here reads `answerKeys` (SE-1): whether an
 * answer is right is decided at submit.
 */
import type { Doc } from "../_generated/dataModel";
import type { AnswerValue, PbqPart } from "../../shared/content";

/** LLD §7.2: the longest string a student can save in any field. */
export const ANSWER_STRING_MAX = 200;

/** A portPair part (B2a, B2b) takes two ports; the client may send one while typing. */
const PORT_PAIR_MAX = 2;

const hasDuplicates = (values: readonly string[]) => new Set(values).size !== values.length;
const fits = (s: string) => s.length <= ANSWER_STRING_MAX;

/** One PBQ part answer. `""` (and `[]` for portPair) means the part is blank. */
function partAnswerOk(part: PbqPart, answer: string | string[]): boolean {
  if (part.kind === "portPair") {
    return Array.isArray(answer) && answer.length <= PORT_PAIR_MAX && answer.every(fits);
  }
  if (typeof answer !== "string") return false;
  if (answer === "") return true;
  switch (part.kind) {
    case "pick":
      return part.choices.includes(answer);
    case "mcq":
      return part.options.some((o) => o.id === answer);
    default:
      return fits(answer);
  }
}

/**
 * `true` when `value` is a valid answer for `question`:
 *
 * - MCQ: `kind: "mcq"`; option ids from this question, no repeats, at most
 *   `chooseCount` of them (a third pick on a Choose TWO is refused).
 * - Text, port, pick and MCQ-part PBQs: `kind: "pbq"`; only the payload's part
 *   ids; a string for each part (two strings at most for portPair); pick and
 *   MCQ parts use one of their choices or option ids; free text ≤ 200 chars.
 * - Firewall: `kind: "firewall"`; one row per payload rule; each port and
 *   action `null` or one of the payload's `portChoices` / `actionChoices`.
 *
 * `value` has already passed `answerValueValidator` (the mutation's args).
 */
export function answerFitsQuestion(question: Doc<"questions">, value: AnswerValue): boolean {
  if (question.kind === "mcq") {
    if (value.kind !== "mcq" || !question.options || question.chooseCount === undefined) {
      return false;
    }
    const ids = new Set(question.options.map((o) => o.id));
    return (
      value.optionIds.length <= question.chooseCount &&
      !hasDuplicates(value.optionIds) &&
      value.optionIds.every((id) => ids.has(id))
    );
  }

  const payload = question.payload;
  if (!payload) return false;

  if (payload.template === "firewall") {
    if (value.kind !== "firewall" || value.rules.length !== payload.rules.length) return false;
    const ports: readonly string[] = payload.portChoices;
    const actions: readonly string[] = payload.actionChoices;
    return value.rules.every(
      (r) =>
        (r.port === null || ports.includes(r.port)) &&
        (r.action === null || actions.includes(r.action)),
    );
  }

  if (value.kind !== "pbq") return false;
  const parts = new Map<string, PbqPart>(payload.parts.map((p) => [p.id, p]));
  return Object.entries(value.parts).every(([id, answer]) => {
    const part = parts.get(id);
    return part !== undefined && partAnswerOk(part, answer);
  });
}

/**
 * `true` when the answer holds nothing: no options picked, every PBQ part
 * blank, or every firewall cell unset. Such a value is stored as no value, so
 * an emptied answer and a cleared one look the same to `getState` and marking.
 */
export function isBlankAnswer(value: AnswerValue): boolean {
  switch (value.kind) {
    case "mcq":
      return value.optionIds.length === 0;
    case "pbq":
      return Object.values(value.parts).every((a) =>
        Array.isArray(a) ? a.every((s) => s === "") : a === "",
      );
    case "firewall":
      return value.rules.every((r) => r.port === null && r.action === null);
  }
}
