/**
 * Oral questions (LLD §5.1 `content.oralQuestions`; PRD CL-10).
 *
 * After an exam a tutor reads the version's oral questions aloud one at a
 * time and reveals each model answer on click (`/oral`).
 *
 * Access: tutor (admin passes). LLD §5.1 lists this query as public, but the
 * model answers are marking material, and the leak test (T-209) treats them
 * as key values that no student-reachable function may return. So it uses the
 * editor's ED-5 visibility: a tutor's own versions and the published default
 * versions (which covers every class version a tutor can pick, CL-1); every
 * version for the admin. Anything else is `NOT_FOUND`.
 */
import { v } from "convex/values";
import { query } from "./_generated/server";
import { DEFAULT_EXAM_SLUG } from "./attempts";
import { MAX_VERSION_ORAL, requireVisibleVersion } from "./editor";
import { requireProfile } from "./lib/guards";

export const oralQuestionValidator = v.object({
  order: v.number(),
  question: v.string(),
  modelAnswer: v.string(),
});

export const oralSetValidator = v.object({
  versionId: v.id("examVersions"),
  label: v.string(),
  versionNo: v.number(),
  /** The default exam line (admin-managed), rather than a tutor's own version. */
  isDefault: v.boolean(),
  questions: v.array(oralQuestionValidator),
});

/**
 * The oral questions of `versionId`, in order, with their model answers.
 * Without `versionId`, the default exam's current version; `null` when no
 * default exam has been imported yet.
 */
export const oralQuestions = query({
  args: { versionId: v.optional(v.id("examVersions")) },
  returns: v.union(oralSetValidator, v.null()),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, ["tutor"]);
    let versionId = args.versionId;
    if (versionId === undefined) {
      const exam = await ctx.db
        .query("exams")
        .withIndex("by_slug", (q) => q.eq("slug", DEFAULT_EXAM_SLUG))
        .unique();
      if (!exam?.defaultVersionId) return null;
      versionId = exam.defaultVersionId;
    }
    const version = await requireVisibleVersion(ctx, profile, versionId);
    const rows = await ctx.db
      .query("oralQuestions")
      .withIndex("by_version", (q) => q.eq("versionId", version._id))
      .take(MAX_VERSION_ORAL);
    return {
      versionId: version._id,
      label: version.label,
      versionNo: version.versionNo,
      isDefault: version.ownerId === undefined,
      questions: rows.map(({ order, question, modelAnswer }) => ({ order, question, modelAnswer })),
    };
  },
});
