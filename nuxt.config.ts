import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// `npx convex dev` writes CONVEX_DEPLOYMENT and CONVEX_URL to .env.local.
// Nuxt only reads .env, so load .env.local here for local development.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineNuxtConfig({
  compatibilityDate: "2026-11-01",
  devtools: { enabled: true },

  modules: ["@nuxt/ui", "@nuxt/eslint"],

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
    "/sign-in": { ssr: false },
    "/invite/**": { ssr: false },
    // Share pages (CL-9, LLD §14.1): SSR, cached at the CDN for 60 s and never
    // in the browser, so a revoked link stops working within a minute. No
    // stale-while-revalidate: that would serve a revoked result past 60 s.
    // Cached HTML can't carry per-request CSP nonces (LLD §18.1 finding 5):
    // T-218 must use hashes for these pages.
    "/r/**": {
      headers: {
        "cache-control": "public, max-age=0, must-revalidate",
        "netlify-cdn-cache-control": "public, s-maxage=60",
        "x-robots-tag": "noindex, nofollow",
        "referrer-policy": "no-referrer",
      },
    },
  },

  // Mockup defaults to the light theme; the header toggle switches to dark.
  colorMode: {
    preference: "system",
    fallback: "light",
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
