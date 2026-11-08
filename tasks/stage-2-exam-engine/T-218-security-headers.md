# T-218 · Security headers and CSP

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-110](../stage-1-setup/T-110-netlify-setup.md) |
| Requirements | `SE-7` |
| Design refs | LLD §15.1 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Strict headers on every response.

## Steps

- Add `routeRules` headers in `nuxt.config.ts` from LLD §15.1 (CSP with the Convex URLs, HSTS, `X-Frame-Options: DENY`, nosniff, Referrer-Policy, Permissions-Policy).
- Use nonces instead of `style-src 'unsafe-inline'` if the spike showed it's possible.

## Files

- `nuxt.config.ts`

## Acceptance criteria

- [x] Headers present on pages and server routes (check with `curl -I`).
- [ ] No CSP violations in the console during a full sitting.

## Notes

- Done 2026-11-08 (local production build; Netlify check waits on T-110). Uses `nuxt-security@2.7.0` (pinned; needs `@nuxt/kit ^4.2.1`). Its request middlewares are off (rate limiter, size limiter, XSS validator, CORS handler, method restricter): the app's own limits on `/api/auth` and `/api/attempts/start` stay authoritative. `removeLoggers` is off so console output is unchanged.
- CSP on SSR and client-only pages: `default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; script-src-attr 'none'; style-src / style-src-elem 'self' 'nonce-…' 'sha256-GNF7…'; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://<deployment> wss://<deployment>; object-src 'none'; frame-src 'none'; worker-src / manifest-src / media-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`. No `upgrade-insecure-requests` (breaks http://localhost; Netlify is HTTPS-only and sends HSTS).
- `/r/**` (CDN-cached for 60 s): no nonce. `server/plugins/csp.ts` hashes (SHA-256) the inline executable scripts and styles in Nuxt's `head` and `bodyAppend` chunks per response; the rendered app body is never hashed, so an injected script can't whitelist itself. `script-src 'self' 'sha256-…'` without `'strict-dynamic'` (with hashes alone it would block the external `/_nuxt/` entry). The hashes are in the cached response next to the HTML they match.
- `connect-src` is set at runtime from `runtimeConfig.public.convexUrl` (https + wss of that host only) through nuxt-security's `nuxt-security:routeRules` hook, so `NUXT_PUBLIC_CONVEX_URL` can change without a rebuild. `*.convex.cloud` is used only when the URL is missing or invalid. The Convex site URL is server-side only (auth proxy) and isn't listed.
- `/api/**` and `/downloads/**` (never HTML) get `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` and CORP `same-origin`. `build-lab.sh` keeps its attachment headers.
- Other headers everywhere: HSTS `max-age=31536000; includeSubDomains` (not in dev), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (`/r/**` keeps `no-referrer`), `X-Permitted-Cross-Domain-Policies: none`, `X-Download-Options: noopen`, `X-DNS-Prefetch-Control: off`, `X-XSS-Protection: 0`. On pages also: `Permissions-Policy: camera=(), display-capture=(), fullscreen=(), geolocation=(), microphone=(), payment=(), usb=()`, COOP `same-origin`, CORP `same-origin`, `Origin-Agent-Cluster: ?1`. COEP off (not needed). `X-Powered-By` removed.
- Browser-side fixes the strict `style-src-elem` needed: (1) `app/plugins/csp-nonce.client.ts` stamps the nonce on `<style>` tags that unhead or modules add to `<head>` (client-only pages render Nuxt UI's theme colours in the browser); (2) @nuxtjs/color-mode's fixed transition-blocking style is allowed by hash (`STATIC_STYLE_HASHES`; a unit test checks it still matches the module source); (3) `icon.mode: "svg"`, because CSS mode injects a `<style>` per icon, which the hash-only `/r/**` policy blocks; (4) `icon.clientBundle.scan` + `fallbackToApi: false`, because on client-only pages @nuxt/icon fetched icons from `api.iconify.design` (blocked by `connect-src`, and a third-party request).
- `nuxt dev` only: `style-src(-elem)` is `'self' 'unsafe-inline'` (Vite and DevTools inject styles before app code runs). Scripts stay nonce-based.
- Verified: `nuxt build` + `node .output/server/index.mjs` on :4500, `curl` of `/`, `/sign-in`, `/exam/x`, `/r/x`, `/lab`, `/privacy`, `/downloads/build-lab.sh`, `/api/auth/get-session`. In the browser: `/`, `/sign-in`, `/lab`, `/privacy`, `/exam/x`, `/r/x` load and hydrate with zero CSP violations, the theme toggle works on each, client-side navigation between them is clean, a wss connection to the Convex deployment is allowed. Also `nuxt dev`: `/`, `/sign-in`, `/r/x` clean. Unit tests: `tests/unit/server/csp.test.ts`.
- Open: a full sitting (start → PBQs → MCQs → submit → result → share page with real data) still needs a run once attempts can be started end to end; the second criterion stays open until then.
