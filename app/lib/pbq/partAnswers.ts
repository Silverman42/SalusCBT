/**
 * Reading and writing PBQ part answers for the dedicated PBQ components
 * (T-304, T-305). Pure: no Vue, unit-tested in node. Writes go through
 * `setPbqPart`, which returns `null` once every part is blank.
 */
import type { AnswerValue, McqPart } from "../../../shared/content";
import { optionLetter, setPbqPart } from "../examRunner";

/** The saved text for one part ("" when unset or not a text answer). */
export function partText(value: AnswerValue | undefined, partId: string): string {
  const a = value?.kind === "pbq" ? value.parts[partId] : undefined;
  return typeof a === "string" ? a : "";
}

/**
 * Set one text, pick or MCQ part. The text is stored as typed: marking
 * normalises it on the server (so `640` and `0640` both score, T-305).
 */
export function withPartText(
  value: AnswerValue | undefined,
  partId: string,
  text: string,
): AnswerValue | null {
  return setPbqPart(value, partId, text);
}

/**
 * MCQ part options for display: the paper's order is kept (the server has
 * already shuffled them) and the option ids are passed through untouched;
 * letters follow screen position.
 */
export function mcqPartOptions(part: McqPart): { id: string; text: string; letter: string }[] {
  return part.options.map((o, i) => ({ id: o.id, text: o.text, letter: optionLetter(i) }));
}
