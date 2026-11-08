/**
 * Better Auth on Convex: passwordless sign-in by emailed code (LLD §9.1,
 * PRD AU-1 to AU-4). Shape verified in the T-003 spike (LLD §18.1).
 *
 * - Sign-in is by a 6-digit code, valid for 10 minutes, at most 5 tries
 *   (the 6th try is refused even with the right code). Codes are stored
 *   hashed. Email + password is off.
 * - Sign-up is closed: only an accepted invitation creates a user (T-405).
 * - Sessions last 7 days and are refreshed once a day.
 * - Asking for a code always answers `200 {"success":true}`, whether or not
 *   a code was sent (no account enumeration). A code is only sent for
 *   `type: "sign-in"`, to an email with an active profile, within the limits
 *   of `profiles.otpRequestAllowed`. That gate runs in a `before` hook, ahead
 *   of the endpoint, so a refused request doesn't replace (and so cancel) the
 *   code already sent.
 * - Better Auth's own per-IP limiter also applies (1 request / 60 s on the
 *   send endpoint), keyed on `x-salus-client-ip`. That header is set by the
 *   Nuxt proxy; see `lib/clientIp.ts` for when Salus's own limits trust it.
 */
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { isRunMutationCtx } from "@convex-dev/better-auth/utils";
import { createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { emailOTP } from "better-auth/plugins";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { env } from "./_generated/server";
import authConfig from "./auth.config";
import { otp as otpEmail } from "./email/templates";
import { CLIENT_IP_HEADER, ipRateLimitKey, trustedClientIp } from "./lib/clientIp";

export const authComponent = createClient<DataModel>(components.betterAuth);

const DAY_S = 24 * 60 * 60;

/** AU-1, AU-2, AU-4 limits, exported for the tests. */
export const AUTH_LIMITS = {
  otpLength: 6,
  otpExpiresInS: 10 * 60,
  otpAllowedAttempts: 5,
  sessionExpiresInS: 7 * DAY_S,
  sessionUpdateAgeS: DAY_S,
  /** Better Auth's per-IP limit on the send endpoint (AU-3, 60 s). */
  sendOtpPerIp: { window: 60, max: 1 },
} as const;

export const SEND_OTP_PATH = "/email-otp/send-verification-otp";

/**
 * emailOTP endpoints Salus doesn't use. Disabled so they can't be used to
 * probe or spend codes (password reset and email change don't exist here).
 */
const UNUSED_PATHS = [
  "/email-otp/check-verification-otp",
  "/email-otp/verify-email",
  "/email-otp/request-password-reset",
  "/forget-password/email-otp",
  "/email-otp/reset-password",
  "/email-otp/request-email-change",
  "/email-otp/change-email",
];

/**
 * Runs before `/email-otp/send-verification-otp`. Returns the endpoint's own
 * success body to stop silently, or `undefined` to let it continue (for a
 * known user it then stores a new code and calls `sendVerificationOTP`; for
 * an unknown one it sends nothing). A malformed body is left to the
 * endpoint, which rejects it with 400 whatever the email.
 */
async function gateOtpRequest(
  ctx: GenericCtx<DataModel>,
  hook: {
    body: unknown;
    headers?: Headers | undefined;
    json: (body: { success: boolean }) => unknown;
  },
) {
  const body = (hook.body ?? {}) as { email?: unknown; type?: unknown };
  if (typeof body.email !== "string") return undefined;
  const silent = () => hook.json({ success: true });
  if (body.type !== "sign-in") return silent();
  // Only HTTP requests (action context) reach here in practice.
  if (!isRunMutationCtx(ctx)) return silent();

  const peerIp = (await ctx.meta.getRequestMetadata()).ip;
  const ip = await trustedClientIp(hook.headers ?? new Headers(), peerIp, env.SERVER_SECRET);
  const ipKey = ip ? await ipRateLimitKey(ip, env.BETTER_AUTH_SECRET) : null;
  const allowed = await ctx.runMutation(internal.profiles.otpRequestAllowed, {
    email: body.email,
    ipKey,
  });
  return allowed ? undefined : silent();
}

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: env.SITE_URL,
    secret: env.BETTER_AUTH_SECRET,
    // The Nuxt proxy sends the browser origin in x-better-auth-forwarded-*;
    // the component honours it only for trusted origins (§18.1 finding 1).
    trustedOrigins: env.SITE_URL ? [env.SITE_URL] : [],
    database: authComponent.adapter(ctx),
    session: {
      expiresIn: AUTH_LIMITS.sessionExpiresInS, // AU-4
      updateAge: AUTH_LIMITS.sessionUpdateAgeS,
    },
    emailAndPassword: { enabled: false },
    disabledPaths: UNUSED_PATHS,
    advanced: { ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] } },
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: { [SEND_OTP_PATH]: AUTH_LIMITS.sendOtpPerIp }, // AU-3
    },
    hooks: {
      before: createAuthMiddleware(async (hook) => {
        if (hook.path !== SEND_OTP_PATH) return;
        return await gateOtpRequest(ctx, hook);
      }),
    },
    plugins: [
      emailOTP({
        otpLength: AUTH_LIMITS.otpLength, // AU-1
        expiresIn: AUTH_LIMITS.otpExpiresInS, // AU-2 (plugin default is 5 min)
        allowedAttempts: AUTH_LIMITS.otpAllowedAttempts, // AU-2 (default 3)
        storeOTP: "hashed",
        disableSignUp: true, // invitation-only (LLD §9.3)
        async sendVerificationOTP({ email, otp, type }) {
          // Called only for an existing user that passed `gateOtpRequest`.
          if (type !== "sign-in" || !("scheduler" in ctx)) return;
          // Scheduled rather than awaited: the response time doesn't depend on
          // the email provider, and `email.send.send` retries on its own.
          await ctx.scheduler.runAfter(
            0,
            internal.email.send.send,
            otpEmail({ to: email, code: otp }),
          );
        },
      }),
      convex({ authConfig }),
    ],
  });
