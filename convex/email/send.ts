/**
 * `internal.email.send.send` — deliver one email through the configured
 * provider (LLD §11).
 *
 * The first attempt runs inline, so callers such as Better Auth's
 * `sendVerificationOTP` can `ctx.runAction` it. A retryable failure is logged
 * and the action reschedules itself with backoff, at most `MAX_RETRIES` times;
 * it never throws for a delivery failure, so the caller's flow (and its
 * anti-enumeration response) isn't affected. Every attempt carries the same
 * idempotency key, so a retry after a timed-out-but-delivered request isn't
 * sent twice by providers that honour it.
 *
 * Logs never include the body or the recipient (PR-2); the console provider
 * is the only place an email's content is logged.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { EmailSendError, getProvider } from "./provider";

export const MAX_RETRIES = 3;
/** Delay before retry 1, 2 and 3. Short, because an OTP is valid for 10 minutes. */
export const RETRY_DELAYS_MS = [5_000, 30_000, 120_000] as const;

const sendResult = v.union(
  v.object({ status: v.literal("sent"), id: v.optional(v.string()) }),
  v.object({ status: v.literal("retrying"), retryInMs: v.number() }),
  v.object({ status: v.literal("failed") }),
);

export const send = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    html: v.string(),
    text: v.string(),
    tag: v.optional(v.union(v.literal("otp"), v.literal("invite"))),
    /** Internal: set by the action itself when it reschedules. */
    attempt: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
  },
  returns: sendResult,
  handler: async (ctx, args) => {
    const { attempt = 0, idempotencyKey = crypto.randomUUID(), ...msg } = args;
    const label = `tag=${msg.tag ?? "-"} attempt=${attempt + 1}/${MAX_RETRIES + 1}`;
    try {
      const { id } = await getProvider().send(msg, { idempotencyKey });
      return id !== undefined ? { status: "sent" as const, id } : { status: "sent" as const };
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      const retryable = !(e instanceof EmailSendError) || e.retryable;
      if (retryable && attempt < MAX_RETRIES) {
        const retryInMs = RETRY_DELAYS_MS[attempt]!;
        console.warn(`[email] send failed (${label}): ${reason}; retrying in ${retryInMs} ms`);
        await ctx.scheduler.runAfter(retryInMs, internal.email.send.send, {
          ...msg,
          attempt: attempt + 1,
          idempotencyKey,
        });
        return { status: "retrying" as const, retryInMs };
      }
      console.error(`[email] send failed permanently (${label}): ${reason}`);
      return { status: "failed" as const };
    }
  },
});
