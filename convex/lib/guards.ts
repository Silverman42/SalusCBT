/**
 * Role and ownership guards for tutor and admin functions (LLD §5.4, PRD SE-2).
 *
 * Every tutor or admin function starts with `requireProfile`; every class (or
 * class attempt) access then goes through `requireClassOwner`. Records owned by
 * someone else throw `NOT_FOUND`, not `FORBIDDEN`, so their existence isn't
 * revealed.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { fail } from "./errors";

export type Role = Doc<"profiles">["role"];

type ReaderCtx = Pick<QueryCtx, "db" | "auth">;

/**
 * The Better Auth user id behind the current request, or `null`.
 *
 * SEAM (T-402): Better Auth isn't configured yet, so this reads the JWT
 * subject directly. The Convex plugin issues JWTs whose `sub` is the Better
 * Auth user id (`@convex-dev/better-auth` does the same in `safeGetAuthUser`).
 * When `convex/auth.ts` lands, replace the body with
 * `(await authComponent.safeGetAuthUser(ctx))?._id ?? null`, which also checks
 * that the session still exists and hasn't expired (AU-4). Until then a removed
 * tutor is still refused by the `status` check below.
 */
export async function getAuthUserId(ctx: Pick<QueryCtx, "auth">): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
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
