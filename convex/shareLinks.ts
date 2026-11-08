/**
 * Share links: one result, behind an unguessable link the student can revoke
 * (PRD CL-9, SE-3; LLD §3.1 `shareLinks`, §5.1, §8.3, §12.1; HLD §5.5).
 *
 * - `create` and `revoke` take the owner's anon token. Only the owner of a
 *   submitted attempt can share it, so creating a link is the student's own
 *   choice to publish the result and its review (answers, keys, explanations).
 * - At most one active link per attempt: `create` returns the active link if
 *   there is one, and only a new link spends a `shareLinkCreate` token
 *   (20 per day per anonKey).
 * - `view` is public and unauthenticated. It returns `null` for every miss:
 *   malformed, unknown, revoked, deleted attempt or not submitted all look the
 *   same. A hit carries the result (without the attempt id) and the review,
 *   never the anonKey, ip hash, class, display name or other attempts.
 * - Deleting an attempt deletes its links (`lib/attemptDeletion.ts`).
 */
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { anonKeyOf, loadOwnAttempt } from "./lib/anon";
import { newPublicId } from "./lib/codes";
import { fail } from "./lib/errors";
import { enforceRateLimit } from "./lib/rateLimits";
import {
  buildResult,
  buildReview,
  requireSubmitted,
  resultViewValidator,
  reviewItemValidator,
} from "./lib/review";

/** `newPublicId()`: 16 random bytes as base64url, 22 characters. */
export const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** More links than one attempt can have (each needs a rate-limit token). */
const LINKS_PER_ATTEMPT_LIMIT = 500;

/** The result as a share link shows it: the attempt id is left out. */
export const sharedResultValidator = resultViewValidator.omit("attemptId");

export const sharedViewValidator = v.object({
  result: sharedResultValidator,
  review: v.array(reviewItemValidator),
});

const ownLinkValidator = v.object({ publicId: v.string(), createdAt: v.number() });

async function activeLink(
  ctx: Pick<QueryCtx, "db">,
  attempt: Doc<"attempts">,
): Promise<Doc<"shareLinks"> | null> {
  const links = await ctx.db
    .query("shareLinks")
    .withIndex("by_attempt", (q) => q.eq("attemptId", attempt._id))
    .take(LINKS_PER_ATTEMPT_LIMIT);
  return links.find((l) => l.revokedAt === undefined && l.anonKey === attempt.anonKey) ?? null;
}

/**
 * Share a submitted attempt. Returns the active link if there is one
 * (idempotent; no rate-limit token spent), otherwise makes a new one.
 *
 * Errors: `BAD_TOKEN`; `NOT_FOUND` (missing, another token's, or not
 * submitted); `RATE_LIMITED` (`shareLinkCreate`, 20 new links per day).
 */
export const create = mutation({
  args: { attemptId: v.id("attempts"), anonToken: v.string() },
  returns: v.object({ publicId: v.string() }),
  handler: async (ctx, args) => {
    const attempt = requireSubmitted(await loadOwnAttempt(ctx, args.attemptId, args.anonToken));
    const existing = await activeLink(ctx, attempt);
    if (existing) return { publicId: existing.publicId };

    await enforceRateLimit(ctx, "shareLinkCreate", attempt.anonKey);
    const publicId = newPublicId();
    await ctx.db.insert("shareLinks", {
      attemptId: attempt._id,
      publicId,
      anonKey: attempt.anonKey,
      createdAt: Date.now(),
    });
    return { publicId };
  },
});

/**
 * Revoke a link this token created. Revoking a revoked link is a no-op.
 * `view` returns `null` at once; a CDN-cached `/r/<publicId>` page goes
 * within its 60-second cache window.
 *
 * Errors: `BAD_TOKEN`; `NOT_FOUND` (malformed, unknown, or another token's).
 */
export const revoke = mutation({
  args: { publicId: v.string(), anonToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const anonKey = await anonKeyOf(args.anonToken);
    if (!PUBLIC_ID_PATTERN.test(args.publicId)) fail("NOT_FOUND");
    const link = await ctx.db
      .query("shareLinks")
      .withIndex("by_publicId", (q) => q.eq("publicId", args.publicId))
      .unique();
    if (!link || link.anonKey !== anonKey) fail("NOT_FOUND");
    if (link.revokedAt === undefined) {
      await ctx.db.patch("shareLinks", link._id, { revokedAt: Date.now() });
    }
    return null;
  },
});

/**
 * The owner's active link for an attempt, or `null`, so the result page can
 * show "Copy link" and "Revoke" after a reload without creating one.
 *
 * Errors: `BAD_TOKEN`; `NOT_FOUND` (missing or another token's).
 */
export const forAttempt = query({
  args: { attemptId: v.id("attempts"), anonToken: v.string() },
  returns: v.union(ownLinkValidator, v.null()),
  handler: async (ctx, args) => {
    const attempt = await loadOwnAttempt(ctx, args.attemptId, args.anonToken);
    const link = await activeLink(ctx, attempt);
    return link ? { publicId: link.publicId, createdAt: link.createdAt } : null;
  },
});

/**
 * Public view of a shared result (CL-9): score, domains and the full review.
 * `null` for every miss, so revoked and unknown links can't be told apart.
 */
export const view = query({
  args: { publicId: v.string() },
  returns: v.union(sharedViewValidator, v.null()),
  handler: async (ctx, args) => {
    if (!PUBLIC_ID_PATTERN.test(args.publicId)) return null;
    const link = await ctx.db
      .query("shareLinks")
      .withIndex("by_publicId", (q) => q.eq("publicId", args.publicId))
      .unique();
    if (!link || link.revokedAt !== undefined) return null;
    const attempt = await ctx.db.get("attempts", link.attemptId);
    if (!attempt || attempt.anonKey !== link.anonKey) return null;
    if (attempt.status !== "submitted" || !attempt.result) return null;

    const { attemptId: _omit, ...result } = await buildResult(ctx, attempt);
    return { result, review: await buildReview(ctx, attempt) };
  },
});
