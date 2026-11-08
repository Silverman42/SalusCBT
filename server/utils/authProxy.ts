/**
 * Pure parts of the same-origin `/api/auth/*` proxy (LLD §9.1, §18.1
 * findings 1 and 4). The handler is `server/api/auth/[...].ts`.
 *
 * Mirrors the handler in `@convex-dev/better-auth/nextjs`: hop-by-hop headers
 * dropped, `host` set to the Convex site, the browser-facing origin sent only
 * in `x-better-auth-forwarded-host` / `-proto` (Better Auth honours it only
 * for `trustedOrigins`). On top of that, for the rate limits in
 * `convex/auth.ts`:
 *
 * - `x-salus-client-ip` always carries the client IP the Nuxt server
 *   resolved (`server/utils/ip.ts`). Better Auth's limiter keys on it;
 *   without it every caller shares one bucket.
 * - `x-salus-proxy-secret` carries `NUXT_SERVER_SECRET`, so Convex knows the
 *   IP header came from this proxy (`convex/lib/clientIp.ts`).
 * - Every incoming `x-salus-*` header, and every proxy/IP header the browser
 *   could set, is removed first, so a client can't inject either.
 *
 * Never log the headers built here (they hold the secret) or request bodies
 * (they hold sign-in codes).
 */
import { CLIENT_IP_HEADER, PROXY_SECRET_HEADER } from "../../convex/lib/clientIp";

export { CLIENT_IP_HEADER, PROXY_SECRET_HEADER };

/** Path prefix the proxy serves, on both sides. */
export const AUTH_PATH_PREFIX = "/api/auth/";

/** Headers that describe one hop and break or confuse the outbound fetch. */
const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "host",
];

/**
 * Proxy and client-IP headers a browser could send to steer Convex. Removed
 * before forwarding; the ones Convex needs are then set from trusted values.
 */
const UNTRUSTED_PREFIXES = ["x-salus-", "x-better-auth-", "x-forwarded-", "x-nf-"];
const UNTRUSTED_EXACT = [
  "forwarded",
  "x-real-ip",
  "x-client-ip",
  "true-client-ip",
  "cf-connecting-ip",
  "fastly-client-ip",
];

export interface ProxyHeaderOptions {
  /** Headers of the incoming browser request. */
  incoming: Headers;
  /** The URL the browser requested (gives the forwarded host and proto). */
  requestUrl: URL;
  /** The Convex site URL (`https://<deployment>.convex.site`). */
  convexSiteUrl: string;
  /** Resolved client IP, or `null` if unknown. */
  clientIp: string | null;
  /** `NUXT_SERVER_SECRET`; empty means not configured. */
  serverSecret: string;
}

function isUntrusted(name: string): boolean {
  return (
    UNTRUSTED_EXACT.includes(name) || UNTRUSTED_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

/** The headers to send to Convex for one proxied request. */
export function buildProxyHeaders(options: ProxyHeaderOptions): Headers {
  const headers = new Headers();
  for (const [name, value] of options.incoming) {
    // Headers iterates lower-cased names.
    if (HOP_BY_HOP.includes(name) || isUntrusted(name)) continue;
    headers.append(name, value);
  }

  // fetch() decompresses the body but keeps Content-Encoding, which would
  // then be passed back to the browser; ask Convex for an uncompressed reply
  // (same as the Next.js handler).
  headers.set("accept-encoding", "application/json");
  headers.set("host", new URL(options.convexSiteUrl).host);
  headers.set("x-better-auth-forwarded-host", options.requestUrl.host);
  headers.set("x-better-auth-forwarded-proto", options.requestUrl.protocol.replace(/:$/, ""));

  if (options.clientIp) headers.set(CLIENT_IP_HEADER, options.clientIp);
  if (options.serverSecret) headers.set(PROXY_SECRET_HEADER, options.serverSecret);
  return headers;
}

/**
 * The Convex URL for a browser request, or `null` if the path isn't under
 * `/api/auth/`. Only the path and query are taken from the browser.
 */
export function authProxyTarget(requestUrl: URL, convexSiteUrl: string): string | null {
  if (!requestUrl.pathname.startsWith(AUTH_PATH_PREFIX)) return null;
  const base = convexSiteUrl.replace(/\/+$/, "");
  return `${base}${requestUrl.pathname}${requestUrl.search}`;
}
