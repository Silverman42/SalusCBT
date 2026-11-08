/**
 * Admin controls over tutors and data (LLD §5.3, §9.2; PRD AU-4, AU-5,
 * AU-7, PR-5). Every function here is admin-only: `requireProfile(ctx,
 * ["admin"])` throws `UNAUTHENTICATED` without a session and `FORBIDDEN` for
 * a tutor. Invitations live in `invitations.ts`.
 */
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  deleteAttempts as deleteAttemptsCascade,
  MAX_DELETE_ATTEMPTS,
} from "./lib/attemptDeletion";
import { writeAudit } from "./lib/audit";
import { fail } from "./lib/errors";
import { requireProfile } from "./lib/guards";
import { endSessions } from "./profiles";

/** Upper bound on `admin.tutors`; Salus expects a handful of tutors. */
export const MAX_TUTORS = 500;

const tutorRow = v.object({
  profileId: v.id("profiles"),
  email: v.string(),
  name: v.union(v.string(), v.null()),
  status: v.union(v.literal("active"), v.literal("removed")),
  createdAt: v.number(),
});

const auditRow = v.object({
  id: v.id("auditLog"),
  at: v.number(),
  action: v.string(),
  /** Email of the acting profile; `null` for system or anonymous events. */
  actorEmail: v.union(v.string(), v.null()),
  target: v.union(v.string(), v.null()),
  meta: v.union(v.any(), v.null()),
});

/** Every tutor profile, active and removed, newest first (AU-5). */
export const tutors = query({
  args: {},
  returns: v.array(tutorRow),
  handler: async (ctx) => {
    await requireProfile(ctx, ["admin"]);
    // Profiles are few and the schema has no role index (as in
    // `profiles.ensureAdmin`), so a bounded, filtered scan is fine.
    const rows = await ctx.db
      .query("profiles")
      .order("desc")
      .filter((q) => q.eq(q.field("role"), "tutor"))
      .take(MAX_TUTORS);
    return rows.map((p) => ({
      profileId: p._id,
      email: p.email,
      name: p.name ?? null,
      status: p.status,
      createdAt: p.createdAt,
    }));
  },
});

/** The tutor profile `profileId`; `NOT_FOUND` if missing, `FORBIDDEN` for the admin. */
async function requireTutor(ctx: MutationCtx, profileId: Id<"profiles">): Promise<Doc<"profiles">> {
  const profile = await ctx.db.get("profiles", profileId);
  if (!profile) fail("NOT_FOUND");
  // Covers the admin removing themselves: the admin profile is never changed here.
  if (profile.role !== "tutor") fail("FORBIDDEN");
  return profile;
}

/**
 * Remove a tutor (LLD §9.2, AU-4): `status = removed` and every Better Auth
 * session deleted in the same mutation, so their next call fails and they
 * can't sign in again (`profiles.sessionAllowed`). Their classes stay.
 * Idempotent: removing a removed tutor ends any sessions but writes no audit.
 */
export const removeTutor = mutation({
  args: { profileId: v.id("profiles") },
  returns: v.null(),
  handler: async (ctx, { profileId }) => {
    const admin = await requireProfile(ctx, ["admin"]);
    const tutor = await requireTutor(ctx, profileId);
    await endSessions(ctx, tutor.authUserId);
    if (tutor.status === "removed") return null;
    await ctx.db.patch("profiles", profileId, { status: "removed" });
    await writeAudit(ctx, { actorId: admin._id, action: "tutor.removed", target: tutor.email });
    return null;
  },
});

/**
 * Restore a removed tutor to `active` (LLD §9.2); they sign in again by code.
 * `VALIDATION_FAILED` if another active profile now has the same email (the
 * tutor was re-invited), since an email may have only one active profile.
 * Idempotent for an active tutor.
 */
export const restoreTutor = mutation({
  args: { profileId: v.id("profiles") },
  returns: v.null(),
  handler: async (ctx, { profileId }) => {
    const admin = await requireProfile(ctx, ["admin"]);
    const tutor = await requireTutor(ctx, profileId);
    if (tutor.status === "active") return null;
    const sameEmail = await ctx.db
      .query("profiles")
      .withIndex("by_email", (q) => q.eq("email", tutor.email))
      .take(10);
    if (sameEmail.some((p) => p._id !== profileId && p.status === "active")) {
      fail("VALIDATION_FAILED");
    }
    await ctx.db.patch("profiles", profileId, { status: "active" });
    await writeAudit(ctx, { actorId: admin._id, action: "tutor.restored", target: tutor.email });
    return null;
  },
});

/**
 * The audit log, newest first, for `usePaginatedQuery` (AU-7). Rows carry
 * the actor's email instead of ids; `ipHash` is never returned.
 */
export const audit = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(auditRow),
  handler: async (ctx, { paginationOpts }) => {
    await requireProfile(ctx, ["admin"]);
    const result = await ctx.db
      .query("auditLog")
      .withIndex("by_at")
      .order("desc")
      .paginate(paginationOpts);
    const emails = new Map<Id<"profiles">, string | null>();
    const page = [];
    for (const row of result.page) {
      let actorEmail: string | null = null;
      if (row.actorId !== undefined) {
        if (!emails.has(row.actorId)) {
          emails.set(row.actorId, (await ctx.db.get("profiles", row.actorId))?.email ?? null);
        }
        actorEmail = emails.get(row.actorId) ?? null;
      }
      page.push({
        id: row._id,
        at: row.at,
        action: row.action,
        actorEmail,
        target: row.target ?? null,
        meta: row.meta ?? null,
      });
    }
    return { ...result, page };
  },
});

/**
 * Delete any attempts, with or without a class (PR-5), together with their
 * responses and share links. At most `MAX_DELETE_ATTEMPTS` ids per call
 * (`VALIDATION_FAILED` otherwise); ids already gone are skipped. Writes one
 * `attempt.deleted` audit entry with the count when anything was deleted.
 */
export const deleteAttempts = mutation({
  args: { attemptIds: v.array(v.id("attempts")) },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, { attemptIds }) => {
    const admin = await requireProfile(ctx, ["admin"]);
    if (attemptIds.length > MAX_DELETE_ATTEMPTS) fail("VALIDATION_FAILED");
    const deleted = await deleteAttemptsCascade(ctx, attemptIds);
    if (deleted > 0) {
      await writeAudit(ctx, {
        actorId: admin._id,
        action: "attempt.deleted",
        meta: { count: deleted },
      });
    }
    return { deleted };
  },
});
