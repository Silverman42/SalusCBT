/**
 * The student's results, review and history (LLD §5.1, §8.3; PRD EX-14–EX-19,
 * PB-2, SE-1, SE-3). All three take the anon token.
 *
 * `getResult` and `getReview` work on submitted attempts only: an attempt that
 * is in progress (or expired without a result) gives `NOT_FOUND`, the same
 * error as a missing or foreign attempt. `getReview` is the only student
 * function that returns answer keys and explanations, and only after
 * submission. `myAttempts` returns summaries, never keys.
 */
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { anonKeyOf, loadOwnAttempt } from "./lib/anon";
import { fail } from "./lib/errors";
import {
  attemptSummary,
  attemptSummaryValidator,
  buildResult,
  buildReview,
  resultViewValidator,
  reviewItemValidator,
} from "./lib/review";

/** Largest history page a client may ask for. */
export const MY_ATTEMPTS_PAGE_MAX = 100;

/**
 * Result summary of a submitted attempt (EX-14–EX-16): the stored `result`
 * (points, scaled, pass flags, domains, flagged count, time used) plus the
 * exam's thresholds and the attempt's times. No per-question data.
 *
 * Errors: `BAD_TOKEN`; `NOT_FOUND` (missing, another token's, or not submitted).
 */
export const getResult = query({
  args: { attemptId: v.id("attempts"), anonToken: v.string() },
  returns: resultViewValidator,
  handler: async (ctx, args) => {
    const attempt = await loadOwnAttempt(ctx, args.attemptId, args.anonToken);
    return await buildResult(ctx, attempt);
  },
});

/**
 * Full review of a submitted attempt (EX-17, EX-18, PB-2; LLD §8.3): every
 * question in paper order with options in the order the student saw them,
 * their answer and flag, earned / max, per-part results for PBQs, the correct
 * answer, the explanation and practice model answers.
 *
 * Errors: `BAD_TOKEN`; `NOT_FOUND` (missing, another token's, or not submitted).
 */
export const getReview = query({
  args: { attemptId: v.id("attempts"), anonToken: v.string() },
  returns: v.array(reviewItemValidator),
  handler: async (ctx, args) => {
    const attempt = await loadOwnAttempt(ctx, args.attemptId, args.anonToken);
    return await buildReview(ctx, attempt);
  },
});

/**
 * This token's attempts, newest first, paginated (EX-19, LLD §4). Includes
 * in-progress attempts (so the history page can offer to resume); scores are
 * present only on submitted ones.
 *
 * Errors: `BAD_TOKEN`; `VALIDATION_FAILED` (`numItems` outside 1–100).
 */
export const myAttempts = query({
  args: { anonToken: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(attemptSummaryValidator),
  handler: async (ctx, args) => {
    const anonKey = await anonKeyOf(args.anonToken);
    const n = args.paginationOpts.numItems;
    if (!Number.isInteger(n) || n < 1 || n > MY_ATTEMPTS_PAGE_MAX) fail("VALIDATION_FAILED");
    const page = await ctx.db
      .query("attempts")
      .withIndex("by_anonKey", (q) => q.eq("anonKey", anonKey))
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...page, page: page.page.map(attemptSummary) };
  },
});
