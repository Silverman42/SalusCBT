import { isIP } from "node:net";

/**
 * The browser's IP address as the Nuxt server sees it (LLD §9.1, D6).
 *
 * Trust assumption: Salus runs on Netlify, whose edge sets
 * `x-nf-client-connection-ip` to the address of the TCP connection it
 * accepted, replacing any value the client sent. That header is the only one
 * trusted in production. `x-forwarded-for` can be written by the client, so
 * its leftmost entry is used only when `trustForwardedFor` is set (local
 * development behind a dev proxy). Last comes the socket's peer address,
 * which can't be forged but is the proxy's address when there is one.
 *
 * Kept free of h3 so it can be unit-tested; `requestClientIp` in
 * `authProxy.ts` feeds it from the event.
 */

/** Header Netlify's edge sets to the real client address. */
export const NETLIFY_CLIENT_IP_HEADER = "x-nf-client-connection-ip";

export interface ClientIpSources {
  /** Value of `x-nf-client-connection-ip`. */
  netlifyClientIp?: string | null;
  /** Value of `x-forwarded-for` (may be a comma-separated list). */
  forwardedFor?: string | null;
  /** The socket's remote address. */
  socketIp?: string | null;
  /** Use `x-forwarded-for`. Only for local development. */
  trustForwardedFor?: boolean;
}

/** A single valid IPv4 or IPv6 literal, normalised; otherwise `null`. */
export function normaliseIp(value: string | null | undefined): string | null {
  let ip = value?.trim();
  if (!ip) return null;
  // "[::1]" (bracketed IPv6) and IPv4-mapped IPv6 ("::ffff:203.0.113.7").
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) ip = mapped[1]!;
  return isIP(ip) === 0 ? null : ip.toLowerCase();
}

/** The client IP to report to Convex, or `null` if none is known. */
export function resolveClientIp(sources: ClientIpSources): string | null {
  const fromNetlify = normaliseIp(sources.netlifyClientIp);
  if (fromNetlify) return fromNetlify;
  if (sources.trustForwardedFor) {
    const first = sources.forwardedFor?.split(",")[0];
    const fromForwarded = normaliseIp(first);
    if (fromForwarded) return fromForwarded;
  }
  return normaliseIp(sources.socketIp);
}
