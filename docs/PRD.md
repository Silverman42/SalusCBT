# Salus — Security+ Mock Exam Platform PRD

Nov 8, 2026 · Miracle Chimamanda Ndubuisi

> Exported from the shared Claude doc: https://claude.ai/artifact/KwNiKaPLj5cM6SFX3kgt9H
> The seven review suggestions from Nov 8, 2026 were accepted in the doc the same day and are included below (EX-9, EX-20, EX-21, SE-3, SE-4, SE-5 and the release plan).
> Related documents: [HLD.md](HLD.md) (high-level design) and [LLD.md](LLD.md) (low-level design).

## Overview

We will build Salus, a web app where cybersecurity students sit timed Security+ style mock exams without signing up. Tutors sign in to run classes, see results and edit questions.

**Problem.** The current mock exam is a 1,847-line Markdown file plus a Bash lab script. It needs a human proctor to time it, mark 102 points by hand and work out domain scores. It can't be shared with a class, and the answer key is in the same file as the questions.

**Product.** A browser-based exam that copies the real exam: performance-based questions (PBQs) first, then 85 multiple-choice questions, in 90 minutes. Marking, scaled scoring, pacing alerts and weak-domain analysis are automatic. The content comes from the existing `secplus-701-mock-exam.md` and `build-lab.sh`.

**Goals**

- A student can open a link and start a full mock in under 30 seconds, with no account.
- Results and domain breakdown appear the moment the exam is submitted, with no manual marking.
- Answer keys never reach the student's browser before submission.
- Tutors can run classes and create fresh PBQ versions without editing files.

**Non-goals**

- Student accounts or passwords.
- Official CompTIA branding or any claim to be an official exam.
- A full Linux VM in the browser (v1 uses a simulated terminal).
- Payments or subscriptions.

## Users and roles

There are three roles. Only admins and tutors sign in, using a one-time code sent to their own email. Students never sign in.

| Role | How they get in | Can do | Cannot do |
| --- | --- | --- | --- |
| Admin | Seeded as the first account; signs in with an email OTP | Invite and remove tutors; manage the default exam; see all classes | Nothing restricted |
| Tutor | Invitation from the admin; signs in with an email OTP | Create classes and class codes; see their students' results; edit their own versions of PBQs and multiple-choice questions | See other tutors' classes; invite others; change the default exam |
| Student | Opens the link; optionally enters a class code and display name | Sit exams, review results, export or import their progress, share a result link | See answer keys before submitting; see other students' results |

A student's identity is an anonymous ID stored in their browser. The same person on a different device is a new student unless they import their progress.

## Scope

The first release (MVP) covers Stages 1–4 of the release plan: a student can sit the full exam with interactive PBQs, and tutors can sign in. Classes, the PBQ editor and the terminal lab follow.

| Area | MVP (Stages 1–4) | Later (Stages 5–7) | Out of scope |
| --- | --- | --- | --- |
| Exam | Full timed exam, pacing alerts, flagging, server-side marking, results, review | More exam sets beyond SY0-701 | Adaptive testing |
| PBQs | Five interactive PBQs, Retake version B | Tutor-edited PBQ versions, generated values | Drag-and-drop simulations beyond the five types |
| Lab | Download of `build-lab.sh` with instructions | Simulated terminal for Labs A–C | Real Linux VM in the browser |
| People | Admin and tutor sign-in, invitations | Classes, class codes, tutor dashboard, result links | Student accounts |
| Content | Default exam (85 multiple-choice questions, 10 PBQs) seeded from the Markdown file | Tutor editing of multiple-choice questions (ED-7 to ED-10) | Question marketplace |

## Exam engine

The exam engine runs a 90-minute, 102-point sitting and marks it on the server the moment it is submitted.

**Starting**

- EX-1. The landing page offers "Start mock exam", with an optional display name and class code. No other input is required.
- EX-2. A short instructions screen, taken from the file's candidate instructions, is shown before the timer starts.

**During the exam**

- EX-3. A 90-minute countdown is always visible. At 0:00 the attempt is submitted automatically; unanswered questions score zero.
- EX-4. Time calls appear as banners at 45, 15 and 5 minutes remaining.
- EX-5. Pacing alerts from the proctor guide: at 0:25 if any PBQ is unanswered or unflagged, at 0:45 if behind Q35, at 1:05 if behind Q60, and at 1:20 to go to flagged questions.
- EX-6. PBQs come first, then Q6–Q90. Students may skip and come back.
- EX-7. One question per screen, with Previous, Next and Flag for review.
- EX-8. A navigator grid shows every question as answered, flagged or unanswered, and jumps to it on click.
- EX-9. "Choose TWO" questions allow exactly two selections and score only if both are correct (4 questions in the current set: Q20, Q26, Q50 and Q78).
- EX-10. Answer order is shuffled per attempt; the shuffle is stored so review shows the same order.
- EX-11. Answers save after every change, locally and to Convex, so a refresh or dropped connection loses nothing. The timer is based on the server start time, so a refresh does not reset it.
- EX-12. A review screen before submitting lists unanswered and flagged questions.

**Marking and results**

- EX-13. Marking runs in Convex. One point per multiple-choice question and per PBQ part; 102 points in total.
- EX-14. Scaled score = 100 + 800 × points / 102, rounded to the nearest whole number. Pass at 750 or more (83 points). A score of 800 or more is labelled "comfortable margin".
- EX-15. A domain breakdown shows points and percentage for the five SY0-701 domains, using the domain mapping in the answer key. Domains under 81% are highlighted.
- EX-16. Results show time used and the number of flagged questions.

**Review**

- EX-17. After submission, each question shows the student's answer, the correct answer and the explanation ("Why").
- EX-18. Filters for wrong, flagged and by domain.
- EX-19. Attempt history in the browser lists past attempts with date, score and pass/fail.
- EX-20. "Export progress" downloads a file of the student's history; "Import progress" restores it on another device. The file contains the student's anonymous ID, so the page warns them to keep it private.
- EX-21. Extra time as an accessibility accommodation: a tutor can set a time multiplier (for example 1.5×) for a class, and pacing alerts scale with it.

## Performance-based questions

Each of the five PBQs is an interactive task worth 3–4 points, marked per part. A Retake mode swaps in version B with new values.

| PBQ | Points | Interaction | Answer type |
| --- | --- | --- | --- |
| 1. SSH brute-force alert | 3 | Scrollable `auth.log` viewer with text search and match highlighting | IP address, account name, count |
| 2. Insecure services (nmap) | 3 | `nmap -sV` output where each port row can be picked | Port numbers |
| 3. Installer integrity | 3 | Vendor hashes and computed hashes side by side | Filename, then two multiple-choice parts |
| 4. Permissions and SSH | 4 | `ls -l` listings and `sshd_config` shown as a terminal | Filename, two octal modes, directive name |
| 5. Perimeter firewall | 4 | Network diagram plus a rule table with Port and Action dropdowns | Port and action per rule |

- PB-1. Free-text answers are normalised before marking: trimmed, case-insensitive, and leading zeros allowed in octal modes (`0640` = `640`).
- PB-2. PBQ 1d ("write a one-line command") is practice only, not scored. Its model answer is shown in review.
- PB-3. A PBQ 5 rule scores only if both port and action are correct.
- PB-4. Retake mode uses PBQs B1–B5 from Part 4 of the file, with the same multiple-choice set.
- PB-5. The default PBQ content and answers come from Parts 1, 4 and 6 of the Markdown file.

## Terminal lab

The lab is a practice area, separate from the timed exam. It uses a simulated terminal with in-memory copies of the files that `build-lab.sh` creates. Lab D stays a download, because it scans the student's own machine.

- LB-1. A terminal panel with a prompt, command history (up and down arrows) and `clear`. It starts in a virtual `~/secplus-lab`.
- LB-2. Supported commands: `cd`, `ls -l` / `ls -la`, `cat`, `head`, `tail`, `grep` (`-c -i -n -v -o`), `awk '{print $N}'` including `$NF` and `$(NF-3)`, `cut`, `sort` (`-n -r`), `uniq -c`, `wc -l`, `sha256sum` and `sha256sum -c`, `stat -c '%a %n'`, `chmod` (octal), and `sed -i 's/…/…/'`. Pipes (`|`) are supported.
- LB-3. Unsupported commands print a clear "not available in this lab" message instead of failing silently.
- LB-4. Lab A uses the same `auth.log` as the script. Expected answers: attacker `185.220.101.47`, account `backup`, 50 failed password entries.
- LB-5. Lab B creates four installers with matching vendor hashes, then tampers with one picked at random per session, as the script does.
- LB-6. Lab C is marked as passed when `etc/shadow` is 640, `home/deploy/.ssh/id_rsa` is 600 and `sshd_config` contains `PermitRootLogin no`.
- LB-7. "Reset lab" rebuilds every file, just like re-running the script.
- LB-8. The command cheat sheet from the file is shown beside the terminal.
- LB-9. `build-lab.sh` and the Lab D instructions are available to download, with a warning to scan only machines you own.

## Admin and tutor sign-in

Admins and tutors sign in with no password: they enter their email and type in a 6-digit code sent to that same address. Tutors can only register through an invitation.

**Invitation flow**

1. The admin enters a tutor's email address in the admin area.
2. The app emails an invitation link that works once and expires after 7 days.
3. The tutor opens the link. Their email is pre-filled and cannot be changed.
4. A 6-digit code is sent to that email. Entering it creates the tutor account and signs them in.

**Sign-in flow**

1. The admin or tutor enters their email on the sign-in page.
2. If the address belongs to an active account, a code is sent. The page shows the same message either way, so it doesn't reveal which emails are registered.
3. They enter the code and get a session.

**Requirements**

- AU-1. Codes are 6 digits, expire after 10 minutes, and work once.
- AU-2. After 5 wrong codes the code is cancelled and a new one must be requested.
- AU-3. A new code can be requested at most once every 60 seconds, and at most 5 times an hour per email.
- AU-4. Sessions last 7 days and can be ended with Sign out. Removing a tutor ends their sessions at once.
- AU-5. The admin can list, resend and cancel pending invitations, and remove or restore tutors.
- AU-6. The first admin is created from an environment setting at deployment (the admin's email). There is no public sign-up page. Version 1 supports exactly one admin.
- AU-7. Every invitation, sign-in, failed code and tutor removal is written to an audit log the admin can view.

## Classes and results

Tutors group students into classes using a short code. Students type the code before an exam, and their attempts then show up on that tutor's dashboard.

- CL-1. A tutor creates a class with a name and gets a short class code (for example `SEC-4K7Q`), avoiding look-alike characters such as 0/O and 1/I.
- CL-2. A class can be closed. A closed code no longer accepts new attempts, but past results stay visible.
- CL-3. A class picks which exam version its students sit: the default, or one of the tutor's own exam versions.
- CL-4. Students who enter a class code must enter a display name. It doesn't need to be unique; attempts are told apart by anonymous ID.
- CL-5. The tutor dashboard lists each attempt with name, date, score, pass/fail and time used, and can be sorted and filtered.
- CL-6. Class view: average score, pass rate, a domain breakdown across the class, and the 10 most-missed questions.
- CL-7. A tutor can open any attempt in their class in the same review screen the student sees. This includes every answer the student gave, PBQs and multiple choice.
- CL-8. Results can be exported as CSV.
- CL-9. Any student can create a share link to one result. It contains a random, unguessable ID, shows score, domains and review, and can be revoked by the student from the same browser.
- CL-10. Oral questions: after an exam, the tutor (or a study partner) can open a screen that shows the 10 oral questions one at a time, revealing each model answer on click.
- CL-11. Tutors can delete attempts from their classes, one at a time or several at once. Deleting asks for confirmation, is permanent, removes the attempt's share links, and is recorded in the audit log.

## Tutor question editor

Tutors make their own versions of the exam, starting from the questions seeded from the documents. PBQs are edited through fill-in templates; multiple-choice questions through a form. A "Generate new values" button creates a fresh version and works out the correct answers itself.

| Template | Tutor edits | Generate new values does |
| --- | --- | --- |
| SSH brute force | Log text, questions, answers | New attacker IP, decoy sources, usernames and timestamps; computes IP, account and failure count |
| nmap scan | Scan output, which ports are answers | New host and service mix; picks cleartext and secure ports |
| Installer integrity | Filenames, hashes, tampered file, MC options | New random hashes with one file altered |
| Permissions and SSH | Listings, config, expected modes and directive | New files and wrong modes; computes the correct octal values |
| Firewall | Hosts, subnets, rule wording, port choices | New addresses and services; derives the correct port and action per rule |

- ED-1. Every PBQ version is a draft until published. The tutor can preview it as a student, with marking, before publishing.
- ED-2. The editor validates before publishing: every part has a correct answer, port choices include the answer, and computed answers match what the tutor typed.
- ED-3. Publishing creates a new numbered version. Old versions are kept and can be restored.
- ED-4. Attempts are always marked against the version the student sat, even after later edits.
- ED-5. A tutor's versions are visible only to that tutor and the admin. The default exam can only be changed by the admin.
- ED-6. Generated values must be realistic and safe: documentation or reserved IP ranges (for example `203.0.113.0/24`) or the ranges already used in the default content, never real live hosts chosen at random.
- ED-7. Seed data: the 85 multiple-choice questions, the 10 PBQs (sets A and B), answer keys, explanations, domains and the oral questions from the two documents are loaded as the default exam. A tutor's new version starts as a copy of it.
- ED-8. Multiple-choice editor: question text, options (4 by default), correct answer or answers, the Choose TWO setting, domain (1.0–5.0) and explanation.
- ED-9. Tutors can add, edit, remove and reorder questions in their version. Before publishing, every question needs a correct answer, a domain and an explanation, and Choose TWO questions need exactly two correct answers.
- ED-10. Points totals and the domain breakdown are worked out from the questions in each version. When questions are added or removed, the total (102 by default) and the scaled score adjust, and the pass mark stays 750 on the scaled score.

## Technical architecture

Nuxt serves every page. Convex stores the data and runs all the logic, including marking and sign-in.

The architecture diagram is in [HLD.md](HLD.md#2-system-context).

Students and tutors use the same Nuxt app. Marking runs only inside Convex, and sign-in codes are only ever sent by email.

| Layer | Choice | Responsibility |
| --- | --- | --- |
| Frontend and app server | Nuxt 4 (Vue 3, TypeScript) | Pages, server-side rendering, and server routes for share pages, security headers and file downloads |
| Live data | Convex client for Vue | Live queries and mutations from the browser to Convex |
| Backend and database | Convex | Schema, queries, mutations, actions and scheduled jobs (expiring invitations, deleting old IP hashes) |
| Authentication | Better Auth through Convex's Better Auth component, email OTP plugin | Invitation-only sign-up, codes, sessions, roles |
| Email | Resend, behind a swappable email provider interface (AR-4) | OTP and invitation emails |
| UI | Tailwind CSS with Nuxt UI (proposed) | Components, dark mode, accessibility |
| Tests | Vitest for logic and Convex functions; Playwright for full exam runs | Scoring, marking, access rules |
| Hosting | Netlify for Nuxt; Convex Cloud for the backend | Netlify subdomain for now (for example salus.netlify.app, if it's free) |

- AR-1. Exam content is imported by a script that parses `secplus-701-mock-exam.md` into seed data and loads it into Convex. Adding a new exam set means adding a new Markdown file in the same format.
- AR-2. Students call only the functions marked for students. Tutor and admin functions require a valid session and the right role.
- AR-3. Library support (Better Auth on Convex with Nuxt) is checked at the start of Stage 1, before any code is written.
- AR-4. All email goes through one `EmailProvider` interface with a single method, `send({ to, subject, html, text })`. A Resend adapter implements it, picked by the `EMAIL_PROVIDER` environment setting, and a console adapter prints emails during local development. Live emails are sent from no-reply@salus.fibreware.dev, a subdomain verified in Resend with DNS records (DKIM, SPF and a recommended DMARC record). Email templates (OTP code, invitation) are built outside the adapter, so switching provider means writing one new adapter and changing environment settings, with no other code changes.

## Data model

All data lives in Convex. Tables that hold answers are only read by server functions and are never returned to a student before submission. The auth library (Better Auth) adds its own tables for users, sessions and verification codes.

| Table | Key fields | Notes |
| --- | --- | --- |
| `profiles` | userId, email, role (admin / tutor), status (active / removed), name | One per signed-in person, linked to the auth user |
| `invitations` | email, tokenHash, invitedBy, expiresAt, status (pending / accepted / cancelled / expired) | Only the token's hash is stored |
| `exams` | slug (`sy0-701`), title, timeLimitMin (90), totalPoints (102), passPoints (83) | One row per exam set |
| `examVersions` | examId, ownerId (null = default), label, versionNo, status (draft / published), publishedAt | A tutor's PBQ version is its own exam version |
| `questions` | versionId, number, kind (mcq / pbq), domain, stem, options, chooseCount, pbqTemplate, payload | What the student sees |
| `answerKeys` | questionId, correct, partAnswers, explanation | Server-only |
| `classes` | tutorId, name, code, versionId, status (open / closed) | `code` is unique |
| `attempts` | anonId, displayName, classId?, versionId, mode (standard / retake), startedAt, submittedAt, shuffleSeed, answers, flags, score, scaled, domainScores | Answers saved as the student goes |
| `shareLinks` | attemptId, publicId, anonId, revokedAt | `publicId` is random and unguessable |
| `auditLog` | actorId, action, target, at, ipHash | Admin can view |
| `rateLimits` | key, count, windowStart | For OTP requests, attempt starts and share links |

## Security, privacy and quality

A cybersecurity exam app will be tested by its own users, so it has to be secure by default.

**Security**

- SE-1. Answer keys and explanations stay on the server until the attempt is submitted. Every Convex query used by students is checked so it can't return `answerKeys`.
- SE-2. Every tutor and admin function checks role and ownership on the server. Hiding a button in the page is not enough.
- SE-3. An attempt can only be read or changed with the anonymous ID that created it, a tutor of its class, or the admin. The anonymous ID is a random 256-bit value and is treated as a secret.
- SE-4. Answers can't be changed after submission or after the time limit, which is enforced using the server start time, with a 30-second grace period for network delay.
- SE-5. Rate limits on OTP requests (AU-3), attempt starts (10 per hour per anonymous ID, plus a higher per-IP cap of about 200 per hour so a whole classroom on one school network isn't blocked), and share-link creation.
- SE-6. Tutor-entered text (PBQ content, class names, display names) is shown as plain text, never as HTML.
- SE-7. Security headers: a strict Content-Security-Policy, HTTPS only, `X-Frame-Options: DENY`.
- SE-8. Secrets (Convex deploy key, email API key, auth secret) live in environment settings, never in the code.

**Privacy**

- PR-1. Students give no email or personal data. A display name is optional unless they join a class.
- PR-2. Tutor emails are used only for sign-in and invitations.
- PR-3. IP addresses are stored only as hashes, only for rate limits and audit, and deleted after 30 days.
- PR-4. A short privacy page explains what is stored in the browser and on the server.
- PR-5. Attempts are kept forever unless deleted. Tutors can delete attempts in their classes (CL-11); the admin can delete any attempt, including ones not linked to a class.

**Quality**

- QA-1. Works on current Chrome, Edge, Safari and Firefox, and at phone width (360 px) as well as desktop.
- QA-2. Keyboard-only use works for the whole exam (WCAG 2.2 AA target), including the navigator grid and PBQ dropdowns.
- QA-3. Question screens load in under 1 second on a typical broadband connection. Saving an answer takes under 300 ms.
- QA-4. Dark and light themes.
- QA-5. Content and wording say "Security+ style practice exam" and make no claim to be official or endorsed by CompTIA.

## Release plan

There are seven stages, built in order; each one ends in something usable. Stages 1–4 make up the MVP. No dates have been set yet.

| Stage | Delivers | Done when |
| --- | --- | --- |
| 1. Setup | Nuxt + Convex project, Better Auth component, import script from Markdown to Convex, schema, CI with tests | Import loads 85 multiple-choice questions, 10 PBQs (sets A and B) and all answer keys, with no errors |
| 2. Exam engine | EX-1 to EX-20: timer, pacing, navigator, flagging, server marking, results, review, export/import | A full sitting can be completed; scoring tests pass (83 points = 751 Pass, 82 = 743 Below 750); answer keys are absent from every student response |
| 3. Interactive PBQs | PB-1 to PB-5, Retake mode, lab script download (LB-9) | All 10 PBQs mark correctly against the Part 6 solutions |
| 4. Admin and tutor sign-in | AU-1 to AU-7, invitations, admin area | An invited tutor can register and sign in by code; expired, reused and wrong codes are rejected; a removed tutor is signed out |
| 5. Classes | CL-1 to CL-10, tutor dashboard, share links, oral questions | A tutor sees a student's attempt within 5 seconds of submission; tutors can't see each other's classes |
| 6. Question editor | ED-1 to ED-10, all five PBQ templates, multiple-choice editor, generate values | A generated version passes validation, previews and marks correctly; old attempts still mark against their own version |
| 7. Terminal lab | LB-1 to LB-8 | Every command in the lab steps gives the expected output; Labs A–C give the answers in Part 6 |

## Success metrics

The targets below are starting points, to be reviewed after the first class uses the app.

| Metric | Target | How it's measured |
| --- | --- | --- |
| Exams completed | 70% or more of started attempts are submitted | `attempts` with `submittedAt` vs all started |
| Repeat practice | 40% of students who finish one exam start another within 14 days | Attempts per anonymous ID |
| Improvement | Average scaled score rises between a student's first and third attempt | Attempt history per anonymous ID |
| Tutor adoption | Each invited tutor creates at least one class within 14 days | `classes` per tutor |
| Marking accuracy | Zero marking errors reported against the answer key | Automated tests plus tutor reports |
| Answer-key leaks | Zero answer keys returned to a student before submission | Automated test over every student-facing function |

## Risks and open questions

**Risks**

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Convex Auth has no official Vue/Nuxt client | Custom auth code to maintain | Use Better Auth through Convex's official component, with its email OTP plugin; check current library support at Stage 1 |
| OTP emails land in spam or are delayed | Tutors can't sign in | Send from a verified domain with SPF, DKIM and DMARC set up; offer "resend code" after 60 seconds |
| Students lose history when they clear their browser | Progress is lost | Export/import, plus a clear notice on the results page |
| The question set is fixed, so students memorise answers | Scores rise without learning | Shuffled answer order, Retake PBQs, tutor-generated PBQ versions, more exam sets later |
| Abuse of the anonymous endpoints | Cost and noise in tutor dashboards | Rate limits (SE-5), closable class codes |
| Trademark complaints | Takedown | No CompTIA logos and no claims of being official (QA-5) |

**Open questions**

- [x] Decided: tutors can edit both PBQs and multiple-choice questions, starting from the seeded questions in the documents.
- [x] Decided: email is sent with Resend, behind a swappable provider (AR-4).
- [x] Decided: Nuxt on Netlify, backend on Convex Cloud.
- [x] Decided: tutors can see each student's individual answers (CL-7).
- [x] Decided: attempts are kept forever; tutors can delete them (CL-11, PR-5).
- [x] Decided: one admin for now (AU-6).
- [x] Decided: the product is called Salus, on a Netlify subdomain for now.
- [x] Decided: emails are sent from the subdomain salus.fibreware.dev, verified in Resend.
