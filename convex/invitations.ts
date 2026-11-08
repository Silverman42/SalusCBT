/**
 * Invitation-only tutor registration (LLD §9.3, §5.3, PRD AU-5, AU-7).
 *
 * - The admin creates, lists, resends and cancels invitations. Each one has a
 *   fresh 32-byte random token; only `sha256(token)` is stored. The raw token
 *   exists only in the emailed link `${SITE_URL}/invite/<token>`.
 * - A link is valid for 7 days and works once. Resending issues a new token
 *   (the old link stops working) and a new 7-day window.
 * - `peek` (public) shows the invited email on the invite page; `accept`
 *   (public) creates the Better Auth user and the tutor profile and marks the
 *   invitation accepted, all in one transaction (`redeem`).
 * - An unknown, expired, cancelled or already-used token gives the same
 *   answer everywhere: `peek` → `{ email: null, valid: false }`, `accept` →
 *   `NOT_FOUND`, so a link reveals nothing once it stops working.
 * - Expiry is materialised (no clock reads in queries): each invitation
 *   schedules `expireOne` at its `expiresAt`, and the daily `expireInvitations`
 *   cron (`crons.ts`, LLD §12.3) sweeps anything left over. `redeem` also
 *   checks `expiresAt` itself, so a late job can never let an old link in.
 */
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  env,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { createAuth } from "./auth";
import { invitation as invitationEmail } from "./email/templates";
import { writeAudit } from "./lib/audit";
import { randomToken, sha256Hex } from "./lib/codes";
import { fail } from "./lib/errors";
import { requireProfile } from "./lib/guards";
import { enforceRateLimit } from "./lib/rateLimits";
import { normalizeEmail } from "./profiles";

const DAY_MS = 24 * 60 * 60 * 1000;

/** LLD §9.3: links last 7 days. */
export const INVITATION_TTL_MS = 7 * DAY_MS;

/** `randomToken(32)`: 43 base64url characters. Anything else is unknown. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** RFC 5321 path limit. */
const EMAIL_MAX = 254;

/** The admin list shows at most this many invitations, newest first. */
export const LIST_LIMIT = 200;

/** Cron batch size; a full batch reschedules itself. */
const EXPIRE_BATCH = 200;

const statusValidator = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("cancelled"),
  v.literal("expired"),
);

/**
 * `VALIDATION_FAILED` with a reason the admin UI can show:
 * `INVALID_EMAIL`, `ALREADY_ACTIVE` (the email has an active profile) or
 * `NOT_PENDING` (cancel/resend on an accepted or cancelled invitation).
 * `errorCodeOf` reads the code from this `{ code, reason }` shape.
 */
export type InvitationRefusal = "INVALID_EMAIL" | "ALREADY_ACTIVE" | "NOT_PENDING";

function refuse(reason: InvitationRefusal): never {
  throw new ConvexError({ code: "VALIDATION_FAILED", reason });
}

function validEmail(raw: string): string {
  const email = normalizeEmail(raw);
  if (email.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    refuse("INVALID_EMAIL");
  }
  return email;
}

async function hasActiveProfile(ctx: Pick<QueryCtx, "db">, email: string) {
  const rows = await ctx.db
    .query("profiles")
    .withIndex("by_email", (q) => q.eq("email", email))
    .take(10);
  return rows.some((p) => p.status === "active");
}

function inviteLink(token: string): string {
  const base = env.SITE_URL.replace(/\/+$/, "");
  return `${base}/invite/${token}`;
}

/**
 * Give `invitation` a new token and expiry, schedule its expiry job and the
 * email. Returns nothing secret: the raw token leaves only inside the email.
 */
async function issueToken(
  ctx: MutationCtx,
  admin: Doc<"profiles">,
  email: string,
): Promise<{ tokenHash: string; expiresAt: number }> {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = Date.now() + INVITATION_TTL_MS;
  const link = inviteLink(token);
  // Built before any write is scheduled, so a bad SITE_URL fails the mutation.
  const message = invitationEmail({ to: email, link, invitedBy: admin.name ?? admin.email });
  await ctx.scheduler.runAfter(0, internal.email.send.send, message);
  await ctx.scheduler.runAt(expiresAt, internal.invitations.expireOne, { tokenHash });
  return { tokenHash, expiresAt };
}

async function loadInvitation(ctx: Pick<QueryCtx, "db">, id: Id<"invitations">) {
  const inv = await ctx.db.get("invitations", id);
  if (!inv) fail("NOT_FOUND");
  return inv;
}

/**
 * Invite `email` as a tutor (admin only). Lower-cases and validates the
 * email, refuses one with an active profile, cancels earlier pending
 * invitations for it, then emails a new link. 50 per admin per day
 * (`invitationCreate`, shared with `resend`).
 */
export const create = mutation({
  args: { email: v.string() },
  returns: v.object({ invitationId: v.id("invitations"), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const admin = await requireProfile(ctx, ["admin"]);
    const email = validEmail(args.email);
    if (await hasActiveProfile(ctx, email)) refuse("ALREADY_ACTIVE");
    await enforceRateLimit(ctx, "invitationCreate", admin._id);

    const older = await ctx.db
      .query("invitations")
      .withIndex("by_email_status", (q) => q.eq("email", email).eq("status", "pending"))
      .take(50);
    for (const inv of older) {
      await ctx.db.patch("invitations", inv._id, { status: "cancelled" });
      await writeAudit(ctx, {
        actorId: admin._id,
        action: "invite.cancelled",
        target: email,
        meta: { invitationId: inv._id, reason: "superseded" },
      });
    }

    const { tokenHash, expiresAt } = await issueToken(ctx, admin, email);
    const invitationId = await ctx.db.insert("invitations", {
      email,
      tokenHash,
      invitedBy: admin._id,
      expiresAt,
      status: "pending",
      createdAt: Date.now(),
    });
    await writeAudit(ctx, {
      actorId: admin._id,
      action: "invite.created",
      target: email,
      meta: { invitationId },
    });
    return { invitationId, expiresAt };
  },
});

/** Invitations, newest first, at most `LIST_LIMIT` (admin only). No tokens or hashes. */
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      invitationId: v.id("invitations"),
      email: v.string(),
      status: statusValidator,
      createdAt: v.number(),
      expiresAt: v.number(),
      acceptedAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    await requireProfile(ctx, ["admin"]);
    const rows = await ctx.db.query("invitations").order("desc").take(LIST_LIMIT);
    return rows.map((inv) => ({
      invitationId: inv._id,
      email: inv.email,
      status: inv.status,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
      acceptedAt: inv.acceptedAt ?? null,
    }));
  },
});

/**
 * Email a new link for a pending (or expired) invitation (admin only). The
 * old token stops working at once; the new one is valid for 7 days.
 * Rate-limited with `create` (`invitationCreate`, 50 per admin per day).
 */
export const resend = mutation({
  args: { invitationId: v.id("invitations") },
  returns: v.object({ expiresAt: v.number() }),
  handler: async (ctx, { invitationId }) => {
    const admin = await requireProfile(ctx, ["admin"]);
    const inv = await loadInvitation(ctx, invitationId);
    if (inv.status !== "pending" && inv.status !== "expired") refuse("NOT_PENDING");
    if (await hasActiveProfile(ctx, inv.email)) refuse("ALREADY_ACTIVE");
    await enforceRateLimit(ctx, "invitationCreate", admin._id);

    const { tokenHash, expiresAt } = await issueToken(ctx, admin, inv.email);
    await ctx.db.patch("invitations", invitationId, { tokenHash, expiresAt, status: "pending" });
    await writeAudit(ctx, {
      actorId: admin._id,
      action: "invite.resent",
      target: inv.email,
      meta: { invitationId },
    });
    return { expiresAt };
  },
});

/** Cancel a pending invitation (admin only); its link stops working. Cancelling twice is a no-op. */
export const cancel = mutation({
  args: { invitationId: v.id("invitations") },
  returns: v.null(),
  handler: async (ctx, { invitationId }) => {
    const admin = await requireProfile(ctx, ["admin"]);
    const inv = await loadInvitation(ctx, invitationId);
    if (inv.status === "cancelled") return null;
    if (inv.status !== "pending" && inv.status !== "expired") refuse("NOT_PENDING");
    await ctx.db.patch("invitations", invitationId, { status: "cancelled" });
    await writeAudit(ctx, {
      actorId: admin._id,
      action: "invite.cancelled",
      target: inv.email,
      meta: { invitationId },
    });
    return null;
  },
});

/** The invitation a raw token names, or null (malformed or unknown). */
async function byToken(
  ctx: Pick<QueryCtx, "db">,
  token: string,
): Promise<Doc<"invitations"> | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const tokenHash = await sha256Hex(token);
  return await ctx.db
    .query("invitations")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
}

/**
 * For `/invite/[token]` (public): the invited email while the link still
 * works, else `{ email: null, valid: false }` (unknown, used, cancelled and
 * expired links look the same). `valid` follows `status`, which the expiry
 * job flips at `expiresAt`; `accept` re-checks the time itself.
 */
export const peek = query({
  args: { token: v.string() },
  returns: v.object({ email: v.union(v.string(), v.null()), valid: v.boolean() }),
  handler: async (ctx, { token }) => {
    const inv = await byToken(ctx, token);
    if (!inv || inv.status !== "pending") return { email: null, valid: false };
    return { email: inv.email, valid: true };
  },
});

/**
 * Redeem `token` in one transaction: create (or reuse) the Better Auth user,
 * create the tutor profile (or reactivate the email's removed one), mark the
 * invitation accepted, audit `invite.accepted`. `NOT_FOUND` for any token
 * that doesn't work, including when the email has meanwhile become active.
 */
export const redeem = internalMutation({
  args: { token: v.string() },
  returns: v.object({ email: v.string() }),
  handler: async (ctx, { token }) => {
    const inv = await byToken(ctx, token);
    const now = Date.now();
    if (!inv || inv.status !== "pending" || inv.expiresAt <= now) fail("NOT_FOUND");
    const email = inv.email;
    if (await hasActiveProfile(ctx, email)) fail("NOT_FOUND");

    // Sign-up is closed (`disableSignUp`), so the user is created through the
    // server API, as `profiles.ensureAdmin` does (LLD §9.3 step 5).
    const auth = await createAuth(ctx).$context;
    const existing = await auth.internalAdapter.findUserByEmail(email);
    const user =
      existing?.user ??
      (await auth.internalAdapter.createUser(
        { email, name: email, emailVerified: true },
        { method: "invitation" },
      ));

    // A re-invited, removed tutor keeps their profile (and classes):
    // `profiles.by_authUserId` must stay unique.
    const previous = await ctx.db
      .query("profiles")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", user.id))
      .unique();
    let profileId: Id<"profiles">;
    if (previous) {
      if (previous.role !== "tutor") fail("NOT_FOUND");
      await ctx.db.patch("profiles", previous._id, { status: "active", email });
      profileId = previous._id;
    } else {
      profileId = await ctx.db.insert("profiles", {
        authUserId: user.id,
        email,
        role: "tutor",
        status: "active",
        createdAt: now,
      });
    }

    await ctx.db.patch("invitations", inv._id, { status: "accepted", acceptedAt: now });
    await writeAudit(ctx, {
      actorId: profileId,
      action: "invite.accepted",
      target: email,
      meta: { invitationId: inv._id },
    });
    return { email };
  },
});

/**
 * Accept an invitation (public, LLD §5.3). Returns the email, which the
 * page then asks a sign-in code for. Throws `NOT_FOUND` for a link that
 * doesn't work.
 */
export const accept = action({
  args: { token: v.string() },
  returns: v.object({ email: v.string() }),
  handler: async (ctx, { token }): Promise<{ email: string }> => {
    return await ctx.runMutation(internal.invitations.redeem, { token });
  },
});

/** Scheduled at `expiresAt`. A resend changes the hash, so its old job does nothing. */
export const expireOne = internalMutation({
  args: { tokenHash: v.string() },
  returns: v.null(),
  handler: async (ctx, { tokenHash }) => {
    const inv = await ctx.db
      .query("invitations")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (inv?.status === "pending" && inv.expiresAt <= Date.now()) {
      await ctx.db.patch("invitations", inv._id, { status: "expired" });
    }
    return null;
  },
});

/** Daily cron (LLD §12.3): pending invitations past `expiresAt` → `expired`. */
export const expireInvitations = internalMutation({
  args: {},
  returns: v.object({ expired: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("invitations")
      .withIndex("by_status_and_expiresAt", (q) => q.eq("status", "pending").lte("expiresAt", now))
      .take(EXPIRE_BATCH);
    for (const inv of due) await ctx.db.patch("invitations", inv._id, { status: "expired" });
    if (due.length === EXPIRE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.invitations.expireInvitations, {});
    }
    return { expired: due.length };
  },
});
