# T-307 · Retake mode (PBQ set B)

| | |
| --- | --- |
| Stage | 3 · Interactive PBQs |
| Depends on | [T-204](../stage-2-exam-engine/T-204-attempts-start.md), [T-302](T-302-pbq-sshlog.md), [T-303](T-303-pbq-nmap.md), [T-304](T-304-pbq-hashcheck.md), [T-305](T-305-pbq-permissions.md), [T-306](T-306-pbq-firewall.md) |
| Requirements | `PB-4` |
| Design refs | LLD §7.1 step 5 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Let students retake with set B PBQs and the same MCQs.

## Steps

- Show "Retake PBQs" on the landing page and start screen.
- Pass `mode: retake` through the start route.
- Review and result pages show B-set display numbers (B1–B5).

## Files

- `app/pages/index.vue`
- `app/pages/start.vue`

## Acceptance criteria

- [ ] A retake attempt shows B1–B5 then Q6–Q90.
