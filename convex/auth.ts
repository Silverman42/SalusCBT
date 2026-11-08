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
 * - Only users with an `active` Salus profile get a session
 *   (`session.create.before`); sign-ins, sign-outs, code requests and failed
 *   codes are audited (LLD §9.2, §12.2, T-404).
 * - Better Auth's own per-IP limiter also applies (1 request / 60 s on the
 *   send endpoint), keyed on `x-salus-client-ip`. That header is set by the
 *   Nuxt proxy; see `lib/clientIp.ts` for when Salus's own limits trust it.
 */
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { isRunMutationCtx, type RunMutationCtx } from "@convex-dev/better-auth/utils";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
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
export const SIGN_IN_OTP_PATH = "/sign-in/email-otp";
export const SIGN_OUT_PATH = "/sign-out";

/** Better Auth error code when a user without an active profile signs in. */
export const ACCOUNT_INACTIVE = "ACCOUNT_INACTIVE";

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
 * The opaque client-IP key (HMAC) for rate limits and audit `ipHash`, or
 * null outside an HTTP request. See `lib/clientIp.ts` for which IP is used.
 */
async function requestIpKey(ctx: RunMutationCtx<DataModel>, headers: Headers | undefined) {
  const peerIp = (await ctx.meta.getRequestMetadata()).ip;
  const ip = await trustedClientIp(headers ?? new Headers(), peerIp, env.SERVER_SECRET);
  return ip ? await ipRateLimitKey(ip, env.BETTER_AUTH_SECRET) : null;
}

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

  const ipKey = await requestIpKey(ctx, hook.headers);
  const allowed = await ctx.runMutation(internal.profiles.otpRequestAllowed, {
    email: body.email,
    ipKey,
  });
  return allowed ? undefined : silent();
}

/**
 * Runs before `/sign-out`: audits `auth.signout` for the session in the
 * cookie (after the endpoint runs, the session is gone). No session, no entry.
 */
async function auditSignOut(
  ctx: GenericCtx<DataModel>,
  hook: Parameters<Parameters<typeof createAuthMiddleware>[0]>[0],
) {
  if (!isRunMutationCtx(ctx)) return;
  const token = await hook.getSignedCookie(
    hook.context.authCookies.sessionToken.name,
    hook.context.secret,
  );
  if (!token) return;
  const found = await hook.context.internalAdapter.findSession(token);
  if (!found) return;
  await ctx.runMutation(internal.profiles.recordAuthEvent, {
    action: "auth.signout",
    authUserId: found.user.id,
    ipKey: await requestIpKey(ctx, hook.headers),
  });
}

/**
 * Runs after `/sign-in/email-otp`: a refused code (wrong, expired, too many
 * tries, or an inactive account) is audited as `auth.otp_failed` with Better
 * Auth's error code. Successful sign-ins are audited by the session hook.
 */
async function auditOtpFailure(
  ctx: GenericCtx<DataModel>,
  hook: Parameters<Parameters<typeof createAuthMiddleware>[0]>[0],
) {
  const returned = hook.context.returned;
  if (!isAPIError(returned) || !isRunMutationCtx(ctx)) return;
  const body = (hook.body ?? {}) as { email?: unknown };
  if (typeof body.email !== "string") return;
  const code = (returned.body as { code?: unknown } | undefined)?.code;
  await ctx.runMutation(internal.profiles.recordAuthEvent, {
    action: "auth.otp_failed",
    email: body.email,
    reason: typeof code === "string" ? code : String(returned.statusCode),
    ipKey: await requestIpKey(ctx, hook.headers),
  });
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
        if (hook.path === SEND_OTP_PATH) return await gateOtpRequest(ctx, hook);
        if (hook.path === SIGN_OUT_PATH) await auditSignOut(ctx, hook);
      }),
      after: createAuthMiddleware(async (hook) => {
        if (hook.path === SIGN_IN_OTP_PATH) await auditOtpFailure(ctx, hook);
      }),
    },
    databaseHooks: {
      session: {
        create: {
          // LLD §9.2: only an active profile may hold a session (AU-4).
          before: async (session) => {
            if (!isRunMutationCtx(ctx)) return;
            const allowed = await ctx.runQuery(internal.profiles.sessionAllowed, {
              authUserId: session.userId,
            });
            if (!allowed) {
              throw new APIError("FORBIDDEN", {
                message: "This account can't sign in.",
                code: ACCOUNT_INACTIVE,
              });
            }
          },
          after: async (session, endpoint) => {
            if (!isRunMutationCtx(ctx)) return;
            await ctx.runMutation(internal.profiles.recordAuthEvent, {
              action: "auth.signin",
              authUserId: session.userId,
              ipKey: await requestIpKey(ctx, endpoint?.headers),
            });
          },
        },
      },
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
