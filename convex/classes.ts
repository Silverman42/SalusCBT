/**
 * Classes (LLD §5.1 `lookupCode`, §5.2; PRD CL-1 to CL-4, EX-21).
 *
 * - `create` / `update` / `mine` are tutor functions (admin passes every
 *   tutor check). A class owned by someone else is `NOT_FOUND`.
 * - `lookupCode` is public, for the start screen. It reveals only the class
 *   name and whether it accepts new attempts.
 *
 * Closing a class only stops new attempts (`attempts.start` refuses
 * `CLASS_CLOSED`); existing attempts and results are untouched (CL-2).
 * Changing a class's version likewise affects only new attempts, because
 * each attempt stores its own `versionId`.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { allocateClassCode } from "./lib/classCodes";
import { normaliseClassCode } from "./lib/codes";
import { fail } from "./lib/errors";
import { requireClassOwner, requireProfile } from "./lib/guards";

/** EX-21: standard time or one of the extra-time accommodations. */
export const TIME_MULTIPLIERS = [1, 1.25, 1.5, 2] as const;

export const CLASS_NAME_MAX = 80;

/** Longer than any real code (`SEC-XXXX`); matches `attempts.start`. */
const CODE_INPUT_MAX = 32;

/** Upper bound on `mine` (admin sees every class). */
const MINE_LIMIT = 500;

const classStatus = v.union(v.literal("open"), v.literal("closed"));

const classSummary = v.object({
  classId: v.id("classes"),
  name: v.string(),
  code: v.string(),
  status: classStatus,
  versionId: v.id("examVersions"),
  versionLabel: v.string(),
  timeMultiplier: v.number(),
  tutorId: v.id("profiles"),
  createdAt: v.number(),
});

function cleanName(input: string): string {
  const name = input.trim();
  if (name.length === 0 || name.length > CLASS_NAME_MAX) fail("VALIDATION_FAILED");
  return name;
}

function checkMultiplier(m: number): number {
  if (!(TIME_MULTIPLIERS as readonly number[]).includes(m)) fail("VALIDATION_FAILED");
  return m;
}

/**
 * A version the caller may give a class (CL-3): published, and either one of
 * the caller's own versions or a default (admin-managed, no owner) version.
 * The admin may use any published version. Otherwise `NOT_FOUND`.
 */
async function usableVersion(
  ctx: Pick<QueryCtx, "db">,
  profile: Doc<"profiles">,
  versionId: Id<"examVersions">,
): Promise<Doc<"examVersions">> {
  const version = await ctx.db.get("examVersions", versionId);
  if (!version || version.status !== "published") fail("NOT_FOUND");
  const allowed =
    profile.role === "admin" || version.ownerId === undefined || version.ownerId === profile._id;
  if (!allowed) fail("NOT_FOUND");
  return version;
}

export const create = mutation({
  args: {
    name: v.string(),
    versionId: v.id("examVersions"),
    timeMultiplier: v.optional(v.number()),
  },
  returns: v.object({ classId: v.id("classes"), code: v.string() }),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, ["tutor"]);
    const name = cleanName(args.name);
    const timeMultiplier = checkMultiplier(args.timeMultiplier ?? 1);
    await usableVersion(ctx, profile, args.versionId);
    const code = await allocateClassCode(ctx);
    const classId = await ctx.db.insert("classes", {
      tutorId: profile._id,
      name,
      code,
      versionId: args.versionId,
      timeMultiplier,
      status: "open",
      createdAt: Date.now(),
    });
    await writeAudit(ctx, {
      actorId: profile._id,
      action: "class.created",
      target: classId,
      meta: { code, versionId: args.versionId, timeMultiplier },
    });
    return { classId, code };
  },
});

export const update = mutation({
  args: {
    classId: v.id("classes"),
    name: v.optional(v.string()),
    versionId: v.optional(v.id("examVersions")),
    status: v.optional(classStatus),
    timeMultiplier: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, ["tutor"]);
    const cls = await requireClassOwner(ctx, profile, args.classId);
    const patch: Partial<Pick<Doc<"classes">, "name" | "versionId" | "status" | "timeMultiplier">> =
      {};
    if (args.name !== undefined) patch.name = cleanName(args.name);
    if (args.timeMultiplier !== undefined) {
      patch.timeMultiplier = checkMultiplier(args.timeMultiplier);
    }
    if (args.versionId !== undefined && args.versionId !== cls.versionId) {
      await usableVersion(ctx, profile, args.versionId);
      patch.versionId = args.versionId;
    }
    if (args.status !== undefined) patch.status = args.status;
    if (Object.keys(patch).length > 0) await ctx.db.patch("classes", cls._id, patch);
    if (cls.status === "open" && args.status === "closed") {
      await writeAudit(ctx, { actorId: profile._id, action: "class.closed", target: cls._id });
    }
    return null;
  },
});

/** The caller's classes, newest first. The admin sees every class. */
export const mine = query({
  args: {},
  returns: v.array(classSummary),
  handler: async (ctx) => {
    const profile = await requireProfile(ctx, ["tutor"]);
    const classes =
      profile.role === "admin"
        ? await ctx.db.query("classes").order("desc").take(MINE_LIMIT)
        : await ctx.db
            .query("classes")
            .withIndex("by_tutor", (q) => q.eq("tutorId", profile._id))
            .order("desc")
            .take(MINE_LIMIT);
    const labels = new Map<Id<"examVersions">, string>();
    for (const c of classes) {
      if (!labels.has(c.versionId)) {
        labels.set(c.versionId, (await ctx.db.get("examVersions", c.versionId))?.label ?? "");
      }
    }
    return classes.map((c) => ({
      classId: c._id,
      name: c.name,
      code: c.code,
      status: c.status,
      versionId: c.versionId,
      versionLabel: labels.get(c.versionId) ?? "",
      timeMultiplier: c.timeMultiplier,
      tutorId: c.tutorId,
      createdAt: c.createdAt,
    }));
  },
});

/**
 * Public start-screen lookup: `{ name, open }` or `null` for an unknown code.
 * Same normalisation as `attempts.start`. `open` is false when the class is
 * closed or its version is no longer published, i.e. exactly when a start
 * would be refused for the class itself. Every class needs a display name
 * (CL-4), so the screen needs no extra flag for it.
 */
export const lookupCode = query({
  args: { code: v.string() },
  returns: v.union(v.null(), v.object({ name: v.string(), open: v.boolean() })),
  handler: async (ctx, args) => {
    if (args.code.length > CODE_INPUT_MAX) return null;
    const code = normaliseClassCode(args.code);
    if (code.length === 0) return null;
    const cls = await ctx.db
      .query("classes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (!cls) return null;
    const version = await ctx.db.get("examVersions", cls.versionId);
    return { name: cls.name, open: cls.status === "open" && version?.status === "published" };
  },
});
