# T-201 · Marking: answer normalisers

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-105](../stage-1-setup/T-105-shared-types.md) |
| Requirements | `PB-1`, `EX-13` |
| Design refs | LLD §8.1 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Pure functions that turn student input into a canonical form before comparison.

## Steps

- Implement `norm.ip`, `text`/`directive`, `path` (accept missing `/etc/`), `integer`, `octal` (`^0?[0-7]{3}$`), `port` (1–65535 or `Any`), `portPair` (order-sensitive), `pick`/`mcq`.
- Implement `norm.equal(kind, got, want)`.

## Files

- `convex/marking/normalise.ts`

## Acceptance criteria

- [x] `0640` = `640`; `permitrootlogin` = `PermitRootLogin`; `shadow` = `/etc/shadow`; `any` = `Any`.

## Tests

- Vitest: table of accepted and rejected inputs per kind.

## Notes

- API: `norm` from `convex/marking/normalise.ts`. `norm.<kind>(value)` returns the canonical string (`portPair`: a `[string, string]`) or `null` when blank or invalid; `norm.equal(kind, got, want)` normalises both sides the same way, and `null` never matches (so a blank answer never matches a blank key). `PartAnswer` is the input type.
- `ip`: four decimal octets 0–255, each 1–3 digits, compared by value (`193.032.162.071` = `193.32.162.71`). A trailing dot, CIDR suffix, `:port` or inner spaces are rejected.
- `text`/`directive`: trim, collapse any run of whitespace to one space, lower-case. No punctuation stripping (`svc-web` ≠ `svc_web`).
- `path`: trim, case-sensitive. The answer gets `/etc/` put in front only when the key starts with `/etc/` (`shadow`, `ssh/sshd_config` ok; `etc/shadow`, `/shadow`, `/etc/shadow/` rejected).
- `integer`: optional `-`, digits or correctly grouped `1,234` (`5,4` rejected), leading zeros allowed; no `+`, decimals or units.
- `port`: 1–5 digits in 1–65535 (leading zeros allowed: `023` = `23`) or `any` in any case → `Any`. `443/tcp`, `*`, `all` rejected.
- `pick`/`mcq`: exact string match, with no trimming or case folding (the values come from UI controls).
- For T-202: in firewall marking use `norm.equal("port", a.port, k.port)` rather than `norm.port(a) === norm.port(k)`, because two `null`s would compare equal.
- Tests: `tests/unit/marking/normalise.test.ts`, accept/reject tables per kind built from the Part 6 and retake keys.
