/**
 * Pure helpers for the exam runner UI (T-213, LLD §14, PRD EX-6 to EX-9,
 * EX-12). No Vue, Nuxt or DOM: unit-tested in node.
 *
 * - Question state for the navigator and the pre-submit review.
 * - "Choose TWO" enforcement (EX-9): never more than `chooseCount` options.
 * - PBQ answer edits (one part, or one firewall cell, at a time).
 * - The tiny inline parser for question text: `code` and **bold** only,
 *   rendered as Vue nodes, never through `v-html` (SE-6).
 */
import type { AnswerValue, PbqPayload } from "../../shared/content";
import { isBlankAnswer, type QuestionState, type ResponseMap } from "./attemptSync";

/** The fields of a paper question the runner logic needs (MCQ or PBQ). */
export type RunnerQuestion = {
  questionId: string;
  kind: "mcq" | "pbq";
  displayNumber: string;
  stem: string;
  chooseCount?: number;
  payload?: PbqPayload;
};

// ---------------------------------------------------------------------------
// Question state
// ---------------------------------------------------------------------------

export function isAnswered(value: AnswerValue | undefined): value is AnswerValue {
  return value !== undefined && !isBlankAnswer(value);
}

/**
 * Scored blanks filled in a PBQ: text/port/pick/mcq parts (practice parts
 * such as 1d are left out, PB-2), or firewall rules with both port and action.
 */
export function pbqProgress(
  payload: PbqPayload,
  value: AnswerValue | undefined,
): { filled: number; total: number } {
  if (payload.template === "firewall") {
    const rules = value?.kind === "firewall" ? value.rules : [];
    const filled = payload.rules.filter((_, i) => rules[i]?.port && rules[i]?.action).length;
    return { filled, total: payload.rules.length };
  }
  const parts = value?.kind === "pbq" ? value.parts : {};
  const scored = payload.parts.filter((p) => !("scored" in p) || p.scored);
  const filled = scored.filter((p) => {
    const a = parts[p.id];
    if (a === undefined) return false;
    if (Array.isArray(a)) return a.length > 0 && a.every((s) => s.trim() !== "");
    return a.trim() !== "";
  }).length;
  return { filled, total: scored.length };
}

export type QuestionStatus = {
  answered: boolean;
  flagged: boolean;
  /** A PBQ with some, but not all, scored blanks filled. */
  partial: boolean;
};

export function questionStatus(
  q: RunnerQuestion,
  state: QuestionState | undefined,
): QuestionStatus {
  const answered = isAnswered(state?.value);
  let partial = false;
  if (answered && q.kind === "pbq" && q.payload) {
    const { filled, total } = pbqProgress(q.payload, state?.value);
    partial = filled < total;
  }
  return { answered, flagged: state?.flagged ?? false, partial };
}

/** Navigator cell colour (mockup screen 02): flagged wins over answered. */
export type NavCellState = "flagged" | "answered" | "unanswered";

export type NavigatorCell = { label: string; state: NavCellState; partial?: boolean };

export function navCellState(s: QuestionStatus): NavCellState {
  if (s.flagged) return "flagged";
  return s.answered ? "answered" : "unanswered";
}

/**
 * Navigator label: PBQs are P1–P5 whatever their display number (the
 * retake's B1–B5 too), MCQs keep their number (6–90).
 */
export function navLabel(questions: readonly RunnerQuestion[], index: number): string {
  const q = questions[index];
  if (!q) return "";
  if (q.kind === "mcq") return q.displayNumber;
  let n = 0;
  for (let i = 0; i <= index; i++) if (questions[i]?.kind === "pbq") n++;
  return `P${n}`;
}

export type RunnerSummary = {
  total: number;
  answered: number;
  flagged: number;
  /** No answer at all: these score zero (counted whether flagged or not). */
  unanswered: number;
};

export function summarise(
  questions: readonly RunnerQuestion[],
  responses: ResponseMap,
): RunnerSummary {
  let answered = 0;
  let flagged = 0;
  for (const q of questions) {
    const s = questionStatus(q, responses[q.questionId]);
    if (s.answered) answered++;
    if (s.flagged) flagged++;
  }
  return { total: questions.length, answered, flagged, unanswered: questions.length - answered };
}

export type ReviewState = "flagged" | "unanswered" | "flaggedUnanswered" | "partial";

export type ReviewItem = {
  index: number;
  label: string;
  /** The stem as plain text (markers removed), for a one-line preview. */
  preview: string;
  state: ReviewState;
};

export const REVIEW_STATE_LABEL: Record<ReviewState, string> = {
  flagged: "Flagged",
  unanswered: "Unanswered",
  flaggedUnanswered: "Flagged · unanswered",
  partial: "Partly answered",
};

/**
 * EX-12: the questions to look at before submitting, in paper order: every
 * flagged or unanswered question, and PBQs with scored blanks left empty.
 */
export function reviewItems(
  questions: readonly RunnerQuestion[],
  responses: ResponseMap,
): ReviewItem[] {
  const out: ReviewItem[] = [];
  questions.forEach((q, index) => {
    const s = questionStatus(q, responses[q.questionId]);
    let state: ReviewState | null = null;
    if (s.flagged) state = s.answered ? "flagged" : "flaggedUnanswered";
    else if (!s.answered) state = "unanswered";
    else if (s.partial) state = "partial";
    if (state) {
      out.push({ index, label: navLabel(questions, index), preview: plainText(q.stem), state });
    }
  });
  return out;
}

/** Why the last submit didn't go through (shown on the review screen). */
export type SubmitProblem = { kind: "pending"; count: number } | { kind: "error"; message: string };

// ---------------------------------------------------------------------------
// MCQ selection (EX-9)
// ---------------------------------------------------------------------------

/** Display letter by position (EX-10 shuffles options; letters follow the screen). */
export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

export function chooseLabel(chooseCount: number): string | null {
  const words = ["", "", "TWO", "THREE", "FOUR"];
  if (chooseCount <= 1) return null;
  return `Choose ${words[chooseCount] ?? String(chooseCount)}`;
}

/**
 * Toggle one option. Single answer: picking replaces (picking the chosen one
 * keeps it, like a radio). Choose N: toggles, but a pick beyond N is refused
 * (`blocked`) so the student deselects one first; the server refuses it too.
 */
export function toggleChoice(
  selected: readonly string[],
  optionId: string,
  chooseCount: number,
): { selected: string[]; blocked: boolean } {
  if (chooseCount <= 1) return { selected: [optionId], blocked: false };
  if (selected.includes(optionId)) {
    return { selected: selected.filter((id) => id !== optionId), blocked: false };
  }
  if (selected.length >= chooseCount) return { selected: [...selected], blocked: true };
  return { selected: [...selected, optionId], blocked: false };
}

/** MCQ answer value for a selection (`null` clears it). */
export function mcqValue(optionIds: readonly string[]): AnswerValue | null {
  return optionIds.length === 0 ? null : { kind: "mcq", optionIds: [...optionIds] };
}

/** Option index for a key press: A–Z or 1–9, or -1. */
export function optionIndexForKey(key: string, optionCount: number): number {
  let i = -1;
  if (/^[1-9]$/.test(key)) i = Number(key) - 1;
  else if (/^[a-z]$/i.test(key)) i = key.toUpperCase().charCodeAt(0) - 65;
  return i >= 0 && i < optionCount ? i : -1;
}

// ---------------------------------------------------------------------------
// PBQ answers
// ---------------------------------------------------------------------------

/** Set one PBQ part; `null` once every part is blank (stored as no answer). */
export function setPbqPart(
  value: AnswerValue | undefined,
  partId: string,
  answer: string | string[],
): AnswerValue | null {
  const parts = { ...(value?.kind === "pbq" ? value.parts : {}), [partId]: answer };
  const next: AnswerValue = { kind: "pbq", parts };
  return isBlankAnswer(next) ? null : next;
}

/** Set a firewall rule's port or action; `null` once every cell is unset. */
export function setFirewallCell(
  value: AnswerValue | undefined,
  ruleCount: number,
  index: number,
  field: "port" | "action",
  choice: string | null,
): AnswerValue | null {
  const old = value?.kind === "firewall" ? value.rules : [];
  const rules = Array.from({ length: ruleCount }, (_, i) => ({
    port: old[i]?.port ?? null,
    action: old[i]?.action ?? null,
  }));
  const rule = rules[index];
  if (!rule) return value ?? null;
  rule[field] = choice === "" ? null : choice;
  const next: AnswerValue = { kind: "firewall", rules };
  return isBlankAnswer(next) ? null : next;
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/** Footer "Next" label (mockup screens 02–04). */
export function nextLabel(questions: readonly RunnerQuestion[], index: number): string {
  const cur = questions[index];
  const next = questions[index + 1];
  if (!next) return "Review & submit";
  if (cur?.kind === "pbq" && next.kind === "pbq") return "Next PBQ";
  if (cur?.kind === "pbq" && next.kind === "mcq") return "Start multiple choice";
  return "Next";
}

/**
 * Roving focus in the navigator grid: arrows move by one cell or one row,
 * Home/End to the ends of the row (with Ctrl, of the grid). Returns the new
 * index, or null when the key isn't a grid key.
 */
export function gridMove(
  index: number,
  key: string,
  total: number,
  columns: number,
  ctrl = false,
): number | null {
  const clamp = (i: number) => Math.min(total - 1, Math.max(0, i));
  const rowStart = index - (index % columns);
  switch (key) {
    case "ArrowRight":
      return clamp(index + 1);
    case "ArrowLeft":
      return clamp(index - 1);
    case "ArrowDown":
      return index + columns < total ? index + columns : index;
    case "ArrowUp":
      return index - columns >= 0 ? index - columns : index;
    case "Home":
      return ctrl ? 0 : rowStart;
    case "End":
      return ctrl ? total - 1 : clamp(rowStart + columns - 1);
    default:
      return null;
  }
}

/** `mm:ss` for the countdown (90 minutes shows as 90:00). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Inline text (SE-6)
// ---------------------------------------------------------------------------

export type InlineToken = { type: "text" | "code" | "bold"; value: string };

/** `**bold**` with no `*` inside and no space just inside the markers. */
const BOLD = /\*\*([^*\s](?:[^*]*[^*\s])?)\*\*/g;

/**
 * Splits question text into plain, `code` and **bold** runs. An unmatched
 * backtick or `**` stays as literal text; runs of asterisks such as a masked
 * card number (`************4417`) are not bold.
 */
export function parseInline(text: string): InlineToken[] {
  const out: InlineToken[] = [];
  const pushText = (s: string) => {
    if (!s) return;
    let last = 0;
    for (const m of s.matchAll(BOLD)) {
      if (m.index > last) out.push({ type: "text", value: s.slice(last, m.index) });
      out.push({ type: "bold", value: m[1] ?? "" });
      last = m.index + m[0].length;
    }
    if (last < s.length) out.push({ type: "text", value: s.slice(last) });
  };
  let rest = text;
  for (;;) {
    const open = rest.indexOf("`");
    const close = open === -1 ? -1 : rest.indexOf("`", open + 1);
    if (open === -1 || close === -1 || close === open + 1) {
      pushText(rest);
      break;
    }
    pushText(rest.slice(0, open));
    out.push({ type: "code", value: rest.slice(open + 1, close) });
    rest = rest.slice(close + 1);
  }
  // Merge neighbouring text runs (an empty code span leaves two).
  return out.reduce<InlineToken[]>((acc, t) => {
    const prev = acc[acc.length - 1];
    if (prev && prev.type === "text" && t.type === "text") prev.value += t.value;
    else acc.push({ ...t });
    return acc;
  }, []);
}

export function plainText(text: string): string {
  return parseInline(text)
    .map((t) => t.value)
    .join("");
}
