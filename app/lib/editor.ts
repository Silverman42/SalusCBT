/**
 * Pure helpers for the question editor (LLD §10, §14.1; PRD ED-3, ED-8,
 * ED-9), after mockup screen 11 ("Question editor"): version badges and
 * wording, the MCQ form state and its `editor.saveQuestion` payload, form
 * hints, server issue paths mapped to form fields, and list reordering.
 * No Vue, no Convex client.
 */
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import type { Badge } from "./admin";
import { errorCodeOf } from "./attemptSync";
import { DOMAIN_NAMES, type Domain } from "./resultView";

export type VersionSummary = FunctionReturnType<typeof api.editor.myVersions>[number];
export type DraftView = FunctionReturnType<typeof api.editor.getDraft>;
export type DraftEntry = DraftView["questions"][number];
export type QuestionDoc = DraftEntry["question"];
export type KeyDoc = NonNullable<DraftEntry["key"]>;
export type Issue = FunctionReturnType<typeof api.editor.validate>[number];
export type Section = QuestionDoc["section"];
export type SaveQuestionArgs = FunctionArgs<typeof api.editor.saveQuestion>;

/** `VERSION_LABEL_MAX` in convex/editor.ts. */
export const VERSION_LABEL_MAX = 80;
/** `OPTION_IDS` in convex/editor.ts: 2–6 options, lettered in order. */
export const OPTION_IDS = ["A", "B", "C", "D", "E", "F"] as const;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = OPTION_IDS.length;
/** `STEM_MAX`, `EXPLANATION_MAX`, `OPTION_TEXT_MAX` in convex/editor.ts. */
export const STEM_MAX = 10_000;
export const EXPLANATION_MAX = 10_000;
export const OPTION_TEXT_MAX = 1_000;

export const DOMAINS = Object.keys(DOMAIN_NAMES) as Domain[];

export const SECTION_LABEL: Record<Section, string> = {
  pbqA: "PBQ set A",
  pbqB: "PBQ set B",
  mcq: "Multiple choice",
};

export const TEMPLATE_LABEL: Record<NonNullable<QuestionDoc["template"]>, string> = {
  sshLog: "SSH log analysis",
  nmap: "Nmap scan",
  hashCheck: "Hash check",
  permissions: "File permissions",
  firewall: "Firewall rules",
};

// ---------------------------------------------------------------- versions

export function versionStatusBadge(status: VersionSummary["status"]): Badge {
  switch (status) {
    case "draft":
      return { label: "Draft", tone: "warn" };
    case "published":
      return { label: "Published", tone: "ok" };
    case "archived":
      return { label: "Archived", tone: "muted" };
  }
}

/** "v3", the version's number in its owner's line. */
export function versionName(version: Pick<VersionSummary, "versionNo">): string {
  return `v${version.versionNo}`;
}

/** Owner line key: the default line, or one tutor's line, per exam. */
function lineKey(version: Pick<VersionSummary, "examId" | "ownerId">): string {
  return `${version.examId}:${version.ownerId ?? "default"}`;
}

/** Ids of the newest published version in each line (the one a restore isn't for). */
export function latestPublishedIds(versions: VersionSummary[]): Set<string> {
  const best = new Map<string, VersionSummary>();
  for (const version of versions) {
    if (version.status !== "published") continue;
    const key = lineKey(version);
    const current = best.get(key);
    if (!current || version.versionNo > current.versionNo) best.set(key, version);
  }
  return new Set([...best.values()].map((v) => v.versionId));
}

/**
 * The copy action for a version: "Restore" for an older published version
 * (ED-3: a new draft from it), otherwise "New draft from this".
 */
export function copyActionLabel(version: VersionSummary, latest: Set<string>): string {
  return version.status === "published" && !latest.has(version.versionId)
    ? "Restore"
    : "New draft from this";
}

/** "v3 · draft · copied from Default SY0-701 v1" (mockup screen 11 subtitle). */
export function versionSubtitle(version: VersionSummary, all: VersionSummary[]): string {
  const parts = [versionName(version), version.status];
  if (version.isDefault) parts.push("default exam");
  const parent = version.parentVersionId
    ? all.find((v) => v.versionId === version.parentVersionId)
    : undefined;
  if (parent) parts.push(`copied from ${parent.label} ${versionName(parent)}`);
  return parts.join(" · ");
}

export interface VersionGroups {
  drafts: VersionSummary[];
  published: VersionSummary[];
  archived: VersionSummary[];
}

/** Drafts first (newest edit first), then published and archived (newest first). */
export function groupVersions(versions: VersionSummary[]): VersionGroups {
  const byUpdated = (a: VersionSummary, b: VersionSummary) => b.updatedAt - a.updatedAt;
  const byPublished = (a: VersionSummary, b: VersionSummary) =>
    (b.publishedAt ?? b.updatedAt) - (a.publishedAt ?? a.updatedAt);
  return {
    drafts: versions.filter((v) => v.status === "draft").sort(byUpdated),
    published: versions.filter((v) => v.status === "published").sort(byPublished),
    archived: versions.filter((v) => v.status === "archived").sort(byPublished),
  };
}

/** The source a "New draft" starts from: the newest published default version, else any. */
export function defaultSource(versions: VersionSummary[]): VersionSummary | null {
  const { published } = groupVersions(versions);
  return published.find((v) => v.isDefault) ?? published[0] ?? versions[0] ?? null;
}

/** A starting label for a copy, within `VERSION_LABEL_MAX`. */
export function suggestedLabel(source: Pick<VersionSummary, "label">): string {
  return `Copy of ${source.label}`.slice(0, VERSION_LABEL_MAX).trim();
}

/** Why a draft label can't be used, or `null` (same rule as `cleanLabel` on the server). */
export function labelError(label: string): string | null {
  const clean = label.trim();
  if (clean.length === 0) return "Give the draft a name.";
  if (clean.length > VERSION_LABEL_MAX)
    return `Keep the name to ${VERSION_LABEL_MAX} characters or fewer.`;
  return null;
}

/** Why a version can't be edited here, or `null` when it can. */
export function readOnlyReason(version: VersionSummary): string | null {
  if (version.editable) return null;
  if (version.status === "draft") return "Only the tutor who owns this draft can edit it.";
  return `This version is ${version.status}, so it can't be changed. Create a draft from it to make changes.`;
}

// ---------------------------------------------------------- question list

/** One question's line in the list: number, a short stem, an issue marker. */
export function questionPreview(question: QuestionDoc, max = 80): string {
  const text = question.stem.replace(/\s+/g, " ").trim();
  const base =
    text ||
    (question.template ? TEMPLATE_LABEL[question.template] : "") ||
    "(no question text yet)";
  return base.length > max ? `${base.slice(0, max - 1).trimEnd()}…` : base;
}

export function entriesIn(entries: DraftEntry[], section: Section): DraftEntry[] {
  return entries.filter((e) => e.question.section === section);
}

/** Case-insensitive match on number, stem and option text. */
export function matchesSearch(entry: DraftEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const { question } = entry;
  const haystack = [
    question.displayNumber,
    `q${question.displayNumber}`,
    question.stem,
    ...(question.options ?? []).map((o) => o.text),
    question.template ? TEMPLATE_LABEL[question.template] : "",
  ]
    .join("\n")
    .toLowerCase();
  return haystack.includes(q);
}

/** `ids` with the item at `index` moved by `delta` places, or `null` if it can't move. */
export function moveItem<T>(ids: readonly T[], index: number, delta: -1 | 1): T[] | null {
  const to = index + delta;
  if (index < 0 || index >= ids.length || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item as T);
  return next;
}

export interface VersionTotals {
  points: number;
  pbqA: number;
  pbqB: number;
  mcq: number;
}

export function versionTotals(entries: DraftEntry[]): VersionTotals {
  const totals: VersionTotals = { points: 0, pbqA: 0, pbqB: 0, mcq: 0 };
  for (const { question } of entries) {
    totals.points += question.points;
    totals[question.section] += 1;
  }
  return totals;
}

/** Worst severity per question id, for the list's issue dot. */
export function issuesByQuestion(issues: Issue[]): Map<string, Issue["severity"]> {
  const map = new Map<string, Issue["severity"]>();
  for (const issue of issues) {
    if (issue.questionId === null) continue;
    if (map.get(issue.questionId) !== "error") map.set(issue.questionId, issue.severity);
  }
  return map;
}

/** "3 issues before publishing", "1 warning", "Ready to publish". */
export function issueHeading(issues: Issue[]): string {
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.length - errors;
  if (errors > 0) return `${errors} ${errors === 1 ? "issue" : "issues"} before publishing`;
  if (warnings > 0)
    return `Ready to publish · ${warnings} ${warnings === 1 ? "warning" : "warnings"}`;
  return "Ready to publish";
}

/** "Q87 · message" or "Version · message". */
export function issueLabel(issue: Issue): string {
  return `${issue.displayNumber === null ? "Version" : `Q${issue.displayNumber}`} · ${issue.message}`;
}

// ---------------------------------------------------------------- MCQ form

export interface McqOption {
  id: string;
  text: string;
}

export interface McqFormState {
  domain: Domain | "";
  stem: string;
  chooseCount: 1 | 2;
  options: McqOption[];
  /** Option ids ticked as correct, in option order. */
  correct: string[];
  explanation: string;
}

export function emptyMcqForm(): McqFormState {
  return {
    domain: "",
    stem: "",
    chooseCount: 1,
    options: OPTION_IDS.slice(0, 4).map((id) => ({ id, text: "" })),
    correct: [],
    explanation: "",
  };
}

function isDomain(value: unknown): value is Domain {
  return typeof value === "string" && (DOMAINS as string[]).includes(value);
}

/** A stored MCQ (and its key) as form state. */
export function mcqFormFromDoc(question: QuestionDoc, key: KeyDoc | null): McqFormState {
  const options = (question.options ?? []).map((o) => ({ id: o.id, text: o.text }));
  const ids = new Set(options.map((o) => o.id));
  return {
    domain: isDomain(question.domain) ? question.domain : "",
    stem: question.stem,
    chooseCount: question.chooseCount === 2 ? 2 : 1,
    options,
    correct: sortByOptions(
      (key?.correct ?? []).filter((id) => ids.has(id)),
      options,
    ),
    explanation: key?.explanation ?? "",
  };
}

function sortByOptions(ids: string[], options: McqOption[]): string[] {
  const order = options.map((o) => o.id);
  return [...new Set(ids)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** Add an empty option with the next letter (no-op at six). */
export function addOption(form: McqFormState): McqFormState {
  if (form.options.length >= MAX_OPTIONS) return form;
  const id = OPTION_IDS[form.options.length]!;
  return { ...form, options: [...form.options, { id, text: "" }] };
}

/**
 * Remove an option; the ones after it move up a letter (C becomes B), and
 * ticked answers follow their text. No-op at two options.
 */
export function removeOption(form: McqFormState, index: number): McqFormState {
  if (form.options.length <= MIN_OPTIONS || index < 0 || index >= form.options.length) return form;
  const removed = form.options[index]!.id;
  const kept = form.options.filter((_, i) => i !== index);
  const rename = new Map(kept.map((o, i) => [o.id, OPTION_IDS[i]!]));
  return {
    ...form,
    options: kept.map((o, i) => ({ id: OPTION_IDS[i]!, text: o.text })),
    correct: form.correct.filter((id) => id !== removed).map((id) => rename.get(id) ?? id),
  };
}

/**
 * Tick or untick an answer. With Choose ONE it behaves like a radio; with
 * Choose TWO a third tick replaces the oldest.
 */
export function toggleCorrect(form: McqFormState, id: string): McqFormState {
  let correct: string[];
  if (form.correct.includes(id)) correct = form.correct.filter((c) => c !== id);
  else if (form.chooseCount === 1) correct = [id];
  else correct = [...form.correct, id].slice(-2);
  return { ...form, correct: sortByOptions(correct, form.options) };
}

/** Switch Choose ONE / TWO, keeping at most that many ticks. */
export function setChooseCount(form: McqFormState, count: 1 | 2): McqFormState {
  return { ...form, chooseCount: count, correct: form.correct.slice(0, count) };
}

/** The `editor.saveQuestion` arguments for this form (domain must be chosen). */
export function mcqPayload(
  form: McqFormState & { domain: Domain },
): Pick<SaveQuestionArgs, "question" | "key"> {
  return {
    question: {
      kind: "mcq",
      section: "mcq",
      domain: form.domain,
      stem: form.stem,
      options: form.options.map((o) => ({ id: o.id, text: o.text })),
      chooseCount: form.chooseCount,
    },
    key: { correct: sortByOptions(form.correct, form.options), explanation: form.explanation },
  };
}

/** A deep copy (plain objects, safe on Vue proxies). */
export function cloneMcqForm(form: McqFormState): McqFormState {
  return {
    ...form,
    options: form.options.map((o) => ({ id: o.id, text: o.text })),
    correct: [...form.correct],
  };
}

export function sameMcqForm(a: McqFormState, b: McqFormState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// --------------------------------------------------------- fields & issues

/**
 * Form fields an issue can point at. `option:<i>` is an option's text box,
 * `correct` the answer ticks, `options` the option list as a whole.
 */
export type McqField =
  "domain" | "stem" | "chooseCount" | "options" | `option:${number}` | "correct" | "explanation";

export interface FieldIssue {
  /** `null`: about the whole question or version, shown in the summary only. */
  field: McqField | null;
  message: string;
}

/** Form field for a `VALIDATION_FAILED` issue path such as `question.options[1].id`. */
export function fieldForPath(path: string): McqField | null {
  const option = /^question\.options\[(\d+)\]\.(id|text)$/.exec(path);
  if (option) return `option:${Number(option[1])}`;
  if (path === "question.options") return "options";
  if (path === "question.stem") return "stem";
  if (path === "question.domain") return "domain";
  if (path === "question.chooseCount") return "chooseCount";
  if (path === "key.correct" || /^key\.correct\[\d+\]$/.test(path)) return "correct";
  if (path === "key.explanation") return "explanation";
  return null;
}

/** "Must not be blank" from "must not be blank". */
function sentence(text: string): string {
  const t = text.trim();
  if (!t) return t;
  const s = t[0]!.toUpperCase() + t.slice(1);
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

const FIELD_NAME: Record<string, string> = {
  domain: "Domain",
  stem: "Question text",
  chooseCount: "Choose TWO",
  options: "Options",
  correct: "Correct answers",
  explanation: "Explanation",
};

/** A field's name for the error summary: "Option B", "Question text". */
export function fieldName(field: McqField, form?: Pick<McqFormState, "options">): string {
  if (field.startsWith("option:")) {
    const index = Number(field.slice("option:".length));
    return `Option ${form?.options[index]?.id ?? OPTION_IDS[index] ?? index + 1}`;
  }
  return FIELD_NAME[field] ?? field;
}

/** Server issue strings (`path: message`) as field issues. */
export function parseIssues(issues: readonly string[]): FieldIssue[] {
  return issues.map((issue) => {
    const at = issue.indexOf(": ");
    if (at < 0) return { field: null, message: sentence(issue) };
    const path = issue.slice(0, at);
    const field = fieldForPath(path);
    const message = issue.slice(at + 2);
    return { field, message: field ? sentence(message) : sentence(issue) };
  });
}

/** The `issues` of a `VALIDATION_FAILED` error, or `null` for any other error. */
export function validationIssuesOf(err: unknown): string[] | null {
  if (errorCodeOf(err) !== "VALIDATION_FAILED") return null;
  const data = (err as { data?: unknown }).data;
  const issues = data && typeof data === "object" ? (data as { issues?: unknown }).issues : null;
  return Array.isArray(issues) ? issues.filter((i): i is string => typeof i === "string") : [];
}

/**
 * Problems that stop a save, checked before calling the server (the same
 * rules as `checkQuestion`, plus a domain, which the argument validator needs).
 */
export function mcqSaveErrors(form: McqFormState): FieldIssue[] {
  const errors: FieldIssue[] = [];
  if (!form.domain) errors.push({ field: "domain", message: "Choose a domain." });
  if (form.stem.trim() === "") errors.push({ field: "stem", message: "Enter the question text." });
  else if (form.stem.length > STEM_MAX)
    errors.push({ field: "stem", message: `Keep the question to ${STEM_MAX} characters.` });
  if (form.options.length < MIN_OPTIONS || form.options.length > MAX_OPTIONS)
    errors.push({
      field: "options",
      message: `Give ${MIN_OPTIONS}–${MAX_OPTIONS} options.`,
    });
  form.options.forEach((o, i) => {
    if (o.text.trim() === "")
      errors.push({ field: `option:${i}`, message: `Enter the text for option ${o.id}.` });
    else if (o.text.length > OPTION_TEXT_MAX)
      errors.push({
        field: `option:${i}`,
        message: `Keep option ${o.id} to ${OPTION_TEXT_MAX} characters.`,
      });
  });
  if (form.explanation.length > EXPLANATION_MAX)
    errors.push({
      field: "explanation",
      message: `Keep the explanation to ${EXPLANATION_MAX} characters.`,
    });
  return errors;
}

/**
 * Things a draft may be saved without but that block publishing (LLD §10.2):
 * as many ticks as Choose ONE/TWO asks for, and an explanation.
 */
export function mcqPublishHints(form: McqFormState): FieldIssue[] {
  const hints: FieldIssue[] = [];
  const ticked = form.correct.length;
  if (ticked !== form.chooseCount) {
    const want = form.chooseCount === 2 ? "exactly two correct answers" : "one correct answer";
    hints.push({
      field: "correct",
      message: `${form.chooseCount === 2 ? "Choose TWO" : "Choose ONE"} needs ${want} (${ticked} ticked).`,
    });
  }
  if (form.explanation.trim() === "")
    hints.push({ field: "explanation", message: "Required before publishing." });
  return hints;
}

/** A DOM id for a field, under a per-form prefix. */
export function fieldDomId(prefix: string, field: McqField): string {
  return `${prefix}-${field.replace(":", "-")}`;
}

// ------------------------------------------------------------------ errors

export type EditorAction = "load" | "createDraft" | "save" | "delete" | "reorder" | "publish";

/** A message for a failed editor call (LLD §16). */
export function editorErrorMessage(err: unknown, action: EditorAction): string {
  switch (errorCodeOf(err)) {
    case "NOT_FOUND":
      return action === "load"
        ? "We couldn't find that version. It may belong to someone else or have been removed."
        : "That item no longer exists. The page shows the latest state.";
    case "UNAUTHENTICATED":
    case "FORBIDDEN":
      return "Your session has ended. Sign in again to continue.";
    case "VALIDATION_FAILED": {
      const issues = validationIssuesOf(err) ?? [];
      if (issues.some((i) => /^version: (only its owner|a \w+ version can't be changed)/.test(i)))
        return "This version can't be changed any more. Create a draft from it to edit.";
      if (action === "publish") return "Fix the issues listed before publishing.";
      if (action === "createDraft") return "Check the draft name and try again.";
      return "That change wasn't accepted. Check the highlighted fields.";
    }
  }
  if (action === "load" && err instanceof Error && /validator/i.test(err.message))
    return "We couldn't find that version. Check the link.";
  return "Something went wrong. Check your connection and try again.";
}
