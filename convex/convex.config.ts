import { defineApp } from "convex/server";
import { v } from "convex/values";
import betterAuth from "@convex-dev/better-auth/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";

// Components (LLD §3.1, §12.1). Better Auth keeps its own user, session,
// account and verification tables; rate-limit state lives in the rate limiter.
//
// Deployment env vars (LLD §15.2), read through `env` from `_generated/server`.
// Required ones block a deploy that lacks them. The rest are optional so a
// fresh dev or preview deployment still deploys; code that needs one fails
// safe when it's missing (see each reader).
const app = defineApp({
  env: {
    /** Public app URL: Better Auth `baseURL`, `trustedOrigins`, email links. */
    SITE_URL: v.string(),
    /** Signs Better Auth cookies and tokens; also keys the auth IP hashes. */
    BETTER_AUTH_SECRET: v.string(),
    /** Shared with the Nuxt server (`NUXT_SERVER_SECRET`). Unset → the
     * proxy's client-IP header is never trusted (convex/lib/clientIp.ts). */
    SERVER_SECRET: v.optional(v.string()),
    /** The single admin (AU-6), used by `profiles.ensureAdmin` (T-404). */
    ADMIN_EMAIL: v.optional(v.string()),
    /** `console` (default) or `resend` (convex/email/provider.ts). */
    EMAIL_PROVIDER: v.optional(v.string()),
    RESEND_API_KEY: v.optional(v.string()),
    EMAIL_FROM: v.optional(v.string()),
  },
});
app.use(betterAuth);
app.use(rateLimiter);

export default app;
