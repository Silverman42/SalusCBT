import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { STATIC_STYLE_HASHES, connectSrc } from "./server/utils/csp";

// `npx convex dev` writes CONVEX_DEPLOYMENT and CONVEX_URL to .env.local.
// Nuxt only reads .env, so load .env.local here for local development.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const isDev = process.env.NODE_ENV === "development";

// CSP (T-218, LLD §15.1, §18.1 finding 5). Scripts: a per-request nonce plus
// 'strict-dynamic' (the import map, colour-mode script and __NUXT__ config are
// inline). Styles: Nuxt UI's inline <style> blocks take the nonce through
// style-src-elem (app/plugins/csp-nonce.client.ts covers the ones unhead adds
// in the browser), plus the fixed colour-mode transition style by hash. Vue /
// Nuxt UI style bindings need style-src-attr 'unsafe-inline'. connect-src is
// replaced at runtime from runtimeConfig.public.convexUrl
// (server/plugins/csp.ts).
// In `nuxt dev` only, Vite and Nuxt DevTools inject <style> tags before any
// app code runs, so inline styles are allowed there; production is strict.
const styleElemSrc = isDev
  ? ["'self'", "'unsafe-inline'"]
  : ["'self'", "'nonce-{{nonce}}'", ...STATIC_STYLE_HASHES];
const csp = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'nonce-{{nonce}}'", "'strict-dynamic'"],
  "script-src-attr": ["'none'"],
  "style-src": styleElemSrc,
  "style-src-elem": styleElemSrc,
  "style-src-attr": ["'unsafe-inline'"],
  "img-src": ["'self'", "data:"],
  // @nuxt/fonts downloads the Google fonts at build time and serves them from /_fonts/.
  "font-src": ["'self'"],
  "connect-src": connectSrc(process.env.NUXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL),
  "object-src": ["'none'"],
  "frame-src": ["'none'"],
  "worker-src": ["'self'"],
  "manifest-src": ["'self'"],
  "media-src": ["'self'"],
  "frame-ancestors": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  // Netlify serves HTTPS only and HSTS covers the upgrade; this directive
  // would break the production build served over http://localhost.
  "upgrade-insecure-requests": false,
};

/**
 * Extra headers for responses that are never HTML (API JSON, the lab
 * download). nuxt-security adds CSP, COOP, CORP and Permissions-Policy to
 * rendered pages only; it sends the rest everywhere.
 */
const NON_HTML_HEADERS = {
  "content-security-policy":
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "cross-origin-resource-policy": "same-origin",
};

export default defineNuxtConfig({
  compatibilityDate: "2026-11-01",
  devtools: { enabled: true },

  modules: ["@nuxt/ui", "@nuxt/eslint", "nuxt-security"],

  // Security headers (T-218, LLD §15.1). The app's own limits stay
  // authoritative, so nuxt-security's request middlewares are off: the rate
  // and size limiters would double up on /api/auth and /api/attempts/start,
  // and the XSS validator rejects legitimate request bodies.
  security: {
    headers: {
      contentSecurityPolicy: csp,
      strictTransportSecurity: isDev ? false : { maxAge: 31536000, includeSubdomains: true },
      xFrameOptions: "DENY",
      xContentTypeOptions: "nosniff",
      referrerPolicy: "strict-origin-when-cross-origin",
      permissionsPolicy: {
        camera: [],
        microphone: [],
        geolocation: [],
        "display-capture": [],
        fullscreen: [],
        payment: [],
        usb: [],
      },
      crossOriginOpenerPolicy: "same-origin",
      crossOriginResourcePolicy: "same-origin",
      // Not needed (no SharedArrayBuffer) and not in LLD §15.1.
      crossOriginEmbedderPolicy: false,
    },
    nonce: true,
    sri: true,
    rateLimiter: false,
    requestSizeLimiter: false,
    xssValidator: false,
    corsHandler: false,
    allowedMethodsRestricter: false,
    removeLoggers: false,
    hidePoweredBy: true,
  },

  css: ["~/assets/css/main.css"],

  typescript: {
    strict: true,
  },

  runtimeConfig: {
    // Server-only. Target of the /api/auth proxy (LLD §15.2): NUXT_CONVEX_SITE_URL
    // on Netlify, CONVEX_SITE_URL from .env.local during local development.
    convexSiteUrl: process.env.NUXT_CONVEX_SITE_URL ?? process.env.CONVEX_SITE_URL ?? "",
    // Server-only. Shared with Convex as SERVER_SECRET (LLD §18.1 finding 4).
    // Nuxt also overrides it at runtime from NUXT_SERVER_SECRET.
    serverSecret: process.env.NUXT_SERVER_SECRET ?? "",
    // Server-only. HMAC key for the ipHash sent to attempts.start (LLD §7.1,
    // §15.2), so Convex never sees a raw IP. Overridden by NUXT_IP_PEPPER.
    ipPepper: process.env.NUXT_IP_PEPPER ?? "",
    public: {
      // Set by `convex deploy --cmd-url-env-var-name NUXT_PUBLIC_CONVEX_URL` on Netlify (LLD §15.3),
      // or taken from CONVEX_URL in .env.local during local development.
      convexUrl: process.env.NUXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL ?? "",
    },
  },

  // Tutor and admin pages render in the browser only (LLD §14.1), so their
  // route guards always run where the Better Auth client is.
  routeRules: {
    "/tutor": { ssr: false },
    "/tutor/**": { ssr: false },
    "/admin/**": { ssr: false },
    "/oral": { ssr: false }, // tutor area (T-507)
    "/sign-in": { ssr: false },
    "/invite/**": { ssr: false },
    // The exam runner and its result/review pages read the anon token from
    // localStorage, so they render in the browser only (LLD §14.1).
    "/exam/**": { ssr: false },
    // Same for the student history (T-217): it lists attempts by that token.
    "/history": { ssr: false },
    // Share pages (CL-9, LLD §14.1): SSR, cached at the CDN for 60 s and never
    // in the browser, so a revoked link stops working within a minute. No
    // stale-while-revalidate: that would serve a revoked result past 60 s.
    // Cached HTML can't carry per-request CSP nonces (LLD §18.1 finding 5),
    // so these pages use SHA-256 hashes of Nuxt's inline scripts and styles,
    // added per response by server/plugins/csp.ts. No 'strict-dynamic': with
    // hashes only, it would block the external /_nuxt/ entry script.
    "/r/**": {
      security: {
        nonce: false,
        headers: {
          contentSecurityPolicy: {
            "script-src": ["'self'"],
            "style-src": isDev ? styleElemSrc : ["'self'", ...STATIC_STYLE_HASHES],
            "style-src-elem": isDev ? styleElemSrc : ["'self'", ...STATIC_STYLE_HASHES],
          },
        },
      },
      headers: {
        "cache-control": "public, max-age=0, must-revalidate",
        "netlify-cdn-cache-control": "public, s-maxage=60",
        "x-robots-tag": "noindex, nofollow",
        "referrer-policy": "no-referrer",
      },
    },
    // Server routes return JSON or files, never HTML: lock them down fully (T-218).
    "/api/**": { headers: NON_HTML_HEADERS },
    "/downloads/**": { headers: NON_HTML_HEADERS },
  },

  // Mockup defaults to the light theme; the header toggle switches to dark.
  colorMode: {
    preference: "system",
    fallback: "light",
  },

  // Icons never come from api.iconify.design: connect-src allows only 'self'
  // and Convex (T-218). The icons used in the source ship in the client bundle
  // (on client-only pages @nuxt/icon otherwise fetches them from the Iconify
  // API before its config loads); any other icon comes from the app's own
  // /api/_nuxt_icon endpoint. Inline SVG mode: the default CSS mode adds a
  // <style> per icon in the browser, which the hash-only CSP on /r/** blocks.
  // The scan includes .ts files: icon names in app/lib and app/composables
  // (e.g. the result pages' not-found icon) were otherwise fetched from the
  // Iconify API, which the CSP blocks (X-01).
  icon: {
    mode: "svg",
    clientBundle: { scan: { globInclude: ["app/**/*.{vue,ts}"] } },
    fallbackToApi: false,
  },

  fonts: {
    families: [
      { name: "Figtree", provider: "google", weights: [400, 500, 600, 700, 800] },
      { name: "JetBrains Mono", provider: "google", weights: [400, 600] },
    ],
  },

  nitro: {
    // Bundle build-lab.sh into the server build so the download works on Netlify
    // functions (no repo filesystem). The pattern keeps the exam markdown, which
    // holds the answer key, out of the bundle (SE-1).
    serverAssets: [
      {
        baseName: "lab",
        dir: fileURLToPath(new URL("./content/source", import.meta.url)),
        pattern: "build-lab.sh",
      },
    ],
  },

  eslint: {
    config: {
      stylistic: false,
    },
  },
});
