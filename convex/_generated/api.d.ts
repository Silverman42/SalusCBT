/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as email_console from "../email/console.js";
import type * as email_provider from "../email/provider.js";
import type * as email_resend from "../email/resend.js";
import type * as email_send from "../email/send.js";
import type * as email_templates from "../email/templates.js";
import type * as lib_anon from "../lib/anon.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_codes from "../lib/codes.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_guards from "../lib/guards.js";
import type * as lib_rateLimits from "../lib/rateLimits.js";
import type * as lib_rng from "../lib/rng.js";
import type * as marking_normalise from "../marking/normalise.js";
import type * as marking_score from "../marking/score.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "email/console": typeof email_console;
  "email/provider": typeof email_provider;
  "email/resend": typeof email_resend;
  "email/send": typeof email_send;
  "email/templates": typeof email_templates;
  "lib/anon": typeof lib_anon;
  "lib/audit": typeof lib_audit;
  "lib/codes": typeof lib_codes;
  "lib/errors": typeof lib_errors;
  "lib/guards": typeof lib_guards;
  "lib/rateLimits": typeof lib_rateLimits;
  "lib/rng": typeof lib_rng;
  "marking/normalise": typeof marking_normalise;
  "marking/score": typeof marking_score;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
