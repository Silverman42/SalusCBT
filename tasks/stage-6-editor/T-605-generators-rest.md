# T-605 · Generators: hashCheck, permissions and firewall

| | |
| --- | --- |
| Stage | 6 · Question editor |
| Depends on | [T-105](../stage-1-setup/T-105-shared-types.md) |
| Requirements | `ED-6` |
| Design refs | LLD §10.3 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Complete the five template generators.

## Steps

- `hashCheck.ts`: four files, random 64-hex hashes, tampered file keeps first/last 6 chars.
- `permissions.ts`: pick sensitive file (`shadow`/`gshadow`/`sudoers`), compute correct mode; key `600` for private key.
- `firewall.ts`: web or mail scenario; port choices include answers + distractors; last rule `Any / DENY`.

## Files

- `convex/generators/hashCheck.ts`
- `convex/generators/permissions.ts`
- `convex/generators/firewall.ts`

## Acceptance criteria

- [x] Deterministic per seed.

## Tests

- Vitest: 1,000 seeds each.

## Notes

- **API:** `generateHashCheck`, `generatePermissions`, `generateFirewall` with the same `(seed, options?) → Generated<T>` contract as T-604. `convex/generators/index.ts` exports the registry `generators` (one per `PbqTemplate`) and `generate(template, seed, options?)` for `editor.generate` (T-606). `options.set` does not apply to firewall (no part ids).
- **hashCheck:** four installers (sampled from a list of ten, kept in order). Vendor hashes are real SHA-256 values of seeded content, computed by a small synchronous implementation in `convex/generators/sha256.ts` (Web Crypto's `digest` is async and node:crypto would need `"use node"`; tested against node:crypto). The tampered file's computed hash keeps exactly the first and last 6 characters (`KEPT`; the 7th character in from each end is forced to differ) and has a fresh middle. The key's file is read back from the text with the exported `hashCheckTampered(vendorHashes, computed)` (also reproduces the source keys for PBQ 3 and B3; reusable for ED-2). The two MCQ parts use the source option texts in seeded order.
- **permissions:** source listings with seeded host, user, key file (`id_rsa`/`id_ed25519`/`id_ecdsa`), sizes and dates. One of `shadow`/`gshadow`/`sudoers` gets an insecure mode (others can read or write); key mode from `SECURE_MODES` (`shadow`/`gshadow` 640, `sudoers` 440; the 4b prompt's hint describes that mode); the other two keep their secure modes. Private key gets 644/640/664/666; key `600`. The 4d directive is one of `PermitRootLogin`/`PasswordAuthentication`/`X11Forwarding`, always `yes` in the config shown (prompt worded per directive).
- **firewall:** web (HTTPS 443, SSH 22, database 3306/5432/1433 from the web server) or mail (SMTP 25, IMAPS 993 or POP3S 995, SSH 22) with seeded addresses, names and allow-rule order; last rule always `Any → Any`, key `Any / DENY`. Port choices are `Any` + the three answers + three wrong ports (always including the obvious trap: 80 for web, both cleartext retrieval ports for mail), sorted like the source.
- **Tests:** `tests/unit/generators/{hashCheck,permissions,firewall,index}.test.ts`: determinism (same seed identical, 200 seeds distinct), 1,000 seeds pass both validators with full marks for the key's own answer, template invariants (single tampered file with the 6/6 trap; exactly one exposed sensitive file and its keyed mode; asked directive is `yes`; Any/DENY last; choices contain answers + traps), shapes compared with the parsed source PBQs, partial credit sanity check for firewall, and registry dispatch for uint32 edge seeds.
