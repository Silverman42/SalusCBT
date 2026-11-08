# T-003 · Auth spike: Better Auth email OTP on Convex through the Nuxt proxy

| | |
| --- | --- |
| Stage | 0 · Decisions and inputs |
| Depends on | [T-101](../stage-1-setup/T-101-scaffold-project.md) |
| Requirements | `AR-3`, `AU-1`, `AU-4` |
| Design refs | HLD D5, D6, §10; LLD §2, §9.1, §9.4, §18 step 2 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Prove the chosen auth stack works end to end before building on it. The Nuxt integration is early-stage and an email-OTP bundling bug has been reported.

## Steps

- Install the pinned pair (`@convex-dev/better-auth@0.11.3` + `better-auth@1.5.6`, or newer confirmed pair) and the `emailOTP` plugin.
- Deploy to a personal Convex dev deployment.
- Add a throwaway `/api/auth/*` proxy in Nuxt and send an OTP via a console email stub.
- Verify the code through the proxy, receive a session cookie on the app's own origin.
- Call a guarded Convex query and read the user from the session.
- Check whether `style-src 'unsafe-inline'` can be replaced with nonces for Nuxt UI (LLD §15.1).
- Check whether `convex-vue` is stable enough or if a thin `ConvexClient` wrapper is needed (LLD §2).
- Write the outcome into LLD §18 and the tracker decision log: **primary path** or **fallback (§9.4)**.

## Files

- `docs/LLD.md (§18 result)`
- `spike branch (not merged)`

## Acceptance criteria

- [x] Decision recorded: Better Auth primary path, or §9.4 fallback.
- [x] Exact package versions pinned in the decision log.
- [x] CSP nonce and Convex-Vue client findings recorded.

## Notes

- **2026-11-08 result:** Better Auth primary path. `better-auth@1.7.18` + `@convex-dev/better-auth@0.13.0` deploy and pass the full OTP flow through the Nuxt proxy. Thin `ConvexClient` wrapper instead of `convex-vue`. CSP needs nonces. Details and follow-ups in LLD §18.1. Spike code on branch `spike/t-003-auth` (not merged).
- Timebox: 1 day. T-402 and T-403 cannot start until this is decided.
