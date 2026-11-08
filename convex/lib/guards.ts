/**
 * Role and ownership guards for tutor and admin functions (LLD §5.4, PRD SE-2).
 *
 * Every tutor or admin function starts with `requireProfile`; every class (or
 * class attempt) access then goes through `requireClassOwner`. Records owned by
 * someone else throw `NOT_FOUND`, not `FORBIDDEN`, so their existence isn't
 * revealed.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { authComponent } from "../auth";
import { fail } from "./errors";

export type Role = Doc<"profiles">["role"];

type ReaderCtx = QueryCtx | MutationCtx;

/**
 * The Better Auth user id behind the current request, or `null`.
 *
 * Goes through the component rather than trusting the JWT alone: the
 * session named in the token must still exist and be unexpired, so deleting
 * a removed tutor's sessions signs them out at once (AU-4). A token without
 * a `sessionId` claim (not one Better Auth issued) counts as signed out.
 */
export async function getAuthUserId(ctx: ReaderCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (typeof identity?.sessionId !== "string") return null;
  return (await authComponent.safeGetAuthUser(ctx))?._id ?? null;
}

/**
 * The caller's active profile, if its role is in `roles`. Admin passes every
 * check. Throws `UNAUTHENTICATED` without a session and `FORBIDDEN` for a
 * missing, removed or under-privileged profile.
 */
export async function requireProfile(
  ctx: ReaderCtx,
  roles: readonly Role[],
): Promise<Doc<"profiles">> {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) fail("UNAUTHENTICATED");
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId))
    .unique();
  if (!profile || profile.status !== "active") fail("FORBIDDEN");
  if (profile.role !== "admin" && !roles.includes(profile.role)) fail("FORBIDDEN");
  return profile;
}

/** The class if `profile` owns it (or is admin); otherwise `NOT_FOUND`. */
export async function requireClassOwner(
  ctx: Pick<QueryCtx, "db">,
  profile: Doc<"profiles">,
  classId: Id<"classes">,
): Promise<Doc<"classes">> {
  const cls = await ctx.db.get("classes", classId);
  if (!cls || (cls.tutorId !== profile._id && profile.role !== "admin")) fail("NOT_FOUND");
  return cls;
}
