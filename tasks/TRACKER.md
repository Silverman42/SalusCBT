# Salus — Implementation Tracker

Single source of truth for task status. Task details live in the linked files; requirements in [docs/PRD.md](../docs/PRD.md), design in [docs/HLD.md](../docs/HLD.md) and [docs/LLD.md](../docs/LLD.md).

## How to use

- Change a task's **Status** here when you start, block, review or finish it. Update **Owner**, **Updated** (YYYY-MM-DD) and **Notes**.
- Tick acceptance criteria inside the task file as you go; a task is **Done** only when all are ticked.
- Start a task only when everything in **Depends on** is Done (or agreed otherwise in Notes).
- Record decisions in the decision log and blockers in the blockers table below.

**Status values:** `Not started` · `In progress` · `Blocked` · `In review` · `Done` · `Dropped`

## Summary

| Stage | Tasks | Not started | In progress | Blocked | In review | Done |
| --- | --- | --- | --- | --- | --- | --- |
| 0 · Decisions and inputs | 3 | 0 | 0 | 0 | 0 | 3 |
| 1 · Setup | 9 | 1 | 0 | 0 | 1 | 7 |
| 2 · Exam engine | 20 | 0 | 0 | 0 | 6 | 14 |
| 3 · Interactive PBQs | 9 | 0 | 0 | 0 | 1 | 8 |
| 4 · Admin and tutor sign-in | 10 | 1 | 0 | 0 | 0 | 9 |
| 5 · Classes | 10 | 0 | 0 | 0 | 3 | 7 |
| 6 · Question editor | 9 | 0 | 0 | 0 | 2 | 7 |
| 7 · Terminal lab | 7 | 3 | 0 | 0 | 2 | 2 |
| X · Cross-cutting | 4 | 4 | 0 | 0 | 0 | 0 |
| **Total** | **81** | **9** | 0 | 0 | **15** | **57** |

MVP = Stage 0 + Stages 1–4 + X-01, X-02, X-04.

## Stage gates

From the PRD release plan. Tick when the gate task passes.

- [x] **Stage 1 · Setup** — Import loads 85 multiple-choice questions, 10 PBQs (sets A and B) and all answer keys, with no errors
- [ ] **Stage 2 · Exam engine** — A full sitting can be completed; scoring tests pass (83 points = 751 Pass, 82 = 743 Below 750); answer keys are absent from every student response
- [x] **Stage 3 · Interactive PBQs** — All 10 PBQs mark correctly against the Part 6 solutions
- [x] **Stage 4 · Admin and tutor sign-in** — An invited tutor can register and sign in by code; expired, reused and wrong codes are rejected; a removed tutor is signed out
- [ ] **Stage 5 · Classes** — A tutor sees a student's attempt within 5 seconds of submission; tutors can't see each other's classes
- [x] **Stage 6 · Question editor** — A generated version passes validation, previews and marks correctly; old attempts still mark against their own version
- [ ] **Stage 7 · Terminal lab** — Every command in the lab steps gives the expected output; Labs A–C give the answers in Part 6

## Tasks

### Stage 0 · Decisions and inputs

| ID | Task | Depends on | Status | Owner | Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| T-001 | [Add the source exam and lab files to the repo](stage-0-decisions/T-001-add-source-content.md) | — | Done | | 2026-11-08 | Both files committed under `content/source/` |
| T-002 | [Accept or reject the 7 pending PRD review suggestions](stage-0-decisions/T-002-resolve-prd-suggestions.md) | — | Done | | 2026-11-08 | All 7 accepted in the shared doc; `docs/PRD.md` updated |
| T-003 | [Auth spike: Better Auth email OTP on Convex through the Nuxt proxy](stage-0-decisions/T-003-auth-spike.md) | T-101 | Done | | 2026-11-08 | Primary path confirmed; results in LLD §18.1; code on branch `spike/t-003-auth` |

### Stage 1 · Setup

| ID | Task | Depends on | Status | Owner | Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| T-101 | [Scaffold Nuxt 4 + Convex project](stage-1-setup/T-101-scaffold-project.md) | — | Done | | 2026-11-08 | Scaffold, theme from mockup; Convex Cloud dev deployment connected; lint/typecheck/test pass |
| T-104 | [Write the Convex schema and register components](stage-1-setup/T-104-convex-schema.md) | T-101 | Done | | 2026-11-08 |  |
| T-105 | [Shared content and answer types with validators](stage-1-setup/T-105-shared-types.md) | T-101 | Done | | 2026-11-08 |  |
| T-106 | [Core Convex libraries: anon, rng, codes, guards, audit, rate limits](stage-1-setup/T-106-core-libs.md) | T-104 | Done | | 2026-11-08 |  |
| T-107 | [Markdown exam parser with validation](stage-1-setup/T-107-exam-parser.md) | T-001, T-105 | Done | | 2026-11-08 |  |
| T-108 | [Parser tests and committed seed JSON](stage-1-setup/T-108-parser-tests-seed-json.md) | T-107 | Done | | 2026-11-08 |  |
| T-109 | [seed.importExam and the Stage 1 gate](stage-1-setup/T-109-seed-import.md) | T-104, T-108 | Done | | 2026-11-08 | Stage 1 gate passed |
| T-110 | [Netlify site, environment variables and first deploy](stage-1-setup/T-110-netlify-setup.md) | T-101 | Not started | | |  |
| T-111 | [CI: lint, type-check, Vitest and convex-test on every PR](stage-1-setup/T-111-ci.md) | T-101 | In review | | 2026-11-08 | CI workflow committed; still to confirm a failing test blocks merge and the run takes under ~10 min |

### Stage 2 · Exam engine

| ID | Task | Depends on | Status | Owner | Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| T-201 | [Marking: answer normalisers](stage-2-exam-engine/T-201-marking-normalise.md) | T-105 | Done | | 2026-11-08 |  |
| T-202 | [Marking: scoring, scaled score and domain breakdown](stage-2-exam-engine/T-202-marking-score.md) | T-201 | Done | | 2026-11-08 |  |
| T-203 | [Nuxt server route /api/attempts/start](stage-2-exam-engine/T-203-start-route.md) | T-110 | Done | | 2026-11-08 |  |
| T-204 | [attempts.start mutation](stage-2-exam-engine/T-204-attempts-start.md) | T-106, T-109 | Done | | 2026-11-08 |  |
| T-205 | [attempts.getPaper and attempts.getState](stage-2-exam-engine/T-205-attempts-paper-state.md) | T-204 | Done | | 2026-11-08 |  |
| T-206 | [attempts.saveResponse](stage-2-exam-engine/T-206-attempts-save.md) | T-205 | In review | | 2026-11-08 | Committed; p95 save < 300 ms not measured yet (needs T-220) |
| T-207 | [Submit, auto-submit and the safety-net sweep](stage-2-exam-engine/T-207-attempts-submit.md) | T-202, T-206 | Done | | 2026-11-08 |  |
| T-208 | [review.getResult, review.getReview, review.myAttempts](stage-2-exam-engine/T-208-review-queries.md) | T-207 | Done | | 2026-11-08 |  |
| T-209 | [Answer-key leak test over every student function](stage-2-exam-engine/T-209-answer-key-leak-test.md) | T-208 | Done | | 2026-11-08 |  |
| T-210 | [useAnonIdentity composable with export and import](stage-2-exam-engine/T-210-anon-identity.md) | T-101 | Done | | 2026-11-08 |  |
| T-211 | [Landing page and start/instructions screen](stage-2-exam-engine/T-211-landing-start-pages.md) | T-203, T-210 | In review | | 2026-11-08 | Committed; landing-to-first-question < 30 s not measured yet |
| T-212 | [Exam runner state: useAttempt, local cache and save queue](stage-2-exam-engine/T-212-useAttempt.md) | T-205, T-206 | Done | | 2026-11-08 |  |
| T-213 | [Exam runner UI: questions, flagging, navigator, review-before-submit](stage-2-exam-engine/T-213-exam-runner-ui.md) | T-212 | Done | | 2026-11-08 |  |
| T-214 | [Timer, time calls and pacing alerts](stage-2-exam-engine/T-214-timer-pacing.md) | T-212 | Done | | 2026-11-08 |  |
| T-215 | [Results page](stage-2-exam-engine/T-215-results-page.md) | T-208 | In review | | 2026-11-08 | Committed; not yet checked after a real sitting (T-220) |
| T-216 | [Review page with filters](stage-2-exam-engine/T-216-review-page.md) | T-208 | Done | | 2026-11-08 |  |
| T-217 | [History page with export and import](stage-2-exam-engine/T-217-history-page.md) | T-208, T-210 | In review | | 2026-11-08 | Committed; import not yet checked with real attempts on two browsers (T-220) |
| T-218 | [Security headers and CSP](stage-2-exam-engine/T-218-security-headers.md) | T-110 | In review | | 2026-11-08 | Committed (nuxt-security 2.7.0, nonces; hashes on /r/**); no CSP violations during a full sitting not checked yet |
| T-219 | [Privacy page and IP-hash purge cron](stage-2-exam-engine/T-219-privacy-and-ip-purge.md) | T-207 | Done | | 2026-11-08 |  |
| T-220 | [E2E: full sitting, refresh, timer expiry, accessibility](stage-2-exam-engine/T-220-e2e-full-sitting.md) | T-213, T-214, T-215, T-216 | In review | | 2026-11-08 | Specs committed; a11y spec passes; live exam spec gated by E2E_EXAM=1, needs SERVER_SECRET |

### Stage 3 · Interactive PBQs

| ID | Task | Depends on | Status | Owner | Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| T-301 | [Mark all 10 PBQs against the Part 6 solutions](stage-3-pbqs/T-301-pbq-marking-verification.md) | T-202, T-109 | Done | | 2026-11-08 |  |
| T-302 | [PbqSshLog component (SSH brute-force alert)](stage-3-pbqs/T-302-pbq-sshlog.md) | T-213 | Done | | 2026-11-08 |  |
| T-303 | [PbqNmap component (insecure services)](stage-3-pbqs/T-303-pbq-nmap.md) | T-213 | Done | | 2026-11-08 |  |
| T-304 | [PbqHashCheck component (installer integrity)](stage-3-pbqs/T-304-pbq-hashcheck.md) | T-213 | Done | | 2026-11-08 |  |
| T-305 | [PbqPermissions component (permissions and SSH)](stage-3-pbqs/T-305-pbq-permissions.md) | T-213 | Done | | 2026-11-08 |  |
| T-306 | [PbqFirewall component (perimeter firewall)](stage-3-pbqs/T-306-pbq-firewall.md) | T-213 | Done | | 2026-11-08 |  |
| T-307 | [Retake mode (PBQ set B)](stage-3-pbqs/T-307-retake-mode.md) | T-204, T-302, T-303, T-304, T-305, T-306 | Done | | 2026-11-08 | Retake = set B + 85 MCQs; start refuses retake without full set B |
| T-308 | [Lab download: build-lab.sh and Lab D instructions](stage-3-pbqs/T-308-lab-download.md) | T-001 | Done | | 2026-11-08 |  |
| T-309 | [PBQ review rendering and E2E tests](stage-3-pbqs/T-309-pbq-review-and-e2e.md) | T-307, T-216 | In review | Claude (subagent) | 2026-11-08 | PBQ review renders real components with per-part marks; pbq.spec.ts gated by E2E_EXAM=1, needs SERVER_SECRET |

### Stage 4 · Admin and tutor sign-in

| ID | Task | Depends on | Status | Owner | Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| T-401 | [EmailProvider interface, adapters and templates](stage-4-auth/T-401-email-provider.md) | T-101 | Done | | 2026-11-08 |  |
| T-402 | [Better Auth configuration in Convex](stage-4-auth/T-402-better-auth-config.md) | T-003, T-104, T-401 | Done | | 2026-11-08 |  |
| T-403 | [Nuxt /api/auth proxy, auth client and route guards](stage-4-auth/T-403-auth-proxy-client.md) | T-402 | Done | | 2026-11-08 |  |
| T-404 | [Profiles, admin bootstrap and session hooks](stage-4-auth/T-404-profiles-admin-bootstrap.md) | T-402 | Done | | 2026-11-08 |  |
| T-405 | [Invitations backend](stage-4-auth/T-405-invitations-backend.md) | T-404, T-401 | Done | | 2026-11-08 |  |
| T-406 | [Admin backend: tutors, removal, audit, deleting attempts](stage-4-auth/T-406-admin-backend.md) | T-404 | Done | | 2026-11-08 |  |
| T-407 | [Sign-in and invitation pages](stage-4-auth/T-407-sign-in-invite-pages.md) | T-403, T-405 | Done | | 2026-11-08 |  |
| T-408 | [Admin area UI](stage-4-auth/T-408-admin-ui.md) | T-406, T-407 | Done | | 2026-11-08 |  |
| T-409 | [Resend domain setup for salus.fibreware.app](stage-4-auth/T-409-resend-domain.md) | T-401 | Not started | | |  |
| T-410 | [Auth tests and Stage 4 gate](stage-4-auth/T-410-auth-tests.md) | T-407, T-408 | Done | | 2026-11-08 | Stage 4 gate passed |

### Stage 5 · Classes

| ID | Task | Depends on | Status | Owner | Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| T-501 | [Classes backend: create, update, list, lookup](stage-5-classes/T-501-classes-backend.md) | T-404 | Done | | 2026-11-08 |  |
| T-502 | [Class dashboard queries: attempts, stats, attempt review](stage-5-classes/T-502-class-dashboard-queries.md) | T-501, T-208 | In review | | 2026-11-08 | Committed; < 5 s dashboard update not measured yet (T-510) |
| T-503 | [CSV export and deleting attempts](stage-5-classes/T-503-csv-delete.md) | T-502 | In review | | 2026-11-08 | Committed; CSV still needs a manual open in Excel and Sheets once T-505 downloads it |
| T-504 | [Share links and the /r/[publicId] page](stage-5-classes/T-504-share-links.md) | T-208 | Done | | 2026-11-08 |  |
| T-505 | [Tutor UI: classes list and live class page](stage-5-classes/T-505-tutor-ui-classes.md) | T-502, T-503, T-403 | Done | | 2026-11-08 |  |
| T-506 | [Tutor attempt review page](stage-5-classes/T-506-tutor-attempt-review.md) | T-502, T-309 | Done | Claude (subagent) | 2026-11-08 | /tutor/attempts/[id] reuses ResultSummary + review list; delete with confirm |
| T-507 | [Oral questions screen](stage-5-classes/T-507-oral-questions.md) | T-109 | Done | | 2026-11-08 |  |
| T-508 | [Class code and display name on the start screen](stage-5-classes/T-508-class-code-start.md) | T-501, T-211 | Done | | 2026-11-08 |  |
| T-509 | [Extra-time multiplier per class (EX-21)](stage-5-classes/T-509-time-multiplier.md) | T-002, T-501, T-214 | Done | | 2026-11-08 | attempts.startInfo returns minutes; start screen shows class extra time |
| T-510 | [Class isolation and dashboard latency tests](stage-5-classes/T-510-classes-tests.md) | T-505, T-504 | In review | | 2026-11-08 | Isolation matrix + latency tests committed; Playwright 5 s check not run live |

### Stage 6 · Question editor

| ID | Task | Depends on | Status | Owner | Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| T-601 | [Editor: copy-on-write versions](stage-6-editor/T-601-editor-versions.md) | T-404, T-109 | Done | | 2026-11-08 |  |
| T-602 | [Editor: save, delete and reorder questions](stage-6-editor/T-602-editor-save.md) | T-601 | Done | | 2026-11-08 |  |
| T-603 | [Editor: validate, publish and restore](stage-6-editor/T-603-editor-validate-publish.md) | T-602 | Done | | 2026-11-08 |  |
| T-604 | [Generators: sshLog and nmap](stage-6-editor/T-604-generators-sshlog-nmap.md) | T-105 | Done | | 2026-11-08 |  |
| T-605 | [Generators: hashCheck, permissions and firewall](stage-6-editor/T-605-generators-rest.md) | T-105 | Done | | 2026-11-08 |  |
| T-606 | [editor.generate and preview attempts](stage-6-editor/T-606-editor-generate-preview.md) | T-603, T-604, T-605 | Done | | 2026-11-08 | Share links refused for preview attempts (c65676d) |
| T-607 | [Editor UI: versions list and MCQ form](stage-6-editor/T-607-editor-ui-versions-mcq.md) | T-603 | Done | | 2026-11-08 |  |
| T-608 | [Editor UI: PBQ template forms, generate, preview, publish](stage-6-editor/T-608-editor-ui-pbq.md) | T-606, T-607 | In review | | 2026-11-08 | Committed; signed-in generate/preview/publish not run live |
| T-609 | [Editor tests and Stage 6 gate](stage-6-editor/T-609-editor-tests.md) | T-608 | In review | Claude (subagent) | 2026-11-08 | Stage 6 gate passes in convex-test (tests/convex/editor/gate.test.ts); Playwright editor spec gated by E2E_EDITOR=1, not run live |

### Stage 7 · Terminal lab

| ID | Task | Depends on | Status | Owner | Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| T-701 | [Terminal lab: virtual file system and seedLab](stage-7-lab/T-701-lab-vfs-seed.md) | T-001 | Done | | 2026-11-08 |  |
| T-702 | [Terminal lab: lexer, pipeline runner and terminal UI](stage-7-lab/T-702-lab-lexer-runner.md) | T-701 | In review | | 2026-11-08 | Lexer, globbing, runner committed; Terminal.vue (a11y criterion) left for T-706 |
| T-703 | [Lab commands: cd, ls, cat, head, tail, stat, chmod](stage-7-lab/T-703-lab-commands-files.md) | T-702 | In review | Claude (subagent) | 2026-11-08 | ls, cat, head, tail, stat, chmod committed; GNU byte-for-byte comparison runs on CI (needs GNU ls), confirm via T-707 |
| T-704 | [Lab commands: grep, awk, cut, sort, uniq, wc, sed](stage-7-lab/T-704-lab-commands-text.md) | T-702 | Not started | | |  |
| T-705 | [Lab command: sha256sum and sha256sum -c](stage-7-lab/T-705-lab-sha256.md) | T-701 | Done | | 2026-11-08 |  |
| T-706 | [Lab page: checks, reset and cheat sheet](stage-7-lab/T-706-lab-page-checks.md) | T-703, T-704, T-705, T-308 | Not started | | |  |
| T-707 | [Lab fixture tests against a real build-lab.sh run](stage-7-lab/T-707-lab-fixture-tests.md) | T-706 | Not started | | |  |

### Stage X · Cross-cutting

| ID | Task | Depends on | Status | Owner | Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| X-01 | [Cross-browser, phone-width and accessibility pass](cross-cutting/X-01-cross-browser-qa.md) | T-309 | Not started | | |  |
| X-02 | [Performance check: load and save times](cross-cutting/X-02-performance-check.md) | T-220 | Not started | | |  |
| X-03 | [Weekly backups and observability](cross-cutting/X-03-backups-observability.md) | T-110 | Not started | | |  |
| X-04 | [MVP release (Stages 1–4)](cross-cutting/X-04-mvp-release.md) | T-220, T-309, T-410, T-409, X-01, X-02 | Not started | | |  |

## Blockers

| Opened | Task | Blocker | Owner | Resolved |
| --- | --- | --- | --- | --- |
| 2026-11-08 | T-001 | `secplus-701-mock-exam.md` and `build-lab.sh` are not in the project | | 2026-11-08 — both files added to project root |

## Decision log

| Date | Decision | Affects | Source |
| --- | --- | --- | --- |
| 2026-11-08 | Auth path: **Better Auth primary** (§9.1). Pinned `better-auth@1.7.18` + `@convex-dev/better-auth@0.13.0` (component needs `better-auth >=1.7.16 <1.8.0`) | T-402, T-403, T-104 | T-003; LLD §18.1 |
| 2026-11-08 | Convex in Vue: thin `ConvexClient` wrapper, not `convex-vue` (no release since July 2025) | T-212, T-403 | T-003; LLD §2 |
| 2026-11-08 | CSP: `script-src 'self'` alone breaks Nuxt; use per-request nonces (`nuxt-security`) and keep `'unsafe-inline'` only for `style-src-attr` | T-218, T-504 | T-003; LLD §18.1 |
| 2026-11-08 | Fact check: the source file has exactly 4 Choose TWO questions (Q20, Q26, Q50, Q78), so suggestion #1 is correct | T-107, T-202 | `secplus-701-mock-exam.md` lines 419, 462, 631, 828 |
| 2026-11-08 | All 7 PRD suggestions accepted: EX-9 (4 Choose TWO), EX-20 (export warning), EX-21 (time multiplier), SE-3 (anon ID is a secret), SE-4 (30 s grace), SE-5 (200/hour per IP), LB-9 moves to Stage 3 | T-104, T-107, T-202, T-204, T-206, T-210, T-214, T-308, T-509 | Shared PRD doc rev 80; `docs/PRD.md` |
| 2026-11-08 | Anonymous token is 256-bit (32 bytes), as in LLD §4; PRD SE-3 changed from 128-bit to match | T-106, T-210 | Shared PRD doc rev 81; `docs/PRD.md` |
