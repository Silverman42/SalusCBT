/**
 * Which client IP the auth code may trust (LLD §9.1, §12.1, §18.1 finding 4).
 *
 * The Nuxt proxy (T-403) forwards `/api/auth/*` to the `.convex.site` URL and
 * sets `x-salus-client-ip` from Netlify's client-IP header. Anyone can call
 * the `.convex.site` URL directly and set that header too, so it is trusted
 * only when the request also carries `x-salus-proxy-secret` equal to
 * `SERVER_SECRET` (shared with Nuxt as `NUXT_SERVER_SECRET`). Otherwise the
 * TCP peer address Convex reports (`ctx.meta.getRequestMetadata().ip`) is
 * used: for a direct caller that is their real address, and it can't be
 * forged with a header.
 *
 * `SERVER_SECRET` unset → the header is never trusted (fail safe). Proxied
 * requests then all share the proxy's address, so the per-IP OTP limit
 * becomes one shared bucket; the per-email limits still apply.
 */

export const CLIENT_IP_HEADER = "x-salus-client-ip";
export const PROXY_SECRET_HEADER = "x-salus-proxy-secret";

const encoder = new TextEncoder();

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

/** Compare two secrets without leaking where they differ (or their length). */
export async function secretsMatch(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i]! ^ hb[i]!;
  return diff === 0;
}

/** A single plausible IPv4/IPv6 literal; anything else is ignored. */
function plausibleIp(value: string | null): string | null {
  const ip = value?.trim();
  if (!ip || ip.length > 45 || !/^[0-9a-fA-F.:]+$/.test(ip)) return null;
  return ip;
}

let warnedMissingSecret = false;

/**
 * The client IP to rate-limit on: the proxy's header when the shared secret
 * matches, otherwise `peerIp` (null when there is no HTTP caller).
 */
export async function trustedClientIp(
  headers: Headers,
  peerIp: string | null,
  serverSecret: string | undefined,
): Promise<string | null> {
  const presented = headers.get(PROXY_SECRET_HEADER);
  if (!serverSecret) {
    if (presented !== null && !warnedMissingSecret) {
      warnedMissingSecret = true;
      console.error(
        `[auth] SERVER_SECRET is not set; ignoring ${CLIENT_IP_HEADER} from the proxy. Set SERVER_SECRET on this deployment (same value as NUXT_SERVER_SECRET).`,
      );
    }
    return peerIp;
  }
  if (presented !== null && (await secretsMatch(presented, serverSecret))) {
    return plausibleIp(headers.get(CLIENT_IP_HEADER)) ?? peerIp;
  }
  return peerIp;
}

/**
 * Opaque rate-limit key for an IP: HMAC-SHA256 keyed with `secret`, base64url.
 * Raw addresses aren't stored in Salus tables (PR-3).
 */
export async function ipRateLimitKey(ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`ip:${ip}`)));
  let bin = "";
  for (const b of mac) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
