/**
 * Pure parts of the Content-Security-Policy (T-218, LLD §15.1, §18.1 finding 5).
 *
 * `nuxt-security` sends the headers; `nuxt.config.ts` holds the directives and
 * `server/plugins/csp.ts` fills in the two parts known only at runtime:
 *
 * - `connect-src` gets the Convex deployment from `runtimeConfig.public.convexUrl`
 *   (the client talks to it over https and wss).
 * - Pages whose HTML a CDN caches (`/r/**`) can't carry a per-request nonce, so
 *   they get SHA-256 hashes of the inline scripts and styles Nuxt writes into
 *   `<head>` and the end of `<body>` instead.
 */
import { createHash } from "node:crypto";

/** Used when no Convex URL is configured: any Convex Cloud deployment. */
export const CONVEX_CLOUD_FALLBACK = ["https://*.convex.cloud", "wss://*.convex.cloud"];

/**
 * `connect-src` sources for the Convex client: the deployment origin over
 * https and wss. Falls back to `*.convex.cloud` when the URL is missing or
 * not a valid http(s) URL, so a misconfigured build still loads.
 */
export function convexConnectSources(convexUrl: string | undefined): string[] {
  if (!convexUrl) return [...CONVEX_CLOUD_FALLBACK];
  let url: URL;
  try {
    url = new URL(convexUrl);
  } catch {
    return [...CONVEX_CLOUD_FALLBACK];
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return [...CONVEX_CLOUD_FALLBACK];
  const ws = url.protocol === "https:" ? "wss:" : "ws:";
  return [`${url.protocol}//${url.host}`, `${ws}//${url.host}`];
}

/** The full `connect-src` list: same origin (the /api routes) plus Convex. */
export function connectSrc(convexUrl: string | undefined): string[] {
  return ["'self'", ...convexConnectSources(convexUrl)];
}

/** Paths whose HTML is cached at the CDN (`/r/**`), so they use hashes, not nonces. */
export function usesHashedCsp(path: string): boolean {
  const pathname = path.split("?")[0] ?? "";
  return pathname.startsWith("/r/");
}

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const STYLE_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const SRC_ATTR_RE = /\ssrc\s*=/i;
const TYPE_ATTR_RE = /\stype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

/** Script types the browser executes, so CSP applies (importmap included). */
const EXECUTABLE_TYPES = new Set([
  "",
  "module",
  "importmap",
  "text/javascript",
  "application/javascript",
]);

function isExecutableInlineScript(attrs: string): boolean {
  if (SRC_ATTR_RE.test(attrs)) return false;
  const match = TYPE_ATTR_RE.exec(attrs);
  const type = (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim().toLowerCase();
  return EXECUTABLE_TYPES.has(type);
}

/** CSP hash source for a script or style body, e.g. `'sha256-…'`. */
export function cspHash(content: string): string {
  return `'sha256-${createHash("sha256").update(content, "utf8").digest("base64")}'`;
}

/**
 * The `<style>` @nuxtjs/color-mode adds for a moment on every theme switch to
 * stop transitions (Nuxt UI turns `disableTransition` on). Created by script
 * with no nonce, so it is allowed by hash. A unit test checks it still matches
 * the module's source.
 */
export const COLOR_MODE_TRANSITION_STYLE =
  "*{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}";

/** Hashes allowed in `style-src-elem` on every page. */
export const STATIC_STYLE_HASHES = [cspHash(COLOR_MODE_TRANSITION_STYLE)];

export interface InlineHashes {
  scripts: string[];
  styles: string[];
}

/**
 * Hashes every non-empty inline executable `<script>` and every `<style>` in
 * the given HTML chunks. Pass only the chunks Nuxt itself writes (`head` and
 * `bodyAppend`), never the rendered app body: hashing that would whitelist an
 * injected script.
 */
export function hashInlineTags(chunks: readonly string[]): InlineHashes {
  const scripts = new Set<string>();
  const styles = new Set<string>();
  for (const chunk of chunks) {
    for (const [, attrs = "", body = ""] of chunk.matchAll(SCRIPT_RE)) {
      if (body && isExecutableInlineScript(attrs)) scripts.add(cspHash(body));
    }
    for (const [, body = ""] of chunk.matchAll(STYLE_RE)) {
      if (body) styles.add(cspHash(body));
    }
  }
  return { scripts: [...scripts], styles: [...styles] };
}
