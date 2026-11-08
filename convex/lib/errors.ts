/**
 * Error codes shared by every Convex function (LLD §16).
 *
 * Functions throw `ConvexError` so the code reaches the browser intact; a plain
 * `Error` arrives as "Server Error" (LLD §18.1 finding 3). Most codes are thrown
 * as the bare string (`new ConvexError("NOT_FOUND")`, as in the LLD sketches);
 * `RATE_LIMITED` carries `{ code, retryAfter }` so the UI can say when to retry.
 */
import { ConvexError } from "convex/values";

export const ERROR_CODES = [
  "BAD_TOKEN",
  "NOT_FOUND",
  "ATTEMPT_CLOSED",
  "CLASS_CLOSED",
  "CLASS_UNKNOWN",
  "RATE_LIMITED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_FAILED",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Payload of a `RATE_LIMITED` error; `retryAfter` is in milliseconds. */
export type RateLimitedData = {
  code: "RATE_LIMITED";
  retryAfter: number;
};

/** Throw a §16 error that carries only its code. */
export function fail(code: Exclude<ErrorCode, "RATE_LIMITED">): never {
  throw new ConvexError(code);
}

export function rateLimited(retryAfter: number): never {
  const data: RateLimitedData = { code: "RATE_LIMITED", retryAfter: Math.ceil(retryAfter) };
  throw new ConvexError(data);
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

/**
 * Read the §16 code from a caught error (server or client side), or `null` if
 * it isn't one of ours. Handles both the string and the `{ code }` shapes.
 */
export function errorCodeOf(err: unknown): ErrorCode | null {
  if (!(err instanceof ConvexError)) return null;
  const data: unknown = err.data;
  if (isErrorCode(data)) return data;
  if (data && typeof data === "object" && isErrorCode((data as { code?: unknown }).code)) {
    return (data as { code: ErrorCode }).code;
  }
  return null;
}
