/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as attempts from "../attempts.js";
import type * as auth from "../auth.js";
import type * as classes from "../classes.js";
import type * as crons from "../crons.js";
import type * as editor from "../editor.js";
import type * as email_console from "../email/console.js";
import type * as email_provider from "../email/provider.js";
import type * as email_resend from "../email/resend.js";
import type * as email_send from "../email/send.js";
import type * as email_templates from "../email/templates.js";
import type * as generators_common from "../generators/common.js";
import type * as generators_firewall from "../generators/firewall.js";
import type * as generators_hashCheck from "../generators/hashCheck.js";
import type * as generators_index from "../generators/index.js";
import type * as generators_nmap from "../generators/nmap.js";
import type * as generators_permissions from "../generators/permissions.js";
import type * as generators_sha256 from "../generators/sha256.js";
import type * as generators_sshLog from "../generators/sshLog.js";
import type * as http from "../http.js";
import type * as invitations from "../invitations.js";
import type * as lib_anon from "../lib/anon.js";
import type * as lib_answers from "../lib/answers.js";
import type * as lib_attemptDeletion from "../lib/attemptDeletion.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_classCodes from "../lib/classCodes.js";
import type * as lib_classCsv from "../lib/classCsv.js";
import type * as lib_classStats from "../lib/classStats.js";
import type * as lib_clientIp from "../lib/clientIp.js";
import type * as lib_codes from "../lib/codes.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_guards from "../lib/guards.js";
import type * as lib_paper from "../lib/paper.js";
import type * as lib_rateLimits from "../lib/rateLimits.js";
import type * as lib_review from "../lib/review.js";
import type * as lib_rng from "../lib/rng.js";
import type * as marking_normalise from "../marking/normalise.js";
import type * as marking_score from "../marking/score.js";
import type * as profiles from "../profiles.js";
import type * as review from "../review.js";
import type * as seed from "../seed.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  attempts: typeof attempts;
  auth: typeof auth;
  classes: typeof classes;
  crons: typeof crons;
  editor: typeof editor;
  "email/console": typeof email_console;
  "email/provider": typeof email_provider;
  "email/resend": typeof email_resend;
  "email/send": typeof email_send;
  "email/templates": typeof email_templates;
  "generators/common": typeof generators_common;
  "generators/firewall": typeof generators_firewall;
  "generators/hashCheck": typeof generators_hashCheck;
  "generators/index": typeof generators_index;
  "generators/nmap": typeof generators_nmap;
  "generators/permissions": typeof generators_permissions;
  "generators/sha256": typeof generators_sha256;
  "generators/sshLog": typeof generators_sshLog;
  http: typeof http;
  invitations: typeof invitations;
  "lib/anon": typeof lib_anon;
  "lib/answers": typeof lib_answers;
  "lib/attemptDeletion": typeof lib_attemptDeletion;
  "lib/audit": typeof lib_audit;
  "lib/classCodes": typeof lib_classCodes;
  "lib/classCsv": typeof lib_classCsv;
  "lib/classStats": typeof lib_classStats;
  "lib/clientIp": typeof lib_clientIp;
  "lib/codes": typeof lib_codes;
  "lib/errors": typeof lib_errors;
  "lib/guards": typeof lib_guards;
  "lib/paper": typeof lib_paper;
  "lib/rateLimits": typeof lib_rateLimits;
  "lib/review": typeof lib_review;
  "lib/rng": typeof lib_rng;
  "marking/normalise": typeof marking_normalise;
  "marking/score": typeof marking_score;
  profiles: typeof profiles;
  review: typeof review;
  seed: typeof seed;
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
