# T-505 · Tutor UI: classes list and live class page

| | |
| --- | --- |
| Stage | 5 · Classes |
| Depends on | [T-502](T-502-class-dashboard-queries.md), [T-503](T-503-csv-delete.md), [T-403](../stage-4-auth/T-403-auth-proxy-client.md) |
| Requirements | `CL-1`, `CL-2`, `CL-5`, `CL-6`, `CL-8`, `CL-11` |
| Design refs | LLD §14.1 (`/tutor`, `/tutor/classes/[id]`) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Tutor screens to run a class.

## Steps

- `/tutor`: classes list, create class (name, version), show code with copy button.
- `/tutor/classes/[id]`: live attempt table with sort and filter, stats panel, CSV download, close/open, multi-select delete with confirmation.

## Files

- `app/pages/tutor/index.vue`
- `app/pages/tutor/classes/[id].vue`
- `app/components/tutor/ClassTable.vue`
- `app/components/tutor/AttemptTable.vue`

## Acceptance criteria

- [x] Delete asks for confirmation and says it is permanent.

## Notes

- Screens follow mockup 09 inside the T-408 staff layout (`layout: "staff"`, `middleware: "tutor"`).
  `/tutor`: "Run a class" banner with **New class**, then "Your classes · N" (table on wide
  screens, cards under `md`) with code + copy button, version, extra time, Open/Closed, created.
  `/tutor/classes/[id]`: violet banner (name, Open/Closed, version · time · created, code pill
  with copy, **Copy join link**, **Edit**, **Close class** / **Reopen class**), stat tiles
  (attempts, average + median, pass rate, class domain bars amber below 81%), the live attempt
  table and "Most missed".
- Create/edit (`components/tutor/ClassForm.vue`): name (1–80), exam version (published only from
  `editor.myVersions`, default first) and exam time 1× / 1.25× / 1.5× / 2× (EX-21, T-509 UI).
  Errors show inline. Creating a class opens its page. Closing asks first (reversible; only stops
  new attempts).
- Attempt table (`components/tutor/AttemptTable.vue`): one live `classes.attempts` subscription
  (no filter arg); the filter chips (All, Submitted, In progress, Passed, Below <pass mark>,
  Expired, with counts) apply `matchesFilter` client-side with the server's rules, so changing
  filter doesn't resubscribe. Sortable headers (`aria-sort`, buttons) for name, date, score,
  result, time; phones get cards and a sort select. Multi-select (selection drops rows that
  disappear or are filtered out), **Delete N** → confirm ("This is permanent… recorded in the
  audit log") → `classes.deleteAttempts`. **CSV** → `classes.exportCsv`, saved as
  `salus-<slug>-<yyyy-mm-dd>.csv` (`text/csv;charset=utf-8`; the server's BOM is kept, none added).
  Submitted rows link to `/tutor/attempts/[id]` (LLD §14.1, T-506; that page isn't built yet).
- The join link is `<origin>/start?class=SEC-XXXX` (T-508's `/start` page isn't built yet).
- The class page finds its class in `classes.mine` (there's no single-class query); an unknown id
  or another tutor's class shows "Class not found" and never subscribes to stats/attempts.
- Pure helpers in `app/lib/tutor.ts`, tested in `tests/unit/tutor.test.ts` (26 tests).
- Live check (Nuxt dev, port 3900): signed-out `/tutor` and `/tutor/classes/abc` land on
  `/sign-in?redirect=…`; every tutor page/component module compiles in Vite with no console
  errors. Not checked with a signed-in tutor: that needs an invitation from the admin (no
  `ADMIN_EMAIL` in the dev deployment), so the data views are verified by typecheck and unit
  tests only.
