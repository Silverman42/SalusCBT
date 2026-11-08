# T-101 · Scaffold Nuxt 4 + Convex project

| | |
| --- | --- |
| Stage | 1 · Setup |
| Depends on | None |
| Requirements | `AR-1` |
| Design refs | LLD §1, §2; HLD D1, D2 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Create the single repo with Nuxt 4 in `app/` and Convex in `convex/`, matching the LLD folder layout.

## Steps

- `git init`; create the Nuxt 4 app (Vue 3.5, TypeScript `strict`).
- Add `@nuxt/ui` (Tailwind v4) with dark/light mode.
- Add `convex`, run `npx convex dev` to create a personal dev deployment.
- Create empty folders from LLD §1: `app/{pages,components/*,composables,lib,middleware}`, `server/`, `convex/{lib,marking,generators,email}`, `shared/`, `content/{source,seed}`, `scripts/`, `tests/{unit,convex,e2e}`.
- Add ESLint + Prettier, `vitest`, `convex-test`, `@playwright/test`.
- `.gitignore` covers `.env*`, `.output`, `node_modules`, `.convex` (SE-8).

## Files

- `package.json`
- `nuxt.config.ts`
- `app/app.config.ts`
- `convex/`
- `.gitignore`
- `tsconfig.json`

## Acceptance criteria

- [x] `npm run dev` serves a blank page; `npx convex dev` connects.
- [x] `npm run lint`, `npm run typecheck` and `npm test` all run (even with no tests).
- [x] No secrets in the repo.

## Notes

- **2026-11-08:** scaffold done. Nuxt 4.6, Nuxt UI 4.12, Convex 1.49, TypeScript 6.0 (pinned below 7: vue-tsc needs the JS compiler API). `npm run dev` serves the placeholder landing; lint, typecheck (Nuxt + `convex/`) and tests pass.
  - Theme follows `mockup/Salus Mockups.dc.html`: light/dark tokens in `app/assets/css/main.css` (utilities such as `bg-surface`, `text-muted-fg`, `bg-ok-soft`), `salus` primary and `ink` neutral palettes in `app/app.config.ts`, Figtree and JetBrains Mono via `@nuxt/fonts`.
  - App shell (header, theme toggle, footer disclaimer) and hero art from mockup screen 01. The start form is T-211.
  - `convex/schema.ts` is an empty placeholder until T-104.
  - `npx convex dev` connected to a Convex Cloud dev deployment; `.env.local` (git-ignored) is written and the app reads `CONVEX_URL` from it. Playwright Chromium installed.
