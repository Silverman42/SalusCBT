/**
 * Question editor: copy-on-write versions (LLD §10.1, §5.2; PRD ED-3 to ED-5, ED-7).
 *
 * - `createDraft` copies every question, answer key and oral question of a
 *   version into a new `draft` row. The source is only read, so a published
 *   version (and every attempt pinned to it) never changes (ED-4).
 * - A tutor's drafts belong to that tutor (`ownerId = caller`). The admin's
 *   drafts belong to the default exam line (`ownerId` undefined), so only the
 *   admin ever edits the default exam (ED-5); T-603's publish makes such a
 *   version the new default.
 * - `versionNo` is the highest number in the new draft's line (same exam and
 *   owner, default line included) plus one.
 *
 * Visibility (ED-5): a tutor sees their own versions and the published
 * default versions (to copy them, ED-7); never another tutor's versions or
 * an unpublished default draft. The admin sees every version. Anything not
 * visible is `NOT_FOUND`, so its existence isn't revealed.
 *
 * T-602 adds `saveQuestion`, `deleteQuestion` and `reorder`: draft-only writes
 * (through `requireEditableDraft`) that keep each question and its key in
 * step and keep `order` / `displayNumber` dense.
 *
 * SE-1: answer keys are returned by `getDraft` only, and only to the version's
 * author (a tutor's own version, or any version for the admin). No student
 * path reaches this module.
 */
import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fail } from "./lib/errors";
import { requireProfile } from "./lib/guards";
import schema from "./schema";
import type { PbqPayload } from "../shared/content";
import {
  pbqTemplateValidator,
  validatePayload,
  validatePbqKey,
  type ValidationIssue,
} from "../shared/validate";

export const VERSION_LABEL_MAX = 80;

/**
 * Most questions (and so answer keys) a version may hold. The default exam has
 * 95; copying the cap is ~1,000 reads and writes, well inside one mutation's
 * transaction limits, so `createDraft` needs no batching.
 */
export const MAX_VERSION_QUESTIONS = 500;
export const MAX_VERSION_ORAL = 100;

/** Upper bound on `myVersions` (the admin sees every version). */
const MY_VERSIONS_LIMIT = 500;

/** Versions in one owner's line, read to find the next `versionNo`. */
const LINE_LIMIT = 1000;

type ReaderCtx = Pick<QueryCtx, "db">;
type Profile = Doc<"profiles">;
type Version = Doc<"examVersions">;

/** Throw `VALIDATION_FAILED` with an issue list, like `seed.importExam`. */
function invalid(...issues: string[]): never {
  throw new ConvexError({ code: "VALIDATION_FAILED", issues });
}

function cleanLabel(input: string): string {
  const label = input.trim();
  if (label.length === 0 || label.length > VERSION_LABEL_MAX)
    invalid(`label: must be 1–${VERSION_LABEL_MAX} characters`);
  return label;
}

/** The caller authored this version: their own, or any version for the admin. */
function isAuthor(profile: Profile, version: Version): boolean {
  return profile.role === "admin" || version.ownerId === profile._id;
}

/** ED-5 visibility: authored, or a published default version. */
function isVisible(profile: Profile, version: Version): boolean {
  return (
    isAuthor(profile, version) || (version.ownerId === undefined && version.status === "published")
  );
}

/** The version if the caller may see (and copy) it; otherwise `NOT_FOUND`. */
export async function requireVisibleVersion(
  ctx: ReaderCtx,
  profile: Profile,
  versionId: Id<"examVersions">,
): Promise<Version> {
  const version = await ctx.db.get("examVersions", versionId);
  if (!version || !isVisible(profile, version)) fail("NOT_FOUND");
  return version;
}

/**
 * The version if the caller may read its answer keys (its author); otherwise
 * `NOT_FOUND`.
 */
export async function requireAuthoredVersion(
  ctx: ReaderCtx,
  profile: Profile,
  versionId: Id<"examVersions">,
): Promise<Version> {
  const version = await ctx.db.get("examVersions", versionId);
  if (!version || !isAuthor(profile, version)) fail("NOT_FOUND");
  return version;
}

/** Whether `profile` may change this version (a draft in their own line). */
export function canEdit(profile: Profile, version: Version): boolean {
  if (version.status !== "draft") return false;
  if (version.ownerId === undefined) return profile.role === "admin";
  return version.ownerId === profile._id;
}

/**
 * The version if the caller may edit it, for T-602/T-603/T-606. Someone else's
 * version is `NOT_FOUND`; a published or archived one (or another tutor's
 * draft the admin can see) fails `VALIDATION_FAILED`: published versions are
 * never changed (ED-4).
 */
export async function requireEditableDraft(
  ctx: ReaderCtx,
  profile: Profile,
  versionId: Id<"examVersions">,
): Promise<Version> {
  const version = await requireAuthoredVersion(ctx, profile, versionId);
  if (!canEdit(profile, version)) {
    invalid(
      version.status === "draft"
        ? "version: only its owner can edit this draft"
        : `version: a ${version.status} version can't be changed; create a draft from it`,
    );
  }
  return version;
}

async function readContent(ctx: ReaderCtx, versionId: Id<"examVersions">) {
  const questions = await ctx.db
    .query("questions")
    .withIndex("by_version_section_order", (q) => q.eq("versionId", versionId))
    .take(MAX_VERSION_QUESTIONS + 1);
  const keys = await ctx.db
    .query("answerKeys")
    .withIndex("by_version", (q) => q.eq("versionId", versionId))
    .take(MAX_VERSION_QUESTIONS + 1);
  const oral = await ctx.db
    .query("oralQuestions")
    .withIndex("by_version", (q) => q.eq("versionId", versionId))
    .take(MAX_VERSION_ORAL + 1);
  if (questions.length > MAX_VERSION_QUESTIONS || keys.length > MAX_VERSION_QUESTIONS)
    invalid(`version: more than ${MAX_VERSION_QUESTIONS} questions`);
  if (oral.length > MAX_VERSION_ORAL)
    invalid(`version: more than ${MAX_VERSION_ORAL} oral questions`);
  return { questions, keys, oral };
}

const versionSummary = v.object({
  versionId: v.id("examVersions"),
  examId: v.id("exams"),
  label: v.string(),
  versionNo: v.number(),
  status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
  totalPoints: v.number(),
  publishedAt: v.union(v.number(), v.null()),
  updatedAt: v.number(),
  parentVersionId: v.union(v.id("examVersions"), v.null()),
  /** `null` = the default exam line (admin-managed). */
  ownerId: v.union(v.id("profiles"), v.null()),
  isDefault: v.boolean(),
  /** The caller may edit it (T-602): a draft in their own line. */
  editable: v.boolean(),
  /** The caller may open it in `getDraft` (keys included). */
  authored: v.boolean(),
});

function summarise(profile: Profile, version: Version) {
  return {
    versionId: version._id,
    examId: version.examId,
    label: version.label,
    versionNo: version.versionNo,
    status: version.status,
    totalPoints: version.totalPoints,
    publishedAt: version.publishedAt ?? null,
    updatedAt: version.updatedAt,
    parentVersionId: version.parentVersionId ?? null,
    ownerId: version.ownerId ?? null,
    isDefault: version.ownerId === undefined,
    editable: canEdit(profile, version),
    authored: isAuthor(profile, version),
  };
}

/**
 * Versions the caller can see, newest first: a tutor's own versions plus the
 * published default versions; every version for the admin.
 */
export const myVersions = query({
  args: {},
  returns: v.array(versionSummary),
  handler: async (ctx) => {
    const profile = await requireProfile(ctx, ["tutor"]);
    let versions: Version[];
    if (profile.role === "admin") {
      versions = await ctx.db.query("examVersions").order("desc").take(MY_VERSIONS_LIMIT);
    } else {
      const own = await ctx.db
        .query("examVersions")
        .withIndex("by_owner_status", (q) => q.eq("ownerId", profile._id))
        .take(MY_VERSIONS_LIMIT);
      const defaults = await ctx.db
        .query("examVersions")
        .withIndex("by_owner_status", (q) => q.eq("ownerId", undefined).eq("status", "published"))
        .take(MY_VERSIONS_LIMIT);
      versions = [...own, ...defaults].sort((a, b) => b._creationTime - a._creationTime);
    }
    return versions.map((version) => summarise(profile, version));
  },
});

/**
 * A new draft copied from `fromVersionId` (ED-7; restore, ED-3, is the same
 * call on an older published version). The source is never written.
 */
export const createDraft = mutation({
  args: { fromVersionId: v.id("examVersions"), label: v.string() },
  returns: v.object({ versionId: v.id("examVersions"), versionNo: v.number() }),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, ["tutor"]);
    const label = cleanLabel(args.label);
    const source = await requireVisibleVersion(ctx, profile, args.fromVersionId);
    // The admin's drafts are default-line drafts (ED-5).
    const ownerId = profile.role === "admin" ? undefined : profile._id;

    const line = await ctx.db
      .query("examVersions")
      .withIndex("by_exam_owner", (q) => q.eq("examId", source.examId).eq("ownerId", ownerId))
      .take(LINE_LIMIT);
    const versionNo = line.reduce((max, ver) => Math.max(max, ver.versionNo), 0) + 1;

    const { questions, keys, oral } = await readContent(ctx, source._id);
    const now = Date.now();
    const versionId = await ctx.db.insert("examVersions", {
      examId: source.examId,
      ...(ownerId !== undefined ? { ownerId } : {}),
      parentVersionId: source._id,
      label,
      versionNo,
      status: "draft",
      totalPoints: source.totalPoints, // recomputed on publish (ED-10)
      updatedAt: now,
    });

    const questionIds = new Map<Id<"questions">, Id<"questions">>();
    for (const { _id, _creationTime, versionId: _from, ...fields } of questions) {
      questionIds.set(_id, await ctx.db.insert("questions", { ...fields, versionId }));
    }
    for (const { _id, _creationTime, versionId: _from, questionId, ...fields } of keys) {
      const copied = questionIds.get(questionId);
      if (!copied) continue; // orphan key (no question in this version): not carried over
      await ctx.db.insert("answerKeys", { ...fields, questionId: copied, versionId });
    }
    for (const { _id, _creationTime, versionId: _from, ...fields } of oral) {
      await ctx.db.insert("oralQuestions", { ...fields, versionId });
    }
    return { versionId, versionNo };
  },
});

const questionDoc = schema.doc("questions");
const answerKeyDoc = schema.doc("answerKeys");
const oralDoc = schema.doc("oralQuestions");

/**
 * The whole version for the editor, keys included (LLD §5.2). Author only:
 * the owner, or the admin. Questions are in section then display order.
 */
export const getDraft = query({
  args: { versionId: v.id("examVersions") },
  returns: v.object({
    version: versionSummary,
    questions: v.array(v.object({ question: questionDoc, key: v.union(answerKeyDoc, v.null()) })),
    oral: v.array(oralDoc),
  }),
  handler: async (ctx, { versionId }) => {
    const profile = await requireProfile(ctx, ["tutor"]);
    const version = await requireAuthoredVersion(ctx, profile, versionId);
    const { questions, keys, oral } = await readContent(ctx, version._id);
    const keyByQuestion = new Map(keys.map((k) => [k.questionId, k]));
    const sectionRank = { pbqA: 0, pbqB: 1, mcq: 2 } as const;
    const ordered = [...questions].sort(
      (a, b) => sectionRank[a.section] - sectionRank[b.section] || a.order - b.order,
    );
    return {
      version: summarise(profile, version),
      questions: ordered.map((question) => ({
        question,
        key: keyByQuestion.get(question._id) ?? null,
      })),
      oral,
    };
  },
});

// ---------------------------------------------------------------------------
// T-602: save, delete and reorder questions (LLD §5.2; PRD ED-8, ED-9)
// ---------------------------------------------------------------------------

export const STEM_MAX = 10_000;
export const EXPLANATION_MAX = 10_000;
export const OPTION_TEXT_MAX = 1_000;
/** MCQ option ids, in the order the form offers them (schema: "A".."F"). */
export const OPTION_IDS = ["A", "B", "C", "D", "E", "F"] as const;

type Section = Doc<"questions">["section"];
const SECTIONS: readonly Section[] = ["pbqA", "pbqB", "mcq"];

const domainValidator = v.union(
  v.literal("1.0"),
  v.literal("2.0"),
  v.literal("3.0"),
  v.literal("4.0"),
  v.literal("5.0"),
);
const sectionValidator = v.union(v.literal("pbqA"), v.literal("pbqB"), v.literal("mcq"));

/**
 * The editable fields of a question. `order`, `displayNumber` and `points`
 * are derived on the server: order and number from the question's place in
 * its section, points from the content (MCQ 1, PBQ its scored parts).
 * `payload` is checked by `validatePayload` rather than the argument
 * validator, so a bad payload comes back as field-level issues.
 */
export const questionInputValidator = v.union(
  v.object({
    kind: v.literal("mcq"),
    section: v.literal("mcq"),
    domain: domainValidator,
    stem: v.string(),
    options: v.array(v.object({ id: v.string(), text: v.string() })),
    chooseCount: v.number(),
  }),
  v.object({
    kind: v.literal("pbq"),
    section: v.union(v.literal("pbqA"), v.literal("pbqB")),
    domain: domainValidator,
    stem: v.string(),
    template: pbqTemplateValidator,
    payload: v.any(), // PbqPayload, checked by validatePayload
  }),
);

/**
 * The answer key, shaped like an `answerKeys` row (so `getDraft`'s key can be
 * sent straight back): `correct` for an MCQ, `parts` (a `PbqKey`, checked by
 * `validatePbqKey`) for a PBQ.
 */
export const keyInputValidator = v.object({
  correct: v.optional(v.array(v.string())),
  parts: v.optional(v.any()), // PbqKey, checked by validatePbqKey
  explanation: v.string(),
});

export type QuestionInput = Infer<typeof questionInputValidator>;
export type KeyInput = Infer<typeof keyInputValidator>;

/** Points a PBQ is worth: its scored parts (firewall: one per rule). Same rule as the seed. */
export function pbqPoints(payload: PbqPayload): number {
  if (payload.template === "firewall") return payload.rules.length;
  return payload.parts.filter((p) => !("scored" in p) || p.scored).length;
}

const prefixed = (prefix: string, errors: ValidationIssue[]) =>
  errors.map((e) => `${prefix}${e.path === "(root)" ? "" : `.${e.path}`}: ${e.message}`);

type CheckedQuestion = {
  question: Omit<
    Doc<"questions">,
    "_id" | "_creationTime" | "versionId" | "order" | "displayNumber"
  >;
  key: Omit<Doc<"answerKeys">, "_id" | "_creationTime" | "versionId" | "questionId">;
};

/**
 * Save-time checks: everything that would leave a malformed row the runner or
 * marking couldn't use, as `path: message` strings rooted at the argument
 * names (`question.options[1].id`, `key.parts.parts.1a`). Completeness rules a
 * tutor fills in over several saves (an explanation, as many correct answers
 * as `chooseCount`) are left to `editor.validate` before publish (ED-9,
 * LLD §10.2), so a half-written draft can still be saved.
 */
export function checkQuestion(
  question: QuestionInput,
  key: KeyInput,
): { ok: true; value: CheckedQuestion } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  if (question.stem.trim() === "") issues.push("question.stem: must not be blank");
  if (question.stem.length > STEM_MAX)
    issues.push(`question.stem: must be at most ${STEM_MAX} characters`);
  if (key.explanation.length > EXPLANATION_MAX)
    issues.push(`key.explanation: must be at most ${EXPLANATION_MAX} characters`);

  if (question.kind === "mcq") {
    const { options, chooseCount } = question;
    if (options.length < 2 || options.length > OPTION_IDS.length)
      issues.push(
        `question.options: has ${options.length} options, expected 2–${OPTION_IDS.length}`,
      );
    const ids = new Set<string>();
    options.forEach((o, i) => {
      if (!(OPTION_IDS as readonly string[]).includes(o.id))
        issues.push(`question.options[${i}].id: must be one of ${OPTION_IDS.join(", ")}`);
      else if (ids.has(o.id))
        issues.push(`question.options[${i}].id: duplicate option id "${o.id}"`);
      ids.add(o.id);
      if (o.text.trim() === "") issues.push(`question.options[${i}].text: must not be blank`);
      if (o.text.length > OPTION_TEXT_MAX)
        issues.push(`question.options[${i}].text: must be at most ${OPTION_TEXT_MAX} characters`);
    });
    if (chooseCount !== 1 && chooseCount !== 2) issues.push("question.chooseCount: must be 1 or 2");
    if (key.parts !== undefined) issues.push("key.parts: an MCQ key has no parts");
    const correct = key.correct ?? [];
    const picked = new Set<string>();
    correct.forEach((id, i) => {
      if (picked.has(id)) issues.push(`key.correct[${i}]: repeats answer "${id}"`);
      else if (!ids.has(id)) issues.push(`key.correct[${i}]: "${id}" is not an option`);
      picked.add(id);
    });
    if (issues.length > 0) return { ok: false, issues };
    return {
      ok: true,
      value: {
        question: {
          section: question.section,
          kind: "mcq",
          domain: question.domain,
          points: 1,
          stem: question.stem,
          options: options.map((o) => ({ id: o.id, text: o.text })),
          chooseCount,
        },
        key: { correct: [...correct], explanation: key.explanation },
      },
    };
  }

  if (key.correct !== undefined) issues.push("key.correct: a PBQ key has no correct list");
  const payload = validatePayload(question.template, question.payload);
  if (!payload.ok)
    return { ok: false, issues: [...issues, ...prefixed("question.payload", payload.errors)] };
  if (key.parts === undefined)
    return { ok: false, issues: [...issues, "key.parts: is required for a PBQ"] };
  const pbqKey = validatePbqKey(payload.value, key.parts);
  if (!pbqKey.ok)
    return { ok: false, issues: [...issues, ...prefixed("key.parts", pbqKey.errors)] };
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      question: {
        section: question.section,
        kind: "pbq",
        domain: question.domain,
        points: pbqPoints(payload.value),
        stem: question.stem,
        template: question.template,
        payload: payload.value,
      },
      key: { parts: pbqKey.value, explanation: key.explanation },
    },
  };
}

/** The question if it belongs to this version; otherwise `NOT_FOUND`. */
async function requireQuestionIn(
  ctx: ReaderCtx,
  versionId: Id<"examVersions">,
  questionId: Id<"questions">,
): Promise<Doc<"questions">> {
  const question = await ctx.db.get("questions", questionId);
  if (!question || question.versionId !== versionId) fail("NOT_FOUND");
  return question;
}

/** A question's key rows (normally one; a stray duplicate is cleaned up too). */
async function keysOf(ctx: ReaderCtx, questionId: Id<"questions">) {
  return await ctx.db
    .query("answerKeys")
    .withIndex("by_question", (q) => q.eq("questionId", questionId))
    .take(10);
}

/** A version's questions grouped by section, each in `order`. */
async function readSections(ctx: ReaderCtx, versionId: Id<"examVersions">) {
  const rows = await ctx.db
    .query("questions")
    .withIndex("by_version_section_order", (q) => q.eq("versionId", versionId))
    .take(MAX_VERSION_QUESTIONS + 1);
  if (rows.length > MAX_VERSION_QUESTIONS)
    invalid(`version: more than ${MAX_VERSION_QUESTIONS} questions`);
  const sections: Record<Section, Doc<"questions">[]> = { pbqA: [], pbqB: [], mcq: [] };
  for (const row of rows) sections[row.section].push(row); // index order is `order`
  return sections;
}

/** "1".."n" for set A, "B1".."Bn" for set B, MCQs numbered on after set A (as seeded). */
export function displayNumberOf(section: Section, index: number, setACount: number): string {
  if (section === "pbqB") return `B${index + 1}`;
  if (section === "mcq") return String(setACount + index + 1);
  return String(index + 1);
}

/**
 * Rewrite `order` (1..n per section, dense) and `displayNumber` for every
 * question, in the order given, patching only rows that change. Bounded by
 * `MAX_VERSION_QUESTIONS` (`readSections`).
 */
async function renumber(ctx: MutationCtx, sections: Record<Section, Doc<"questions">[]>) {
  const setACount = sections.pbqA.length;
  for (const section of SECTIONS) {
    const rows = sections[section];
    for (const [i, row] of rows.entries()) {
      const order = i + 1;
      const displayNumber = displayNumberOf(section, i, setACount);
      if (row.order !== order || row.displayNumber !== displayNumber)
        await ctx.db.patch("questions", row._id, { order, displayNumber });
    }
  }
}

async function touch(ctx: MutationCtx, versionId: Id<"examVersions">) {
  await ctx.db.patch("examVersions", versionId, { updatedAt: Date.now() });
}

/**
 * Add a question (no `questionId`: appended to its section) or replace one,
 * together with its answer key, in one transaction (ED-8, ED-9). Draft only
 * (`requireEditableDraft`). Bad input fails `VALIDATION_FAILED` with
 * `path: message` issues and writes nothing. Moving a question to another
 * section appends it there. `totalPoints` is left for publish (ED-10).
 */
export const saveQuestion = mutation({
  args: {
    versionId: v.id("examVersions"),
    questionId: v.optional(v.id("questions")),
    question: questionInputValidator,
    key: keyInputValidator,
  },
  returns: v.object({ questionId: v.id("questions"), displayNumber: v.string() }),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, ["tutor"]);
    const version = await requireEditableDraft(ctx, profile, args.versionId);
    const existing =
      args.questionId === undefined
        ? null
        : await requireQuestionIn(ctx, version._id, args.questionId);
    const checked = checkQuestion(args.question, args.key);
    if (!checked.ok) invalid(...checked.issues);
    const { question, key } = checked.value;

    let questionId: Id<"questions">;
    let displayNumber: string;
    if (existing && existing.section === question.section) {
      // Same place: replace the content, keep order and number.
      questionId = existing._id;
      displayNumber = existing.displayNumber;
      await ctx.db.replace("questions", questionId, {
        ...question,
        versionId: version._id,
        order: existing.order,
        displayNumber,
      });
    } else {
      // New, or moved to another section: append, then renumber.
      const sections = await readSections(ctx, version._id);
      if (
        !existing &&
        SECTIONS.reduce((n, s) => n + sections[s].length, 0) >= MAX_VERSION_QUESTIONS
      )
        invalid(`version: at most ${MAX_VERSION_QUESTIONS} questions`);
      const fields = {
        ...question,
        versionId: version._id,
        order: (sections[question.section].at(-1)?.order ?? 0) + 1,
        displayNumber: "", // set by renumber
      };
      if (existing) {
        questionId = existing._id;
        await ctx.db.replace("questions", questionId, fields);
        sections[existing.section] = sections[existing.section].filter((q) => q._id !== questionId);
      } else {
        questionId = await ctx.db.insert("questions", fields);
      }
      sections[question.section].push({ ...fields, _id: questionId, _creationTime: 0 });
      await renumber(ctx, sections);
      const index = sections[question.section].length - 1;
      displayNumber = displayNumberOf(question.section, index, sections.pbqA.length);
    }

    const [current, ...strays] = existing ? await keysOf(ctx, questionId) : [];
    for (const stray of strays) await ctx.db.delete("answerKeys", stray._id);
    const keyRow = { ...key, questionId, versionId: version._id };
    if (current) await ctx.db.replace("answerKeys", current._id, keyRow);
    else await ctx.db.insert("answerKeys", keyRow);

    await touch(ctx, version._id);
    return { questionId, displayNumber };
  },
});

/** Remove a question and its answer key from a draft, then close the gap in numbering. */
export const deleteQuestion = mutation({
  args: { versionId: v.id("examVersions"), questionId: v.id("questions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, ["tutor"]);
    const version = await requireEditableDraft(ctx, profile, args.versionId);
    const question = await requireQuestionIn(ctx, version._id, args.questionId);
    for (const key of await keysOf(ctx, question._id)) await ctx.db.delete("answerKeys", key._id);
    await ctx.db.delete("questions", question._id);
    await renumber(ctx, await readSections(ctx, version._id));
    await touch(ctx, version._id);
    return null;
  },
});

/**
 * Put one section of a draft in a new order. `questionIds` must list every
 * question of that section exactly once; `order` is rewritten 1..n and the
 * display numbers follow.
 */
export const reorder = mutation({
  args: {
    versionId: v.id("examVersions"),
    section: sectionValidator,
    questionIds: v.array(v.id("questions")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, ["tutor"]);
    const version = await requireEditableDraft(ctx, profile, args.versionId);
    if (args.questionIds.length > MAX_VERSION_QUESTIONS)
      invalid(`questionIds: at most ${MAX_VERSION_QUESTIONS} questions`);
    const sections = await readSections(ctx, version._id);
    const current = new Map(sections[args.section].map((q) => [q._id, q]));
    const issues: string[] = [];
    const seen = new Set<Id<"questions">>();
    args.questionIds.forEach((id, i) => {
      if (seen.has(id)) issues.push(`questionIds[${i}]: listed twice`);
      else if (!current.has(id)) issues.push(`questionIds[${i}]: not in section ${args.section}`);
      seen.add(id);
    });
    const missing = [...current.keys()].filter((id) => !seen.has(id)).length;
    if (missing > 0)
      issues.push(`questionIds: ${missing} question(s) of section ${args.section} not listed`);
    if (issues.length > 0) invalid(...issues);

    sections[args.section] = args.questionIds.map((id) => current.get(id)!);
    await renumber(ctx, sections);
    await touch(ctx, version._id);
    return null;
  },
});
