/**
 * Salus profiles: the role and status behind a Better Auth user (LLD §9.2).
 *
 * - `ensureAdmin` creates the single admin from `ADMIN_EMAIL` (AU-6). Run it
 *   after every deploy: `npx convex run profiles:ensureAdmin` (add `--prod`
 *   or rely on `CONVEX_DEPLOY_KEY` in CI). It is idempotent.
 * - `otpRequestAllowed`, `sessionAllowed` and `recordAuthEvent` back the
 *   Better Auth hooks in `auth.ts` (OTP gate, `session.create.before`, audit).
 * - `me` tells the browser who is signed in (route guards, header).
 * - `endSessions` signs a user out everywhere (tutor removal, AU-4).
 */
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  env,
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { createAuth } from "./auth";
import { writeAudit } from "./lib/audit";
import { getAuthUserId } from "./lib/guards";
import { tryRateLimit } from "./lib/rateLimits";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function profileByAuthUserId(
  ctx: Pick<QueryCtx, "db">,
  authUserId: string,
): Promise<Doc<"profiles"> | null> {
  return await ctx.db
    .query("profiles")
    .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId))
    .unique();
}

/** Profiles for an email, newest first. At most a few (a removed one plus a re-invited one). */
async function profilesByEmail(ctx: Pick<QueryCtx, "db">, email: string) {
  return await ctx.db
    .query("profiles")
    .withIndex("by_email", (q) => q.eq("email", email))
    .order("desc")
    .take(10);
}

/**
 * The email on the Better Auth user behind a profile, or null if the user is
 * gone. Better Auth looks codes up by this email, not the profile's, so the
 * two must agree or sign-in silently sends nothing.
 */
async function loginEmailOf(ctx: MutationCtx, authUserId: string): Promise<string | null> {
  const auth = await createAuth(ctx).$context;
  const user = await auth.internalAdapter.findUserById(authUserId);
  return user ? normalizeEmail(user.email) : null;
}

function adminEmailFromEnv(): string {
  const email = normalizeEmail(env.ADMIN_EMAIL ?? "");
  if (!email) {
    throw new ConvexError(
      "ADMIN_EMAIL is not set on this deployment. Set it with `npx convex env set ADMIN_EMAIL <email>` and run profiles:ensureAdmin again.",
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ConvexError(`ADMIN_EMAIL is not a valid email address: "${email}".`);
  }
  return email;
}

/**
 * Create the Better Auth user and the `admin` profile for `ADMIN_EMAIL` if
 * they don't exist yet (LLD §9.2, PRD AU-6). Safe to run on every deploy.
 *
 * Refuses (throws) when `ADMIN_EMAIL` is unset, when another email already
 * has the admin profile (Salus v1 has exactly one admin), or when the email
 * already belongs to a tutor. Returns `"created"` or `"exists"`.
 */
export const ensureAdmin = internalMutation({
  args: {},
  returns: v.object({
    status: v.union(v.literal("created"), v.literal("exists")),
    email: v.string(),
  }),
  handler: async (ctx) => {
    const email = adminEmailFromEnv();

    // Profiles are few (one admin, a handful of tutors), and the schema has
    // no role index, so a filtered scan is fine here.
    const admins = await ctx.db
      .query("profiles")
      .filter((q) => q.eq(q.field("role"), "admin"))
      .take(10);
    const other = admins.find((p) => p.email !== email);
    if (other) {
      throw new ConvexError(
        `Refusing to create a second admin: ${other.email} is already the admin (Salus supports one admin, AU-6).`,
      );
    }
    const admin = admins[0];
    if (admin) {
      const loginEmail = await loginEmailOf(ctx, admin.authUserId);
      if (loginEmail !== email) {
        throw new ConvexError(
          `The admin profile is ${email} but its login account is ${loginEmail ?? "missing"}, so sign-in codes can't be sent. Run profiles:repairAdminLogin to fix it.`,
        );
      }
      return { status: "exists" as const, email };
    }

    const sameEmail = await profilesByEmail(ctx, email);
    if (sameEmail.some((p) => p.status === "active")) {
      throw new ConvexError(
        `Refusing to make ${email} the admin: it already has an active tutor profile.`,
      );
    }

    // Sign-up is closed (`disableSignUp`), so create the user through the
    // server API, as invitations do (LLD §9.3, §18.1).
    const auth = await createAuth(ctx).$context;
    const existing = await auth.internalAdapter.findUserByEmail(email);
    const user =
      existing?.user ??
      (await auth.internalAdapter.createUser(
        { email, name: email, emailVerified: true },
        { method: "invitation" },
      ));
    await ctx.db.insert("profiles", {
      authUserId: user.id,
      email,
      role: "admin",
      status: "active",
      createdAt: Date.now(),
    });
    return { status: "created" as const, email };
  },
});

/**
 * Point the admin's login account at `ADMIN_EMAIL` when the two have drifted
 * apart (for example the profile's email was edited by hand). Dev repair tool:
 * `npx convex run profiles:repairAdminLogin`. Refuses if the admin profile
 * isn't `ADMIN_EMAIL`, or if another login account already uses that email.
 */
export const repairAdminLogin = internalMutation({
  args: {},
  returns: v.object({
    status: v.union(v.literal("repaired"), v.literal("ok")),
    email: v.string(),
  }),
  handler: async (ctx) => {
    const email = adminEmailFromEnv();
    const admin = (
      await ctx.db
        .query("profiles")
        .filter((q) => q.eq(q.field("role"), "admin"))
        .take(10)
    )[0];
    if (!admin) {
      throw new ConvexError("There is no admin profile yet. Run profiles:ensureAdmin instead.");
    }
    if (admin.email !== email) {
      throw new ConvexError(
        `The admin profile is ${admin.email}, not ADMIN_EMAIL (${email}). Set ADMIN_EMAIL to ${admin.email} first.`,
      );
    }
    const auth = await createAuth(ctx).$context;
    const user = await auth.internalAdapter.findUserById(admin.authUserId);
    if (!user) {
      throw new ConvexError("The admin profile's login account no longer exists.");
    }
    if (normalizeEmail(user.email) === email) return { status: "ok" as const, email };
    const taken = await auth.internalAdapter.findUserByEmail(email);
    if (taken && taken.user.id !== user.id) {
      throw new ConvexError(`Another login account already uses ${email}.`);
    }
    await auth.internalAdapter.updateUser(user.id, { email, name: email, emailVerified: true });
    return { status: "repaired" as const, email };
  },
});

/**
 * May a sign-in code be sent to `email`? (AU-3, LLD §9.1, §12.1)
 *
 * Spends one token from each limit whether or not the email has an account,
 * so a refused or unknown email looks the same as a known one from outside:
 *   - `otpRequestIp`: 30 per hour per client IP (`ipKey`, skipped when null),
 *   - `otpRequest`: 1 per 60 s and 5 per hour per email,
 * then requires an `active` profile. The caller answers the browser the same
 * way whatever this returns (no enumeration). An allowed request is audited
 * as `auth.otp_requested`; refused ones aren't, so strangers can't fill the
 * audit log.
 */
export const otpRequestAllowed = internalMutation({
  args: { email: v.string(), ipKey: v.union(v.string(), v.null()) },
  returns: v.boolean(),
  handler: async (ctx, { email, ipKey }) => {
    const normalized = normalizeEmail(email);
    if (ipKey !== null && !(await tryRateLimit(ctx, "otpRequestIp", ipKey))) return false;
    if (!(await tryRateLimit(ctx, "otpRequest", normalized))) return false;
    const active = (await profilesByEmail(ctx, normalized)).find((p) => p.status === "active");
    if (!active) return false;
    // Better Auth finds the user by its own email; if that has drifted from
    // the profile, no code would be sent. Say so in the logs (ids only).
    if ((await loginEmailOf(ctx, active.authUserId)) !== normalized) {
      console.error(
        `otpRequestAllowed: profile ${active._id} has a login account with a different email; no code can be sent (run profiles:repairAdminLogin for the admin).`,
      );
      return false;
    }
    await writeAudit(ctx, {
      action: "auth.otp_requested",
      // No actor: anyone who knows the email can ask for a code.
      target: normalized,
      ...(ipKey !== null ? { ipHash: ipKey } : {}),
    });
    return true;
  },
});

/**
 * May Better Auth create a session for this user? Only with an `active`
 * profile (LLD §9.2 `session.create.before`), so a removed tutor can't sign
 * back in even with a code they already hold.
 */
export const sessionAllowed = internalQuery({
  args: { authUserId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { authUserId }) => {
    return (await profileByAuthUserId(ctx, authUserId))?.status === "active";
  },
});

/**
 * Audit a sign-in event from the Better Auth hooks (LLD §12.2, AU-7).
 *
 * Identified by `authUserId` (sign-in, sign-out) or `email` (a failed code).
 * Events for an email or user without a Salus profile are dropped, so
 * guessing at unknown emails can't fill the audit log.
 */
export const recordAuthEvent = internalMutation({
  args: {
    action: v.union(
      v.literal("auth.signin"),
      v.literal("auth.signout"),
      v.literal("auth.otp_failed"),
    ),
    authUserId: v.optional(v.string()),
    email: v.optional(v.string()),
    /** Better Auth error code for `auth.otp_failed`, e.g. `INVALID_OTP`. */
    reason: v.optional(v.string()),
    ipKey: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { action, authUserId, email, reason, ipKey }) => {
    let profile: Doc<"profiles"> | null = null;
    if (authUserId !== undefined) profile = await profileByAuthUserId(ctx, authUserId);
    else if (email !== undefined) {
      const rows = await profilesByEmail(ctx, normalizeEmail(email));
      profile = rows.find((p) => p.status === "active") ?? rows[0] ?? null;
    }
    if (!profile) return null;
    await writeAudit(ctx, {
      action,
      // A failed code may come from anyone who knows the email: no actor.
      ...(action === "auth.otp_failed" ? {} : { actorId: profile._id }),
      target: profile.email,
      ...(reason !== undefined ? { meta: { reason: reason.slice(0, 64) } } : {}),
      ...(ipKey !== null ? { ipHash: ipKey } : {}),
    });
    return null;
  },
});

/**
 * The signed-in user's profile for the browser (route guards, header), or
 * `null` when signed out or without a profile. Never includes ids or
 * secrets. A `removed` profile is returned as such; callers treat anything
 * but `active` as no access.
 */
export const me = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      role: v.union(v.literal("admin"), v.literal("tutor")),
      name: v.union(v.string(), v.null()),
      email: v.string(),
      status: v.union(v.literal("active"), v.literal("removed")),
    }),
  ),
  handler: async (ctx) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) return null;
    const profile = await profileByAuthUserId(ctx, authUserId);
    if (!profile) return null;
    return {
      role: profile.role,
      name: profile.name ?? null,
      email: profile.email,
      status: profile.status,
    };
  },
});

/**
 * Delete every Better Auth session of `authUserId`, signing them out on
 * every device at once (AU-4, LLD §9.2 "Remove tutor"). `getAuthUserId`
 * checks the session behind each Convex token, so their open tabs lose
 * access on the next query; `sessionAllowed` stops new sign-ins while the
 * profile is `removed`. Used by `admin.removeTutor` (T-406).
 */
export async function endSessions(ctx: MutationCtx, authUserId: string): Promise<void> {
  const auth = await createAuth(ctx).$context;
  await auth.internalAdapter.deleteUserSessions(authUserId);
}
