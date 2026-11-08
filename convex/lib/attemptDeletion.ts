/**
 * Deleting attempts with their responses and share links (PRD PR-5, CL-11,
 * LLD §5.2 `classes.deleteAttempts`, §5.3 `admin.deleteAttempts`).
 *
 * Callers do their own access checks (admin: any attempt; tutor: owner of the
 * attempt's class) and write the `attempt.deleted` audit entry, then call
 * `deleteAttempts`. Within that one mutation the attempts and their share
 * links disappear (so `shareLinks.view` returns `null` at once) and a pending
 * auto-submit is cancelled. Responses (up to ~90 per attempt) are deleted in
 * bounded batches: the first batch inline, the rest by `purgeResponses`
 * rescheduling itself until none are left. Leftover responses of a deleted
 * attempt are unreachable meanwhile, since every reader loads the attempt first.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";

/** Most attempts one call may delete (LLD §5.2). */
export const MAX_DELETE_ATTEMPTS = 100;

/** Most responses deleted in one transaction. */
export const RESPONSE_BATCH = 1000;

/**
 * Delete each existing attempt in `attemptIds` (missing ones are skipped,
 * duplicates count once) with its share links, cancel its pending auto-submit
 * and start deleting its responses. Returns how many attempts were deleted.
 */
export async function deleteAttempts(
  ctx: MutationCtx,
  attemptIds: readonly Id<"attempts">[],
): Promise<number> {
  const deleted: Id<"attempts">[] = [];
  for (const attemptId of new Set(attemptIds)) {
    const attempt = await ctx.db.get("attempts", attemptId);
    if (!attempt) continue;
    if (attempt.autoSubmitJobId !== undefined) {
      const job = await ctx.db.system.get("_scheduled_functions", attempt.autoSubmitJobId);
      if (job?.state.kind === "pending") await ctx.scheduler.cancel(attempt.autoSubmitJobId);
    }
    for await (const link of ctx.db
      .query("shareLinks")
      .withIndex("by_attempt", (q) => q.eq("attemptId", attemptId))) {
      await ctx.db.delete("shareLinks", link._id);
    }
    await ctx.db.delete("attempts", attemptId);
    deleted.push(attemptId);
  }
  if (deleted.length > 0) await purgeResponsesBatch(ctx, deleted);
  return deleted.length;
}

/**
 * Delete up to `RESPONSE_BATCH` responses of `attemptIds`; if any remain,
 * schedule `purgeResponses` for the attempts that still have some.
 */
async function purgeResponsesBatch(ctx: MutationCtx, attemptIds: readonly Id<"attempts">[]) {
  let budget = RESPONSE_BATCH;
  const remaining: Id<"attempts">[] = [];
  for (const attemptId of attemptIds) {
    if (budget === 0) {
      remaining.push(attemptId);
      continue;
    }
    // One extra row tells us whether this attempt has more left.
    const rows = await ctx.db
      .query("responses")
      .withIndex("by_attempt_question", (q) => q.eq("attemptId", attemptId))
      .take(budget + 1);
    const batch = rows.slice(0, budget);
    for (const row of batch) await ctx.db.delete("responses", row._id);
    budget -= batch.length;
    if (rows.length > batch.length) remaining.push(attemptId);
  }
  if (remaining.length > 0) {
    await ctx.scheduler.runAfter(0, internal.lib.attemptDeletion.purgeResponses, {
      attemptIds: remaining,
    });
  }
}

/** Continuation of `deleteAttempts`: keeps deleting responses in batches. */
export const purgeResponses = internalMutation({
  args: { attemptIds: v.array(v.id("attempts")) },
  returns: v.null(),
  handler: async (ctx, { attemptIds }) => {
    await purgeResponsesBatch(ctx, attemptIds);
    return null;
  },
});
