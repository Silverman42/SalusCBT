# T-104 · Write the Convex schema and register components

| | |
| --- | --- |
| Stage | 1 · Setup |
| Depends on | [T-101](T-101-scaffold-project.md) |
| Requirements | `SE-1`, `ED-4` |
| Design refs | LLD §3.1; HLD §6, D8, D9 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Define every table and index exactly as LLD §3.1, and register the Better Auth and rate-limiter components.

## Steps

- Write `convex/schema.ts` with: profiles, invitations, exams, examVersions, questions, answerKeys, oralQuestions, classes, attempts, responses, shareLinks, auditLog — with all listed indexes.
- Write `convex/convex.config.ts` registering `betterAuth` and `rateLimiter` components.
- If the spike chose the §9.4 fallback, add `otpCodes` and `sessions` tables instead of the Better Auth component.

## Files

- `convex/schema.ts`
- `convex/convex.config.ts`

## Acceptance criteria

- [x] `npx convex dev` pushes the schema with no errors.
- [x] `answerKeys` is a separate table; nothing else stores correct answers.
- [x] `classes.timeMultiplier` field present (EX-21; default 1).

## Notes

- 2026-11-08: Spike (T-003) chose the Better Auth primary path, so no `otpCodes`/`sessions` tables. `convex.config.ts` mounts `betterAuth` and `rateLimiter`; auth config (`auth.ts`, `auth.config.ts`, `http.ts`) is left to T-402.
- Packages: `better-auth@1.7.18` and `@convex-dev/better-auth@0.13.0` (both exact), `@convex-dev/rate-limiter@^0.4.3`.
- Schema copies LLD §3.1 verbatim, including its index names (`by_email_status`, `by_version` on `oralQuestions` covering `[versionId, order]`), which don't follow the Convex `by_a_and_b` naming guideline.
- `questions.payload`, `answerKeys.parts` and `responses.value` are `v.any()` as LLD §3.1 says, marked `TODO(T-105)` to point at the `shared/content.ts` types. Writers must validate them.
- `classes.timeMultiplier` is a required `v.number()`. Convex has no column defaults, so class writers set `1` unless the tutor picks another value.
- `npx convex dev --once` pushed to `blissful-spaniel-919` with no errors. `tests/convex/schema.test.ts` (convex-test) inserts profile → exam → version → question → answer key → class rows and checks that a class without `timeMultiplier` is rejected.
