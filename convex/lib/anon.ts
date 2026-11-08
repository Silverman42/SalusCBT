/**
 * Anonymous student identity on the server (LLD §4, HLD D4, PRD SE-3).
 *
 * The browser's 43-character token is a secret. Only `anonKey = sha256(token)`
 * (hex) is stored; every student function hashes the token it receives and
 * compares it with the record's `anonKey`.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { sha256Hex } from "./codes";
import { fail } from "./errors";

/** Same pattern as `app/lib/anonIdentity.ts`: 32 bytes, base64url, no padding. */
export const ANON_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Hash a client token into the stored `anonKey`. Throws `BAD_TOKEN` if malformed. */
export async function anonKeyOf(token: string): Promise<string> {
  if (typeof token !== "string" || !ANON_TOKEN_PATTERN.test(token)) fail("BAD_TOKEN");
  return await sha256Hex(token);
}

/**
 * Load an attempt owned by this token. A missing attempt and someone else's
 * attempt both throw `NOT_FOUND`, so attempt ids can't be probed (SE-3).
 * Works in queries and mutations (`MutationCtx` extends `QueryCtx`'s reader).
 */
export async function loadOwnAttempt(
  ctx: Pick<QueryCtx, "db">,
  attemptId: Id<"attempts">,
  anonToken: string,
): Promise<Doc<"attempts">> {
  const anonKey = await anonKeyOf(anonToken);
  const attempt = await ctx.db.get("attempts", attemptId);
  if (!attempt || attempt.anonKey !== anonKey) fail("NOT_FOUND");
  return attempt;
}
