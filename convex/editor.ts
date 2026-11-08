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
 * SE-1: answer keys are returned by `getDraft` only, and only to the version's
 * author (a tutor's own version, or any version for the admin). No student
 * path reaches this module.
 */
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { fail } from "./lib/errors";
import { requireProfile } from "./lib/guards";
import schema from "./schema";

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
