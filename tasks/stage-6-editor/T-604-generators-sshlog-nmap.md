# T-604 · Generators: sshLog and nmap

| | |
| --- | --- |
| Stage | 6 · Question editor |
| Depends on | [T-105](../stage-1-setup/T-105-shared-types.md) |
| Requirements | `ED-6` |
| Design refs | LLD §10.3 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Deterministic generators that produce new values and compute their own keys.

## Steps

- `generators/sshLog.ts`: attacker from `203.0.113.0/24` / `198.51.100.0/24`, decoys, 40–60 failures, one `Accepted password`; key computed from the text.
- `generators/nmap.ts`: host role, service table, one cleartext service + secure replacement; key from the table.

## Files

- `convex/generators/sshLog.ts`
- `convex/generators/nmap.ts`

## Acceptance criteria

- [x] Only documentation/reserved IP ranges or the default content's ranges are used.

## Tests

- Vitest: 1,000 seeds each pass validation and recomputed keys match.

## Notes

- **API:** `generateSshLog(seed, options?)` and `generateNmap(seed, options?)` → `{ template, payload, key, points, explanation }` (`Generated<T>` in `convex/generators/common.ts`). LLD §10.3 sketches `{ payload, key }`; `points` (= scored parts, ED-10) and `explanation` (for `answerKeys.explanation`, which is required) are added so `editor.generate` (T-606) can write a complete question + key. `options.set: "B"` gives `B1a`-style part ids. Pure and synchronous; all randomness from `rng(seed)` (`convex/lib/rng.ts`) via the `Rand` helper; seeds are treated as uint32.
- **sshLog:** attacker from `203.0.113.0/24` or `198.51.100.0/24`, 40–60 `Failed password` lines (invalid users, the target account, root), then one `Accepted password` + session line. Decoys: a scanner from a different RFC 5737 range (`192.0.2.0/24` included) with 8–14 invalid-user failures, and an internal user (`10.0.3–9.x`) who mistypes 1–3 times then logs in with a password (as in the source, so there are two `Accepted password` lines in total, but only one from the attacker). Benign cron and `Accepted publickey` lines from `10.0.2.x`. The key is computed from the finished text by the exported `sshLogAnswers(log)` (top `Failed password` source, its `Accepted password` account, its count), which T-603's ED-2 recompute check can reuse; the generator throws if that disagrees with what it planted. `sshLogAnswers` also reproduces the source keys for PBQ 1 and B1.
- **nmap:** file server (one cleartext shell — telnet 23 or rlogin 513 — plus SSH 22 and FTP 21; parts like PBQ 2, three `port` parts) or mail/directory server (POP3 and IMAP open, one with its secure port open and one without, LDAP 389 + LDAPS 636; parts like PBQ B2, `portPair`, `portPair`, `port`). Services come from the exported `SERVICES` table; key ports are read from the chosen rows. Target addresses are `10.0.x.y` (private).
- **Tests:** `tests/unit/generators/{sshLog,nmap}.test.ts` (+ shared `helpers.ts`): same seed → identical output, 200 seeds → 200 distinct outputs; 1,000 seeds pass `validatePayload` + `validatePbqKey`, `points` matches, and the key's own answer scores full marks through `scoreQuestion`; recomputed keys match (failure count by line filter, single attacker `Accepted password`, the `grep IP | wc -l` over-count trap holds); IP ranges; log lines in time order; nmap table invariants; part ids/kinds/prompts match the parsed source PBQs.
