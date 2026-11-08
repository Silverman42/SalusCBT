/**
 * Rate limits (LLD §12.1, PRD SE-5, AU-3) on `@convex-dev/rate-limiter`.
 *
 * Every limit is a token bucket whose capacity equals its rate, so a full
 * allowance can be used at once and then refills evenly. Keys are already
 * hashed or opaque (`anonKey`, `ipHash`, lower-cased email, profile id).
 *
 * The component's reads and writes join the calling mutation's transaction,
 * so a mutation that later throws also gives the tokens back.
 */
import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { errorCodeOf, rateLimited } from "./errors";

const DAY = 24 * HOUR;

const bucket = (rate: number, period: number) =>
  ({ kind: "token bucket", rate, period, capacity: rate }) as const;

export const RATE_LIMITS = {
  /** AU-3: one code per 60 s per email … */
  otpRequest: bucket(1, MINUTE),
  /** … and five per hour per email. Checked together with `otpRequest`. */
  otpRequestHourly: bucket(5, HOUR),
  otpRequestIp: bucket(30, HOUR),
  attemptStartAnon: bucket(10, HOUR),
  /** Classroom-safe: a whole class on one school network stays under it. */
  attemptStartIp: bucket(200, HOUR),
  shareLinkCreate: bucket(20, DAY),
  invitationCreate: bucket(50, DAY),
};

export const rateLimiter = new RateLimiter(components.rateLimiter, RATE_LIMITS);

/** The §12.1 names callers use. `otpRequest` enforces both of its windows. */
export type RateLimitName = Exclude<keyof typeof RATE_LIMITS, "otpRequestHourly">;

const COMPANIONS: Partial<Record<RateLimitName, (keyof typeof RATE_LIMITS)[]>> = {
  otpRequest: ["otpRequest", "otpRequestHourly"],
};

/**
 * Consume one token from `name` for `key`, or throw
 * `ConvexError({ code: "RATE_LIMITED", retryAfter })` (milliseconds).
 *
 * For multi-window limits every window is checked before any is consumed, so
 * a request refused by one window doesn't spend another window's allowance.
 */
export async function enforceRateLimit(
  ctx: MutationCtx,
  name: RateLimitName,
  key: string,
): Promise<void> {
  const windows = COMPANIONS[name] ?? [name];
  if (windows.length > 1) {
    let wait = 0;
    for (const w of windows) {
      const status = await rateLimiter.check(ctx, w, { key });
      if (!status.ok) wait = Math.max(wait, status.retryAfter);
    }
    if (wait > 0) rateLimited(wait);
  }
  for (const w of windows) {
    const status = await rateLimiter.limit(ctx, w, { key });
    if (!status.ok) rateLimited(status.retryAfter);
  }
}

/**
 * Like `enforceRateLimit`, but returns `false` instead of throwing. For flows
 * that must fail silently, such as OTP requests (no account enumeration).
 */
export async function tryRateLimit(
  ctx: MutationCtx,
  name: RateLimitName,
  key: string,
): Promise<boolean> {
  try {
    await enforceRateLimit(ctx, name, key);
    return true;
  } catch (err) {
    if (errorCodeOf(err) === "RATE_LIMITED") return false;
    throw err;
  }
}
