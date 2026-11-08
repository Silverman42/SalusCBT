/**
 * Pure parts of `POST /api/attempts/start` (LLD §7.1, §16; T-203). The
 * handler is `server/api/attempts/start.post.ts`.
 *
 * - The browser sends `{ anonToken, displayName?, classCode?, mode? }`. The
 *   route checks shapes and sizes here, so junk never reaches Convex.
 * - The client IP is turned into `ipHash = HMAC-SHA256(NUXT_IP_PEPPER, ip)`
 *   (hex) and only the hash is sent: the raw IP never leaves the Nuxt function.
 * - Convex's §16 errors become HTTP statuses with a `{ code }` body. A
 *   `FORBIDDEN` from `attempts.start` means our own `NUXT_SERVER_SECRET` is
 *   wrong, so the browser gets a generic 500 and the details go to the log.
 *
 * Kept free of h3 so it can be unit-tested. Never log the anon token or the
 * server secret.
 */
import { createHmac } from "node:crypto";
import { ANON_TOKEN_PATTERN } from "../../convex/lib/anon";
import { errorCodeOf } from "../../convex/lib/errors";

/** Bodies are a token, a name and a code: anything bigger is not ours. */
export const START_BODY_MAX_BYTES = 4096;

/** Same limit as `DISPLAY_NAME_MAX` in `convex/attempts.ts` (CL-4). */
const START_DISPLAY_NAME_MAX = 40;

/** Same limit as `CLASS_CODE_INPUT_MAX` in `convex/attempts.ts`. */
const START_CLASS_CODE_MAX = 32;

export type StartMode = "standard" | "retake";

export interface StartBody {
  anonToken: string;
  displayName?: string;
  classCode?: string;
  mode: StartMode;
}

/** Codes the route itself returns, on top of the Convex §16 codes. */
export type StartRouteCode =
  | "BAD_REQUEST"
  | "BAD_TOKEN"
  | "VALIDATION_FAILED"
  | "CLASS_UNKNOWN"
  | "CLASS_CLOSED"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "CROSS_ORIGIN"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "SERVER_ERROR";

export interface StartErrorResponse {
  status: number;
  body: { code: StartRouteCode; retryAfter?: number };
  /** `Retry-After` header value in seconds, for 429. */
  retryAfterSeconds?: number;
  /** Server-side log line (never contains the token or the secret). */
  log?: string;
}

export type ParseResult = { ok: true; value: StartBody } | { ok: false; error: StartErrorResponse };

function reject(status: number, code: StartRouteCode): { ok: false; error: StartErrorResponse } {
  return { ok: false, error: { status, body: { code } } };
}

/**
 * Validate the raw request body text. Returns the cleaned body or a 4xx.
 * Blank `displayName` / `classCode` are dropped; `mode` defaults to
 * `"standard"`.
 */
export function parseStartBody(raw: string | undefined | null): ParseResult {
  if (raw === undefined || raw === null || raw.length === 0) return reject(400, "BAD_REQUEST");
  if (Buffer.byteLength(raw, "utf8") > START_BODY_MAX_BYTES) {
    return reject(413, "PAYLOAD_TOO_LARGE");
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return reject(400, "BAD_REQUEST");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return reject(400, "BAD_REQUEST");
  const body = data as Record<string, unknown>;

  const allowed = new Set(["anonToken", "displayName", "classCode", "mode"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return reject(400, "BAD_REQUEST");

  const { anonToken, displayName, classCode, mode } = body;
  if (typeof anonToken !== "string" || !ANON_TOKEN_PATTERN.test(anonToken)) {
    return reject(400, "BAD_TOKEN");
  }
  if (displayName !== undefined && displayName !== null && typeof displayName !== "string") {
    return reject(400, "BAD_REQUEST");
  }
  if (classCode !== undefined && classCode !== null && typeof classCode !== "string") {
    return reject(400, "BAD_REQUEST");
  }
  if (mode !== undefined && mode !== "standard" && mode !== "retake") {
    return reject(400, "BAD_REQUEST");
  }

  const value: StartBody = { anonToken, mode: mode ?? "standard" };
  const name = typeof displayName === "string" ? displayName.trim() : "";
  if (name) {
    if (name.length > START_DISPLAY_NAME_MAX) return reject(400, "VALIDATION_FAILED");
    value.displayName = name;
  }
  const code = typeof classCode === "string" ? classCode.trim() : "";
  if (code) {
    if (code.length > START_CLASS_CODE_MAX) return reject(400, "CLASS_UNKNOWN");
    value.classCode = code;
  }
  return { ok: true, value };
}

/** `true` if the Content-Type is JSON (`application/json`, any parameters). */
export function isJsonContentType(contentType: string | null | undefined): boolean {
  const type = contentType?.split(";")[0]?.trim().toLowerCase();
  return type === "application/json";
}

export interface OriginCheck {
  /** `Origin` request header. */
  origin?: string | null;
  /** `Sec-Fetch-Site` request header. */
  secFetchSite?: string | null;
  /** This site's origin as the server sees it, e.g. `https://salus.example`. */
  siteOrigin: string;
}

/**
 * Reject cross-site POSTs (a page elsewhere starting attempts in a student's
 * browser). Browsers send `Origin` on every POST and `Sec-Fetch-Site` on
 * every fetch, so either one that says "not us" is refused. A request with
 * neither header isn't from a browser (curl, scripts); those are rate-limited
 * like anyone else and gain nothing from forging, so they pass.
 */
export function isSameOriginRequest(check: OriginCheck): boolean {
  const site = check.secFetchSite?.trim().toLowerCase();
  if (site && site !== "same-origin") return false;
  const origin = check.origin?.trim();
  if (origin) {
    let expected: string;
    try {
      expected = new URL(check.siteOrigin).origin;
    } catch {
      return false;
    }
    if (origin.toLowerCase() !== expected.toLowerCase()) return false;
  }
  return true;
}

/**
 * `ipHash` sent to Convex: HMAC-SHA256 keyed with `NUXT_IP_PEPPER`, hex (64
 * characters). Deterministic for one pepper, so the per-IP rate limit works,
 * and not reversible without the pepper (the IPv4 space is small enough to
 * brute-force a plain hash).
 */
export function computeIpHash(pepper: string, ip: string): string {
  if (!pepper) throw new Error("computeIpHash: pepper must be non-empty");
  return createHmac("sha256", pepper).update(ip, "utf8").digest("hex");
}

const GENERIC_500: StartErrorResponse["body"] = { code: "SERVER_ERROR" };

/** Map an error thrown by `api.attempts.start` to the HTTP response. */
export function mapStartError(err: unknown): StartErrorResponse {
  const code = errorCodeOf(err);
  switch (code) {
    case "BAD_TOKEN":
    case "VALIDATION_FAILED":
    case "CLASS_UNKNOWN":
    case "CLASS_CLOSED":
      return { status: 400, body: { code } };
    case "NOT_FOUND":
      return {
        status: 404,
        body: { code },
        log: "attempts.start returned NOT_FOUND: no published default exam version (seed or publish one).",
      };
    case "RATE_LIMITED": {
      const data = (err as { data?: { retryAfter?: unknown } }).data;
      const raw = typeof data?.retryAfter === "number" ? data.retryAfter : 0;
      const retryAfter = Number.isFinite(raw) && raw > 0 ? Math.ceil(raw) : 0;
      return {
        status: 429,
        body: { code, retryAfter },
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfter / 1000)),
      };
    }
    case "FORBIDDEN":
      return {
        status: 500,
        body: GENERIC_500,
        log: "attempts.start refused the server secret (FORBIDDEN): NUXT_SERVER_SECRET does not match SERVER_SECRET on the Convex deployment.",
      };
    default: {
      // Plain Error (e.g. SERVER_SECRET unset on Convex), network failure, or
      // a code this route doesn't expect. Log the message only: Convex error
      // messages never include our arguments.
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 500,
        body: GENERIC_500,
        log: `attempts.start failed: ${code ?? message}`,
      };
    }
  }
}

/** The 500 for a missing Nuxt env var; `name` goes to the log only. */
export function misconfigured(name: string): StartErrorResponse {
  return {
    status: 500,
    body: GENERIC_500,
    log: `/api/attempts/start: ${name} is not set; see .env.example and docs/LLD.md §15.2.`,
  };
}
