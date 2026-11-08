/**
 * Salus profiles: the role and status behind a Better Auth user (LLD §9.2).
 *
 * T-402 adds only the OTP request gate. `ensureAdmin`, the session hooks and
 * the sign-in audit entries follow in T-404.
 */
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { tryRateLimit } from "./lib/rateLimits";

/**
 * May a sign-in code be sent to `email`? (AU-3, LLD §9.1, §12.1)
 *
 * Spends one token from each limit whether or not the email has an account,
 * so a refused or unknown email looks the same as a known one from outside:
 *   - `otpRequestIp`: 30 per hour per client IP (`ipKey`, skipped when null),
 *   - `otpRequest`: 1 per 60 s and 5 per hour per email,
 * then requires an `active` profile. The caller answers the browser the same
 * way whatever this returns (no enumeration).
 */
export const otpRequestAllowed = internalMutation({
  args: { email: v.string(), ipKey: v.union(v.string(), v.null()) },
  returns: v.boolean(),
  handler: async (ctx, { email, ipKey }) => {
    const normalized = email.trim().toLowerCase();
    if (ipKey !== null && !(await tryRateLimit(ctx, "otpRequestIp", ipKey))) return false;
    if (!(await tryRateLimit(ctx, "otpRequest", normalized))) return false;
    // At most a few rows per email (a removed profile plus a re-invited one).
    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .take(10);
    return profiles.some((p) => p.status === "active");
  },
});
