import { existsSync } from "node:fs";

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
    public: {
      // Set by `convex deploy --cmd-url-env-var-name NUXT_PUBLIC_CONVEX_URL` on Netlify (LLD §15.3),
      // or taken from CONVEX_URL in .env.local during local development.
      convexUrl: process.env.NUXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL ?? "",
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

  eslint: {
    config: {
      stylistic: false,
    },
  },
});
