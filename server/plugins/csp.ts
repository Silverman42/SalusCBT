/**
 * Runtime parts of the CSP (T-218). `nuxt-security` builds and sends the
 * header from `nuxt.config.ts`; this plugin, which runs before nuxt-security's
 * own plugins, adds what is only known at runtime:
 *
 * 1. `connect-src` for the Convex deployment in `runtimeConfig.public.convexUrl`
 *    (`NUXT_PUBLIC_CONVEX_URL` can change at runtime, so not baked in at build).
 * 2. On `/r/**` (HTML cached at the CDN for 60 s, so no per-request nonce), the
 *    SHA-256 hashes of the inline scripts and styles in `head` and `bodyAppend`.
 *    nuxt-security's `50-updateCsp` appends `event.context.security.hashes` to
 *    `script-src` and `style-src(-elem)` in `render:response`. The rendered app
 *    body is never hashed (LLD §18.1 finding 5).
 */
import { connectSrc, hashInlineTags, usesHashedCsp } from "../utils/csp";

export default defineNitroPlugin((nitroApp) => {
  const sources = connectSrc(useRuntimeConfig().public.convexUrl as string | undefined);

  nitroApp.hooks.hook("nuxt-security:routeRules", (routeRules) => {
    for (const rule of Object.values(routeRules)) {
      const csp = rule.headers ? rule.headers.contentSecurityPolicy : undefined;
      if (csp && typeof csp === "object" && "connect-src" in csp) {
        csp["connect-src"] = [...sources];
      }
    }
  });

  nitroApp.hooks.hook("render:html", (html, { event }) => {
    if (!usesHashedCsp(event.path)) return;
    const { scripts, styles } = hashInlineTags([...html.head, ...html.bodyAppend]);
    event.context.security ??= {};
    // In dev, style-src-elem allows 'unsafe-inline' (nuxt.config.ts), which a
    // hash would switch off.
    event.context.security.hashes = {
      script: new Set(scripts),
      style: new Set(import.meta.dev ? [] : styles),
    };
  });
});
