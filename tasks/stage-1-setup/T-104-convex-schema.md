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

- [ ] `npx convex dev` pushes the schema with no errors.
- [ ] `answerKeys` is a separate table; nothing else stores correct answers.
- [ ] `classes.timeMultiplier` field present (EX-21; default 1).
