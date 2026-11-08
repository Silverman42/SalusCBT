/**
 * IP retention (PRD PR-3, LLD §12.3 `purgeIpHashes`): hashed IPs are kept for
 * 30 days, then removed. The daily cron calls `purgeIpHashes`, which fans out
 * one job per store. Each job handles a bounded page and schedules the next
 * page until its store is done.
 *
 * What gets cleared, for rows older than `IP_HASH_RETENTION_MS`:
 * - `attempts.ipHash` (by `startedAt`) and `auditLog.ipHash` (by `at`). Only
 *   the field is removed; the rest of each row is untouched.
 * - `@convex-dev/rate-limiter` buckets first created before the cutoff. Their
 *   keys are `ipHash`, `anonKey`, lower-cased emails or profile ids, so all of
 *   them go. Every window is a day or less, so a dropped bucket just starts
 *   full again.
 * - Better Auth (component tables, raw IPs): `rateLimit` rows last used
 *   before the cutoff are deleted, and `session.ipAddress` is set to null on
 *   sessions created before it. Both go through the component's own adapter
 *   API (`deleteMany` / `updateMany`), not its tables.
 *
 * Every function here is internal.
 */
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const DAY_MS = 24 * 60 * 60 * 1000;

/** PR-3: IP hashes (and Better Auth's raw IPs) are kept this long. */
export const IP_HASH_RETENTION_MS = 30 * DAY_MS;

/** Rows read per job run; the job reschedules itself while more remain. */
export const PURGE_BATCH = 200;

const jobArgs = { cutoff: v.number(), cursor: v.union(v.string(), v.null()) };

/** Daily cron entry point (02:30 UTC): start one purge per store. */
export const purgeIpHashes = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - IP_HASH_RETENTION_MS;
    const start = { cutoff, cursor: null };
    await ctx.scheduler.runAfter(0, internal.privacy.purgeAttemptIpHashes, start);
    await ctx.scheduler.runAfter(0, internal.privacy.purgeAuditIpHashes, start);
    await ctx.scheduler.runAfter(0, internal.privacy.purgeAuthRateLimits, start);
    await ctx.scheduler.runAfter(0, internal.privacy.purgeAuthSessionIps, start);
    // The component deletes in batches of 100 and reschedules itself.
    await ctx.runMutation(components.rateLimiter.lib.clearAll, { before: cutoff });
    return null;
  },
});

/**
 * Clear `attempts.ipHash` on attempts started before `cutoff`. `by_ipHash`
 * holds only rows that still have a hash, so a run reads at most the last 30
 * days of attempts plus whatever is due.
 */
export const purgeAttemptIpHashes = internalMutation({
  args: jobArgs,
  returns: v.number(),
  handler: async (ctx, { cutoff, cursor }) => {
    const page = await ctx.db
      .query("attempts")
      .withIndex("by_ipHash", (q) => q.gte("ipHash", ""))
      .paginate({ numItems: PURGE_BATCH, cursor });
    let cleared = 0;
    for (const attempt of page.page) {
      if (attempt.startedAt >= cutoff) continue;
      await ctx.db.patch("attempts", attempt._id, { ipHash: undefined });
      cleared++;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.privacy.purgeAttemptIpHashes, {
        cutoff,
        cursor: page.continueCursor,
      });
    }
    return cleared;
  },
});

/** Clear `auditLog.ipHash` on rows written before `cutoff` (same scheme). */
export const purgeAuditIpHashes = internalMutation({
  args: jobArgs,
  returns: v.number(),
  handler: async (ctx, { cutoff, cursor }) => {
    const page = await ctx.db
      .query("auditLog")
      .withIndex("by_ipHash", (q) => q.gte("ipHash", ""))
      .paginate({ numItems: PURGE_BATCH, cursor });
    let cleared = 0;
    for (const row of page.page) {
      if (row.at >= cutoff) continue;
      await ctx.db.patch("auditLog", row._id, { ipHash: undefined });
      cleared++;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.privacy.purgeAuditIpHashes, {
        cutoff,
        cursor: page.continueCursor,
      });
    }
    return cleared;
  },
});

/**
 * Delete Better Auth `rateLimit` rows (key = raw IP + path) last used before
 * `cutoff`. Served by the component's `lastRequest` index.
 */
export const purgeAuthRateLimits = internalMutation({
  args: jobArgs,
  returns: v.number(),
  handler: async (ctx, { cutoff, cursor }) => {
    const result = await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
      input: {
        model: "rateLimit",
        where: [{ field: "lastRequest", operator: "lt", value: cutoff }],
      },
      paginationOpts: { numItems: PURGE_BATCH, cursor },
    });
    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.privacy.purgeAuthRateLimits, {
        cutoff,
        cursor: result.continueCursor,
      });
    }
    return result.count;
  },
});

/**
 * Null `session.ipAddress` (raw IP at sign-in) on sessions created before
 * `cutoff`. Sessions last 7 days unless refreshed, so the table is small;
 * the component scans it in bounded pages.
 */
export const purgeAuthSessionIps = internalMutation({
  args: jobArgs,
  returns: v.number(),
  handler: async (ctx, { cutoff, cursor }) => {
    const result = await ctx.runMutation(components.betterAuth.adapter.updateMany, {
      input: {
        model: "session",
        where: [
          { field: "createdAt", operator: "lt", value: cutoff },
          { field: "ipAddress", operator: "ne", value: null },
        ],
        update: { ipAddress: null },
      },
      paginationOpts: { numItems: PURGE_BATCH, cursor },
    });
    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.privacy.purgeAuthSessionIps, {
        cutoff,
        cursor: result.continueCursor,
      });
    }
    return result.count;
  },
});
