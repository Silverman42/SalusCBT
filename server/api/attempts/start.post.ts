// POST /api/attempts/start (LLD §7.1, T-203). Validates the browser's body,
// hashes the client IP with NUXT_IP_PEPPER, and calls `api.attempts.start`
// with NUXT_SERVER_SECRET. Rules and the error mapping are in
// server/utils/attemptStart.ts; client-IP trust is in server/utils/ip.ts.
//
// Responses (always `Cache-Control: no-store`):
//   200 { attemptId, deadline, serverNow }
//   400 { code: "BAD_REQUEST" | "BAD_TOKEN" | "VALIDATION_FAILED" | "CLASS_UNKNOWN" | "CLASS_CLOSED" }
//   403 { code: "CROSS_ORIGIN" }      413 { code: "PAYLOAD_TOO_LARGE" }
//   404 { code: "NOT_FOUND" }         415 { code: "UNSUPPORTED_MEDIA_TYPE" }
//   429 { code: "RATE_LIMITED", retryAfter /* ms */ } + Retry-After (s)
//   500 { code: "SERVER_ERROR" }      (missing env, wrong secret, Convex failure)
//
// The raw IP, the anon token and the server secret are never logged or
// returned; only the IP's HMAC leaves this function.
import { ConvexHttpClient } from "convex/browser";
import { api } from "~~/convex/_generated/api";
import type { H3Event } from "h3";

/** Hash input when no client IP can be resolved (one shared bucket). */
const UNKNOWN_IP = "unknown";

function send(event: H3Event, error: StartErrorResponse) {
  if (error.log) console.error(`[attempts/start] ${error.log}`);
  if (error.retryAfterSeconds !== undefined) {
    setResponseHeader(event, "Retry-After", error.retryAfterSeconds);
  }
  setResponseStatus(event, error.status);
  return error.body;
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "Cache-Control", "no-store");

  // 1. Same-origin only (no cross-site starts from another page).
  const sameOrigin = isSameOriginRequest({
    origin: getRequestHeader(event, "origin"),
    secFetchSite: getRequestHeader(event, "sec-fetch-site"),
    siteOrigin: getRequestURL(event).origin,
  });
  if (!sameOrigin) return send(event, { status: 403, body: { code: "CROSS_ORIGIN" } });

  // 2. JSON only (a cross-site form post can't send it without a preflight).
  if (!isJsonContentType(getRequestHeader(event, "content-type"))) {
    return send(event, { status: 415, body: { code: "UNSUPPORTED_MEDIA_TYPE" } });
  }
  const declaredLength = Number(getRequestHeader(event, "content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > START_BODY_MAX_BYTES) {
    return send(event, { status: 413, body: { code: "PAYLOAD_TOO_LARGE" } });
  }

  // 3. Body shape.
  const parsed = parseStartBody(await readRawBody(event, "utf8"));
  if (!parsed.ok) return send(event, parsed.error);

  // 4. Server configuration (checked after validation so bad input is a 400).
  const config = useRuntimeConfig(event);
  if (!config.public.convexUrl) return send(event, misconfigured("NUXT_PUBLIC_CONVEX_URL"));
  if (!config.serverSecret) return send(event, misconfigured("NUXT_SERVER_SECRET"));
  if (!config.ipPepper) return send(event, misconfigured("NUXT_IP_PEPPER"));

  // 5. ipHash: the raw IP stops here.
  const clientIp = resolveClientIp({
    netlifyClientIp: getRequestHeader(event, NETLIFY_CLIENT_IP_HEADER),
    forwardedFor: getRequestHeader(event, "x-forwarded-for"),
    socketIp: getRequestIP(event),
    // x-forwarded-for is client-writable; only trust it in `nuxt dev`.
    trustForwardedFor: import.meta.dev,
  });
  if (!clientIp) console.warn("[attempts/start] no client IP resolved; using the shared bucket.");
  const ipHash = computeIpHash(config.ipPepper, clientIp ?? UNKNOWN_IP);

  // 6. Convex.
  const client = new ConvexHttpClient(config.public.convexUrl, { logger: false });
  try {
    const result = await client.mutation(api.attempts.start, {
      serverSecret: config.serverSecret,
      ipHash,
      ...parsed.value,
    });
    return {
      attemptId: result.attemptId,
      deadline: result.deadline,
      serverNow: result.serverNow,
    };
  } catch (err) {
    return send(event, mapStartError(err));
  }
});
